import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { AVATAR_IDS, LevelSchema, OUTFIT_IDS, type TenantDoc, type UserDoc } from '@vq/shared';
import { BADGES, playerLevel, questSummary, worldView } from '@vq/game-engine';
import { parseBody } from '../app.js';
import { requireTenantMember } from '../auth.js';
import type { Deps } from '../deps.js';
import { ApiError, notFound } from '../errors.js';
import { paths } from '../paths.js';
import { getUserDoc } from '../tenants.js';
import { newUserDoc } from '../services/users.js';
import {
  answer, assignmentsFor, audioSegment, explain, getAttempt, myAttempts, nextSection, play, saveWriting, startExam, startQuest,
  startSection, submit, uploadSpeaking,
} from '../services/attempts.js';
import { getResults, recordingAudio } from '../services/grading.js';
import { listApproved } from '../services/content.js';
import { askCoach, coachHistory, generateSummary, getProfile } from '../services/profile.js';
import { leaderboard, listForStudent } from '../services/championships.js';
import type { AttemptDoc } from '../types.js';

const ItemId = z.string().regex(/^[A-Z]{1,3}\d{0,2}_[a-z0-9_]+$/).max(60);
const SubId = z.string().regex(/^[a-z0-9_]+$/).max(60);
const QuestId = z.string().regex(/^[LRWS]\d{2}$/);

