import editorWorker from 'monaco-editor/editor/editor.worker?worker';
import jsonWorker from 'monaco-editor/language/json/json.worker?worker';
import cssWorker from 'monaco-editor/language/css/css.worker?worker';
import htmlWorker from 'monaco-editor/language/html/html.worker?worker';
import tsWorker from 'monaco-editor/language/typescript/ts.worker?worker';

declare global {
  interface Window {
    MonacoEnvironment?: {
      getWorker(workerId: string, label: string): Worker;
    };
  }
}

/**
 * Cấu hình Monaco Environment cung cấp Web Workers được đóng gói thông qua cú pháp `?worker` của Vite.
 * Hàm này có tính lũy đẳng (idempotent), an toàn khi gọi nhiều lần hoặc trong môi trường không có DOM (SSR/headless).
 */
export function setupMonacoEnvironment(): void {
  if (typeof window === 'undefined') {
    return;
  }

  // Idempotency: Không ghi đè nếu getWorker đã được đăng ký
  if (window.MonacoEnvironment?.getWorker) {
    return;
  }

  window.MonacoEnvironment = {
    getWorker(_workerId: string, label: string): Worker {
      switch (label) {
        case 'json':
          return new jsonWorker();
        case 'css':
        case 'scss':
        case 'less':
          return new cssWorker();
        case 'html':
        case 'handlebars':
        case 'razor':
          return new htmlWorker();
        case 'typescript':
        case 'javascript':
          return new tsWorker();
        default:
          return new editorWorker();
      }
    },
  };
}
