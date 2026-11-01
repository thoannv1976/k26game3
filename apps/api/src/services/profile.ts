import { answerKey, learningProfile, questionsOf, type ProfileEntry } from '@vq/game-engine';
import { CoachOutputSchema, guardCoach, isInappropriate } from '@vq/ai';
import { SKILLS, type CourseDoc, type Item, type LearningEvidence, type Skill, type UserDoc } from '@vq/shared';
import type { Member } from '../auth.js';
import type { Deps } from '../deps.js';
import { ApiError, forbidden } from '../errors.js';
import { paths } from '../paths.js';
import { recordUsage, reserveAiCall, reserveCounter } from '../quota.js';
import { getTenant, getUserDoc } from '../tenants.js';
import type { AssessmentDoc, AttemptDoc, CoachMessageDoc, ProfileCacheDoc } from '../types.js';
import { canViewStudent } from './access.js';
import { getVersion, listApproved } from './content.js';
import type { PeerResult } from './peers.js';
import { withRetry } from './retry.js';

const SKILL_SET = new Set<string>(SKILLS);

/** Learning evidence from the other K26 games → profile entries (external, never weighted like exams). */
export function externalEntries(results: PeerResult[]): ProfileEntry[] {
  const out: ProfileEntry[] = [];
  for (const r of results) {
    for (const e of r.items) {
      for (const s of e.skills) {
        if (!SKILL_SET.has(s)) continue;
        out.push({ skill: s as Skill, score: Math.round(e.result.finalPercent), source: 'external', validated: e.result.scoreType === 'teacher_validated', at: e.timestamps.completedAt, ref: e.evidenceId });
      }
    }
  }
  return out;
}

async function itemCache(deps: Deps, tenantId: string) {
  const cache = new Map<string, Promise<Item>>();
  return (id: string, v: number) => {
    const k = `${id}@${v}`;
    if (!cache.has(k)) cache.set(k, getVersion(deps, tenantId, 'item', id, v).then((d) => d.content));
    return cache.get(k)!;
  };
}

/** Wrong answers in recent listening/reading attempts, grouped by question type and item objective. */
async function mistakeStats(deps: Deps, tenantId: string, attempts: AttemptDoc[]) {
  const get = await itemCache(deps, tenantId);
  const byType: Record<string, { wrong: number; total: number }> = {};
  const recent: { skill: Skill; topic: string; prompt: string; type: string }[] = [];
  for (const a of attempts.slice(0, 15)) {
    for (const id of a.itemIds) {
      const item = await get(id, a.versions.items[id]!);
      if (item.skill !== 'listening' && item.skill !== 'reading') continue;
      for (const q of questionsOf(item)) {
        const ans = a.state.answers[answerKey(item.id, q.id)];
        if (!ans) continue;
        const k = `${item.skill}:${q.type}`;
        byType[k] ??= { wrong: 0, total: 0 };
        byType[k].total++;
        if (!ans.correct) {
          byType[k].wrong++;
          if (recent.length < 12) recent.push({ skill: item.skill, topic: item.topic, prompt: q.prompt, type: q.type });
        }
      }
    }
  }
  return { byType, recent };
}

export async function buildProfile(deps: Deps, tenantId: string, uid: string) {
  const p = paths(deps.db);
  const [aSnap, atSnap, cache, peers] = await Promise.all([
    p.assessments(tenantId).where('uid', '==', uid).orderBy('createdAt', 'desc').limit(60).get(),
    p.attempts(tenantId).where('uid', '==', uid).where('status', '==', 'graded').orderBy('startedAt', 'desc').limit(20).get(),
    p.profile(tenantId, uid).get(),
    deps.peers.evidence(tenantId, uid).catch(() => [] as PeerResult[]),
  ]);
  const assessments = aSnap.docs.map((d) => d.data() as AssessmentDoc);
  const entries: ProfileEntry[] = [];
  for (const a of assessments) {
    for (const s of a.skills) {
      if (s.score === null || s.status === 'not_assessed') continue;
      entries.push({ skill: s.skill, score: s.score, source: a.mode === 'exam' ? 'exam' : 'quest', validated: Boolean(a.teacherReview), at: a.createdAt, ref: a.id });
    }
  }
  const external = externalEntries(peers);
  const profile = learningProfile([...entries, ...external]);
  const mistakes = await mistakeStats(deps, tenantId, atSnap.docs.map((d) => d.data() as AttemptDoc));
  const history = assessments
    .slice(0, 30)
    .map((a) => ({ id: a.id, mode: a.mode, refId: a.refId, title: a.title, score: a.score, passed: a.passed, pendingReview: a.pendingReview, skills: a.skills.map((s) => ({ skill: s.skill, score: s.score, status: s.status })), at: a.createdAt }))
    .reverse();
  return {
    profile,
    history,
    mistakes: mistakes.byType,
    recentMistakes: mistakes.recent,
    external: {
      sources: peers.map((r) => ({ source: r.source, ok: r.ok, count: r.items.length, error: r.error })),
      items: peers.flatMap((r) => r.items).slice(0, 20).map((e: LearningEvidence) => ({ id: e.evidenceId, source: e.source, title: e.activity.title, skills: e.skills, finalPercent: e.result.finalPercent, scoreType: e.result.scoreType, at: e.timestamps.completedAt })),
    },
    summary: (cache.data() as ProfileCacheDoc | undefined) ?? { summary: null, generatedAt: null },
    disclaimer: 'Practice results only – not an official VSTEP score. Đây là kết quả luyện tập, không phải điểm VSTEP chính thức.',
  };
}

