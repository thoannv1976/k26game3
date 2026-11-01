import { beforeAll, describe, expect, it } from 'vitest';
import { BUILTIN_ITEMS, questionsOf } from '@vq/game-engine';
import type { Item, ObjectiveQuestion } from '@vq/shared';
import { api, createCourse, createTenant, createUser, makeApp, upload, uuid, wav, type TestCtx, type TestUser } from '../helpers.js';

const item = (id: string) => BUILTIN_ITEMS.find((i) => i.id === id)! as Item;
const right = (q: ObjectiveQuestion) => (q.type === 'mcq' ? q.correctIndex : q.type === 'tfng' ? q.answer : q.acceptable[0]!);
const wrong = (q: ObjectiveQuestion) => (q.type === 'mcq' ? (q.correctIndex + 1) % q.options.length : q.type === 'tfng' ? (q.answer === 'true' ? 'false' : 'true') : 'zzzz');

async function answerAll(ctx: TestCtx, u: TestUser, attemptId: string, itemIds: string[], pick = right) {
  for (const id of itemIds) for (const q of questionsOf(item(id))) {
    const r = await api(ctx, u, 'POST', `/api/attempts/${attemptId}/answers`, { itemId: id, questionId: q.id, value: pick(q) });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
  }
}

const essay = (n: number) =>
  Array.from({ length: n }, (_, i) => ['I', 'think', 'that', 'students', 'should', 'plan', 'their', 'time', 'carefully', 'because'][i % 10]).join(' ') + '.';

let ctx: TestCtx;
let tenantId: string;
let student: TestUser;
let other: TestUser;
let teacher: TestUser;
let courseId: string;

beforeAll(async () => {
  ctx = await makeApp();
  tenantId = (await createTenant(ctx.deps)).id;
  student = await createUser(ctx.deps, tenantId, 'student');
  other = await createUser(ctx.deps, tenantId, 'student');
  teacher = await createUser(ctx.deps, tenantId, 'teacher');
  courseId = await createCourse(ctx.deps, tenantId, [teacher.uid], [student.uid, other.uid]);
  for (const u of [student, other, teacher]) expect((await api(ctx, u, 'GET', '/api/me')).status).toBe(200);
});

