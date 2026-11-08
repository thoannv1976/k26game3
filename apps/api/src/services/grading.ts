import {
  DISCLAIMER,
  EXAM_XP,
  PRONUNCIATION_PENDING,
  RUBRIC_VERSION,
  SPEAKING_MAX,
  WRITING_MAX,
  answerKey,
  convert,
  criteriaScore,
  earnedBadges,
  fluencyFromMetrics,
  itemView,
  nextStreak,
  overallScore,
  questXp,
  questionsOf,
  skillResult,
  takeKey,
  wordCount,
  type CriterionScore,
  type ItemResult,
  type SkillResult,
} from '@vq/game-engine';
import { PROMPT_VERSION, verifySpeaking, verifyWriting, type SpeakingGrade, type WritingGrade } from '@vq/ai';
import { SKILLS, type CourseDoc, type Item, type Quest, type Skill, type SpeakingItem, type TenantDoc, type UserDoc, type WritingItem } from '@vq/shared';
import type { Member } from '../auth.js';
import type { Deps } from '../deps.js';
import { ApiError, forbidden, notFound } from '../errors.js';
import { paths } from '../paths.js';
import { recordUsage, reserveAiCall } from '../quota.js';
import { getTenant } from '../tenants.js';
import type { AssessmentDoc, AttemptDoc, ChampionshipDoc, EntryDoc, ItemFeedback, TeacherReview, WritingDoc } from '../types.js';
import { canViewStudent } from './access.js';
import { attemptItems, attemptRef, loadAttempt, tickClock } from './attempts.js';
import { syncGrade } from '../lti/gradeSync.js';
import { listApproved } from './content.js';
import { withRetry } from './retry.js';

const GRADING_STALE_MS = 5 * 60_000;

/* ---------------- per-item scoring ---------------- */

function objectiveResult(item: Item, a: AttemptDoc): ItemResult {
  const qs = questionsOf(item);
  const total = qs.reduce((n, q) => n + q.points, 0);
  const earned = qs.reduce((n, q) => n + (a.state.answers[answerKey(item.id, q.id)]?.points ?? 0), 0);
  return { itemId: item.id, skill: item.skill as 'listening' | 'reading', earned, total, score: total ? Math.round((earned / total) * 100) : 0 };
}

const zero = (max: number, comment: string): CriterionScore => ({ score: 0, max, source: 'none', status: 'assessed', comment });
const pending = (max: number, comment: string): CriterionScore => ({ score: null, max, source: 'none', status: 'pending_review', comment });
const ai = (s: { score: number; comment: string }, max: number): CriterionScore => ({ score: s.score, max, source: 'ai', status: 'assessed', comment: s.comment });

function writingResult(item: WritingItem, text: string, g: WritingGrade | null, aiTried: boolean): ItemResult {
  const wc = wordCount(text);
  let criteria: Record<keyof typeof WRITING_MAX, CriterionScore>;
  if (wc < 10) {
    criteria = { taskFulfillment: zero(25, 'No answer was written.'), organization: zero(25, ''), vocabulary: zero(25, ''), grammar: zero(25, '') };
  } else if (g) {
    criteria = { taskFulfillment: ai(g.taskFulfillment, 25), organization: ai(g.organization, 25), vocabulary: ai(g.vocabulary, 25), grammar: ai(g.grammar, 25) };
  } else {
    const msg = aiTried ? 'AI feedback is not available right now – your teacher will score this.' : 'Waiting for your teacher.';
    criteria = { taskFulfillment: pending(25, msg), organization: pending(25, msg), vocabulary: pending(25, msg), grammar: pending(25, msg) };
  }
  const cs = criteriaScore(criteria);
  return { itemId: item.id, skill: 'writing', weight: item.weight, criteria, score: cs.score, status: cs.status };
}

