# API – vstep-api (`/api`, Firebase ID token in `Authorization: Bearer …`)

Errors: `{ "error": { "code", "message", "details" } }` – codes in `packages/shared/src/platform.ts` (`ApiErrorCodes`), e.g.
`TIME_UP`, `PLAY_LIMIT`, `NOT_READY_TO_SUBMIT`, `DRAFT_CONFLICT`, `HELP_DISABLED`, `CONSENT_REQUIRED`, `AUDIO_TOO_LONG`,
`ATTEMPT_LIMIT`, `EXPLANATION_LIMIT`, `COACH_LIMIT`, `QUOTA_EXCEEDED`, `BUDGET_EXCEEDED`, `CHAMPIONSHIP_CLOSED`.

## Student
| Method | Path | Notes |
|---|---|---|
| GET/PATCH | `/me` | profile, player level, badge names; PATCH locale/level/displayName/avatar (outfits unlock by level) |
| POST | `/me/recording-consent` | `{accept}` – required before speaking uploads |
| GET | `/world` | 4 zones with quest states (locked/open/completed), mock exams, learning path, player stats |
| GET | `/quests/:id` | quest summary |
| POST | `/attempts` | `{questId, assignmentId?, championshipId?, restart?}` – start/resume (daily attempt limit) |
| POST | `/exams/:id/attempts` | start/resume a mock exam (monthly limit) |
| GET | `/attempts/:id` | attempt view (student-safe items; exams: only the current section) |
| POST | `/attempts/:id/answers` | `{itemId, questionId, value}` (mcq index, tfng `true/false/not_given`, short text) |
| POST | `/attempts/:id/play` | `{itemId}` → plays left + audio segment URLs (dev: browser TTS lines) |
| GET | `/attempts/:id/audio/:itemId/:index` | MP3 segment (only after a counted play) |
| PUT | `/attempts/:id/writing/:itemId` | `{text, baseVersion}` versioned autosave |
| POST | `/attempts/:id/speaking/:itemId/:partId` | multipart `audio` (16-bit mono WAV) → transcript |
| POST | `/attempts/:id/sections/start` · `/sections/next` | exam section clock |
| POST | `/attempts/:id/explain` | `{itemId, questionId}` AI explanation (quest mode, after answering) |
| POST | `/attempts/:id/submit` | idempotent |
| GET | `/attempts/:id/results` | grades lazily; `status` submitted/grading/graded |
| GET | `/attempts/:id/recordings/:itemId/:partId` | own recording (WAV) |
| GET | `/me/attempts` | history |
| GET | `/profile` · POST `/profile/summary` | four-skill profile (+ Games 1/2 evidence) · AI narrative |
| GET/POST | `/coach` | `{clientMessageId, question}` – disabled during exams/championships without help |
| GET | `/championships` · `/championships/:id/leaderboard` | official + provisional ranking |

## Teacher (`teacher`, `school_admin`)
`GET /teacher/classes`, `GET /teacher/classes/:id` (stats, students heat map, results, assignments), `POST/DELETE /teacher/assignments`,
`GET /teacher/students/:uid`, `GET /teacher/attempts/:id`, `GET /teacher/review-queue`, `PUT /teacher/assessments/:id/review`
(`{scores:{itemId:{criterion:score}}, comment}`), `POST /teacher/assessments/:id/regrade`, `POST /teacher/exams/release`
(`{courseId, examId}` or `{attemptIds}`), `GET /teacher/analytics?courseId`, `POST /teacher/analytics/summary`,
`GET/POST /teacher/championships`, `PUT /teacher/championships/:id`, `POST /teacher/championships/:id/close`,
`GET /teacher/championships/:id/leaderboard`, `GET /teacher/export.csv?courseId`.

## Content bank (`teacher`, `school_admin`; exam approval and archive: `school_admin`)
`GET /admin/content/:kind` (item|quest|exam), `GET /admin/content/:kind/:id`, `POST /admin/content/:kind/check`,
`PUT /admin/content/:kind/:id` (new draft version), `POST /admin/content/:kind/:id/approve {version}`,
`POST /admin/content/:kind/:id/archive`, `POST /admin/content/seed`, `POST /admin/content/generate` (AI → draft),
listening audio review: `POST /admin/content/item/:id/versions/:v/audio/render`, `POST /admin/content/item/:id/versions/:v/audio`
(multipart MP3), `GET /admin/content/item/:id/versions/:v/audio/:index`.

## School admin
Users (`/admin/users`, CSV import), courses, settings (`/admin/settings`, `/admin/ai-config`, `/admin/quotas`, `/admin/school`),
`POST /admin/health/ai`, usage (`/admin/usage`, `/admin/usage.csv`), `/admin/audit-logs`, `/admin/reports/overview`.

## Platform admin
`GET/POST/PATCH /platform/tenants` (`seedContent` seeds approved quests; the mock exam stays a draft).

## LMS-AI9 / AI English Learning Portfolio (`school_admin`), format `k26-evidence-1.0`
`GET /lms/v1/results?courseId=&since=&limit=`, `GET /lms/v1/evidence/:attemptId`, `GET /lms/v1/learners/:uid/evidence`.
`source: "vstep-quest"`, `activity.type`: `vstep_quest` | `vstep_mock_exam` | `vstep_championship_quest`; criteria per skill (0–100)
and per writing/speaking criterion.

## Internal
`POST /internal/jobs/tick` (not under /api, not routed by Hosting) – Cloud Scheduler OIDC token from `JOBS_INVOKERS`, audience
`JOBS_AUDIENCE`. Finishes timed-out exams, grades pending submissions, closes championships.
