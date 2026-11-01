# DATABASE – Firestore database `vstep`

All learning data lives under `tenants/{tenantId}`. Clients cannot write anything (rules); the API uses the Admin SDK.

| Path | Content |
|---|---|
| `tenants/{t}` | School: name, allowed e-mail domains, `quotas`, `aiConfig`, `active` |
| `…/users/{uid}` | Profile: role, courses, level, avatar, XP, badges, streak, completed quests, best scores, recording consent |
| `…/courses/{id}` | Class: code, name, teacherIds, studentIds, monthly budget |
| `…/assignments/{id}` | Learning path: `kind` quest/exam, `refId`, `order`, due date |
| `…/question_bank/{itemId}` + `/versions/{n}` | Items (answers, scripts, key points, sample answers – server only); version `audio` (listening segments) |
| `…/quests/{id}` + `/versions/{n}` | Quests (challenges → item ids, prerequisites, pass %) |
| `…/mock_exams/{id}` + `/versions/{n}` | `{exam, blueprint}` (sections, times, item ids, conversion table, approvedBy) |
| `…/game_sessions/{attemptId}` | Attempt: mode quest/exam/championship, frozen versions, `state` (answers, plays, writing meta, speaking takes, section clocks, explained), status, lock, `answersReleased`, `helpAllowed` |
| `…/game_sessions/{id}/writing_submissions/{itemId}` | Versioned writing draft/final text |
| `…/game_sessions/{id}/explanations/{item__question}` | Cached AI explanation |
| `…/assessments/{attemptId}` | Result: items (final), aiItems (before review), feedback, skills, overall/score, passed, XP, badges, aiStatus, pendingReview, versions (rubric/prompt/model/content), teacherReview, disclaimer |
| `…/championships/{id}` + `/entries/{uid}` | Championship (type, classes, quests, teams, window, allowHelp) and per-student points (official/provisional) |
| `…/users/{uid}/coach_messages/{clientMessageId}` | Coach conversation (idempotent by client id) |
| `…/learning_profiles/{uid}` | Cached AI profile summary |
| `…/usage_counters/{id}` | Daily per-student (AI calls, attempts per quest, explanations, coach) and monthly (mock exams, tenant/course cost) counters |
| `…/usage_logs`, `…/audit_logs` | Cost estimates per AI/STT/TTS call; staff actions |

Storage (`k26game1-vstep-audio`): `tenants/{t}/listening/{itemId}/v{n}/{i}.mp3` (or `upload.mp3`) and
`tenants/{t}/recordings/{uid}/{attemptId}/{itemId}_{partId}.wav` (deleted after the retention period).

Indexes: `firebase/firestore.indexes.json`. Rules: `firebase/firestore.rules` (own profile/assessment read only; everything else server-only).
