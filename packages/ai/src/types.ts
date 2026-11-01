import { z } from 'zod';
import type { Item, Level, ObjectiveQuestion, Skill, SpeakingItem, WritingItem } from '@vq/shared';

export interface Usage {
  inputTokens: number;
  outputTokens: number;
}

/* ---------------- Listening & Reading Explainer (Quest Mode, after answering) ---------------- */

export interface ExplainInput {
  item: Item;
  sourceText: string;
  question: ObjectiveQuestion;
  correctAnswer: string;
  studentAnswer: string;
  isCorrect: boolean;
  model: string;
  maxOutputTokens: number;
}
export const ExplainOutputSchema = z.object({
  explanation: z.string().min(1).max(1200),
  whyStudentAnswer: z.string().max(800).default(''),
  /** Exact words from the passage/script supporting the answer (verified by the server). */
  quote: z.string().max(400).default(''),
  vocabulary: z.array(z.object({ term: z.string().max(80), meaning: z.string().max(200) })).max(6).default([]),
  tip: z.string().max(400).default(''),
});
export type ExplainOutput = z.infer<typeof ExplainOutputSchema>;

/* ---------------- Writing grader ---------------- */

export interface WritingGradeInput {
  item: WritingItem;
  text: string;
  wordCount: number;
  model: string;
  maxOutputTokens: number;
}
const Scored = z.object({ score: z.number().min(0), comment: z.string().max(800) });
const Feedback = {
  examples: z.array(z.object({ quote: z.string().max(400), comment: z.string().max(400) })).max(8).default([]),
  corrections: z.array(z.object({ original: z.string().max(400), corrected: z.string().max(400), explanation: z.string().max(400) })).max(10).default([]),
  strengths: z.array(z.string().max(300)).max(6).default([]),
  improvements: z.array(z.string().max(300)).max(6).default([]),
  nextPractice: z.array(z.string().max(300)).max(5).default([]),
};
export const WritingGradeSchema = z.object({
  taskFulfillment: Scored,
  organization: Scored,
  vocabulary: Scored,
  grammar: Scored,
  ...Feedback,
});
export type WritingGrade = z.infer<typeof WritingGradeSchema>;

/* ---------------- Speaking grader (from transcripts) ---------------- */

export interface SpeakingGradeInput {
  item: SpeakingItem;
  parts: { partId: string; prompt: string; keyPoints: string[]; transcript: string; durationSeconds: number }[];
  model: string;
  maxOutputTokens: number;
}
export const SpeakingGradeSchema = z.object({
  taskFulfillment: Scored,
  vocabulary: Scored,
  grammar: Scored,
  ...Feedback,
});
export type SpeakingGrade = z.infer<typeof SpeakingGradeSchema>;

/* ---------------- Learning Coach (Quest Mode only) ---------------- */

export interface CoachInput {
  level: Level;
  profile: { skill: Skill; score: number | null }[];
  recentMistakes: { skill: Skill; topic: string; prompt: string }[];
  history: { question: string; answer: string }[];
  question: string;
  model: string;
  maxOutputTokens: number;
}
export const COACH_KINDS = ['explanation', 'strategy', 'vocabulary', 'plan', 'refused'] as const;
export const CoachOutputSchema = z.object({ answer: z.string().min(1).max(1500), kind: z.enum(COACH_KINDS), suggestedQuestIds: z.array(z.string()).max(3).default([]) });
export type CoachOutput = z.infer<typeof CoachOutputSchema>;

/* ---------------- Learning analytics narrative ---------------- */

export interface AnalyticsInput {
  audience: 'student' | 'teacher';
  stats: unknown;
  model: string;
  maxOutputTokens: number;
}
export const AnalyticsOutputSchema = z.object({
  summary: z.string().min(1).max(1500),
  strengths: z.array(z.string().max(300)).max(5).default([]),
  focusAreas: z.array(z.string().max(300)).max(5).default([]),
  plan: z.array(z.string().max(300)).max(7).default([]),
});
export type AnalyticsOutput = z.infer<typeof AnalyticsOutputSchema>;

/* ---------------- Question generator ---------------- */

export const ItemRequestSchema = z.object({
  id: z.string().regex(/^[A-Z]{1,3}\d{0,2}_[a-z0-9_]+$/),
  skill: z.enum(['listening', 'reading', 'writing', 'speaking']),
  level: z.enum(['B1', 'B2']),
  topic: z.string().trim().min(3).max(80),
  objective: z.string().trim().min(5).max(300),
  difficulty: z.number().int().min(1).max(5),
  questionCount: z.number().int().min(0).max(10).default(5),
  notes: z.string().max(800).default(''),
});
export type ItemRequest = z.infer<typeof ItemRequestSchema>;

export interface AiProvider {
  readonly name: string;
  explain(input: ExplainInput): Promise<{ output: ExplainOutput; usage: Usage }>;
  gradeWriting(input: WritingGradeInput): Promise<{ output: WritingGrade; usage: Usage }>;
  gradeSpeaking(input: SpeakingGradeInput): Promise<{ output: SpeakingGrade; usage: Usage }>;
  coach(input: CoachInput): Promise<{ output: CoachOutput; usage: Usage }>;
  analytics(input: AnalyticsInput): Promise<{ output: AnalyticsOutput; usage: Usage }>;
  /** Raw JSON draft item (validated by the caller with checkItem). */
  generateItem(request: ItemRequest, example: Item, model: string, feedback?: string[]): Promise<{ output: unknown; usage: Usage }>;
  ping(model: string): Promise<string>;
}
