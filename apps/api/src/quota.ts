import { FieldValue, type Transaction } from 'firebase-admin/firestore';
import type { Pricing, TenantDoc } from '@vq/shared';
import type { Deps } from './deps.js';
import { ApiError } from './errors.js';
import { paths } from './paths.js';

/** Days and months are counted in Vietnam time (UTC+7). */
const VN_OFFSET_MS = 7 * 3600 * 1000;
export function dayKey(d: Date): string {
  return new Date(d.getTime() + VN_OFFSET_MS).toISOString().slice(0, 10).replace(/-/g, '');
}
export function monthKey(d: Date): string {
  return dayKey(d).slice(0, 6);
}

export const counterIds = (uid: string, courseId: string | null, now: Date) => ({
  userDay: `u_${uid}_${dayKey(now)}`,
  tenantMonth: `t_${monthKey(now)}`,
  courseMonth: courseId ? `c_${courseId}_${monthKey(now)}` : null,
});

interface CounterData {
  aiCalls?: number;
  costUsd?: number;
  attempts?: Record<string, number>;
}

export interface QuotaCheck {
  warning: boolean;
}

/**
 * Checks limits and reserves one AI call inside a transaction.
 * Must be called before any write in the transaction (Firestore requires reads first).
 */
export async function reserveAiCall(
  deps: Deps,
  tx: Transaction,
  tenant: TenantDoc,
  uid: string,
  courseId: string | null,
  courseBudget: number | null,
): Promise<{ check: QuotaCheck; commit: () => void }> {
  const p = paths(deps.db);
  const ids = counterIds(uid, courseId, deps.now());
  const userRef = p.counter(tenant.id, ids.userDay);
  const tenantRef = p.counter(tenant.id, ids.tenantMonth);
  const courseRef = ids.courseMonth ? p.counter(tenant.id, ids.courseMonth) : null;
  const [u, t, c] = await Promise.all([tx.get(userRef), tx.get(tenantRef), courseRef ? tx.get(courseRef) : Promise.resolve(null)]);
  const ud = (u.data() ?? {}) as CounterData;
  const td = (t.data() ?? {}) as CounterData;
  const cd = (c?.data() ?? {}) as CounterData;
  const q = tenant.quotas;

  const userCalls = ud.aiCalls ?? 0;
  if (userCalls >= q.aiCallsPerStudentPerDay) {
    throw new ApiError('QUOTA_EXCEEDED', `Daily AI limit reached (${q.aiCallsPerStudentPerDay} calls). Try again tomorrow.`);
  }
  const tenantCost = td.costUsd ?? 0;
  if (q.monthlyBudgetUsd > 0 && tenantCost >= q.monthlyBudgetUsd && q.onBudgetExceeded === 'block') {
    throw new ApiError('BUDGET_EXCEEDED', 'The school AI budget for this month has been reached.');
  }
  const courseCost = cd.costUsd ?? 0;
  if (courseRef && courseBudget && courseCost >= courseBudget && q.onBudgetExceeded === 'block') {
    throw new ApiError('BUDGET_EXCEEDED', 'The course AI budget for this month has been reached.');
  }
  const warning =
    userCalls + 1 >= q.aiCallsPerStudentPerDay * q.warnRatio ||
    (q.monthlyBudgetUsd > 0 && tenantCost >= q.monthlyBudgetUsd * q.warnRatio) ||
    Boolean(courseBudget && courseCost >= courseBudget * q.warnRatio);

  return {
    check: { warning },
    commit: () => {
      tx.set(userRef, { aiCalls: FieldValue.increment(1), uid, day: dayKey(deps.now()) }, { merge: true });
      tx.set(tenantRef, { aiCalls: FieldValue.increment(1), month: monthKey(deps.now()) }, { merge: true });
      if (courseRef) tx.set(courseRef, { aiCalls: FieldValue.increment(1), courseId, month: monthKey(deps.now()) }, { merge: true });
    },
  };
}

