import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { skillResult, overallScore } from '@vq/game-engine';
import { EVIDENCE_SCHEMA, SKILLS, type CourseDoc, type LearningEvidence, type UserDoc } from '@vq/shared';
import { parseBody } from '../app.js';
import { requireTenantMember } from '../auth.js';
import type { Deps } from '../deps.js';
import { notFound } from '../errors.js';
import { paths } from '../paths.js';
import type { AssessmentDoc, AttemptDoc } from '../types.js';
import { assessmentsForStudents, usersByIds } from './teacher.js';

/** Score of the machine/AI result before teacher review (same rules as the final score). */
function aiScore(a: AssessmentDoc): number | null {
  const skills = (a.mode === 'exam' ? [...SKILLS] : a.skills.map((s) => s.skill)).map((s) => skillResult(s, a.aiItems));
  return a.mode === 'exam' ? overallScore(skills) : (skills[0]?.score ?? null);
}

/**
 * Integration API for LMS-AI9 and the AI English Learning Portfolio, in the common K26 format
 * (`k26-evidence-1.0`) shared with English City Simulator and English Detective.
 */
export function toEvidence(a: AssessmentDoc, user: UserDoc | undefined, at?: AttemptDoc): LearningEvidence {
  const criteria: LearningEvidence['result']['criteria'] = {};
  for (const s of a.skills) criteria[s.skill] = { score: s.score, max: 100, status: s.score === null ? 'not_assessed' : 'assessed', source: s.status };
  for (const r of a.items) {
    if (r.skill !== 'writing' && r.skill !== 'speaking') continue;
    for (const [k, c] of Object.entries(r.criteria)) criteria[`${r.itemId}.${k}`] = { score: c.score, max: c.max, status: c.status === 'assessed' ? 'assessed' : 'not_assessed', source: c.source };
  }
  const fb = Object.values(a.feedback);
  return {
    schema: EVIDENCE_SCHEMA,
    evidenceId: `vq:${a.tenantId}:${a.id}`,
    source: 'vstep-quest',
    tenantId: a.tenantId,
    learner: { uid: a.uid, email: user?.email ?? null, studentCode: user?.studentCode ?? null, name: user?.displayName ?? null },
    courseId: a.courseId,
    activity: { type: a.mode === 'exam' ? 'vstep_mock_exam' : a.mode === 'championship' ? 'vstep_championship_quest' : 'vstep_quest', id: a.refId, version: a.versions.content.ref, title: a.title, level: a.level === 'B1-B2' ? 'B2' : a.level },
    skills: a.skills.map((s) => s.skill),
    result: {
      completed: a.passed,
      aiPercent: aiScore(a) ?? 0,
      finalPercent: a.score ?? 0,
      scoreType: a.teacherReview ? 'teacher_validated' : 'ai_practice',
      criteria,
    },
    feedback: fb.length ? { strengths: fb.flatMap((f) => f.strengths).slice(0, 6), improvements: fb.flatMap((f) => f.improvements).slice(0, 6), nextPractice: fb.flatMap((f) => f.nextPractice).slice(0, 5) } : null,
    timestamps: { startedAt: at?.startedAt ?? null, completedAt: a.createdAt, reviewedAt: a.teacherReview?.reviewedAt ?? null },
    versions: { rubric: a.versions.rubric, prompt: a.versions.prompt, model: a.versions.model, content: a.versions.content.ref },
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
    const users = await usersByIds(deps, m.tenantId, [...new Set(list.map((a) => a.uid))]);
    return { schema: EVIDENCE_SCHEMA, count: list.length, items: list.map((a) => toEvidence(a, users.find((u) => u.uid === a.uid))) };
  });

  app.get('/api/lms/v1/evidence/:attemptId', async (req) => {
    const m = requireTenantMember(req.authUser, ['school_admin']);
    const id = (req.params as { attemptId: string }).attemptId;
    const a = (await p.assessment(m.tenantId, id).get()).data() as AssessmentDoc | undefined;
    if (!a) throw notFound('Evidence');
    const [at, users] = await Promise.all([p.attempt(m.tenantId, id).get(), usersByIds(deps, m.tenantId, [a.uid])]);
    return toEvidence(a, users[0], at.data() as AttemptDoc | undefined);
  });

  /** One learner's evidence (school admins), newest first. */
  app.get('/api/lms/v1/learners/:uid/evidence', async (req) => {
    const m = requireTenantMember(req.authUser, ['school_admin']);
    const { uid } = req.params as { uid: string };
    const q = parseBody(z.object({ limit: z.coerce.number().int().min(1).max(200).default(50) }), req.query);
    const snap = await p.assessments(m.tenantId).where('uid', '==', uid).orderBy('createdAt', 'desc').limit(q.limit).get();
    const users = await usersByIds(deps, m.tenantId, [uid]);
    return { schema: EVIDENCE_SCHEMA, count: snap.size, items: snap.docs.map((d) => toEvidence(d.data() as AssessmentDoc, users[0])) };
  });
}
