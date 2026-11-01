/**
 * Document text helpers for the Document Room: block parsing (paragraphs, lists, Markdown pipe tables),
 * sentence splitting for the keyboard/touch "Select text" mode, and highlight/glossary segmentation.
 * Word counting reuses the server's implementation so the counter always matches what the API stores.
 */
export { wordCount } from '@engine/text';

/* ---------------- Markdown pipe tables ---------------- */

export interface ParsedTable {
  header: string[];
  rows: string[][];
}

const isPipeRow = (line: string) => /^\s*\|.*\|\s*$/.test(line);
const isSeparatorRow = (line: string) => /^\s*\|(\s*:?-{2,}:?\s*\|)+\s*$/.test(line);

function splitRow(line: string): string[] {
  const inner = line.trim().replace(/^\|/, '').replace(/\|$/, '');
  return inner.split('|').map((c) => c.trim());
}

/** Parses Markdown pipe rows ("| a | b |", "|---|---|", …) into a header and body rows. Returns null if not a table. */
export function parseMarkdownTable(text: string): ParsedTable | null {
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== '');
  if (lines.length < 2 || !lines.every(isPipeRow)) return null;
  const sepIndex = lines.findIndex(isSeparatorRow);
  let header: string[];
  let body: string[];
  if (sepIndex === 1) {
    header = splitRow(lines[0]!);
    body = lines.slice(2);
  } else if (sepIndex === -1) {
    header = splitRow(lines[0]!);
    body = lines.slice(1);
  } else return null;
  const width = header.length;
  const rows = body.filter((l) => !isSeparatorRow(l)).map((l) => {
    const cells = splitRow(l);
    if (cells.length < width) return [...cells, ...Array<string>(width - cells.length).fill('')];
    return cells.slice(0, Math.max(width, cells.length));
  });
  return { header, rows };
}

/* ---------------- blocks ---------------- */

export type DocBlock =
  | { kind: 'paragraph'; lines: string[] }
  | { kind: 'list'; items: string[]; ordered: boolean }
  | { kind: 'table'; table: ParsedTable };

/** Splits a document body into blocks. Paragraphs are separated by blank lines; tables may also follow a text line directly. */
export function parseBlocks(body: string): DocBlock[] {
  const out: DocBlock[] = [];
  const chunks = body.replace(/\r\n/g, '\n').split(/\n\s*\n/);
  for (const chunk of chunks) {
    const lines = chunk.split('\n').filter((l) => l.trim() !== '');
    if (!lines.length) continue;
    // A chunk can mix text lines and a table: split into runs of pipe rows and other lines.
    let run: string[] = [];
    let runIsTable = false;
    const flush = () => {
      if (!run.length) return;
      if (runIsTable) {
        const table = parseMarkdownTable(run.join('\n'));
        if (table) out.push({ kind: 'table', table });
        else out.push({ kind: 'paragraph', lines: run });
      } else pushText(out, run);
      run = [];
    };
    for (const line of lines) {
      const pipe = isPipeRow(line);
      if (run.length && pipe !== runIsTable) flush();
      runIsTable = pipe;
      run.push(line);
    }
    flush();
  }
  return out;
}

const bullet = /^\s*[-•*]\s+/;
const numbered = /^\s*\d+[.)]\s+/;

function pushText(out: DocBlock[], lines: string[]) {
  // Group consecutive bullet / numbered lines into lists; other lines stay paragraphs.
  let i = 0;
  while (i < lines.length) {
    const kind = bullet.test(lines[i]!) ? 'bullet' : numbered.test(lines[i]!) ? 'number' : 'text';
    let j = i + 1;
    const same = (l: string) => (kind === 'bullet' ? bullet.test(l) : kind === 'number' ? numbered.test(l) : !bullet.test(l) && !numbered.test(l));
    while (j < lines.length && same(lines[j]!)) j++;
    const run = lines.slice(i, j);
    if (kind === 'bullet') out.push({ kind: 'list', ordered: false, items: run.map((l) => l.replace(bullet, '')) });
    else if (kind === 'number' && run.length > 1) out.push({ kind: 'list', ordered: true, items: run.map((l) => l.replace(numbered, '')) });
    else out.push({ kind: 'paragraph', lines: run });
    i = j;
  }
}

/* ---------------- sentences ---------------- */

const ABBREVIATIONS = /\b(Mr|Mrs|Ms|Dr|Prof|St|No|Nos|vs|etc|e\.g|i\.e|approx|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec|Ltd|Inc|Co|Rm)\.$/i;

