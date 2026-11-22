// ============================================================================
// Vitest setup: dùng Web Storage THẬT của jsdom cho mọi test.
//
// Từ Node 25, Node tự cài `localStorage`/`sessionStorage` toàn cục (Web Storage
// bật mặc định). Môi trường jsdom của Vitest không ghi đè các global đã có sẵn,
// nên test sẽ âm thầm ghi vào storage của Node thay vì của jsdom. Không dùng cờ
// Node để tắt, vì tên cờ khác nhau giữa Node 20/22/25 và cờ sai làm process lỗi.
// ============================================================================

declare global {
  // Vitest gắn instance JSDOM vào biến toàn cục `jsdom` khi environment là jsdom.
  var jsdom: { window: Window } | undefined;
}

const jsdomWindow = globalThis.jsdom?.window;

if (jsdomWindow) {
  for (const name of ['localStorage', 'sessionStorage'] as const) {
    const storage = jsdomWindow[name];
    if (globalThis[name] !== storage) {
      Object.defineProperty(globalThis, name, {
        value: storage,
        configurable: true,
        writable: true,
      });
    }
  }
}

export {};
