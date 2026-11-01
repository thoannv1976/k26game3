/**
 * Response shapes of the VSTEP Quest API (the contract is apps/api/src/routes/*.ts and services/*.ts).
 * Student-facing views never contain answers, scripts, key points or sample answers – except `reveal` blocks the
 * server sends when the rules allow (Quest Mode after answering; exams after the teacher releases answers).
 */
import type {
  AiConfig, AssignmentDoc, ContentDoc, ContentKind, ContentVersionDoc, CourseDoc, I18nText, Level, QuotaConfig, Role, Skill, UserDoc,
  AVATAR_IDS, OUTFIT_IDS,
} from '@vq/shared';

export type { Level, Role, I18nText, UserDoc, Skill, ContentKind };
export type AvatarId = (typeof AVATAR_IDS)[number];
export type OutfitId = (typeof OUTFIT_IDS)[number];

/* ---------------- me ---------------- */
export interface PlatformUser {
  uid: string;
  email: string;
  displayName: string;
  role: 'platform_admin';
  tenantId: null;
}
export type MeUser = UserDoc | PlatformUser;
export interface MeResponse {
  user: MeUser | null;
  tenant: { id: string; name: string } | null;
  player?: { level: number; nextAt: number };
  badges?: Record<string, { en: string; vi: string }>;
  refreshToken?: boolean;
}

export function isTenantUser(u: MeUser | null | undefined): u is UserDoc {
  return Boolean(u && u.role !== 'platform_admin');
}

/* ---------------- world ---------------- */
export type QuestState = 'completed' | 'open' | 'locked';
export interface WorldQuest {
  id: string;
  state: QuestState;
  missing: string[];
  assigned: boolean;
  level: Level;
  title: I18nText;
  xpReward: number;
  estimatedMinutes: number;
  bestScore: number | null;
  activeAttemptId: string | null;
}
export interface Zone {
  skill: Skill;
  zone: string;
  progress: { completed: number; total: number };
  quests: WorldQuest[];
}
export interface WorldExam {
  id: string;
  title: I18nText;
  level: string;
  totalMinutes: number;
  sections: { skill: Skill; timeMinutes: number }[];
  disclaimer: I18nText;
  activeAttemptId: string | null;
}
export interface WorldAssignment {
  id: string;
  courseId: string;
  kind: 'quest' | 'exam';
  refId: string;
  dueAt: string | null;
  note: string;
  order: number;
  done: boolean;
}
export interface Player {
  xp: number;
  level: number;
  nextAt: number;
  badges: string[];
  streak: { days: number; lastDay: string | null };
  avatar: UserDoc['avatar'];
}
export interface WorldResponse {
  zones: Zone[];
  exams: WorldExam[];
  assignments: WorldAssignment[];
  player: Player;
}

export interface QuestSummary {
  id: string;
  skill: Skill;
  level: Level;
  title: I18nText;
  summary: I18nText;
  story: I18nText;
  objectives: I18nText[];
  estimatedMinutes: number;
  xpReward: number;
  requires: string[];
  challenges: { id: string; title: string }[];
  passPercent: number;
}

/* ---------------- attempts ---------------- */
export type AttemptMode = 'quest' | 'exam' | 'championship';
export type AttemptStatus = 'active' | 'submitted' | 'grading' | 'graded' | 'abandoned';

export interface SectionClock {
  skill: Skill;
  timeMinutes: number;
  startedAt: string | null;
  deadline: string | null;
  closedAt: string | null;
  current: boolean;
}

export interface AttemptInfo {
  id: string;
  mode: AttemptMode;
  refId: string;
  title: string;
  level: string;
  status: AttemptStatus;
  championshipId: string | null;
  helpAllowed: boolean;
  startedAt: string;
  submittedAt: string | null;
  serverNow: string;
  sections: SectionClock[];
  currentSection: number;
  secondsLeft: number | null;
  blockers: string[];
}

export type QuestionType = 'mcq' | 'tfng' | 'short';
export interface QuestionView {
  id: string;
  type: QuestionType;
  prompt: string;
  points: number;
  options?: string[];
  statement?: string;
  maxWords?: number;
  answer: { value: number | string; correct?: boolean } | null;
  reveal: { correct: string; explanation: string; evidence: string } | null;
}

