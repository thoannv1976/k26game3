/** Text helpers shared by highlight matching, short answers and grader checks. */
export function normalizeText(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[‘’]/g, "'")
    .replace(/[^a-z0-9$€£%@.']+/g, ' ')
    .replace(/(?<!\d)\.|\.(?!\d)/g, ' ') // keep decimal points like 4.5, drop other dots
    .replace(/'/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function tokens(s: string): string[] {
  const n = normalizeText(s);
  return n ? n.split(' ') : [];
}

export function containsPhrase(text: string, phrase: string): boolean {
  const p = normalizeText(phrase);
  if (!p) return false;
  return ` ${normalizeText(text)} `.includes(` ${p} `);
}

export function wordCount(s: string): number {
  return (s.trim().match(/[A-Za-zÀ-ỹ0-9]+(?:['’-][A-Za-zÀ-ỹ0-9]+)*/g) ?? []).length;
}
