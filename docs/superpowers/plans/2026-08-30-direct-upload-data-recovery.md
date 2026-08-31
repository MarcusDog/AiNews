# Direct Upload and Data Recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace GitHub-dependent production updates with verified direct uploads, populate at least 10,000 real news rows and 100 benchmark creators locally, repair the reliable collection path, and prove daily recommendations and every product page work against the populated database.

**Architecture:** The Mac becomes the build and collection control plane because production DNS/egress is currently unreliable. It builds an immutable release archive, collects and validates public data into a separate SQLite snapshot, then uploads code and optional data through SSH to a versioned server release directory; the server activates releases atomically while preserving `.env`, user data, and rollback points. Public/official feeds remain in-process, while login/API-constrained platforms stay behind explicit official connectors or signed Sidecars.

**Tech Stack:** Bash, rsync/scp/ssh, Node.js 20+, Express, React/Vite, SQLite/WAL, RSS/Atom, YouTube feeds/yt-dlp, GitHub API, Agent-Reach/MediaCrawler Sidecars, Vitest, Node test runner, browser QA.

---

## Baseline evidence

- Production `api/news/latest` reports 2,223 rows; Creator source, creator, post and hot endpoints return empty lists.
- Production Signal catalog has 20 sources, but Hugging Face, Mastodon and three Reddit sources fail with incorrect DNS destinations; L3 entries are marked online from development mocks and several save only three mock rows.
- Local working database has 10,632 news rows, 288 signals and zero creators/accounts/posts.
- The committed creator seed catalog has only 10 creators.
- A fresh local L1 probe succeeded on 7/8 sources and returned 42 valid signals; the only failure was the third standalone Reddit request hitting 429, while the real service shares a feed cache.
- `docker-deploy.sh update` still executes `git pull`; no direct upload producer/consumer exists.
- `server/package-lock.json` pins Tencent mirror `/npm/` tarball URLs. The mirror returns 502; host-only replacement produces invalid npmjs `/npm/` URLs.
- Production SSH currently rejects the available local identities, so scripts can be implemented and tested locally but final remote upload requires a server SSH user/key.

## Task 1: Reproducible dependency and release input policy

**Files:**
- Create: `server/tests/release-inputs.test.js`
- Modify: `server/package-lock.json`
- Modify: `docker-compose.yml`
- Modify: `docker-deploy.sh`

- [ ] Write a failing test that rejects lockfile tarballs outside HTTPS npmjs and rejects Compose runtime `npm install`.
- [ ] Run the test and confirm it fails on the Tencent mirror and container install command.
- [ ] Regenerate/rewrite the server lockfile against `https://registry.npmjs.org` and make the server image install dependencies at build time.
- [ ] Run clean server install and the new test; confirm both pass.

## Task 2: Direct-upload release producer and server activator

**Files:**
- Create: `scripts/build-release.sh`
- Create: `scripts/upload-release.sh`
- Create: `scripts/activate-release.sh`
- Create: `scripts/release-manifest.mjs`
- Create: `server/tests/direct-upload-release.test.js`
- Modify: `docker-deploy.sh`
- Modify: `DEPLOY.md`
- Modify: `docs/SYSTEM_USAGE_GUIDE.md`

- [ ] Write failing tests for exclusions, manifest hashes, immutable release IDs, preservation of `.env`/database, atomic symlink activation, health-check rollback and no `git pull` dependency.
- [ ] Implement deterministic source archive creation with `SHA256SUMS` and a JSON manifest.
- [ ] Implement `rsync` primary and `scp` fallback upload using explicit host/user/key variables; never print credentials.
- [ ] Implement server-side staging verification, dependency/build check, versioned activation, PM2/Compose restart, health probe and rollback.
- [ ] Add `package`, `upload`, `activate`, `rollback` and `update-local` commands to deployment tooling.
- [ ] Run shell syntax, test suite and a temporary local “fake server” activation canary.

## Task 3: Network transport and source diagnostics

**Files:**
- Create: `server/services/network/source-transport.js`
- Create: `server/scripts/diagnose-source-network.js`
- Create: `server/tests/source-network-transport.test.js`
- Modify: `server/services/signals/adapters/adapter-utils.js`
- Modify: `server/services/signals/signal-service.js`
- Modify: `server/services/NewsService.js`
- Modify: `server/.env.example`

- [ ] Write failing tests for proxy propagation, direct/proxy fallback order, DNS result diagnostics, bounded retry, upstream status classification and credential redaction.
- [ ] Implement one transport policy shared by News and Signal adapters with explicit `AYA_SOURCE_PROXY_URL`, standard proxy env fallback, timeouts and typed failure codes.
- [ ] Add a read-only diagnostic that resolves every configured hostname, detects obviously shared/wrong destinations, probes HTTP and outputs a redacted JSON report.
- [ ] Ensure missing L2/L3 credentials stay `unconfigured`; development mocks can only run when `NODE_ENV=test` and an explicit test flag are both present.
- [ ] Run the local L1 probe twice and confirm deterministic source statuses without duplicate writes.

## Task 4: 100+ verified creator benchmark catalog

**Files:**
- Create: `server/config/creatorBenchmarks.json`
- Create: `server/scripts/discover-creator-benchmarks.js`
- Create: `server/scripts/verify-creator-benchmarks.js`
- Create: `server/tests/creator-benchmark-catalog.test.js`
- Modify: `server/services/creators/creator-catalog.js`
- Modify: `server/config/creatorSeeds.example.json`
- Modify: `docs/CREATOR_SOURCES.md`

