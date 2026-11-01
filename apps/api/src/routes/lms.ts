import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { EVIDENCE_SCHEMA, type CourseDoc, type LearningEvidence, type UserDoc } from '@vq/shared';
import { parseBody } from '../app.js';
import { requireTenantMember } from '../auth.js';
import type { Deps } from '../deps.js';
import { notFound } from '../errors.js';
import { paths } from '../paths.js';
import { listApprovedCases } from '../tenants.js';
import { applyReview } from '../services/grading.js';
import type { AssessmentDoc, SessionDoc } from '../types.js';
import { assessmentsForStudents, usersByIds } from './teacher.js';

/**
 * Integration API for LMS-AI9 and the AI English Learning Portfolio.
 * Uses the common K26 learning-evidence format shared with English City Simulator.
 */
export function toEvidence(a: AssessmentDoc, user: UserDoc | undefined, title: string, s?: SessionDoc): LearningEvidence {
  const reviewed = applyReview(a.criteria, a.teacherReview);
  return {
    schema: EVIDENCE_SCHEMA,
    evidenceId: `ed:${a.tenantId}:${a.sessionId}`,
    source: 'english-detective',
    tenantId: a.tenantId,
    learner: { uid: a.uid, email: user?.email ?? null, studentCode: user?.studentCode ?? null, name: user?.displayName ?? null },
    courseId: a.courseId,
    activity: { type: 'investigation_case', id: a.caseId, version: a.caseVersion, title, level: a.level },
    skills: ['reading', 'writing', 'critical_thinking'],
    result: {
      completed: a.solved,
      aiPercent: a.percent,
      finalPercent: reviewed.percent,
      scoreType: a.teacherReview ? 'teacher_validated' : 'ai_practice',
      criteria: Object.fromEntries(
        Object.entries(reviewed.criteria).map(([k, v]) => [k, { score: v.score, max: v.max, status: v.status === 'partial' ? 'assessed' : v.status, source: v.source }]),
      ) as LearningEvidence['result']['criteria'],
    },
    feedback: a.feedback ? { strengths: a.feedback.strengths, improvements: a.feedback.improvements, nextPractice: [a.feedback.recommendations.nextWritingTask, ...a.feedback.recommendations.readingSkills].filter(Boolean) } : null,
    timestamps: { startedAt: s?.startedAt ?? null, completedAt: a.createdAt, reviewedAt: a.teacherReview?.reviewedAt ?? null },
    versions: { ...a.versions },
    disclaimer: a.disclaimer,
  };
}

export async function lmsRoutes(app: FastifyInstance, deps: Deps) {
  const p = paths(deps.db);

  app.get('/api/lms/v1/results', async (req) => {
    const m = requireTenantMember(req.authUser, ['school_admin']);
    const q = parseBody(z.object({ courseId: z.string().optional(), since: z.iso.datetime().optional(), limit: z.coerce.number().int().min(1).max(1000).default(500) }), req.query);
    let list: AssessmentDoc[];
    if (q.courseId) {
      const c = (await p.course(m.tenantId, q.courseId).get()).data() as CourseDoc | undefined;
      if (!c) throw notFound('Course');
      list = await assessmentsForStudents(deps, m.tenantId, c.studentIds);
    } else {
      let query = p.assessments(m.tenantId).orderBy('createdAt', 'desc');
      if (q.since) query = query.where('createdAt', '>', q.since);
      list = (await query.limit(q.limit).get()).docs.map((d) => d.data() as AssessmentDoc);
    }
    if (q.since) list = list.filter((a) => a.createdAt > q.since!);
    list = list.slice(0, q.limit);
    const [users, cases] = await Promise.all([usersByIds(deps, m.tenantId, [...new Set(list.map((a) => a.uid))]), listApprovedCases(deps, m.tenantId)]);
    return {
      schema: EVIDENCE_SCHEMA,
      count: list.length,
      items: list.map((a) => toEvidence(a, users.find((u) => u.uid === a.uid), cases.find((c) => c.dossier.id === a.caseId)?.dossier.title.en ?? a.caseId)),
    };
  });

  app.get('/api/lms/v1/evidence/:sessionId', async (req) => {
    const m = requireTenantMember(req.authUser, ['school_admin']);
    const id = (req.params as { sessionId: string }).sessionId;
    const a = (await p.assessment(m.tenantId, id).get()).data() as AssessmentDoc | undefined;
    if (!a) throw notFound('Evidence');
    const [s, users, cases] = await Promise.all([p.session(m.tenantId, id).get(), usersByIds(deps, m.tenantId, [a.uid]), listApprovedCases(deps, m.tenantId)]);
    return toEvidence(a, users[0], cases.find((c) => c.dossier.id === a.caseId)?.dossier.title.en ?? a.caseId, s.data() as SessionDoc | undefined);
  });
}
