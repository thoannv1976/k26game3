import { createHash, randomUUID } from 'node:crypto';
import { createLocalJWKSet, decodeJwt, exportJWK, generateKeyPair, SignJWT } from 'jose';
import { beforeAll, describe, expect, it } from 'vitest';
import { BUILTIN_ITEMS, BUILTIN_QUESTS, questionsOf } from '@vq/game-engine';
import type { Item, ObjectiveQuestion } from '@vq/shared';
import { TICKET_TYP } from '../../src/lti/hubSdk.js';
import { api, createTenant, createUser, makeApp, type TestCtx, type TestUser } from '../helpers.js';

/** UniGame Hub (LTI 1.3) adapter: ticket sign-in, provisioning, and grade sync to the Hub. */
const HUB = 'https://hub.test';
const AUTH_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST;

let ctx: TestCtx;
let tenantId: string;
let hubKey: CryptoKey;
const hubCalls: Array<{ url: string; result: Record<string, unknown> }> = [];

const ltiUid = (sub: string) => `lti-${createHash('sha256').update(sub).digest('hex').slice(0, 28)}`;
const item = (id: string) => BUILTIN_ITEMS.find((i) => i.id === id)! as Item;
const right = (q: ObjectiveQuestion) => (q.type === 'mcq' ? q.correctIndex : q.type === 'tfng' ? q.answer : q.acceptable[0]!);
const questItems = (questId: string) => BUILTIN_QUESTS.find((q) => q.id === questId)!.challenges.map((c) => c.itemId);
const essay = (n: number) =>
  Array.from({ length: n }, (_, i) => ['I', 'think', 'that', 'students', 'should', 'plan', 'their', 'time', 'carefully', 'because'][i % 10]).join(' ') + '.';
const REVIEW = Object.fromEntries(['W01_reply_friend', 'W01_housing_office'].map((i) => [i, { taskFulfillment: 18, organization: 17, vocabulary: 16, grammar: 15 }]));

async function ticket(over: Record<string, unknown> = {}, sub = `u_${randomUUID().slice(0, 12)}`) {
  return new SignJWT({
    ugh: {
      tenantId: 'hub-tenant',
      platform: { issuer: 'https://moodle.test', deploymentId: '3' },
      ltiSub: '42',
      name: 'Nguyễn Văn B',
      email: 'b@moodle.test',
      role: 'learner',
      context: { id: 'course-7', title: 'English B1', label: 'ENGB1' },
      resourceLink: { id: 'rl-9', title: 'Airport listening' },
      activity: 'L01',
      gradeTarget: 'gt_abc123',
      launchId: 'L1',
      ...over,
    },
  })
    .setProtectedHeader({ alg: 'RS256', kid: 'hub1', typ: TICKET_TYP })
    .setIssuer(HUB)
    .setAudience('k26game3')
    .setSubject(sub)
    .setJti(randomUUID())
    .setIssuedAt()
    .setExpirationTime('2m')
    .sign(hubKey);
}

async function signInWithCustomToken(token: string): Promise<string> {
  const res = await fetch(`http://${AUTH_HOST}/identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=fake-api-key`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, returnSecureToken: true }),
  });
  const json = (await res.json()) as { idToken?: string };
  if (!json.idToken) throw new Error('custom token sign-in failed');
  return json.idToken;
}

const launch = (t: string) => ctx.app.inject({ method: 'POST', url: '/api/lti/launch', payload: { ticket: t } });

/** Launches from the LMS and signs in with the returned custom token. */
async function launchAs(over: Record<string, unknown>, sub?: string): Promise<{ user: TestUser; redirect: string; assignmentId: string | null }> {
  const r = await launch(await ticket(over, sub));
  expect(r.statusCode, r.body).toBe(200);
  const { customToken, redirect } = r.json() as { customToken: string; redirect: string };
  const user: TestUser = { uid: (decodeJwt(customToken) as { uid: string }).uid, email: '', token: await signInWithCustomToken(customToken) };
  expect((await api(ctx, user, 'GET', '/api/me')).status).toBe(200);
  return { user, redirect, assignmentId: redirect.split('assignment=')[1] ?? null };
}

async function answerAll(u: TestUser, attemptId: string, itemIds: string[]) {
  for (const id of itemIds) for (const q of questionsOf(item(id))) {
    const r = await api(ctx, u, 'POST', `/api/attempts/${attemptId}/answers`, { itemId: id, questionId: q.id, value: right(q) });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
  }
}

