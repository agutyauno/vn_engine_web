import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DiagnosticBus } from '../src/services/diagnosticBus';
import type { EngineDiagnostic } from '@vn-engine/shared-types';

describe('DiagnosticBus Service Tests', () => {
  let mockTargetWindow: { postMessage: ReturnType<typeof vi.fn> };
  let bus: DiagnosticBus;

  beforeEach(() => {
    mockTargetWindow = {
      postMessage: vi.fn(),
    };
    bus = new DiagnosticBus({
      targetWindow: mockTargetWindow as unknown as Window,
      editorOrigin: 'http://localhost:3001',
      enableConsoleOutput: true,
    });
  });

  it('báo cáo chẩn đoán, tự động sinh ID và timestamp, đồng thời thông báo tới subscriber', () => {
    const subscriber = vi.fn();
    bus.subscribe(subscriber);

    bus.report({
      category: 'asset',
      severity: 'warning',
      message: 'Missing background asset "bg_forest"',
      assetKey: 'bg_forest',
      code: 'ERR_MISSING_GRAPHIC',
    });

    expect(subscriber).toHaveBeenCalledTimes(1);
    const diag: EngineDiagnostic = subscriber.mock.calls[0][0];
    expect(diag.id).toMatch(/^diag_\d+_/);
    expect(diag.timestamp).toBeGreaterThan(0);
    expect(diag.category).toBe('asset');
    expect(diag.severity).toBe('warning');
    expect(diag.assetKey).toBe('bg_forest');
    expect(diag.code).toBe('ERR_MISSING_GRAPHIC');
  });

  it('khử trùng lặp (deduplication) cho các chẩn đoán giống hệt nhau trong cùng phiên', () => {
    const subscriber = vi.fn();
    bus.subscribe(subscriber);

    // Gửi lần 1
    bus.report({
      category: 'asset',
      severity: 'warning',
      message: 'Missing graphic asset: "alice.happy"',
      assetKey: 'alice.happy',
      code: 'ERR_MISSING_GRAPHIC',
    });

    // Gửi lần 2 giống hệt
    bus.report({
      category: 'asset',
      severity: 'warning',
      message: 'Missing graphic asset: "alice.happy"',
      assetKey: 'alice.happy',
      code: 'ERR_MISSING_GRAPHIC',
    });

    expect(subscriber).toHaveBeenCalledTimes(1);
  });

  it('cho phép gửi các chẩn đoán khác nhau hoặc assetKey khác nhau', () => {
    const subscriber = vi.fn();
    bus.subscribe(subscriber);

    bus.report({
      category: 'asset',
      severity: 'warning',
      message: 'Missing graphic: "alice.happy"',
      assetKey: 'alice.happy',
    });

    bus.report({
      category: 'asset',
      severity: 'warning',
      message: 'Missing audio: "theme_peaceful"',
      assetKey: 'theme_peaceful',
    });

    expect(subscriber).toHaveBeenCalledTimes(2);
  });

  it('in log ra native console với tiền tố [VN Engine]', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    bus.report({
      category: 'asset',
      severity: 'warning',
      message: 'Asset warning test',
    });

    expect(warnSpy).toHaveBeenCalledWith('[VN Engine]', 'Asset warning test', expect.anything());

    bus.report({
      category: 'runtime',
      severity: 'error',
      message: 'Runtime error test',
    });

    expect(errorSpy).toHaveBeenCalledWith('[VN Engine]', 'Runtime error test', expect.anything());

    warnSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it('gửi postMessage ENGINE_DIAGNOSTIC chuẩn sang targetWindow', () => {
    bus.report({
      category: 'runtime',
      severity: 'error',
      message: 'Division by zero',
      code: 'ERR_VM_RUNTIME',
    });

    expect(mockTargetWindow.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'ENGINE_DIAGNOSTIC',
        diagnostic: expect.objectContaining({
          category: 'runtime',
          severity: 'error',
          message: 'Division by zero',
          code: 'ERR_VM_RUNTIME',
        }),
      }),
      'http://localhost:3001',
    );
  });

  it('khi clear(), gửi sự kiện DIAGNOSTICS_CLEAR và reset bộ đệm deduplication', () => {
    const clearSubscriber = vi.fn();
    bus.onClear(clearSubscriber);

    // Báo cáo 1 lỗi
    bus.report({
      category: 'asset',
      severity: 'warning',
      message: 'Missing sound',
      assetKey: 'sfx_click',
    });

    expect(mockTargetWindow.postMessage).toHaveBeenCalledTimes(1);

    // Clear
    bus.clear();
    expect(clearSubscriber).toHaveBeenCalledTimes(1);
    expect(mockTargetWindow.postMessage).toHaveBeenLastCalledWith(
      { type: 'DIAGNOSTICS_CLEAR' },
      'http://localhost:3001',
    );

    // Sau khi clear, report lại lỗi cũ thì vẫn được chấp nhận (phiên mới)
    const subscriber = vi.fn();
    bus.subscribe(subscriber);

    bus.report({
      category: 'asset',
      severity: 'warning',
      message: 'Missing sound',
      assetKey: 'sfx_click',
    });

    expect(subscriber).toHaveBeenCalledTimes(1);
  });
});
