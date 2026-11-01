import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { UserDoc } from '@vq/shared';
import type { Member } from '../auth.js';
import type { Deps } from '../deps.js';
import { ApiError, forbidden, notFound } from '../errors.js';
import { paths } from '../paths.js';
import type { ChampionshipDoc, EntryDoc } from '../types.js';
import { coursesFor } from './access.js';
import { championshipStatus, inChampionship } from './attempts.js';
import { getApproved } from './content.js';

export const ChampionshipInputSchema = z
  .object({
    name: z.string().trim().min(3).max(120),
    description: z.string().trim().max(1000).default(''),
    type: z.enum(['individual', 'team', 'class']),
    courseIds: z.array(z.string().max(80)).min(1).max(30),
    questIds: z.array(z.string().regex(/^[LRWS]\d{2}$/)).min(1).max(12),
    teams: z.array(z.object({ id: z.string().regex(/^[a-z0-9_]+$/).max(40), name: z.string().trim().min(1).max(60), memberUids: z.array(z.string().max(128)).max(60) })).max(30).default([]),
    opensAt: z.iso.datetime(),
    closesAt: z.iso.datetime(),
    allowHelp: z.boolean().default(false),
  })
  .refine((c) => new Date(c.closesAt) > new Date(c.opensAt), { message: 'closesAt must be after opensAt', path: ['closesAt'] })
  .refine((c) => c.type !== 'team' || c.teams.length >= 2, { message: 'Team championships need at least two teams', path: ['teams'] });
export type ChampionshipInput = z.infer<typeof ChampionshipInputSchema>;

const withStatus = (c: ChampionshipDoc, now: Date) => ({ ...c, status: championshipStatus(c, now) });

async function checkInput(deps: Deps, m: Member, input: ChampionshipInput) {
  const mine = new Set((await coursesFor(deps, m)).map((c) => c.id));
  for (const id of input.courseIds) if (!mine.has(id)) throw forbidden(`You do not teach course ${id}`);
  for (const q of input.questIds) await getApproved(deps, m.tenantId, 'quest', q);
  const seen = new Set<string>();
  for (const t of input.teams) for (const u of t.memberUids) {
    if (seen.has(u)) throw new ApiError('VALIDATION', 'A student can only be in one team');
    seen.add(u);
  }
}

export async function createChampionship(deps: Deps, m: Member, input: ChampionshipInput) {
  await checkInput(deps, m, input);
  const now = deps.now();
  const doc: ChampionshipDoc = { id: randomUUID(), ...input, teams: input.type === 'team' ? input.teams : [], status: 'scheduled', createdBy: m.uid, createdAt: now.toISOString(), closedAt: null };
  doc.status = championshipStatus(doc, now);
  await paths(deps.db).championship(m.tenantId, doc.id).set(doc);
  return doc;
}

async function loadManaged(deps: Deps, m: Member, id: string) {
  const c = (await paths(deps.db).championship(m.tenantId, id).get()).data() as ChampionshipDoc | undefined;
  if (!c) throw notFound('Championship');
  if (m.role !== 'school_admin') {
    const mine = new Set((await coursesFor(deps, m)).map((x) => x.id));
    if (c.createdBy !== m.uid && !c.courseIds.some((x) => mine.has(x))) throw forbidden('Not your championship');
  }
  return c;
}

export async function updateChampionship(deps: Deps, m: Member, id: string, input: ChampionshipInput) {
  const c = await loadManaged(deps, m, id);
  if (c.closedAt) throw new ApiError('CHAMPIONSHIP_CLOSED', 'This championship is closed');
  const started = championshipStatus(c, deps.now()) !== 'scheduled';
  // Once open, the quest list and type are fixed (fairness); dates and help can still change.
  if (started && (input.type !== c.type || input.questIds.join() !== c.questIds.join())) throw new ApiError('CONFLICT', 'Quests and type cannot change after the championship has opened');
  await checkInput(deps, m, input);
  const next: ChampionshipDoc = { ...c, ...input, teams: input.type === 'team' ? input.teams : [] };
  next.status = championshipStatus(next, deps.now());
  await paths(deps.db).championship(m.tenantId, id).set(next);
  return next;
}

export async function listManaged(deps: Deps, m: Member) {
  const snap = await paths(deps.db).championships(m.tenantId).orderBy('opensAt', 'desc').limit(100).get();
  const mine = new Set((await coursesFor(deps, m)).map((x) => x.id));
  const now = deps.now();
  return snap.docs
    .map((d) => d.data() as ChampionshipDoc)
    .filter((c) => m.role === 'school_admin' || c.createdBy === m.uid || c.courseIds.some((x) => mine.has(x)))
    .map((c) => withStatus(c, now));
}

