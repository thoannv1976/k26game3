import type { FastifyBaseLogger } from 'fastify';
import type { Deps } from '../deps.js';
import { paths } from '../paths.js';
import type { AssessmentDoc, AttemptDoc } from '../types.js';
import { submitResult } from './hubSdk.js';
import { ltiPaths, type LtiLink } from './launch.js';

/**
 * Sends an assessment's score (0–100: quest = its skill score, mock exam = overall of the four skills) to the LMS
 * through UniGame Hub when the attempt belongs to an LTI-launched assignment.
 * Never throws: grading in the app must not fail because the LMS is unreachable
 * (the Hub queues and retries; the outcome is recorded in tenants/{t}/lti_outbox/{attemptId}).
 */
export async function syncGrade(deps: Deps, tenantId: string, a: AssessmentDoc, occurredAt: string, log?: FastifyBaseLogger): Promise<void> {
  const cfg = deps.config;
  if (!cfg.ltiEnabled) return;
  const lp = ltiPaths(deps);
  try {
    const at = (await paths(deps.db).attempt(tenantId, a.id).get()).data() as AttemptDoc | undefined;
    if (!at?.assignmentId) return;
    const link = (await lp.link(tenantId, a.uid, at.assignmentId).get()).data() as LtiLink | undefined;
    if (!link) return;
    if (a.score === null) {
      // No score yet (e.g. AI grading unavailable, waiting for the teacher): nothing to send; the review sends it.
      await lp.outbox(tenantId, a.id).set({ status: 'no_score', pendingReview: a.pendingReview, occurredAt, at: deps.now().toISOString() });
      return;
    }
    const score = Math.max(0, Math.min(100, Math.round(a.score * 100) / 100));
    const res = await Promise.race([
      submitResult(
        { hubUrl: cfg.ltiHubUrl, gameId: cfg.ltiGameId, secret: cfg.ltiGameSecret, fetch: deps.ltiFetch },
        {
          gradeTarget: link.gradeTarget,
          attemptId: a.id,
          score,
          maxScore: 100,
          occurredAt,
          activityProgress: 'Completed',
          // Writing/speaking criteria still waiting for the teacher (e.g. pronunciation) → provisional score.
          gradingProgress: a.pendingReview ? 'PendingManual' : 'FullyGraded',
          comment: a.teacherReview?.comment ? a.teacherReview.comment.slice(0, 1000) : undefined,
        },
      ),
      new Promise<never>((_, rej) => setTimeout(() => rej(new Error('Hub timeout')), 10_000)),
    ]);
    await lp.outbox(tenantId, a.id).set({ status: res.status, jobId: res.job_id ?? null, score, pendingReview: a.pendingReview, occurredAt, at: deps.now().toISOString() });
  } catch (e) {
    const msg = (e as Error).message;
    if (log) log.warn({ err: msg, attemptId: a.id }, 'LTI grade sync failed');
    else console.warn('LTI grade sync failed', a.id, msg);
    await lp
      .outbox(tenantId, a.id)
      .set({ status: 'error', error: msg.slice(0, 500), score: a.score, occurredAt, at: deps.now().toISOString() })
      .catch(() => undefined);
  }
}