function speakingResult(item: SpeakingItem, a: AttemptDoc, g: SpeakingGrade | null, aiTried: boolean): ItemResult {
  const takes = item.parts.map((p) => a.state.speaking[takeKey(item.id, p.id)]).filter((t) => t && t.status === 'transcribed');
  let criteria: Record<keyof typeof SPEAKING_MAX, CriterionScore>;
  if (!takes.length) {
    criteria = {
      taskFulfillment: zero(SPEAKING_MAX.taskFulfillment, 'No recording was submitted.'),
      fluency: zero(SPEAKING_MAX.fluency, ''),
      vocabulary: zero(SPEAKING_MAX.vocabulary, ''),
      grammar: zero(SPEAKING_MAX.grammar, ''),
      pronunciation: zero(SPEAKING_MAX.pronunciation, ''),
    };
  } else {
    const metrics = takes.reduce((m, t) => ({ words: m.words + t!.metrics.words, speechSeconds: m.speechSeconds + t!.metrics.speechSeconds, longPauses: m.longPauses + t!.metrics.longPauses }), { words: 0, speechSeconds: 0, longPauses: 0 });
    const msg = aiTried ? 'AI feedback is not available right now – your teacher will score this.' : 'Waiting for your teacher.';
    criteria = {
      taskFulfillment: g ? ai(g.taskFulfillment, SPEAKING_MAX.taskFulfillment) : pending(SPEAKING_MAX.taskFulfillment, msg),
      fluency: fluencyFromMetrics(metrics),
      vocabulary: g ? ai(g.vocabulary, SPEAKING_MAX.vocabulary) : pending(SPEAKING_MAX.vocabulary, msg),
      grammar: g ? ai(g.grammar, SPEAKING_MAX.grammar) : pending(SPEAKING_MAX.grammar, msg),
      pronunciation: PRONUNCIATION_PENDING,
    };
  }
  const cs = criteriaScore(criteria);
  return { itemId: item.id, skill: 'speaking', criteria, score: cs.score, status: cs.status };
}

const feedbackOf = (g: WritingGrade | SpeakingGrade): ItemFeedback => ({
  strengths: g.strengths,
  improvements: g.improvements,
  examples: g.examples,
  corrections: g.corrections,
  nextPractice: g.nextPractice,
});

/* ---------------- teacher review ---------------- */

/** Replaces criteria with teacher scores (source "teacher") and recomputes item scores. */
export function applyReview(items: ItemResult[], review: TeacherReview | null): ItemResult[] {
  if (!review) return items;
  return items.map((r) => {
    if (r.skill !== 'writing' && r.skill !== 'speaking') return r;
    const scores = review.scores[r.itemId];
    if (!scores) return r;
    const criteria = Object.fromEntries(
      Object.entries(r.criteria).map(([k, c]) => {
        const s = scores[k];
        return [k, s === undefined ? c : { ...c, score: Math.max(0, Math.min(c.max, s)), source: 'teacher', status: 'assessed', comment: c.comment }];
      }),
    ) as typeof r.criteria;
    const cs = criteriaScore(criteria);
    return { ...r, criteria, score: cs.score, status: cs.status } as ItemResult;
  });
}

function summarize(a: AttemptDoc, items: ItemResult[], quest: Quest | null, conversion: { min: number; max: number; label: string }[]) {
  const skillsUsed: Skill[] = quest ? [quest.skill] : [...SKILLS];
  const skills: SkillResult[] = skillsUsed.map((s) => skillResult(s, items));
  const overall = a.mode === 'exam' ? overallScore(skills) : null;
  const score = quest ? (skills[0]!.score ?? null) : overall;
  const passed = quest ? score !== null && score >= quest.passPercent : overall !== null;
  const pendingReview = items.some((r) => (r.skill === 'writing' || r.skill === 'speaking') && r.status !== 'assessed');
  return { skills, overall, score, passed, pendingReview, conversionLabel: a.mode === 'exam' ? convert(overall, conversion) : null };
}

