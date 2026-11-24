import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';

export default defineConfig({
  plugins: [preact()],
  // Đường dẫn JS/CSS tương đối để bản build chạy được trong thư mục con (itch.io, gói Export → Web)
  base: './',
  server: {
    port: 3000,
    open: false,
  },
  build: {
    target: 'esnext',
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
  },
});
