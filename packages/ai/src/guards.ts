import { normalizeText } from '@vq/game-engine/text';
import type { ExplainOutput, SpeakingGrade, WritingGrade } from './types.js';
import { isInappropriate } from './moderation.js';

const inText = (text: string, q: string) => q.trim().length >= 2 && normalizeText(text).includes(normalizeText(q));
const clamp = (v: number, max: number) => Math.max(0, Math.min(max, Math.round(v * 2) / 2));

/** Keeps only examples/corrections quoted from the student's text; clamps scores to the rubric maxima. */
export function verifyWriting(text: string, g: WritingGrade): { grade: WritingGrade; removed: number } {
  const examples = g.examples.filter((e) => inText(text, e.quote));
  const corrections = g.corrections.filter((c) => inText(text, c.original) && normalizeText(c.original) !== normalizeText(c.corrected));
  return {
    removed: g.examples.length - examples.length + g.corrections.length - corrections.length,
    grade: {
      ...g,
      examples,
      corrections,
      taskFulfillment: { ...g.taskFulfillment, score: clamp(g.taskFulfillment.score, 25) },
      organization: { ...g.organization, score: clamp(g.organization.score, 25) },
      vocabulary: { ...g.vocabulary, score: clamp(g.vocabulary.score, 25) },
      grammar: { ...g.grammar, score: clamp(g.grammar.score, 25) },
    },
  };
}

export function verifySpeaking(transcripts: string, g: SpeakingGrade): { grade: SpeakingGrade; removed: number } {
  const examples = g.examples.filter((e) => inText(transcripts, e.quote));
  const corrections = g.corrections.filter((c) => inText(transcripts, c.original) && normalizeText(c.original) !== normalizeText(c.corrected));
  return {
    removed: g.examples.length - examples.length + g.corrections.length - corrections.length,
    grade: {
      ...g,
      examples,
      corrections,
      taskFulfillment: { ...g.taskFulfillment, score: clamp(g.taskFulfillment.score, 25) },
      vocabulary: { ...g.vocabulary, score: clamp(g.vocabulary.score, 20) },
      grammar: { ...g.grammar, score: clamp(g.grammar.score, 20) },
    },
  };
}

/** Explanation quote must come from the source text; otherwise fall back to the approved evidence. */
export function verifyExplanation(source: string, evidence: string, e: ExplainOutput): ExplainOutput {
  return { ...e, quote: e.quote && inText(source, e.quote) ? e.quote : evidence };
}

/**
 * Coach replies must not contain answers to questions the student has not answered yet
 * (answers of items in their open attempts). Returns a reason when blocked.
 */
export function guardCoach(answer: string, protectedAnswers: string[]): string | null {
  if (isInappropriate(answer)) return 'inappropriate';
  const n = ` ${normalizeText(answer)} `;
  for (const a of protectedAnswers) {
    const p = normalizeText(a);
    if (p.length >= 4 && n.includes(` ${p} `)) return 'answer_leak';
  }
  return null;
}
