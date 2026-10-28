/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
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
  },
});