/* ---------------- grading (lazy + background job) ---------------- */

async function gradeAi(deps: Deps, tenant: TenantDoc, a: AttemptDoc, items: Item[], aiAllowed: boolean) {
  const p = paths(deps.db);
  const writings = new Map((await p.writings(a.tenantId, a.id).get()).docs.map((d) => [d.id, d.data() as WritingDoc]));
  const results: ItemResult[] = [];
  const feedback: Record<string, ItemFeedback> = {};
  let removed = 0;
  let tried = 0;
  let ok = 0;
  const model = tenant.aiConfig.assessmentModel || tenant.aiConfig.model;
  const maxOutputTokens = tenant.quotas.maxOutputTokens;
  const usage = (kind: 'grade_writing' | 'grade_speaking', u: { inputTokens: number; outputTokens: number } | null, started: number) =>
    void recordUsage(deps, tenant, { kind, uid: a.uid, sessionId: a.id, courseId: a.courseId, model, ...(u ?? {}), ok: Boolean(u), latencyMs: Date.now() - started });

  for (const item of items) {
    if (item.skill === 'listening' || item.skill === 'reading') {
      results.push(objectiveResult(item, a));
    } else if (item.skill === 'writing') {
      const text = writings.get(item.id)?.text ?? '';
      let g: WritingGrade | null = null;
      if (aiAllowed && wordCount(text) >= 10) {
        tried++;
        const started = Date.now();
        try {
          const r = await withRetry(() => deps.ai.gradeWriting({ item, text, wordCount: wordCount(text), model, maxOutputTokens }), { retries: deps.config.aiMaxRetries, timeoutMs: deps.config.gradingTimeoutMs });
          const v = verifyWriting(text, r.output);
          g = v.grade;
          removed += v.removed;
          ok++;
          usage('grade_writing', r.usage, started);
        } catch (e) {
          console.error('writing grading failed', e);
          usage('grade_writing', null, started);
        }
      }
      if (g) feedback[item.id] = feedbackOf(g);
      results.push(writingResult(item, text, g, aiAllowed));
    } else {
      const parts = item.parts.map((pt) => {
        const t = a.state.speaking[takeKey(item.id, pt.id)];
        return { partId: pt.id, prompt: pt.prompt, keyPoints: pt.keyPoints, transcript: t?.status === 'transcribed' ? t.transcript : '', durationSeconds: t?.durationSeconds ?? 0 };
      });
      let g: SpeakingGrade | null = null;
      if (aiAllowed && parts.some((x) => x.transcript)) {
        tried++;
        const started = Date.now();
        try {
          const r = await withRetry(() => deps.ai.gradeSpeaking({ item, parts, model, maxOutputTokens }), { retries: deps.config.aiMaxRetries, timeoutMs: deps.config.gradingTimeoutMs });
          const v = verifySpeaking(parts.map((x) => x.transcript).join('\n'), r.output);
          g = v.grade;
          removed += v.removed;
          ok++;
          usage('grade_speaking', r.usage, started);
        } catch (e) {
          console.error('speaking grading failed', e);
          usage('grade_speaking', null, started);
        }
      }
      if (g) feedback[item.id] = feedbackOf(g);
      results.push(speakingResult(item, a, g, aiAllowed));
    }
  }
  const aiStatus: AssessmentDoc['aiStatus'] = tried === 0 ? (aiAllowed ? 'not_needed' : 'skipped') : ok === tried ? 'ok' : ok === 0 ? 'failed' : 'partial';
  return { results, feedback, removed, aiStatus, model };
}

/**
 * The first status check (or the background job) after submission claims the attempt and grades it; concurrent
 * checks see "grading". Rewards (XP, badges, streak) are given once – the assessment id is the attempt id.
 */