export async function getProfile(deps: Deps, m: Member, uid: string) {
  if (!(await canViewStudent(deps, m, uid))) throw forbidden('You cannot view this profile');
  const user = await getUserDoc(deps, m.tenantId, uid);
  return { user: user ? { uid: user.uid, displayName: user.displayName, level: user.level, xp: user.xp, badges: user.badges, streak: user.streak, completedQuestIds: user.completedQuestIds } : null, ...(await buildProfile(deps, m.tenantId, uid)) };
}

/** AI narrative (strengths, focus areas, 1-week plan) based only on the computed statistics; cached. */
export async function generateSummary(deps: Deps, m: Member) {
  const tenant = await getTenant(deps, m.tenantId);
  const user = await getUserDoc(deps, m.tenantId, m.uid);
  const course = user?.courseIds[0] ? ((await paths(deps.db).course(m.tenantId, user.courseIds[0]).get()).data() as CourseDoc | undefined) : undefined;
  const data = await buildProfile(deps, m.tenantId, m.uid);
  await deps.db.runTransaction(async (tx) => {
    const q = await reserveAiCall(deps, tx, tenant, m.uid, course?.id ?? null, course?.monthlyBudgetUsd ?? null);
    q.commit();
  });
  const model = tenant.aiConfig.model;
  const started = Date.now();
  const stats = { level: user?.level, skills: data.profile.skills, overall: data.profile.overall, weakest: data.profile.weakest, mistakesByType: data.mistakes, recentResults: data.history.slice(-10) };
  try {
    const r = await withRetry(() => deps.ai.analytics({ audience: 'student', stats, model, maxOutputTokens: Math.min(1500, tenant.quotas.maxOutputTokens) }), { retries: deps.config.aiMaxRetries, timeoutMs: deps.config.aiTimeoutMs });
    void recordUsage(deps, tenant, { kind: 'analytics', uid: m.uid, sessionId: null, courseId: course?.id ?? null, model, ...r.usage, ok: true, latencyMs: Date.now() - started });
    const doc: ProfileCacheDoc = { summary: r.output, generatedAt: deps.now().toISOString() };
    await paths(deps.db).profile(m.tenantId, m.uid).set(doc);
    return doc;
  } catch (e) {
    void recordUsage(deps, tenant, { kind: 'analytics', uid: m.uid, sessionId: null, courseId: course?.id ?? null, model, ok: false, latencyMs: Date.now() - started });
    throw new ApiError('INTERNAL', 'The AI summary is not available right now. Please try again later.', { cause: (e as Error).message });
  }
}

/* ---------------- AI Learning Coach ---------------- */

const REFUSAL =
  "I can't give answers to questions you haven't finished yet – but I can help with a strategy! Tell me which question type you find difficult (e.g. True/False/Not Given) and I'll show you how to approach it.";

/** Answers of questions the student is working on right now (the coach must never reveal them). */
async function protectedAnswers(deps: Deps, tenantId: string, active: AttemptDoc[]): Promise<string[]> {
  const get = await itemCache(deps, tenantId);
  const out: string[] = [];
  for (const a of active) {
    for (const id of a.itemIds) {
      const item = await get(id, a.versions.items[id]!);
      for (const q of questionsOf(item)) {
        if (a.state.answers[answerKey(item.id, q.id)]) continue;
        if (q.type === 'mcq') out.push(q.options[q.correctIndex]!);
        if (q.type === 'short') out.push(...q.acceptable);
      }
    }
  }
  return out;
}

export async function coachHistory(deps: Deps, m: Member) {
  const snap = await paths(deps.db).coachMessages(m.tenantId, m.uid).orderBy('createdAt', 'desc').limit(30).get();
  return snap.docs
    .map((d) => d.data() as CoachMessageDoc)
    .filter((x) => x.status === 'done')
    .reverse()
    .map((x) => ({ id: x.id, question: x.question, answer: x.answer, kind: x.kind, suggestedQuestIds: x.suggestedQuestIds, createdAt: x.createdAt }));
}

