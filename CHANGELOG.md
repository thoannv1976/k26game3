# Changelog

## 1.1.0 – unreleased (branch feature/lti-sso)

### Added
- UniGame Hub (LTI 1.3) single sign-on from Moodle, off unless `LTI_ENABLED=true` (game id `k26game3`).
  - `POST /api/lti/launch {ticket}` verifies the Hub's one-time signed ticket and creates or reuses an `lti-…` Auth user.
    These users are keyed by the Hub user id, never by e-mail, with the same uid as in Games 1 and 2 (shared Firebase Auth),
    so a Moodle user has one account in all K26 games. Claims `{tenantId, role}` stay compatible: a school admin is never
    downgraded and an account of another school is refused.
  - It creates the VSTEP Quest profile, enrols the user in the course mapped from the Moodle course and creates the assignment
    for the activity the teacher chose: a quest (`L01`…`W02`) or a mock exam (`mx1`). Content must be approved for the school.
  - Web page `/lti-launch` signs in with the returned custom token and opens the quest or the exam lobby (students) or the
    class page (teachers).
- Grade sync to Moodle through the Hub: when an attempt of an LTI assignment is graded (results page, background job or
  teacher regrade) and after a teacher review, the assessment `score` (0–100: quest skill score, mock exam overall) is sent
  with max 100 – `PendingManual` while writing/speaking criteria wait for the teacher, `FullyGraded` otherwise. Attempts
  without a score yet are sent after the teacher review. Every outcome is logged in `tenants/{t}/lti_outbox`; a failure never
  blocks grading.
- Config: `LTI_ENABLED`, `LTI_HUB_URL`, `LTI_GAME_ID` (default `k26game3`), `LTI_TENANT_MAP` (`hubTenant=appTenant;…`) and
  `LTI_GAME_SECRET` (Secret Manager `unigamehub-secret-k26game3`, override with `LTI_SECRET_NAME`).
- `scripts/create-tenant.mts` creates an LMS-only school (no admin account) with the built-in content.
- `scripts/lti-preview.sh` with `firebase.preview.json` deploys a preview (Cloud Run `vstep-api-lti-preview` and Hosting
  channel `lti` on `k26-vstep`). `scripts/deploy.sh` accepts `FIREBASE_ACCOUNT`.

### Changed
- Resuming an unfinished quest or mock exam from an assignment link now attaches that assignment to the attempt.

## 1.0.0 – 2026-11-01

First complete version of VSTEP Quest – AI English Skills Adventure (K26 Game 3).

### Added
- Quest World with four zones (Listening Island, Reading Castle, Writing Academy, Speaking Arena), 8 built-in quests (B1/B2)
  with prerequisites, XP, player levels, avatar outfits, streaks and 8 badges.
- Listening with pre-rendered multi-voice Text-to-Speech audio (teacher preview / MP3 upload), server-counted plays,
  transcript after answering; reading passages with VSTEP question types (MCQ, True/False/Not Given, short answer).
- Writing with versioned autosave and AI feedback on 4 criteria (quotes verified against the text); speaking with WAV recording,
  Speech-to-Text, fluency from speech timing, AI feedback on task/vocabulary/grammar, pronunciation left to the teacher.
- Mock exam mode: configurable VSTEP-format blueprint, built-in mini exam MX1 (85 min), server-timed sections in fixed order,
  auto-submit, no help, answers released by the teacher; overall score only when all four skills are valid.
- AI explainer (after answering, cached, fallback to the teacher note), AI learning coach (no answers to open questions),
  AI question generator (drafts only), AI learning-analytics summaries for students and teachers.
- Four-skill learning profile with optional read-only evidence from English City Simulator and English Detective (D4).
- Championships (individual / team / class) with official and provisional leaderboards and podium badges.
- Teacher area: class dashboard with skill heat map, learning paths, review queue with recordings, exam answer release,
  analytics, CSV export. Content bank with versions, checks and approval. School admin and platform admin from Game 2.
- LMS API in the common K26 format `k26-evidence-1.0`; Cloud Scheduler job for timeouts, background grading, championship closing.
- Deployment kit for the shared project `k26game1` (database `vstep`, `vstep-api`, `k26-vstep.web.app`), CI/CD workflows, docs.
