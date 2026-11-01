import { randomUUID } from 'node:crypto';
import {
  AttemptError,
  answerKey,
  applyClock,
  closeSection,
  itemView,
  newAttempt,
  questBlockers,
  questStates,
  questSummary,
  questionsOf,
  recordAnswer,
  recordPlay,
  recordTake,
  recordWriting,
  secondsLeft,
  sourceText,
  startSection as engineStartSection,
  wordCount,
  type AttemptState,
  type SpeakingTake,
} from '@vq/game-engine';
import { isInappropriate, verifyExplanation } from '@vq/ai';
import type { AssignmentDoc, CourseDoc, Item, Quest, TenantDoc, UserDoc } from '@vq/shared';
import type { Member } from '../auth.js';
import type { Deps } from '../deps.js';
import { ApiError, forbidden, notFound } from '../errors.js';
import { paths } from '../paths.js';
import { recordUsage, reserveAiCall, reserveAttempt, reserveCounter } from '../quota.js';
import { parseWav } from '../speech/wav.js';
import { getTenant, getUserDoc } from '../tenants.js';
import type { AttemptDoc, ChampionshipDoc, ExplanationDoc, WritingDoc } from '../types.js';
import { getApproved, getVersion, listApproved, type ExamContent } from './content.js';
import { withRetry } from './retry.js';

const LOCK_STALE_MS = 90_000;

export function engineToApi(e: unknown): never {
  if (e instanceof AttemptError) throw new ApiError(e.code, e.message);
  throw e;
}

/* ---------------- loading ---------------- */

export async function loadAttempt(deps: Deps, tenantId: string, id: string): Promise<AttemptDoc> {
  const a = (await paths(deps.db).attempt(tenantId, id).get()).data() as AttemptDoc | undefined;
  if (!a) throw notFound('Attempt');
  return a;
}

async function loadOwnAttempt(deps: Deps, m: Member, id: string): Promise<AttemptDoc> {
  const a = await loadAttempt(deps, m.tenantId, id);
  if (a.uid !== m.uid) throw forbidden('This is not your attempt');
  return a;
}

/** Items of an attempt, in order, at the versions frozen when the attempt started. */
export async function attemptItems(deps: Deps, a: Pick<AttemptDoc, 'tenantId' | 'itemIds' | 'versions'>): Promise<Item[]> {
  return Promise.all(a.itemIds.map(async (id) => (await getVersion(deps, a.tenantId, 'item', id, a.versions.items[id]!)).content));
}

export async function attemptRef(deps: Deps, a: AttemptDoc): Promise<{ quest: Quest | null; exam: ExamContent | null }> {
  if (a.mode === 'exam') return { quest: null, exam: (await getVersion(deps, a.tenantId, 'exam', a.refId, a.versions.ref)).content };
  return { quest: (await getVersion(deps, a.tenantId, 'quest', a.refId, a.versions.ref)).content, exam: null };
}

/* ---------------- availability ---------------- */

export async function assignmentsFor(deps: Deps, tenantId: string, user: UserDoc): Promise<AssignmentDoc[]> {
  if (!user.courseIds.length) return [];
  const out: AssignmentDoc[] = [];
  for (let i = 0; i < user.courseIds.length; i += 30) {
    const snap = await paths(deps.db).assignments(tenantId).where('courseId', 'in', user.courseIds.slice(i, i + 30)).get();
    out.push(...snap.docs.map((d) => d.data() as AssignmentDoc));
  }
  return out.sort((a, b) => a.order - b.order);
}

export function championshipStatus(c: ChampionshipDoc, now: Date): ChampionshipDoc['status'] {
  if (c.closedAt || now.getTime() >= new Date(c.closesAt).getTime()) return 'closed';
  if (now.getTime() < new Date(c.opensAt).getTime()) return 'scheduled';
  return 'open';
}

export function inChampionship(c: ChampionshipDoc, user: Pick<UserDoc, 'uid' | 'courseIds'>): boolean {
  if (c.type === 'team' && c.teams.length) return c.teams.some((t) => t.memberUids.includes(user.uid));
  return c.courseIds.length === 0 || c.courseIds.some((id) => user.courseIds.includes(id));
}

/* ---------------- view ---------------- */

