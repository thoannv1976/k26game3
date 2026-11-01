import { BUILTIN_BLUEPRINT, BUILTIN_EXAMS, BUILTIN_ITEMS, BUILTIN_QUESTS, checkExam, checkItem, checkQuest } from '@vq/game-engine';
import { ItemRequestSchema, type ItemRequest } from '@vq/ai';
import {
  ItemSchema, QuestSchema, type ContentDoc, type ContentKind, type ContentVersionDoc, type ExamBlueprint, type Item, type MockExam, type Quest,
} from '@vq/shared';
import type { Member } from '../auth.js';
import type { Deps } from '../deps.js';
import { ApiError, notFound } from '../errors.js';
import { paths } from '../paths.js';
import { recordUsage, reserveAiCall } from '../quota.js';
import { getTenant } from '../tenants.js';
import { renderListeningAudio } from './audio.js';
import { withRetry } from './retry.js';

export interface ExamContent {
  exam: MockExam;
  blueprint: ExamBlueprint;
}
type ContentOf<K extends ContentKind> = K extends 'item' ? Item : K extends 'quest' ? Quest : ExamContent;

const meta = (kind: ContentKind, v: unknown): Pick<ContentDoc, 'skill' | 'level' | 'title'> => {
  if (kind === 'item') {
    const i = v as Item;
    return { skill: i.skill, level: i.level, title: i.title };
  }
  if (kind === 'quest') {
    const q = v as Quest;
    return { skill: q.skill, level: q.level, title: q.title.en };
  }
  const e = v as ExamContent;
  return { skill: null, level: e.exam.level, title: e.exam.title.en };
};

/* ---------------- reading approved content ---------------- */

export async function getVersion<K extends ContentKind>(deps: Deps, tenantId: string, kind: K, id: string, version: number): Promise<ContentVersionDoc<ContentOf<K>>> {
  const snap = await paths(deps.db).contentVersion(tenantId, kind, id, version).get();
  if (!snap.exists) throw notFound(`${kind} version`);
  return snap.data() as ContentVersionDoc<ContentOf<K>>;
}

export async function getApproved<K extends ContentKind>(deps: Deps, tenantId: string, kind: K, id: string): Promise<{ content: ContentOf<K>; version: number; doc: ContentVersionDoc<ContentOf<K>> }> {
  const d = (await paths(deps.db).contentDoc(tenantId, kind, id).get()).data() as ContentDoc | undefined;
  if (!d || d.approvedVersion < 1 || d.status === 'archived') throw notFound(kind === 'item' ? 'Item' : kind === 'quest' ? 'Quest' : 'Mock exam');
  const doc = await getVersion(deps, tenantId, kind, id, d.approvedVersion);
  return { content: doc.content, version: d.approvedVersion, doc };
}

export async function listApproved<K extends ContentKind>(deps: Deps, tenantId: string, kind: K): Promise<{ content: ContentOf<K>; version: number }[]> {
  const snap = await paths(deps.db).content(tenantId, kind).get();
  const docs = snap.docs.map((d) => d.data() as ContentDoc).filter((d) => d.approvedVersion > 0 && d.status !== 'archived');
  const out = await Promise.all(docs.map(async (d) => ({ content: (await getVersion(deps, tenantId, kind, d.id, d.approvedVersion)).content, version: d.approvedVersion })));
  return out.sort((a, b) => metaId(a.content).localeCompare(metaId(b.content)));
}
const metaId = (c: unknown) => ((c as { id?: string; exam?: { id: string } }).id ?? (c as ExamContent).exam.id) as string;

/* ---------------- seeding ---------------- */

async function writeVersion(deps: Deps, tenantId: string, kind: ContentKind, id: string, content: unknown, source: ContentDoc['source'], actor: string, approve: boolean, note: string) {
  const p = paths(deps.db);
  const ref = p.contentDoc(tenantId, kind, id);
  const prev = (await ref.get()).data() as ContentDoc | undefined;
  const version = (prev?.latestVersion ?? 0) + 1;
  const now = deps.now().toISOString();
  const v: ContentVersionDoc = { version, content, status: approve ? 'approved' : 'draft', source, createdBy: actor, createdAt: now, approvedBy: approve ? actor : null, approvedAt: approve ? now : null, note, audio: null };
  await p.contentVersion(tenantId, kind, id, version).set(v);
  const doc: ContentDoc = {
    id,
    kind,
    ...meta(kind, content),
    approvedVersion: approve ? version : (prev?.approvedVersion ?? 0),
    latestVersion: version,
    status: approve ? 'approved' : (prev?.status ?? 'draft'),
    source: prev?.source ?? source,
    updatedAt: now,
  };
  await ref.set(doc);
  return version;
}

/**
 * Seeds built-in items, quests and the mock exam. Items/quests are drafts unless `approvedBy` is given; the mock exam
 * stays a draft (VSTEP-format experts approve it) unless `approveExams` is set. Renders audio for approved listening items.
 */
