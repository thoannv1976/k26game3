# OPERATIONS

- **Health:** `GET /api/health`. Logs: Cloud Run `vstep-api` (structured JSON; `jobs.tick` every 5 min with counts).
- **Scheduler:** `vstep-jobs-tick` (*/5, Asia/Ho_Chi_Minh). If it fails, results still appear when students open the results page.
- **AI outage:** writing/speaking criteria become "pending teacher review"; teachers score them in the review queue or press
  *Regrade* later (limited per submission). Explanations fall back to the teacher-approved note.
- **Costs:** Admin → Usage (estimates from the price table incl. STT minutes and TTS characters). Budget policy warn/block.
- **Content updates:** edit → new draft version → check → (listening: generate preview / upload MP3 and listen) → approve.
  Running attempts keep the version they started with.
- **Mock exam publishing:** only a school admin (expert sign-off) can approve exams; add a conversion table to the blueprint
  only if the school has approved one (otherwise results show 0–100 only).
- **Data deletion:** Admin → Users → delete data (attempts, assessments, recordings, coach history, championship entries, account).
- **Retention:** recordings `.wav` 30 days (bootstrap `AUDIO_RETENTION_DAYS`); listening `.mp3` kept with their content version.
