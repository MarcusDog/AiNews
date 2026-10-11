# Aya Signal / Topic / Creator Intelligence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a real, explainable multi-source AI hotspot, topic clustering, creator opportunity, open API, and monitoring dashboard system without breaking the existing News and AyaNewsSkill interfaces.

**Architecture:** Add a parallel Signal subsystem beside the legacy News pipeline. Small source adapters emit one canonical Signal contract into a SQLite store; a deterministic topic engine clusters recent signals and computes explainable 24/48/72-hour trend and creator-opportunity scores. New read-only APIs and a scrollable React dashboard consume only persisted real data, while optional credential/bridge sources remain explicitly unconfigured until enabled.

**Tech Stack:** Node.js 20+, Express, Axios, rss-parser, better-sqlite3, node:test; React 19, Vite, TypeScript, Tailwind CSS, shadcn/Radix, Vitest/Testing Library.

---

## File map

### Server

- `server/config/signalSources.js`: immutable source registry and environment-driven optional-source configuration.
- `server/services/signals/signal-normalizer.js`: canonical URL, timestamps, metrics, fingerprints and validation.
- `server/services/signals/signal-store.js`: Signal/Topic/source-run schema plus transactional persistence and queries.
- `server/services/signals/adapters/*.js`: one external protocol per file; no database access.
- `server/services/signals/signal-collector.js`: adapter orchestration, concurrency, run summaries and health updates.
- `server/services/signals/topic-engine.js`: deterministic clustering, time windows and explainable score breakdowns.
- `server/services/signals/opportunity-engine.js`: audience, content-angle and creator-value output derived from Topic evidence.
- `server/services/signals/signal-service.js`: application facade for refresh/read operations.
- `server/routes/signals.js`: public read endpoints and admin-key-protected refresh endpoint.
- `server/index.js`: route mount, initialization and schedule hooks only.
- `server/config/schedules.js`: Signal refresh schedule.
- `server/services/PublicDiscoveryService.js`: OpenAPI/Skill/feed discovery for new endpoints.

### Client

- `client/src/features/radar/radar-api.ts`: typed API client.
- `client/src/features/radar/use-radar.ts`: loading, abort, refresh and stale-response handling.
- `client/src/features/radar/radar-dashboard.tsx`: section composition and honest empty/error states.
- `client/src/features/radar/components/*.tsx`: topic, source, project and change cards.
- `client/src/features/topic-idea/topic-api.ts`: prefer real opportunity endpoint, retain News fallback.
- `client/src/features/topic-idea/topic-idea.ts`: map opportunity payload to existing Dialog contract.
- `client/src/App.tsx`: hero plus scrollable monitoring dashboard.
- `client/src/styles.css`: dashboard tokens, glass surfaces and responsive layout.

### Documentation

- `README.md`, `QUICKSTART.md`, `DEPLOY.md`: source tiers, environment variables and runbook.
- `PROJECT_REBUILD_STATUS.md`: milestone evidence and limits after every task group.
- `docs/research/2026-08-27-ai-signal-source-audit.md`: already completed source audit.

Because the worktree contains user-owned uncommitted changes, this plan intentionally replaces commit steps with status-document checkpoints and `git diff --check`; it must not create commits that mix unrelated work.

---

### Task 0: Capture and protect the dirty-worktree baseline

**Files:**
- Snapshot only: `server/index.js`, `server/routes/content.js`, `server/services/PublicDiscoveryService.js`, `nginx/nginx.conf`, `docker-compose.yml`, `README.md`, `QUICKSTART.md`, `DEPLOY.md`, `skills/aya-news-skill/SKILL.md`, `skills/aya-news-skill/references/api.md`
- Modify: `PROJECT_REBUILD_STATUS.md`

- [ ] **Step 1: Record scoped status and diffs before overlapping edits**

Save `git status --short`, each target file's current SHA-256, and `git diff -- <file>` into a timestamped directory outside the repository under `/tmp`. Copy the current full target files into that same directory for later three-way comparison. Never include `.env`, database files, tokens or cookies.

- [ ] **Step 2: Record ownership boundaries**

In `PROJECT_REBUILD_STATUS.md`, label every overlapping file and the exact new responsibility allowed in phase 2. Existing phase-1/public-interface hunks are immutable unless the plan explicitly extends the same function.