export async function seedBuiltinContent(deps: Deps, tenantId: string, opts: { approvedBy?: string; approveExams?: boolean; overwrite?: boolean } = {}) {
  const p = paths(deps.db);
  let created = 0;
  const approve = Boolean(opts.approvedBy);
  const actor = opts.approvedBy ?? 'system:seed';
  for (const item of BUILTIN_ITEMS) {
    if ((await p.contentDoc(tenantId, 'item', item.id).get()).exists && !opts.overwrite) continue;
    const v = await writeVersion(deps, tenantId, 'item', item.id, item, 'builtin', actor, approve, 'Built-in content v1.0');
    if (approve && item.skill === 'listening') await renderListeningAudio(deps, tenantId, item, v);
    created++;
  }
  for (const q of BUILTIN_QUESTS) {
    if ((await p.contentDoc(tenantId, 'quest', q.id).get()).exists && !opts.overwrite) continue;
    await writeVersion(deps, tenantId, 'quest', q.id, q, 'builtin', actor, approve, 'Built-in content v1.0');
    created++;
  }
  for (const e of BUILTIN_EXAMS) {
    if ((await p.contentDoc(tenantId, 'exam', e.id).get()).exists && !opts.overwrite) continue;
    await writeVersion(deps, tenantId, 'exam', e.id, { exam: e, blueprint: BUILTIN_BLUEPRINT }, 'builtin', actor, approve && Boolean(opts.approveExams), 'Built-in mock exam (requires expert approval)');
    created++;
  }
  return { created };
}

/* ---------------- admin: list, drafts, approval ---------------- */

export async function listContent(deps: Deps, tenantId: string, kind: ContentKind) {
  const snap = await paths(deps.db).content(tenantId, kind).get();
  return snap.docs.map((d) => d.data() as ContentDoc).map((d) => ({ ...d, pendingApproval: d.latestVersion > d.approvedVersion })).sort((a, b) => a.id.localeCompare(b.id));
}

async function approvedItemsMap(deps: Deps, tenantId: string, extra?: Item): Promise<Map<string, Item>> {
  const items = await listApproved(deps, tenantId, 'item');
  const m = new Map(items.map((i) => [i.content.id, i.content]));
  if (extra) m.set(extra.id, extra);
  return m;
}

/** Consistency check of any content version (items: self-contained; quests/exams: against approved items). */
export async function checkContent(deps: Deps, tenantId: string, kind: ContentKind, content: unknown) {
  if (kind === 'item') return checkItem(content);
  const items = await approvedItemsMap(deps, tenantId);
  if (kind === 'quest') return checkQuest(content, items);
  const c = content as Partial<ExamContent>;
  return checkExam(c?.exam, c?.blueprint, items);
}

export async function getContentAdmin(deps: Deps, tenantId: string, kind: ContentKind, id: string) {
  const p = paths(deps.db);
  const doc = (await p.contentDoc(tenantId, kind, id).get()).data() as ContentDoc | undefined;
  if (!doc) throw notFound('Content');
  const versions = await Promise.all(
    (await p.contentVersions(tenantId, kind, id).orderBy('version', 'desc').limit(15).get()).docs.map(async (x) => {
      const v = x.data() as ContentVersionDoc;
      const check = await checkContent(deps, tenantId, kind, v.content);
      return { ...v, check: { ok: check.ok, errors: check.errors, warnings: check.warnings } };
    }),
  );
  return { doc, versions };
}

export async function saveDraft(deps: Deps, tenantId: string, kind: ContentKind, id: string, content: unknown, actor: string, note: string, source: ContentDoc['source'] = 'teacher') {
  const schemaOk = kind === 'item' ? ItemSchema.safeParse(content).success : kind === 'quest' ? QuestSchema.safeParse(content).success : true;
  const check = await checkContent(deps, tenantId, kind, content);
  if (!schemaOk || (!check.value && !check.ok)) {
    throw new ApiError('VALIDATION', 'Content is invalid', check.errors.slice(0, 50).map((message) => ({ path: '', message })));
  }
  const cid = kind === 'exam' ? (content as ExamContent).exam.id : (content as { id: string }).id;
  if (cid !== id) throw new ApiError('VALIDATION', 'The id in the content must match the URL');
  const version = await writeVersion(deps, tenantId, kind, id, check.value && kind !== 'exam' ? check.value : content, source, actor, false, note);
  return { version, check: { ok: check.ok, errors: check.errors, warnings: check.warnings } };
}

