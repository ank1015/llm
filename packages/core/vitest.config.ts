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
    // Separate test pools for unit and integration tests
    typecheck: {
      enabled: true,
    },
    // Test timeout - integration tests may take longer
    testTimeout: 30000,
    // Hook timeout for setup/teardown
    hookTimeout: 10000,
  },
});