interface ItemBase {
  id: string;
  level: Level;
  title: string;
  topic: string;
  instructions: I18nText;
}
export interface ListeningView extends ItemBase {
  skill: 'listening';
  context: string;
  playsLeft: number;
  playsMax: number;
  transcript: { speaker: string; text: string }[] | null;
  questions: QuestionView[];
  explained?: string[];
}
export interface ReadingView extends ItemBase {
  skill: 'reading';
  passage: { type: string; title: string; meta: Record<string, string>; body: string };
  questions: QuestionView[];
  explained?: string[];
}
export interface WritingDraft {
  text: string;
  version: number;
  wordCount: number;
  updatedAt: string | null;
}
export interface WritingView extends ItemBase {
  skill: 'writing';
  task: { type: string; input: string; prompt: string; minWords: number; maxWords: number; timeMinutes: number };
  saved: { wordCount: number; version: number; updatedAt: string } | null;
  draft?: WritingDraft;
}
export interface SpeakingTake {
  status: 'transcribed' | 'unclear';
  transcript: string;
  durationSeconds: number;
  at: string;
}
export interface SpeakingPart {
  id: string;
  type: 'social' | 'solution' | 'topic';
  prompt: string;
  options: string[];
  prepSeconds: number;
  speakSeconds: number;
  followUps: string[];
  take: SpeakingTake | null;
}
export interface SpeakingView extends ItemBase {
  skill: 'speaking';
  parts: SpeakingPart[];
}
export type ItemView = ListeningView | ReadingView | WritingView | SpeakingView;
export type ObjectiveView = ListeningView | ReadingView;

export interface AttemptView {
  attempt: AttemptInfo;
  quest: QuestSummary | null;
  exam: { id: string; title: I18nText; disclaimer: I18nText; sections: { skill: Skill; timeMinutes: number; items: number }[] } | null;
  challenges: { id: string; title: string; itemId: string }[];
  items: ItemView[];
}
export type StartResponse = AttemptView & { resumed: boolean };
export type AnswerResponse = AttemptView & { result: { saved: boolean; correct?: boolean } };

export type PlayAudio =
  | { kind: 'segments'; segments: { index: number; url: string; seconds: number }[] }
  | { kind: 'browser_tts'; lines: { text: string; voice: { languageCode: string; name: string } }[] };
export interface PlayResponse {
  playsLeft: number;
  audio: PlayAudio;
}

export interface Explanation {
  source: 'ai' | 'teacher_note';
  explanation: string;
  whyStudentAnswer: string;
  quote: string;
  vocabulary: { term: string; meaning: string }[];
  tip: string;
}

export interface SpeakingUploadResponse {
  take: SpeakingTake;
  unclear: boolean;
  view: AttemptView;
}

export interface MyAttempt {
  id: string;
  mode: AttemptMode;
  refId: string;
  title: string;
  status: AttemptStatus;
  championshipId: string | null;
  startedAt: string;
  submittedAt: string | null;
  gradedAt: string | null;
}

/* ---------------- results ---------------- */
export type CriterionStatus = 'assessed' | 'not_assessed' | 'pending_review';
export interface CriterionScore {
  score: number | null;
  max: number;
  source: 'ai' | 'speech_metrics' | 'teacher' | 'none';
  status: CriterionStatus;
  comment: string;
}
export type SkillStatus = 'assessed' | 'partial' | 'pending_review' | 'not_assessed';
export type ItemResult =
  | { itemId: string; skill: 'listening' | 'reading'; earned: number; total: number; score: number }
  | { itemId: string; skill: 'writing'; weight: number; criteria: Record<string, CriterionScore>; score: number | null; status: SkillStatus }
  | { itemId: string; skill: 'speaking'; criteria: Record<string, CriterionScore>; score: number | null; status: SkillStatus };
export type RubricResult = Extract<ItemResult, { skill: 'writing' | 'speaking' }>;

export interface SkillResult {
  skill: Skill;
  score: number | null;
  status: SkillStatus;
  detail: string;
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
  scores: Record<string, Record<string, number>>;
  comment: string;
  status: 'confirmed' | 'adjusted';
  reviewedAt: string;
}
export interface Assessment {
  id: string;
  uid: string;
  mode: AttemptMode;
  refId: string;
  title: string;
  level: string;
  championshipId: string | null;
  courseId: string | null;
  items: ItemResult[];
  aiItems: ItemResult[];
  feedback: Record<string, ItemFeedback>;
  skills: SkillResult[];
  overall: number | null;
  conversionLabel: string | null;
  aiStatus: 'ok' | 'partial' | 'failed' | 'skipped' | 'not_needed';
  pendingReview: boolean;
  score: number | null;
  passed: boolean;
  xpAwarded: number;
  newBadges: string[];
  teacherReview: TeacherReview | null;
  disclaimer: string;
  createdAt: string;
}
export interface Recording {
  partId: string;
  transcript: string;
  durationSeconds: number;
  audioUrl: string | null;
}
export type ResultItem =
  | ListeningView
  | ReadingView
  | (WritingView & { text: string; wordCount: number; keyPoints?: string[]; sampleAnswer?: string })
  | (SpeakingView & { recordings: Recording[]; keyPoints?: { partId: string; keyPoints: string[] }[]; sampleAnswer?: string });
