/// <reference types="vitest" />
import { defineConfig } from 'vite';

export default defineConfig({
  // 相對路徑：不論 GitHub repo 名稱為何，部署到 Pages 都能正確載入資源
  base: './',
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
