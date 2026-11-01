import { DEFAULT_AI_CONFIG, DEFAULT_QUOTAS, type TenantDoc, type UserDoc } from '@vq/shared';
import type { Deps } from './deps.js';
import { notFound } from './errors.js';
import { paths } from './paths.js';

export async function getTenant(deps: Deps, tenantId: string): Promise<TenantDoc> {
  const snap = await paths(deps.db).tenant(tenantId).get();
  if (!snap.exists) throw notFound('School');
  const t = snap.data() as TenantDoc;
  return {
    ...t,
    quotas: { ...DEFAULT_QUOTAS, ...(t.quotas ?? {}) },
    aiConfig: { ...DEFAULT_AI_CONFIG, ...(t.aiConfig ?? {}), pricing: { ...DEFAULT_AI_CONFIG.pricing, ...(t.aiConfig?.pricing ?? {}) } },
  };
}

export async function getUserDoc(deps: Deps, tenantId: string, uid: string): Promise<UserDoc | null> {
  const snap = await paths(deps.db).user(tenantId, uid).get();
  return snap.exists ? (snap.data() as UserDoc) : null;
}
