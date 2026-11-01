/**
 * Consistency checks for content before approval (used by content tests, the admin editor and the AI Question Generator).
 */
import { ExamBlueprintSchema, ItemSchema, MockExamSchema, QuestSchema, type ExamBlueprint, type Item, type MockExam, type Quest } from '@vq/shared';
import { checkAnswer } from './scoring.js';
import { normalizeText, wordCount } from './text.js';

export interface Check<T> {
  ok: boolean;
  errors: string[];
  warnings: string[];
  value?: T;
}

const GB = new Set(['A', 'B', 'C', 'D', 'F']);

/** Source text of an item (passage or listening script) used to verify evidence quotes. */
export function sourceText(item: Item): string {
  if (item.skill === 'reading') return `${item.passage.title}\n${item.passage.body}`;
  if (item.skill === 'listening') return item.script.lines.map((l) => l.text).join('\n');
  return '';
}

export function checkItem(input: unknown): Check<Item> {
  const parsed = ItemSchema.safeParse(input);
  if (!parsed.success) return { ok: false, errors: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`), warnings: [] };
  const item = parsed.data;
  const errors: string[] = [];
  const warnings: string[] = [];
  if (item.skill === 'listening' || item.skill === 'reading') {
    const src = normalizeText(sourceText(item));
    const ids = new Set<string>();
    for (const q of item.questions) {
      if (ids.has(q.id)) errors.push(`duplicate question id ${q.id}`);
      ids.add(q.id);
      if (!src.includes(normalizeText(q.evidence))) errors.push(`question ${q.id}: evidence not found in the ${item.skill === 'reading' ? 'passage' : 'script'}`);
      if (q.type === 'mcq') {
        if (q.correctIndex >= q.options.length) errors.push(`question ${q.id}: correctIndex out of range`);
        if (new Set(q.options.map((o) => normalizeText(o))).size !== q.options.length) errors.push(`question ${q.id}: duplicate options`);
      }
      if (q.type === 'short') {
        for (const a of q.acceptable) if (!checkAnswer(q, a)) errors.push(`question ${q.id}: acceptable answer "${a}" does not pass its own check (too long?)`);
      }
    }
  }
  if (item.skill === 'listening') {
    const speakers = new Set(item.script.speakers.map((s) => s.id));
    for (const [i, l] of item.script.lines.entries()) if (!speakers.has(l.speaker)) errors.push(`script line ${i}: unknown speaker "${l.speaker}"`);
    for (const s of item.script.speakers) {
      const m = /^(en-(?:US|GB|AU))-(Neural2|Wavenet|Standard|Studio|Chirp3-HD)-([A-Z]|[A-Za-z]+)$/.exec(s.voice.name);
      if (!m) warnings.push(`speaker ${s.id}: unusual voice name ${s.voice.name}`);
      else if (m[1] !== s.voice.languageCode) errors.push(`speaker ${s.id}: voice ${s.voice.name} does not match ${s.voice.languageCode}`);
      if (m && m[1] === 'en-GB' && m[2] === 'Neural2' && !GB.has(m[3]!)) errors.push(`speaker ${s.id}: en-GB Neural2 voices are A, B, C, D, F`);
    }
    const words = item.script.lines.reduce((n, l) => n + wordCount(l.text), 0);
    if (words < 30) errors.push('listening script is too short (< 30 words)');
    if (item.plays.exam > item.plays.quest) errors.push('exam plays cannot exceed quest plays');
  }
  if (item.skill === 'writing') {
    const t = item.task;
    if (t.minWords >= t.maxWords) errors.push('task.minWords must be less than maxWords');
    const wc = wordCount(item.sampleAnswer);
    if (wc < t.minWords || wc > t.maxWords) errors.push(`sampleAnswer has ${wc} words (allowed ${t.minWords}–${t.maxWords})`);
  }
  if (item.skill === 'speaking') {
    const ids = new Set<string>();
    for (const p of item.parts) {
      if (ids.has(p.id)) errors.push(`duplicate part id ${p.id}`);
      ids.add(p.id);
      if (p.type === 'solution' && p.options.length < 2) errors.push(`part ${p.id}: a solution task needs at least 2 options`);
    }
  }
  return { ok: errors.length === 0, errors, warnings, value: item };
}

export function checkQuest(input: unknown, items: Map<string, Item>): Check<Quest> {
  const parsed = QuestSchema.safeParse(input);
  if (!parsed.success) return { ok: false, errors: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`), warnings: [] };
  const q = parsed.data;
  const errors: string[] = [];
  if (q.id[0] !== q.skill[0]!.toUpperCase()) errors.push(`quest id ${q.id} does not match skill ${q.skill}`);
  const ids = new Set<string>();
  for (const c of q.challenges) {
    if (ids.has(c.id)) errors.push(`duplicate challenge id ${c.id}`);
    ids.add(c.id);
    const item = items.get(c.itemId);
    if (!item) errors.push(`challenge ${c.id}: unknown item ${c.itemId}`);
    else if (item.skill !== q.skill) errors.push(`challenge ${c.id}: item ${c.itemId} is ${item.skill}, quest is ${q.skill}`);
  }
  if (q.requires.includes(q.id)) errors.push('a quest cannot require itself');
  return { ok: errors.length === 0, errors, warnings: [], value: q };
}

export function checkExam(examInput: unknown, blueprintInput: unknown, items: Map<string, Item>): Check<{ exam: MockExam; blueprint: ExamBlueprint }> {
  const e = MockExamSchema.safeParse(examInput);
  const b = ExamBlueprintSchema.safeParse(blueprintInput);
  const errors = [
    ...(e.success ? [] : e.error.issues.map((i) => `exam.${i.path.join('.')}: ${i.message}`)),
    ...(b.success ? [] : b.error.issues.map((i) => `blueprint.${i.path.join('.')}: ${i.message}`)),
  ];
  if (!e.success || !b.success) return { ok: false, errors, warnings: [] };
  const exam = e.data;
  const bp = b.data;
  const order = ['listening', 'reading', 'writing', 'speaking'];
  if (exam.blueprintId !== bp.id) errors.push('exam.blueprintId does not match the blueprint');
  exam.sections.forEach((s, i) => {
    if (s.skill !== order[i]) errors.push(`section ${i} must be ${order[i]}`);
    const bs = bp.sections.find((x) => x.skill === s.skill);
    if (!bs) return;
    if (bs.skill !== s.skill || bs.timeMinutes !== s.timeMinutes) errors.push(`section ${s.skill}: time differs from the blueprint`);
    const needItems = bs.parts.reduce((n, p) => n + p.itemCount, 0);
    if (s.itemIds.length !== needItems) errors.push(`section ${s.skill}: blueprint needs ${needItems} item(s), exam has ${s.itemIds.length}`);
    let qCount = 0;
    for (const id of s.itemIds) {
      const it = items.get(id);
      if (!it) errors.push(`section ${s.skill}: unknown item ${id}`);
      else {
        if (it.skill !== s.skill) errors.push(`section ${s.skill}: item ${id} is ${it.skill}`);
        if (it.skill === 'listening' || it.skill === 'reading') qCount += it.questions.length;
      }
    }
    const needQ = bs.parts.reduce((n, p) => n + p.questionCount, 0);
    if (needQ && qCount !== needQ) errors.push(`section ${s.skill}: blueprint needs ${needQ} question(s), exam has ${qCount}`);
  });
  return { ok: errors.length === 0, errors, warnings: [], value: { exam, blueprint: bp } };
}
