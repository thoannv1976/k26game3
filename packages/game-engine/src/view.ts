/**
 * Student-safe views. Never include answers, acceptable answers, evidence, key points or sample answers unless the
 * rules allow revealing them (Quest Mode after answering; exams only when the teacher releases answers).
 */
import type { Item, Quest } from '@vq/shared';
import { answerKey, takeKey, type AttemptMode, type AttemptState } from './attempt.js';

export interface RevealPolicy {
  mode: AttemptMode;
  /** Exam answers released by the teacher (after grading). */
  examAnswersReleased?: boolean;
  /** The attempt has been submitted. */
  submitted?: boolean;
}

/** Whether the correct answer/explanation of an answered question may be shown. */
export function canReveal(p: RevealPolicy, answered: boolean): boolean {
  if (p.mode === 'exam') return Boolean(p.examAnswersReleased && p.submitted);
  return answered;
}

export function itemView(item: Item, s: AttemptState, p: RevealPolicy) {
  const base = { id: item.id, skill: item.skill, level: item.level, title: item.title, topic: item.topic, instructions: item.instructions };
  const questions = (qs: Extract<Item, { skill: 'listening' | 'reading' }>['questions']) =>
    qs.map((q) => {
      const a = s.answers[answerKey(item.id, q.id)];
      const reveal = canReveal(p, Boolean(a));
      return {
        id: q.id,
        type: q.type,
        prompt: q.prompt,
        points: q.points,
        ...(q.type === 'mcq' ? { options: q.options } : q.type === 'tfng' ? { statement: q.statement } : { maxWords: q.maxWords }),
        answer: a ? { value: a.value, ...(p.mode === 'exam' && !reveal ? {} : { correct: a.correct }) } : null,
        reveal: reveal
          ? {
              correct: q.type === 'mcq' ? q.options[q.correctIndex] : q.type === 'tfng' ? q.answer : q.acceptable[0],
              explanation: q.explanation,
              evidence: q.evidence,
            }
          : null,
      };
    });
  switch (item.skill) {
    case 'listening': {
      const limit = p.mode === 'exam' ? item.plays.exam : item.plays.quest;
      const allAnswered = item.questions.every((q) => s.answers[answerKey(item.id, q.id)]);
      return {
        ...base,
        context: item.script.context,
        playsLeft: Math.max(0, limit - (s.plays[item.id] ?? 0)),
        playsMax: limit,
        // Transcript only after all questions are answered in Quest Mode (or released exams).
        transcript: canReveal(p, allAnswered) ? item.script.lines.map((l) => ({ speaker: item.script.speakers.find((x) => x.id === l.speaker)?.name ?? l.speaker, text: l.text })) : null,
        questions: questions(item.questions),
      };
    }
    case 'reading':
      return { ...base, passage: item.passage, questions: questions(item.questions) };
    case 'writing':
      return {
        ...base,
        task: { type: item.task.type, input: item.task.input, prompt: item.task.prompt, minWords: item.task.minWords, maxWords: item.task.maxWords, timeMinutes: item.task.timeMinutes },
        saved: s.writing[item.id] ?? null,
      };
    case 'speaking':
      return {
        ...base,
        parts: item.parts.map((pt) => {
          const t = s.speaking[takeKey(item.id, pt.id)];
          return {
            id: pt.id,
            type: pt.type,
            prompt: pt.prompt,
            options: pt.options,
            prepSeconds: pt.prepSeconds,
            speakSeconds: pt.speakSeconds,
            followUps: pt.followUps,
            take: t ? { status: t.status, transcript: t.transcript, durationSeconds: t.durationSeconds, at: t.at } : null,
          };
        }),
      };
  }
}
export type ItemView = ReturnType<typeof itemView>;

export function questSummary(q: Quest) {
  return {
    id: q.id,
    skill: q.skill,
    level: q.level,
    title: q.title,
    summary: q.summary,
    story: q.story,
    objectives: q.objectives,
    estimatedMinutes: q.estimatedMinutes,
    xpReward: q.xpReward,
    requires: q.requires,
    challenges: q.challenges.map((c) => ({ id: c.id, title: c.title })),
    passPercent: q.passPercent,
  };
}
