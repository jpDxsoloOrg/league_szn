import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    root: './',
    include: ['src/**/*.test.{ts,tsx}'],
    exclude: ['node_modules'],
    setupFiles: ['./src/test/setup.ts'],
    css: false,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['node_modules', 'src/test/', 'src/**/*.d.ts', 'src/types/'],
    },
  },
});
