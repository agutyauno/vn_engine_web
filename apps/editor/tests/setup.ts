// Polyfills for JSDOM test environment
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
