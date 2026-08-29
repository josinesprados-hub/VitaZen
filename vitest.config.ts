import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  test: {
    setupFiles: [],
    transform: {
      // Use esbuild instead of oxc to avoid parse issues with vi.hoisted
      '**': 'esbuild',
    },
  },
});
