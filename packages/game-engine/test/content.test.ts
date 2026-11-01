import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { Item } from '@vq/shared';
import { checkExam, checkItem, checkQuest } from '../src/check.js';
import { newAttempt, recordAnswer } from '../src/attempt.js';
import { questionsOf, skillResult, type ItemResult } from '../src/scoring.js';
import { itemView } from '../src/view.js';

const root = new URL('../../../content/', import.meta.url);
const read = (sub: string) =>
  readdirSync(new URL(sub, root))
    .filter((f) => f.endsWith('.json'))
    .sort()
    .map((f) => ({ file: f, data: JSON.parse(readFileSync(new URL(`${sub}${f}`, root), 'utf8')) }));
const questFiles = read('quests/');
const examFiles = read('exams/');

const allItems = new Map<string, Item>();
for (const b of [...questFiles, ...examFiles]) for (const i of b.data.items) {
  const c = checkItem(i);
  if (c.value) allItems.set(c.value.id, c.value);
}

const correctValue = (q: ReturnType<typeof questionsOf>[number]) => (q.type === 'mcq' ? q.correctIndex : q.type === 'tfng' ? q.answer : q.acceptable[0]!);

describe('item ids are unique across all content', () => {
  it('no duplicates', () => {
    const ids = [...questFiles, ...examFiles].flatMap((b) => b.data.items.map((i: { id: string }) => i.id));
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe.each(questFiles.map((f) => [f.file, f.data] as const))('quest %s', (file, bundle) => {
  it('items pass the consistency checks', () => {
    for (const i of bundle.items) expect(checkItem(i).errors, `${file} ${i.id}`).toEqual([]);
  });
  it('quest passes the checks and its items belong to it', () => {
    const c = checkQuest(bundle.quest, allItems);
    expect(c.errors).toEqual([]);
    for (const ch of c.value!.challenges) expect(ch.itemId.startsWith(`${c.value!.id}_`)).toBe(true);
    expect(file).toBe(`${c.value!.id}.json`);
  });
  it('correct answers score 100 and views hide answers before answering', () => {
    const items = bundle.items.map((i: unknown) => checkItem(i).value!) as Item[];
    let s = newAttempt();
    const results: ItemResult[] = [];
    for (const item of items) {
      const v = JSON.stringify(itemView(item, s, { mode: 'quest' }));
      for (const k of ['correctIndex', 'acceptable', 'explanation', 'evidence', 'keyPoints', 'sampleAnswer']) expect(v).not.toContain(`"${k}":`);
      if (item.skill === 'listening') expect(v).not.toContain(item.script.lines[0]!.text);
      let earned = 0;
      let total = 0;
      for (const q of questionsOf(item)) {
        const r = recordAnswer(s, item, q.id, correctValue(q), 'quest', new Date());
        expect(r.record.correct, `${item.id}.${q.id}`).toBe(true);
        s = r.state;
        earned += r.record.points;
        total += q.points;
      }
      if (item.skill === 'listening' || item.skill === 'reading') results.push({ itemId: item.id, skill: item.skill, earned, total, score: 100 });
    }
    const skill = items[0]!.skill;
    if (skill === 'listening' || skill === 'reading') expect(skillResult(skill, results).score).toBe(100);
  });
});

describe.each(examFiles.map((f) => [f.file, f.data] as const))('mock exam %s', (_file, bundle) => {
  it('items and structure pass the checks', () => {
    for (const i of bundle.items) expect(checkItem(i).errors, i.id).toEqual([]);
    const c = checkExam(bundle.exam, bundle.blueprint, allItems);
    expect(c.errors).toEqual([]);
  });
});