- [ ] **Step 3: Establish final preservation checks**

For every overlapping file, final review must compare `baseline file → final file` separately from `HEAD → final file`. Confirm all baseline content remains unless the verification report names the exact intentional replacement and its compatibility test. Run `git diff --check` after each overlap.

- [ ] **Step 4: Do not commit or stash**

Do not run `git add`, `git commit`, `git stash`, reset or checkout. The current directory is explicitly the user's requested integration workspace and contains phase-1 work not present in a clean branch.

---

### Task 1: Freeze source registry and canonical Signal contract

**Files:**
- Create: `server/config/signalSources.js`
- Create: `server/services/signals/signal-normalizer.js`
- Test: `server/tests/signal-sources.test.js`
- Test: `server/tests/signal-normalizer.test.js`

- [ ] **Step 1: Write failing source-registry tests**

Test that every source has a unique `id`, valid `tier`, `platform`, `region`, `mode`, timeout, adapter name and frozen `trustClass` in `official|community_api|public_feed|bridge`. Assert L1 includes RSS News, HN, GitHub, Mastodon, Reddit, Hugging Face and Bilibili; assert optional sources report `configured: false` without required env. The registry must also contain disabled L4 inventory rows for `mediacrawler-sidecar` and `agent-reach-sidecar`, with no credential values, `configured: false`, `enabled: false`, mode `sidecar` and an operator-facing setup hint.

- [ ] **Step 2: Run RED**

Run: `cd server && node --test tests/signal-sources.test.js`

Expected: FAIL because `config/signalSources.js` does not exist.

- [ ] **Step 3: Implement source registry**

Export `buildSignalSourceCatalog(env)` and `validateSignalSourceCatalog(catalog)`. Freeze trust-class defaults by source family and reject missing/unknown values. Do not read credentials into response objects; expose only boolean configuration, credential label and setup hint. L4 inventory rows are capability declarations only and must never be scheduled by the web server.

- [ ] **Step 4: Write and run failing normalizer tests**

Cover URL tracking-parameter removal, unsafe scheme rejection, UTC timestamp normalization, absent metrics staying `null`, non-negative metric validation, deterministic SHA-256 fingerprint and raw payload JSON.

Run: `cd server && node --test tests/signal-normalizer.test.js`

Expected: FAIL because normalizer is missing.

- [ ] **Step 5: Implement minimal normalizer and verify GREEN**

Run: `cd server && node --test tests/signal-sources.test.js tests/signal-normalizer.test.js`

Expected: PASS.

- [ ] **Step 6: Checkpoint**

Update milestone D in `PROJECT_REBUILD_STATUS.md` with test counts; run `git diff --check`.

---

### Task 2: Add SQLite Signal, Topic and source-health persistence

**Files:**
- Create: `server/services/signals/signal-store.js`
- Test: `server/tests/signal-store.test.js`

- [ ] **Step 1: Write failing database tests**

Use a temporary `AINEWS_DB_PATH`. Assert idempotent schema creation for `signals`, `signal_sources`, `signal_runs`, `topics`, `topic_aliases`, `topic_signals`, `topic_snapshots`, and `topic_changes`; indexes must cover fingerprint, published time, platform, stable anchors, change sequence and topic window queries.

- [ ] **Step 2: Run RED**

Run: `cd server && node --test tests/signal-store.test.js`

Expected: FAIL because store is missing.

- [ ] **Step 3: Implement schema and transactional methods**

Implement `initialize`, `upsertSignals`, `startSourceRun`, `finishSourceRun`, `listSourceHealth`, `listRecentSignals`, `replaceTopics`, `listTopics`, `getTopic`, `listChanges`, and `close`. On fingerprint conflict update `last_seen_at` and metrics without overwriting the original evidence URL/time. `replaceTopics` performs topic rows, relations, aliases, snapshots and monotonic change rows in one transaction keyed by `refresh_id`.

- [ ] **Step 4: Add behavior tests**

