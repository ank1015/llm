import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
    exclude: ['node_modules', 'dist'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: ['**/*.test.ts', '**/*.d.ts', '**/index.ts', 'vitest.config.ts'],
    },
    typecheck: {
      enabled: true,
    },
    testTimeout: 30000,
    hookTimeout: 10000,
  },
});
