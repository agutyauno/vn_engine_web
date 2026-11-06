import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';

export default defineConfig({
  plugins: [preact()],
  server: {
    port: 3000,
    open: false,
  },
  build: {
    target: 'esnext',
  },
  test: {
    environment: 'jsdom',
    execArgv: ['--no-webstorage'],
  },
});