Cover idempotent upsert, metric refresh, failed run preserving prior success, source state distinctions, transactional topic relation replacement, alias resolution, time-window filtering, retention and deterministic pagination. A failed run must leave `last_success_at` unchanged while setting `last_error`, incrementing `failure_count`, setting `last_attempt_at`, and deriving `degraded`/`offline` health without deleting historical Signals. Freeze these contracts:

- canonical Topic anchor priority: `repo_full_name` → canonical evidence URL → earliest Signal fingerprint;
- initial `topic_id = sha256("aya-topic-v1:" + anchor).slice(0, 24)`;
- a rebuilding cluster reuses the existing Topic with exact anchor or signal-overlap Jaccard `>= 0.55` plus a shared strong entity;
- merge keeps the lexicographically smallest existing Topic ID and writes losing IDs to `topic_aliases`;
- split lets the child containing the original anchor retain the ID and assigns new anchor-derived IDs to other children;
- Topic ordering is `trend_score DESC, latest_seen_at DESC, topic_id ASC`;
- `topic_changes.seq` is an autoincrement cursor, returned ascending for `seq > cursor`, with `next_cursor` equal to the last returned sequence;
- any Topic lookup by an alias resolves to the canonical Topic and returns `canonical_topic_id`; feeds always emit canonical IDs;
- signals/topics expire after 45 days when unreferenced, source runs/snapshots/changes after 30 days, while aliases are retained.

- [ ] **Step 5: Verify GREEN**

Run: `cd server && node --test tests/signal-store.test.js`

Expected: PASS with temporary databases removed by test cleanup.

- [ ] **Step 6: Checkpoint**

Re-read and update `PROJECT_REBUILD_STATUS.md`; run `git diff --check`.

---

### Task 3: Implement real no-auth adapters

**Files:**
- Create: `server/services/signals/adapters/rss-signal-adapter.js`
- Create: `server/services/signals/adapters/hacker-news-adapter.js`
- Create: `server/services/signals/adapters/github-adapter.js`
- Create: `server/services/signals/adapters/mastodon-adapter.js`
- Create: `server/services/signals/adapters/hugging-face-adapter.js`
- Create: `server/services/signals/adapters/bilibili-adapter.js`
- Test: `server/tests/signal-adapters.test.js`

- [ ] **Step 1: Write HTTP-fixture adapter tests**

Inject Axios/RSS parser clients. For each adapter, test real-shaped payload mapping, original URL, author/time, platform metrics, pagination limits, timeout/header use and malformed-item filtering. RSS tests cover Reddit community Atom plus existing News articles without duplicating the legacy database.

- [ ] **Step 2: Run RED**

Run: `cd server && node --test tests/signal-adapters.test.js`

Expected: FAIL because adapters are missing.

- [ ] **Step 3: Implement HN and GitHub adapters**

HN uses `search_by_date` with AI query families and points/comments. GitHub uses repository search with recent-created/recent-pushed queries, optional token, stars/forks/issues and returned rate-limit metadata.

- [ ] **Step 4: Implement Mastodon, Hugging Face and Bilibili adapters**

Mastodon reads public trending statuses and links from configured instances. Hugging Face maps trending repositories across model/dataset/space types. Bilibili maps public popular videos and applies the frozen `bilibili-ai-relevance-v1` policy before persistence: normalize title + description + owner; accept one strong term (`人工智能`, `大模型`, `AIGC`, `LLM`, `AI Agent`, OpenAI/Anthropic/Google DeepMind/ChatGPT/Claude/Gemini/DeepSeek/Qwen/通义/智谱/豆包/Kimi/可灵/即梦/ComfyUI/Stable Diffusion) or at least two distinct generic terms (`AI` as a token, `模型`, `智能体`, `提示词`, `机器学习`, `生成式`, `AI编程`, `机器人`). Tests must include unrelated popular videos containing only ambiguous words such as “模型” or “智能” and reject them. Preserve only metrics returned by Bilibili.

- [ ] **Step 5: Implement RSS adapter**

Support configured Reddit communities, legacy `news` rows as `news` signals, and later RSSHub URLs. Ensure source item identifiers and feed GUIDs remain stable.

- [ ] **Step 6: Verify GREEN**

Run: `cd server && node --test tests/signal-adapters.test.js tests/signal-normalizer.test.js`

Expected: PASS.

