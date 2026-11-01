import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    testTimeout: 60_000,
    hookTimeout: 60_000,
    // Integration files share the emulators; each file uses its own tenant, but run serially for stable timing.
    fileParallelism: false,
  },
});
