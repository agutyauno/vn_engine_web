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