export async function ensureGraded(deps: Deps, tenantId: string, attemptId: string, opts: { force?: boolean } = {}): Promise<{ status: AttemptDoc['status'] }> {
  const p = paths(deps.db);
  const ref = p.attempt(tenantId, attemptId);
  const tenant = await getTenant(deps, tenantId);
  const claim = await deps.db.runTransaction(async (tx) => {
    const [aSnap, asSnap] = await Promise.all([tx.get(ref), tx.get(p.assessment(tenantId, attemptId))]);
    const a = aSnap.data() as AttemptDoc;
    if (asSnap.exists && !opts.force) return { status: a.status };
    const now = deps.now();
    const stale = a.status === 'grading' && (!a.lockSince || now.getTime() - new Date(a.lockSince).getTime() > GRADING_STALE_MS);
    if (!(a.status === 'submitted' || stale || (opts.force && a.status === 'graded'))) return { status: a.status };
    let aiAllowed = a.gradingAttempts < tenant.quotas.aiGradingsPerSubmission;
    if (aiAllowed) {
      const course = a.courseId ? ((await tx.get(p.course(tenantId, a.courseId))).data() as CourseDoc | undefined) : undefined;
      try {
        const q = await reserveAiCall(deps, tx, tenant, a.uid, a.courseId, course?.monthlyBudgetUsd ?? null);
        q.commit();
      } catch (e) {
        if (e instanceof ApiError && (e.code === 'QUOTA_EXCEEDED' || e.code === 'BUDGET_EXCEEDED')) aiAllowed = false;
        else throw e;
      }
    }
    tx.update(ref, { status: 'grading', lockId: 'grading', lockSince: now.toISOString(), gradingAttempts: a.gradingAttempts + 1 });
    return { status: 'claimed' as const, attempt: a, aiAllowed };
  });
  if (claim.status !== 'claimed') return { status: claim.status };

  const a = claim.attempt!;
  let graded: { doc: AssessmentDoc; gradedAt: string };
  try {
    const items = await attemptItems(deps, a);
    const { quest, exam } = await attemptRef(deps, a);
    const g = await gradeAi(deps, tenant, a, items, claim.aiAllowed!);
    const allQuests = (await listApproved(deps, tenantId, 'quest')).map((q) => q.content);

    graded = await deps.db.runTransaction(async (tx) => {
      const userRef = p.user(tenantId, a.uid);
      const aRef = p.assessment(tenantId, attemptId);
      const champRef = a.championshipId ? p.championship(tenantId, a.championshipId) : null;
      const entryRef = a.championshipId ? p.entry(tenantId, a.championshipId, a.uid) : null;
      const [uSnap, asSnap, cSnap, eSnap] = await Promise.all([tx.get(userRef), tx.get(aRef), champRef ? tx.get(champRef) : null, entryRef ? tx.get(entryRef) : null]);
      const user = uSnap.data() as UserDoc | undefined;
      const prev = asSnap.data() as AssessmentDoc | undefined;
      const review = prev?.teacherReview ?? null;
      const finalItems = applyReview(g.results, review);
      const sum = summarize(a, finalItems, quest, exam?.blueprint.conversion ?? []);
      const first = !prev;
      let xp = prev?.xpAwarded ?? 0;
      let newBadges = prev?.newBadges ?? [];
      const now = deps.now();

      if (user && first) {
        const streak = nextStreak(user.streak ?? { days: 0, lastDay: null }, now);
        const completed = new Set(user.completedQuestIds ?? []);
        const firstCompletion = Boolean(quest && sum.passed && !completed.has(quest.id));
        if (quest && sum.passed) completed.add(quest.id);
        const bestScores = { ...(user.bestScores ?? {}) };
        if (quest && sum.score !== null) bestScores[quest.id] = Math.max(bestScores[quest.id] ?? 0, sum.score);
        xp = quest ? questXp(quest.xpReward, sum.passed, firstCompletion, streak.days) : EXAM_XP;
        newBadges = earnedBadges(allQuests, [...completed], bestScores, streak.days, a.mode === 'exam' ? 1 : 0, user.badges ?? []);
        tx.update(userRef, { xp: (user.xp ?? 0) + xp, streak, completedQuestIds: [...completed], bestScores, badges: [...(user.badges ?? []), ...newBadges] });
      }

      const doc: AssessmentDoc = {
        id: attemptId,
        tenantId,
        uid: a.uid,
        mode: a.mode,
        refId: a.refId,
        title: a.title,
        level: a.level,
        championshipId: a.championshipId,
        courseId: a.courseId,
        items: finalItems,
        aiItems: g.results,
        feedback: g.feedback,
        ...sum,
        aiStatus: g.aiStatus,
        xpAwarded: xp,
        newBadges,
        versions: { rubric: RUBRIC_VERSION, prompt: PROMPT_VERSION, model: g.aiStatus === 'ok' || g.aiStatus === 'partial' ? `${deps.ai.name}:${g.model}` : 'none', content: a.versions },
        qualityChecks: { removedUnverifiableQuotes: g.removed },
        teacherReview: review,
        disclaimer: DISCLAIMER,
        createdAt: prev?.createdAt ?? now.toISOString(),
      };
      tx.set(aRef, doc);
      tx.update(ref, { status: 'graded', gradedAt: now.toISOString(), lockId: null, lockSince: null });
      if (champRef && entryRef && cSnap?.exists && user) {
        const c = cSnap.data() as ChampionshipDoc;
        // Only attempts submitted before the deadline count.
        if (a.submittedAt && a.submittedAt <= c.closesAt && !c.closedAt) tx.set(entryRef, nextEntry(eSnap?.data() as EntryDoc | undefined, c, user, a, doc, now));
      }
      return { doc, gradedAt: now.toISOString() };
    });
  } catch (e) {
    await ref.update({ status: 'submitted', lockId: null, lockSince: null }).catch(() => undefined);
    throw e;
  }
  // Every grading path (results page, background job, teacher regrade) ends here: report LMS-launched attempts.
  // Outside the try: the assessment is saved, so a sync problem must never reset the attempt (syncGrade never throws).
  await syncGrade(deps, tenantId, graded.doc, graded.gradedAt);
  return { status: 'graded' };
}