async function writeW01(u: TestUser, attemptId: string) {
  await api(ctx, u, 'PUT', `/api/attempts/${attemptId}/writing/W01_reply_friend`, { text: `Dear Anna. ${essay(110)}`, baseVersion: 0 });
  await api(ctx, u, 'PUT', `/api/attempts/${attemptId}/writing/W01_housing_office`, { text: `Dear Sir. ${essay(120)}`, baseVersion: 0 });
  expect((await api(ctx, u, 'POST', `/api/attempts/${attemptId}/submit`)).body.status).toBe('submitted');
}

beforeAll(async () => {
  const { publicKey, privateKey } = await generateKeyPair('RS256');
  hubKey = privateKey;
  const ltiJwks = createLocalJWKSet({ keys: [{ ...(await exportJWK(publicKey)), kid: 'hub1', alg: 'RS256' }] });
  const ltiFetch: typeof fetch = async (url, init) => {
    const body = JSON.parse(String(init?.body)) as { result_token: string };
    hubCalls.push({ url: String(url), result: decodeJwt(body.result_token).result as Record<string, unknown> });
    return new Response(JSON.stringify({ status: 'queued', job_id: `job-${hubCalls.length}` }), { status: 202 });
  };
  ctx = await makeApp(
    { ltiJwks, ltiFetch },
    { ltiEnabled: true, ltiHubUrl: HUB, ltiGameId: 'k26game3', ltiGameSecret: 'x'.repeat(40), ltiTenantMap: { 'hub-tenant': 'pending' } },
  );
  tenantId = (await createTenant(ctx.deps)).id;
  ctx.deps.config.ltiTenantMap = { 'hub-tenant': tenantId };
});

