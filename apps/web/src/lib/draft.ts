/**
 * Report draft autosave: a pure reducer (unit tested) + a localStorage backup that never throws.
 * Rules: the server keeps a version number; every save sends `baseVersion`. A DRAFT_CONFLICT means another tab/device
 * saved a newer version – the student chooses which text to keep. Text is never discarded silently.
 */
import { getStored, removeStored, setStored } from './storage';

export interface ServerDraft {
  text: string;
  version: number;
  updatedAt?: string | null;
}

export type DraftStatus = 'idle' | 'dirty' | 'saving' | 'saved' | 'offline' | 'error' | 'conflict';

export interface DraftState {
  /** Text in the editor. */
  text: string;
  /** Last text confirmed by the server. */
  savedText: string;
  /** Server version `savedText` corresponds to (sent as baseVersion). */
  version: number;
  status: DraftStatus;
  /** Text currently being sent (null when idle). */
  inFlight: string | null;
  conflict: { server: ServerDraft; local: string } | null;
  lastSavedAt: string | null;
}

export type DraftAction =
  | { type: 'edit'; text: string }
  | { type: 'saveStart' }
  | { type: 'saveSuccess'; draft: ServerDraft; sentText: string }
  | { type: 'saveFailed'; offline: boolean }
  | { type: 'conflict'; server: ServerDraft }
  | { type: 'keepMine' }
  | { type: 'useServer' }
  | { type: 'online' };

export interface DraftBackup {
  text: string;
  baseVersion: number;
  savedAt: string;
}

export function isDirty(s: DraftState): boolean {
  return s.text !== s.savedText;
}

/** Whether an autosave tick should send the draft now. */
export function shouldAutosave(s: DraftState): boolean {
  return isDirty(s) && s.inFlight === null && s.status !== 'conflict';
}

/**
 * Initial state from the server draft and the local backup.
 * - backup equal to the server text (or missing) → server text
 * - backup based on the current server version (unsaved local edits) → restore the backup, mark dirty
 * - backup based on an older version and the server changed meanwhile → conflict (student chooses)
 */
export function initDraft(server: ServerDraft, backup: DraftBackup | null): DraftState {
  const base: DraftState = { text: server.text, savedText: server.text, version: server.version, status: 'idle', inFlight: null, conflict: null, lastSavedAt: server.updatedAt ?? null };
  if (!backup || backup.text === server.text || !backup.text.trim()) return base;
  if (backup.baseVersion >= server.version) return { ...base, text: backup.text, status: 'dirty' };
  return { ...base, text: backup.text, status: 'conflict', conflict: { server, local: backup.text } };
}

export function draftReducer(s: DraftState, a: DraftAction): DraftState {
  switch (a.type) {
    case 'edit':
      if (a.text === s.text) return s;
      return { ...s, text: a.text, status: s.status === 'conflict' ? 'conflict' : a.text === s.savedText && !s.inFlight ? 'saved' : 'dirty' };
    case 'saveStart':
      return { ...s, inFlight: s.text, status: 'saving' };
    case 'saveSuccess': {
      const savedText = a.sentText;
      const status: DraftStatus = s.text === savedText ? 'saved' : 'dirty';
      return { ...s, savedText, version: a.draft.version, inFlight: null, status, lastSavedAt: a.draft.updatedAt ?? new Date().toISOString() };
    }
    case 'saveFailed':
      return { ...s, inFlight: null, status: a.offline ? 'offline' : 'error' };
    case 'conflict':
      return { ...s, inFlight: null, status: 'conflict', conflict: { server: a.server, local: s.text } };
    case 'keepMine':
      // Keep the local text and overwrite the newer server version on the next save.
      if (!s.conflict) return s;
      return { ...s, text: s.conflict.local, savedText: s.conflict.server.text, version: s.conflict.server.version, conflict: null, status: 'dirty' };
    case 'useServer':
      if (!s.conflict) return s;
      return { ...s, text: s.conflict.server.text, savedText: s.conflict.server.text, version: s.conflict.server.version, conflict: null, status: 'saved' };
    case 'online':
      return s.status === 'offline' ? { ...s, status: isDirty(s) ? 'dirty' : 'saved' } : s;
  }
}

/* ---------------- local backup ---------------- */

export const backupKey = (sessionId: string) => `ed.draft.${sessionId}`;

export function readBackup(sessionId: string): DraftBackup | null {
  const raw = getStored(backupKey(sessionId));
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as Partial<DraftBackup>;
    if (typeof v.text !== 'string' || typeof v.baseVersion !== 'number') return null;
    return { text: v.text, baseVersion: v.baseVersion, savedAt: String(v.savedAt ?? '') };
  } catch {
    return null;
  }
}

export function writeBackup(sessionId: string, s: Pick<DraftState, 'text' | 'version'>) {
  setStored(backupKey(sessionId), JSON.stringify({ text: s.text, baseVersion: s.version, savedAt: new Date().toISOString() } satisfies DraftBackup));
}

export function clearBackup(sessionId: string) {
  removeStored(backupKey(sessionId));
}