/** Championships a student can see (their classes / team), newest first. */
export async function listForStudent(deps: Deps, m: Member, user: UserDoc) {
  const snap = await paths(deps.db).championships(m.tenantId).orderBy('opensAt', 'desc').limit(100).get();
  const now = deps.now();
  return snap.docs
    .map((d) => d.data() as ChampionshipDoc)
    .filter((c) => inChampionship(c, user))
    .map((c) => {
      const s = withStatus(c, now);
      return { id: s.id, name: s.name, description: s.description, type: s.type, questIds: s.questIds, opensAt: s.opensAt, closesAt: s.closesAt, allowHelp: s.allowHelp, status: s.status, team: s.teams.find((t) => t.memberUids.includes(user.uid))?.name ?? null };
    });
}

/**
 * Official ranking uses confirmed scores only (no writing/speaking criteria waiting for a teacher);
 * the provisional ranking also includes AI scores still waiting for review.
 */
export async function leaderboard(deps: Deps, m: Member, id: string, viewer: UserDoc | null) {
  const p = paths(deps.db);
  const c = (await p.championship(m.tenantId, id).get()).data() as ChampionshipDoc | undefined;
  if (!c) throw notFound('Championship');
  if (m.role === 'student' && (!viewer || !inChampionship(c, viewer))) throw forbidden('You are not taking part in this championship');
  const entries = (await p.entries(m.tenantId, id).get()).docs.map((d) => d.data() as EntryDoc);
  const rank = <T extends { points: number; provisionalPoints: number }>(xs: T[]) =>
    [...xs].sort((a, b) => b.points - a.points || b.provisionalPoints - a.provisionalPoints).map((x, i) => ({ rank: i + 1, ...x }));
  const individuals = rank(
    entries.map((e) => ({
      uid: e.uid,
      name: m.role === 'student' && e.uid !== m.uid ? shortName(e.name) : e.name,
      teamId: e.teamId,
      courseId: e.courseId,
      questsDone: Object.keys(e.quests).length,
      pendingReview: Object.values(e.quests).filter((q) => !q.confirmed).length,
      points: e.points,
      provisionalPoints: e.provisionalPoints,
    })),
  );
  const group = (key: (e: EntryDoc) => string | null, label: (k: string) => string) => {
    const g = new Map<string, EntryDoc[]>();
    for (const e of entries) {
      const k = key(e);
      if (k) g.set(k, [...(g.get(k) ?? []), e]);
    }
    // Groups compare by average so that bigger groups have no advantage.
    return rank([...g.entries()].map(([k, es]) => ({ id: k, name: label(k), members: es.length, points: avg(es.map((e) => e.points)), provisionalPoints: avg(es.map((e) => e.provisionalPoints)) })));
  };
  const courses = c.type === 'class' ? new Map((await Promise.all(c.courseIds.map((cid) => p.course(m.tenantId, cid).get()))).map((s) => [s.id, (s.data() as { name?: string } | undefined)?.name ?? s.id])) : new Map<string, string>();
  return {
    championship: { ...withStatus(c, deps.now()), teams: c.teams.map((t) => ({ id: t.id, name: t.name, members: t.memberUids.length })) },
    individuals,
    teams: c.type === 'team' ? group((e) => e.teamId, (k) => c.teams.find((t) => t.id === k)?.name ?? k) : [],
    classes: c.type === 'class' ? group((e) => e.courseId, (k) => courses.get(k) ?? k) : [],
    me: viewer ? (individuals.find((x) => x.uid === viewer.uid) ?? null) : null,
  };
}

const avg = (xs: number[]) => (xs.length ? Math.round((xs.reduce((n, x) => n + x, 0) / xs.length) * 10) / 10 : 0);
/** Other students see "Nguyen V. A." style names on the leaderboard. */
const shortName = (n: string) => {
  const parts = n.trim().split(/\s+/);
  if (parts.length <= 1) return n;
  return [parts[0], ...parts.slice(1).map((x) => `${x[0]}.`)].join(' ');
};

/** Closes a championship and awards the podium badge to the top 3 (official points). */
export async function closeChampionship(deps: Deps, m: Member, id: string) {
  const p = paths(deps.db);
  const c = await loadManaged(deps, m, id);
  return finalizeChampionship(deps, m.tenantId, c, p);
}

export async function finalizeChampionship(deps: Deps, tenantId: string, c: ChampionshipDoc, p = paths(deps.db)) {
  if (c.closedAt) return { closed: true, podium: [] as string[] };
  const entries = (await p.entries(tenantId, c.id).get()).docs.map((d) => d.data() as EntryDoc);
  const podium = entries
    .filter((e) => e.points > 0)
    .sort((a, b) => b.points - a.points)
    .slice(0, 3)
    .map((e) => e.uid);
  await deps.db.runTransaction(async (tx) => {
    const refs = podium.map((uid) => p.user(tenantId, uid));
    const snaps = await Promise.all(refs.map((r) => tx.get(r)));
    snaps.forEach((s, i) => {
      const u = s.data() as UserDoc | undefined;
      if (u && !u.badges.includes('championship_podium')) tx.update(refs[i]!, { badges: [...u.badges, 'championship_podium'] });
    });
    tx.update(p.championship(tenantId, c.id), { closedAt: deps.now().toISOString(), status: 'closed' });
  });
  return { closed: true, podium };
}
