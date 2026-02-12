import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    root: './',
    include: ['**/*.test.ts'],
    exclude: ['node_modules', '.build', '.serverless'],
    coverage: {
      provider: 'v8',
      include: ['lib/**/*.ts', 'functions/**/*.ts'],
      exclude: ['node_modules', '.build', '.serverless'],
    },
  },
});