/** Checks/increments today's attempts for a quest (transaction; reads first). */
export async function reserveAttempt(deps: Deps, tx: Transaction, tenant: TenantDoc, uid: string, missionId: string) {
  const ref = paths(deps.db).counter(tenant.id, counterIds(uid, null, deps.now()).userDay);
  const snap = await tx.get(ref);
  const attempts = ((snap.data() ?? {}) as CounterData).attempts?.[missionId] ?? 0;
  if (attempts >= tenant.quotas.attemptsPerQuestPerDay) {
    throw new ApiError('ATTEMPT_LIMIT', `You can start this quest ${tenant.quotas.attemptsPerQuestPerDay} times per day.`);
  }
  return () => tx.set(ref, { attempts: { [missionId]: FieldValue.increment(1) }, uid, day: dayKey(deps.now()) }, { merge: true });
}

export interface UsageRecord {
  kind: 'explain' | 'grade_writing' | 'grade_speaking' | 'coach' | 'analytics' | 'generate' | 'stt' | 'tts' | 'ping';
  uid: string;
  sessionId: string | null;
  courseId: string | null;
  model?: string;
  inputTokens?: number;
  outputTokens?: number;
  sttSeconds?: number;
  ttsChars?: number;
  ok: boolean;
  latencyMs?: number;
}

export function estimateCost(p: Pricing, u: UsageRecord): number {
  return (
    ((u.inputTokens ?? 0) / 1e6) * p.inputTokensPer1M +
    ((u.outputTokens ?? 0) / 1e6) * p.outputTokensPer1M +
    ((u.sttSeconds ?? 0) / 60) * p.sttPerMinute +
    ((u.ttsChars ?? 0) / 1e6) * p.ttsPer1MChars
  );
}

/** Writes a usage log entry and adds its estimated cost to the counters (best effort). */
export async function recordUsage(deps: Deps, tenant: TenantDoc, u: UsageRecord): Promise<void> {
  const p = paths(deps.db);
  const now = deps.now();
  const cost = estimateCost(tenant.aiConfig.pricing, u);
  const ids = counterIds(u.uid, u.courseId, now);
  const batch = deps.db.batch();
  batch.create(p.usageLogs(tenant.id).doc(), {
    ...u,
    costUsd: cost,
    at: now.toISOString(),
    day: dayKey(now),
    month: monthKey(now),
  });
  const inc = {
    costUsd: FieldValue.increment(cost),
    inputTokens: FieldValue.increment(u.inputTokens ?? 0),
    outputTokens: FieldValue.increment(u.outputTokens ?? 0),
    sttSeconds: FieldValue.increment(u.sttSeconds ?? 0),
    ttsChars: FieldValue.increment(u.ttsChars ?? 0),
  };
  batch.set(p.counter(tenant.id, ids.userDay), { ...inc, uid: u.uid, day: dayKey(now) }, { merge: true });
  batch.set(p.counter(tenant.id, ids.tenantMonth), { ...inc, month: monthKey(now) }, { merge: true });
  if (ids.courseMonth) batch.set(p.counter(tenant.id, ids.courseMonth), { ...inc, courseId: u.courseId, month: monthKey(now) }, { merge: true });
  try {
    await batch.commit();
  } catch (e) {
    console.error('usage log failed', e);
  }
}

/**
 * Per-student counters with their own limits (explanations/day, coach messages/day, mock exams/month).
 * Must be called inside a transaction before any write; returns a commit function.
 */
export async function reserveCounter(
  deps: Deps,
  tx: Transaction,
  tenant: TenantDoc,
  uid: string,
  field: 'explanations' | 'coach' | 'mockExams',
  limit: number,
  code: 'EXPLANATION_LIMIT' | 'COACH_LIMIT' | 'ATTEMPT_LIMIT',
) {
  const now = deps.now();
  const id = field === 'mockExams' ? `m_${uid}_${monthKey(now)}` : counterIds(uid, null, now).userDay;
  const ref = paths(deps.db).counter(tenant.id, id);
  const snap = await tx.get(ref);
  const used = ((snap.data() ?? {}) as Record<string, number>)[field] ?? 0;
  if (used >= limit) throw new ApiError(code, field === 'mockExams' ? `Mock exam limit reached for this month (${limit}).` : `Daily limit reached (${limit}).`);
  return () => tx.set(ref, { [field]: FieldValue.increment(1), uid }, { merge: true });
}
