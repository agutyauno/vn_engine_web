/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 3001,
    open: false,
  },
  build: {
    target: 'esnext',
  },
  test: {
    globals: true,
    setupFiles: ['./tests/setup.ts'],
    execArgv: ['--no-webstorage'],
  },
});
