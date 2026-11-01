import type { Deps } from './deps.js';
import type { AuthUser } from './auth.js';
import { paths } from './paths.js';

export async function audit(deps: Deps, actor: AuthUser, tenantId: string | null, action: string, target: string, details: Record<string, unknown> = {}) {
  const entry = {
    at: deps.now().toISOString(),
    actorUid: actor.uid,
    actorEmail: actor.email,
    actorRole: actor.role,
    action,
    target,
    details,
  };
  const p = paths(deps.db);
  if (tenantId) await p.auditLogs(tenantId).add(entry);
  else await p.platformAudit().add(entry);
}
