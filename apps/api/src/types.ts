import type { AttemptMode, AttemptState, ItemResult, SkillResult } from '@vq/game-engine';
import type { Level, Skill } from '@vq/shared';

export const ATTEMPT_STATUSES = ['active', 'submitted', 'grading', 'graded', 'abandoned'] as const;
export type AttemptStatus = (typeof ATTEMPT_STATUSES)[number];

/** tenants/{t}/game_sessions/{id} – one quest, mock exam or championship attempt. */
export interface AttemptDoc {
  id: string;
  tenantId: string;
  uid: string;
  mode: AttemptMode;
  /** Quest id (quest/championship) or mock exam id. */
  refId: string;
  championshipId: string | null;
  courseId: string | null;
  assignmentId: string | null;
  level: Level | 'B1-B2';
  title: string;
  /** Content versions frozen at start. */
  versions: { ref: number; items: Record<string, number> };
  itemIds: string[];
  status: AttemptStatus;
  state: AttemptState;
  startedAt: string;
  lastActivityAt: string;
  submittedAt: string | null;
  gradedAt: string | null;
  lockId: string | null;
  lockSince: string | null;
  gradingAttempts: number;
  /** Exams: answers and explanations visible to the student only after the teacher releases them. */
  answersReleased: boolean;
}

export interface WritingDoc {
  itemId: string;
  text: string;
  version: number;
  wordCount: number;
  updatedAt: string;
}

export interface ItemFeedback {
  strengths: string[];
  improvements: string[];
  examples: { quote: string; comment: string }[];
  corrections: { original: string; corrected: string; explanation: string }[];
  nextPractice: string[];
}

export interface TeacherReview {
  reviewerUid: string;
  reviewerName: string;
  /** itemId → criterion → score */
  scores: Record<string, Record<string, number>>;
  comment: string;
  status: 'confirmed' | 'adjusted';
  reviewedAt: string;
}

/** tenants/{t}/assessments/{attemptId} */
export interface AssessmentDoc {
  id: string;
  tenantId: string;
  uid: string;
  mode: AttemptMode;
  refId: string;
  title: string;
  level: Level | 'B1-B2';
  championshipId: string | null;
  courseId: string | null;
  items: ItemResult[];
  feedback: Record<string, ItemFeedback>;
  skills: SkillResult[];
  overall: number | null;
  conversionLabel: string | null;
  /** AI writing/speaking parts. */
  aiStatus: 'ok' | 'partial' | 'failed' | 'skipped' | 'not_needed';
  /** Writing/speaking criteria still need a teacher (e.g. pronunciation, or AI unavailable). */
  pendingReview: boolean;
  passed: boolean;
  xpAwarded: number;
  newBadges: string[];
  versions: { rubric: string; prompt: string; model: string; content: { ref: number; items: Record<string, number> } };
  qualityChecks: { removedUnverifiableQuotes: number };
  teacherReview: TeacherReview | null;
  disclaimer: string;
  createdAt: string;
}

/** tenants/{t}/championships/{id} */
export interface ChampionshipDoc {
  id: string;
  name: string;
  description: string;
  type: 'individual' | 'team' | 'class';
  courseIds: string[];
  questIds: string[];
  teams: { id: string; name: string; memberUids: string[] }[];
  opensAt: string;
  closesAt: string;
  /** Help (explanations/coach) allowed during the championship. */
  allowHelp: boolean;
  status: 'scheduled' | 'open' | 'closed';
  createdBy: string;
  createdAt: string;
  closedAt: string | null;
}

/** tenants/{t}/championships/{id}/entries/{uid} */
export interface EntryDoc {
  uid: string;
  name: string;
  courseId: string | null;
  teamId: string | null;
  quests: Record<string, { attemptId: string; score: number | null; confirmed: boolean; at: string }>;
  /** Sum of confirmed quest scores (official ranking). */
  points: number;
  /** Sum including AI scores still waiting for teacher review. */
  provisionalPoints: number;
  updatedAt: string;
}

/** tenants/{t}/learning_profiles/{uid} – cached AI narrative. */
export interface ProfileCacheDoc {
  summary: { summary: string; strengths: string[]; focusAreas: string[]; plan: string[] } | null;
  generatedAt: string | null;
}

export type { Skill };
