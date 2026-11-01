/**
 * Deterministic scoring for VSTEP Quest.
 * - Listening/Reading: machine-scored from approved answers.
 * - Writing/Speaking: AI preliminary scores (merged by the API) + teacher review; missing data = not assessed.
 * - Two separate systems: Learning Assessment Score (0–100 per skill) and Game XP / badges.
 */
import type { Item, ObjectiveQuestion, Skill, SpeakingItem, WritingItem } from '@vq/shared';
import { normalizeText, tokens } from './text.js';

export const RUBRIC_VERSION = 'vq-rubric-1.0';
export const DISCLAIMER =
  'Practice result with AI-assisted feedback – not an official VSTEP score or certificate. / Kết quả luyện tập có hỗ trợ AI – không phải điểm hay chứng chỉ VSTEP chính thức.';

/* ---------------- objective answers ---------------- */

export function checkAnswer(q: ObjectiveQuestion, value: number | string): boolean {
  switch (q.type) {
    case 'mcq':
      return Number(value) === q.correctIndex;
    case 'tfng':
      return String(value).toLowerCase().replace(/[\s-]+/g, '_') === q.answer;
    case 'short': {
      const v = normalizeText(String(value));
      if (!v || tokens(String(value)).length > q.maxWords + 2) return false;
      return q.acceptable.some((a) => {
        const n = normalizeText(a);
        return v === n || ` ${v} `.includes(` ${n} `);
      });
    }
  }
}

export function validAnswerValue(q: ObjectiveQuestion, value: unknown): boolean {
  if (q.type === 'mcq') return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value < q.options.length;
  if (q.type === 'tfng') return ['true', 'false', 'not_given'].includes(String(value).toLowerCase().replace(/[\s-]+/g, '_'));
  return typeof value === 'string' && value.trim().length > 0 && value.length <= 120;
}

export function questionsOf(item: Item): ObjectiveQuestion[] {
  return item.skill === 'listening' || item.skill === 'reading' ? item.questions : [];
}

/* ---------------- rubric-based criteria ---------------- */

export const WRITING_MAX = { taskFulfillment: 25, organization: 25, vocabulary: 25, grammar: 25 } as const;
export const SPEAKING_MAX = { taskFulfillment: 25, fluency: 20, vocabulary: 20, grammar: 20, pronunciation: 15 } as const;
export type WritingCriterion = keyof typeof WRITING_MAX;
export type SpeakingCriterion = keyof typeof SPEAKING_MAX;

export interface CriterionScore {
  score: number | null;
  max: number;
  /** ai | speech_metrics | teacher | none */
  source: 'ai' | 'speech_metrics' | 'teacher' | 'none';
  status: 'assessed' | 'not_assessed' | 'pending_review';
  comment: string;
}

export type ItemResult =
  | { itemId: string; skill: 'listening' | 'reading'; earned: number; total: number; score: number }
  | { itemId: string; skill: 'writing'; weight: number; criteria: Record<WritingCriterion, CriterionScore>; score: number | null; status: SkillStatus }
  | { itemId: string; skill: 'speaking'; criteria: Record<SpeakingCriterion, CriterionScore>; score: number | null; status: SkillStatus };

export type SkillStatus = 'assessed' | 'partial' | 'pending_review' | 'not_assessed';

/** Score (0–100) over the assessed criteria; status tells whether some criteria still need a teacher or data. */
export function criteriaScore(criteria: Record<string, CriterionScore>): { score: number | null; status: SkillStatus } {
  let got = 0;
  let max = 0;
  let pending = 0;
  let missing = 0;
  for (const c of Object.values(criteria)) {
    if (c.status === 'assessed' && c.score !== null) {
      got += c.score;
      max += c.max;
    } else if (c.status === 'pending_review') pending++;
    else missing++;
  }
  if (max === 0) return { score: null, status: pending ? 'pending_review' : 'not_assessed' };
  return { score: Math.round((got / max) * 100), status: pending ? 'pending_review' : missing ? 'partial' : 'assessed' };
}

