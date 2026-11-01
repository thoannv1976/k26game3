/**
 * VSTEP Quest content model: question-bank items (4 skills), quests, exam blueprints and mock exams.
 * Answers, rubrics and key points are server-only; students receive views from packages/game-engine/src/view.ts.
 */
import { z } from 'zod';
import { I18nTextSchema, LevelSchema } from './platform.js';

const Id = z.string().regex(/^[a-z0-9_]+$/, 'ids are lower_snake_case');
const ItemId = z.string().regex(/^[A-Z]{1,3}\d{0,2}_[a-z0-9_]+$/, 'item ids look like L01_gate or MX1_listen_p1');

export const SKILLS = ['listening', 'reading', 'writing', 'speaking'] as const;
export const SkillSchema = z.enum(SKILLS);
export type Skill = z.infer<typeof SkillSchema>;

export const ZONES = { listening: 'Listening Island', reading: 'Reading Castle', writing: 'Writing Academy', speaking: 'Speaking Arena' } as const;

/* ---------------- objective questions (listening & reading) ---------------- */

const QuestionBase = {
  id: Id,
  prompt: z.string().min(5).max(400),
  points: z.number().int().min(1).max(5).default(1),
  /** Why the answer is correct (shown after answering in Quest Mode; used by the AI Explainer). */
  explanation: z.string().min(10).max(800),
  /** Exact words from the passage/script that support the answer. */
  evidence: z.string().min(3).max(400),
};

export const ObjectiveQuestionSchema = z.discriminatedUnion('type', [
  z.object({ ...QuestionBase, type: z.literal('mcq'), options: z.array(z.string().min(1).max(200)).min(3).max(4), correctIndex: z.number().int().min(0) }),
  z.object({ ...QuestionBase, type: z.literal('tfng'), statement: z.string().min(5), answer: z.enum(['true', 'false', 'not_given']) }),
  z.object({ ...QuestionBase, type: z.literal('short'), acceptable: z.array(z.string().min(1)).min(1).max(8), maxWords: z.number().int().min(1).max(6) }),
]);
export type ObjectiveQuestion = z.infer<typeof ObjectiveQuestionSchema>;

/* ---------------- items ---------------- */

const ItemBase = {
  id: ItemId,
  level: LevelSchema,
  topic: z.string().min(3).max(80),
  /** Assessment objective, e.g. "identify specific information in announcements". */
  objective: z.string().min(5).max(300),
  difficulty: z.number().int().min(1).max(5),
  title: z.string().min(3).max(120),
  instructions: I18nTextSchema,
};

export const VoiceSchema = z.object({ languageCode: z.enum(['en-US', 'en-GB', 'en-AU']), name: z.string().min(3) });

export const ListeningItemSchema = z.object({
  ...ItemBase,
  skill: z.literal('listening'),
  script: z.object({
    context: z.string().min(5).max(300),
    speakers: z.array(z.object({ id: Id, name: z.string().min(1).max(60), voice: VoiceSchema })).min(1).max(4),
    lines: z.array(z.object({ speaker: Id, text: z.string().min(2).max(1200) })).min(1).max(40),
  }),
  /** How many times the audio may be played. */
  plays: z.object({ quest: z.number().int().min(1).max(5), exam: z.number().int().min(1).max(2) }),
  questions: z.array(ObjectiveQuestionSchema).min(1).max(10),
});

export const ReadingItemSchema = z.object({
  ...ItemBase,
  skill: z.literal('reading'),
  passage: z.object({
    type: z.enum(['email', 'notice', 'article', 'academic', 'advertisement', 'letter', 'blog']),
    title: z.string().min(3).max(160),
    meta: z.record(z.string(), z.string()).default({}),
    body: z.string().min(100).max(6000),
  }),
  questions: z.array(ObjectiveQuestionSchema).min(2).max(12),
});

export const WRITING_CRITERIA = ['taskFulfillment', 'organization', 'vocabulary', 'grammar'] as const;
export const WritingItemSchema = z.object({
  ...ItemBase,
  skill: z.literal('writing'),
  task: z.object({
    type: z.enum(['email', 'letter', 'report', 'essay']),
    /** Input text to respond to (e.g. the email received). */
    input: z.string().max(2000).default(''),
    prompt: z.string().min(20).max(1200),
    minWords: z.number().int().min(60).max(350),
    maxWords: z.number().int().min(100).max(450),
    timeMinutes: z.number().int().min(10).max(60),
  }),
  /** Ideas a strong answer covers (grader only). */
  keyPoints: z.array(z.string().min(5)).min(2).max(8),
  /** Weight of this task inside a writing section (VSTEP: task 2 counts double). */
  weight: z.number().min(1).max(3).default(1),
  sampleAnswer: z.string().min(80),
});

