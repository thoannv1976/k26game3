# TESTING

| Command | What |
|---|---|
| `npm run typecheck` | all workspaces |
| `npm run test:unit` | game engine (scoring, timing, unlocks, badges) + **all built-in content checks** (evidence quoted verbatim, valid voices, word ranges, correct answers score 100, views never leak answers), AI guards, API unit tests |
| `npm run test --workspace @vq/web` | web unit tests (i18n key parity, draft storage, helpers) |
| `npm run test:integration` | API against Firebase emulators (Firestore + Auth): full quest/exam/writing/speaking/championship/coach/profile flows, security & limits, + Firestore rules tests |
| `npm run test:e2e` | Playwright: web + API + emulators with offline AI/STT/TTS (`tests/e2e`) |

Integration highlights (`apps/api/test/integration`):
- Answers and transcripts never in student views before allowed; another student gets 403.
- Listening play limits; audio only after a counted play; teacher preview/upload of listening audio.
- Exam: answers refused before a section starts and after its deadline (server clock moved forward), auto-close, results hidden until release.
- Writing: draft version conflicts; AI corrections not quoted from the text are removed; AI outage → `pending_review` → teacher review completes the quest.
- Speaking: consent required, length limit, fluency from timing, pronunciation pending → teacher review.
- Championship ranking official vs provisional, one official attempt per quest, podium badge on close.
- Concurrency: racing answers → one saved; concurrent result polling → XP awarded once; refused restart does not abandon the running attempt.
- Quotas: daily attempts, monthly mock exams, explanations; offline AI refused in production; jobs need OIDC in production.

E2E (`tests/e2e`, 11 specs, desktop + Pixel 7): listening quest L01 to results and L02 unlock, reading R01 on mobile (no horizontal
scroll), writing W01 autosave + reload + AI feedback, speaking S01 with Chromium's fake microphone (pronunciation "teacher will score
this"), full mock exam with timer and "answers not released", teacher class/review queue/pronunciation score/answer release, student
sees released answers, content bank with listening audio review panel, character creation + vi/en switch, profile + coach + history,
championship create + leaderboard. Not covered by E2E: waiting a whole section to zero (unit-tested clock), real MP3 segments
(offline runs use browser speech), the audio review requests themselves (covered by API integration tests).

Notes: kill stale emulators before re-running (`pkill -f cloud-firestore-emulator`). The fake AI provider (`FakeAiProvider`)
and fake STT/TTS exist for tests/dev only and are refused when `NODE_ENV=production`.