export async function buildView(deps: Deps, a: AttemptDoc, items?: Item[]) {
  const now = deps.now();
  const list = items ?? (await attemptItems(deps, a));
  const { quest, exam } = await attemptRef(deps, a);
  const submitted = a.status !== 'active';
  const policy = { mode: a.mode, examAnswersReleased: a.answersReleased, submitted };
  const writings = await paths(deps.db).writings(a.tenantId, a.id).get();
  const drafts = new Map(writings.docs.map((d) => [d.id, d.data() as WritingDoc]));
  // Exams only show the current section's items while running.
  const cur = a.state.sections[a.state.currentSection];
  const visible = a.mode === 'exam' && !submitted ? list.filter((i) => cur?.startedAt && i.skill === cur.skill) : list;
  const explained = new Set(a.state.explained);
  return {
    attempt: {
      id: a.id,
      mode: a.mode,
      refId: a.refId,
      title: a.title,
      level: a.level,
      status: a.status,
      championshipId: a.championshipId,
      helpAllowed: a.helpAllowed && !submitted,
      startedAt: a.startedAt,
      submittedAt: a.submittedAt,
      serverNow: now.toISOString(),
      sections: a.state.sections.map((s, i) => ({ ...s, current: i === a.state.currentSection })),
      currentSection: a.state.currentSection,
      secondsLeft: secondsLeft(a.state, now),
      blockers: a.mode === 'exam' || submitted ? [] : questBlockers(list, a.state),
    },
    quest: quest ? questSummary(quest) : null,
    exam: exam ? { id: exam.exam.id, title: exam.exam.title, disclaimer: exam.exam.disclaimer, sections: exam.exam.sections.map((s) => ({ skill: s.skill, timeMinutes: s.timeMinutes, items: s.itemIds.length })) } : null,
    challenges: quest ? quest.challenges.map((c) => ({ id: c.id, title: c.title, itemId: c.itemId })) : [],
    items: visible.map((i) => {
      const v = itemView(i, a.state, policy);
      const draft = drafts.get(i.id);
      return {
        ...v,
        ...(i.skill === 'writing' ? { draft: draft ? { text: draft.text, version: draft.version, wordCount: draft.wordCount, updatedAt: draft.updatedAt } : { text: '', version: 0, wordCount: 0, updatedAt: null } } : {}),
        ...(i.skill === 'listening' || i.skill === 'reading' ? { explained: i.questions.filter((q) => explained.has(answerKey(i.id, q.id))).map((q) => q.id) } : {}),
      };
    }),
  };
}

export async function getAttempt(deps: Deps, m: Member, id: string) {
  let a = await loadOwnAttempt(deps, m, id);
  if (a.mode === 'exam' && a.status === 'active') a = await tickClock(deps, a);
  return buildView(deps, a);
}

/** Applies exam timeouts; when the last section's time is up, the exam is submitted automatically. */
export async function tickClock(deps: Deps, a0: AttemptDoc): Promise<AttemptDoc> {
  const ref = paths(deps.db).attempt(a0.tenantId, a0.id);
  return deps.db.runTransaction(async (tx) => {
    const a = (await tx.get(ref)).data() as AttemptDoc;
    if (a.status !== 'active' || a.mode !== 'exam') return a;
    const c = applyClock(a.state, deps.now());
    if (!c.changed) return a;
    const now = deps.now().toISOString();
    const next: AttemptDoc = { ...a, state: c.state, ...(c.finished ? { status: 'submitted', submittedAt: now } : {}) };
    tx.set(ref, next);
    return next;
  });
}

/* ---------------- start ---------------- */

async function resolveAssignment(deps: Deps, m: Member, assignmentId: string | undefined, kind: 'quest' | 'exam', refId: string) {
  if (!assignmentId) return { courseId: null, assignmentId: null };
  const p = paths(deps.db);
  const a = (await p.assignments(m.tenantId).doc(assignmentId).get()).data() as AssignmentDoc | undefined;
  if (!a || a.kind !== kind || a.refId !== refId) throw notFound('Assignment');
  const c = (await p.course(m.tenantId, a.courseId).get()).data() as CourseDoc | undefined;
  if (!c || !c.studentIds.includes(m.uid)) throw forbidden('You are not in this class');
  return { courseId: a.courseId, assignmentId: a.id };
}

