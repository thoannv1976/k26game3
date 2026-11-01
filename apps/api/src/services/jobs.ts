import { OAuth2Client } from 'google-auth-library';
import { applyClock } from '@vq/game-engine';
import type { Deps } from '../deps.js';
import { ApiError } from '../errors.js';
import { paths } from '../paths.js';
import type { AttemptDoc, ChampionshipDoc } from '../types.js';
import { tickClock } from './attempts.js';
import { finalizeChampionship } from './championships.js';
import { ensureGraded } from './grading.js';

const oauth = new OAuth2Client();

/**
 * /internal/jobs/* is called by Cloud Scheduler with a Google OIDC token (service account in JOBS_INVOKERS,
 * audience JOBS_AUDIENCE). Outside production with no invokers configured, local calls are allowed for development.
 */
export async function verifyJobCaller(deps: Deps, authorization: string | undefined): Promise<string> {
  const { config } = deps;
  if (!config.jobsInvokers.length) {
    if (config.env !== 'production') return 'dev';
    throw new ApiError('FORBIDDEN', 'Jobs are not configured');
  }
  const m = /^Bearer (.+)$/.exec(authorization ?? '');
  if (!m) throw new ApiError('UNAUTHENTICATED', 'Missing bearer token');
  try {
    const ticket = await oauth.verifyIdToken({ idToken: m[1]!, audience: config.jobsAudience || undefined });
    const payload = ticket.getPayload();
    if (!payload?.email || !payload.email_verified || !config.jobsInvokers.includes(payload.email)) throw new Error('caller not allowed');
    return payload.email;
  } catch {
    throw new ApiError('FORBIDDEN', 'Caller is not allowed to run jobs');
  }
}

/**
 * Periodic maintenance across all schools: finishes exams whose time is up, grades submitted attempts that
 * nobody opened (or whose grading stalled) and closes championships after their deadline.
 */
export async function runTick(deps: Deps, opts: { limitPerTenant?: number } = {}) {
  const p = paths(deps.db);
  const limit = opts.limitPerTenant ?? 25;
  const now = deps.now();
  const report = { tenants: 0, examsTimedOut: 0, graded: 0, gradingFailed: 0, championshipsClosed: 0 };
  const tenants = await p.tenants().where('active', '==', true).get();
  for (const t of tenants.docs) {
    report.tenants++;
    const tenantId = t.id;

    const active = await p.attempts(tenantId).where('status', '==', 'active').where('mode', '==', 'exam').limit(200).get();
    for (const d of active.docs) {
      const a = d.data() as AttemptDoc;
      if (applyClock(a.state, now).finished) {
        await tickClock(deps, a);
        report.examsTimedOut++;
      }
    }

    const pending = await p.attempts(tenantId).where('status', 'in', ['submitted', 'grading']).limit(limit).get();
    for (const d of pending.docs) {
      const a = d.data() as AttemptDoc;
      // Leave very fresh submissions to the lazy path (the student is usually waiting on the results page).
      if (a.status === 'submitted' && a.submittedAt && now.getTime() - new Date(a.submittedAt).getTime() < 60_000) continue;
      try {
        const r = await ensureGraded(deps, tenantId, a.id);
        if (r.status === 'graded') report.graded++;
      } catch (e) {
        console.error('job grading failed', tenantId, a.id, e);
        report.gradingFailed++;
      }
    }

    const champs = await p.championships(tenantId).where('closedAt', '==', null).limit(100).get();
    for (const d of champs.docs) {
      const c = d.data() as ChampionshipDoc;
      if (now.getTime() >= new Date(c.closesAt).getTime()) {
        await finalizeChampionship(deps, tenantId, c);
        report.championshipsClosed++;
      }
    }
  }
  return report;
}