describe('LTI launch', () => {
  it('signs a learner in, enrols them and deep-links to the quest assignment', async () => {
    const sub = `u_${randomUUID().slice(0, 12)}`;
    const r = await launch(await ticket({}, sub));
    expect(r.statusCode, r.body).toBe(200);
    const { customToken, redirect } = r.json() as { customToken: string; redirect: string };
    expect(redirect).toMatch(/^\/quests\/L01\?assignment=lti-[0-9a-f]{20}$/);
    const uid = (decodeJwt(customToken) as { uid: string }).uid;
    expect(uid).toBe(ltiUid(sub)); // same uid as in the other K26 games (shared Firebase Auth)
    const user = await ctx.deps.auth.getUser(uid);
    expect(user.customClaims).toMatchObject({ tenantId, role: 'student' });
    expect(user.email).toBeUndefined(); // never keyed by e-mail
    const profile = (await ctx.deps.db.doc(`tenants/${tenantId}/users/${uid}`).get()).data()!;
    expect(profile).toMatchObject({ role: 'student', displayName: 'Nguyễn Văn B' });
    const assignmentId = redirect.split('assignment=')[1]!;
    const a = (await ctx.deps.db.doc(`tenants/${tenantId}/assignments/${assignmentId}`).get()).data()!;
    expect(a).toMatchObject({ kind: 'quest', refId: 'L01', courseId: profile.courseIds[0] });
    const c = (await ctx.deps.db.doc(`tenants/${tenantId}/courses/${a.courseId}`).get()).data()!;
    expect(c.studentIds).toContain(uid);
    expect(c.name).toBe('English B1');
    const link = (await ctx.deps.db.doc(`tenants/${tenantId}/lti_links/${uid}_${assignmentId}`).get()).data();
    expect(link).toMatchObject({ gradeTarget: 'gt_abc123' });
    // The quest page shows it as an assigned quest.
    const w = await api(ctx, { uid, email: '', token: await signInWithCustomToken(customToken) }, 'GET', '/api/world');
    expect(w.body.assignments.some((x: { id: string }) => x.id === assignmentId)).toBe(true);
  });

  it('deep-links mock exams to the exam lobby and refuses content that is not approved', async () => {
    const r = await launch(await ticket({ activity: 'mx1', resourceLink: { id: 'rl-exam', title: 'Mock exam' } }));
    expect(r.statusCode, r.body).toBe(200);
    const redirect = r.json().redirect as string;
    expect(redirect).toMatch(/^\/exams\/mx1\?assignment=lti-[0-9a-f]{20}$/);
    const a = (await ctx.deps.db.doc(`tenants/${tenantId}/assignments/${redirect.split('assignment=')[1]}`).get()).data();
    expect(a).toMatchObject({ kind: 'exam', refId: 'mx1' });
    expect((await launch(await ticket({ activity: 'zz9', resourceLink: { id: 'rl-bad' } }))).statusCode).toBe(404);
    // No activity: the learner lands in the Quest World.
    expect((await launch(await ticket({ activity: undefined }))).json().redirect).toBe('/world');
  });

  it('rejects a reused ticket, a forged ticket and an unmapped tenant', async () => {
    const t = await ticket();
    expect((await launch(t)).statusCode).toBe(200);
    expect((await launch(t)).statusCode).toBe(401);
    const forged = await new SignJWT({ ugh: {} }).setProtectedHeader({ alg: 'RS256', kid: 'hub1', typ: TICKET_TYP }).setIssuer(HUB).setAudience('k26game3')
      .setSubject('x').setJti(randomUUID()).setIssuedAt().setExpirationTime('2m').sign((await generateKeyPair('RS256')).privateKey);
    expect((await launch(forged)).statusCode).toBe(401);
    expect((await launch(await ticket({ tenantId: 'other-school' }))).statusCode).toBe(403);
  });

  it('keeps shared-account claims compatible: no admin downgrade, no school switch', async () => {
    const adminSub = `u_${randomUUID().slice(0, 12)}`;
    await ctx.deps.auth.createUser({ uid: ltiUid(adminSub) });
    await ctx.deps.auth.setCustomUserClaims(ltiUid(adminSub), { tenantId, role: 'school_admin' });
    const r = await launch(await ticket({}, adminSub));
    expect(r.statusCode, r.body).toBe(200);
    expect((await ctx.deps.auth.getUser(ltiUid(adminSub))).customClaims).toMatchObject({ tenantId, role: 'school_admin' });

    const otherSub = `u_${randomUUID().slice(0, 12)}`;
    await ctx.deps.auth.createUser({ uid: ltiUid(otherSub) });
    await ctx.deps.auth.setCustomUserClaims(ltiUid(otherSub), { tenantId: 'another-school', role: 'student' });
    expect((await launch(await ticket({}, otherSub))).statusCode).toBe(409);
  });

  it('makes instructors teachers of the course and sends them to the class page', async () => {
    const r = await launch(await ticket({ role: 'instructor', gradeTarget: undefined }));
    expect(r.statusCode, r.body).toBe(200);
    expect(r.json().redirect).toMatch(/^\/teacher\/classes\/lti-/);
    const uid = (decodeJwt(r.json().customToken) as { uid: string }).uid;
    expect((await ctx.deps.auth.getUser(uid)).customClaims).toMatchObject({ role: 'teacher' });
  });

  it('is invisible when LTI is disabled', async () => {
    const off = await makeApp({}, { ltiEnabled: false });
    expect((await off.app.inject({ method: 'POST', url: '/api/lti/launch', payload: { ticket: 'x'.repeat(40) } })).statusCode).toBe(404);
  });
});

