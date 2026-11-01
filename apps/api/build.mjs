// Bundles the API (and @vq/shared + mission content) into dist/server.js for Cloud Run.
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
        for (const pkg of ['shared', 'game-engine', 'ai']) {
          b.onResolve({ filter: new RegExp(`^@vq/${pkg}$`) }, () => ({ path: new URL(`../../packages/${pkg}/src/index.ts`, import.meta.url).pathname }));
        }
      },
    },
  ],
  banner: { js: "import { createRequire } from 'module'; const require = createRequire(import.meta.url);" },
});
console.log('API built → dist/server.js');
