import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { wordCount as serverWordCount } from '../../../../packages/game-engine/src/text';
import { parseBlocks, parseMarkdownTable, segmentText, splitLineIntoSentences, splitSentences, wordCount, wordTarget } from './text';

const casesDir = join(__dirname, '../../../../content/cases');
const cases = readdirSync(casesDir)
  .filter((f) => f.endsWith('.json'))
  .map((f) => JSON.parse(readFileSync(join(casesDir, f), 'utf8')) as { id: string; documents: { id: string; body: string }[]; evidence: { documentId: string; excerpt: string }[]; sampleSolution: { report: string; highlights: { documentId: string; text: string }[] } });

describe('parseMarkdownTable', () => {
  it('parses header, separator and rows', () => {
    const t = parseMarkdownTable('| Time | Room |\n|---|:---:|\n| 07:35 | B204 |\n| 12:40 | B210 |');
    expect(t).toEqual({ header: ['Time', 'Room'], rows: [['07:35', 'B204'], ['12:40', 'B210']] });
  });
  it('pads short rows and accepts tables without a separator', () => {
    expect(parseMarkdownTable('| A | B | C |\n| 1 | 2 |')).toEqual({ header: ['A', 'B', 'C'], rows: [['1', '2', '']] });
  });
  it('rejects non-table text', () => {
    expect(parseMarkdownTable('Hello | world')).toBeNull();
    expect(parseMarkdownTable('| only one row |')).toBeNull();
  });
  it('keeps empty cells', () => {
    expect(parseMarkdownTable('| a | | c |\n|---|---|---|\n| | x | |')?.rows).toEqual([['', 'x', '']]);
  });
});

describe('parseBlocks', () => {
  it('splits paragraphs, lists and tables (also a table right after a title line)', () => {
    const blocks = parseBlocks('TITLE\n| A | B |\n|---|---|\n| 1 | 2 |\n\n- one\n- two\n\n1. first\n2. second\n\nLine one\nLine two');
    expect(blocks.map((b) => b.kind)).toEqual(['paragraph', 'table', 'list', 'list', 'paragraph']);
    expect(blocks[3]).toMatchObject({ kind: 'list', ordered: true, items: ['first', 'second'] });
    expect(blocks[4]).toMatchObject({ lines: ['Line one', 'Line two'] });
  });
  it('parses every table in the built-in cases', () => {
    for (const c of cases) for (const d of c.documents) {
      if (!d.body.includes('|---')) continue;
      expect(parseBlocks(d.body).some((b) => b.kind === 'table'), `${c.id}/${d.id}`).toBe(true);
    }
  });
});

describe('sentence splitter', () => {
  it('splits on sentence ends but keeps abbreviations, decimals and amounts', () => {
    expect(splitLineIntoSentences('Mr. David Miller wrote it. The fee is $4.50 per day! Is it real? Yes.')).toEqual([
      'Mr. David Miller wrote it.',
      'The fee is $4.50 per day!',
      'Is it real?',
      'Yes.',
    ]);
  });
  it('handles quotes and numbers after the full stop', () => {
    expect(splitLineIntoSentences('She said "No." 20 students came.')).toEqual(['She said "No."', '20 students came.']);
  });
  it('treats lines, list items and table rows as separate chips', () => {
    expect(splitSentences('Bank: Global\nAccount: 123\n\n- a item\n- b item\n\n| T | R |\n|---|---|\n| 9:00 | B2 |')).toEqual(['Bank: Global', 'Account: 123', 'a item', 'b item', '9:00 | B2']);
  });
  it('every evidence excerpt and sample highlight is covered by a run of adjacent chips (cases can be solved in Select mode)', () => {
    const norm = (x: string) => x.toLowerCase().replace(/[^a-z0-9$%]+/g, ' ').trim();
    const covered = (chips: string[], text: string) => {
      const want = norm(text);
      for (let i = 0; i < chips.length; i++) for (let j = i; j < Math.min(chips.length, i + 4); j++) if (norm(chips.slice(i, j + 1).join(' ')).includes(want)) return true;
      return false;
    };
    for (const c of cases) {
      for (const h of c.sampleSolution.highlights) expect(covered(splitSentences(c.documents.find((d) => d.id === h.documentId)!.body), h.text), `${c.id}: ${h.text}`).toBe(true);
      for (const e of c.evidence) expect(covered(splitSentences(c.documents.find((d) => d.id === e.documentId)!.body), e.excerpt), `${c.id}: ${e.excerpt}`).toBe(true);
    }
  });
  it('keeps initials such as "Minh P." inside the sentence', () => {
    expect(splitLineIntoSentences('Minh P. (2 May 2027): Amazing laptop! Best shop ever.')).toEqual(['Minh P. (2 May 2027): Amazing laptop!', 'Best shop ever.']);
  });
});

describe('word counter', () => {
  it('is the same function the server uses', () => {
    const samples = ['', '  ', 'Hello world', "Emma's e-mail isn't real – it's a scam.", 'Phí 150 USD, trả trong 48 giờ!', 'well-known  co-operate\n\nnew line', '$5,000 on 20/03/2027 at 9:12'];
    for (const s of samples) expect(wordCount(s), s).toBe(serverWordCount(s));
    for (const c of cases) expect(wordCount(c.sampleSolution.report)).toBe(serverWordCount(c.sampleSolution.report));
  });
  it('counts words, contractions and hyphenated words once', () => {
    expect(wordCount("It isn't a well-known scam.")).toBe(5);
  });
  it('reports the target status', () => {
    expect(wordTarget(0, 150, 200)).toBe('empty');
    expect(wordTarget(120, 150, 200)).toBe('short');
    expect(wordTarget(150, 150, 200)).toBe('ok');
    expect(wordTarget(201, 150, 200)).toBe('long');
  });
});

describe('segmentText', () => {
  it('marks collected evidence and glossary terms', () => {
    const segs = segmentText('You must pay a processing fee of $150 within 48 hours.', ['pay a processing fee'], ['processing fee', 'hours']);
    expect(segs).toEqual([{ text: 'You must ' }, { text: 'pay a processing fee', mark: true }, { text: ' of $150 within 48 ' }, { text: 'hours', term: 1 }, { text: '.' }]);
  });
  it('matches case-insensitively and across different whitespace', () => {
    const segs = segmentText('The  Committee meets on 15 March.', ['the committee meets'], []);
    expect(segs[0]).toEqual({ text: 'The  Committee meets', mark: true });
  });
  it('does not underline a term inside a longer word', () => {
    expect(segmentText('A feeling.', [], ['fee']).some((s) => s.term !== undefined)).toBe(false);
  });
  it('escapes special characters', () => {
    expect(segmentText('Cost: $150 (fee).', ['$150 (fee)'], [])).toContainEqual({ text: '$150 (fee)', mark: true });
  });
});
