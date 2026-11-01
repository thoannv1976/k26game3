# Changelog

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
