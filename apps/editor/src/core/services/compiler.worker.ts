import { Compiler } from '@vn-engine/dsl-compiler';
import type { ScriptFile, Character, Instruction, EngineDiagnostic } from '@vn-engine/shared-types';

export interface CompilerWorkerRequest {
  requestId: number;
  files: ScriptFile[];
  options?: {
    characters?: Character[];
    assets?: Array<{ id: string; name?: string; type?: string; category?: string }>;
  };
}

export interface CompilerWorkerResponse {
  requestId: number;
  success: boolean;
  bytecode?: Instruction[];
  diagnostics: EngineDiagnostic[];
}

const compiler = new Compiler();

self.onmessage = (event: MessageEvent<CompilerWorkerRequest>) => {
  const { requestId, files, options } = event.data;

  try {
    const result = compiler.compile(files, {
      characters: options?.characters,
      assets: options?.assets,
    });

    if (result.success && result.program) {
      const response: CompilerWorkerResponse = {
        requestId,
        success: true,
        bytecode: result.program,
        diagnostics: [],
      };
      self.postMessage(response);
    } else {
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

      const response: CompilerWorkerResponse = {
        requestId,
        success: false,
        bytecode: undefined,
        diagnostics,
      };
      self.postMessage(response);
    }
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    const response: CompilerWorkerResponse = {
      requestId,
      success: false,
      bytecode: undefined,
      diagnostics: [
        {
          id: `diag-worker-err-${requestId}`,
          timestamp: Date.now(),
          category: 'compiler',
          severity: 'error',
          message: errorMessage,
        },
      ],
    };
    self.postMessage(response);
  }
};