export interface ResultsResponse {
  status: AttemptStatus;
  answersReleased?: boolean;
  assessment: Assessment | null;
  items: ResultItem[];
}

/* ---------------- championships ---------------- */
export type ChampionshipType = 'individual' | 'team' | 'class';
export type ChampionshipStatus = 'scheduled' | 'open' | 'closed';
export interface StudentChampionship {
  id: string;
  name: string;
  description: string;
  type: ChampionshipType;
  questIds: string[];
  opensAt: string;
  closesAt: string;
  allowHelp: boolean;
  status: ChampionshipStatus;
  team: string | null;
}
export interface ManagedChampionship {
  id: string;
  name: string;
  description: string;
  type: ChampionshipType;
  courseIds: string[];
  questIds: string[];
  teams: { id: string; name: string; memberUids: string[] }[];
  opensAt: string;
  closesAt: string;
  allowHelp: boolean;
  status: ChampionshipStatus;
  createdBy: string;
  createdAt: string;
  closedAt: string | null;
}
export interface ChampionshipInput {
  name: string;
  description: string;
  type: ChampionshipType;
  courseIds: string[];
  questIds: string[];
  teams: { id: string; name: string; memberUids: string[] }[];
  opensAt: string;
  closesAt: string;
  allowHelp: boolean;
}
export interface LeaderRow {
  rank: number;
  uid: string;
  name: string;
  teamId: string | null;
  courseId: string | null;
  questsDone: number;
  pendingReview: number;
  points: number;
  provisionalPoints: number;
}
export interface GroupRow {
  rank: number;
  id: string;
  name: string;
  members: number;
  points: number;
  provisionalPoints: number;
}
export interface LeaderboardResponse {
  championship: Omit<ManagedChampionship, 'teams'> & { teams: { id: string; name: string; members: number }[] };
  individuals: LeaderRow[];
  teams: GroupRow[];
  classes: GroupRow[];
  me: LeaderRow | null;
}

/* ---------------- profile & coach ---------------- */
export interface ProfileSkill {
  skill: Skill;
  score: number | null;
  sufficient: boolean;
  entries: number;
  trend: number | null;
}
export interface HistoryEntry {
  id: string;
  mode: AttemptMode;
  refId: string;
  title: string;
  score: number | null;
  passed: boolean;
  pendingReview: boolean;
  skills: { skill: Skill; score: number | null; status: SkillStatus }[];
  at: string;
}
export interface ProfileSummary {
  summary: string;
  strengths: string[];
  focusAreas: string[];
  plan: string[];
}
export interface ProfileResponse {
  user: { uid: string; displayName: string; level: Level; xp: number; badges: string[]; streak: { days: number; lastDay: string | null }; completedQuestIds: string[] } | null;
  profile: { skills: ProfileSkill[]; overall: number | null; weakest: Skill | null };
  history: HistoryEntry[];
  mistakes: Record<string, { wrong: number; total: number }>;
  recentMistakes: { skill: Skill; topic: string; prompt: string; type: string }[];
  external: {
    sources: { source: string; ok: boolean; count: number; error?: string | null }[];
    items: { id: string; source: string; title: string; skills: string[]; finalPercent: number; scoreType: string; at: string }[];
  };
  summary: { summary: ProfileSummary | null; generatedAt: string | null };
  disclaimer: string;
}
export interface CoachMessage {
  id: string;
  question: string;
  answer: string;
  kind: string;
  suggestedQuestIds: string[];
  createdAt: string;
}