- [ ] **Step 7: Real endpoint probe**

Run adapter probe script/test with network enabled and bounded limit. Expected: at least one of HN/GitHub/Mastodon/Hugging Face/Bilibili/Reddit returns valid signals; failures are reported per source rather than failing the run.

- [ ] **Step 8: Checkpoint**

Update source-level probe evidence in `PROJECT_REBUILD_STATUS.md`.

---

### Task 4: Implement optional official APIs and bridge adapters

**Files:**
- Create: `server/services/signals/adapters/youtube-adapter.js`
- Create: `server/services/signals/adapters/x-adapter.js`
- Create: `server/services/signals/adapters/json-bridge-adapter.js`
- Create: `server/services/signals/adapters/newsnow-adapter.js`
- Modify: `server/services/signals/adapters/rss-signal-adapter.js`
- Test: `server/tests/optional-signal-adapters.test.js`

- [ ] **Step 1: Write failing configuration and mapping tests**

Assert missing credentials/base URLs produce `unconfigured` without network calls. Cover YouTube search/video-stat joins, X public metrics, RSSHub route joining without SSRF-prone arbitrary per-request URLs, NewsNow `{id,name,title,url,mobileUrl}`/ranking payload mapping, and JSON bridge schema validation. Confirm L4 MediaCrawler/Agent-Reach inventory remains disabled and is never instantiated.

- [ ] **Step 2: Run RED**

Run: `cd server && node --test tests/optional-signal-adapters.test.js`

Expected: FAIL because optional adapters are missing.

- [ ] **Step 3: Implement YouTube and X adapters**

Read server-side env only, use bounded queries and never return tokens. Convert quota/rate-limit failures to source-run errors.

- [ ] **Step 4: Implement RSSHub, NewsNow and JSON bridge support**

Build allowed RSSHub routes from static configuration (`weibo/search/hot`, `zhihu/hotlist`, `douyin/hot`, selected Bilibili routes). Implement NewsNow as a dedicated adapter enabled only by `NEWSNOW_BASE_URL`, with a static allowlist of source IDs and returned-link hostname validation; it must not silently use the public instance. `SIGNAL_BRIDGES_JSON` must be parsed at startup, allow only HTTPS by default, enforce max response size/timeout, and validate every returned Signal.

- [ ] **Step 5: Verify GREEN and honest status**

Run: `cd server && node --test tests/optional-signal-adapters.test.js tests/signal-sources.test.js`

Expected: PASS; default environment reports these connectors unconfigured.

- [ ] **Step 6: Checkpoint**

Re-read and update `PROJECT_REBUILD_STATUS.md`.

---

### Task 5: Orchestrate collection and source health

**Files:**
- Create: `server/services/signals/signal-collector.js`
- Create: `server/services/signals/signal-service.js`
- Test: `server/tests/signal-collector.test.js`

- [ ] **Step 1: Write failing orchestration tests**

Cover bounded concurrency, one-source failure isolation, configured/enabled checks, normalization before persistence, dedupe counts, run start/finish, timeout propagation and a lock preventing overlapping refreshes. Explicitly seed a prior success, then fail the same source and assert `last_success_at` is unchanged while `last_attempt_at`, `last_error`, `failure_count` and derived health are updated and other adapters still persist results.

- [ ] **Step 2: Run RED**

Run: `cd server && node --test tests/signal-collector.test.js`

Expected: FAIL because collector is missing.

- [ ] **Step 3: Implement collector and facade**

Use a small worker pool, deterministic source order, per-adapter injected clients and result `{startedAt, finishedAt, sources, received, saved, skipped, errors}`. Import existing News rows after the legacy refresh so official/RSS evidence participates in topics.

- [ ] **Step 4: Verify GREEN**

Run: `cd server && node --test tests/signal-collector.test.js tests/signal-store.test.js`

Expected: PASS.

- [ ] **Step 5: Checkpoint**

Update milestone D evidence; run `git diff --check`.

---

### Task 6: Build deterministic Topic, Trend and Opportunity engines

**Files:**
- Create: `server/services/signals/topic-engine.js`
- Create: `server/services/signals/opportunity-engine.js`
- Test: `server/tests/topic-engine.test.js`
- Test: `server/tests/opportunity-engine.test.js`

