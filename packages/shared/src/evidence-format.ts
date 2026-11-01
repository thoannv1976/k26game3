/**
 * Common learning-evidence format for the K26 game ecosystem (Game 1 English City Simulator,
 * Game 2 English Detective, Game 3 VSTEP Quest) consumed by LMS-AI9 and the AI English Learning Portfolio.
 */
export const EVIDENCE_SCHEMA = 'k26-evidence-1.0';

export interface LearningEvidence {
  schema: typeof EVIDENCE_SCHEMA;
  evidenceId: string; // "<game>:<tenantId>:<sessionId>"
  source: 'english-city-simulator' | 'english-detective' | 'vstep-quest';
  tenantId: string;
  learner: { uid: string; email: string | null; studentCode: string | null; name: string | null };
  courseId: string | null;
  activity: { type: string; id: string; version: number; title: string; level: 'B1' | 'B2' };
  skills: ('listening' | 'speaking' | 'reading' | 'writing' | 'critical_thinking')[];
  result: {
    completed: boolean;
    aiPercent: number;
    finalPercent: number;
    scoreType: 'ai_practice' | 'teacher_validated';
    criteria: Record<string, { score: number | null; max: number; status: 'assessed' | 'not_assessed'; source: string }>;
  };
  feedback: { strengths: string[]; improvements: string[]; nextPractice: string[] } | null;
  timestamps: { startedAt: string | null; completedAt: string; reviewedAt: string | null };
  versions: Record<string, string | number>;
  disclaimer: string;
}
