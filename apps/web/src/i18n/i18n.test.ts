import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { en } from './en';
import { vi } from './vi';

type Tree = { [k: string]: string | Tree };

function flatten(obj: Tree, prefix = ''): Map<string, string> {
  const out = new Map<string, string>();
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (typeof v === 'string') out.set(key, v);
    else for (const [kk, vv] of flatten(v, key)) out.set(kk, vv);
  }
  return out;
}

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) return sourceFiles(p);
    return /\.tsx?$/.test(f) && !f.endsWith('.test.ts') ? [p] : [];
  });
}

const enKeys = flatten(en as unknown as Tree);
const viKeys = flatten(vi as unknown as Tree);
const placeholders = (s: string) => [...s.matchAll(/{{\s*(\w+)\s*}}/g)].map((m) => m[1]).sort();

describe('i18n dictionaries', () => {
  it('vi and en have the same keys', () => {
    expect([...viKeys.keys()].sort()).toEqual([...enKeys.keys()].sort());
  });

  it('vi and en use the same interpolation placeholders', () => {
    for (const [k, v] of enKeys) expect(placeholders(viKeys.get(k) ?? ''), k).toEqual(placeholders(v));
  });

  it('every static t() key used in the source exists', () => {
    const root = join(__dirname, '..');
    const missing: string[] = [];
    for (const file of sourceFiles(root)) {
      const src = readFileSync(file, 'utf8');
      for (const m of src.matchAll(/\bt\(\s*['`]([a-zA-Z0-9_.${}\-]+)['`]/g)) {
        const key = m[1]!;
        if (key.includes('${')) {
          // Dynamic key: the static prefix must be a known namespace.
          const prefix = key.slice(0, key.indexOf('${'));
          if (![...enKeys.keys()].some((k) => k.startsWith(prefix))) missing.push(`${file}: ${key}`);
        } else if (!enKeys.has(key)) missing.push(`${file}: ${key}`);
      }
      for (const m of src.matchAll(/'((?:login\.errors)[a-zA-Z.]*)'/g)) {
        if (!enKeys.has(m[1]!)) missing.push(`${file}: ${m[1]}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it('has a message for every API error code', async () => {
    const { ApiErrorCodes } = await import('@vq/shared');
    for (const code of ApiErrorCodes) expect(enKeys.has(`errors.${code}`), code).toBe(true);
  });
});
