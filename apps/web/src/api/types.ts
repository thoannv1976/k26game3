/**
 * Response shapes of the English Detective API (see apps/api/src/routes/*.ts).
 * Domain types come from @vq/shared; the student-safe investigation view type comes from @vq/game-engine (type only –
 * the browser never receives answers, evidence categories, character facts or the sample solution).
 */
import type { InvestigationView } from '@vq/game-engine';
import type { AiConfig, AssignmentDoc, CaseDoc, CaseDossier, CaseVersionDoc, CourseDoc, EvidenceCategory, HintStage, I18nText, Level, QuotaConfig, Role, UserDoc } from '@vq/shared';

export type { Level, Role, I18nText, UserDoc, EvidenceCategory, HintStage, CaseDossier };

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
  refreshToken?: boolean;
}

export function isTenantUser(u: MeUser | null | undefined): u is UserDoc {
  return Boolean(u && u.role !== 'platform_admin');
}

/* ---------------- cases ---------------- */
export interface CaseSummary {
  id: string;
  level: Level;
  title: I18nText;
  summary: I18nText;
  role: string;
  setting: string;
  topic: string;
  estimatedMinutes: number;
  xpReward: number;
  documentCount: number;
  characterCount: number;
}

export interface CaseListItem extends CaseSummary {
  solved: boolean;
  bestPercent: number | null;
  activeSessionId: string | null;
}

export interface CaseDetail extends CaseSummary {
  briefing: I18nText;
  objectives: I18nText[];
  characters: { id: string; name: string; role: string; avatar: string }[];
  writingTask: { type: 'report' | 'email' | 'memo'; minWords: number; maxWords: number };
  limits: { interviewQuestionsPerCharacter: number; assistantRequests: number; minEvidenceToSubmit: number; timeMinutes: number };
}

export interface CaseDetailResponse {
  case: CaseDetail;
  activeSessionId: string | null;
}

/* ---------------- investigation sessions ---------------- */
export type SessionStatus = 'active' | 'submitted' | 'grading' | 'graded' | 'grading_failed' | 'abandoned';

export type Investigation = InvestigationView;
export type InvDocument = Investigation['documents'][number];
export type InvQuestion = Investigation['questions'][number];
export type InvCharacter = Investigation['characters'][number];
export type InvEvidence = Investigation['evidence'][number];
export type InvClue = Investigation['clues'][number];
export type InvLink = Investigation['links'][number];
export type StageId = keyof Investigation['progress'];

export interface InterviewMessage {
  id: string;
  characterId: string;
  question: string;
  reply: string;
  unlockedDocumentIds: string[];
  createdAt: string;
}

export interface AssistantMessage {
  id: string;
  stage: string;
  question: string;
  answer: string;
  kind: string;
  createdAt: string;
}

export interface DraftView {
  text: string;
  version: number;
  wordCount: number;
  updatedAt: string | null;
}

export interface SessionPayload {
  session: {
    id: string;
    caseId: string;
    caseVersion: number;
    status: SessionStatus;
    startedAt: string;
    submittedAt: string | null;
    interviewTotal: number;
    interviewMax: number;
    timeMinutes: number;
  };
  investigation: Investigation;
  interviews: InterviewMessage[];
  assistant: AssistantMessage[];
  notebook: { text: string; updatedAt: string | null };
  draft: DraftView;
}

export type StartSessionResponse = SessionPayload & { resumed: boolean };
export type AnswerResponse = SessionPayload & { result: { questionId: string; correct: boolean | null } };
export type HighlightResponse = SessionPayload & { result: { evidenceId: string | null; label: string | null; isNew: boolean; kind: 'evidence' | 'clue' } };
export type HintResponse = SessionPayload & { result: { hint: string; level: number; stage: HintStage } };
export type InterviewResponse = SessionPayload & { message: InterviewMessage & { factsRevealed?: string[] }; quotaWarning?: boolean };
export interface AssistantResponse {
  message: AssistantMessage;
  quotaWarning?: boolean;
}

/* ---------------- results ---------------- */
export type CriterionKey = 'reading' | 'evidence' | 'criticalThinking' | 'writing';
export const CRITERION_KEYS: CriterionKey[] = ['reading', 'evidence', 'criticalThinking', 'writing'];
export type WritingPartKey = 'taskAchievement' | 'coherence' | 'vocabulary' | 'grammar';
export const WRITING_PART_KEYS: WritingPartKey[] = ['taskAchievement', 'coherence', 'vocabulary', 'grammar'];

export interface CriterionResult {
  max: number;
  assessedMax: number;
  score: number | null;
  status: 'assessed' | 'partial' | 'not_assessed';
  source: 'engine' | 'ai' | 'engine+ai' | 'teacher';
  comment: string;
}

export interface TeacherReview {
  reviewerUid: string;
  reviewerName: string;
  scores: Partial<Record<CriterionKey, number>>;
  comment: string;
  status: 'confirmed' | 'adjusted';
  reviewedAt: string;
}

