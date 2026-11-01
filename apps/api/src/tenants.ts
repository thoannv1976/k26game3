import { BUILTIN_CASES } from '@vq/game-engine';
import {
  CaseDossierSchema,
  DEFAULT_AI_CONFIG,
  DEFAULT_QUOTAS,
  type CaseDoc,
  type CaseDossier,
  type CaseVersionDoc,
  type TenantDoc,
  type UserDoc,
} from '@vq/shared';
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

/** Approved dossier of a specific version (sessions keep the version they started with). */
export async function getCaseVersion(deps: Deps, tenantId: string, caseId: string, version: number): Promise<CaseDossier> {
  const snap = await paths(deps.db).caseVersion(tenantId, caseId, version).get();
  if (!snap.exists) throw notFound('Case version');
  return CaseDossierSchema.parse((snap.data() as CaseVersionDoc).dossier);
}

/** Currently approved version of a case, or 404 when the case is draft/archived. */
export async function getApprovedCase(deps: Deps, tenantId: string, caseId: string): Promise<{ dossier: CaseDossier; version: number }> {
  const doc = (await paths(deps.db).case(tenantId, caseId).get()).data() as CaseDoc | undefined;
  if (!doc || doc.approvedVersion < 1 || doc.status === 'archived') throw notFound('Case');
  return { dossier: await getCaseVersion(deps, tenantId, caseId, doc.approvedVersion), version: doc.approvedVersion };
}

export async function listApprovedCases(deps: Deps, tenantId: string): Promise<{ dossier: CaseDossier; version: number }[]> {
  const snap = await paths(deps.db).cases(tenantId).get();
  const docs = snap.docs.map((d) => d.data() as CaseDoc).filter((d) => d.approvedVersion > 0 && d.status !== 'archived');
  const out = await Promise.all(docs.map(async (d) => ({ dossier: await getCaseVersion(deps, tenantId, d.id, d.approvedVersion), version: d.approvedVersion })));
  return out.sort((a, b) => a.dossier.id.localeCompare(b.dossier.id));
}

export { BUILTIN_CASES };
