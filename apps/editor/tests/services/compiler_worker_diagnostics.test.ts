// apps/editor/tests/services/compiler_worker_diagnostics.test.ts
import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest';
import type { ScriptFile, Instruction } from '@vn-engine/shared-types';
import { Compiler } from '@vn-engine/dsl-compiler';
import { CompilerService } from '../../src/core/services/compilerService';
import type {
  CompilerWorkerRequest,
  CompilerWorkerResponse,
} from '../../src/core/services/compiler.worker';

// Biến lưu trữ handler và danh sách phản hồi từ worker
let workerMessageHandler: ((event: MessageEvent<CompilerWorkerRequest>) => void) | null = null;
let postedResponses: CompilerWorkerResponse[] = [];

beforeAll(async () => {
  // Polyfill self và postMessage cho môi trường Node/JSDOM trước khi nạp worker
  if (typeof (globalThis as unknown as { self?: unknown }).self === 'undefined') {
    (globalThis as unknown as { self: unknown }).self = globalThis;
  }

  // Intercept self.postMessage
  (globalThis as unknown as { self: { postMessage: (data: CompilerWorkerResponse) => void } }).self.postMessage = (
    response: CompilerWorkerResponse,
  ) => {
    postedResponses.push(response);
  };

  // Intercept setter của self.onmessage
  Object.defineProperty(
    (globalThis as unknown as { self: Record<string, unknown> }).self,
    'onmessage',
    {
      configurable: true,
      enumerable: true,
      set(handler: (event: MessageEvent<CompilerWorkerRequest>) => void) {
        workerMessageHandler = handler;
      },
      get() {
        return workerMessageHandler;
      },
    },
  );

  // Nạp module worker (sẽ thực thi câu lệnh gán self.onmessage = ...)
  await import('../../src/core/services/compiler.worker');
});

afterEach(() => {
  vi.restoreAllMocks();
  postedResponses = [];
});

/**
 * Tiện ích gửi request trực tiếp tới self.onmessage của compiler.worker
 */
function sendWorkerRequest(request: CompilerWorkerRequest): CompilerWorkerResponse {
  if (!workerMessageHandler) {
    throw new Error('Worker onmessage handler is not registered');
  }
  postedResponses = [];
  workerMessageHandler({ data: request } as MessageEvent<CompilerWorkerRequest>);
  if (postedResponses.length === 0) {
    throw new Error('Worker did not call self.postMessage with any response');
  }
  return postedResponses[postedResponses.length - 1]!;
}

