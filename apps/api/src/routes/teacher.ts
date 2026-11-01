import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { toCsv, type AssignmentDoc, type CourseDoc, type UserDoc } from '@vq/shared';
import { parseBody } from '../app.js';
import { requireTenantMember, type Member } from '../auth.js';
import type { Deps } from '../deps.js';
import { ApiError, forbidden, notFound } from '../errors.js';
import { paths } from '../paths.js';
import { getTenant, listApprovedCases } from '../tenants.js';
import { audit } from '../audit.js';
import { canViewStudent, coursesFor } from '../services/access.js';
import { applyReview, ensureGraded, getResults, reviewAssessment } from '../services/grading.js';
import { getInvestigation } from '../services/investigation.js';
import { CRITERION_KEYS, type AssessmentDoc, type CriterionKey, type SessionDoc } from '../types.js';

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

export async function sessionsForStudents(deps: Deps, tenantId: string, uids: string[]): Promise<SessionDoc[]> {
  const out: SessionDoc[] = [];
  for (const c of chunk(uids, 30)) {
    if (!c.length) continue;
    const snap = await paths(deps.db).sessions(tenantId).where('uid', 'in', c).get();
    out.push(...snap.docs.map((d) => d.data() as SessionDoc));
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

function progressSummary(s: SessionDoc) {
  const st = s.state;
  return {
    sessionId: s.id,
    caseId: s.caseId,
    status: s.status,
    startedAt: s.startedAt,
    lastActivityAt: s.lastActivityAt,
    documentsOpened: st.openedDocumentIds.length,
    questionsAnswered: Object.keys(st.answers).length,
    evidenceCollected: Object.keys(st.collected).length,
    factsRevealed: st.revealedFactIds.length,
    interviews: s.interviewTotal,
    hintsUsed: Object.values(st.hintsUsed).reduce((a, b) => a + b, 0),
    conclusionChosen: Boolean(st.conclusion),
  };
}

export async function teacherRoutes(app: FastifyInstance, deps: Deps) {
  const p = paths(deps.db);

  app.get('/api/teacher/classes', async (req) => {
    const m = requireTenantMember(req.authUser, [...STAFF]);
    const courses = await coursesFor(deps, m);
    return { classes: courses.map((c) => ({ id: c.id, code: c.code, name: c.name, studentCount: c.studentIds.length, teacherCount: c.teacherIds.length, monthlyBudgetUsd: c.monthlyBudgetUsd })) };
  });

  app.get('/api/teacher/classes/:id', async (req) => {
    const m = requireTenantMember(req.authUser, [...STAFF]);
    const c = await ownCourse(deps, m, (req.params as { id: string }).id);
    const [students, assessments, sessions, assignSnap, cases] = await Promise.all([
      usersByIds(deps, m.tenantId, c.studentIds),
      assessmentsForStudents(deps, m.tenantId, c.studentIds),
      sessionsForStudents(deps, m.tenantId, c.studentIds),
      p.assignments(m.tenantId).where('courseId', '==', c.id).get(),
      listApprovedCases(deps, m.tenantId),
    ]);
    const assignments = assignSnap.docs.map((d) => d.data() as AssignmentDoc);
    const name = (uid: string) => students.find((s) => s.uid === uid)?.displayName ?? uid;
    return {
      course: { id: c.id, code: c.code, name: c.name, monthlyBudgetUsd: c.monthlyBudgetUsd },
      cases: cases.map(({ dossier: d }) => ({ id: d.id, title: d.title, level: d.level })),
      assignments: assignments.map((a) => ({ ...a, submittedBy: new Set(assessments.filter((x) => x.caseId === a.caseId).map((x) => x.uid)).size })),
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
            detectivePoints: s.detectivePoints ?? 0,
            casesSolved: s.completedCaseIds?.length ?? 0,
            reports: mine.length,
            averagePercent: mine.length ? Math.round(mine.reduce((n, a) => n + a.finalPercent, 0) / mine.length) : null,
            pendingReview: mine.filter((a) => !a.teacherReview).length,
            inProgress: sessions.filter((x) => x.uid === s.uid && x.status === 'active').length,
          };
        })
        .sort((a, b) => a.displayName.localeCompare(b.displayName)),
      inProgress: sessions.filter((s) => s.status === 'active').slice(0, 100).map((s) => ({ ...progressSummary(s), uid: s.uid, studentName: name(s.uid) })),
      results: assessments.slice(0, 200).map((a) => ({
        sessionId: a.sessionId,
        uid: a.uid,
        studentName: name(a.uid),
        caseId: a.caseId,
        level: a.level,
        solved: a.solved,
        percent: a.percent,
        finalPercent: a.finalPercent,
        aiStatus: a.aiStatus,
        reviewed: a.teacherReview?.status ?? null,
        createdAt: a.createdAt,
      })),
    };
  });

  app.post('/api/teacher/assignments', async (req) => {
    const m = requireTenantMember(req.authUser, [...STAFF]);
    const body = parseBody(
      z.object({ courseId: z.string().min(1), caseId: z.string().regex(/^CASE\d{2,3}$/), dueAt: z.iso.datetime().nullable().default(null), note: z.string().max(500).default('') }),
      req.body,
    );
    await ownCourse(deps, m, body.courseId);
    if (!(await listApprovedCases(deps, m.tenantId)).some((x) => x.dossier.id === body.caseId)) throw notFound('Case');
    const ref = p.assignments(m.tenantId).doc();
    const doc: AssignmentDoc = { id: ref.id, ...body, createdBy: m.uid, createdAt: deps.now().toISOString() };
    await ref.set(doc);
    await audit(deps, m, m.tenantId, 'assignment.create', ref.id, { courseId: body.courseId, caseId: body.caseId });
    return { assignment: doc };
  });

  app.delete('/api/teacher/assignments/:id', async (req) => {
    const m = requireTenantMember(req.authUser, [...STAFF]);
    const ref = p.assignments(m.tenantId).doc((req.params as { id: string }).id);
    const a = (await ref.get()).data() as AssignmentDoc | undefined;
    if (!a) throw notFound('Assignment');
    await ownCourse(deps, m, a.courseId);
    await ref.delete();
    await audit(deps, m, m.tenantId, 'assignment.delete', a.id, {});
    return { ok: true };
  });

  app.get('/api/teacher/students/:uid', async (req) => {
    const m = requireTenantMember(req.authUser, [...STAFF]);
    const { uid } = req.params as { uid: string };
    if (!(await canViewStudent(deps, m, uid))) throw forbidden('You cannot view this student');
    const [user] = await usersByIds(deps, m.tenantId, [uid]);
    if (!user) throw notFound('Student');
    const [sessions, assessments] = await Promise.all([sessionsForStudents(deps, m.tenantId, [uid]), assessmentsForStudents(deps, m.tenantId, [uid])]);
    return {
      student: { uid: user.uid, displayName: user.displayName, email: user.email, studentCode: user.studentCode ?? '', level: user.level, xp: user.xp, detectivePoints: user.detectivePoints ?? 0, achievements: user.achievements },
      sessions: sessions.map((s) => {
        const a = assessments.find((x) => x.sessionId === s.id);
        return { ...progressSummary(s), percent: a?.finalPercent ?? null, reviewed: Boolean(a?.teacherReview) };
      }),
    };
  });

  /** Full investigation trail (documents, evidence, interviews, notebook, draft) of a student's session. */
  app.get('/api/teacher/sessions/:id/process', async (req) => {
    const m = requireTenantMember(req.authUser, [...STAFF]);
    return getInvestigation(deps, m, (req.params as { id: string }).id);
  });

  app.get('/api/teacher/sessions/:id', async (req) => {
    const m = requireTenantMember(req.authUser, [...STAFF]);
    return getResults(deps, m, (req.params as { id: string }).id);
  });

  app.put('/api/teacher/assessments/:id/review', async (req) => {
    const m = requireTenantMember(req.authUser, [...STAFF]);
    const body = parseBody(
      z.object({ scores: z.partialRecord(z.enum(CRITERION_KEYS as [CriterionKey, ...CriterionKey[]]), z.number().min(0).max(30)).default({}), comment: z.string().max(3000).default('') }),
      req.body,
    );
    const id = (req.params as { id: string }).id;
    const r = await reviewAssessment(deps, m, id, body);
    await audit(deps, m, m.tenantId, 'assessment.review', id, { status: r.teacherReview?.status, finalPercent: r.finalPercent });
    return { assessment: r };
  });

  /** Re-runs AI grading (e.g. after an AI outage). Limited per session by the school quota. */
  app.post('/api/teacher/assessments/:id/regrade', async (req) => {
    const m = requireTenantMember(req.authUser, [...STAFF]);
    const id = (req.params as { id: string }).id;
    const s = (await p.session(m.tenantId, id).get()).data() as SessionDoc | undefined;
    if (!s) throw notFound('Investigation');
    if (!(await canViewStudent(deps, m, s.uid)) || s.uid === m.uid) throw forbidden();
    const tenant = await getTenant(deps, m.tenantId);
    if (s.gradingAttempts >= tenant.quotas.gradingRequestsPerSession + 1) throw new ApiError('GRADING_LIMIT', 'This report has reached the grading limit.');
    const r = await ensureGraded(deps, m.tenantId, id, { force: true });
    await audit(deps, m, m.tenantId, 'assessment.regrade', id, r);
    return r;
  });

  app.get('/api/teacher/export.csv', async (req, reply) => {
    const m = requireTenantMember(req.authUser, [...STAFF]);
    const q = parseBody(z.object({ courseId: z.string().min(1) }), req.query);
    const c = await ownCourse(deps, m, q.courseId);
    const [students, assessments, cases] = await Promise.all([
      usersByIds(deps, m.tenantId, c.studentIds),
      assessmentsForStudents(deps, m.tenantId, c.studentIds),
      listApprovedCases(deps, m.tenantId),
    ]);
    const headers = ['student_code', 'student_name', 'email', 'case_id', 'case_title', 'level', 'submitted_at', 'solved', 'reading_25', 'evidence_25', 'critical_thinking_20', 'writing_30', 'words', 'ai_percent', 'final_percent', 'ai_status', 'teacher_review', 'teacher_comment', 'session_id'];
    const rows = assessments.map((a) => {
      const s = students.find((x) => x.uid === a.uid);
      const crit = applyReview(a.criteria, a.teacherReview).criteria;
      const v = (k: CriterionKey) => (crit[k].score === null ? 'N/A' : crit[k].score);
      return [
        s?.studentCode ?? '', s?.displayName ?? a.uid, s?.email ?? '', a.caseId, cases.find((x) => x.dossier.id === a.caseId)?.dossier.title.en ?? a.caseId, a.level, a.createdAt,
        a.solved ? 'yes' : 'no', v('reading'), v('evidence'), v('criticalThinking'), v('writing'), a.wordCount, a.percent, a.finalPercent, a.aiStatus,
        a.teacherReview?.status ?? 'pending', a.teacherReview?.comment ?? '', a.sessionId,
      ];
    });
    await audit(deps, m, m.tenantId, 'export.results', c.id, { rows: rows.length });
    return reply.header('Content-Type', 'text/csv; charset=utf-8').header('Content-Disposition', `attachment; filename="detective-results-${c.code}.csv"`).send(toCsv(headers, rows));
  });
}
