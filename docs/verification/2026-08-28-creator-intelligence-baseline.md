# Creator Intelligence Phase 4 Baseline

日期：2026-08-28（Asia/Shanghai）

## Git baseline

- Repository: `MarcusDog/AiNews`
- Branch: `codex/aya-creator-intelligence-radar`
- Baseline commit: `94690619df189481258e14eab14fb0b1c98989b0`
- Pre-task `git status --short`: clean
- Pre-existing tracked diff: none
- Pre-existing untracked files: none

This manifest contains no environment values, credentials, cookies, database rows, cache payloads or backups.

## Protected file hashes

These files are outside the Creator Intelligence implementation boundary unless a later reviewed plan task explicitly changes the baseline test and documents the compatibility migration.

| File | SHA-256 |
|---|---|
| `server/routes/news.js` | `a71af612c2d50bee52109c780e4ffad337c92d58b53a404ec719788cbe808cb3` |
| `server/routes/signals.js` | `30565ae98ac5e92457d0f4c4cd6488af36322bf97a86c954b700202a20eaf0ec` |
| `server/routes/auth.js` | `916f26a6ea6decfe5bc76468c642fcdc451a4a534cc847bd0942f84467dcbedd` |
| `server/routes/userData.js` | `0ceee502ff8a592d2e8c536b257c220e40bdf0dc3b66ca4ac4225a18813a427a` |
| `server/services/DatabaseService.js` | `de835bf3faa29f0ab59c663bb363b2ab11ede9550f0dbda2b6d58bd5c924fd9c` |

## Public compatibility markers

`server/index.js` may receive additive Creator routes, raw-body ingest ordering, service lifecycle and scheduler integration. It must retain:

- `/api/news`;
- `/api/auth`;
- `/api/user-data`;
- `/api/signals/v1`;
- `initializeSystem`;
- `registerCronJobs`;
- `shutdown`;
- `startServer`.

The existing machine-readable `/skill.md`, `/openapi.json`, News JSON/RSS and Topic JSON/RSS discovery surfaces remain additive compatibility requirements.

## Legacy table boundary

Creator Intelligence uses new `creator_*` tables and must not rename, drop or reinterpret these existing tables:

- `news`;
- `rss_sources`;
- `user_preferences`;
- `users`;
- `auth_sessions`;
- `user_favorites`;
- `user_read_history`;
- `system_config`;
- `diversity_audits`;
- `request_logs`.

New migrations must keep SQLite foreign keys enabled and must pass the existing DatabaseService, News, Auth, User Data, Signal and public-route tests.

## Allowed Phase 4 change boundary

- New `server/services/creators`, Creator routes, Creator tests and explicit scheduler/config additions;
- Additive initialization and shutdown integration in `server/index.js`;
- Additive OpenAPI/Skill/README/DEPLOY documentation;
- New Creator UI routes and components without deleting the current landing, Topic, Research or Skill pages;
- No browser cookies, platform tokens, `.env` values or private watchlists in Git.
