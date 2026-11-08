import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { parseBody } from '../app.js';
import type { Deps } from '../deps.js';
import { notFound } from '../errors.js';
import { ltiLaunch } from '../lti/launch.js';

/** UniGame Hub (LTI 1.3) sign-in. Unauthenticated by design: the signed Hub ticket is the credential. */
export async function ltiRoutes(app: FastifyInstance, deps: Deps) {
  app.post('/api/lti/launch', { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }, async (req) => {
    if (!deps.config.ltiEnabled) throw notFound('Route');
    const { ticket } = parseBody(z.object({ ticket: z.string().min(20).max(8000) }), req.body);
    return ltiLaunch(deps, ticket);
  });
}
