import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { DEFAULT_AI_CONFIG, DEFAULT_QUOTAS, type TenantDoc } from '@vq/shared';
import { parseBody } from '../app.js';
import { requireMember } from '../auth.js';
import type { Deps } from '../deps.js';
import { ApiError, notFound } from '../errors.js';
import { paths } from '../paths.js';
import { audit } from '../audit.js';
import { provisionUser } from '../services/users.js';
import { seedBuiltinContent } from '../services/content.js';

/**
 * Platform administration: create and manage schools (tenants).
 * Platform admins do NOT get access to learning data (sessions, assessments) by default.
 */
export async function platformRoutes(app: FastifyInstance, deps: Deps) {
  const p = paths(deps.db);

  app.get('/api/platform/tenants', async (req) => {
    requireMember(req.authUser, ['platform_admin']);
    const snap = await p.tenants().get();
    const tenants = await Promise.all(
      snap.docs.map(async (d) => {
        const t = d.data() as TenantDoc;
        const users = await p.users(t.id).count().get();
        return { id: t.id, name: t.name, active: t.active, allowedEmailDomains: t.allowedEmailDomains, monthlyBudgetUsd: t.quotas?.monthlyBudgetUsd ?? null, users: users.data().count, createdAt: t.createdAt };
      }),
    );
    return { tenants };
  });

  app.post('/api/platform/tenants', async (req) => {
    const u = requireMember(req.authUser, ['platform_admin']);
    const body = parseBody(
      z.object({
        id: z.string().regex(/^[a-z0-9-]{3,40}$/),
        name: z.string().trim().min(2).max(200),
        allowedEmailDomains: z.array(z.string().regex(/^[a-z0-9.-]+\.[a-z]{2,}$/)).max(10).default([]),
        adminEmail: z.email(),
        adminName: z.string().trim().min(1).max(120),
        seedContent: z.boolean().default(true),
      }),
      req.body,
    );
    const ref = p.tenant(body.id);
    if ((await ref.get()).exists) throw new ApiError('CONFLICT', 'A school with this id already exists');
    const tenant: TenantDoc = {
      id: body.id,
      name: body.name,
      allowedEmailDomains: body.allowedEmailDomains,
      quotas: DEFAULT_QUOTAS,
      aiConfig: DEFAULT_AI_CONFIG,
      active: true,
      createdAt: deps.now().toISOString(),
    };
    await ref.set(tenant);
    // Built-in quests are approved (reviewed with the product); the mock exam stays a draft until a school admin
    // with VSTEP-format expertise approves it.
    if (body.seedContent) await seedBuiltinContent(deps, body.id, { approvedBy: `platform:${u.uid}` });
    const admin = await provisionUser(deps, tenant, { email: body.adminEmail.toLowerCase(), displayName: body.adminName, role: 'school_admin', level: 'B1', courseIds: [] });
    await audit(deps, u, null, 'tenant.create', body.id, { adminEmail: body.adminEmail });
    return { tenant, admin: { uid: admin.uid, temporaryPassword: admin.password } };
  });

  app.patch('/api/platform/tenants/:id', async (req) => {
    const u = requireMember(req.authUser, ['platform_admin']);
    const id = (req.params as { id: string }).id;
    const body = parseBody(z.object({ name: z.string().trim().min(2).max(200).optional(), active: z.boolean().optional(), monthlyBudgetUsd: z.number().min(0).max(100000).optional() }), req.body);
    const ref = p.tenant(id);
    const t = (await ref.get()).data() as TenantDoc | undefined;
    if (!t) throw notFound('School');
    const update: Record<string, unknown> = {};
    if (body.name) update.name = body.name;
    if (body.active !== undefined) update.active = body.active;
    if (body.monthlyBudgetUsd !== undefined) update['quotas.monthlyBudgetUsd'] = body.monthlyBudgetUsd;
    await ref.update(update);
    await audit(deps, u, null, 'tenant.update', id, body);
    return { ok: true };
  });
}
