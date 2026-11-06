import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { ScriptFile, Instruction } from '@vn-engine/shared-types';
import { CompilerService } from '../../src/core/services/compilerService';

class MockWorker {
  public onmessage: ((e: MessageEvent) => void) | null = null;
  public onerror: ((e: ErrorEvent | unknown) => void) | null = null;
  public postMessage = vi.fn();
  public terminate = vi.fn();
}

describe('CompilerService (Phase 2)', () => {
  let mockWorker: MockWorker;
  let workerFactory: () => Worker;

  beforeEach(() => {
    vi.useRealTimers();
    mockWorker = new MockWorker();
    workerFactory = () => mockWorker as unknown as Worker;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const validFiles: ScriptFile[] = [
    {
      id: 'file-1',
      name: 'main.vns',
      content: 'scene start {\n  "Hello world!"\n}\n',
      order: 1,
      version: 1,
    },
  ];

  const syntaxErrorFiles: ScriptFile[] = [
    {
      id: 'file-err',
      name: 'broken.vns',
      content: 'scene start\n  say unclosed string without quote\n',
      order: 1,
      version: 1,
    },
  ];

  describe('Happy Path: Synchronous Fallback & Sequential Requests', () => {
    it('compiles valid script synchronously when forceSync is true', async () => {
      const service = new CompilerService();
      const output = await service.compile(validFiles, { forceSync: true });

      expect(output.success).toBe(true);
      expect(output.requestId).toBeGreaterThan(0);
      expect(Array.isArray(output.bytecode)).toBe(true);
      expect(output.bytecode!.length).toBeGreaterThan(0);
      expect(output.diagnostics).toEqual([]);
    });

    it('increments requestId monotonically across multiple compile calls', async () => {
      const service = new CompilerService();

      const out1 = await service.compile(validFiles, { forceSync: true });
      expect(out1.requestId).toBe(1);
      expect(service.getLatestRequestId()).toBe(1);

      const out2 = await service.compile(validFiles, { forceSync: true });
      expect(out2.requestId).toBe(2);
      expect(service.getLatestRequestId()).toBe(2);

      const out3 = await service.compile(validFiles, { forceSync: true });
      expect(out3.requestId).toBe(3);
      expect(service.getLatestRequestId()).toBe(3);
    });
  });

  describe('Stale Job Dropping & Sequence Tracking', () => {
    it('drops/discards stale worker responses when requestId is older than latestRequestId', async () => {
      const service = new CompilerService(workerFactory);

      // Trigger compile #1
      void service.compile(validFiles);
      expect(service.getLatestRequestId()).toBe(1);

      // Trigger compile #2 before worker responds to #1
      const promise2 = service.compile(validFiles);
      expect(service.getLatestRequestId()).toBe(2);

      // Worker responds to request #1 (stale)
      mockWorker.onmessage?.({
        data: {
          requestId: 1,
          success: true,
          bytecode: [{ opcode: 'PUSH', args: [1] } as unknown as Instruction],
          diagnostics: [],
        },
      } as MessageEvent);

      // Worker responds to request #2 (latest)
      mockWorker.onmessage?.({
        data: {
          requestId: 2,
          success: true,
          bytecode: [{ opcode: 'PUSH', args: [2] } as unknown as Instruction],
          diagnostics: [],
        },
      } as MessageEvent);

      const res2 = await promise2;
      expect(res2.requestId).toBe(2);
      expect(res2.bytecode).toEqual([{ opcode: 'PUSH', args: [2] }]);
    });
  });

  describe('Syntax Error Diagnostics', () => {
    it('returns success: false with compiler diagnostics when script has syntax errors', async () => {
      const service = new CompilerService();
      const output = await service.compile(syntaxErrorFiles, { forceSync: true });

      expect(output.success).toBe(false);
      expect(output.diagnostics.length).toBeGreaterThan(0);

      const errorDiag = output.diagnostics[0]!;
      expect(errorDiag).toBeDefined();
      expect(errorDiag.category).toBe('compiler');
      expect(errorDiag.severity).toBe('error');
      expect(errorDiag.fileId).toBe('file-err');
      expect(typeof errorDiag.line).toBe('number');
      expect(typeof errorDiag.col).toBe('number');
      expect(typeof errorDiag.message).toBe('string');
    });
  });

  describe('Watchdog & Error Recovery', () => {
    it('terminates hanging worker and generates diagnostic after 2000ms watchdog timeout', async () => {
      vi.useFakeTimers();

      const workers: MockWorker[] = [];
      const testWorkerFactory = () => {
        const w = new MockWorker();
        workers.push(w);
        return w as unknown as Worker;
      };

      const service = new CompilerService(testWorkerFactory);
      const compilePromise = service.compile(validFiles);

      expect(workers.length).toBe(1);
      const firstWorker = workers[0]!;

      // Fast forward past 2000ms timeout
      vi.advanceTimersByTime(2100);

      const output = await compilePromise;

      expect(firstWorker.terminate).toHaveBeenCalled();
      expect(output.success).toBe(false);
      expect(output.diagnostics.length).toBeGreaterThan(0);
      expect(output.diagnostics[0]!.severity).toBe('error');
      expect(output.diagnostics[0]!.message.toLowerCase()).toContain('timeout');
    });

    it('recovers when worker triggers onerror event', async () => {
      const service = new CompilerService(workerFactory);
      const compilePromise = service.compile(validFiles);

      // Simulate worker crash / error
      mockWorker.onerror?.(new ErrorEvent('error', { message: 'Worker script crash' }));

      const output = await compilePromise;
      expect(mockWorker.terminate).toHaveBeenCalled();
      expect(output.success).toBe(false);
      expect(output.diagnostics.some((d) => d.severity === 'error')).toBe(true);
    });

    it('cleans up worker when terminate() is invoked', () => {
      const service = new CompilerService(workerFactory);
      service.compile(validFiles);
      service.terminate();

      expect(mockWorker.terminate).toHaveBeenCalled();
    });
  });
});