export interface Assessment {
  id: string;
  uid: string;
  sessionId: string;
  caseId: string;
  caseVersion: number;
  level: Level;
  courseId: string | null;
  solved: boolean;
  criteria: Record<CriterionKey, CriterionResult>;
  aiCriteria: Record<CriterionKey, CriterionResult>;
  writingParts: Record<WritingPartKey, { score: number; max: number; comment: string }> | null;
  evidence: {
    keyFound: number;
    keyTotal: number;
    categorizedCorrect: number;
    categorizedTotal: number;
    distractorsCollected: number;
    linksCorrect: number;
    linksExpected: number;
    missedKeyEvidence: { id: string; label: string }[];
    score: number;
  };
  conclusion: { correct: boolean; requiredCited: number; requiredTotal: number; weakSupport: string[]; correctText: string; chosenText: string | null };
  readingDetail: { objectiveEarned: number; objectiveTotal: number; explain: { questionId: string; score: number; max: number; comment: string }[] | null };
  total: number;
  maxAssessed: number;
  percent: number;
  finalPercent: number;
  aiStatus: 'ok' | 'failed' | 'skipped';
  feedback: {
    strengths: string[];
    improvements: string[];
    examples: { quote: string; comment: string }[];
    corrections: { original: string; corrected: string; explanation: string }[];
    reasoningComment: string;
    unsupportedClaimsUsed: string[];
    recommendations: { vocabulary: string[]; grammar: string[]; readingSkills: string[]; reasoningSkills: string[]; nextWritingTask: string };
  } | null;
  wordCount: number;
  recommendation: { nextCaseId: string | null; nextLevel: Level; reason: string };
  gamePoints: { detectivePoints: number; xp: number; hintsUsed: number };
  newAchievements: string[];
  versions: { rubric: string; prompt: string; model: string; caseVersion: number };
  qualityChecks: { removedUnverifiableQuotes: number };
  teacherReview: TeacherReview | null;
  disclaimer: string;
  createdAt: string;
}

export interface ResultsSolution {
  conclusion: string;
  keyEvidence: { id: string; label: string; documentId: string; found: boolean; explanation: string }[];
  unsupportedClaims: string[];
  writingKeyPoints: string[];
  answers: { id: string; prompt: string; studentAnswer: number | string | null; correct: boolean | null; expected: string }[];
}

export type ResultsResponse =
  | { status: Exclude<SessionStatus, 'graded'>; assessment: null }
  | {
      status: 'graded';
      assessment: Assessment;
      report: { text: string; wordCount: number; submittedAt: string };
      solution: ResultsSolution;
      case: { id: string; title: I18nText; level: Level };
    };
export type GradedResults = Extract<ResultsResponse, { status: 'graded' }>;

/* ---------------- student ---------------- */
export interface StudentProgress {
  user: UserDoc;
  stats: { xp: number; detectivePoints: number; level: Level; casesSolved: number; casesTotal: number; reports: number; averagePercent: number | null };
  achievements: string[];
  recent: { sessionId: string; caseId: string; title: I18nText; level: Level; solved: boolean; percent: number; reviewed: boolean; createdAt: string }[];
  recommendation: { nextCaseId: string | null; nextLevel: Level; reason: string; title: I18nText | null; tips: string[] } | null;
  activeSessions: { id: string; caseId: string; title: I18nText; status: SessionStatus; lastActivityAt: string }[];
  assignments: (AssignmentDoc & { courseName: string; solved: boolean })[];
}

export interface LeaderboardResponse {
  course: { id: string; code: string; name: string };
  rows: { rank: number; uid: string; displayName: string; detectivePoints: number; xp: number; casesSolved: number; badges: number; isMe: boolean }[];
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

export interface ProgressSummary {
  sessionId: string;
  caseId: string;
  status: SessionStatus;
  startedAt: string;
  lastActivityAt: string;
  documentsOpened: number;
  questionsAnswered: number;
  evidenceCollected: number;
  factsRevealed: number;
  interviews: number;
  hintsUsed: number;
  conclusionChosen: boolean;
}

export interface ClassDetail {
  course: { id: string; code: string; name: string; monthlyBudgetUsd: number | null };
  cases: { id: string; title: I18nText; level: Level }[];
  assignments: (AssignmentDoc & { submittedBy: number })[];
  students: {
    uid: string;
    displayName: string;
    email: string;
    studentCode: string;
    level: Level;
    xp: number;
    detectivePoints: number;
    casesSolved: number;
    reports: number;
    averagePercent: number | null;
    pendingReview: number;
    inProgress: number;
  }[];
  inProgress: (ProgressSummary & { uid: string; studentName: string })[];
  results: {
    sessionId: string;
    uid: string;
    studentName: string;
    caseId: string;
    level: Level;
    solved: boolean;
    percent: number;
    finalPercent: number;
    aiStatus: 'ok' | 'failed' | 'skipped';
    reviewed: 'confirmed' | 'adjusted' | null;
    createdAt: string;
  }[];
}

export interface TeacherStudentDetail {
  student: { uid: string; displayName: string; email: string; studentCode: string; level: Level; xp: number; detectivePoints: number; achievements: string[] };
  sessions: (ProgressSummary & { percent: number | null; reviewed: boolean })[];
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

export type AdminCaseRow = CaseDoc & { pendingApproval: boolean };

export interface DossierCheck {
  ok: boolean;
  errors: string[];
  warnings: string[];
}

export type AdminCaseVersion = CaseVersionDoc & { check: DossierCheck };

export interface AdminCaseDetail {
  case: CaseDoc;
  versions: AdminCaseVersion[];
}

export interface CaseDraftResult {
  version: number;
  check: DossierCheck;
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
  sessions: number;
  recentReports: number;
  reviewed: number;
  byCase: Record<string, { reports: number; solved: number; avgPercent: number }>;
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