/** Splits one line of text into sentences (keeps abbreviations like "Mr." and decimals like "4.5" together). */
export function splitLineIntoSentences(line: string): string[] {
  const text = line.trim();
  if (!text) return [];
  const parts: string[] = [];
  const re = /[.!?]+["”’)\]]*(?=\s+["“‘(\[]?[A-Z0-9£$€])/g;
  let start = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const end = m.index + m[0].length;
    const candidate = text.slice(start, end);
    if (ABBREVIATIONS.test(candidate.trimEnd()) || /(^|[\s(])[A-Z]\.$/.test(candidate.trimEnd())) continue;
    parts.push(candidate.trim());
    start = end;
  }
  const rest = text.slice(start).trim();
  if (rest) parts.push(rest);
  return parts.filter(Boolean);
}

/**
 * Splits a whole document body into selectable sentences for the "Select text" mode.
 * Each line (header-like lines, list items, table rows) becomes at least one chip; table rows become "cell – cell – cell".
 */
export function splitSentences(body: string): string[] {
  const out: string[] = [];
  for (const block of parseBlocks(body)) {
    if (block.kind === 'table') {
      for (const row of block.table.rows) {
        const cells = row.filter((c) => c.trim());
        if (cells.length) out.push(cells.join(' | '));
      }
    } else {
      const lines = block.kind === 'list' ? block.items : block.lines;
      for (const l of lines) out.push(...splitLineIntoSentences(l));
    }
  }
  return out;
}

/* ---------------- highlight + glossary segmentation ---------------- */

export interface TextSegment {
  text: string;
  /** Part of already-collected evidence. */
  mark?: boolean;
  /** Glossary term (index into the glossary array). */
  term?: number;
}

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Flexible pattern: whitespace in the phrase matches any whitespace in the text. */
function phrasePattern(phrase: string) {
  return phrase
    .trim()
    .split(/\s+/)
    .map(escapeRegExp)
    .join('\\s+');
}

function ranges(text: string, phrases: string[], wordBoundary: boolean): [number, number, number][] {
  const out: [number, number, number][] = [];
  phrases.forEach((p, idx) => {
    if (!p || p.trim().length < 2) return;
    const src = wordBoundary ? `(?<![A-Za-z0-9])${phrasePattern(p)}(?![A-Za-z0-9])` : phrasePattern(p);
    const re = new RegExp(src, 'gi');
    let m: RegExpExecArray | null;
    while ((m = re.exec(text))) {
      if (!m[0].length) break;
      out.push([m.index, m.index + m[0].length, idx]);
      if (wordBoundary) break; // underline only the first occurrence of a glossary term per text run
    }
  });
  return out.sort((a, b) => a[0] - b[0] || b[1] - a[1]);
}

/**
 * Splits `text` into segments, marking collected evidence (may partially overlap the text) and glossary terms.
 * Evidence marks take priority; glossary terms are only applied outside marked ranges.
 */
export function segmentText(text: string, marks: string[], terms: string[]): TextSegment[] {
  // Evidence: merge overlapping ranges. A highlight that spans several lines is matched per line fragment.
  const markRanges = ranges(text, marks.flatMap((m) => m.split(/\n+/)), false);
  const merged: [number, number][] = [];
  for (const [s, e] of markRanges) {
    const last = merged[merged.length - 1];
    if (last && s <= last[1]) last[1] = Math.max(last[1], e);
    else merged.push([s, e]);
  }
  const segments: TextSegment[] = [];
  let pos = 0;
  const pushPlain = (from: number, to: number) => {
    if (to <= from) return;
    const piece = text.slice(from, to);
    const termRanges = ranges(piece, terms, true);
    let p = 0;
    for (const [s, e, idx] of termRanges) {
      if (s < p) continue;
      if (s > p) segments.push({ text: piece.slice(p, s) });
      segments.push({ text: piece.slice(s, e), term: idx });
      p = e;
    }
    if (p < piece.length) segments.push({ text: piece.slice(p) });
  };
  for (const [s, e] of merged) {
    pushPlain(pos, s);
    segments.push({ text: text.slice(s, e), mark: true });
    pos = e;
  }
  pushPlain(pos, text.length);
  return segments.length ? segments : [{ text }];
}

/** Word-count status against a target range (used for the colour of the counter). */
export function wordTarget(count: number, min: number, max: number): 'empty' | 'short' | 'ok' | 'long' {
  if (count === 0) return 'empty';
  if (count < min) return 'short';
  if (count > max) return 'long';
  return 'ok';
}