describe('Quest World and Listening quest', () => {
  let attemptId: string;
  it('shows four zones with locked follow-up quests', async () => {
    const r = await api(ctx, student, 'GET', '/api/world');
    expect(r.status).toBe(200);
    expect(r.body.zones.map((z: { skill: string }) => z.skill)).toEqual(['listening', 'reading', 'writing', 'speaking']);
    const l = r.body.zones[0].quests;
    expect(l.find((q: { id: string }) => q.id === 'L01').state).toBe('open');
    expect(l.find((q: { id: string }) => q.id === 'L02').state).toBe('locked');
    expect((await api(ctx, student, 'POST', '/api/attempts', { questId: 'L02' })).body.error.code).toBe('LOCKED');
  });

  it('starts L01 without leaking answers or the transcript', async () => {
    const r = await api(ctx, student, 'POST', '/api/attempts', { questId: 'L01' });
    expect(r.status).toBe(200);
    attemptId = r.body.attempt.id;
    const raw = JSON.stringify(r.body);
    for (const k of ['correctIndex', 'acceptable', 'evidence', 'explanation', 'script', 'keyPoints', 'sampleAnswer']) expect(raw).not.toContain(`"${k}"`);
    expect(r.body.items[0].transcript).toBeNull();
    // Resume returns the same attempt.
    expect((await api(ctx, student, 'POST', '/api/attempts', { questId: 'L01' })).body.attempt.id).toBe(attemptId);
  });

  it('limits plays and gives development audio', async () => {
    const it0 = item('L01_flight') as Extract<Item, { skill: 'listening' }>;
    for (let i = 0; i < it0.plays.quest; i++) {
      const r = await api(ctx, student, 'POST', `/api/attempts/${attemptId}/play`, { itemId: it0.id });
      expect(r.status).toBe(200);
      expect(r.body.audio.kind).toBe('browser_tts');
    }
    expect((await api(ctx, student, 'POST', `/api/attempts/${attemptId}/play`, { itemId: it0.id })).body.error.code).toBe('PLAY_LIMIT');
  });

  it('cannot submit before answering everything; another student cannot see the attempt', async () => {
    expect((await api(ctx, student, 'POST', `/api/attempts/${attemptId}/submit`)).body.error.code).toBe('NOT_READY_TO_SUBMIT');
    expect((await api(ctx, other, 'GET', `/api/attempts/${attemptId}`)).status).toBe(403);
  });

  it('answers once per question, reveals the explanation after answering, AI explains', async () => {
    const q = questionsOf(item('L01_flight'))[0]!;
    const a1 = await api(ctx, student, 'POST', `/api/attempts/${attemptId}/answers`, { itemId: 'L01_flight', questionId: q.id, value: wrong(q) });
    expect(a1.body.result.correct).toBe(false);
    expect(a1.body.items[0].questions[0].reveal.evidence).toBe(q.evidence);
    expect((await api(ctx, student, 'POST', `/api/attempts/${attemptId}/answers`, { itemId: 'L01_flight', questionId: q.id, value: right(q) })).body.error.code).toBe('CONFLICT');
    const e = await api(ctx, student, 'POST', `/api/attempts/${attemptId}/explain`, { itemId: 'L01_flight', questionId: q.id });
    expect(e.status).toBe(200);
    expect(e.body.explanation.source).toBe('ai');
    // Cached: no second AI call.
    ctx.ai.failNext = 1;
    expect((await api(ctx, student, 'POST', `/api/attempts/${attemptId}/explain`, { itemId: 'L01_flight', questionId: q.id })).body.explanation.source).toBe('ai');
    ctx.ai.failNext = 0;
  });

  it('falls back to the teacher note when the AI is down', async () => {
    const q = questionsOf(item('L01_flight'))[1]!;
    await api(ctx, student, 'POST', `/api/attempts/${attemptId}/answers`, { itemId: 'L01_flight', questionId: q.id, value: right(q) });
    ctx.ai.failNext = 5;
    const e = await api(ctx, student, 'POST', `/api/attempts/${attemptId}/explain`, { itemId: 'L01_flight', questionId: q.id });
    ctx.ai.failNext = 0;
    expect(e.body.explanation).toMatchObject({ source: 'teacher_note', explanation: q.explanation, quote: q.evidence });
  });

  it('submits, grades, awards XP and unlocks L02', async () => {
    await answerAll(ctx, student, attemptId, ['L01_gate', 'L01_delay', 'L01_action']);
    const s = await api(ctx, student, 'POST', `/api/attempts/${attemptId}/submit`);
    expect(s.body.status).toBe('submitted');
    const r = await api(ctx, student, 'GET', `/api/attempts/${attemptId}/results`);
    expect(r.status).toBe(200);
    expect(r.body.status).toBe('graded');
    const total = ['L01_flight', 'L01_gate', 'L01_delay', 'L01_action'].reduce((n, id) => n + questionsOf(item(id)).reduce((k, q) => k + q.points, 0), 0);
    const missed = questionsOf(item('L01_flight'))[0]!.points;
    expect(r.body.assessment.skills[0].detail).toBe(`${total - missed}/${total} correct`);
    expect(r.body.assessment.passed).toBe(true);
    expect(r.body.assessment.xpAwarded).toBeGreaterThan(0);
    expect(r.body.items[0].transcript).not.toBeNull();
    const w = await api(ctx, student, 'GET', '/api/world');
    expect(w.body.zones[0].quests.find((q: { id: string }) => q.id === 'L02').state).toBe('open');
    expect(w.body.player.xp).toBe(r.body.assessment.xpAwarded);
    // Submitting again is idempotent; no extra XP.
    await api(ctx, student, 'POST', `/api/attempts/${attemptId}/submit`);
    expect((await api(ctx, student, 'GET', '/api/world')).body.player.xp).toBe(r.body.assessment.xpAwarded);
  });
});