describe('grade sync', () => {
  it('reports the quest score, also for an attempt resumed from the LMS link', async () => {
    const { user: student, assignmentId } = await launchAs({ gradeTarget: 'gt_grade1', resourceLink: { id: 'rl-grade', title: 'Graded' } }, 'u_grader');
    // Started in the app first, then resumed from Moodle: the attempt gets attached to the LMS assignment.
    const plain = await api(ctx, student, 'POST', '/api/attempts', { questId: 'L01' });
    expect(plain.status, JSON.stringify(plain.body)).toBe(200);
    const attemptId = plain.body.attempt.id as string;
    const resumed = await api(ctx, student, 'POST', '/api/attempts', { questId: 'L01', assignmentId });
    expect(resumed.body).toMatchObject({ resumed: true, attempt: { id: attemptId } });
    expect((await ctx.deps.db.doc(`tenants/${tenantId}/game_sessions/${attemptId}`).get()).data()).toMatchObject({ assignmentId });

    await answerAll(student, attemptId, questItems('L01'));
    expect((await api(ctx, student, 'POST', `/api/attempts/${attemptId}/submit`)).body.status).toBe('submitted');
    const before = hubCalls.length;
    const res = await api(ctx, student, 'GET', `/api/attempts/${attemptId}/results`);
    expect(res.body.status).toBe('graded');
    expect(hubCalls.length).toBe(before + 1);
    const sent = hubCalls.at(-1)!;
    expect(sent.url).toBe(`${HUB}/api/v1/results`);
    expect(sent.result).toMatchObject({ grade_target: 'gt_grade1', attempt_id: attemptId, score: res.body.assessment.score, max_score: 100, grading_progress: 'FullyGraded' });
    // Opening the results again does not send it again.
    await api(ctx, student, 'GET', `/api/attempts/${attemptId}/results`);
    expect(hubCalls.length).toBe(before + 1);
    expect((await ctx.deps.db.doc(`tenants/${tenantId}/lti_outbox/${attemptId}`).get()).data()).toMatchObject({ status: 'queued' });
  });

  it('sends the teacher re-score with a newer occurredAt', async () => {
    const rl = { id: 'rl-writing', title: 'Email writing' };
    const { user: student, assignmentId } = await launchAs({ activity: 'W01', gradeTarget: 'gt_w1', resourceLink: rl }, 'u_writer');
    const start = await api(ctx, student, 'POST', '/api/attempts', { questId: 'W01', assignmentId });
    const attemptId = start.body.attempt.id as string;
    await writeW01(student, attemptId);
    const res = await api(ctx, student, 'GET', `/api/attempts/${attemptId}/results`);
    expect(res.body.assessment.pendingReview).toBe(false);
    const first = hubCalls.at(-1)!;
    expect(first.result).toMatchObject({ grade_target: 'gt_w1', attempt_id: attemptId, score: res.body.assessment.score, grading_progress: 'FullyGraded' });

    // Teacher of the LTI course re-scores: a newer result is sent for the same attempt.
    const { user: teacher } = await launchAs({ role: 'instructor', activity: 'W01', gradeTarget: undefined, resourceLink: rl }, 'u_teacher1');
    const rev = await api(ctx, teacher, 'PUT', `/api/teacher/assessments/${attemptId}/review`, { scores: REVIEW, comment: 'Well done' });
    expect(rev.status, JSON.stringify(rev.body)).toBe(200);
    const second = hubCalls.at(-1)!;
    expect(second.result).toMatchObject({ grade_target: 'gt_w1', attempt_id: attemptId, score: 66, comment: 'Well done', grading_progress: 'FullyGraded' });
    expect(Date.parse(String(second.result.occurred_at))).toBeGreaterThan(Date.parse(String(first.result.occurred_at)));
  });

  it('waits for the teacher when there is no score yet (AI unavailable)', async () => {
    const rl = { id: 'rl-writing', title: 'Email writing' };
    const { user: student, assignmentId } = await launchAs({ activity: 'W01', gradeTarget: 'gt_w2', resourceLink: rl });
    const attemptId = (await api(ctx, student, 'POST', '/api/attempts', { questId: 'W01', assignmentId })).body.attempt.id as string;
    await writeW01(student, attemptId);
    const before = hubCalls.length;
    ctx.ai.failNext = 20;
    const res = await api(ctx, student, 'GET', `/api/attempts/${attemptId}/results`);
    ctx.ai.failNext = 0;
    expect(res.body.assessment).toMatchObject({ pendingReview: true, score: null });
    expect(hubCalls.length).toBe(before);
    expect((await ctx.deps.db.doc(`tenants/${tenantId}/lti_outbox/${attemptId}`).get()).data()).toMatchObject({ status: 'no_score' });

    const { user: teacher } = await launchAs({ role: 'instructor', activity: 'W01', gradeTarget: undefined, resourceLink: rl }, 'u_teacher1');
    expect((await api(ctx, teacher, 'PUT', `/api/teacher/assessments/${attemptId}/review`, { scores: REVIEW, comment: '' })).status).toBe(200);
    expect(hubCalls.length).toBe(before + 1);
    expect(hubCalls.at(-1)!.result).toMatchObject({ grade_target: 'gt_w2', attempt_id: attemptId, score: 66, grading_progress: 'FullyGraded' });
  });

  it('does not report attempts that are not tied to an LTI assignment', async () => {
    const plain = await createUser(ctx.deps, tenantId, 'student');
    expect((await api(ctx, plain, 'GET', '/api/me')).status).toBe(200);
    const before = hubCalls.length;
    const s = await api(ctx, plain, 'POST', '/api/attempts', { questId: 'L01', restart: true });
    const attemptId = s.body.attempt.id as string;
    await answerAll(plain, attemptId, questItems('L01'));
    await api(ctx, plain, 'POST', `/api/attempts/${attemptId}/submit`);
    expect((await api(ctx, plain, 'GET', `/api/attempts/${attemptId}/results`)).body.status).toBe('graded');
    expect(hubCalls.length).toBe(before);
  });
});
