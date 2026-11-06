// Polyfills for test environment

let storage: Record<string, string> = {};
const mockLocalStorage = {
  getItem: (key: string) => storage[key] ?? null,
  setItem: (key: string, value: string) => {
    storage[key] = String(value);
  },
  removeItem: (key: string) => {
    delete storage[key];
  },
  clear: () => {
    storage = {};
  },
  get length() {
    return Object.keys(storage).length;
  },
  key: (index: number) => Object.keys(storage)[index] ?? null,
};

try {
  delete (globalThis as unknown as Record<string, unknown>).localStorage;
} catch {
  // If property cannot be deleted
}

try {
  Object.defineProperty(globalThis, 'localStorage', {
    value: mockLocalStorage,
    writable: true,
    configurable: true,
  });
} catch {
  // If property cannot be redefined
}

if (typeof window !== 'undefined') {
  try {
    delete (window as unknown as Record<string, unknown>).localStorage;
  } catch {
    // If property cannot be deleted
  }

  try {
    Object.defineProperty(window, 'localStorage', {
      value: mockLocalStorage,
      writable: true,
      configurable: true,
    });
  } catch {
    // If property cannot be redefined
  }
}

if (typeof document !== 'undefined') {
  if (!document.queryCommandSupported) {
    document.queryCommandSupported = () => false;
  }
  if (!window.matchMedia) {
    window.matchMedia = (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    });
  }
}

if (typeof globalThis.ErrorEvent === 'undefined' && typeof Event !== 'undefined') {
  class ErrorEventPolyfill extends Event {
    public message: string;
    constructor(type: string, init?: { message?: string }) {
      super(type);
      this.message = init?.message || '';
    }
  }
  // @ts-expect-error Polyfill ErrorEvent for Node environments like Node 22
  globalThis.ErrorEvent = ErrorEventPolyfill;
}