export async function coreRoutes(app: FastifyInstance, deps: Deps) {
  const p = paths(deps.db);
  const aid = (req: { params: unknown }) => parseBody(z.string().uuid(), (req.params as { id: string }).id);

  /* ---------------- me (accounts shared with Game 1 and Game 2) ---------------- */
  app.get('/api/me', async (req) => {
    const u = req.authUser!;
    if (u.role === 'platform_admin') return { user: { uid: u.uid, email: u.email, displayName: u.name, role: u.role, tenantId: null }, tenant: null };
    if (!u.role || !u.tenantId) {
      // Self-provisioning for allowed school e-mail domains (e.g. Google sign-in).
      const domain = u.email.split('@')[1]?.toLowerCase();
      if (domain) {
        const t = await p.tenants().where('allowedEmailDomains', 'array-contains', domain).limit(1).get();
        const tenant = t.docs[0]?.data() as TenantDoc | undefined;
        if (tenant?.active) {
          await deps.auth.setCustomUserClaims(u.uid, { tenantId: tenant.id, role: 'student' });
          const ref = p.user(tenant.id, u.uid);
          if (!(await ref.get()).exists) await ref.set(newUserDoc(u.uid, tenant.id, { email: u.email, displayName: u.name, role: 'student' }, deps.now()));
          return { refreshToken: true, user: null, tenant: null };
        }
      }
      throw new ApiError('NOT_PROVISIONED', 'Your account has not been added to a school yet. Please contact your teacher.');
    }
    const m = requireTenantMember(u);
    const tenantSnap = await p.tenant(m.tenantId).get();
    if (!tenantSnap.exists) throw new ApiError('NOT_PROVISIONED', 'Your school has not been set up in VSTEP Quest yet. Please contact the school administrator.');
    let user = await getUserDoc(deps, m.tenantId, m.uid);
    if (!user) {
      // Account created in another K26 game (shared Firebase Auth): create the VSTEP Quest profile on first visit.
      user = newUserDoc(m.uid, m.tenantId, { email: m.email, displayName: m.name, role: m.role as Exclude<UserDoc['role'], 'platform_admin'> }, deps.now());
      await p.user(m.tenantId, m.uid).set(user);
    }
    if (user.disabled) throw new ApiError('FORBIDDEN', 'This account is disabled');
    const tenant = tenantSnap.data() as TenantDoc;
    return { user, player: playerLevel(user.xp ?? 0), badges: BADGES, tenant: { id: tenant.id, name: tenant.name } };
  });

  app.patch('/api/me', async (req) => {
    const m = requireTenantMember(req.authUser);
    const body = parseBody(
      z.object({
        locale: z.enum(['vi', 'en']).optional(),
        level: LevelSchema.optional(),
        displayName: z.string().trim().min(1).max(120).optional(),
        avatar: z.object({ id: z.enum(AVATAR_IDS), outfit: z.enum(OUTFIT_IDS) }).optional(),
      }),
      req.body,
    );
    const user = await getUserDoc(deps, m.tenantId, m.uid);
    if (!user) throw notFound('Profile');
    // Outfits are unlocked by player level (game reward only).
    if (body.avatar) {
      const need = OUTFIT_IDS.indexOf(body.avatar.outfit);
      if (need > 0 && playerLevel(user.xp).level < need + 1) throw new ApiError('LOCKED', `Reach player level ${need + 1} to unlock this outfit`);
    }
    await p.user(m.tenantId, m.uid).update(body);
    return { user: await getUserDoc(deps, m.tenantId, m.uid) };
  });

  /** Recording notice: audio is used only for feedback and deleted after the school's retention period. */
  app.post('/api/me/recording-consent', async (req) => {
    const m = requireTenantMember(req.authUser);
    const body = parseBody(z.object({ accept: z.boolean() }), req.body);
    await p.user(m.tenantId, m.uid).update({ recordingConsentAt: body.accept ? deps.now().toISOString() : null });
    return { recordingConsentAt: body.accept ? deps.now().toISOString() : null };
  });

  /* ---------------- world, quests, exams ---------------- */
  app.get('/api/world', async (req) => {
    const m = requireTenantMember(req.authUser);
    const user = await getUserDoc(deps, m.tenantId, m.uid);
    if (!user) throw notFound('Profile');
    const [quests, exams, assignments, active] = await Promise.all([
      listApproved(deps, m.tenantId, 'quest'),
      listApproved(deps, m.tenantId, 'exam'),
      assignmentsFor(deps, m.tenantId, user),
      p.attempts(m.tenantId).where('uid', '==', m.uid).where('status', '==', 'active').get(),
    ]);
    const qs = quests.map((q) => q.content);
    const activeList = active.docs.map((d) => d.data() as AttemptDoc);
    return {
      zones: worldView(qs, user.completedQuestIds, assignments.filter((a) => a.kind === 'quest').map((a) => a.refId)).map((z) => ({
        ...z,
        quests: z.quests.map((q) => ({ ...q, bestScore: user.bestScores[q.id] ?? null, activeAttemptId: activeList.find((a) => a.refId === q.id && a.mode === 'quest')?.id ?? null })),
      })),
      exams: exams.map((e) => ({
        id: e.content.exam.id,
        title: e.content.exam.title,
        level: e.content.exam.level,
        totalMinutes: e.content.exam.sections.reduce((n, s) => n + s.timeMinutes, 0),
        sections: e.content.exam.sections.map((s) => ({ skill: s.skill, timeMinutes: s.timeMinutes })),
        disclaimer: e.content.exam.disclaimer,
        activeAttemptId: activeList.find((a) => a.refId === e.content.exam.id && a.mode === 'exam')?.id ?? null,
      })),
      assignments: assignments.map((a) => ({ id: a.id, courseId: a.courseId, kind: a.kind, refId: a.refId, dueAt: a.dueAt, note: a.note, order: a.order, done: a.kind === 'quest' ? user.completedQuestIds.includes(a.refId) : false })),
      player: { xp: user.xp, ...playerLevel(user.xp), badges: user.badges, streak: user.streak, avatar: user.avatar },
    };
  });

  app.get('/api/quests/:id', async (req) => {
    const m = requireTenantMember(req.authUser);
    const id = parseBody(QuestId, (req.params as { id: string }).id);
    const q = (await listApproved(deps, m.tenantId, 'quest')).find((x) => x.content.id === id);
    if (!q) throw notFound('Quest');
    return { quest: questSummary(q.content) };
  });

  /* ---------------- attempts ---------------- */
  app.post('/api/attempts', async (req) => {
    const m = requireTenantMember(req.authUser);
    const body = parseBody(z.object({ questId: QuestId, assignmentId: z.string().max(100).optional(), championshipId: z.string().uuid().optional(), restart: z.boolean().optional() }), req.body);
    return startQuest(deps, m, body);
  });

  app.post('/api/exams/:id/attempts', async (req) => {
    const m = requireTenantMember(req.authUser);
    const examId = parseBody(SubId, (req.params as { id: string }).id);
    const body = parseBody(z.object({ assignmentId: z.string().max(100).optional() }), req.body ?? {});
    return startExam(deps, m, { examId, ...body });
  });

  app.get('/api/me/attempts', async (req) => ({ attempts: await myAttempts(deps, requireTenantMember(req.authUser)) }));

  app.get('/api/attempts/:id', async (req) => getAttempt(deps, requireTenantMember(req.authUser), aid(req)));

  app.post('/api/attempts/:id/answers', async (req) => {
    const m = requireTenantMember(req.authUser);
    const body = parseBody(z.object({ itemId: ItemId, questionId: SubId, value: z.union([z.number().int().min(0).max(10), z.string().trim().min(1).max(200)]) }), req.body);
    const r = await answer(deps, m, aid(req), body.itemId, body.questionId, body.value);
    return { result: r.result, ...r.view };
  });

  app.post('/api/attempts/:id/play', async (req) => {
    const m = requireTenantMember(req.authUser);
    const body = parseBody(z.object({ itemId: ItemId }), req.body);
    return play(deps, m, aid(req), body.itemId);
  });

  app.get('/api/attempts/:id/audio/:itemId/:index', async (req, reply) => {
    const m = requireTenantMember(req.authUser);
    const prm = req.params as { itemId: string; index: string };
    const data = await audioSegment(deps, m, aid(req), parseBody(ItemId, prm.itemId), parseBody(z.coerce.number().int().min(0).max(100), prm.index));
    return reply.header('Content-Type', 'audio/mpeg').header('Cache-Control', 'private, max-age=600').send(data);
  });

  app.put('/api/attempts/:id/writing/:itemId', async (req) => {
    const m = requireTenantMember(req.authUser);
    const body = parseBody(z.object({ text: z.string().max(6000), baseVersion: z.number().int().min(0) }), req.body);
    return { draft: await saveWriting(deps, m, aid(req), parseBody(ItemId, (req.params as { itemId: string }).itemId), body.text, body.baseVersion) };
  });

  app.post('/api/attempts/:id/speaking/:itemId/:partId', async (req) => {
    const m = requireTenantMember(req.authUser);
    const prm = req.params as { itemId: string; partId: string };
    let audio: Buffer | undefined;
    for await (const part of req.parts()) {
      if (part.type === 'file') audio = await part.toBuffer();
    }
    if (!audio) throw new ApiError('VALIDATION', 'Missing audio file');
    return uploadSpeaking(deps, m, aid(req), parseBody(ItemId, prm.itemId), parseBody(SubId, prm.partId), audio);
  });

  app.post('/api/attempts/:id/sections/start', async (req) => (await startSection(deps, requireTenantMember(req.authUser), aid(req))).view);
  app.post('/api/attempts/:id/sections/next', async (req) => (await nextSection(deps, requireTenantMember(req.authUser), aid(req))).view);

  app.post('/api/attempts/:id/explain', async (req) => {
    const m = requireTenantMember(req.authUser);
    const body = parseBody(z.object({ itemId: ItemId, questionId: SubId }), req.body);
    return { explanation: await explain(deps, m, aid(req), body.itemId, body.questionId) };
  });

  app.post('/api/attempts/:id/submit', async (req) => submit(deps, requireTenantMember(req.authUser), aid(req)));

  app.get('/api/attempts/:id/results', async (req) => getResults(deps, requireTenantMember(req.authUser), aid(req)));

  app.get('/api/attempts/:id/recordings/:itemId/:partId', async (req, reply) => {
    const m = requireTenantMember(req.authUser);
    const prm = req.params as { itemId: string; partId: string };
    const data = await recordingAudio(deps, m, aid(req), parseBody(ItemId, prm.itemId), parseBody(SubId, prm.partId));
    return reply.header('Content-Type', 'audio/wav').header('Cache-Control', 'private, no-store').send(data);
  });

  /* ---------------- four-skill profile & coach ---------------- */
  app.get('/api/profile', async (req) => {
    const m = requireTenantMember(req.authUser);
    return getProfile(deps, m, m.uid);
  });

  app.post('/api/profile/summary', async (req) => generateSummary(deps, requireTenantMember(req.authUser, ['student'])));

  app.get('/api/coach', async (req) => ({ messages: await coachHistory(deps, requireTenantMember(req.authUser)) }));

  app.post('/api/coach', async (req) => {
    const m = requireTenantMember(req.authUser, ['student']);
    const body = parseBody(z.object({ clientMessageId: z.string().uuid(), question: z.string().trim().min(2).max(600) }), req.body);
    return { message: await askCoach(deps, m, body) };
  });

  /* ---------------- championships ---------------- */
  app.get('/api/championships', async (req) => {
    const m = requireTenantMember(req.authUser);
    const user = await getUserDoc(deps, m.tenantId, m.uid);
    if (!user) throw notFound('Profile');
    return { championships: await listForStudent(deps, m, user) };
  });

  app.get('/api/championships/:id/leaderboard', async (req) => {
    const m = requireTenantMember(req.authUser);
    const user = await getUserDoc(deps, m.tenantId, m.uid);
    return leaderboard(deps, m, aid(req), user);
  });
}