function newDoc(m: Member, fields: Omit<AttemptDoc, 'id' | 'tenantId' | 'uid' | 'status' | 'startedAt' | 'lastActivityAt' | 'submittedAt' | 'gradedAt' | 'lockId' | 'lockSince' | 'gradingAttempts' | 'answersReleased'>, now: Date): AttemptDoc {
  return {
    id: randomUUID(),
    tenantId: m.tenantId,
    uid: m.uid,
    status: 'active',
    startedAt: now.toISOString(),
    lastActivityAt: now.toISOString(),
    submittedAt: null,
    gradedAt: null,
    lockId: null,
    lockSince: null,
    gradingAttempts: 0,
    answersReleased: false,
    ...fields,
  };
}

async function freezeItems(deps: Deps, tenantId: string, itemIds: string[]) {
  const versions: Record<string, number> = {};
  for (const id of itemIds) versions[id] = (await getApproved(deps, tenantId, 'item', id)).version;
  return versions;
}

export async function startQuest(deps: Deps, m: Member, input: { questId: string; assignmentId?: string; championshipId?: string; restart?: boolean }) {
  const p = paths(deps.db);
  const tenant = await getTenant(deps, m.tenantId);
  const user = await getUserDoc(deps, m.tenantId, m.uid);
  if (!user) throw new ApiError('NOT_PROVISIONED', 'Open the home page first to create your profile');
  const { content: quest, version } = await getApproved(deps, m.tenantId, 'quest', input.questId);

  let championship: ChampionshipDoc | null = null;
  let replaced: string | null = null;
  if (input.championshipId) {
    championship = ((await p.championship(m.tenantId, input.championshipId).get()).data() as ChampionshipDoc | undefined) ?? null;
    if (!championship) throw notFound('Championship');
    if (championshipStatus(championship, deps.now()) !== 'open') throw new ApiError('CHAMPIONSHIP_CLOSED', 'This championship is not open');
    if (!inChampionship(championship, user)) throw forbidden('You are not taking part in this championship');
    if (!championship.questIds.includes(quest.id)) throw notFound('Championship quest');
    // One official attempt per quest per championship.
    const prev = await p.attempts(m.tenantId).where('uid', '==', m.uid).where('championshipId', '==', championship.id).where('refId', '==', quest.id).limit(1).get();
    if (!prev.empty) return { resumed: true, ...(await getAttempt(deps, m, prev.docs[0]!.id)) };
  } else {
    const assigned = (await assignmentsFor(deps, m.tenantId, user)).filter((a) => a.kind === 'quest').map((a) => a.refId);
    const all = (await listApproved(deps, m.tenantId, 'quest')).map((q) => q.content);
    const st = questStates(all, user.completedQuestIds, assigned).find((s) => s.id === quest.id);
    if (st?.state === 'locked') throw new ApiError('LOCKED', `Complete ${st.missing.join(', ')} first to unlock this quest`);
    const existing = await p.attempts(m.tenantId).where('uid', '==', m.uid).where('refId', '==', quest.id).where('status', '==', 'active').limit(5).get();
    const own = existing.docs.map((d) => d.data() as AttemptDoc).find((a) => a.mode === 'quest');
    if (own && !input.restart) return { resumed: true, ...(await getAttempt(deps, m, own.id)) };
    replaced = own?.id ?? null;
  }

  const { courseId, assignmentId } = championship ? { courseId: user.courseIds.find((c) => championship!.courseIds.includes(c)) ?? null, assignmentId: null } : await resolveAssignment(deps, m, input.assignmentId, 'quest', quest.id);
  const itemIds = quest.challenges.map((c) => c.itemId);
  const items = await freezeItems(deps, m.tenantId, itemIds);
  const doc = newDoc(
    m,
    {
      mode: championship ? 'championship' : 'quest',
      refId: quest.id,
      championshipId: championship?.id ?? null,
      courseId,
      assignmentId,
      level: quest.level,
      title: quest.title.en,
      versions: { ref: version, items },
      itemIds,
      state: newAttempt(),
      helpAllowed: championship ? championship.allowHelp : true,
    },
    deps.now(),
  );
  await deps.db.runTransaction(async (tx) => {
    // Quota first: a refused restart must not abandon the running attempt.
    const commit = await reserveAttempt(deps, tx, tenant, m.uid, quest.id);
    commit();
    if (replaced) tx.update(p.attempt(m.tenantId, replaced), { status: 'abandoned', lastActivityAt: deps.now().toISOString() });
    tx.create(p.attempt(m.tenantId, doc.id), doc);
  });
  return { resumed: false, ...(await buildView(deps, doc)) };
}