/** Fluency from speech timing (same rule as English City Simulator); null when there is not enough audio. */
export const FLUENCY_MIN_SECONDS = 20;
export function fluencyFromMetrics(m: { words: number; speechSeconds: number; longPauses: number } | null, max = SPEAKING_MAX.fluency): CriterionScore {
  if (!m || m.speechSeconds < FLUENCY_MIN_SECONDS || m.words < 20) {
    return { score: null, max, source: 'speech_metrics', status: 'not_assessed', comment: `Not assessed: needs at least ${FLUENCY_MIN_SECONDS}s of clear speech.` };
  }
  const wpm = (m.words / m.speechSeconds) * 60;
  const rate = wpm >= 90 && wpm <= 150 ? 1 : wpm < 90 ? Math.max(0, (wpm - 40) / 50) : Math.max(0.5, 1 - (wpm - 150) / 100);
  const pausesPerMinute = m.longPauses / (m.speechSeconds / 60);
  const pause = Math.max(0, 1 - pausesPerMinute * 0.15);
  return { score: Math.round(max * (0.6 * rate + 0.4 * pause)), max, source: 'speech_metrics', status: 'assessed', comment: `≈${Math.round(wpm)} words/min, ${m.longPauses} long pause(s).` };
}

/** Pronunciation is never scored from a transcript: it waits for the teacher (or a dedicated tool later). */
export const PRONUNCIATION_PENDING: CriterionScore = {
  score: null,
  max: SPEAKING_MAX.pronunciation,
  source: 'none',
  status: 'pending_review',
  comment: 'Pronunciation is assessed by your teacher (not from the transcript).',
};

/* ---------------- skill score of a session ---------------- */

export interface SkillResult {
  skill: Skill;
  score: number | null;
  status: SkillStatus;
  detail: string;
}

export function skillResult(skill: Skill, results: ItemResult[]): SkillResult {
  const rs = results.filter((r) => r.skill === skill);
  if (!rs.length) return { skill, score: null, status: 'not_assessed', detail: 'No items.' };
  if (skill === 'listening' || skill === 'reading') {
    const earned = rs.reduce((n, r) => n + (r as { earned: number }).earned, 0);
    const total = rs.reduce((n, r) => n + (r as { total: number }).total, 0);
    return { skill, score: total ? Math.round((earned / total) * 100) : null, status: 'assessed', detail: `${earned}/${total} correct` };
  }
  const scored = rs as Extract<ItemResult, { skill: 'writing' | 'speaking' }>[];
  const withScore = scored.filter((r) => r.score !== null);
  const weightOf = (r: (typeof scored)[number]) => (r.skill === 'writing' ? r.weight : 1);
  const totalW = withScore.reduce((n, r) => n + weightOf(r), 0);
  const score = totalW ? Math.round(withScore.reduce((n, r) => n + (r.score as number) * weightOf(r), 0) / totalW) : null;
  const statuses = scored.map((r) => r.status);
  const status: SkillStatus = statuses.every((s) => s === 'assessed')
    ? 'assessed'
    : statuses.some((s) => s === 'pending_review')
      ? 'pending_review'
      : score === null
        ? 'not_assessed'
        : 'partial';
  return { skill, score, status, detail: `${withScore.length}/${scored.length} task(s) scored` };
}

/** Reference overall score: average of the four skills, only when all four have a valid score. */
export function overallScore(skills: SkillResult[]): number | null {
  if (skills.length !== 4 || skills.some((s) => s.score === null || s.status === 'not_assessed')) return null;
  return Math.round(skills.reduce((n, s) => n + (s.score as number), 0) / 4);
}

export function convert(score: number | null, table: { min: number; max: number; label: string }[]): string | null {
  if (score === null || !table.length) return null;
  return table.find((r) => score >= r.min && score <= r.max)?.label ?? null;
}

/* ---------------- XP, streak, badges ---------------- */

export function dayKeyVN(d: Date): string {
  return new Date(d.getTime() + 7 * 3600 * 1000).toISOString().slice(0, 10);
}

export function nextStreak(prev: { days: number; lastDay: string | null }, now: Date) {
  const today = dayKeyVN(now);
  if (prev.lastDay === today) return prev;
  const yesterday = dayKeyVN(new Date(now.getTime() - 86400000));
  return { days: prev.lastDay === yesterday ? prev.days + 1 : 1, lastDay: today };
}

export function questXp(xpReward: number, passed: boolean, firstCompletion: boolean, streakDays: number): number {
  const base = passed ? xpReward : Math.round(xpReward * 0.3);
  return base + (passed && firstCompletion ? 50 : 0) + Math.min(50, (streakDays - 1) * 10 > 0 ? (streakDays - 1) * 10 : 0);
}

