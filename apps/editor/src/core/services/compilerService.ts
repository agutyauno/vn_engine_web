import { Compiler, type ScriptReferences } from '@vn-engine/dsl-compiler';
import type { ScriptFile, Character, Instruction, EngineDiagnostic } from '@vn-engine/shared-types';
import type { CompilerWorkerRequest, CompilerWorkerResponse } from './compiler.worker';
import { computeReconciliationDiagnostics } from './reconciliation';

export interface CompileExecutionOptions {
  characters?: Character[];
  assets?: Array<{ id: string; name?: string; type?: string; category?: string }>;
  forceSync?: boolean;
}

export interface CompileOutput {
  requestId: number;
  success: boolean;
  bytecode?: Instruction[];
  diagnostics: EngineDiagnostic[];
  reconciliationDiagnostics?: EngineDiagnostic[];
}

interface PendingCompileRequest {
  resolve: (output: CompileOutput) => void;
  timeoutId: ReturnType<typeof setTimeout>;
}

export class CompilerService {
  private latestRequestId = 0;
  private worker: Worker | null = null;
  private workerFactory?: () => Worker;
  private pendingRequests = new Map<number, PendingCompileRequest>();
  private latestProgram: Instruction[] | null = null;
  private syncFileReferencesCache = new Map<string, ScriptReferences>();

  constructor(workerFactory?: () => Worker) {
    this.workerFactory = workerFactory;
  }

  public getLatestRequestId(): number {
    return this.latestRequestId;
  }

  public getLatestProgram(): Instruction[] | null {
    return this.latestProgram;
  }

  public async compile(
    files: ScriptFile[],
    options?: CompileExecutionOptions,
  ): Promise<CompileOutput> {
    const currentRequestId = ++this.latestRequestId;

    const shouldRunSync =
      options?.forceSync === true ||
      (!this.workerFactory && typeof window === 'undefined') ||
      (!this.workerFactory && typeof Worker === 'undefined');

    if (shouldRunSync) {
      return this.compileSync(currentRequestId, files, options);
    }

    return this.compileWithWorker(currentRequestId, files, options);
  }

  private compileSync(
    requestId: number,
    files: ScriptFile[],
    options?: CompileExecutionOptions,
  ): CompileOutput {
    const reconciliationDiagnostics = computeReconciliationDiagnostics(
      files,
      options,
      this.syncFileReferencesCache,
    );

    const compiler = new Compiler();
    const result = compiler.compile(files, {
      characters: options?.characters,
      assets: options?.assets,
    });

    if (result.success && result.program) {
      this.latestProgram = result.program;
      return {
        requestId,
        success: true,
        bytecode: result.program,
        diagnostics: [],
        reconciliationDiagnostics,
      };
    }

    const diagnostics: EngineDiagnostic[] = (result.errors || []).map((err, idx) => ({
      id: `diag-compile-${requestId}-${idx}`,
      timestamp: Date.now(),
      category: 'compiler',
      severity: 'error',
      code: err.code,
      message: err.message,
      fileId: err.loc?.fileId,
      line: err.loc?.line,
      col: err.loc?.col,
      endLine: err.loc?.endLine,
      endCol: err.loc?.endCol,
    }));

    return {
      requestId,
      success: false,
      bytecode: undefined,
      diagnostics,
      reconciliationDiagnostics,
    };
  }

  private ensureWorker(): Worker | null {
    if (!this.worker) {
      try {
        if (this.workerFactory) {
          this.worker = this.workerFactory();
        } else if (typeof Worker !== 'undefined') {
          this.worker = new Worker(new URL('./compiler.worker.ts', import.meta.url), {
            type: 'module',
          });
        }
      } catch {
        this.worker = null;
        return null;
      }

      if (this.worker) {
        this.worker.onmessage = (event: MessageEvent<CompilerWorkerResponse>) => {
          this.handleWorkerMessage(event);
        };

        this.worker.onerror = (errorEvent: ErrorEvent | unknown) => {
          this.handleWorkerError(errorEvent);
        };
      }
    }
    return this.worker;
  }