export async function startExam(deps: Deps, m: Member, input: { examId: string; assignmentId?: string }) {
  const p = paths(deps.db);
  const tenant = await getTenant(deps, m.tenantId);
  const { content, version } = await getApproved(deps, m.tenantId, 'exam', input.examId);
  const existing = await p.attempts(m.tenantId).where('uid', '==', m.uid).where('status', '==', 'active').get();
  const running = existing.docs.map((d) => d.data() as AttemptDoc).find((a) => a.mode === 'exam');
  if (running) {
    if (running.refId === content.exam.id) return { resumed: true, ...(await getAttempt(deps, m, running.id)) };
    throw new ApiError('CONFLICT', 'Finish your other mock exam first');
  }
  const { courseId, assignmentId } = await resolveAssignment(deps, m, input.assignmentId, 'exam', content.exam.id);
  const itemIds = content.exam.sections.flatMap((s) => s.itemIds);
  const items = await freezeItems(deps, m.tenantId, itemIds);
  const doc = newDoc(
    m,
    {
      mode: 'exam',
      refId: content.exam.id,
      championshipId: null,
      courseId,
      assignmentId,
      level: content.exam.level,
      title: content.exam.title.en,
      versions: { ref: version, items },
      itemIds,
      state: newAttempt(content.exam.sections.map((s) => ({ skill: s.skill, timeMinutes: s.timeMinutes }))),
      helpAllowed: false,
    },
    deps.now(),
  );
  await deps.db.runTransaction(async (tx) => {
    const commit = await reserveCounter(deps, tx, tenant, m.uid, 'mockExams', tenant.quotas.mockExamsPerStudentPerMonth, 'ATTEMPT_LIMIT');
    commit();
    tx.create(p.attempt(m.tenantId, doc.id), doc);
  });
  return { resumed: false, ...(await buildView(deps, doc)) };
}

/* ---------------- deterministic actions ---------------- */

/**
 * Runs one engine action in a transaction. For exams the server clock is applied first; a timeout is saved even
 * when the action itself is refused (TIME_UP).
 */
async function mutate<T>(deps: Deps, m: Member, id: string, fn: (a: AttemptDoc, items: Map<string, Item>) => { state: AttemptState; result?: T; status?: AttemptDoc['status'] }) {
  const ref = paths(deps.db).attempt(m.tenantId, id);
  const a0 = await loadOwnAttempt(deps, m, id);
  const list = await attemptItems(deps, a0);
  const items = new Map(list.map((i) => [i.id, i]));
  let result: T | undefined;
  let failure: unknown = null;
  const next = await deps.db.runTransaction(async (tx) => {
    failure = null;
    const a = (await tx.get(ref)).data() as AttemptDoc;
    if (a.status !== 'active') throw new ApiError('SESSION_NOT_ACTIVE', 'This attempt has already been submitted');
    const now = deps.now();
    let cur = a;
    if (a.mode === 'exam') {
      const c = applyClock(a.state, now);
      if (c.changed) cur = { ...a, state: c.state, ...(c.finished ? { status: 'submitted' as const, submittedAt: now.toISOString() } : {}) };
    }
    if (cur.status === 'active') {
      try {
        const out = fn(cur, items);
        result = out.result;
        cur = { ...cur, state: out.state, ...(out.status ? { status: out.status, submittedAt: out.status === 'submitted' ? now.toISOString() : cur.submittedAt } : {}) };
      } catch (e) {
        if (cur === a) throw e;
        failure = e;
      }
    } else failure = new ApiError('TIME_UP', 'Time is up: the exam has been submitted');
    cur = { ...cur, lastActivityAt: now.toISOString() };
    tx.set(ref, cur);
    return cur;
  });
  if (failure) engineToApi(failure);
  return { result, view: await buildView(deps, next, list) };
}

const itemOf = (items: Map<string, Item>, id: string) => {
  const i = items.get(id);
  if (!i) throw new ApiError('NOT_FOUND', 'Item not in this attempt');
  return i;
};

export const answer = (deps: Deps, m: Member, id: string, itemId: string, questionId: string, value: number | string) =>
  mutate(deps, m, id, (a, items) => {
    try {
      const r = recordAnswer(a.state, itemOf(items, itemId), questionId, value, a.mode, deps.now());
      return { state: r.state, result: a.mode === 'exam' ? { saved: true } : { saved: true, correct: r.record.correct } };
    } catch (e) {
      return engineToApi(e);
    }
  });