describe('Writing quest', () => {
  it('autosaves with version checks and grades with verified AI feedback', async () => {
    const start = await api(ctx, student, 'POST', '/api/attempts', { questId: 'W01' });
    const id = start.body.attempt.id;
    const t1 = item('W01_reply_friend') as Extract<Item, { skill: 'writing' }>;
    const d1 = await api(ctx, student, 'PUT', `/api/attempts/${id}/writing/${t1.id}`, { text: 'Hello Anna.', baseVersion: 0 });
    expect(d1.body.draft.version).toBe(1);
    expect((await api(ctx, student, 'PUT', `/api/attempts/${id}/writing/${t1.id}`, { text: 'Other tab', baseVersion: 0 })).body.error.code).toBe('DRAFT_CONFLICT');
    await api(ctx, student, 'PUT', `/api/attempts/${id}/writing/${t1.id}`, { text: `Dear Anna. ${essay(t1.task.minWords + 10)}`, baseVersion: 1 });
    expect((await api(ctx, student, 'POST', `/api/attempts/${id}/submit`)).body.error.code).toBe('NOT_READY_TO_SUBMIT');
    await api(ctx, student, 'PUT', `/api/attempts/${id}/writing/W01_housing_office`, { text: `Dear Sir. ${essay(120)}`, baseVersion: 0 });
    expect((await api(ctx, student, 'POST', `/api/attempts/${id}/submit`)).body.status).toBe('submitted');
    const r = await api(ctx, student, 'GET', `/api/attempts/${id}/results`);
    const a = r.body.assessment;
    expect(a.aiStatus).toBe('ok');
    expect(a.items[0].criteria.taskFulfillment.source).toBe('ai');
    expect(a.qualityChecks.removedUnverifiableQuotes).toBe(2);
    expect(a.feedback[t1.id].corrections).toHaveLength(0);
    expect(a.pendingReview).toBe(false);
    expect(r.body.items[0].text).toContain('Dear Anna');
    expect(r.body.items[0].sampleAnswer).toBeUndefined();
  });

  it('marks writing for teacher review when the AI is unavailable', async () => {
    const id = (await api(ctx, other, 'POST', '/api/attempts', { questId: 'W01' })).body.attempt.id;
    await api(ctx, other, 'PUT', `/api/attempts/${id}/writing/W01_reply_friend`, { text: essay(110), baseVersion: 0 });
    await api(ctx, other, 'PUT', `/api/attempts/${id}/writing/W01_housing_office`, { text: essay(110), baseVersion: 0 });
    await api(ctx, other, 'POST', `/api/attempts/${id}/submit`);
    ctx.ai.failNext = 20;
    const r = await api(ctx, other, 'GET', `/api/attempts/${id}/results`);
    ctx.ai.failNext = 0;
    expect(r.body.assessment.aiStatus).toBe('failed');
    expect(r.body.assessment.pendingReview).toBe(true);
    expect(r.body.assessment.skills[0].score).toBeNull();
    expect(r.body.assessment.passed).toBe(false);
    // Teacher scores it → quest completed.
    const scores = Object.fromEntries(['W01_reply_friend', 'W01_housing_office'].map((i) => [i, { taskFulfillment: 18, organization: 17, vocabulary: 16, grammar: 15 }]));
    const rv = await api(ctx, teacher, 'PUT', `/api/teacher/assessments/${id}/review`, { scores, comment: 'Good effort' });
    expect(rv.status, JSON.stringify(rv.body)).toBe(200);
    expect(rv.body.assessment.score).toBe(66);
    expect(rv.body.assessment.passed).toBe(true);
    expect((await api(ctx, other, 'GET', '/api/world')).body.zones[2].quests.find((q: { id: string }) => q.id === 'W01').state).toBe('completed');
  });
});