  private handleWorkerMessage(event: MessageEvent<CompilerWorkerResponse>): void {
    const data = event.data;
    if (!data || typeof data.requestId !== 'number') return;

    // Sequence guard: discard stale responses if older than latestRequestId
    if (data.requestId < this.latestRequestId) {
      const pending = this.pendingRequests.get(data.requestId);
      if (pending) {
        clearTimeout(pending.timeoutId);
        this.pendingRequests.delete(data.requestId);
      }
      return;
    }

    const pending = this.pendingRequests.get(data.requestId);
    if (pending) {
      clearTimeout(pending.timeoutId);
      this.pendingRequests.delete(data.requestId);
      if (data.success && data.bytecode) {
        this.latestProgram = data.bytecode;
      }
      pending.resolve({
        requestId: data.requestId,
        success: data.success,
        bytecode: data.bytecode,
        diagnostics: data.diagnostics || [],
        reconciliationDiagnostics: data.reconciliationDiagnostics || [],
      });
    }
  }

  private handleWorkerError(errorEvent: ErrorEvent | unknown): void {
    const errorMsg =
      (errorEvent instanceof Error ? errorEvent.message : null) ||
      (typeof errorEvent === 'object' && errorEvent !== null && 'message' in errorEvent
        ? String((errorEvent as { message: unknown }).message)
        : null) ||
      'Compiler worker crashed or encountered an unhandled error';

    // Terminate crashed worker
    if (this.worker) {
      try {
        this.worker.terminate();
      } catch {
        // ignore
      }
      this.worker = null;
    }

    // Fail all pending requests with error diagnostic
    for (const [reqId, pending] of this.pendingRequests.entries()) {
      clearTimeout(pending.timeoutId);
      pending.resolve({
        requestId: reqId,
        success: false,
        bytecode: undefined,
        diagnostics: [
          {
            id: `diag-worker-crash-${reqId}`,
            timestamp: Date.now(),
            category: 'compiler',
            severity: 'error',
            message: errorMsg,
          },
        ],
        reconciliationDiagnostics: [],
      });
    }
    this.pendingRequests.clear();
  }

  private compileWithWorker(
    requestId: number,
    files: ScriptFile[],
    options?: CompileExecutionOptions,
  ): Promise<CompileOutput> {
    const worker = this.ensureWorker();
    if (!worker) {
      return Promise.resolve(this.compileSync(requestId, files, options));
    }

    return new Promise<CompileOutput>(resolve => {
      // 2000ms Watchdog Timer
      const timeoutId = setTimeout(() => {
        if (this.pendingRequests.has(requestId)) {
          if (this.worker) {
            try {
              this.worker.terminate();
            } catch {
              // ignore
            }
            this.worker = null;
          }

          const pending = this.pendingRequests.get(requestId);
          this.pendingRequests.delete(requestId);

          if (pending) {
            pending.resolve({
              requestId,
              success: false,
              bytecode: undefined,
              diagnostics: [
                {
                  id: `diag-timeout-${requestId}`,
                  timestamp: Date.now(),
                  category: 'compiler',
                  severity: 'error',
                  message:
                    'Compilation timeout: execution exceeded 2000ms limit (Watchdog terminated worker)',
                },
              ],
              reconciliationDiagnostics: [],
            });
          }
        }
      }, 2000);

      this.pendingRequests.set(requestId, { resolve, timeoutId });

      const requestPayload: CompilerWorkerRequest = {
        requestId,
        files,
        options: {
          characters: options?.characters,
          assets: options?.assets,
        },
      };

      worker.postMessage(requestPayload);
    });
  }

  public terminate(): void {
    if (this.worker) {
      try {
        this.worker.terminate();
      } catch {
        // ignore
      }
      this.worker = null;
    }
    for (const pending of this.pendingRequests.values()) {
      clearTimeout(pending.timeoutId);
    }
    this.pendingRequests.clear();
  }
}