export const startSection = (deps: Deps, m: Member, id: string) =>
  mutate(deps, m, id, (a) => {
    if (a.mode !== 'exam') throw new ApiError('VALIDATION', 'Only mock exams have sections');
    try {
      return { state: engineStartSection(a.state, deps.now()) };
    } catch (e) {
      return engineToApi(e);
    }
  });

export const nextSection = (deps: Deps, m: Member, id: string) =>
  mutate(deps, m, id, (a) => {
    if (a.mode !== 'exam') throw new ApiError('VALIDATION', 'Only mock exams have sections');
    const state = closeSection(a.state, deps.now());
    return { state, status: state.currentSection >= state.sections.length ? 'submitted' : undefined };
  });

/* ---------------- listening audio ---------------- */

export async function play(deps: Deps, m: Member, id: string, itemId: string) {
  const a0 = await loadOwnAttempt(deps, m, id);
  if (!a0.itemIds.includes(itemId)) throw notFound('Item');
  const v = await getVersion(deps, m.tenantId, 'item', itemId, a0.versions.items[itemId]!);
  const item = v.content;
  if (item.skill !== 'listening') throw new ApiError('VALIDATION', 'Not a listening item');
  const rendered = Boolean(v.audio?.rendered);
  // Never spend a play when there is nothing to play (production always renders audio on approval).
  if (!rendered && deps.config.env === 'production') throw new ApiError('INTERNAL', 'The audio for this recording is not ready. Please tell your teacher.');
  const r = await mutate(deps, m, id, (a, items) => {
    try {
      const out = recordPlay(a.state, itemOf(items, itemId), a.mode, deps.now());
      return { state: out.state, result: out.playsLeft };
    } catch (e) {
      return engineToApi(e);
    }
  });
  const speakerOf = (i: number) => item.script.speakers.find((s) => s.id === item.script.lines[i]!.speaker)!;
  return {
    playsLeft: r.result,
    audio: rendered
      ? { kind: 'segments' as const, segments: v.audio!.segments.map((s) => ({ index: s.index, url: `/api/attempts/${id}/audio/${itemId}/${s.index}`, seconds: s.seconds })) }
      : // Development only: no TTS available, the browser reads the script aloud.
        { kind: 'browser_tts' as const, lines: item.script.lines.map((l, i) => ({ text: l.text, voice: speakerOf(i).voice })) },
  };
}

export async function audioSegment(deps: Deps, m: Member, id: string, itemId: string, index: number) {
  const a = await loadAttempt(deps, m.tenantId, id);
  const own = a.uid === m.uid;
  if (!own && m.role === 'student') throw forbidden('This is not your attempt');
  if (!a.itemIds.includes(itemId)) throw notFound('Item');
  if (own && a.status === 'active' && !(a.state.plays[itemId] ?? 0)) throw new ApiError('PLAY_LIMIT', 'Press play first');
  const v = await getVersion(deps, m.tenantId, 'item', itemId, a.versions.items[itemId]!);
  const seg = v.audio?.segments.find((s) => s.index === index);
  if (!seg) throw notFound('Audio');
  const data = await deps.blobs.get(seg.path);
  if (!data) throw notFound('Audio');
  return data;
}

/* ---------------- writing ---------------- */

