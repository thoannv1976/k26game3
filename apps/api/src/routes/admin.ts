import type { FastifyInstance } from 'fastify';
import { FieldValue } from 'firebase-admin/firestore';
import { z } from 'zod';
import { AiConfigSchema, LevelSchema, QuotaConfigSchema, RoleSchema, toCsv, type CourseDoc, type UserDoc } from '@vq/shared';
import { parseBody } from '../app.js';
import { requireTenantMember } from '../auth.js';
import type { Deps } from '../deps.js';
import { ApiError, notFound } from '../errors.js';
import { paths } from '../paths.js';
import { getTenant } from '../tenants.js';
import { audit } from '../audit.js';
import { monthKey, recordUsage } from '../quota.js';
import { NewUserSchema, deleteUserData, parseUserCsv, provisionUser } from '../services/users.js';
import { approveContent, checkContent, generateItem, getContentAdmin, listContent, saveDraft, seedBuiltinContent, setArchived } from '../services/content.js';
import { ItemRequestSchema } from '@vq/ai';

const ADMIN = ['school_admin'] as const;
const CONTENT_EDITORS = ['teacher', 'school_admin'] as const;

export async function adminRoutes(app: FastifyInstance, deps: Deps) {
  const p = paths(deps.db);

  /* ---------------- users ---------------- */
  app.get('/api/admin/users', async (req) => {
    const m = requireTenantMember(req.authUser, [...ADMIN]);
    const snap = await p.users(m.tenantId).limit(2000).get();
    return {
      users: snap.docs
        .map((d) => d.data() as UserDoc)
        .map((u) => ({ uid: u.uid, email: u.email, displayName: u.displayName, role: u.role, studentCode: u.studentCode ?? '', level: u.level, courseIds: u.courseIds, xp: u.xp, disabled: u.disabled, createdAt: u.createdAt }))
        .sort((a, b) => a.displayName.localeCompare(b.displayName)),
    };
  });

  app.post('/api/admin/users', async (req) => {
    const m = requireTenantMember(req.authUser, [...ADMIN]);
    const body = parseBody(NewUserSchema, req.body);
    const r = await provisionUser(deps, { id: m.tenantId }, body);
    await audit(deps, m, m.tenantId, 'user.create', r.uid, { email: body.email, role: body.role });
    return { uid: r.uid, created: r.created, temporaryPassword: r.password };
  });

  app.post('/api/admin/users/import', async (req) => {
    const m = requireTenantMember(req.authUser, [...ADMIN]);
    const text = typeof req.body === 'string' ? req.body : parseBody(z.object({ csv: z.string().max(500_000) }), req.body).csv;
    const courses = (await p.courses(m.tenantId).get()).docs.map((d) => d.data() as CourseDoc);
    const { rows, errors } = parseUserCsv(text, courses);
    if (rows.length > 1000) throw new ApiError('VALIDATION', 'Import at most 1000 users at a time');
    const results: { email: string; uid?: string; created?: boolean; temporaryPassword?: string | null; error?: string }[] = [];
    for (const row of rows) {
      try {
        const r = await provisionUser(deps, { id: m.tenantId }, row);
        results.push({ email: row.email, uid: r.uid, created: r.created, temporaryPassword: r.password });
      } catch (e) {
        results.push({ email: row.email, error: (e as Error).message });
      }
    }
    await audit(deps, m, m.tenantId, 'user.import', 'csv', { rows: rows.length, errors: errors.length });
    return { imported: results.filter((r) => r.uid).length, results, errors };
  });

  app.patch('/api/admin/users/:uid', async (req) => {
    const m = requireTenantMember(req.authUser, [...ADMIN]);
    const { uid } = req.params as { uid: string };
    const body = parseBody(
      z.object({
        displayName: z.string().trim().min(1).max(120).optional(),
        role: RoleSchema.exclude(['platform_admin']).optional(),
        level: LevelSchema.optional(),
        studentCode: z.string().max(40).optional(),
        disabled: z.boolean().optional(),
        resetPassword: z.boolean().optional(),
      }),
      req.body,
    );
    const ref = p.user(m.tenantId, uid);
    const user = (await ref.get()).data() as UserDoc | undefined;
    if (!user) throw notFound('User');
    if (uid === m.uid && (body.role || body.disabled)) throw new ApiError('VALIDATION', 'You cannot change your own role or disable yourself');
    const { resetPassword, ...fields } = body;
    await ref.update(fields);
    if (body.role) await deps.auth.setCustomUserClaims(uid, { tenantId: m.tenantId, role: body.role });
    if (body.disabled !== undefined) {
      await deps.auth.updateUser(uid, { disabled: body.disabled });
      if (body.disabled) await deps.auth.revokeRefreshTokens(uid);
    }
    if (body.role) await deps.auth.revokeRefreshTokens(uid); // force a token refresh with the new role
    let temporaryPassword: string | null = null;
    if (resetPassword) {
      const { generatePassword } = await import('../services/users.js');
      temporaryPassword = generatePassword();
      await deps.auth.updateUser(uid, { password: temporaryPassword });
    }
    await audit(deps, m, m.tenantId, 'user.update', uid, { ...fields, resetPassword: Boolean(resetPassword) });
    return { ok: true, temporaryPassword };
  });

  app.delete('/api/admin/users/:uid', async (req) => {
    const m = requireTenantMember(req.authUser, [...ADMIN]);
    const { uid } = req.params as { uid: string };
    if (uid === m.uid) throw new ApiError('VALIDATION', 'You cannot delete yourself');
    const user = (await p.user(m.tenantId, uid).get()).data() as UserDoc | undefined;
    if (!user) throw notFound('User');
    const r = await deleteUserData(deps, m.tenantId, uid);
    await audit(deps, m, m.tenantId, 'user.delete_data', uid, { email: user.email, sessions: r.sessions });
    return { ok: true, ...r };
  });

  /* ---------------- courses ---------------- */
  app.get('/api/admin/courses', async (req) => {
    const m = requireTenantMember(req.authUser, [...ADMIN]);
    const snap = await p.courses(m.tenantId).get();
    return { courses: snap.docs.map((d) => d.data() as CourseDoc).sort((a, b) => a.code.localeCompare(b.code)) };
  });

  const CourseInput = z.object({
    code: z.string().trim().min(1).max(40),
    name: z.string().trim().min(1).max(200),
    teacherIds: z.array(z.string()).max(50).default([]),
    studentIds: z.array(z.string()).max(1000).default([]),
    monthlyBudgetUsd: z.number().min(0).max(100000).nullable().default(null),
  });

  async function syncMembership(tenantId: string, courseId: string, before: CourseDoc | null, after: { teacherIds: string[]; studentIds: string[] }) {
    const prev = new Set([...(before?.teacherIds ?? []), ...(before?.studentIds ?? [])]);
    const next = new Set([...after.teacherIds, ...after.studentIds]);
    const batch = deps.db.batch();
    for (const uid of next) if (!prev.has(uid)) batch.set(p.user(tenantId, uid), { courseIds: FieldValue.arrayUnion(courseId) }, { merge: true });
    for (const uid of prev) if (!next.has(uid)) batch.set(p.user(tenantId, uid), { courseIds: FieldValue.arrayRemove(courseId) }, { merge: true });
    await batch.commit();
  }

  async function validateMembers(tenantId: string, ids: string[], role: 'teacher' | 'student') {
    if (!ids.length) return;
    const snaps = await deps.db.getAll(...ids.map((id) => p.user(tenantId, id)));
    for (const s of snaps) {
      const u = s.data() as UserDoc | undefined;
      if (!u) throw new ApiError('VALIDATION', `Unknown user ${s.id}`);
      if (role === 'teacher' && !['teacher', 'school_admin'].includes(u.role)) throw new ApiError('VALIDATION', `${u.email} is not a teacher`);
      if (role === 'student' && u.role !== 'student') throw new ApiError('VALIDATION', `${u.email} is not a student`);
    }
  }

  app.post('/api/admin/courses', async (req) => {
    const m = requireTenantMember(req.authUser, [...ADMIN]);
    const body = parseBody(CourseInput, req.body);
    await validateMembers(m.tenantId, body.teacherIds, 'teacher');
    await validateMembers(m.tenantId, body.studentIds, 'student');
    const ref = p.courses(m.tenantId).doc();
    const doc: CourseDoc = { id: ref.id, tenantId: m.tenantId, ...body, createdAt: deps.now().toISOString() };
    await ref.set(doc);
    await syncMembership(m.tenantId, ref.id, null, doc);
    await audit(deps, m, m.tenantId, 'course.create', ref.id, { code: body.code });
    return { course: doc };
  });

  app.patch('/api/admin/courses/:id', async (req) => {
    const m = requireTenantMember(req.authUser, [...ADMIN]);
    const body = parseBody(CourseInput.partial(), req.body);
    const ref = p.course(m.tenantId, (req.params as { id: string }).id);
    const before = (await ref.get()).data() as CourseDoc | undefined;
    if (!before) throw notFound('Course');
    if (body.teacherIds) await validateMembers(m.tenantId, body.teacherIds, 'teacher');
    if (body.studentIds) await validateMembers(m.tenantId, body.studentIds, 'student');
    const after = { ...before, ...body };
    await ref.set(after);
    await syncMembership(m.tenantId, before.id, before, after);
    await audit(deps, m, m.tenantId, 'course.update', before.id, { fields: Object.keys(body) });
    return { course: after };
  });

  app.delete('/api/admin/courses/:id', async (req) => {
    const m = requireTenantMember(req.authUser, [...ADMIN]);
    const ref = p.course(m.tenantId, (req.params as { id: string }).id);
    const before = (await ref.get()).data() as CourseDoc | undefined;
    if (!before) throw notFound('Course');
    await syncMembership(m.tenantId, before.id, before, { teacherIds: [], studentIds: [] });
    await ref.delete();
    await audit(deps, m, m.tenantId, 'course.delete', before.id, { code: before.code });
    return { ok: true };
  });

  /* ---------------- content bank: items, quests, mock exams ---------------- */
  const Kind = z.enum(['item', 'quest', 'exam']);
  const kindOf = (req: { params: unknown }) => parseBody(Kind, (req.params as { kind: string }).kind);
  const cid = (req: { params: unknown }) => parseBody(z.string().regex(/^[A-Za-z0-9_]{2,60}$/), (req.params as { id: string }).id);

  app.get('/api/admin/content/:kind', async (req) => {
    const m = requireTenantMember(req.authUser, [...CONTENT_EDITORS]);
    return { items: await listContent(deps, m.tenantId, kindOf(req)) };
  });

  app.get('/api/admin/content/:kind/:id', async (req) => {
    const m = requireTenantMember(req.authUser, [...CONTENT_EDITORS]);
    return getContentAdmin(deps, m.tenantId, kindOf(req), cid(req));
  });

  /** Dry-run consistency check without saving. */
  app.post('/api/admin/content/:kind/check', async (req) => {
    const m = requireTenantMember(req.authUser, [...CONTENT_EDITORS]);
    const body = parseBody(z.object({ content: z.unknown() }), req.body);
    const c = await checkContent(deps, m.tenantId, kindOf(req), body.content);
    return { ok: c.ok, errors: c.errors, warnings: c.warnings };
  });

  app.put('/api/admin/content/:kind/:id', async (req) => {
    const m = requireTenantMember(req.authUser, [...CONTENT_EDITORS]);
    const body = parseBody(z.object({ content: z.unknown(), note: z.string().max(500).default('') }), req.body);
    const kind = kindOf(req);
    const id = cid(req);
    const r = await saveDraft(deps, m.tenantId, kind, id, body.content, m.uid, body.note);
    await audit(deps, m, m.tenantId, 'content.draft', `${kind}:${id}`, { version: r.version, ok: r.check.ok });
    return r;
  });

  /** Approval: teachers approve items and quests; mock exams need a school admin (expert sign-off). */
  app.post('/api/admin/content/:kind/:id/approve', async (req) => {
    const kind = kindOf(req);
    const m = requireTenantMember(req.authUser, kind === 'exam' ? [...ADMIN] : [...CONTENT_EDITORS]);
    const body = parseBody(z.object({ version: z.number().int().min(1) }), req.body);
    const id = cid(req);
    const r = await approveContent(deps, m.tenantId, kind, id, body.version, m.uid);
    await audit(deps, m, m.tenantId, 'content.approve', `${kind}:${id}`, r);
    return r;
  });

  app.post('/api/admin/content/:kind/:id/archive', async (req) => {
    const m = requireTenantMember(req.authUser, [...ADMIN]);
    const body = parseBody(z.object({ archived: z.boolean() }), req.body);
    const kind = kindOf(req);
    const id = cid(req);
    const r = await setArchived(deps, m.tenantId, kind, id, body.archived);
    await audit(deps, m, m.tenantId, 'content.archive', `${kind}:${id}`, r);
    return r;
  });

  app.post('/api/admin/content/seed', async (req) => {
    const m = requireTenantMember(req.authUser, [...ADMIN]);
    const body = parseBody(z.object({ approve: z.boolean().default(true), approveExams: z.boolean().default(false) }), req.body ?? {});
    const r = await seedBuiltinContent(deps, m.tenantId, { approvedBy: body.approve ? m.uid : undefined, approveExams: body.approveExams });
    await audit(deps, m, m.tenantId, 'content.seed', 'builtin', r);
    return r;
  });

  /** AI Question Generator: creates a DRAFT item for teacher review (never published automatically). */
  app.post('/api/admin/content/generate', async (req) => {
    const m = requireTenantMember(req.authUser, [...CONTENT_EDITORS]);
    const body = parseBody(ItemRequestSchema, req.body);
    const r = await generateItem(deps, m, body);
    await audit(deps, m, m.tenantId, 'content.generate', body.id, { topic: body.topic, ok: r.check.ok });
    return r;
  });

  /* ---------------- AI configuration & quotas ---------------- */
  app.get('/api/admin/settings', async (req) => {
    const m = requireTenantMember(req.authUser, [...ADMIN]);
    const t = await getTenant(deps, m.tenantId);
    return { tenant: { id: t.id, name: t.name, allowedEmailDomains: t.allowedEmailDomains }, aiConfig: t.aiConfig, quotas: t.quotas, modelOverride: deps.config.geminiModel };
  });

  app.put('/api/admin/ai-config', async (req) => {
    const m = requireTenantMember(req.authUser, [...ADMIN]);
    const body = parseBody(AiConfigSchema, req.body);
    await p.tenant(m.tenantId).update({ aiConfig: body });
    await audit(deps, m, m.tenantId, 'settings.ai_config', m.tenantId, body as unknown as Record<string, unknown>);
    return { aiConfig: body };
  });

  app.put('/api/admin/quotas', async (req) => {
    const m = requireTenantMember(req.authUser, [...ADMIN]);
    const body = parseBody(QuotaConfigSchema, req.body);
    await p.tenant(m.tenantId).update({ quotas: body });
    await audit(deps, m, m.tenantId, 'settings.quotas', m.tenantId, body);
    return { quotas: body };
  });

  app.put('/api/admin/school', async (req) => {
    const m = requireTenantMember(req.authUser, [...ADMIN]);
    const body = parseBody(z.object({ name: z.string().trim().min(2).max(200), allowedEmailDomains: z.array(z.string().regex(/^[a-z0-9.-]+\.[a-z]{2,}$/)).max(10) }), req.body);
    await p.tenant(m.tenantId).update(body);
    await audit(deps, m, m.tenantId, 'settings.school', m.tenantId, body);
    return body;
  });

  app.post('/api/admin/health/ai', async (req) => {
    const m = requireTenantMember(req.authUser, [...ADMIN]);
    const t = await getTenant(deps, m.tenantId);
    const model = deps.config.geminiModel ?? t.aiConfig.model;
    const started = Date.now();
    try {
      const reply = await deps.ai.ping(model);
      void recordUsage(deps, t, { kind: 'ping', uid: m.uid, sessionId: null, courseId: null, model, inputTokens: 10, outputTokens: 5, ok: true });
      return { ok: true, provider: deps.ai.name, model, reply, latencyMs: Date.now() - started };
    } catch (e) {
      return { ok: false, provider: deps.ai.name, model, error: (e as Error).message, latencyMs: Date.now() - started };
    }
  });

  /* ---------------- usage & reports ---------------- */
  async function usageFor(tenantId: string, month: string) {
    const snap = await p.usageLogs(tenantId).where('month', '==', month).limit(20000).get();
    const byKind: Record<string, { calls: number; costUsd: number; failures: number }> = {};
    const byDay: Record<string, { calls: number; costUsd: number }> = {};
    const byUser: Record<string, { calls: number; costUsd: number }> = {};
    let inputTokens = 0, outputTokens = 0, costUsd = 0;
    for (const d of snap.docs) {
      const u = d.data() as { kind: string; day: string; uid: string; costUsd: number; ok: boolean; inputTokens?: number; outputTokens?: number };
      (byKind[u.kind] ??= { calls: 0, costUsd: 0, failures: 0 }).calls++;
      byKind[u.kind]!.costUsd += u.costUsd;
      if (!u.ok) byKind[u.kind]!.failures++;
      (byDay[u.day] ??= { calls: 0, costUsd: 0 }).calls++;
      byDay[u.day]!.costUsd += u.costUsd;
      (byUser[u.uid] ??= { calls: 0, costUsd: 0 }).calls++;
      byUser[u.uid]!.costUsd += u.costUsd;
      inputTokens += u.inputTokens ?? 0;
      outputTokens += u.outputTokens ?? 0;
      costUsd += u.costUsd;
    }
    return { month, entries: snap.size, totals: { costUsd, inputTokens, outputTokens }, byKind, byDay, byUser };
  }

  app.get('/api/admin/usage', async (req) => {
    const m = requireTenantMember(req.authUser, [...ADMIN]);
    const q = parseBody(z.object({ month: z.string().regex(/^\d{6}$/).optional() }), req.query);
    const month = q.month ?? monthKey(deps.now());
    const [t, usage, users] = await Promise.all([getTenant(deps, m.tenantId), usageFor(m.tenantId, month), p.users(m.tenantId).get()]);
    const names = new Map(users.docs.map((d) => [d.id, (d.data() as UserDoc).displayName]));
    const topUsers = Object.entries(usage.byUser)
      .map(([uid, v]) => ({ uid, name: names.get(uid) ?? uid, ...v }))
      .sort((a, b) => b.costUsd - a.costUsd)
      .slice(0, 20);
    const budget = t.quotas.monthlyBudgetUsd;
    return {
      ...usage,
      byUser: undefined,
      topUsers,
      budget: { monthlyBudgetUsd: budget, usedRatio: budget > 0 ? usage.totals.costUsd / budget : 0, warnRatio: t.quotas.warnRatio, policy: t.quotas.onBudgetExceeded },
      note: 'Costs are estimates from the configured price table; check the Google Cloud billing report for actual charges.',
    };
  });

  app.get('/api/admin/usage.csv', async (req, reply) => {
    const m = requireTenantMember(req.authUser, [...ADMIN]);
    const q = parseBody(z.object({ month: z.string().regex(/^\d{6}$/).optional() }), req.query);
    const month = q.month ?? monthKey(deps.now());
    const snap = await p.usageLogs(m.tenantId).where('month', '==', month).limit(20000).get();
    const rows = snap.docs.map((d) => {
      const u = d.data();
      return [u.at, u.kind, u.uid, u.courseId ?? '', u.sessionId ?? '', u.model ?? '', u.inputTokens ?? 0, u.outputTokens ?? 0, Number(u.costUsd ?? 0).toFixed(6), u.ok ? 'ok' : 'failed'];
    });
    await audit(deps, m, m.tenantId, 'export.usage', month, { rows: rows.length });
    return reply
      .header('Content-Type', 'text/csv; charset=utf-8')
      .header('Content-Disposition', `attachment; filename="usage-${month}.csv"`)
      .send(toCsv(['at', 'kind', 'uid', 'course_id', 'session_id', 'model', 'input_tokens', 'output_tokens', 'cost_usd', 'status'], rows));
  });

  app.get('/api/admin/audit-logs', async (req) => {
    const m = requireTenantMember(req.authUser, [...ADMIN]);
    const snap = await p.auditLogs(m.tenantId).orderBy('at', 'desc').limit(200).get();
    return { logs: snap.docs.map((d) => ({ id: d.id, ...d.data() })) };
  });

  app.get('/api/admin/reports/overview', async (req) => {
    const m = requireTenantMember(req.authUser, [...ADMIN]);
    const [users, attempts, assessments] = await Promise.all([
      p.users(m.tenantId).count().get(),
      p.attempts(m.tenantId).count().get(),
      p.assessments(m.tenantId).orderBy('createdAt', 'desc').limit(500).get(),
    ]);
    const list = assessments.docs.map((d) => d.data() as { mode: string; refId: string; score: number | null; passed: boolean; pendingReview: boolean; teacherReview: unknown });
    const byRef: Record<string, { mode: string; results: number; passed: number; avgScore: number | null }> = {};
    for (const a of list) {
      const b = (byRef[a.refId] ??= { mode: a.mode, results: 0, passed: 0, avgScore: null });
      if (a.score !== null) b.avgScore = Math.round(((b.avgScore ?? 0) * b.results + a.score) / (b.results + 1));
      b.results++;
      if (a.passed) b.passed++;
    }
    return {
      users: users.data().count,
      attempts: attempts.data().count,
      recentResults: list.length,
      pendingReview: list.filter((a) => a.pendingReview && !a.teacherReview).length,
      reviewed: list.filter((a) => a.teacherReview).length,
      byRef,
    };
  });
}
