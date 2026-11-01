import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

/**
 * `@engine/<module>` points at single, data-free modules of packages/game-engine (text helpers, achievement labels).
 * Never import the package index in the browser bundle: it bundles the built-in dossiers (answers, sample solutions).
 */
export const engineAlias = { find: /^@engine\/(text|scoring)$/, replacement: fileURLToPath(new URL('../../packages/game-engine/src/$1.ts', import.meta.url)) };

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: [engineAlias] },
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': { target: 'http://127.0.0.1:8080', changeOrigin: false },
    },
  },
  preview: {
    port: 4173,
    proxy: {
      '/api': { target: 'http://127.0.0.1:8080', changeOrigin: false },
    },
  },
  build: {
    target: 'es2022',
    sourcemap: false,
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        manualChunks: {
          firebase: ['firebase/app', 'firebase/auth'],
          react: ['react', 'react-dom', 'react-router-dom', '@tanstack/react-query'],
        },
      },
    },
  },
});
