# SECURITY

- **All writes through the API.** Firestore rules deny every client write; clients may read only their own profile and
  assessments (school admins: their school). Question bank, quests, exams and attempt state are server-only.
- **No answer leakage.** Students receive views from `packages/game-engine/src/view.ts`: no `correctIndex`, acceptable answers,
  evidence, scripts, key points or sample answers until rules allow (quest: after answering; exam: after teacher release).
  The built-in content JSON is bundled only into the API (the web imports `@vq/game-engine/core` at most).
- **Exam integrity.** Server clock and deadlines; answers outside the open section refused; no help/coach during exams; listening
  plays counted server-side, audio served only after a counted play, no transcript.
- **AI safety.** Student text and transcripts are data in delimited blocks; outputs validated with zod; scores clamped; quotes and
  corrections must exist in the student's text; explanation quotes must exist in the source (else the approved evidence);
  coach replies are filtered against answers of questions the student has not answered yet; no invented scores
  (`pending_review` / `not_assessed`); pronunciation never scored by AI. Classroom content filter on inputs/transcripts.
- **Cost control.** Per-student daily AI calls, attempts per quest, explanations, coach messages; monthly mock exams; grading
  attempts per submission; school/course monthly budgets with warn/block.
- **Identity.** Firebase ID tokens verified with revocation check; roles and tenant from custom claims; teachers only see their
  classes; platform admins see no learning data. `/internal/jobs/tick` requires a Google OIDC token from the scheduler account.
  D4 calls to Games 1/2 use the `vstep-api` service identity (audience `k26-lms`), read-only, one endpoint.
- **Privacy.** Recording notice and consent before speaking; recordings deleted automatically after 30 days (bucket lifecycle) and on
  account deletion; no service-account keys; no secrets in the repo (`.env.example` placeholders only).
- **Least privilege.** `vstep-api` Firestore access conditioned to database `vstep`; Storage access only on its bucket.
