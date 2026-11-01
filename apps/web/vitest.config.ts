import { defineConfig } from 'vitest/config';
import { engineAlias } from './vite.config';

export default defineConfig({
  resolve: { alias: [engineAlias] },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