describe('Speaking quest', () => {
  it('needs consent, transcribes recordings, keeps pronunciation for the teacher', async () => {
    const id = (await api(ctx, student, 'POST', '/api/attempts', { questId: 'S01' })).body.attempt.id;
    const sp = item('S01_social_talk') as Extract<Item, { skill: 'speaking' }>;
    const url = (p: string) => `/api/attempts/${id}/speaking/${sp.id}/${p}`;
    expect((await upload(ctx, student, url(sp.parts[0]!.id), wav(30))).body.error.code).toBe('CONSENT_REQUIRED');
    await api(ctx, student, 'POST', '/api/me/recording-consent', { accept: true });
    expect((await upload(ctx, student, url(sp.parts[0]!.id), wav(sp.parts[0]!.speakSeconds + 30))).body.error.code).toBe('AUDIO_TOO_LONG');
    for (const p of sp.parts) {
      const r = await upload(ctx, student, url(p.id), wav(Math.min(40, p.speakSeconds)));
      expect(r.status, JSON.stringify(r.body)).toBe(200);
      expect(r.body.take.status).toBe('transcribed');
    }
    await api(ctx, student, 'POST', `/api/attempts/${id}/submit`);
    const r = await api(ctx, student, 'GET', `/api/attempts/${id}/results`);
    const res = r.body.assessment.items[0];
    expect(res.criteria.pronunciation.status).toBe('pending_review');
    expect(res.criteria.fluency.source).toBe('speech_metrics');
    expect(r.body.assessment.pendingReview).toBe(true);
    expect(r.body.items[0].recordings[0].audioUrl).toContain('/recordings/');
    const audio = await ctx.app.inject({ method: 'GET', url: r.body.items[0].recordings[0].audioUrl, headers: { authorization: `Bearer ${teacher.token}` } });
    expect(audio.statusCode).toBe(200);
    expect(audio.headers['content-type']).toBe('audio/wav');
    expect((await ctx.app.inject({ method: 'GET', url: r.body.items[0].recordings[0].audioUrl, headers: { authorization: `Bearer ${other.token}` } })).statusCode).toBe(403);
    // Teacher review queue → pronunciation.
    const queue = await api(ctx, teacher, 'GET', '/api/teacher/review-queue');
    expect(queue.body.items.some((x: { attemptId: string }) => x.attemptId === id)).toBe(true);
    const rv = await api(ctx, teacher, 'PUT', `/api/teacher/assessments/${id}/review`, { scores: { [sp.id]: { pronunciation: 12 } }, comment: 'Clear' });
    expect(rv.body.assessment.pendingReview).toBe(false);
    expect(rv.body.assessment.items[0].criteria.pronunciation).toMatchObject({ score: 12, source: 'teacher', status: 'assessed' });
    expect((await api(ctx, teacher, 'PUT', `/api/teacher/assessments/${id}/review`, { scores: { [sp.id]: { pronunciation: 99 } } })).status).toBe(400);
  });
});

