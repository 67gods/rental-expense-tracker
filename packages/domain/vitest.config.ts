import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['test/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/rules/**', 'src/totals/**', 'src/money.ts'],
      thresholds: {
        // The tax-logic layer is the part of this app that must not be wrong.
        lines: 90,
        functions: 90,
        branches: 85,
        statements: 90,
      },
    },
  },
});