- [ ] **Step 1: Write failing clustering tests**

Cover same-event titles across Chinese/English source variants, shared canonical URL, project/brand entity match, unrelated generic “AI” stories staying separate, configurable 72h boundary, stable anchor/merge/split rules and deterministic output independent of input order.

- [ ] **Step 2: Run clustering RED**

Run: `cd server && node --test tests/topic-engine.test.js`

Expected: FAIL because engine is missing.

- [ ] **Step 3: Implement explainable clustering**

Use normalized tokens, aliases for major AI entities/projects, URL identity, weighted Jaccard and time distance. Apply Task 2's stable identity rules, persist `cluster_reasons` and do not force low-confidence merges.

- [ ] **Step 4: Add failing trend score tests**

Assert freshness, log-normalized engagement, 24/48/72h signal counts, cross-platform diversity, source trust and GitHub-specific metrics. Missing values contribute zero and remain absent. Assert every total equals the frozen `trend-v1` formula:

- `freshness` max 25: newest evidence age `<=6h:25`, `<=24h:20`, `<=48h:12`, `<=72h:6`, otherwise `0`;
- `engagement` max 25: `min(25, 5 * log10(1 + likes + 3*comments + 4*shares + 0.01*views + 3*stars + 5*forks + 2*points))` using only present metrics;
- `momentum` max 20: let `current=count(0–24h)`, `previous=count(24–48h)`; if `current>0 && previous=0`, score 16; otherwise `clamp(0,20,10 + 5*(current-previous)/max(1,previous))`; add 4 capped points when current includes a newly appearing second platform;
- `diversity` max 15: `min(15, 5 * distinct_platforms)`;
- `trust` max 10: `10 * average(source_trust)` where registry trust is frozen to `official=1.0`, `community_api=0.75`, `public_feed=0.6`, `bridge=0.4`;
- `project` max 5: `min(5, 1.25 * log10(1 + stars + 3*forks + open_issues))` for repository evidence, otherwise `0`;
- total is the rounded sum, clamped to 0–100, and the response includes `formula_version: "trend-v1"` plus every raw input.

- [ ] **Step 5: Implement trend snapshots and change detection**

Return evidence strength, first/latest seen, platform/source counts and “what changed” based on the latest prior snapshot. Freeze direction rules in order: `new` when first seen within 24h and no previous-window signal; `rising` when 24h signal growth is `>= 50%` with `current >= 2` or score rose by at least 10; `cooling` when growth is `<= -50%` or score fell by at least 10; otherwise `steady`. Snapshot comparison uses the same `formula_version` only.

- [ ] **Step 6: Write and run opportunity RED**

Test deterministic creator angles for beginner/general/creator audiences, project-demo opportunities, risk notes for weak/single-source topics and no invented facts.

- [ ] **Step 7: Implement opportunity engine**

Derive creator score using frozen `opportunity-v1`: `0.55*trend_score + utility + demo + novelty + discussion`, rounded/clamped to 0–100. `utility` is 12 for tool/repository/model/product evidence plus 3 when setup/tutorial/use-case cues exist, capped 15; `demo` is 10 for repository/video/demo/Hugging Face Space, 6 for other product/model evidence, otherwise 2; `novelty` is 10/6/2 for first seen within 24h/48h/older; `discussion = min(10, 2*log10(1 + comments + replies + shares))`. Multiply the final score by `0.85` for a one-source or one-platform Topic and emit an evidence-risk note. Return `formula_version: "opportunity-v1"` and raw inputs. Generate templated angles solely from Topic title, kinds and evidence; leave LLM enrichment optional and out of the core correctness path.

- [ ] **Step 8: Verify GREEN**

Run: `cd server && node --test tests/topic-engine.test.js tests/opportunity-engine.test.js`

Expected: PASS.

- [ ] **Step 9: Checkpoint**

Update milestone E in `PROJECT_REBUILD_STATUS.md`.

---

### Task 7: Expose public and admin APIs

**Files:**
- Create: `server/routes/signals.js`
- Modify: `server/index.js`
- Modify: `server/config/schedules.js`
- Test: `server/tests/signal-routes.test.js`
- Test: `server/tests/schedule.test.js`
- Test: `server/tests/server-lifecycle.test.js`