export async function askCoach(deps: Deps, m: Member, input: { clientMessageId: string; question: string }) {
  const p = paths(deps.db);
  const tenant = await getTenant(deps, m.tenantId);
  const user = await getUserDoc(deps, m.tenantId, m.uid);
  if (!user) throw new ApiError('NOT_PROVISIONED', 'Open the home page first to create your profile');
  if (isInappropriate(input.question)) throw new ApiError('CONTENT_BLOCKED', 'Please keep your questions appropriate for a classroom.');
  const active = (await p.attempts(m.tenantId).where('uid', '==', m.uid).where('status', '==', 'active').get()).docs.map((d) => d.data() as AttemptDoc);
  // No help during a mock exam or a championship without help.
  if (active.some((a) => !a.helpAllowed && a.mode === 'exam')) throw new ApiError('HELP_DISABLED', 'The coach is not available during a mock exam');
  if (active.some((a) => !a.helpAllowed)) throw new ApiError('HELP_DISABLED', 'The coach is not available during this championship');
  const ref = p.coachMessage(m.tenantId, m.uid, input.clientMessageId);
  const course = user.courseIds[0] ? ((await p.course(m.tenantId, user.courseIds[0]).get()).data() as CourseDoc | undefined) : undefined;

  const claim = await deps.db.runTransaction(async (tx) => {
    const ex = (await tx.get(ref)).data() as CoachMessageDoc | undefined;
    if (ex?.status === 'done') return { replay: ex };
    if (ex?.status === 'processing' && deps.now().getTime() - new Date(ex.createdAt).getTime() < 90_000) throw new ApiError('REQUEST_IN_PROGRESS', 'Your coach is answering this message');
    const c1 = await reserveCounter(deps, tx, tenant, m.uid, 'coach', tenant.quotas.coachMessagesPerStudentPerDay, 'COACH_LIMIT');
    const c2 = await reserveAiCall(deps, tx, tenant, m.uid, course?.id ?? null, course?.monthlyBudgetUsd ?? null);
    c1();
    c2.commit();
    tx.set(ref, { id: input.clientMessageId, status: 'processing', question: input.question, createdAt: deps.now().toISOString() });
    return { replay: null };
  });
  if (claim.replay) return coachView(claim.replay);

  const [profileData, history, protectedList, quests] = await Promise.all([
    buildProfile(deps, m.tenantId, m.uid),
    coachHistory(deps, m),
    protectedAnswers(deps, m.tenantId, active),
    listApproved(deps, m.tenantId, 'quest'),
  ]);
  const questIds = new Set(quests.map((q) => q.content.id));
  const model = tenant.aiConfig.model;
  const started = Date.now();
  try {
    const r = await withRetry(
      () =>
        deps.ai.coach({
          level: user.level,
          profile: profileData.profile.skills.map((s) => ({ skill: s.skill, score: s.score })),
          recentMistakes: profileData.recentMistakes,
          history: history.slice(-6).map((h) => ({ question: h.question, answer: h.answer })),
          question: input.question,
          model,
          maxOutputTokens: Math.min(1024, tenant.quotas.maxOutputTokens),
        }),
      { retries: deps.config.aiMaxRetries, timeoutMs: deps.config.aiTimeoutMs },
    );
    void recordUsage(deps, tenant, { kind: 'coach', uid: m.uid, sessionId: null, courseId: course?.id ?? null, model, ...r.usage, ok: true, latencyMs: Date.now() - started });
    const out = CoachOutputSchema.parse(r.output);
    const blocked = guardCoach(out.answer, protectedList);
    const doc: CoachMessageDoc = {
      id: input.clientMessageId,
      status: 'done',
      question: input.question,
      answer: blocked ? REFUSAL : out.answer,
      kind: blocked ? 'refused' : out.kind,
      suggestedQuestIds: out.suggestedQuestIds.filter((q) => questIds.has(q)),
      blocked,
      createdAt: deps.now().toISOString(),
    };
    await ref.set(doc);
    return coachView(doc);
  } catch (e) {
    void recordUsage(deps, tenant, { kind: 'coach', uid: m.uid, sessionId: null, courseId: course?.id ?? null, model, ok: false, latencyMs: Date.now() - started });
    await ref.set({ status: 'failed' }, { merge: true });
    throw new ApiError('INTERNAL', 'Your coach is not available right now. Please try again.', { cause: (e as Error).message });
  }
}

const coachView = (d: CoachMessageDoc) => ({ id: d.id, question: d.question, answer: d.answer, kind: d.kind, suggestedQuestIds: d.suggestedQuestIds, createdAt: d.createdAt });

export type { UserDoc };
