import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { FakeAiProvider } from '@vq/ai';
import { DEFAULT_AI_CONFIG, DEFAULT_QUOTAS, type Role, type TenantDoc } from '@vq/shared';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { createDeps, type Deps } from '../src/deps.js';
import { paths } from '../src/paths.js';
import { seedBuiltinCases } from '../src/services/cases.js';
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

export async function makeApp(): Promise<TestCtx> {
  const config = loadConfig({ env: 'test', projectId: process.env.GCLOUD_PROJECT ?? 'demo-ed', aiProvider: 'fake', aiMaxRetries: 1, aiTimeoutMs: 2000, gradingTimeoutMs: 3000, rateLimitPerMinute: 100000 });
  const ai = new FakeAiProvider();
  const deps = createDeps(config, { ai });
  const app = await buildApp(deps, { logger: false });
  return { app, deps, ai };
}

export async function createTenant(deps: Deps, opts: { approve?: boolean; quotas?: Partial<TenantDoc['quotas']>; id?: string } = {}): Promise<TenantDoc> {
  const id = opts.id ?? `t-${randomUUID().slice(0, 8)}`;
  const tenant: TenantDoc = {
    id,
    name: `Test University ${id}`,
    allowedEmailDomains: [],
    quotas: { ...DEFAULT_QUOTAS, attemptsPerCasePerDay: 100, ...opts.quotas },
    aiConfig: DEFAULT_AI_CONFIG,
    active: true,
    createdAt: new Date().toISOString(),
  };
  await paths(deps.db).tenant(id).set(tenant);
  await seedBuiltinCases(deps, id, opts.approve === false ? {} : { approvedBy: 'test' });
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