export const SPEAKING_CRITERIA = ['taskFulfillment', 'fluency', 'vocabulary', 'grammar', 'pronunciation'] as const;
export const SpeakingItemSchema = z.object({
  ...ItemBase,
  skill: z.literal('speaking'),
  parts: z
    .array(
      z.object({
        id: Id,
        type: z.enum(['social', 'solution', 'topic']),
        prompt: z.string().min(10).max(1200),
        /** Options to choose from (solution discussion). */
        options: z.array(z.string().min(3).max(200)).max(4).default([]),
        prepSeconds: z.number().int().min(0).max(120),
        speakSeconds: z.number().int().min(20).max(240),
        followUps: z.array(z.string().min(5).max(300)).max(4).default([]),
        keyPoints: z.array(z.string().min(5)).min(1).max(6),
      }),
    )
    .min(1)
    .max(3),
  sampleAnswer: z.string().min(50),
});

export const ItemSchema = z.discriminatedUnion('skill', [ListeningItemSchema, ReadingItemSchema, WritingItemSchema, SpeakingItemSchema]);
export type Item = z.infer<typeof ItemSchema>;
export type ListeningItem = z.infer<typeof ListeningItemSchema>;
export type ReadingItem = z.infer<typeof ReadingItemSchema>;
export type WritingItem = z.infer<typeof WritingItemSchema>;
export type SpeakingItem = z.infer<typeof SpeakingItemSchema>;

/* ---------------- quests ---------------- */

export const QuestSchema = z.object({
  id: z.string().regex(/^[LRWS]\d{2}$/),
  skill: SkillSchema,
  level: LevelSchema,
  title: I18nTextSchema,
  summary: I18nTextSchema,
  story: I18nTextSchema,
  objectives: z.array(I18nTextSchema).min(1).max(5),
  estimatedMinutes: z.number().int().min(5).max(90),
  xpReward: z.number().int().min(20).max(500),
  /** Quests that must be completed first (same tenant). */
  requires: z.array(z.string().regex(/^[LRWS]\d{2}$/)).default([]),
  /** Challenges in order of increasing difficulty; each uses one item. */
  challenges: z.array(z.object({ id: Id, title: z.string().min(3).max(120), itemId: ItemId })).min(1).max(6),
  /** Minimum skill score (0–100) to count the quest as completed. */
  passPercent: z.number().int().min(0).max(100).default(50),
  maxAttemptsPerDay: z.number().int().min(1).max(20).default(5),
});
export type Quest = z.infer<typeof QuestSchema>;

/* ---------------- exam blueprint & mock exam ---------------- */

export const ExamBlueprintSchema = z.object({
  id: Id,
  name: z.string().min(3).max(160),
  description: z.string().min(10).max(1500),
  sections: z
    .array(
      z.object({
        skill: SkillSchema,
        timeMinutes: z.number().int().min(5).max(90),
        parts: z.array(z.object({ id: Id, title: z.string().min(3), itemCount: z.number().int().min(1).max(6), questionCount: z.number().int().min(0).max(40).default(0) })).min(1).max(5),
      }),
    )
    .length(4),
  /** Optional school-approved conversion from skill score (0–100) to a reference band. Empty = show 0–100 only. */
  conversion: z.array(z.object({ min: z.number().min(0).max(100), max: z.number().min(0).max(100), label: z.string().min(1).max(40) })).default([]),
  approvedBy: z.string().max(200).default(''),
});
export type ExamBlueprint = z.infer<typeof ExamBlueprintSchema>;

export const MockExamSchema = z.object({
  id: Id,
  blueprintId: Id,
  title: I18nTextSchema,
  level: z.enum(['B1', 'B2', 'B1-B2']),
  sections: z.array(z.object({ skill: SkillSchema, timeMinutes: z.number().int().min(5).max(90), itemIds: z.array(ItemId).min(1).max(6) })).length(4),
  disclaimer: I18nTextSchema,
});
export type MockExam = z.infer<typeof MockExamSchema>;

/* ---------------- Firestore metadata ---------------- */

export const CONTENT_STATUSES = ['draft', 'approved', 'archived'] as const;
export type ContentStatus = (typeof CONTENT_STATUSES)[number];
export type ContentKind = 'item' | 'quest' | 'exam';

/** tenants/{t}/{question_bank|quests|mock_exams}/{id} */
export interface ContentDoc {
  id: string;
  kind: ContentKind;
  skill: Skill | null;
  level: string;
  title: string;
  approvedVersion: number;
  latestVersion: number;
  status: ContentStatus;
  source: 'builtin' | 'teacher' | 'ai_generated';
  updatedAt: string;
}

/** .../{id}/versions/{n} */
export interface ContentVersionDoc<T = unknown> {
  version: number;
  content: T;
  status: 'draft' | 'approved' | 'superseded';
  source: 'builtin' | 'teacher' | 'ai_generated';
  createdBy: string;
  createdAt: string;
  approvedBy: string | null;
  approvedAt: string | null;
  note: string;
  /** Listening only: audio segments rendered for this version. */
  audio?: { rendered: boolean; segments: { index: number; path: string; seconds: number }[] } | null;
}