export function nextEntry(prev: EntryDoc | undefined, c: ChampionshipDoc, user: UserDoc, a: AttemptDoc, as: AssessmentDoc, now: Date): EntryDoc {
  const quests = { ...(prev?.quests ?? {}), [a.refId]: { attemptId: a.id, score: as.score, confirmed: !as.pendingReview, at: now.toISOString() } };
  const vals = Object.values(quests);
  return {
    uid: user.uid,
    name: user.displayName,
    courseId: prev?.courseId ?? user.courseIds.find((id) => c.courseIds.includes(id)) ?? null,
    teamId: prev?.teamId ?? c.teams.find((t) => t.memberUids.includes(user.uid))?.id ?? null,
    quests,
    points: vals.filter((v) => v.confirmed).reduce((n, v) => n + (v.score ?? 0), 0),
    provisionalPoints: vals.reduce((n, v) => n + (v.score ?? 0), 0),
    updatedAt: now.toISOString(),
  };
}

/* ---------------- results ---------------- */

export async function getResults(deps: Deps, m: Member, attemptId: string) {
  const p = paths(deps.db);
  let a = await loadAttempt(deps, m.tenantId, attemptId);
  const own = a.uid === m.uid;
  if (!own && !(await canViewStudent(deps, m, a.uid))) throw forbidden('You cannot view this result');
  if (a.mode === 'exam' && a.status === 'active') a = await tickClock(deps, a);
  if (a.status === 'active') throw new ApiError('SESSION_NOT_ACTIVE', 'This attempt has not been submitted yet');
  if (a.status === 'submitted' || a.status === 'grading') {
    try {
      await ensureGraded(deps, m.tenantId, attemptId);
    } catch (e) {
      console.error('grading failed', e);
    }
    a = await loadAttempt(deps, m.tenantId, attemptId);
  }
  if (a.status !== 'graded') return { status: a.status, assessment: null, items: [] };
  const as = (await p.assessment(m.tenantId, attemptId).get()).data() as AssessmentDoc;
  const items = await attemptItems(deps, a);
  const staff = !own;
  // Exams: answers only after the teacher releases them (teachers always see them).
  const policy = staff ? { mode: 'quest' as const, submitted: true } : { mode: a.mode, examAnswersReleased: a.answersReleased, submitted: true };
  const writings = new Map((await p.writings(m.tenantId, attemptId).get()).docs.map((d) => [d.id, d.data() as WritingDoc]));
  return {
    status: a.status,
    answersReleased: a.mode !== 'exam' || a.answersReleased,
    assessment: as,
    items: items.map((i) => {
      const v = itemView(i, a.state, policy);
      if (i.skill === 'writing') return { ...v, text: writings.get(i.id)?.text ?? '', wordCount: writings.get(i.id)?.wordCount ?? 0, ...(staff ? { keyPoints: i.keyPoints, sampleAnswer: i.sampleAnswer } : {}) };
      if (i.skill === 'speaking') {
        return {
          ...v,
          recordings: i.parts.map((pt) => {
            const t = a.state.speaking[takeKey(i.id, pt.id)];
            return { partId: pt.id, transcript: t?.transcript ?? '', durationSeconds: t?.durationSeconds ?? 0, audioUrl: t?.audioPath ? `/api/attempts/${a.id}/recordings/${i.id}/${pt.id}` : null };
          }),
          ...(staff ? { keyPoints: i.parts.map((pt) => ({ partId: pt.id, keyPoints: pt.keyPoints })), sampleAnswer: i.sampleAnswer } : {}),
        };
      }
      return v;
    }),
  };
}