describe('Mock exam (server-timed sections)', () => {
  let id: string;
  it('runs sections in order and refuses answers outside the open section', async () => {
    const r = await api(ctx, student, 'POST', '/api/exams/mx1/attempts', {});
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    id = r.body.attempt.id;
    expect(r.body.items).toHaveLength(0);
    const q = questionsOf(item('MX1_listen_p1'))[0]!;
    expect((await api(ctx, student, 'POST', `/api/attempts/${id}/answers`, { itemId: 'MX1_listen_p1', questionId: q.id, value: right(q) })).body.error.code).toBe('TIME_UP');
    const s = await api(ctx, student, 'POST', `/api/attempts/${id}/sections/start`);
    expect(s.body.attempt.secondsLeft).toBeGreaterThan(19 * 60);
    expect(s.body.items.map((i: { skill: string }) => i.skill)).toEqual(['listening', 'listening', 'listening']);
    const a = await api(ctx, student, 'POST', `/api/attempts/${id}/answers`, { itemId: 'MX1_listen_p1', questionId: q.id, value: wrong(q) });
    expect(a.body.result).toEqual({ saved: true });
    // Exam answers may change until the section closes; nothing is revealed.
    const a2 = await api(ctx, student, 'POST', `/api/attempts/${id}/answers`, { itemId: 'MX1_listen_p1', questionId: q.id, value: right(q) });
    expect(a2.body.items[0].questions[0].reveal).toBeNull();
    expect(a2.body.items[0].questions[0].answer.correct).toBeUndefined();
    // Help is off during exams.
    expect((await api(ctx, student, 'POST', `/api/attempts/${id}/explain`, { itemId: 'MX1_listen_p1', questionId: q.id })).body.error.code).toBe('HELP_DISABLED');
    expect((await api(ctx, student, 'POST', '/api/coach', { clientMessageId: uuid(), question: 'Help me with question 1' })).body.error.code).toBe('HELP_DISABLED');
    expect((await api(ctx, student, 'POST', '/api/exams/mx1/attempts', {})).body.attempt.id).toBe(id);
  });

  it('closes the section when time is up (server clock)', async () => {
    const real = ctx.deps.now;
    ctx.deps.now = () => new Date(real().getTime() + 21 * 60_000);
    try {
      const q = questionsOf(item('MX1_listen_p2'))[0]!;
      expect((await api(ctx, student, 'POST', `/api/attempts/${id}/answers`, { itemId: 'MX1_listen_p2', questionId: q.id, value: right(q) })).body.error.code).toBe('TIME_UP');
      const v = await api(ctx, student, 'GET', `/api/attempts/${id}`);
      expect(v.body.attempt.currentSection).toBe(1);
      expect(v.body.attempt.sections[0].closedAt).not.toBeNull();
    } finally {
      ctx.deps.now = real;
    }
  });

  it('moves through the remaining sections, grades, and hides answers until released', async () => {
    await api(ctx, student, 'POST', `/api/attempts/${id}/sections/start`);
    await answerAll(ctx, student, id, ['MX1_read_p1', 'MX1_read_p2']);
    await api(ctx, student, 'POST', `/api/attempts/${id}/sections/next`);
    await api(ctx, student, 'POST', `/api/attempts/${id}/sections/start`);
    await api(ctx, student, 'PUT', `/api/attempts/${id}/writing/MX1_write_t1`, { text: essay(130), baseVersion: 0 });
    await api(ctx, student, 'PUT', `/api/attempts/${id}/writing/MX1_write_t2`, { text: essay(260), baseVersion: 0 });
    await api(ctx, student, 'POST', `/api/attempts/${id}/sections/next`);
    const sp = await api(ctx, student, 'POST', `/api/attempts/${id}/sections/start`);
    expect(sp.body.items[0].skill).toBe('speaking');
    const speak = item('MX1_speak') as Extract<Item, { skill: 'speaking' }>;
    for (const p of speak.parts) expect((await upload(ctx, student, `/api/attempts/${id}/speaking/MX1_speak/${p.id}`, wav(30))).status).toBe(200);
    expect((await api(ctx, student, 'POST', `/api/attempts/${id}/submit`)).body.status).toBe('submitted');
    const r = await api(ctx, student, 'GET', `/api/attempts/${id}/results`);
    expect(r.body.status).toBe('graded');
    expect(r.body.answersReleased).toBe(false);
    expect(r.body.assessment.skills.map((s: { skill: string }) => s.skill)).toEqual(['listening', 'reading', 'writing', 'speaking']);
    expect(r.body.assessment.skills[0].detail).toMatch(/^1\//); // only the first listening answer counted
    expect(r.body.assessment.skills[1].score).toBe(100);
    expect(r.body.assessment.overall).not.toBeNull();
    expect(r.body.assessment.disclaimer).toMatch(/not an official/i);
    expect(r.body.items.find((i: { id: string }) => i.id === 'MX1_read_p1').questions[0].reveal).toBeNull();
    // Teacher releases answers.
    expect((await api(ctx, teacher, 'POST', '/api/teacher/exams/release', { courseId, examId: 'mx1' })).body.released).toBe(1);
    const r2 = await api(ctx, student, 'GET', `/api/attempts/${id}/results`);
    expect(r2.body.items.find((i: { id: string }) => i.id === 'MX1_read_p1').questions[0].reveal.evidence).toBeTruthy();
    const me = await api(ctx, student, 'GET', '/api/me');
    expect(me.body.user.badges).toContain('mock_exam_finisher');
  });
});

describe('Championships, profile and coach', () => {
  it('runs a class championship with official and provisional points', async () => {
    const now = Date.now();
    const c = await api(ctx, teacher, 'POST', '/api/teacher/championships', {
      name: 'Reading Sprint', type: 'individual', courseIds: [courseId], questIds: ['R01'], opensAt: new Date(now - 60_000).toISOString(), closesAt: new Date(now + 3_600_000).toISOString(),
    });
    expect(c.status, JSON.stringify(c.body)).toBe(200);
    const cid = c.body.championship.id;
    const list = await api(ctx, student, 'GET', '/api/championships');
    expect(list.body.championships[0]).toMatchObject({ id: cid, status: 'open' });
    const a = await api(ctx, student, 'POST', '/api/attempts', { questId: 'R01', championshipId: cid });
    expect(a.body.attempt.mode).toBe('championship');
    expect(a.body.attempt.helpAllowed).toBe(false);
    await answerAll(ctx, student, a.body.attempt.id, ['R01_welcome_email', 'R01_student_blog']);
    await api(ctx, student, 'POST', `/api/attempts/${a.body.attempt.id}/submit`);
    await api(ctx, student, 'GET', `/api/attempts/${a.body.attempt.id}/results`);
    const lb = await api(ctx, other, 'GET', `/api/championships/${cid}/leaderboard`);
    expect(lb.body.individuals[0]).toMatchObject({ rank: 1, points: 100, provisionalPoints: 100 });
    // One official attempt per quest.
    expect((await api(ctx, student, 'POST', '/api/attempts', { questId: 'R01', championshipId: cid })).body.attempt.id).toBe(a.body.attempt.id);
    const close = await api(ctx, teacher, 'POST', `/api/teacher/championships/${cid}/close`);
    expect(close.body.podium).toEqual([student.uid]);
    expect((await api(ctx, student, 'GET', '/api/me')).body.user.badges).toContain('championship_podium');
  });

  it('builds the four-skill profile and answers coach questions without giving answers', async () => {
    const p = await api(ctx, student, 'GET', '/api/profile');
    expect(p.status).toBe(200);
    expect(p.body.profile.skills).toHaveLength(4);
    expect(p.body.profile.skills.find((s: { skill: string }) => s.skill === 'reading').sufficient).toBe(true);
    expect(p.body.external.sources).toEqual([]);
    const s = await api(ctx, student, 'POST', '/api/profile/summary');
    expect(s.body.summary.summary).toBeTruthy();
    const mid = uuid();
    const c1 = await api(ctx, student, 'POST', '/api/coach', { clientMessageId: mid, question: 'How can I improve my listening?' });
    expect(c1.body.message.kind).toBe('plan');
    expect((await api(ctx, student, 'POST', '/api/coach', { clientMessageId: mid, question: 'How can I improve my listening?' })).body.message.id).toBe(mid);
    const c2 = await api(ctx, student, 'POST', '/api/coach', { clientMessageId: uuid(), question: 'Tell me the correct option please' });
    expect(c2.body.message.kind).toBe('refused');
    expect((await api(ctx, student, 'GET', '/api/coach')).body.messages).toHaveLength(2);
  });

  it('teacher dashboard, analytics and CSV export', async () => {
    const d = await api(ctx, teacher, 'GET', `/api/teacher/classes/${courseId}`);
    expect(d.status).toBe(200);
    expect(d.body.stats.perSkill).toHaveLength(4);
    expect(d.body.students.find((s: { uid: string }) => s.uid === student.uid).questsCompleted).toBeGreaterThan(0);
    const an = await api(ctx, teacher, 'POST', '/api/teacher/analytics/summary', { courseId });
    expect(an.body.summary.summary).toBeTruthy();
    const csv = await ctx.app.inject({ method: 'GET', url: `/api/teacher/export.csv?courseId=${courseId}`, headers: { authorization: `Bearer ${teacher.token}` } });
    expect(csv.statusCode).toBe(200);
    expect(csv.body.split('\n')[0]).toContain('listening,reading,writing,speaking');
    const prof = await api(ctx, teacher, 'GET', `/api/teacher/students/${student.uid}`);
    expect(prof.body.profile.profile.skills).toHaveLength(4);
    const ev = await api(ctx, await createUser(ctx.deps, tenantId, 'school_admin'), 'GET', `/api/lms/v1/learners/${student.uid}/evidence`);
    expect(ev.body.schema).toBe('k26-evidence-1.0');
    expect(ev.body.items[0].source).toBe('vstep-quest');
  });

  it('background job grades submissions nobody opened', async () => {
    const id = (await api(ctx, other, 'POST', '/api/attempts', { questId: 'R01' })).body.attempt.id;
    await answerAll(ctx, other, id, ['R01_welcome_email', 'R01_student_blog'], wrong);
    await api(ctx, other, 'POST', `/api/attempts/${id}/submit`);
    const real = ctx.deps.now;
    ctx.deps.now = () => new Date(real().getTime() + 5 * 60_000);
    try {
      const r = await ctx.app.inject({ method: 'POST', url: '/internal/jobs/tick' });
      expect(r.statusCode).toBe(200);
      expect(r.json().graded).toBeGreaterThanOrEqual(1);
    } finally {
      ctx.deps.now = real;
    }
    const res = await api(ctx, other, 'GET', `/api/attempts/${id}/results`);
    expect(res.body.assessment.passed).toBe(false);
    expect(res.body.assessment.xpAwarded).toBeGreaterThan(0); // 30% participation XP
  });
});