- [ ] **Step 1: Write failing route tests**

Cover:

- `GET /api/signals/v1/topics?window=24h|48h|72h`
- `GET /api/signals/v1/topics/:id`
- `GET /api/signals/v1/opportunities`
- `GET /api/signals/v1/opportunities/random`
- `GET /api/signals/v1/sources`
- `GET /api/signals/v1/changes?since=...`
- `GET /api/signals/v1/health`
- `POST /api/signals/v1/admin/refresh`

Assert stable envelope, pagination, invalid query 400, unknown topic 404, honest empty arrays, original evidence links, and admin key 401/403/success. Freeze incremental and alias behavior: if `since` is older than the retained minimum `topic_changes.seq`, return HTTP `410` with `{error:"cursor_expired", resync:"/api/signals/v1/topics", oldest_cursor, latest_cursor}`; an alias Topic ID returns the canonical Topic with `canonical_topic_id` and no redirect loop. API schema fixtures must include every raw metric used by `trend-v1` and `opportunity-v1`, including `replies`, even when its value is `null`.

- [ ] **Step 2: Run RED**

Run: `cd server && node --test tests/signal-routes.test.js`

Expected: FAIL because route does not exist.

- [ ] **Step 3: Implement routes with dependency injection**

Export a router factory for tests and a default router for `server/index.js`. Public endpoints are read-only; refresh reuses existing admin-key semantics.

- [ ] **Step 4: Add initialization and schedules**

After `NewsService.updateAllNews()`, initialize Signal store, collect and rebuild topics. Add a bounded recurring Signal refresh schedule. Initialization errors degrade source health but do not stop the legacy server. Implement these lifecycle flags with production-safe defaults:

- `AINEWS_DISABLE_CRON=1`: register no cron jobs; default `0`;
- `AINEWS_SKIP_STARTUP_REFRESH=1`: initialize databases/routes but perform no external News or Signal refresh; default `0`;
- `AINEWS_SIGNAL_SOURCE_LIMIT=<positive integer>`: cap adapters only for explicit probe/test runs; unset means no cap;
- `NODE_ENV=test` does not silently change production behavior; tests set flags explicitly;
- wrap `server.listen` in `if (require.main === module)` so importing the app does not bind a port, and export lifecycle helpers for tests;
- recovery timers and Socket.IO setup obey the same skip/disable lifecycle and are closed by test teardown.

- [ ] **Step 5: Verify GREEN and legacy compatibility**

Run: `cd server && node --test tests/signal-routes.test.js tests/schedule.test.js tests/server-lifecycle.test.js tests/content-routes.test.js tests/public-routes.test.js`

Expected: PASS.

- [ ] **Step 6: Checkpoint**

Update milestone F partial status; record the intentional `server/index.js` overlap and run `git diff --check`.

---

### Task 8: Update Agent/OpenAPI/Feed discovery surfaces

**Files:**
- Modify: `server/services/PublicDiscoveryService.js`
- Modify: `server/routes/public.js` if needed
- Modify: `server/routes/content.js`
- Modify: `skills/aya-news-skill/SKILL.md`
- Modify: `skills/aya-news-skill/references/api.md`
- Modify: `skills/aya-news-skill/references/evidence-rules.md`
- Modify: `skills/aya-news-skill/scripts/ainews.mjs`
- Test: `server/tests/public-discovery-service.test.js`
- Test: `server/tests/public-routes.test.js`
- Test: `server/tests/content-routes.test.js`
- Test: `skills/aya-news-skill/tests/cli.test.mjs`
- Test: `skills/aya-news-skill/tests/package.test.mjs`

- [ ] **Step 1: Write failing discovery tests**

Assert `/skill.md` and the installable `skills/aya-news-skill/SKILL.md` document evidence levels, source tiers, 24/48/72h windows, no-fabrication rules and example requests. Assert `/openapi.json` includes all Signal endpoints and schemas. Feed tests assert Topic items use stable IDs and real evidence URLs. CLI tests must exercise topics, topic detail, opportunities, source health and changes cursor commands against fixture responses.

- [ ] **Step 2: Run RED**

