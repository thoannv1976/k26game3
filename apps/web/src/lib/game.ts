/**
 * Game helpers shared by the student pages: player level progress, skill/zone styling, avatar unlocks and the
 * rubric criteria (same maxima as the server's scoring module).
 */
import { BADGES, SPEAKING_MAX, WRITING_MAX, playerLevel } from '@vq/game-engine/core';
import { OUTFIT_IDS, SKILLS, type Skill } from '@vq/shared';
import type { CriterionScore } from '../api/types';

export { BADGES, SKILLS };
export const WRITING_CRITERIA = Object.keys(WRITING_MAX) as (keyof typeof WRITING_MAX)[];
export const SPEAKING_CRITERIA = Object.keys(SPEAKING_MAX) as (keyof typeof SPEAKING_MAX)[];
export const CRITERIA_MAX: Record<'writing' | 'speaking', Record<string, number>> = { writing: WRITING_MAX, speaking: SPEAKING_MAX };

/** XP at which the player's current level started, the next level threshold and the progress in between. */
export function levelProgress(xp: number): { level: number; start: number; nextAt: number; inLevel: number; span: number; ratio: number } {
  const { level, nextAt } = playerLevel(Math.max(0, xp));
  let start = 0;
  let need = 200;
  for (let l = 1; l < level; l++) {
    start += need;
    need = Math.round(need * 1.25);
  }
  const span = Math.max(1, nextAt - start);
  const inLevel = Math.max(0, xp - start);
  return { level, start, nextAt, inLevel, span, ratio: Math.min(1, inLevel / span) };
}

/** Outfit i unlocks at player level i + 1 (the first outfit is always available). */
export function outfitUnlockLevel(outfit: (typeof OUTFIT_IDS)[number]): number {
  return Math.max(1, OUTFIT_IDS.indexOf(outfit) + 1);
}
export function outfitUnlocked(outfit: (typeof OUTFIT_IDS)[number], level: number): boolean {
  return level >= outfitUnlockLevel(outfit);
}

export interface SkillMeta {
  emoji: string;
  /** Tailwind classes. */
  text: string;
  soft: string;
  ring: string;
  gradient: string;
  /** CSS colour (charts). */
  color: string;
}
export const SKILL_META: Record<Skill, SkillMeta> = {
  listening: { emoji: '🎧', text: 'text-listening', soft: 'bg-listening-soft', ring: 'ring-listening', gradient: 'from-sky-400 via-cyan-400 to-teal-300', color: 'var(--vq-listening)' },
  reading: { emoji: '📖', text: 'text-reading', soft: 'bg-reading-soft', ring: 'ring-reading', gradient: 'from-violet-500 via-purple-400 to-fuchsia-300', color: 'var(--vq-reading)' },
  writing: { emoji: '✍️', text: 'text-writing', soft: 'bg-writing-soft', ring: 'ring-writing', gradient: 'from-amber-400 via-orange-400 to-yellow-300', color: 'var(--vq-writing)' },
  speaking: { emoji: '🎤', text: 'text-speaking', soft: 'bg-speaking-soft', ring: 'ring-speaking', gradient: 'from-rose-500 via-pink-400 to-orange-300', color: 'var(--vq-speaking)' },
};

export const BADGE_EMOJI: Record<string, string> = {
  listening_explorer: '🧭',
  reading_master: '📚',
  writing_challenger: '🖋️',
  speaking_champion: '🏆',
  four_skill_explorer: '🌍',
  daily_learning_hero: '🔥',
  mock_exam_finisher: '🎓',
  championship_podium: '🥇',
};

/** "12/25" style label of a criterion; null scores are never shown as numbers. */
export function criterionLabel(c: Pick<CriterionScore, 'score' | 'max'>): string | null {
  return c.score === null ? null : `${c.score}/${c.max}`;
}

/** Heat-map tone for a 0–100 score (null = no data). */
export function scoreTone(score: number | null): 'none' | 'low' | 'mid' | 'high' {
  if (score === null) return 'none';
  if (score < 50) return 'low';
  if (score < 75) return 'mid';
  return 'high';
}