/** Autosaves a writing answer; `baseVersion` must match (prevents overwriting a newer draft from another tab). */
export async function saveWriting(deps: Deps, m: Member, id: string, itemId: string, text: string, baseVersion: number) {
  const p = paths(deps.db);
  const a0 = await loadOwnAttempt(deps, m, id);
  if (!a0.itemIds.includes(itemId)) throw notFound('Item');
  const item = (await getVersion(deps, m.tenantId, 'item', itemId, a0.versions.items[itemId]!)).content;
  if (item.skill !== 'writing') throw new ApiError('VALIDATION', 'Not a writing item');
  const clean = text.slice(0, 6000);
  return deps.db.runTransaction(async (tx) => {
    const ref = p.attempt(m.tenantId, id);
    const [aSnap, dSnap] = await Promise.all([tx.get(ref), tx.get(p.writing(m.tenantId, id, itemId))]);
    const a = aSnap.data() as AttemptDoc;
    if (a.status !== 'active') throw new ApiError('SESSION_NOT_ACTIVE', 'This attempt has already been submitted');
    const now = deps.now();
    if (a.mode === 'exam') {
      const c = applyClock(a.state, now);
      if (c.changed) {
        tx.set(ref, { ...a, state: c.state, ...(c.finished ? { status: 'submitted', submittedAt: now.toISOString() } : {}) });
        return { error: new ApiError('TIME_UP', 'Time is up for the writing section') };
      }
    }
    const cur = dSnap.data() as WritingDoc | undefined;
    const curVersion = cur?.version ?? 0;
    if (baseVersion !== curVersion) {
      if (cur && cur.text === clean) return { doc: cur };
      throw new ApiError('DRAFT_CONFLICT', 'A newer version of your answer exists (another tab or device).', { current: cur });
    }
    let state: AttemptState;
    try {
      state = recordWriting(a.state, item, clean, curVersion + 1, now);
    } catch (e) {
      return engineToApi(e);
    }
    const doc: WritingDoc = { itemId, text: clean, version: curVersion + 1, wordCount: wordCount(clean), updatedAt: now.toISOString() };
    tx.set(p.writing(m.tenantId, id, itemId), doc);
    tx.update(ref, { state, lastActivityAt: doc.updatedAt });
    return { doc };
  }).then((r) => {
    if ('error' in r && r.error) throw r.error;
    return (r as { doc: WritingDoc }).doc;
  });
}

/* ---------------- speaking ---------------- */

export const recordingPath = (tenantId: string, uid: string, attemptId: string, itemId: string, partId: string) =>
  `tenants/${tenantId}/recordings/${uid}/${attemptId}/${itemId}_${partId}.wav`;

export async function uploadSpeaking(deps: Deps, m: Member, id: string, itemId: string, partId: string, audio: Buffer) {
  const p = paths(deps.db);
  const tenant = await getTenant(deps, m.tenantId);
  const user = await getUserDoc(deps, m.tenantId, m.uid);
  if (!user?.recordingConsentAt) throw new ApiError('CONSENT_REQUIRED', 'Please agree to the recording notice first');
  const a0 = await loadOwnAttempt(deps, m, id);
  if (a0.status !== 'active') throw new ApiError('SESSION_NOT_ACTIVE', 'This attempt has already been submitted');
  if (!a0.itemIds.includes(itemId)) throw notFound('Item');
  const item = (await getVersion(deps, m.tenantId, 'item', itemId, a0.versions.items[itemId]!)).content;
  if (item.skill !== 'speaking') throw new ApiError('VALIDATION', 'Not a speaking item');
  const part = item.parts.find((x) => x.id === partId);
  if (!part) throw notFound('Speaking part');

  let wav;
  try {
    wav = parseWav(audio);
  } catch (e) {
    throw new ApiError('VALIDATION', `Invalid recording: ${(e as Error).message}`);
  }
  const maxSeconds = Math.min(tenant.quotas.maxRecordSeconds, part.speakSeconds + 15);
  if (wav.durationSeconds > maxSeconds) throw new ApiError('AUDIO_TOO_LONG', `Recordings can be at most ${maxSeconds} seconds`);

  // Section check before spending STT (final check again in the transaction).
  if (a0.mode === 'exam') {
    const c = applyClock(a0.state, deps.now());
    const sec = c.state.sections[c.state.currentSection];
    if (c.changed || sec?.skill !== 'speaking' || !sec.startedAt) {
      if (c.changed) await tickClock(deps, a0);
      throw new ApiError('TIME_UP', 'The speaking section is not open');
    }
  }
  const course = a0.courseId ? ((await p.course(m.tenantId, a0.courseId).get()).data() as CourseDoc | undefined) : undefined;
  await deps.db.runTransaction(async (tx) => {
    const q = await reserveAiCall(deps, tx, tenant, m.uid, a0.courseId, course?.monthlyBudgetUsd ?? null);
    q.commit();
  });

  const started = Date.now();
  let stt;
  try {
    stt = await withRetry(() => deps.stt.recognize(wav, { scriptedLine: devLine(item, partId), phraseHints: part.keyPoints.flatMap((k) => k.split(/[,;]/)).slice(0, 20) }), {
      retries: deps.config.aiMaxRetries,
      timeoutMs: deps.config.aiTimeoutMs,
    });
  } catch (e) {
    void recordUsage(deps, tenant, { kind: 'stt', uid: m.uid, sessionId: id, courseId: a0.courseId, sttSeconds: Math.ceil(wav.durationSeconds), ok: false, latencyMs: Date.now() - started });
    throw new ApiError('INTERNAL', 'Speech recognition is not available right now. Please try again.', { cause: (e as Error).message });
  }
  void recordUsage(deps, tenant, { kind: 'stt', uid: m.uid, sessionId: id, courseId: a0.courseId, sttSeconds: stt.billedSeconds, ok: true, latencyMs: Date.now() - started });
  if (stt.transcript && isInappropriate(stt.transcript)) throw new ApiError('CONTENT_BLOCKED', 'Please keep your answer appropriate for a classroom.');

  const path = recordingPath(m.tenantId, m.uid, id, itemId, partId);
  await deps.blobs.put(path, audio, 'audio/wav');
  const unclear = !stt.transcript.trim() || stt.confidence < 0.3;
  const take: SpeakingTake = {
    status: unclear ? 'unclear' : 'transcribed',
    audioPath: path,
    transcript: stt.transcript.slice(0, 4000),
    confidence: stt.confidence,
    durationSeconds: Math.round(wav.durationSeconds * 10) / 10,
    metrics: { words: stt.metrics.words, speechSeconds: stt.metrics.speechSeconds, longPauses: stt.metrics.longPauses },
    at: deps.now().toISOString(),
  };
  const r = await mutate(deps, m, id, (a, items) => {
    try {
      return { state: recordTake(a.state, itemOf(items, itemId), partId, take, deps.now()) };
    } catch (e) {
      return engineToApi(e);
    }
  });
  return { take: { status: take.status, transcript: take.transcript, durationSeconds: take.durationSeconds, at: take.at }, unclear, view: r.view };
}

