/**
 * Attempt state (quest, mock exam, championship) and server-side timing rules.
 * Exam sections run in the fixed VSTEP order listening → reading → writing → speaking; each section has its own
 * server deadline. Answers outside the current section or after its deadline are refused.
 */
import type { Item, Skill } from '@vq/shared';
import { checkAnswer, questionsOf, validAnswerValue } from './scoring.js';
import { wordCount } from './text.js';

export type AttemptMode = 'quest' | 'exam' | 'championship';

export interface AnswerRecord {
  value: number | string;
  correct: boolean;
  points: number;
  at: string;
}

export interface SectionClock {
  skill: Skill;
  timeMinutes: number;
  startedAt: string | null;
  deadline: string | null;
  closedAt: string | null;
}

export interface SpeakingTake {
  status: 'transcribed' | 'unclear';
  audioPath: string | null;
  transcript: string;
  confidence: number;
  durationSeconds: number;
  metrics: { words: number; speechSeconds: number; longPauses: number };
  at: string;
}

export interface AttemptState {
  answers: Record<string, AnswerRecord>; // key `${itemId}:${questionId}`
  plays: Record<string, number>; // itemId → plays used
  writing: Record<string, { wordCount: number; version: number; updatedAt: string }>; // text lives in drafts
  speaking: Record<string, SpeakingTake>; // key `${itemId}:${partId}`
  sections: SectionClock[]; // exam only
  currentSection: number; // exam only
  explained: string[]; // answer keys explained by AI (quest mode)
}

export class AttemptError extends Error {
  constructor(
    readonly code: 'LOCKED' | 'TIME_UP' | 'PLAY_LIMIT' | 'VALIDATION' | 'NOT_FOUND' | 'CONFLICT',
    message: string,
  ) {
    super(message);
  }
}

export function newAttempt(sections: { skill: Skill; timeMinutes: number }[] = []): AttemptState {
  return {
    answers: {},
    plays: {},
    writing: {},
    speaking: {},
    sections: sections.map((s) => ({ ...s, startedAt: null, deadline: null, closedAt: null })),
    currentSection: 0,
    explained: [],
  };
}

export const answerKey = (itemId: string, questionId: string) => `${itemId}:${questionId}`;
export const takeKey = (itemId: string, partId: string) => `${itemId}:${partId}`;

/* ---------------- exam clock ---------------- */

export function sectionOpen(s: AttemptState, skill: Skill, now: Date): boolean {
  if (!s.sections.length) return true; // quest mode: no clock
  const idx = s.sections.findIndex((x) => x.skill === skill);
  const sec = s.sections[idx];
  if (!sec || idx !== s.currentSection || !sec.startedAt || sec.closedAt) return false;
  return now.getTime() <= new Date(sec.deadline!).getTime() + 2000; // 2 s grace for network latency
}

export function startSection(s: AttemptState, now: Date): AttemptState {
  const sec = s.sections[s.currentSection];
  if (!sec) throw new AttemptError('LOCKED', 'The exam is finished');
  if (sec.startedAt) return s;
  const sections = s.sections.map((x, i) =>
    i === s.currentSection ? { ...x, startedAt: now.toISOString(), deadline: new Date(now.getTime() + x.timeMinutes * 60000).toISOString() } : x,
  );
  return { ...s, sections };
}

/** Closes the current section (student moves on or time is up) and opens the next one (not started yet). */
export function closeSection(s: AttemptState, now: Date): AttemptState {
  const sec = s.sections[s.currentSection];
  if (!sec) return s;
  const sections = s.sections.map((x, i) => (i === s.currentSection ? { ...x, startedAt: x.startedAt ?? now.toISOString(), closedAt: now.toISOString() } : x));
  return { ...s, sections, currentSection: s.currentSection + 1 };
}

/** Applies timeouts: closes every section whose deadline has passed. Returns whether the whole exam is over. */
export function applyClock(s: AttemptState, now: Date): { state: AttemptState; finished: boolean; changed: boolean } {
  let state = s;
  let changed = false;
  while (state.currentSection < state.sections.length) {
    const sec = state.sections[state.currentSection]!;
    if (sec.startedAt && !sec.closedAt && now.getTime() > new Date(sec.deadline!).getTime() + 2000) {
      state = closeSection(state, new Date(sec.deadline!));
      changed = true;
    } else break;
  }
  return { state, finished: state.sections.length > 0 && state.currentSection >= state.sections.length, changed };
}

