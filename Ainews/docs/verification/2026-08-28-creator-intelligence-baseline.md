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
| `server/routes/auth.js` | `4e108e755fd04e6acf7b1c6d742557f1fe15a77f3cd91b2ec45588a57481a9a8` |
| `server/routes/userData.js` | `0ceee502ff8a592d2e8c536b257c220e40bdf0dc3b66ca4ac4225a18813a427a` |
| `server/services/DatabaseService.js` | `de835bf3faa29f0ab59c663bb363b2ab11ede9550f0dbda2b6d58bd5c924fd9c` |

## 后续阶段已审计例外

原始基线不改写。第五阶段只批准下列兼容路由的当前哈希：

| 文件 | 当前批准 SHA-256 | 原因 |
|---|---|---|
| `server/routes/news.js` | `d56c9768918d9126f712e6e09bf3ef33a294be7ab3a38de96ef2a093c7e268f9` | 国内公开信号接口补齐完整 Topic 扫描，避免先截断全球榜后遗漏国内结果；既有 News 路由保持兼容。 |

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

## Reviewed compatibility migration (2026-08-29)

Task 17 browser QA found that the public `/alerts` page had to probe protected endpoints merely to learn whether a browser was anonymous. The approved additive migration adds `GET /api/auth/session`, which always returns HTTP 200 with `authenticated=false` for an anonymous request and returns the existing sanitized user object for a valid session. Registration, login, `/me`, logout, profile and password behavior are unchanged. The replacement hash above is accepted only together with auth-route regression coverage for both anonymous and authenticated probes and the matching OpenAPI path.

## Allowed Phase 4 change boundary

- New `server/services/creators`, Creator routes, Creator tests and explicit scheduler/config additions;
- Additive initialization and shutdown integration in `server/index.js`;
- Additive OpenAPI/Skill/README/DEPLOY documentation;
- New Creator UI routes and components without deleting the current landing, Topic, Research or Skill pages;
- No browser cookies, platform tokens, `.env` values or private watchlists in Git.