/** Offline STT line for development: a slice of the sample answer, so the fake grader has something to grade. */
function devLine(item: Extract<Item, { skill: 'speaking' }>, partId: string): string {
  const idx = Math.max(0, item.parts.findIndex((p) => p.id === partId));
  const words = item.sampleAnswer.split(/\s+/);
  const size = Math.ceil(words.length / item.parts.length);
  return words.slice(idx * size, idx * size + size).join(' ');
}

/* ---------------- submit ---------------- */

export async function submit(deps: Deps, m: Member, id: string) {
  const a0 = await loadOwnAttempt(deps, m, id);
  const items = await attemptItems(deps, a0);
  const ref = paths(deps.db).attempt(m.tenantId, id);
  const out = await deps.db.runTransaction(async (tx) => {
    const a = (await tx.get(ref)).data() as AttemptDoc;
    if (a.status !== 'active') return a; // idempotent
    if (a.mode !== 'exam') {
      const blockers = questBlockers(items, a.state);
      if (blockers.length) throw new ApiError('NOT_READY_TO_SUBMIT', 'Finish every challenge first', { blockers });
    }
    const now = deps.now().toISOString();
    let state = a.state;
    while (a.mode === 'exam' && state.currentSection < state.sections.length) state = closeSection(state, deps.now());
    const next: AttemptDoc = { ...a, state, status: 'submitted', submittedAt: now, lastActivityAt: now };
    tx.set(ref, next);
    return next;
  });
  return { status: out.status, submittedAt: out.submittedAt };
}

/* ---------------- AI explainer (Quest Mode) ---------------- */

const correctText = (q: ReturnType<typeof questionsOf>[number]) => (q.type === 'mcq' ? q.options[q.correctIndex]! : q.type === 'tfng' ? q.answer.replace('_', ' ') : q.acceptable[0]!);
const studentText = (q: ReturnType<typeof questionsOf>[number], v: number | string) => (q.type === 'mcq' ? (q.options[v as number] ?? String(v)) : String(v).replace('_', ' '));

