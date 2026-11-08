import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock Web Worker constructors returned by Vite's native `?worker` query
const { MockEditorWorker, MockJsonWorker, MockCssWorker, MockHtmlWorker, MockTsWorker } =
  vi.hoisted(() => {
    class MockEditorWorker {
      public readonly type = 'editor';
    }

    class MockJsonWorker {
      public readonly type = 'json';
    }

    class MockCssWorker {
      public readonly type = 'css';
    }

    class MockHtmlWorker {
      public readonly type = 'html';
    }

    class MockTsWorker {
      public readonly type = 'typescript';
    }

    return { MockEditorWorker, MockJsonWorker, MockCssWorker, MockHtmlWorker, MockTsWorker };
  });

vi.mock('monaco-editor/editor/editor.worker?worker', () => ({
  default: MockEditorWorker,
}));

vi.mock('monaco-editor/language/json/json.worker?worker', () => ({
  default: MockJsonWorker,
}));

vi.mock('monaco-editor/language/css/css.worker?worker', () => ({
  default: MockCssWorker,
}));

vi.mock('monaco-editor/language/html/html.worker?worker', () => ({
  default: MockHtmlWorker,
}));

vi.mock('monaco-editor/language/typescript/ts.worker?worker', () => ({
  default: MockTsWorker,
}));

import { setupMonacoEnvironment } from '../../src/monacoEnvironment';

describe('setupMonacoEnvironment', () => {
  beforeEach(() => {
    // Ensure window object exists in test execution environment
    if (typeof window === 'undefined') {
      (globalThis as unknown as Record<string, unknown>).window = globalThis;
    }
    delete (window as unknown as Record<string, unknown>).MonacoEnvironment;
  });

  afterEach(() => {
    delete (window as unknown as Record<string, unknown>).MonacoEnvironment;
  });

  // Test 1: Khởi tạo môi trường
  it('initializes window.MonacoEnvironment with a valid getWorker function', () => {
    expect((window as unknown as Record<string, unknown>).MonacoEnvironment).toBeUndefined();

    setupMonacoEnvironment();

    const env = (window as unknown as Record<string, unknown>).MonacoEnvironment as {
      getWorker?: unknown;
    };
    expect(env).toBeDefined();
    expect(typeof env.getWorker).toBe('function');
  });

  // Test 2: Phục vụ nhãn editorWorkerService
  it('resolves editorWorker instance when requested with editorWorkerService', () => {
    setupMonacoEnvironment();

    const env = (window as unknown as Record<string, unknown>).MonacoEnvironment as {
      getWorker: (workerId: string, label: string) => unknown;
    };
    const worker = env.getWorker('worker-editor-1', 'editorWorkerService');

    expect(worker).toBeInstanceOf(MockEditorWorker);
    expect((worker as { type: string }).type).toBe('editor');
  });

  // Test 3: Phục vụ các ngôn ngữ built-in
  it('resolves dedicated worker instances for built-in languages (json, css, html, typescript)', () => {
    setupMonacoEnvironment();

    const env = (window as unknown as Record<string, unknown>).MonacoEnvironment as {
      getWorker: (workerId: string, label: string) => unknown;
    };

    // JSON
    const jsonInstance = env.getWorker('json-id', 'json');
    expect(jsonInstance).toBeInstanceOf(MockJsonWorker);
    expect((jsonInstance as { type: string }).type).toBe('json');

    // CSS family
    const cssInstance = env.getWorker('css-id', 'css');
    expect(cssInstance).toBeInstanceOf(MockCssWorker);
    const scssInstance = env.getWorker('scss-id', 'scss');
    expect(scssInstance).toBeInstanceOf(MockCssWorker);
    const lessInstance = env.getWorker('less-id', 'less');
    expect(lessInstance).toBeInstanceOf(MockCssWorker);

    // HTML family
    const htmlInstance = env.getWorker('html-id', 'html');
    expect(htmlInstance).toBeInstanceOf(MockHtmlWorker);
    const hbsInstance = env.getWorker('hbs-id', 'handlebars');
    expect(hbsInstance).toBeInstanceOf(MockHtmlWorker);
    const razorInstance = env.getWorker('razor-id', 'razor');
    expect(razorInstance).toBeInstanceOf(MockHtmlWorker);

    // TypeScript / JavaScript family
    const tsInstance = env.getWorker('ts-id', 'typescript');
    expect(tsInstance).toBeInstanceOf(MockTsWorker);
    const jsInstance = env.getWorker('js-id', 'javascript');
    expect(jsInstance).toBeInstanceOf(MockTsWorker);
  });

  // Test 4: Fallback cho ngôn ngữ tùy chỉnh 'vns' hoặc nhãn không xác định
  it('falls back to default editorWorker for custom language vns, unknown labels, or empty label', () => {
    setupMonacoEnvironment();

    const env = (window as unknown as Record<string, unknown>).MonacoEnvironment as {
      getWorker: (workerId: string, label: string) => unknown;
    };

    // Custom VN Script language
    const vnsInstance = env.getWorker('vns-id', 'vns');
    expect(vnsInstance).toBeInstanceOf(MockEditorWorker);

    // Unknown label
    const unknownInstance = env.getWorker('unknown-id', 'unrecognized-syntax');
    expect(unknownInstance).toBeInstanceOf(MockEditorWorker);

    // Empty label
    const emptyInstance = env.getWorker('empty-id', '');
    expect(emptyInstance).toBeInstanceOf(MockEditorWorker);
  });

  // Test 5: Tính lũy đẳng (Idempotency)
  it('is idempotent and preserves valid getWorker handler across multiple invocations', () => {
    setupMonacoEnvironment();

    const env = (window as unknown as Record<string, unknown>).MonacoEnvironment as {
      getWorker: (workerId: string, label: string) => unknown;
    };
    const initialGetWorker = env.getWorker;
    expect(typeof initialGetWorker).toBe('function');

    // Call repeatedly
    expect(() => {
      setupMonacoEnvironment();
      setupMonacoEnvironment();
    }).not.toThrow();

    const currentEnv = (window as unknown as Record<string, unknown>).MonacoEnvironment as {
      getWorker: (workerId: string, label: string) => unknown;
    };
    expect(currentEnv.getWorker).toBe(initialGetWorker);

    // Worker resolution remains fully functional
    const worker = currentEnv.getWorker('test-id', 'editorWorkerService');
    expect(worker).toBeInstanceOf(MockEditorWorker);
  });
});