Run: `cd server && node --test tests/public-discovery-service.test.js tests/public-routes.test.js tests/content-routes.test.js`

Expected: FAIL on missing Signal contracts.

- [ ] **Step 3: Implement discovery updates**

Add capabilities and endpoints without claiming MCP/A2A/webhook implementations that do not exist. Keep existing News endpoints documented as compatibility surfaces. Update the packaged Skill source, API/evidence references and CLI together so the downloadable archive cannot lag behind the web-generated Skill.

- [ ] **Step 4: Add Topic feeds**

Expose `/topics/feed.json` and `/topics/rss.xml`, backed by real persisted Topics only. Topic feed timestamps use Topic `latest_seen_at`; items include stable Topic ID and evidence links.

- [ ] **Step 5: Verify GREEN**

Run the three server discovery test files plus `cd skills/aya-news-skill && npm test`; expected PASS. Rebuild package archives only through the repository's package script and verify SHA256 manifests.

- [ ] **Step 6: Checkpoint**

Mark milestone F complete in `PROJECT_REBUILD_STATUS.md`.

---

### Task 9: Build the Vision Monitoring dashboard

**Files:**
- Create: `client/src/features/radar/radar-api.ts`
- Create: `client/src/features/radar/radar-types.ts`
- Create: `client/src/features/radar/use-radar.ts`
- Create: `client/src/features/radar/radar-dashboard.tsx`
- Create: `client/src/features/radar/components/topic-card.tsx`
- Create: `client/src/features/radar/components/source-monitor.tsx`
- Create: `client/src/features/radar/components/project-signal-card.tsx`
- Create: `client/src/features/radar/components/change-stream.tsx`
- Modify: `client/src/App.tsx`
- Modify: `client/src/styles.css`
- Test: `client/src/features/radar/radar-api.test.ts`
- Test: `client/src/features/radar/radar-dashboard.test.tsx`
- Test: `client/src/App.test.tsx`

- [ ] **Step 1: Write failing API client tests**

Cover nested response validation, safe evidence URLs, 24/48/72h query, abort handling, malformed payload and HTTP failure.

- [ ] **Step 2: Run RED**

Run: `cd client && npm test -- --run src/features/radar/radar-api.test.ts`

Expected: FAIL because radar client is missing.

- [ ] **Step 3: Implement typed API client and hook**

Use an AbortController, ignore stale responses and expose `loading|ready|empty|error`. Never manufacture sample Topic cards.

- [ ] **Step 4: Write failing component tests**

Test real Topic rendering, score breakdown disclosure, single-source warning, source `online/degraded/unconfigured` labels, GitHub metrics, window switching, retry and empty state.

- [ ] **Step 5: Implement dashboard components**

Place a light-on-dark data workspace below the cinematic hero. Sections: “正在升温”, “今日可做选题”, “开源项目雷达”, “国内 / 海外视野”, “本次新增”, “来源监测”. Preserve existing icons/design language and keyboard accessibility.

- [ ] **Step 6: Make the page scrollable and responsive**

Change the landing shell so only the hero owns the full-screen video; the dashboard has a solid deep-navy background. Verify no overlay/gradient is added to the hero video.

- [ ] **Step 7: Verify GREEN and build**

Run: `cd client && npm test -- --run && npm run build`

Expected: all client tests PASS and Vite production build succeeds.

- [ ] **Step 8: Checkpoint**

Update milestone G in `PROJECT_REBUILD_STATUS.md` with test/build sizes.

---

### Task 10: Connect random topics to Creator Opportunities

**Files:**
- Modify: `client/src/features/topic-idea/topic-api.ts`
- Modify: `client/src/features/topic-idea/topic-idea.ts`
- Modify: `client/src/features/topic-idea/topic-idea-dialog.tsx`
- Test: `client/src/features/topic-idea/topic-api.test.ts`
- Test: `client/src/features/topic-idea/topic-idea.test.ts`
- Test: `client/src/features/topic-idea/use-topic-idea.test.tsx`

- [ ] **Step 1: Write failing opportunity-preference tests**

Assert random Topic opportunity is preferred; real latest News remains a compatibility fallback; final practice fallback remains visibly labeled and never carries fake trend/platform metrics.

- [ ] **Step 2: Run RED**

