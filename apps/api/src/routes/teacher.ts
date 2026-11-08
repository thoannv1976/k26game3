import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { SKILLS, toCsv, type AssignmentDoc, type CourseDoc, type Skill, type UserDoc } from '@vq/shared';
import { parseBody } from '../app.js';
import { requireTenantMember, type Member } from '../auth.js';
import type { Deps } from '../deps.js';
import { ApiError, forbidden, notFound } from '../errors.js';
import { paths } from '../paths.js';
import { recordUsage, reserveAiCall } from '../quota.js';
import { getTenant } from '../tenants.js';
import { audit } from '../audit.js';
import { canViewStudent, coursesFor } from '../services/access.js';
import { ensureGraded, getResults, releaseAnswers, reviewAssessment } from '../services/grading.js';
import { syncGrade } from '../lti/gradeSync.js';
import { listApproved } from '../services/content.js';
import { getProfile } from '../services/profile.js';
import { ChampionshipInputSchema, closeChampionship, createChampionship, leaderboard, listManaged, updateChampionship } from '../services/championships.js';
import { withRetry } from '../services/retry.js';
import type { AssessmentDoc, AttemptDoc } from '../types.js';

const STAFF = ['teacher', 'school_admin'] as const;

function chunk<T>(arr: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

export async function assessmentsForStudents(deps: Deps, tenantId: string, uids: string[]): Promise<AssessmentDoc[]> {
  const out: AssessmentDoc[] = [];
  for (const c of chunk(uids, 30)) {
    if (!c.length) continue;
    const snap = await paths(deps.db).assessments(tenantId).where('uid', 'in', c).get();
    out.push(...snap.docs.map((d) => d.data() as AssessmentDoc));
  }
  return out.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function attemptsForStudents(deps: Deps, tenantId: string, uids: string[]): Promise<AttemptDoc[]> {
  const out: AttemptDoc[] = [];
  for (const c of chunk(uids, 30)) {
    if (!c.length) continue;
    const snap = await paths(deps.db).attempts(tenantId).where('uid', 'in', c).get();
    out.push(...snap.docs.map((d) => d.data() as AttemptDoc));
  }
  return out.sort((a, b) => b.lastActivityAt.localeCompare(a.lastActivityAt));
}

export async function usersByIds(deps: Deps, tenantId: string, uids: string[]): Promise<UserDoc[]> {
  if (!uids.length) return [];
  const p = paths(deps.db);
  const snaps = await deps.db.getAll(...uids.map((u) => p.user(tenantId, u)));
  return snaps.filter((s) => s.exists).map((s) => s.data() as UserDoc);
}

async function ownCourse(deps: Deps, m: Member, courseId: string): Promise<CourseDoc> {
  const c = (await paths(deps.db).course(m.tenantId, courseId).get()).data() as CourseDoc | undefined;
  if (!c) throw notFound('Course');
  if (m.role !== 'school_admin' && !c.teacherIds.includes(m.uid)) throw forbidden('You do not teach this course');
  return c;
}

/** Latest skill scores per student (last 5 results per skill, simple average) for the class heat map. */
function skillAverages(assessments: AssessmentDoc[]) {
  const out = {} as Record<Skill, number | null>;
  for (const s of SKILLS) {
    const xs = assessments.flatMap((a) => a.skills.filter((k) => k.skill === s && k.score !== null).map((k) => k.score as number)).slice(0, 5);
    out[s] = xs.length ? Math.round(xs.reduce((n, x) => n + x, 0) / xs.length) : null;
  }
  return out;
}

function classStats(students: UserDoc[], assessments: AssessmentDoc[]) {
  const perSkill = SKILLS.map((skill) => {
    const scores = assessments.flatMap((a) => a.skills.filter((s) => s.skill === skill && s.score !== null).map((s) => s.score as number));
    return { skill, results: scores.length, average: scores.length ? Math.round(scores.reduce((n, x) => n + x, 0) / scores.length) : null, below50: scores.filter((x) => x < 50).length };
  });
  const criteria: Record<string, { sum: number; max: number; n: number }> = {};
  for (const a of assessments) {
    for (const r of a.items) {
      if (r.skill !== 'writing' && r.skill !== 'speaking') continue;
      for (const [k, c] of Object.entries(r.criteria)) {
        if (c.score === null) continue;
        const key = `${r.skill}.${k}`;
        criteria[key] ??= { sum: 0, max: 0, n: 0 };
        criteria[key].sum += c.score;
        criteria[key].max += c.max;
        criteria[key].n++;
      }
    }
  }
  return {
    students: students.length,
    activeStudents: new Set(assessments.map((a) => a.uid)).size,
    perSkill,
    criteria: Object.fromEntries(Object.entries(criteria).map(([k, v]) => [k, { percent: Math.round((v.sum / v.max) * 100), results: v.n }])),
    pendingReview: assessments.filter((a) => a.pendingReview && !a.teacherReview).length,
  };
}

export async function teacherRoutes(app: FastifyInstance, deps: Deps) {
  const p = paths(deps.db);
  const idOf = (req: { params: unknown }) => (req.params as { id: string }).id;

  app.get('/api/teacher/classes', async (req) => {
    const m = requireTenantMember(req.authUser, [...STAFF]);
    const courses = await coursesFor(deps, m);
    return { classes: courses.map((c) => ({ id: c.id, code: c.code, name: c.name, studentCount: c.studentIds.length, teacherCount: c.teacherIds.length, monthlyBudgetUsd: c.monthlyBudgetUsd })) };
  });

  app.get('/api/teacher/classes/:id', async (req) => {
    const m = requireTenantMember(req.authUser, [...STAFF]);
    const c = await ownCourse(deps, m, idOf(req));
    const [students, assessments, attempts, assignSnap, quests, exams] = await Promise.all([
      usersByIds(deps, m.tenantId, c.studentIds),
      assessmentsForStudents(deps, m.tenantId, c.studentIds),
      attemptsForStudents(deps, m.tenantId, c.studentIds),
      p.assignments(m.tenantId).where('courseId', '==', c.id).get(),
      listApproved(deps, m.tenantId, 'quest'),
      listApproved(deps, m.tenantId, 'exam'),
    ]);
    const assignments = assignSnap.docs.map((d) => d.data() as AssignmentDoc).sort((a, b) => a.order - b.order);
    const name = (uid: string) => students.find((s) => s.uid === uid)?.displayName ?? uid;
    return {
      course: { id: c.id, code: c.code, name: c.name, monthlyBudgetUsd: c.monthlyBudgetUsd },
      quests: quests.map((q) => ({ id: q.content.id, skill: q.content.skill, level: q.content.level, title: q.content.title })),
      exams: exams.map((e) => ({ id: e.content.exam.id, title: e.content.exam.title, level: e.content.exam.level })),
      assignments: assignments.map((a) => ({ ...a, completedBy: a.kind === 'quest' ? students.filter((s) => s.completedQuestIds.includes(a.refId)).length : new Set(assessments.filter((x) => x.mode === 'exam' && x.refId === a.refId).map((x) => x.uid)).size })),
      stats: classStats(students, assessments),
      students: students
        .map((s) => {
          const mine = assessments.filter((a) => a.uid === s.uid);
          return {
            uid: s.uid,
            displayName: s.displayName,
            email: s.email,
            studentCode: s.studentCode ?? '',
            level: s.level,
            xp: s.xp,
            badges: s.badges.length,
            streakDays: s.streak?.days ?? 0,
            questsCompleted: s.completedQuestIds.length,
            skills: skillAverages(mine),
            results: mine.length,
            pendingReview: mine.filter((a) => a.pendingReview && !a.teacherReview).length,
            inProgress: attempts.filter((x) => x.uid === s.uid && x.status === 'active').length,
          };
        })
        .sort((a, b) => a.displayName.localeCompare(b.displayName)),
      inProgress: attempts
        .filter((a) => a.status === 'active')
        .slice(0, 100)
        .map((a) => ({ attemptId: a.id, uid: a.uid, studentName: name(a.uid), mode: a.mode, refId: a.refId, title: a.title, startedAt: a.startedAt, lastActivityAt: a.lastActivityAt })),
      results: assessments.slice(0, 200).map((a) => ({
        attemptId: a.id,
        uid: a.uid,
        studentName: name(a.uid),
        mode: a.mode,
        refId: a.refId,
        title: a.title,
        score: a.score,
        passed: a.passed,
        skills: a.skills.map((s) => ({ skill: s.skill, score: s.score, status: s.status })),
        aiStatus: a.aiStatus,
        pendingReview: a.pendingReview,
        reviewed: a.teacherReview?.status ?? null,
        answersReleased: a.mode === 'exam' ? Boolean(attempts.find((x) => x.id === a.id)?.answersReleased) : null,
        createdAt: a.createdAt,
      })),
    };
  });

  /* ---------------- learning path / assignments ---------------- */
  app.post('/api/teacher/assignments', async (req) => {
    const m = requireTenantMember(req.authUser, [...STAFF]);
    const body = parseBody(
      z.object({
        courseId: z.string().min(1),
        kind: z.enum(['quest', 'exam']),
        refId: z.string().regex(/^([LRWS]\d{2}|[a-z0-9_]+)$/),
        dueAt: z.iso.datetime().nullable().default(null),
        note: z.string().max(500).default(''),
        order: z.number().int().min(0).max(999).default(0),
      }),
      req.body,
    );
    await ownCourse(deps, m, body.courseId);
    const list = body.kind === 'quest' ? (await listApproved(deps, m.tenantId, 'quest')).map((q) => q.content.id) : (await listApproved(deps, m.tenantId, 'exam')).map((e) => e.content.exam.id);
    if (!list.includes(body.refId)) throw notFound(body.kind === 'quest' ? 'Quest' : 'Mock exam');
    const ref = p.assignments(m.tenantId).doc();
    const doc: AssignmentDoc = { id: ref.id, ...body, createdBy: m.uid, createdAt: deps.now().toISOString() };
    await ref.set(doc);
    await audit(deps, m, m.tenantId, 'assignment.create', ref.id, { courseId: body.courseId, kind: body.kind, refId: body.refId });
    return { assignment: doc };
  });

  app.delete('/api/teacher/assignments/:id', async (req) => {
    const m = requireTenantMember(req.authUser, [...STAFF]);
    const ref = p.assignments(m.tenantId).doc(idOf(req));
    const a = (await ref.get()).data() as AssignmentDoc | undefined;
    if (!a) throw notFound('Assignment');
    await ownCourse(deps, m, a.courseId);
    await ref.delete();
    await audit(deps, m, m.tenantId, 'assignment.delete', a.id, {});
    return { ok: true };
  });

  /* ---------------- students & results ---------------- */
  app.get('/api/teacher/students/:uid', async (req) => {
    const m = requireTenantMember(req.authUser, [...STAFF]);
    const { uid } = req.params as { uid: string };
    if (!(await canViewStudent(deps, m, uid))) throw forbidden('You cannot view this student');
    const [user] = await usersByIds(deps, m.tenantId, [uid]);
    if (!user) throw notFound('Student');
    const [profile, attempts] = await Promise.all([getProfile(deps, m, uid), attemptsForStudents(deps, m.tenantId, [uid])]);
    return {
      student: { uid: user.uid, displayName: user.displayName, email: user.email, studentCode: user.studentCode ?? '', level: user.level, xp: user.xp, badges: user.badges, streak: user.streak },
      profile,
      attempts: attempts.map((a) => ({ id: a.id, mode: a.mode, refId: a.refId, title: a.title, status: a.status, startedAt: a.startedAt, submittedAt: a.submittedAt })),
    };
  });

  app.get('/api/teacher/attempts/:id', async (req) => getResults(deps, requireTenantMember(req.authUser, [...STAFF]), idOf(req)));

  /** Writing/speaking results that still need a teacher (pronunciation, AI unavailable) in the teacher's classes. */
  app.get('/api/teacher/review-queue', async (req) => {
    const m = requireTenantMember(req.authUser, [...STAFF]);
    const q = parseBody(z.object({ courseId: z.string().optional() }), req.query);
    const courses = (await coursesFor(deps, m)).filter((c) => !q.courseId || c.id === q.courseId);
    const uids = [...new Set(courses.flatMap((c) => c.studentIds))];
    const [students, assessments] = await Promise.all([usersByIds(deps, m.tenantId, uids), assessmentsForStudents(deps, m.tenantId, uids)]);
    return {
      items: assessments
        .filter((a) => a.pendingReview && !a.teacherReview)
        .slice(0, 200)
        .map((a) => ({ attemptId: a.id, uid: a.uid, studentName: students.find((s) => s.uid === a.uid)?.displayName ?? a.uid, mode: a.mode, title: a.title, championshipId: a.championshipId, skills: a.skills.filter((s) => s.skill === 'writing' || s.skill === 'speaking').map((s) => ({ skill: s.skill, score: s.score, status: s.status })), aiStatus: a.aiStatus, createdAt: a.createdAt })),
    };
  });

  app.put('/api/teacher/assessments/:id/review', async (req) => {
    const m = requireTenantMember(req.authUser, [...STAFF]);
    const body = parseBody(
      z.object({ scores: z.record(z.string().max(60), z.record(z.string().max(40), z.number().min(0).max(25))).default({}), comment: z.string().max(3000).default('') }),
      req.body,
    );
    const id = idOf(req);
    const r = await reviewAssessment(deps, m, id, body);
    await syncGrade(deps, m.tenantId, r, r.teacherReview?.reviewedAt ?? deps.now().toISOString(), req.log);
    await audit(deps, m, m.tenantId, 'assessment.review', id, { status: r.teacherReview?.status, score: r.score });
    return { assessment: r };
  });

  /** Re-runs AI grading (e.g. after an AI outage), limited by the school quota per submission. */
  app.post('/api/teacher/assessments/:id/regrade', async (req) => {
    const m = requireTenantMember(req.authUser, [...STAFF]);
    const id = idOf(req);
    const a = (await p.attempt(m.tenantId, id).get()).data() as AttemptDoc | undefined;
    if (!a) throw notFound('Attempt');
    if (!(await canViewStudent(deps, m, a.uid)) || a.uid === m.uid) throw forbidden();
    const tenant = await getTenant(deps, m.tenantId);
    if (a.gradingAttempts >= tenant.quotas.aiGradingsPerSubmission + 1) throw new ApiError('GRADING_LIMIT', 'This submission has reached the grading limit.');
    const r = await ensureGraded(deps, m.tenantId, id, { force: true });
    await audit(deps, m, m.tenantId, 'assessment.regrade', id, r);
    return r;
  });

  /** Mock exams: show answers and explanations to students (after grading). */
  app.post('/api/teacher/exams/release', async (req) => {
    const m = requireTenantMember(req.authUser, [...STAFF]);
    const body = parseBody(z.object({ attemptIds: z.array(z.string().uuid()).max(300).optional(), courseId: z.string().optional(), examId: z.string().optional() }), req.body);
    let ids = body.attemptIds ?? [];
    if (body.courseId) {
      const c = await ownCourse(deps, m, body.courseId);
      ids = (await attemptsForStudents(deps, m.tenantId, c.studentIds)).filter((a) => a.mode === 'exam' && (!body.examId || a.refId === body.examId)).map((a) => a.id);
    }
    const r = await releaseAnswers(deps, m, ids);
    await audit(deps, m, m.tenantId, 'exam.release_answers', body.courseId ?? 'attempts', { ...r, examId: body.examId ?? null });
    return r;
  });

  /* ---------------- learning analytics ---------------- */
  app.get('/api/teacher/analytics', async (req) => {
    const m = requireTenantMember(req.authUser, [...STAFF]);
    const q = parseBody(z.object({ courseId: z.string().min(1) }), req.query);
    const c = await ownCourse(deps, m, q.courseId);
    const [students, assessments] = await Promise.all([usersByIds(deps, m.tenantId, c.studentIds), assessmentsForStudents(deps, m.tenantId, c.studentIds)]);
    return { course: { id: c.id, name: c.name }, stats: classStats(students, assessments) };
  });

  app.post('/api/teacher/analytics/summary', async (req) => {
    const m = requireTenantMember(req.authUser, [...STAFF]);
    const body = parseBody(z.object({ courseId: z.string().min(1) }), req.body);
    const c = await ownCourse(deps, m, body.courseId);
    const tenant = await getTenant(deps, m.tenantId);
    const [students, assessments] = await Promise.all([usersByIds(deps, m.tenantId, c.studentIds), assessmentsForStudents(deps, m.tenantId, c.studentIds)]);
    await deps.db.runTransaction(async (tx) => (await reserveAiCall(deps, tx, tenant, m.uid, c.id, c.monthlyBudgetUsd)).commit());
    const model = tenant.aiConfig.model;
    const started = Date.now();
    try {
      const r = await withRetry(() => deps.ai.analytics({ audience: 'teacher', stats: classStats(students, assessments), model, maxOutputTokens: Math.min(1500, tenant.quotas.maxOutputTokens) }), { retries: deps.config.aiMaxRetries, timeoutMs: deps.config.aiTimeoutMs });
      void recordUsage(deps, tenant, { kind: 'analytics', uid: m.uid, sessionId: null, courseId: c.id, model, ...r.usage, ok: true, latencyMs: Date.now() - started });
      return { summary: r.output, generatedAt: deps.now().toISOString() };
    } catch (e) {
      void recordUsage(deps, tenant, { kind: 'analytics', uid: m.uid, sessionId: null, courseId: c.id, model, ok: false, latencyMs: Date.now() - started });
      throw new ApiError('INTERNAL', 'The AI summary is not available right now.', { cause: (e as Error).message });
    }
  });

  /* ---------------- championships ---------------- */
  app.get('/api/teacher/championships', async (req) => ({ championships: await listManaged(deps, requireTenantMember(req.authUser, [...STAFF])) }));

  app.post('/api/teacher/championships', async (req) => {
    const m = requireTenantMember(req.authUser, [...STAFF]);
    const c = await createChampionship(deps, m, parseBody(ChampionshipInputSchema, req.body));
    await audit(deps, m, m.tenantId, 'championship.create', c.id, { name: c.name, type: c.type });
    return { championship: c };
  });

  app.put('/api/teacher/championships/:id', async (req) => {
    const m = requireTenantMember(req.authUser, [...STAFF]);
    const c = await updateChampionship(deps, m, idOf(req), parseBody(ChampionshipInputSchema, req.body));
    await audit(deps, m, m.tenantId, 'championship.update', c.id, {});
    return { championship: c };
  });

  app.post('/api/teacher/championships/:id/close', async (req) => {
    const m = requireTenantMember(req.authUser, [...STAFF]);
    const r = await closeChampionship(deps, m, idOf(req));
    await audit(deps, m, m.tenantId, 'championship.close', idOf(req), r);
    return r;
  });

  app.get('/api/teacher/championships/:id/leaderboard', async (req) => leaderboard(deps, requireTenantMember(req.authUser, [...STAFF]), idOf(req), null));

  /* ---------------- export ---------------- */
  app.get('/api/teacher/export.csv', async (req, reply) => {
    const m = requireTenantMember(req.authUser, [...STAFF]);
    const q = parseBody(z.object({ courseId: z.string().min(1) }), req.query);
    const c = await ownCourse(deps, m, q.courseId);
    const [students, assessments] = await Promise.all([usersByIds(deps, m.tenantId, c.studentIds), assessmentsForStudents(deps, m.tenantId, c.studentIds)]);
    const headers = ['student_code', 'student_name', 'email', 'mode', 'ref_id', 'title', 'level', 'graded_at', 'listening', 'reading', 'writing', 'speaking', 'overall_or_score', 'passed', 'ai_status', 'pending_review', 'teacher_review', 'teacher_comment', 'attempt_id'];
    const rows = assessments.map((a) => {
      const s = students.find((x) => x.uid === a.uid);
      const sk = (k: Skill) => {
        const r = a.skills.find((x) => x.skill === k);
        return r ? (r.score ?? 'N/A') : '';
      };
      return [
        s?.studentCode ?? '', s?.displayName ?? a.uid, s?.email ?? '', a.mode, a.refId, a.title, a.level, a.createdAt, sk('listening'), sk('reading'), sk('writing'), sk('speaking'),
        a.score ?? 'N/A', a.passed ? 'yes' : 'no', a.aiStatus, a.pendingReview ? 'yes' : 'no', a.teacherReview?.status ?? 'pending', a.teacherReview?.comment ?? '', a.id,
      ];
    });
    await audit(deps, m, m.tenantId, 'export.results', c.id, { rows: rows.length });
    return reply.header('Content-Type', 'text/csv; charset=utf-8').header('Content-Disposition', `attachment; filename="vstep-quest-results-${c.code}.csv"`).send(toCsv(headers, rows));
  });
}