export async function recordingAudio(deps: Deps, m: Member, attemptId: string, itemId: string, partId: string) {
  const a = await loadAttempt(deps, m.tenantId, attemptId);
  if (a.uid !== m.uid && !(await canViewStudent(deps, m, a.uid))) throw forbidden('You cannot listen to this recording');
  const t = a.state.speaking[takeKey(itemId, partId)];
  if (!t?.audioPath) throw notFound('Recording');
  const data = await deps.blobs.get(t.audioPath);
  if (!data) throw notFound('Recording (it may have been deleted after the retention period)');
  return data;
}

/** Teacher confirms or adjusts writing/speaking criteria (e.g. pronunciation). Updates progress and championships. */
export async function reviewAssessment(deps: Deps, m: Member, attemptId: string, input: { scores: Record<string, Record<string, number>>; comment: string }) {
  const p = paths(deps.db);
  const a = await loadAttempt(deps, m.tenantId, attemptId);
  if (!(await canViewStudent(deps, m, a.uid))) throw forbidden('You cannot review this student');
  const { quest, exam } = await attemptRef(deps, a);
  const allQuests = (await listApproved(deps, m.tenantId, 'quest')).map((q) => q.content);
  return deps.db.runTransaction(async (tx) => {
    const aRef = p.assessment(m.tenantId, attemptId);
    const userRef = p.user(m.tenantId, a.uid);
    const champRef = a.championshipId ? p.championship(m.tenantId, a.championshipId) : null;
    const entryRef = a.championshipId ? p.entry(m.tenantId, a.championshipId, a.uid) : null;
    const [asSnap, uSnap, cSnap, eSnap] = await Promise.all([tx.get(aRef), tx.get(userRef), champRef ? tx.get(champRef) : null, entryRef ? tx.get(entryRef) : null]);
    const as = asSnap.data() as AssessmentDoc | undefined;
    if (!as) throw notFound('Assessment');
    for (const [itemId, scores] of Object.entries(input.scores)) {
      const r = as.aiItems.find((x) => x.itemId === itemId);
      if (!r || (r.skill !== 'writing' && r.skill !== 'speaking')) throw new ApiError('VALIDATION', `Unknown writing/speaking item ${itemId}`);
      for (const [k, v] of Object.entries(scores)) {
        const c = (r.criteria as Record<string, CriterionScore>)[k];
        if (!c) throw new ApiError('VALIDATION', `Unknown criterion ${k}`);
        if (v < 0 || v > c.max) throw new ApiError('VALIDATION', `${k} must be between 0 and ${c.max}`);
      }
    }
    const merged: Record<string, Record<string, number>> = { ...(as.teacherReview?.scores ?? {}) };
    for (const [itemId, s] of Object.entries(input.scores)) merged[itemId] = { ...(merged[itemId] ?? {}), ...s };
    const changed = Object.entries(merged).some(([itemId, s]) => {
      const r = as.aiItems.find((x) => x.itemId === itemId) as Extract<ItemResult, { skill: 'writing' | 'speaking' }>;
      return Object.entries(s).some(([k, v]) => (r.criteria as Record<string, CriterionScore>)[k]?.score !== v);
    });
    const review: TeacherReview = { reviewerUid: m.uid, reviewerName: m.name, scores: merged, comment: input.comment, status: changed ? 'adjusted' : 'confirmed', reviewedAt: deps.now().toISOString() };
    const items = applyReview(as.aiItems, review);
    const sum = summarize(a, items, quest, exam?.blueprint.conversion ?? []);
    const user = uSnap.data() as UserDoc | undefined;
    let xpAwarded = as.xpAwarded;
    let newBadges = as.newBadges;
    if (user && quest) {
      const completed = new Set(user.completedQuestIds ?? []);
      const bestScores = { ...(user.bestScores ?? {}) };
      if (sum.score !== null) bestScores[quest.id] = Math.max(bestScores[quest.id] ?? 0, sum.score);
      const update: Partial<UserDoc> = { bestScores };
      if (sum.passed && !as.passed) {
        // Passing after review: top up the XP to a passed quest (+ first completion bonus).
        const firstCompletion = !completed.has(quest.id);
        completed.add(quest.id);
        const full = questXp(quest.xpReward, true, firstCompletion, user.streak?.days ?? 1);
        const extra = Math.max(0, full - as.xpAwarded);
        xpAwarded += extra;
        update.xp = (user.xp ?? 0) + extra;
        update.completedQuestIds = [...completed];
      }
      const badges = earnedBadges(allQuests, [...completed], bestScores, user.streak?.days ?? 0, 0, user.badges ?? []);
      if (badges.length) {
        update.badges = [...(user.badges ?? []), ...badges];
        newBadges = [...newBadges, ...badges];
      }
      tx.update(userRef, update);
    }
    const next: AssessmentDoc = { ...as, items, ...sum, teacherReview: review, xpAwarded, newBadges };
    tx.set(aRef, next);
    if (champRef && entryRef && cSnap?.exists && user) {
      const c = cSnap.data() as ChampionshipDoc;
      if (!c.closedAt) tx.set(entryRef, nextEntry(eSnap?.data() as EntryDoc | undefined, c, user, a, next, deps.now()));
    }
    return next;
  });
}

export async function releaseAnswers(deps: Deps, m: Member, attemptIds: string[]) {
  const p = paths(deps.db);
  let released = 0;
  for (const id of attemptIds) {
    const a = await loadAttempt(deps, m.tenantId, id);
    if (a.mode !== 'exam' || !(await canViewStudent(deps, m, a.uid))) continue;
    if (a.status !== 'graded' || a.answersReleased) continue;
    await p.attempt(m.tenantId, id).update({ answersReleased: true });
    released++;
  }
  return { released };
}