/** Approves a version (must pass checks). Listening items get their audio rendered first; quests/exams need approved items. */
export async function approveContent(deps: Deps, tenantId: string, kind: ContentKind, id: string, version: number, actor: string) {
  const p = paths(deps.db);
  const v = await getVersion(deps, tenantId, kind, id, version);
  const check = await checkContent(deps, tenantId, kind, v.content);
  if (!check.ok) throw new ApiError('VALIDATION', 'This version has errors and cannot be approved', check.errors.map((message) => ({ path: '', message })));
  // Listening: keep audio the teacher already previewed or uploaded; otherwise render it now.
  if (kind === 'item' && (v.content as Item).skill === 'listening' && !v.audio?.rendered) await renderListeningAudio(deps, tenantId, v.content as Item, version);
  const now = deps.now().toISOString();
  await deps.db.runTransaction(async (tx) => {
    const ref = p.contentDoc(tenantId, kind, id);
    const d = (await tx.get(ref)).data() as ContentDoc;
    if (d.approvedVersion && d.approvedVersion !== version) tx.update(p.contentVersion(tenantId, kind, id, d.approvedVersion), { status: 'superseded' });
    tx.update(p.contentVersion(tenantId, kind, id, version), { status: 'approved', approvedBy: actor, approvedAt: now });
    tx.update(ref, { approvedVersion: version, status: 'approved', ...meta(kind, v.content), updatedAt: now });
  });
  return { approvedVersion: version };
}

/* ---------------- listening audio review (staff) ---------------- */

async function listeningVersion(deps: Deps, tenantId: string, id: string, version: number) {
  const v = await getVersion(deps, tenantId, 'item', id, version);
  if ((v.content as Item).skill !== 'listening') throw new ApiError('VALIDATION', 'Not a listening item');
  return v;
}

/** Renders Text-to-Speech audio for a (draft) version so the teacher can listen before approving. */
export async function renderAudio(deps: Deps, tenantId: string, id: string, version: number) {
  const v = await listeningVersion(deps, tenantId, id, version);
  const r = await renderListeningAudio(deps, tenantId, v.content as Item, version);
  return { rendered: Boolean(r?.rendered), segments: r?.segments ?? 0 };
}

/** Replaces the generated audio with a real recording (one MP3 for the whole script). */
export async function uploadAudio(deps: Deps, tenantId: string, id: string, version: number, mp3: Buffer, seconds: number) {
  await listeningVersion(deps, tenantId, id, version);
  if (mp3.length < 1000) throw new ApiError('VALIDATION', 'The audio file is empty');
  const path = `tenants/${tenantId}/listening/${id}/v${version}/upload.mp3`;
  await deps.blobs.put(path, mp3, 'audio/mpeg');
  const audio = { rendered: true, source: 'upload', segments: [{ index: 0, path, seconds: Math.round(seconds) }] };
  await paths(deps.db).contentVersion(tenantId, 'item', id, version).set({ audio }, { merge: true });
  return { rendered: true, segments: 1 };
}

export async function audioForReview(deps: Deps, tenantId: string, id: string, version: number, index: number) {
  const v = await listeningVersion(deps, tenantId, id, version);
  const seg = v.audio?.segments.find((s) => s.index === index);
  const data = seg ? await deps.blobs.get(seg.path) : null;
  if (!data) throw notFound('Audio');
  return data;
}

export async function setArchived(deps: Deps, tenantId: string, kind: ContentKind, id: string, archived: boolean) {
  const ref = paths(deps.db).contentDoc(tenantId, kind, id);
  const d = (await ref.get()).data() as ContentDoc | undefined;
  if (!d) throw notFound('Content');
  const status = archived ? 'archived' : d.approvedVersion ? 'approved' : 'draft';
  await ref.update({ status, updatedAt: deps.now().toISOString() });
  return { status };
}

/** AI Question Generator: always creates a DRAFT item (never usable in mock exams before approval). */
export async function generateItem(deps: Deps, m: Member, input: ItemRequest) {
  const req = ItemRequestSchema.parse(input);
  if ((await paths(deps.db).contentDoc(m.tenantId, 'item', req.id).get()).exists) throw new ApiError('CONFLICT', `${req.id} already exists`);
  const tenant = await getTenant(deps, m.tenantId);
  await deps.db.runTransaction(async (tx) => (await reserveAiCall(deps, tx, tenant, m.uid, null, null)).commit());
  const example = BUILTIN_ITEMS.find((i) => i.skill === req.skill && i.level === req.level) ?? BUILTIN_ITEMS.find((i) => i.skill === req.skill)!;
  const model = deps.config.geminiModel ?? tenant.aiConfig.assessmentModel;
  let feedback: string[] | undefined;
  let last: unknown = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    const started = Date.now();
    const r = await withRetry(() => deps.ai.generateItem(req, example, model, feedback), { retries: 1, timeoutMs: 180_000 });
    void recordUsage(deps, tenant, { kind: 'generate', uid: m.uid, sessionId: null, courseId: null, model, ...r.usage, ok: true, latencyMs: Date.now() - started });
    last = { ...(r.output as object), id: req.id };
    const c = checkItem(last);
    if (c.ok) return saveDraft(deps, m.tenantId, 'item', req.id, c.value, m.uid, `AI generated: ${req.topic}`, 'ai_generated');
    feedback = c.errors;
  }
  if (ItemSchema.safeParse(last).success) return saveDraft(deps, m.tenantId, 'item', req.id, last, m.uid, `AI generated (needs fixes): ${req.topic}`, 'ai_generated');
  throw new ApiError('VALIDATION', 'The AI could not produce a valid item. Try again or simplify the request.', (feedback ?? []).slice(0, 25).map((message) => ({ path: '', message })));
}
