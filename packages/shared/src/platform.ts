/**
 * Platform types shared with the other K26 games (English City Simulator, English Detective): schools (tenants),
 * users, roles, courses, AI configuration and cost quotas. Accounts are shared through Firebase Auth custom claims
 * {tenantId, role}; each game keeps its own Firestore database (VSTEP Quest: "vstep").
 */
import { z } from 'zod';

export const LEVELS = ['B1', 'B2'] as const;
export const LevelSchema = z.enum(LEVELS);
export type Level = z.infer<typeof LevelSchema>;

export const ROLES = ['student', 'teacher', 'school_admin', 'platform_admin'] as const;
export const RoleSchema = z.enum(ROLES);
export type Role = z.infer<typeof RoleSchema>;

export const I18nTextSchema = z.object({ en: z.string().min(1), vi: z.string().min(1) });
export type I18nText = z.infer<typeof I18nTextSchema>;

/* ---------------- quotas & AI configuration ---------------- */

export const QuotaConfigSchema = z.object({
  aiCallsPerStudentPerDay: z.number().int().min(0).max(5000),
  attemptsPerQuestPerDay: z.number().int().min(1).max(50),
  mockExamsPerStudentPerMonth: z.number().int().min(0).max(50),
  explanationsPerStudentPerDay: z.number().int().min(0).max(500),
  coachMessagesPerStudentPerDay: z.number().int().min(0).max(500),
  aiGradingsPerSubmission: z.number().int().min(1).max(5),
  maxRecordSeconds: z.number().int().min(20).max(300),
  maxOutputTokens: z.number().int().min(256).max(8192),
  monthlyBudgetUsd: z.number().min(0).max(100000),
  warnRatio: z.number().min(0.1).max(1),
  onBudgetExceeded: z.enum(['block', 'warn_only']),
});
export type QuotaConfig = z.infer<typeof QuotaConfigSchema>;
export const DEFAULT_QUOTAS: QuotaConfig = {
  aiCallsPerStudentPerDay: 120,
  attemptsPerQuestPerDay: 5,
  mockExamsPerStudentPerMonth: 4,
  explanationsPerStudentPerDay: 60,
  coachMessagesPerStudentPerDay: 30,
  aiGradingsPerSubmission: 2,
  maxRecordSeconds: 180,
  maxOutputTokens: 2048,
  monthlyBudgetUsd: 150,
  warnRatio: 0.8,
  onBudgetExceeded: 'block',
};

export const PricingSchema = z.object({
  inputTokensPer1M: z.number().min(0),
  outputTokensPer1M: z.number().min(0),
  sttPerMinute: z.number().min(0),
  ttsPer1MChars: z.number().min(0),
});
export type Pricing = z.infer<typeof PricingSchema>;

export const AiConfigSchema = z.object({
  model: z.string().min(3),
  assessmentModel: z.string().min(3),
  temperature: z.number().min(0).max(1.5),
  /** Keep student speaking recordings this many days (0 = delete right after grading). */
  audioRetentionDays: z.number().int().min(0).max(365),
  pricing: PricingSchema,
});
export type AiConfig = z.infer<typeof AiConfigSchema>;
export const DEFAULT_AI_CONFIG: AiConfig = {
  // Verified on project k26game1 (gemini-2.5-flash returned 404 there).
  model: 'gemini-3-flash-preview',
  assessmentModel: 'gemini-3-flash-preview',
  temperature: 0.4,
  audioRetentionDays: 60,
  pricing: { inputTokensPer1M: 0.5, outputTokensPer1M: 3, sttPerMinute: 0.016, ttsPer1MChars: 16 },
};

/* ---------------- tenants, users, courses ---------------- */

export interface TenantDoc {
  id: string;
  name: string;
  allowedEmailDomains: string[];
  quotas: QuotaConfig;
  aiConfig: AiConfig;
  active: boolean;
  createdAt: string;
}

export const AVATAR_IDS = ['explorer', 'scholar', 'captain', 'inventor', 'artist', 'ranger', 'pilot', 'chef'] as const;
export const OUTFIT_IDS = ['classic', 'scarf', 'cape', 'graduate', 'champion', 'astronaut'] as const;

export interface UserDoc {
  uid: string;
  tenantId: string;
  role: Role;
  email: string;
  displayName: string;
  studentCode?: string;
  courseIds: string[];
  /** CEFR target level chosen by the student (B1/B2). */
  level: Level;
  avatar: { id: (typeof AVATAR_IDS)[number]; outfit: (typeof OUTFIT_IDS)[number] } | null;
  /** Game points – never used as an English score. */
  xp: number;
  badges: string[];
  streak: { days: number; lastDay: string | null };
  completedQuestIds: string[];
  /** Best skill score (0–100) per quest. */
  bestScores: Record<string, number>;
  recordingConsentAt: string | null;
  locale: 'vi' | 'en';
  disabled: boolean;
  createdAt: string;
}

export interface CourseDoc {
  id: string;
  tenantId: string;
  code: string;
  name: string;
  teacherIds: string[];
  studentIds: string[];
  monthlyBudgetUsd: number | null;
  createdAt: string;
}

/** A quest or mock exam assigned to a class (optionally as an ordered learning path). */
export interface AssignmentDoc {
  id: string;
  courseId: string;
  kind: 'quest' | 'exam';
  refId: string;
  dueAt: string | null;
  note: string;
  order: number;
  createdBy: string;
  createdAt: string;
}

export const ApiErrorCodes = [
  'UNAUTHENTICATED',
  'FORBIDDEN',
  'NOT_PROVISIONED',
  'NOT_FOUND',
  'VALIDATION',
  'CONFLICT',
  'REQUEST_IN_PROGRESS',
  'SESSION_NOT_ACTIVE',
  'LOCKED',
  'TIME_UP',
  'PLAY_LIMIT',
  'NOT_READY_TO_SUBMIT',
  'DRAFT_CONFLICT',
  'HELP_DISABLED',
  'EXPLANATION_LIMIT',
  'COACH_LIMIT',
  'GRADING_LIMIT',
  'QUOTA_EXCEEDED',
  'BUDGET_EXCEEDED',
  'ATTEMPT_LIMIT',
  'CONSENT_REQUIRED',
  'AUDIO_UNCLEAR',
  'AUDIO_TOO_LONG',
  'CHAMPIONSHIP_CLOSED',
  'CONTENT_BLOCKED',
  'INTERNAL',
] as const;
export type ApiErrorCode = (typeof ApiErrorCodes)[number];
