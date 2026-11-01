/** Basic classroom content filter (Gemini safety settings are the second layer). Extend with BLOCKED_TERMS. */
const DEFAULT_TERMS = ['fuck', 'fucking', 'shit', 'bitch', 'cunt', 'nigger', 'faggot', 'dick', 'pussy', 'whore', 'slut', 'đụ', 'địt', 'lồn', 'cặc'];
let terms: string[] | null = null;

export function isInappropriate(text: string): boolean {
  if (!terms) {
    const extra = (process.env.BLOCKED_TERMS ?? '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
    terms = [...DEFAULT_TERMS, ...extra];
  }
  const t = ` ${text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ')} `;
  return terms.some((w) => t.includes(` ${w} `));
}
