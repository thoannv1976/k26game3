import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { backupKey, clearBackup, draftReducer, initDraft, readBackup, shouldAutosave, writeBackup, type DraftState } from './draft';

function memoryStorage() {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k), _m: m };
}

const g = globalThis as unknown as { window?: { localStorage: unknown } };

describe('draft reducer', () => {
  const init = (): DraftState => initDraft({ text: 'Hello', version: 2 }, null);

  it('starts clean from the server draft', () => {
    const s = init();
    expect(s).toMatchObject({ text: 'Hello', savedText: 'Hello', version: 2, status: 'idle' });
    expect(shouldAutosave(s)).toBe(false);
  });

  it('edit → dirty → save → saved with the new version', () => {
    let s = draftReducer(init(), { type: 'edit', text: 'Hello world' });
    expect(s.status).toBe('dirty');
    expect(shouldAutosave(s)).toBe(true);
    s = draftReducer(s, { type: 'saveStart' });
    expect(shouldAutosave(s)).toBe(false);
    s = draftReducer(s, { type: 'saveSuccess', draft: { text: 'Hello world', version: 3, updatedAt: 'now' }, sentText: 'Hello world' });
    expect(s).toMatchObject({ status: 'saved', version: 3, savedText: 'Hello world', inFlight: null, lastSavedAt: 'now' });
  });

  it('keeps edits typed while a save is in flight', () => {
    let s = draftReducer(init(), { type: 'edit', text: 'A' });
    s = draftReducer(s, { type: 'saveStart' });
    s = draftReducer(s, { type: 'edit', text: 'AB' });
    s = draftReducer(s, { type: 'saveSuccess', draft: { text: 'A', version: 3 }, sentText: 'A' });
    expect(s).toMatchObject({ text: 'AB', savedText: 'A', version: 3, status: 'dirty' });
    expect(shouldAutosave(s)).toBe(true);
  });

  it('network failure → offline, text kept, retried when back online', () => {
    let s = draftReducer(init(), { type: 'edit', text: 'Offline text' });
    s = draftReducer(draftReducer(s, { type: 'saveStart' }), { type: 'saveFailed', offline: true });
    expect(s).toMatchObject({ status: 'offline', text: 'Offline text', version: 2 });
    expect(shouldAutosave(s)).toBe(true);
    expect(draftReducer(s, { type: 'online' }).status).toBe('dirty');
  });

  it('conflict: keep mine rebases on the server version; use server replaces the text', () => {
    let s = draftReducer(init(), { type: 'edit', text: 'Mine' });
    s = draftReducer(draftReducer(s, { type: 'saveStart' }), { type: 'conflict', server: { text: 'Theirs', version: 5 } });
    expect(s.status).toBe('conflict');
    expect(shouldAutosave(s)).toBe(false);
    const mine = draftReducer(s, { type: 'keepMine' });
    expect(mine).toMatchObject({ text: 'Mine', version: 5, status: 'dirty', conflict: null });
    expect(shouldAutosave(mine)).toBe(true);
    const theirs = draftReducer(s, { type: 'useServer' });
    expect(theirs).toMatchObject({ text: 'Theirs', savedText: 'Theirs', version: 5, status: 'saved' });
  });

  it('restores a local backup of unsaved text for the same version', () => {
    const s = initDraft({ text: 'Server', version: 4 }, { text: 'Server + local edits', baseVersion: 4, savedAt: '' });
    expect(s).toMatchObject({ text: 'Server + local edits', savedText: 'Server', status: 'dirty', version: 4 });
  });

  it('asks the student when the backup is older than a changed server draft', () => {
    const s = initDraft({ text: 'Newer server text', version: 6 }, { text: 'Old local text', baseVersion: 4, savedAt: '' });
    expect(s.status).toBe('conflict');
    expect(s.conflict).toEqual({ server: { text: 'Newer server text', version: 6 }, local: 'Old local text' });
  });

  it('ignores identical or empty backups', () => {
    expect(initDraft({ text: 'Same', version: 1 }, { text: 'Same', baseVersion: 0, savedAt: '' }).status).toBe('idle');
    expect(initDraft({ text: 'Server', version: 1 }, { text: '  ', baseVersion: 1, savedAt: '' }).text).toBe('Server');
  });
});

describe('draft backup (localStorage)', () => {
  let store: ReturnType<typeof memoryStorage>;
  beforeEach(() => {
    store = memoryStorage();
    g.window = { localStorage: store };
  });
  afterEach(() => {
    delete g.window;
  });

  it('writes, reads and clears a backup per session', () => {
    writeBackup('s1', { text: 'My report', version: 3 });
    expect(readBackup('s1')).toMatchObject({ text: 'My report', baseVersion: 3 });
    expect(readBackup('s2')).toBeNull();
    clearBackup('s1');
    expect(readBackup('s1')).toBeNull();
  });

  it('ignores corrupted backups', () => {
    store.setItem(backupKey('s1'), '{not json');
    expect(readBackup('s1')).toBeNull();
    store.setItem(backupKey('s1'), JSON.stringify({ text: 5 }));
    expect(readBackup('s1')).toBeNull();
  });

  it('never throws when storage is blocked', () => {
    g.window = {
      localStorage: {
        getItem: () => {
          throw new Error('blocked');
        },
        setItem: () => {
          throw new Error('quota');
        },
        removeItem: () => {
          throw new Error('blocked');
        },
      },
    };
    expect(() => writeBackup('s1', { text: 'x', version: 1 })).not.toThrow();
    expect(readBackup('s1')).toBeNull();
    expect(() => clearBackup('s1')).not.toThrow();
  });
});