export const EXAM_XP = 250;

/** Player level from XP (game progression, not a CEFR level). */
export function playerLevel(xp: number): { level: number; nextAt: number } {
  let level = 1;
  let need = 200;
  let total = 0;
  while (xp >= total + need) {
    total += need;
    level++;
    need = Math.round(need * 1.25);
  }
  return { level, nextAt: total + need };
}

export const BADGES: Record<string, { en: string; vi: string }> = {
  listening_explorer: { en: 'Listening Explorer', vi: 'Nhà thám hiểm Nghe' },
  reading_master: { en: 'Reading Master', vi: 'Bậc thầy Đọc' },
  writing_challenger: { en: 'Writing Challenger', vi: 'Chiến binh Viết' },
  speaking_champion: { en: 'Speaking Champion', vi: 'Nhà vô địch Nói' },
  four_skill_explorer: { en: 'Four-Skill Explorer', vi: 'Khám phá 4 kỹ năng' },
  daily_learning_hero: { en: 'Daily Learning Hero', vi: 'Người hùng luyện tập mỗi ngày' },
  mock_exam_finisher: { en: 'Mock Exam Finisher', vi: 'Hoàn thành thi thử' },
  championship_podium: { en: 'Championship Podium', vi: 'Top 3 giải đấu' },
};

export function earnedBadges(
  quests: { id: string; skill: Skill }[],
  completed: string[],
  bestScores: Record<string, number>,
  streakDays: number,
  examsCompleted: number,
  existing: string[],
): string[] {
  const done = new Set(completed);
  const bySkill = (s: Skill) => quests.filter((q) => q.skill === s);
  const all = (s: Skill) => bySkill(s).length > 0 && bySkill(s).every((q) => done.has(q.id));
  const out = new Set<string>();
  if (all('listening')) out.add('listening_explorer');
  if (bySkill('reading').length && bySkill('reading').every((q) => (bestScores[q.id] ?? 0) >= 80)) out.add('reading_master');
  if (all('writing')) out.add('writing_challenger');
  if (all('speaking')) out.add('speaking_champion');
  if ((['listening', 'reading', 'writing', 'speaking'] as Skill[]).every((s) => bySkill(s).some((q) => done.has(q.id)))) out.add('four_skill_explorer');
  if (streakDays >= 5) out.add('daily_learning_hero');
  if (examsCompleted >= 1) out.add('mock_exam_finisher');
  return [...out].filter((b) => !existing.includes(b));
}

/* ---------------- four-skill learning profile ---------------- */

export interface ProfileEntry {
  skill: Skill;
  score: number;
  source: 'quest' | 'exam' | 'external';
  validated: boolean;
  at: string;
  ref: string;
}

/**
 * Per-skill profile from the latest results: up to 5 entries, exams weigh double, teacher-validated results
 * weigh 1.5×. A skill is "sufficient" with ≥1 exam result or ≥2 quest results.
 */
export function learningProfile(entries: ProfileEntry[]) {
  const skills = (['listening', 'reading', 'writing', 'speaking'] as Skill[]).map((skill) => {
    const es = entries.filter((e) => e.skill === skill).sort((a, b) => b.at.localeCompare(a.at)).slice(0, 5);
    const w = (e: ProfileEntry) => (e.source === 'exam' ? 2 : 1) * (e.validated ? 1.5 : 1);
    const totalW = es.reduce((n, e) => n + w(e), 0);
    const score = totalW ? Math.round(es.reduce((n, e) => n + e.score * w(e), 0) / totalW) : null;
    const sufficient = es.some((e) => e.source === 'exam') || es.filter((e) => e.source !== 'external').length >= 2;
    const trend = es.length >= 2 ? es[0]!.score - es[es.length - 1]!.score : null;
    return { skill, score, sufficient, entries: es.length, trend };
  });
  const overall = skills.every((s) => s.sufficient && s.score !== null) ? Math.round(skills.reduce((n, s) => n + (s.score as number), 0) / 4) : null;
  const weakest = skills.filter((s) => s.score !== null).sort((a, b) => (a.score as number) - (b.score as number))[0]?.skill ?? null;
  return { skills, overall, weakest };
}

export type { WritingItem, SpeakingItem };