export async function explain(deps: Deps, m: Member, id: string, itemId: string, questionId: string) {
  const p = paths(deps.db);
  const tenant = await getTenant(deps, m.tenantId);
  const a0 = await loadOwnAttempt(deps, m, id);
  if (!a0.helpAllowed) throw new ApiError('HELP_DISABLED', 'Explanations are not available in this mode');
  if (!a0.itemIds.includes(itemId)) throw notFound('Item');
  const item = (await getVersion(deps, m.tenantId, 'item', itemId, a0.versions.items[itemId]!)).content;
  const q = questionsOf(item).find((x) => x.id === questionId);
  if (!q) throw notFound('Question');
  const key = answerKey(itemId, questionId);
  const ans = a0.state.answers[key];
  if (!ans) throw new ApiError('VALIDATION', 'Answer the question first');
  const eRef = p.explanation(m.tenantId, id, key);
  const course = a0.courseId ? ((await p.course(m.tenantId, a0.courseId).get()).data() as CourseDoc | undefined) : undefined;

  const claim = await deps.db.runTransaction(async (tx) => {
    const ex = (await tx.get(eRef)).data() as ExplanationDoc | undefined;
    if (ex?.status === 'done') return { cached: ex };
    if (ex?.status === 'processing' && deps.now().getTime() - new Date(ex.createdAt).getTime() < LOCK_STALE_MS) throw new ApiError('REQUEST_IN_PROGRESS', 'The explanation is being prepared');
    const c1 = await reserveCounter(deps, tx, tenant, m.uid, 'explanations', tenant.quotas.explanationsPerStudentPerDay, 'EXPLANATION_LIMIT');
    const c2 = await reserveAiCall(deps, tx, tenant, m.uid, a0.courseId, course?.monthlyBudgetUsd ?? null);
    c1();
    c2.commit();
    tx.set(eRef, { key, status: 'processing', createdAt: deps.now().toISOString() });
    return { cached: null };
  });
  if (claim.cached) return explanationView(claim.cached);

  const source = sourceText(item);
  const model = tenant.aiConfig.model;
  const started = Date.now();
  let doc: ExplanationDoc;
  try {
    const r = await withRetry(
      () =>
        deps.ai.explain({ item, sourceText: source, question: q, correctAnswer: correctText(q), studentAnswer: studentText(q, ans.value), isCorrect: ans.correct, model, maxOutputTokens: Math.min(1024, tenant.quotas.maxOutputTokens) }),
      { retries: deps.config.aiMaxRetries, timeoutMs: deps.config.aiTimeoutMs },
    );
    void recordUsage(deps, tenant, { kind: 'explain', uid: m.uid, sessionId: id, courseId: a0.courseId, model, ...r.usage, ok: true, latencyMs: Date.now() - started });
    const o = verifyExplanation(source, q.evidence, r.output);
    doc = { key, status: 'done', source: 'ai', explanation: o.explanation, whyStudentAnswer: o.whyStudentAnswer, quote: o.quote, vocabulary: o.vocabulary, tip: o.tip, createdAt: deps.now().toISOString() };
  } catch (e) {
    console.error('explain failed', e);
    void recordUsage(deps, tenant, { kind: 'explain', uid: m.uid, sessionId: id, courseId: a0.courseId, model, ok: false, latencyMs: Date.now() - started });
    // Fallback: the teacher-approved explanation and evidence.
    doc = { key, status: 'done', source: 'teacher_note', explanation: q.explanation, whyStudentAnswer: '', quote: q.evidence, vocabulary: [], tip: '', createdAt: deps.now().toISOString() };
  }
  await eRef.set(doc);
  await deps.db.runTransaction(async (tx) => {
    const ref = p.attempt(m.tenantId, id);
    const a = (await tx.get(ref)).data() as AttemptDoc;
    if (!a.state.explained.includes(key)) tx.update(ref, { 'state.explained': [...a.state.explained, key] });
  });
  return explanationView(doc);
}

const explanationView = (d: ExplanationDoc) => ({
  source: d.source,
  explanation: d.explanation,
  whyStudentAnswer: d.whyStudentAnswer,
  quote: d.quote,
  vocabulary: d.vocabulary,
  tip: d.tip,
});

/* ---------------- history ---------------- */

export async function myAttempts(deps: Deps, m: Member) {
  const snap = await paths(deps.db).attempts(m.tenantId).where('uid', '==', m.uid).orderBy('startedAt', 'desc').limit(50).get();
  return snap.docs.map((d) => {
    const a = d.data() as AttemptDoc;
    return { id: a.id, mode: a.mode, refId: a.refId, title: a.title, status: a.status, championshipId: a.championshipId, startedAt: a.startedAt, submittedAt: a.submittedAt, gradedAt: a.gradedAt };
  });
}

export type { TenantDoc };