- [ ] Write failing tests requiring at least 100 distinct verified creators, at least 20 per launch vertical, stable external IDs, canonical HTTPS evidence and no duplicate accounts.
- [ ] Build the catalog from public YouTube Atom, RSS, GitHub, Bluesky and Mastodon identities; resolve handles to stable IDs only after live verification.
- [ ] Keep media/brand/person kind explicit so benchmark comparisons do not present publishers as individuals.
- [ ] Record per-account verification status and disable feeds that fail identity or URL validation instead of inventing data.
- [ ] Run the validator and a bounded live URL/feed probe; produce counts by vertical/platform/status.

## Task 5: Local data collection and validated dataset snapshot

**Files:**
- Create: `server/scripts/build-local-dataset.js`
- Create: `server/scripts/report-dataset.js`
- Create: `server/tests/local-dataset-builder.test.js`
- Create: `docs/operations/LOCAL_DATA_PIPELINE.md`
- Runtime artifact: `server/data/local-production-ready.db` (Git ignored, uploaded separately)
- Runtime artifact: `server/data/reports/local-production-ready.json` (safe aggregate report may be committed)

- [ ] Write failing tests for isolated database creation, preservation of existing news, idempotent creator imports, minimum-count gates, URL/provenance validation and nonzero per-vertical content.
- [ ] Create a SQLite online backup from the existing local 10,632-row news database into an isolated dataset path.
- [ ] Migrate schema, import 100+ benchmark creators/accounts, collect current public posts, run bounded history backfill and build hotness/topics/opportunities.
- [ ] Run News/Signal refreshes locally and retain existing valid history; never pad counts with mock rows.
- [ ] Fail the build unless news >=10,000, verified creators >=100, creator accounts >=100, creator posts >0, all four verticals have content, and sampled original URLs are canonical HTTPS.
- [ ] Emit a redacted JSON report with actual counts, time ranges, source states, failure reasons and SHA256 of the database artifact.

## Task 6: Daily refresh and recommendation continuity

**Files:**
- Create: `server/scripts/run-daily-refresh.js`
- Create: `scripts/sync-data-snapshot.sh`
- Create: `server/tests/daily-refresh.test.js`
- Modify: `server/index.js`
- Modify: `server/.env.example`
- Modify: `docs/SYSTEM_USAGE_GUIDE.md`

- [ ] Write failing tests proving one run refreshes News, Signals, Creator incremental data, scores/topics and random opportunities in order.
- [ ] Add a process lock, per-stage timeout, failure isolation, machine-readable summary and nonzero recommendation gate.
- [ ] Add local cron/launchd-friendly command and optional direct-upload snapshot synchronization with remote backup and atomic replacement.
- [ ] Ensure server scheduler can keep using reachable sources, while local refresh remains the authoritative fallback when server egress fails.
- [ ] Run two consecutive refreshes and verify idempotency plus a changed/latest recommendation cursor where new evidence exists.

## Task 7: Full API and browser QA

**Files:**
- Create: `docs/verification/2026-08-30-direct-upload-data-recovery-verification.md`
- Create/update: `.gstack/qa-reports/qa-report-local-2026-08-30.md`
- Modify only source files directly tied to reproduced QA defects; add new regression tests per defect.

- [ ] Start backend and Vite client against the populated isolated database.
- [ ] Verify health, six News routes, Signal windows, Creator lists/posts/hot/topics, random topic exclusion, research brief, sources and public discovery endpoints.
- [ ] Browser-test `/`, `/topics`, `/research`, `/creators`, creator detail, all four `/verticals`, `/sources`, `/alerts` and `/skills` on desktop and mobile.
- [ ] Check every navigation target, random topic refresh, profile/window switches, evidence links, research feedback, empty/error states and console errors.
- [ ] Fix reproduced critical/high/medium defects with failing regression tests first, then rerun full QA.

## Task 8: Release, upload readiness and final evidence

**Files:**
- Modify: `PROJECT_REBUILD_STATUS.md`
- Modify: `README.md`
- Modify: `DEPLOY.md`
- Modify: `docs/SYSTEM_USAGE_GUIDE.md`

- [ ] Run full server/client tests, build, dependency audit, shell syntax, manifest verification, data integrity and credential scan.
- [ ] Build the final source release and separate database snapshot; verify both hashes.
- [ ] If SSH credentials become available, upload to staging, activate, verify production and retain rollback; otherwise report the exact one-command handoff and authentication blocker.
- [ ] Commit and push the branch, open a PR, and report actual counts and every source as online/zero-result/degraded/blocked/unconfigured.

## Self-review findings

- Data quantity alone is not accepted: every count gate is paired with real source provenance and mock exclusion.
- Server DNS repair cannot be guaranteed from application code; local collection plus snapshot upload is the operational fallback, while the diagnostic report preserves the infrastructure evidence.
- Login-state platforms cannot be made anonymous server collectors without user authorization. They remain signed Sidecars and are not counted as online until a real canary succeeds.
- Production data replacement must preserve users, subscriptions and delivery state; the sync step uses SQLite backup/merge semantics and never blindly overwrites a live database.
