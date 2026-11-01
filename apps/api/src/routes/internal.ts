import type { FastifyInstance } from 'fastify';
import type { Deps } from '../deps.js';
import { runTick, verifyJobCaller } from '../services/jobs.js';

/** Cloud Scheduler entry point (OIDC-authenticated, not exposed through Firebase Hosting). */
export async function internalRoutes(app: FastifyInstance, deps: Deps) {
  app.post('/internal/jobs/tick', async (req) => {
    const caller = await verifyJobCaller(deps, req.headers.authorization);
    const report = await runTick(deps);
    req.log.info({ caller, report }, 'jobs.tick');
    return report;
  });
}
