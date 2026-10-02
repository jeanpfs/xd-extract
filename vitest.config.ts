import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@xd-extract/core': r('./packages/core/src/index.ts'),
      '@xd-extract/sources': r('./packages/sources/src/index.ts'),
      '@xd-extract/testkit': r('./test-support/index.ts'),
    },
  },
  test: {
    include: ['packages/*/test/**/*.test.ts', 'scripts/**/*.test.ts'],
    testTimeout: 20000,
  },
});