Run the three topic-idea test files; expected FAIL on the new endpoint contract.

- [ ] **Step 3: Implement mapping and dialog details**

Show why-now, recommended audience, content angles, evidence count/strength, risk note and original sources. Maintain existing request cancellation and stale-response rules.

- [ ] **Step 4: Verify GREEN**

Run: `cd client && npm test -- --run src/features/topic-idea`

Expected: PASS.

- [ ] **Step 5: Checkpoint**

Re-read and update `PROJECT_REBUILD_STATUS.md`.

---

### Task 11: Deployment and operator documentation

**Files:**
- Modify: `README.md`
- Modify: `QUICKSTART.md`
- Modify: `DEPLOY.md`
- Modify: `docker-compose.yml`
- Modify: `nginx/nginx.conf`
- Modify: `server/.env.example` if present, otherwise create `server/.env.example`
- Test: deployment/config validation commands

- [ ] **Step 1: Document environment contract**

Include `GITHUB_TOKEN`, `YOUTUBE_API_KEY`, `X_BEARER_TOKEN`, `RSSHUB_BASE_URL`, `NEWSNOW_BASE_URL`, `SIGNAL_BRIDGES_JSON`, Mastodon instances, Reddit communities, refresh schedule and retention. Do not include real secrets.

- [ ] **Step 2: Document source operations**

Explain source tiers, status meanings, first refresh, health endpoint, admin refresh, rate limits, self-hosted bridge examples and MediaCrawler as a separate optional enrichment service.

- [ ] **Step 3: Update deployment configuration**

Pass optional variables through Compose without making them mandatory. Preserve existing `client/dist` and Nginx paths. Add explicit exact-match Nginx proxy locations for `/topics/feed.json` and `/topics/rss.xml` before the SPA fallback, with the same proxy headers/timeouts as the existing machine-readable routes.

- [ ] **Step 4: Validate configs**

Run: `bash -n start.sh docker-deploy.sh docker-manage.sh`

Run: `docker-compose config --quiet`

Run an Nginx syntax test and, when the local server is available, request both feed paths through Nginx rather than directly from Express. Expected: success and XML/JSON content types; if Docker daemon is unavailable, use the existing local Nginx path-substitution validation and record image/runtime verification as environmental.

- [ ] **Step 5: Checkpoint**

Update docs evidence in `PROJECT_REBUILD_STATUS.md`; run `git diff --check`.

---

### Task 12: Full verification and live QA

**Files:**
- Modify: `PROJECT_REBUILD_STATUS.md`
- Create: `docs/verification/2026-08-27-signal-platform-verification.md`

- [ ] **Step 1: Re-read status and run full automated suites**

Run: `cd server && npm test`

Run: `cd client && npm test -- --run && npm run build && npm audit --omit=dev`

Expected: all tests/build/audit PASS.

- [ ] **Step 2: Run a clean-database end-to-end refresh**

Use a temporary database and bounded source limits. Verify a failed source does not block others, persisted Signals contain real URLs/times, Topics reference their Signals and score totals match breakdowns.

- [ ] **Step 3: Probe live APIs**

Start the server with test-safe scheduling/refresh flags. Request health, topics, topic detail, opportunities/random, sources, changes, skill.md, OpenAPI and feeds. Validate schema and no `example.com`/demo records.

- [ ] **Step 4: Perform Chrome QA**

Test desktop 1440×960 and mobile 390×844: hero video fallback, navigation anchors, window filters, cards, source monitor, random Topic Dialog, keyboard focus, console errors, failed-API empty/error states and horizontal overflow.

- [ ] **Step 5: Run release safety checks**

Run `git diff --check`, strict secret-pattern scans of source/build output, and inspect `git status --short`. For each Task 0 target, compare the saved baseline file to the final file and inspect `HEAD → baseline`, `baseline → final`, and `HEAD → final`; confirm every pre-phase-2 hunk is still represented or name an intentional replacement with its compatibility test. Hash the baseline directory and attach the preservation table to the verification report.

- [ ] **Step 6: Finalize documentation**

Write exact commands, counts, live source successes/failures and environmental limits to the verification report. Mark milestones H and second phase complete only if all required acceptance criteria pass.