/* ---------------- teacher ---------------- */
export interface TeacherClass {
  id: string;
  code: string;
  name: string;
  studentCount: number;
  teacherCount: number;
  monthlyBudgetUsd: number | null;
}
export interface ClassStats {
  students: number;
  activeStudents: number;
  perSkill: { skill: Skill; results: number; average: number | null; below50: number }[];
  criteria: Record<string, { percent: number; results: number }>;
  pendingReview: number;
}
export interface ClassStudent {
  uid: string;
  displayName: string;
  email: string;
  studentCode: string;
  level: Level;
  xp: number;
  badges: number;
  streakDays: number;
  questsCompleted: number;
  skills: Record<Skill, number | null>;
  results: number;
  pendingReview: number;
  inProgress: number;
}
export interface ClassResult {
  attemptId: string;
  uid: string;
  studentName: string;
  mode: AttemptMode;
  refId: string;
  title: string;
  score: number | null;
  passed: boolean;
  skills: { skill: Skill; score: number | null; status: SkillStatus }[];
  aiStatus: Assessment['aiStatus'];
  pendingReview: boolean;
  reviewed: 'confirmed' | 'adjusted' | null;
  answersReleased: boolean | null;
  createdAt: string;
}
export interface ClassDetail {
  course: { id: string; code: string; name: string; monthlyBudgetUsd: number | null };
  quests: { id: string; skill: Skill; level: Level; title: I18nText }[];
  exams: { id: string; title: I18nText; level: string }[];
  assignments: (AssignmentDoc & { completedBy: number })[];
  stats: ClassStats;
  students: ClassStudent[];
  inProgress: { attemptId: string; uid: string; studentName: string; mode: AttemptMode; refId: string; title: string; startedAt: string; lastActivityAt: string }[];
  results: ClassResult[];
}
export interface TeacherStudentDetail {
  student: { uid: string; displayName: string; email: string; studentCode: string; level: Level; xp: number; badges: string[]; streak: { days: number; lastDay: string | null } };
  profile: ProfileResponse;
  attempts: { id: string; mode: AttemptMode; refId: string; title: string; status: AttemptStatus; startedAt: string; submittedAt: string | null }[];
}
export interface ReviewQueueItem {
  attemptId: string;
  uid: string;
  studentName: string;
  mode: AttemptMode;
  title: string;
  championshipId: string | null;
  skills: { skill: Skill; score: number | null; status: SkillStatus }[];
  aiStatus: Assessment['aiStatus'];
  createdAt: string;
}
export interface AnalyticsSummary {
  summary: { summary: string; strengths: string[]; focusAreas: string[]; plan: string[] };
  generatedAt: string;
}

/* ---------------- content bank ---------------- */
export type ContentRow = ContentDoc & { pendingApproval: boolean };
export interface ContentCheck {
  ok: boolean;
  errors: string[];
  warnings: string[];
}
export type ContentVersion = ContentVersionDoc & { check: ContentCheck };
export interface ContentDetail {
  doc: ContentDoc;
  versions: ContentVersion[];
}
export interface ContentSaveResult {
  version: number;
  check: ContentCheck;
}

/* ---------------- admin ---------------- */
export interface AdminUser {
  uid: string;
  email: string;
  displayName: string;
  role: Exclude<Role, 'platform_admin'>;
  studentCode: string;
  level: Level;
  courseIds: string[];
  xp: number;
  disabled: boolean;
  createdAt: string;
}
export interface ImportResult {
  imported: number;
  results: { email: string; uid?: string; created?: boolean; temporaryPassword?: string | null; error?: string }[];
  errors: { line: number; error: string }[];
}
export interface AdminSettings {
  tenant: { id: string; name: string; allowedEmailDomains: string[] };
  aiConfig: AiConfig;
  quotas: QuotaConfig;
  modelOverride: string | null;
}
export interface AiHealth {
  ok: boolean;
  provider: string;
  model: string;
  reply?: string;
  error?: string;
  latencyMs: number;
}
export interface UsageReport {
  month: string;
  entries: number;
  totals: { costUsd: number; inputTokens: number; outputTokens: number };
  byKind: Record<string, { calls: number; costUsd: number; failures: number }>;
  byDay: Record<string, { calls: number; costUsd: number }>;
  topUsers: { uid: string; name: string; calls: number; costUsd: number }[];
  budget: { monthlyBudgetUsd: number; usedRatio: number; warnRatio: number; policy: 'block' | 'warn_only' };
  note: string;
}
export interface AuditLog {
  id: string;
  at: string;
  actorUid: string;
  actorEmail: string;
  actorRole: string | null;
  action: string;
  target: string;
  details: Record<string, unknown>;
}
export interface OverviewReport {
  users: number;
  attempts: number;
  recentResults: number;
  pendingReview: number;
  reviewed: number;
  byRef: Record<string, { mode: string; results: number; passed: number; avgScore: number | null }>;
}
export type Course = CourseDoc;

/* ---------------- platform ---------------- */
export interface TenantRow {
  id: string;
  name: string;
  active: boolean;
  allowedEmailDomains: string[];
  monthlyBudgetUsd: number | null;
  users: number;
  createdAt: string;
}
