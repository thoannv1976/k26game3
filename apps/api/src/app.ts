import Fastify, { type FastifyInstance } from 'fastify';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import { ZodError, type ZodType } from 'zod';
import { authenticate } from './auth.js';
import type { Deps } from './deps.js';
import { ApiError } from './errors.js';
import { coreRoutes } from './routes/core.js';
import { teacherRoutes } from './routes/teacher.js';
import { adminRoutes } from './routes/admin.js';
import { platformRoutes } from './routes/platform.js';
import { lmsRoutes } from './routes/lms.js';

export function parseBody<T>(schema: ZodType<T>, data: unknown): T {
  const r = schema.safeParse(data);
  if (!r.success) {
    throw new ApiError('VALIDATION', 'Invalid request', r.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })));
  }
  return r.data;
}

export async function buildApp(deps: Deps, opts: { logger?: boolean } = {}): Promise<FastifyInstance> {
  const app = Fastify({
    logger: opts.logger === false ? false : { level: deps.config.logLevel, messageKey: 'message' },
    trustProxy: true,
    bodyLimit: 1024 * 1024,
  });

  await app.register(helmet, { contentSecurityPolicy: false });
  await app.register(rateLimit, {
    max: deps.config.rateLimitPerMinute,
    timeWindow: '1 minute',
    keyGenerator: (req) => (req.headers.authorization ? req.headers.authorization.slice(-32) : req.ip),
  });
  app.addContentTypeParser('text/csv', { parseAs: 'string' }, (_req, body, done) => done(null, body));

  app.setErrorHandler((err, req, reply) => {
    if (err instanceof ApiError) {
      return reply.status(err.status).send({ error: { code: err.code, message: err.message, details: err.details } });
    }
    if (err instanceof ZodError) {
      return reply.status(400).send({ error: { code: 'VALIDATION', message: 'Invalid request', details: err.issues } });
    }
    const status = (err as { statusCode?: number }).statusCode;
    if (status && status < 500) {
      return reply.status(status).send({ error: { code: status === 429 ? 'QUOTA_EXCEEDED' : 'VALIDATION', message: err.message } });
    }
    req.log.error({ err }, 'Unhandled error');
    return reply.status(500).send({ error: { code: 'INTERNAL', message: 'Internal server error' } });
  });

  app.get('/api/health', async () => ({ ok: true, app: 'english-detective', ai: deps.ai.name, database: deps.config.firestoreDatabase, env: deps.config.env }));

  // Authenticate every other /api route.
  app.addHook('preHandler', async (req) => {
    if (req.url === '/api/health' || !req.url.startsWith('/api/')) return;
    req.authUser = await authenticate(deps, req);
  });

  await app.register(async (r) => coreRoutes(r, deps));
  await app.register(async (r) => teacherRoutes(r, deps));
  await app.register(async (r) => adminRoutes(r, deps));
  await app.register(async (r) => platformRoutes(r, deps));
  await app.register(async (r) => lmsRoutes(r, deps));
  return app;
}
