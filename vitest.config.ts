import { defineConfig } from 'vitest/config';
import type { InlineConfig } from 'vitest/node';
import path from 'path';

interface InlineConfigWithLegacyTransform extends InlineConfig {
  transform?: Record<string, string>;
}

const test: InlineConfigWithLegacyTransform = {
  setupFiles: [],
  transform: {
    // Use esbuild instead of oxc to avoid parse issues with vi.hoisted
    '**': 'esbuild',
  },
};

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  test,
});
