import { Compiler, type ScriptReferences } from '@vn-engine/dsl-compiler';
import type { ScriptFile, Character, Instruction, EngineDiagnostic } from '@vn-engine/shared-types';
import { computeReconciliationDiagnostics } from './reconciliation';

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
  reconciliationDiagnostics?: EngineDiagnostic[];
}

const compiler = new Compiler();
const fileReferencesCache = new Map<string, ScriptReferences>();

self.onmessage = (event: MessageEvent<CompilerWorkerRequest>) => {
  const { requestId, files, options } = event.data;

  try {
    const reconciliationDiagnostics = computeReconciliationDiagnostics(
      files,
      options,
      fileReferencesCache,
    );

    const result = compiler.compile(files, {
      characters: options?.characters,
      assets: options?.assets,
    });

    const compilerDiagnostics: EngineDiagnostic[] = [
      ...(result.errors || []).map((err, idx) => ({
        id: `diag-compile-${requestId}-${idx}`,
        timestamp: Date.now(),
        category: 'compiler' as const,
        severity: 'error' as const,
        code: err.code,
        message: err.message,
        fileId: err.loc?.fileId,
        line: err.loc?.line,
        col: err.loc?.col,
        endLine: err.loc?.endLine,
        endCol: err.loc?.endCol,
        ...(err.targetId
          ? {
              quickFix: {
                type: 'define_variable' as const,
                targetId: err.targetId,
              },
            }
          : {}),
      })),
      ...(result.warnings || []).map((warn, idx) => ({
        id: `diag-compile-warn-${requestId}-${idx}`,
        timestamp: Date.now(),
        category: 'compiler' as const,
        severity: 'warning' as const,
        code: warn.code,
        message: warn.message,
        fileId: warn.loc?.fileId,
        line: warn.loc?.line,
        col: warn.loc?.col,
        endLine: warn.loc?.endLine,
        endCol: warn.loc?.endCol,
        ...(warn.targetId
          ? {
              quickFix: {
                type: 'define_variable' as const,
                targetId: warn.targetId,
              },
            }
          : {}),
      })),
    ];

    if (result.success && result.program) {
      const response: CompilerWorkerResponse = {
        requestId,
        success: true,
        bytecode: result.program,
        diagnostics: compilerDiagnostics,
        reconciliationDiagnostics,
      };
      self.postMessage(response);
    } else {
      const response: CompilerWorkerResponse = {
        requestId,
        success: false,
        bytecode: undefined,
        diagnostics: compilerDiagnostics,
        reconciliationDiagnostics,
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
      reconciliationDiagnostics: [],
    };
    self.postMessage(response);
  }
};
