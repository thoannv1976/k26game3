import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { FakeAiProvider } from '@vq/ai';
import { DEFAULT_AI_CONFIG, DEFAULT_QUOTAS, type Role, type TenantDoc } from '@vq/shared';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { createDeps, type Deps } from '../src/deps.js';
import { paths } from '../src/paths.js';
import { seedBuiltinContent } from '../src/services/content.js';
import { provisionUser } from '../src/services/users.js';

const AUTH_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST;
if (!process.env.FIRESTORE_EMULATOR_HOST || !AUTH_HOST) {
  throw new Error('Integration tests must run inside the Firebase emulators: npm run test:integration (from the repo root)');
}

export interface TestCtx {
  app: FastifyInstance;
  deps: Deps;
  ai: FakeAiProvider;
}

export async function makeApp(o: Partial<Deps> = {}, cfg: Partial<ReturnType<typeof loadConfig>> = {}): Promise<TestCtx> {
  const config = loadConfig({ env: 'test', projectId: process.env.GCLOUD_PROJECT ?? 'demo-vq', blobStore: 'memory', aiProvider: 'fake', aiMaxRetries: 1, aiTimeoutMs: 2000, gradingTimeoutMs: 3000, rateLimitPerMinute: 100000, ...cfg });
  const ai = new FakeAiProvider();
  const deps = createDeps(config, { ai, ...o });
  const app = await buildApp(deps, { logger: false });
  return { app, deps, ai };
}

export async function createTenant(deps: Deps, opts: { approve?: boolean; approveExams?: boolean; quotas?: Partial<TenantDoc['quotas']>; id?: string } = {}): Promise<TenantDoc> {
  const id = opts.id ?? `t-${randomUUID().slice(0, 8)}`;
  const tenant: TenantDoc = {
    id,
    name: `Test University ${id}`,
    allowedEmailDomains: [],
    quotas: { ...DEFAULT_QUOTAS, attemptsPerQuestPerDay: 100, mockExamsPerStudentPerMonth: 100, ...opts.quotas },
    aiConfig: DEFAULT_AI_CONFIG,
    active: true,
    createdAt: new Date().toISOString(),
  };
  await paths(deps.db).tenant(id).set(tenant);
  await seedBuiltinContent(deps, id, opts.approve === false ? {} : { approvedBy: 'test', approveExams: opts.approveExams ?? true });
  return tenant;
}

export interface TestUser {
  uid: string;
  email: string;
  token: string;
}

export const PASSWORD = 'Test-password-123';

export async function signIn(email: string, password = PASSWORD): Promise<string> {
  const res = await fetch(`http://${AUTH_HOST}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake-api-key`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, returnSecureToken: true }),
  });
  const json = (await res.json()) as { idToken?: string; error?: unknown };
  if (!json.idToken) throw new Error(`sign-in failed: ${JSON.stringify(json.error)}`);
  return json.idToken;
}

export async function createUser(deps: Deps, tenantId: string, role: Exclude<Role, 'platform_admin'>, courseIds: string[] = []): Promise<TestUser> {
  const email = `${role}-${randomUUID().slice(0, 8)}@test.edu.vn`;
  const r = await provisionUser(deps, { id: tenantId }, { email, displayName: `${role} ${email.slice(0, 12)}`, role, level: 'B1', password: PASSWORD, courseIds });
  return { uid: r.uid, email, token: await signIn(email) };
}

export async function createPlatformAdmin(deps: Deps): Promise<TestUser> {
  const email = `platform-${randomUUID().slice(0, 8)}@test.edu.vn`;
  const rec = await deps.auth.createUser({ email, password: PASSWORD });
  await deps.auth.setCustomUserClaims(rec.uid, { role: 'platform_admin' });
  return { uid: rec.uid, email, token: await signIn(email) };
}

export async function createUnprovisioned(deps: Deps): Promise<TestUser> {
  const email = `nobody-${randomUUID().slice(0, 8)}@gmail.com`;
  const rec = await deps.auth.createUser({ email, password: PASSWORD });
  return { uid: rec.uid, email, token: await signIn(email) };
}

export async function createCourse(deps: Deps, tenantId: string, teacherIds: string[], studentIds: string[]): Promise<string> {
  const ref = paths(deps.db).courses(tenantId).doc();
  await ref.set({ id: ref.id, tenantId, code: `ENG-${ref.id.slice(0, 4)}`, name: 'Academic English', teacherIds, studentIds, monthlyBudgetUsd: null, createdAt: new Date().toISOString() });
  for (const uid of [...teacherIds, ...studentIds]) await paths(deps.db).user(tenantId, uid).update({ courseIds: [ref.id] });
  return ref.id;
}

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
export async function api<T = any>(ctx: TestCtx, user: TestUser | null, method: Method, url: string, payload?: unknown) {
  const res = await ctx.app.inject({ method, url, headers: user ? { authorization: `Bearer ${user.token}` } : {}, ...(payload !== undefined ? { payload: payload as object } : {}) });
  let body: T;
  try {
    body = res.json() as T;
  } catch {
    body = res.body as unknown as T;
  }
  return { status: res.statusCode, body, raw: res };
}

export const uuid = () => randomUUID();

/** 16 kHz mono 16-bit WAV with a tone (the fake STT returns a slice of the sample answer). */
export function wav(seconds: number): Buffer {
  const rate = 16000;
  const pcm = Buffer.alloc(Math.round(seconds * rate) * 2);
  for (let i = 0; i < pcm.length / 2; i++) pcm.writeInt16LE(Math.round(Math.sin(i / 8) * 8000), i * 2);
  const h = Buffer.alloc(44);
  h.write('RIFF', 0);
  h.writeUInt32LE(36 + pcm.length, 4);
  h.write('WAVE', 8);
  h.write('fmt ', 12);
  h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20);
  h.writeUInt16LE(1, 22);
  h.writeUInt32LE(rate, 24);
  h.writeUInt32LE(rate * 2, 28);
  h.writeUInt16LE(2, 32);
  h.writeUInt16LE(16, 34);
  h.write('data', 36);
  h.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([h, pcm]);
}

/** Multipart body with one WAV file field. */
export function multipart(file: Buffer) {
  const boundary = `----vq${randomUUID().slice(0, 8)}`;
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="audio"; filename="take.wav"\r\nContent-Type: audio/wav\r\n\r\n`),
    file,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
  return { body, headers: { 'content-type': `multipart/form-data; boundary=${boundary}` } };
}

export async function upload(ctx: TestCtx, user: TestUser, url: string, file: Buffer) {
  const m = multipart(file);
  const res = await ctx.app.inject({ method: 'POST', url, headers: { authorization: `Bearer ${user.token}`, ...m.headers }, payload: m.body });
  return { status: res.statusCode, body: res.json() as any };
}
