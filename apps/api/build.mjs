// Bundles the API (and the workspace packages + quest/exam content) into dist/server.js for Cloud Run.
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

await build({
  entryPoints: ['src/server.ts'],
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'esm',
  outfile: 'dist/server.js',
  sourcemap: true,
  // Keep npm dependencies external (installed in the container); bundle workspace code.
  packages: 'external',
  plugins: [
    {
      name: 'bundle-workspace',
      setup(b) {
        // Root exports and subpath exports (e.g. @vq/game-engine/text → packages/game-engine/src/text.ts).
        for (const pkg of ['shared', 'game-engine', 'ai']) {
          b.onResolve({ filter: new RegExp(`^@vq/${pkg}(/[a-z-]+)?$`) }, (args) => {
            const sub = args.path.slice(`@vq/${pkg}`.length).replace(/^\//, '') || 'index';
            return { path: fileURLToPath(new URL(`../../packages/${pkg}/src/${sub}.ts`, import.meta.url)) };
          });
        }
      },
    },
  ],
  banner: { js: "import { createRequire } from 'module'; const require = createRequire(import.meta.url);" },
});
console.log('API built → dist/server.js');
