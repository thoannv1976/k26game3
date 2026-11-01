import { buildApp } from './app.js';
import { loadConfig } from './config.js';
import { createDeps } from './deps.js';

const config = loadConfig();
const deps = createDeps(config);
const app = await buildApp(deps);
await app.listen({ port: config.port, host: '0.0.0.0' });
app.log.info(`English Detective API listening on ${config.port} (ai=${deps.ai.name}, db=${config.firestoreDatabase})`);

for (const sig of ['SIGTERM', 'SIGINT'] as const) {
  process.on(sig, () => {
    app.close().then(() => process.exit(0));
  });
}