export function secondsLeft(s: AttemptState, now: Date): number | null {
  const sec = s.sections[s.currentSection];
  if (!sec?.deadline) return null;
  return Math.max(0, Math.round((new Date(sec.deadline).getTime() - now.getTime()) / 1000));
}

/* ---------------- actions ---------------- */

export function recordAnswer(s: AttemptState, item: Item, questionId: string, value: unknown, mode: AttemptMode, now: Date): { state: AttemptState; record: AnswerRecord } {
  if (!sectionOpen(s, item.skill, now)) throw new AttemptError(s.sections.length ? 'TIME_UP' : 'LOCKED', 'This section is closed');
  const q = questionsOf(item).find((x) => x.id === questionId);
  if (!q) throw new AttemptError('NOT_FOUND', 'Unknown question');
  if (!validAnswerValue(q, value)) throw new AttemptError('VALIDATION', 'Invalid answer');
  const key = answerKey(item.id, q.id);
  // Quest mode: one attempt per question (the explanation is shown right after). Exam: may change until the section closes.
  if (mode !== 'exam' && s.answers[key]) throw new AttemptError('CONFLICT', 'Already answered');
  const v = typeof value === 'string' ? value.trim() : (value as number);
  const correct = checkAnswer(q, v);
  const record: AnswerRecord = { value: v, correct, points: correct ? q.points : 0, at: now.toISOString() };
  return { state: { ...s, answers: { ...s.answers, [key]: record } }, record };
}

export function recordPlay(s: AttemptState, item: Item, mode: AttemptMode, now: Date): { state: AttemptState; playsLeft: number } {
  if (item.skill !== 'listening') throw new AttemptError('VALIDATION', 'Not a listening item');
  if (!sectionOpen(s, 'listening', now)) throw new AttemptError(s.sections.length ? 'TIME_UP' : 'LOCKED', 'This section is closed');
  const limit = mode === 'exam' ? item.plays.exam : item.plays.quest;
  const used = s.plays[item.id] ?? 0;
  if (used >= limit) throw new AttemptError('PLAY_LIMIT', 'No plays left for this recording');
  return { state: { ...s, plays: { ...s.plays, [item.id]: used + 1 } }, playsLeft: limit - used - 1 };
}

export function recordWriting(s: AttemptState, item: Item, text: string, version: number, now: Date): AttemptState {
  if (item.skill !== 'writing') throw new AttemptError('VALIDATION', 'Not a writing item');
  if (!sectionOpen(s, 'writing', now)) throw new AttemptError(s.sections.length ? 'TIME_UP' : 'LOCKED', 'This section is closed');
  return { ...s, writing: { ...s.writing, [item.id]: { wordCount: wordCount(text), version, updatedAt: now.toISOString() } } };
}

export function recordTake(s: AttemptState, item: Item, partId: string, take: SpeakingTake, now: Date): AttemptState {
  if (item.skill !== 'speaking') throw new AttemptError('VALIDATION', 'Not a speaking item');
  if (!item.parts.some((p) => p.id === partId)) throw new AttemptError('NOT_FOUND', 'Unknown speaking part');
  if (!sectionOpen(s, 'speaking', now)) throw new AttemptError(s.sections.length ? 'TIME_UP' : 'LOCKED', 'This section is closed');
  return { ...s, speaking: { ...s.speaking, [takeKey(item.id, partId)]: take } };
}

/** What still blocks a quest submission (exams can always be submitted). */
export function questBlockers(items: Item[], s: AttemptState): string[] {
  const out: string[] = [];
  for (const item of items) {
    const unanswered = questionsOf(item).filter((q) => !s.answers[answerKey(item.id, q.id)]).length;
    if (unanswered) out.push(`${item.title}: ${unanswered} question(s) not answered.`);
    if (item.skill === 'writing') {
      const w = s.writing[item.id];
      if (!w || w.wordCount < Math.ceil(item.task.minWords * 0.5)) out.push(`${item.title}: write at least ${Math.ceil(item.task.minWords * 0.5)} words (target ${item.task.minWords}–${item.task.maxWords}).`);
    }
    if (item.skill === 'speaking') {
      const missing = item.parts.filter((p) => s.speaking[takeKey(item.id, p.id)]?.status !== 'transcribed').length;
      if (missing) out.push(`${item.title}: record ${missing} more speaking part(s).`);
    }
  }
  return out;
}
