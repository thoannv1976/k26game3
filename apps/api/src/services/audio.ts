import type { ContentVersionDoc, Item } from '@vq/shared';
import type { Deps } from '../deps.js';
import { paths } from '../paths.js';
import { recordUsage } from '../quota.js';
import { getTenant } from '../tenants.js';

export const segmentPath = (tenantId: string, itemId: string, version: number, index: number) => `tenants/${tenantId}/listening/${itemId}/v${version}/${index}.mp3`;

/**
 * Pre-renders the listening script line by line with each speaker's voice (Text-to-Speech) and stores the segments,
 * so students never trigger TTS costs. Offline TTS produces no audio (the dev client falls back to browser speech).
 */
export async function renderListeningAudio(deps: Deps, tenantId: string, item: Item, version: number) {
  if (item.skill !== 'listening') return;
  const rate = item.level === 'B1' ? 0.92 : 1.0;
  const segments: { index: number; path: string; seconds: number }[] = [];
  let chars = 0;
  for (const [index, line] of item.script.lines.entries()) {
    const sp = item.script.speakers.find((s) => s.id === line.speaker)!;
    const mp3 = await deps.tts.synthesize(line.text, sp.voice, rate);
    if (!mp3) {
      segments.length = 0;
      break;
    }
    const path = segmentPath(tenantId, item.id, version, index);
    await deps.blobs.put(path, mp3, 'audio/mpeg');
    chars += line.text.length;
    // ~2.5 words per second for the estimate shown in the player
    segments.push({ index, path, seconds: Math.round(line.text.split(/\s+/).length / 2.5) });
  }
  await paths(deps.db).contentVersion(tenantId, 'item', item.id, version).set({ audio: { rendered: segments.length > 0, source: 'tts', segments } } satisfies Partial<ContentVersionDoc>, { merge: true });
  if (chars) void recordUsage(deps, await getTenant(deps, tenantId), { kind: 'tts', uid: 'system', sessionId: null, courseId: null, ttsChars: chars, ok: true });
  return { rendered: segments.length > 0, segments: segments.length };
}