describe('Compiler Worker Diagnostics & Audio Decoupling (TDD Phase 2)', () => {
  // =========================================================================
  // TC-WRK-SUCCESS-01: Missing Audio Emits Bytecode (Live Preview Available)
  // =========================================================================
  it('TC-WRK-SUCCESS-01: should return success: true and emit bytecode when script references missing audio', async () => {
    const files: ScriptFile[] = [
      {
        id: 'main.vns',
        name: 'main.vns',
        content: [
          'scene intro {',
          '  play music "bgm_missing"',
          '  "Xin chào thế giới visual novel!"',
          '}',
        ].join('\n'),
        order: 0,
        version: 1,
      },
    ];

    // 1. Kiểm tra qua luồng Compiler Worker
    const response = sendWorkerRequest({
      requestId: 101,
      files,
      options: {
        assets: [], // Dự án không có asset nào
      },
    });

    expect(response.requestId).toBe(101);
    expect(response.success).toBe(true);
    expect(response.bytecode).toBeDefined();
    expect(Array.isArray(response.bytecode)).toBe(true);
    expect(response.bytecode!.length).toBeGreaterThan(0);

    const playInstruction = response.bytecode!.find(
      inst => inst.type === 'PLAY' && (inst as unknown as { assetId: string }).assetId === 'bgm_missing',
    );
    expect(playInstruction).toBeDefined();

    // Không có lỗi blocker nào khiến bytecode bị undefined
    const blockingErrors = response.diagnostics.filter(d => d.severity === 'error');
    expect(blockingErrors).toHaveLength(0);

    // 2. Kiểm tra qua CompilerService (đồng bộ kiến trúc)
    const compilerService = new CompilerService();
    const serviceOutput = await compilerService.compile(files, {
      assets: [],
      forceSync: true,
    });
    expect(serviceOutput.success).toBe(true);
    expect(serviceOutput.bytecode).toBeDefined();
    expect(serviceOutput.bytecode!.length).toBeGreaterThan(0);
    expect(serviceOutput.diagnostics.filter(d => d.severity === 'error')).toHaveLength(0);
  });

  // =========================================================================
  // TC-WRK-WARN-01: Worker Maps Compiler Warnings with severity: 'warning'
  // =========================================================================
  it('TC-WRK-WARN-01: should map compiler warnings to EngineDiagnostic with category compiler and severity warning on success', () => {
    const files: ScriptFile[] = [
      {
        id: 'main.vns',
        name: 'main.vns',
        content: 'scene intro {\n  "test"\n}',
        order: 0,
        version: 1,
      },
    ];

    // Giả lập Compiler trả về warnings cùng bytecode hợp lệ
    vi.spyOn(Compiler.prototype, 'compile').mockReturnValueOnce({
      success: true,
      program: [
        {
          type: 'DIALOGUE',
          character: 'narrator',
          text: 'test',
        } as Instruction,
      ],
      warnings: [
        {
          code: 'WARN_SYNTAX_DEPRECATED',
          message: 'Syntax feature is deprecated and may be removed in future versions',
          loc: { fileId: 'main.vns', line: 1, col: 7, endLine: 1, endCol: 12 },
          severity: 'warning',
        },
      ],
    });

    const response = sendWorkerRequest({
      requestId: 102,
      files,
    });

    expect(response.requestId).toBe(102);
    expect(response.success).toBe(true);
    expect(response.bytecode).toBeDefined();

    // [RED GATE ASSERTION]: Hiện tại compiler.worker.ts trả về cứng diagnostics: [] khi success: true!
    expect(response.diagnostics).not.toEqual([]);
    expect(response.diagnostics.length).toBeGreaterThan(0);

    const warningDiag = response.diagnostics.find(
      d => d.category === 'compiler' && d.severity === 'warning',
    );
    expect(warningDiag).toBeDefined();
    expect(warningDiag).toMatchObject({
      category: 'compiler',
      severity: 'warning',
      code: 'WARN_SYNTAX_DEPRECATED',
      message: 'Syntax feature is deprecated and may be removed in future versions',
      fileId: 'main.vns',
      line: 1,
      col: 7,
    });
  });

  // =========================================================================
  // TC-WRK-WARN-02: Worker Preserves Warnings on Failure (Edge Case)
  // =========================================================================
  it('TC-WRK-WARN-02: should preserve both errors and warnings in diagnostics when compilation fails', () => {
    const files: ScriptFile[] = [
      {
        id: 'main.vns',
        name: 'main.vns',
        content: 'broken script',
        order: 0,
        version: 1,
      },
    ];

    // Giả lập Compiler trả về cả errors và warnings khi thất bại
    vi.spyOn(Compiler.prototype, 'compile').mockReturnValueOnce({
      success: false,
      errors: [
        {
          code: 'ERR_SYNTAX_GENERIC',
          message: 'Syntax error encountered',
          loc: { fileId: 'main.vns', line: 1, col: 1, endLine: 1, endCol: 7 },
          severity: 'error',
        },
      ],
      warnings: [
        {
          code: 'WARN_UNUSED_VARIABLE',
          message: 'Variable declared but never referenced',
          loc: { fileId: 'main.vns', line: 1, col: 8, endLine: 1, endCol: 14 },
          severity: 'warning',
        },
      ],
    });

    const response = sendWorkerRequest({
      requestId: 103,
      files,
    });

    expect(response.requestId).toBe(103);
    expect(response.success).toBe(false);
    expect(response.bytecode).toBeUndefined();

    // [RED GATE ASSERTION]: Hiện tại compiler.worker.ts chỉ map result.errors, warnings bị nuốt mất!
    const errorDiag = response.diagnostics.find(d => d.severity === 'error');
    const warningDiag = response.diagnostics.find(d => d.severity === 'warning');

    expect(errorDiag).toBeDefined();
    expect(errorDiag).toMatchObject({
      category: 'compiler',
      severity: 'error',
      code: 'ERR_SYNTAX_GENERIC',
    });

    expect(warningDiag).toBeDefined();
    expect(warningDiag).toMatchObject({
      category: 'compiler',
      severity: 'warning',
      code: 'WARN_UNUSED_VARIABLE',
      message: 'Variable declared but never referenced',
    });
  });

  // =========================================================================
  // TC-WRK-SERVICE-WARN-01: CompilerService Sync Mode Warning Mapping
  // =========================================================================
  it('TC-WRK-SERVICE-WARN-01: CompilerService should map compiler warnings in CompileOutput when forceSync is true', async () => {
    const files: ScriptFile[] = [
      {
        id: 'main.vns',
        name: 'main.vns',
        content: 'scene intro {\n  "test"\n}',
        order: 0,
        version: 1,
      },
    ];

    vi.spyOn(Compiler.prototype, 'compile').mockReturnValueOnce({
      success: true,
      program: [
        {
          type: 'DIALOGUE',
          character: 'narrator',
          text: 'test',
        } as Instruction,
      ],
      warnings: [
        {
          code: 'WARN_SEMANTIC_STYLE',
          message: 'Code style recommendation',
          loc: { fileId: 'main.vns', line: 1, col: 1 },
          severity: 'warning',
        },
      ],
    });

    const compilerService = new CompilerService();
    const output = await compilerService.compile(files, { forceSync: true });

    expect(output.success).toBe(true);
    expect(output.bytecode).toBeDefined();

    // [RED GATE ASSERTION]: Hiện tại CompilerService.ts line 86 trả về diagnostics: []
    expect(output.diagnostics).not.toEqual([]);
    const warningDiag = output.diagnostics.find(
      d => d.category === 'compiler' && d.severity === 'warning',
    );
    expect(warningDiag).toBeDefined();
    expect(warningDiag).toMatchObject({
      category: 'compiler',
      severity: 'warning',
      code: 'WARN_SEMANTIC_STYLE',
      message: 'Code style recommendation',
    });
  });
});
