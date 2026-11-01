# ARCHITECTURE – VSTEP Quest

```
Browser (React 19 + Vite + Tailwind, Firebase Auth)          k26-vstep.web.app (Firebase Hosting)
   │  /api/**  (Firebase ID token)                              │ rewrite /api/** → Cloud Run
   ▼                                                            ▼
Cloud Run  vstep-api (Fastify 5, Node 22, asia-southeast1, SA vstep-api)
   ├─ Game engine  (packages/game-engine – deterministic: unlocks, timing, scoring, XP, badges, views)
   ├─ AI           (packages/ai – Vertex AI Gemini: explain, grade writing/speaking, coach, analytics, item generator; zod + guards)
   ├─ Speech       (Speech-to-Text v1 with word offsets → transcript + fluency metrics; Text-to-Speech → listening audio)
   ├─ Firestore    database "vstep" (tenants/{t}/…)
   ├─ Cloud Storage k26game1-vstep-audio (listening .mp3, recordings .wav – lifecycle 30 days)
   └─ D4 (read-only) → ecs-api / detective-api  GET /api/lms/v1/learners/:uid/evidence (Google ID token, audience k26-lms)
Cloud Scheduler vstep-jobs-tick (*/5 min, OIDC) → POST /internal/jobs/tick
```

## Packages

| Path | Role |
|---|---|
| `packages/shared` | Zod schemas: items (listening/reading/writing/speaking), quests, exam blueprint, mock exam; platform types (tenant, user, quotas, AI config, error codes); `k26-evidence-1.0` |
| `packages/game-engine` | Pure functions. `attempt.ts` (state, exam section clocks, play limits, one answer per question in quests), `scoring.ts` (criteria, skill/overall scores, fluency from timing, XP, badges, streak, learning profile), `check.ts` (content checks: evidence present verbatim, valid voices, word ranges…), `view.ts` (student-safe views), `world.ts` (zones, locked/open). `builtin.ts` bundles `content/**` (server only) |
| `packages/ai` | Prompts (student text in `<<< >>>` data blocks), Vertex provider (JSON schema output, capped thinking), fake provider (dev/tests), guards: quotes must exist in the student text, score clamping, coach answer-leak filter |
| `apps/api` | Fastify routes (`core`, `teacher`, `admin`, `platform`, `lms`, `internal`), services (`attempts`, `grading`, `content`, `audio`, `championships`, `profile`, `jobs`, `peers`) |
| `apps/web` | React app (student game, teacher, admin, platform) |
| `content/` | Built-in content: 8 quests (L01, L02, R01, R02, W01, W02, S01, S02) with their items, mock exam MX1 + blueprint `vstep_mini_v1` |

## Main flows

- **Quest:** start → content versions frozen in the attempt → each answer is saved immediately (one attempt per question),
  correct answer + explanation + evidence shown → optional AI explanation (quota, cached, falls back to the teacher note) →
  submit when no blockers → grading.
- **Mock exam:** sections in fixed VSTEP order; `sections/start` sets `deadline = now + timeMinutes`; answers outside the
  open section or after the deadline (+2 s grace) are refused (`TIME_UP`); timeouts are applied on every request and by the
  job; after the last section the attempt is submitted automatically. No help, no correctness shown; answers visible only
  after the teacher releases them.
- **Listening:** audio pre-rendered at approval (or previewed / uploaded by the teacher), served segment by segment only
  after a play was counted; transcript only after all questions are answered (quest) or after release (exam).
- **Grading (lazy + job):** the first results request (or the 5-minute job) claims the attempt (`status: grading`, lock),
  L/R are scored by the engine, writing/speaking by Gemini with verification; fluency comes from STT word timings
  (≥ 20 s of speech), pronunciation is always `pending_review`. AI failure → criteria `pending_review` (never invented).
  XP/badges/streak awarded once (assessment id = attempt id). Championship entries updated (official = confirmed scores,
  provisional = incl. AI scores waiting for review).
- **Teacher review:** per item and criterion; recomputes item/skill scores, pass state, XP top-up, championship entry.
- **Four-skill profile:** last 5 results per skill (exam ×2, teacher-validated ×1.5) + external evidence from Games 1/2;
  "sufficient" needs ≥ 1 exam or ≥ 2 quest results; overall only when all four are sufficient.

## Decisions (PLAN.md D1–D6, T1–T6)

Repo `k26game3`; shared project `k26game1` with database `vstep`; platform copied from Game 2 + voice pipeline from Game 1;
D4 read-only evidence from Games 1/2; configurable VSTEP-format blueprint, built-in mini mock exam MX1 (85 min: L 20, R 25,
W 30, S 10 – the writing section was given realistic times, the plan estimated ~75 min); TTS listening audio reviewed by
teachers. Server-side exam timing with Cloud Scheduler (T1), async grading (T2), no AI pronunciation scoring (T3), immediate
per-answer saves and versioned drafts (T4), limited plays and no seeking (T5), `gemini-3-flash-preview` with capped thinking (T6).
