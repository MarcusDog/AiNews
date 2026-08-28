# AyaNews Cross-Vertical Creator Intelligence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `subagent-driven-development` (recommended) or `executing-plans` to implement this plan task-by-task.

**Goal:** Build a truthful, locally queryable creator-monitoring subsystem that continuously acquires every accessible public post for verified watchlist accounts across beauty, fashion, AI technology, and entertainment, detects viral/cross-creator topics, and sends durable filtered notifications.

**Architecture:** Add a separate Creator Intelligence bounded context beside the existing Signal/Topic system. Official APIs, public feeds, and streams run inside the server; authenticated or brittle platform crawlers run as isolated signed Sidecars. All normalized creator posts, metric snapshots, cursors, topics, events, subscriptions, and delivery attempts persist in SQLite before APIs or notifications expose them.

**Tech Stack:** Node.js 20 CommonJS, Express 4, better-sqlite3/WAL/FTS5, node:test, React 18, TypeScript, Vite, Vitest, Testing Library, Socket.IO/SSE, HMAC-SHA256 Webhooks.

**Specification:** `docs/superpowers/specs/2026-08-28-cross-vertical-creator-intelligence.md`

**Research:** `docs/research/2026-08-28-cross-vertical-creator-source-audit.md`

---

## Delivery slices

- **Slice A — trustworthy acquisition:** Tasks 0–7. Watchlists, creator identity, local post storage, L1 connectors, gated official connectors, signed Sidecar ingestion, resumable full-history backfill.
- **Slice B — useful creator intelligence:** Tasks 8–11. Metric trajectories, creator-relative hotness, vertical classification, multi-creator/cross-platform topics, searchable query APIs and evidence-backed content ideas.
- **Slice C — dependable delivery and product UI:** Tasks 12–17. Durable subscriptions/outbox, transports, retention/backup/export, realtime stream, creator/vertical/source/alert pages, OpenAPI/Skill updates and live canary verification.

Each slice must be independently deployable. A platform appears as `online` only after a real canary has written at least one current post or has truthfully completed a zero-result run for a verified account.

## Task 0: Freeze the current baseline and open Phase 4

**Files:**

- Modify: `PROJECT_REBUILD_STATUS.md`
- Create: `docs/verification/2026-08-28-creator-intelligence-baseline.md`
- Test: `server/tests/creator-baseline.test.js`

**Step 1: Read the persistent status before editing**

Run: `tail -n 160 PROJECT_REBUILD_STATUS.md`

Expected: Phase 3 is complete and Phase 4 implementation is not marked complete.

**Step 2: Capture the pre-existing dirty state before any staging**

Save `git status --short`, `git diff --binary HEAD` and the untracked-file list to an explicit task-owned temporary directory created with `mktemp -d`. Record hashes for overlapping tracked files. Never copy `.env`, Cookie files or database contents. If `PROJECT_REBUILD_STATUS.md` or another target already contains uncommitted user work, mark it as overlap and do not stage it in this task.

**Step 3: Write a failing protection test**

Create `server/tests/creator-baseline.test.js` to hash the public legacy routes, current Signal routes, `server/index.js` lifecycle markers, and the existing SQLite user/news tables that must survive the new subsystem.

Run: `cd server && node --test tests/creator-baseline.test.js`

Expected: FAIL because the baseline manifest does not exist.

**Step 4: Save a non-secret baseline manifest**

Record Git HEAD, `git status --short`, route names, table names, and SHA-256 hashes. Exclude `.env`, cookies, database contents, backups and cache payloads.

Run: `cd server && node --test tests/creator-baseline.test.js`

Expected: PASS.

**Step 5: Update Phase 4 status**

Add the confirmed scope, truthful “all accessible public history” definition, current gaps and baseline evidence to `PROJECT_REBUILD_STATUS.md`.

If the status file was dirty at baseline, save the task-owned Phase 4 hunk in the working tree but exclude that file from this commit. It can be committed later only after the owner changes have already been preserved/committed or the exact staged patch has been reviewed.

**Step 6: Review the staged patch and commit**

```bash
git add docs/verification/2026-08-28-creator-intelligence-baseline.md server/tests/creator-baseline.test.js
git diff --cached --name-status
git diff --cached --check
git commit -m "test: freeze creator intelligence baseline"
```

Expected: the staged diff contains only the two task-owned files unless an exact, reviewed status hunk was intentionally staged. No broad `git add` is permitted anywhere in this plan.

## Task 1: Add the Creator Intelligence schema and store

**Files:**

- Create: `server/services/creators/creator-store.js`
- Create: `server/tests/creator-store.test.js`

**Step 1: Write failing schema and transaction tests**

Cover creation and foreign keys for:

- `creator_verticals`, `creators`, `creator_accounts`, `creator_vertical_memberships`;
- `creator_posts`, `creator_post_verticals`, `creator_post_metrics`;
- `creator_cursors`, `creator_runs`, `creator_backfills`;
- `creator_topics`, `creator_topic_posts`, `creator_topic_snapshots`;
- `creator_events` with `seq INTEGER PRIMARY KEY AUTOINCREMENT` plus a unique stable event ID, `creator_subscriptions`, `creator_delivery_endpoints`;
- `creator_delivery_outbox`, `creator_delivery_attempts`, `creator_bridge_nonces`;
- `creator_bridge_payloads` linked to `creator_runs` and `creator_bridge_payload_posts` linked to persisted posts, with payload-link cascade that never deletes the post;
- `creator_maintenance_previews` with one-time/expiry state and `creator_maintenance_audits` with actor, action, frozen boundaries, result and timestamp;
- external post uniqueness on `(platform, external_post_id)` and account uniqueness on `(platform, external_account_id)`.

Assert missing metrics remain `NULL`, post upserts append only changed metric snapshots, a failed cursor transaction rolls back the post, and deleting an expired Bridge payload cascades only its link rows while posts remain.

Run: `cd server && node --test tests/creator-store.test.js`

Expected: FAIL because `CreatorStore` does not exist.

**Step 2: Implement schema initialization and row mappers**

Use `better-sqlite3`, `journal_mode=WAL`, `foreign_keys=ON`, prepared statements and explicit transactions. Do not mutate legacy tables.

**Step 3: Implement core persistence methods**

Minimum methods: `syncVerticals`, `upsertCreators`, `upsertAccounts`, `commitPage`, `getCursor`, `listDueAccounts`, `recordRun`, `updateBackfill`, `listPosts`, `getPost`, and `close`.

Run: `cd server && node --test tests/creator-store.test.js tests/signal-store.test.js tests/database-service.test.js`

Expected: PASS with no legacy regression.

**Step 4: Commit**

```bash
git add server/services/creators/creator-store.js server/tests/creator-store.test.js
git diff --cached --check
git commit -m "feat: add creator intelligence store"
```

## Task 2: Define verticals, verified creator seeds, and import review

**Files:**

- Create: `server/config/creatorVerticals.js`
- Create: `server/config/creatorSeeds.example.json`
- Create: `server/services/creators/creator-catalog.js`
- Create: `server/tests/creator-catalog.test.js`
- Modify: `.gitignore`
- Modify: `server/.env.example`

**Step 1: Write failing catalog validation tests**

Require stable external account ID, canonical profile URL, platform, region, one or more vertical IDs, source tier, verification timestamp and review status. Reject nickname-only entries, duplicate platform IDs, unknown verticals, private profiles and unreviewed entries marked enabled.

Run: `cd server && node --test tests/creator-catalog.test.js`

Expected: FAIL.

**Step 2: Implement four versioned vertical definitions**

Add `beauty`, `fashion`, `ai-tech`, and `entertainment` with positive/negative keywords, content types, audience intents and version `vertical-v1`.

**Step 3: Implement seed import and candidate review**

Load an operator-owned JSON path from `AYA_CREATOR_SEEDS_PATH`; keep the actual private/working watchlist ignored. Commit only a schema-valid example. Imported candidates remain disabled until `verified`.

**Step 4: Seed the first public-source canary set**

Add a reviewed example set containing at least two test accounts per vertical across public YouTube/RSS/Bluesky/Mastodon/GitHub sources. Do not guess IDs from display names; verify each stable ID and profile URL before setting `verified`.

Run: `cd server && node --test tests/creator-catalog.test.js`

Expected: PASS.

**Step 5: Commit**

```bash
git add .gitignore server/.env.example server/config/creatorVerticals.js server/config/creatorSeeds.example.json server/services/creators/creator-catalog.js server/tests/creator-catalog.test.js
git commit -m "feat: add verified creator watchlists"
```

## Task 3: Freeze the connector and normalized post contracts

**Files:**

- Create: `server/services/creators/creator-normalizer.js`
- Create: `server/services/creators/connectors/connector-utils.js`
- Create: `server/tests/creator-normalizer.test.js`

**Step 1: Write failing normalization tests**

Test valid post, malformed URL, future timestamp tolerance, stable IDs, null metrics, edit/delete tombstones, shared-post attribution, carousel/thread content, untrusted raw fields and cursor opacity.

Run: `cd server && node --test tests/creator-normalizer.test.js`

Expected: FAIL.

**Step 2: Implement a strict page contract**

Every connector returns `{ account, posts, nextCursor, exhausted, rateLimit, collectedAt }`; every post maps to the `CreatorPost` and `MetricSnapshot` fields in the specification. Strip headers, cookies and tokens from raw metadata.

**Step 3: Add deterministic identity helpers**

Create account/post IDs from normalized platform plus stable external IDs. Canonicalize URLs without deleting identifiers needed to open the original content.

Run: `cd server && node --test tests/creator-normalizer.test.js`

Expected: PASS.

**Step 4: Commit**

```bash
git add server/services/creators/creator-normalizer.js server/services/creators/connectors/connector-utils.js server/tests/creator-normalizer.test.js
git commit -m "feat: define creator connector contracts"
```

## Task 4: Implement the high-reliability public connector spine

**Files:**

- Create: `server/services/creators/connectors/youtube-feed-connector.js`
- Create: `server/services/creators/connectors/bluesky-connector.js`
- Create: `server/services/creators/connectors/mastodon-account-connector.js`
- Create: `server/services/creators/connectors/github-creator-connector.js`
- Create: `server/services/creators/connectors/rss-creator-connector.js`
- Create: `server/services/creators/youtube-websub-service.js`
- Create: `server/routes/youtube-websub.js`
- Create: `server/tests/creator-public-connectors.test.js`
- Create: `server/tests/youtube-websub.test.js`
- Modify: `server/config/schedules.js`
- Modify: `server/index.js`

**Step 1: Write fixture-based failing tests**

For each connector test pagination/cursor, author identity, publish time, edit handling, URL, null metrics, retry-after parsing, timeout and zero-result success. Network is forbidden in unit tests.

Run: `cd server && node --test tests/creator-public-connectors.test.js`

Expected: FAIL.

**Step 2: Implement YouTube channel Atom and upload history adapter**

Atom supplies current videos without a key; when `YOUTUBE_API_KEY` exists, resolve the channel uploads playlist and paginate `playlistItems` for history. Statistics are a separate enrichment call so missing quota does not lose the post.

**Step 3: Implement Bluesky, Mastodon, GitHub and RSS**

- Bluesky: `app.bsky.feed.getAuthorFeed`, cursor, no authentication for public feeds;
- Mastodon: resolve account on the configured instance, then paginate account statuses;
- GitHub: watched users/organizations repositories, releases and public events with ETag;
- RSS/Atom: per-account feed URLs with GUID/link identity and conditional requests.

**Step 4: Write failing YouTube WebSub tests**

Cover hub GET challenge, exact topic/channel matching, unknown channel rejection, POST raw Atom parsing, valid and invalid `X-Hub-Signature-256`, legacy signature compatibility only when explicitly enabled, duplicate callback idempotency, callback received during history backfill, lease persistence and renewal scheduling.

Run: `cd server && node --test tests/youtube-websub.test.js`

Expected: FAIL.

**Step 5: Implement and mount YouTube WebSub**

Expose `GET/POST /api/ingest/v1/youtube/websub`. Mount an `express.raw` parser for Atom/XML before generic error handling, validate topics against verified YouTube channel IDs, use constant-time signature comparison and persist lease/secret references without returning them. Schedule renewal before lease expiry. Callback upserts use `(channel_id, video_id, updated_at)` idempotency; Atom/Data API polling remains the reconciliation path.

Run: `cd server && node --test tests/creator-public-connectors.test.js tests/youtube-websub.test.js tests/signal-adapters.test.js tests/schedule.test.js tests/server-lifecycle.test.js`

Expected: PASS.

**Step 6: Review the staged patch and commit**

```bash
git add server/services/creators/connectors/youtube-feed-connector.js server/services/creators/connectors/bluesky-connector.js server/services/creators/connectors/mastodon-account-connector.js server/services/creators/connectors/github-creator-connector.js server/services/creators/connectors/rss-creator-connector.js server/services/creators/youtube-websub-service.js server/routes/youtube-websub.js server/tests/creator-public-connectors.test.js server/tests/youtube-websub.test.js server/config/schedules.js server/index.js
git diff --cached --check
git commit -m "feat: add public creator connectors"
```

## Task 5: Add authenticated official connectors without false availability

**Files:**

- Create: `server/services/creators/connectors/reddit-connector.js`
- Create: `server/services/creators/connectors/x-connector.js`
- Create: `server/services/creators/connectors/instagram-connector.js`
- Create: `server/services/creators/connectors/douyin-authorized-connector.js`
- Create: `server/services/creators/creator-source-registry.js`
- Create: `server/tests/creator-official-connectors.test.js`
- Modify: `server/.env.example`

**Step 1: Write failing configuration-boundary tests**

Assert missing credentials produce `unconfigured` and zero network calls. Validate OAuth/token refresh failures become `auth_expired`, 429 becomes `rate_limited`, permission errors become `permission_missing`, and prior success timestamps remain visible.

Run: `cd server && node --test tests/creator-official-connectors.test.js`

Expected: FAIL.

**Step 2: Implement supported official paths**

- Reddit OAuth: `/user/{username}/submitted` with `after` cursor;
- X API: user timeline and optional filtered-stream enrollment, strictly BYO credentials/quota;
- Instagram Graph API: Business Discovery for eligible Business/Creator accounts only;
- Douyin `video.list`: only for the account that granted authorization.

TikTok Research API remains a capability record unless the deployment proves research eligibility. It must not be shown as a general commercial connector.

Run: `cd server && node --test tests/creator-official-connectors.test.js`

Expected: PASS.

**Step 3: Commit**

```bash
git add server/.env.example server/services/creators/connectors/reddit-connector.js server/services/creators/connectors/x-connector.js server/services/creators/connectors/instagram-connector.js server/services/creators/connectors/douyin-authorized-connector.js server/services/creators/creator-source-registry.js server/tests/creator-official-connectors.test.js
git diff --cached --check
git commit -m "feat: add gated official creator connectors"
```

## Task 6: Implement a signed Sidecar ingestion boundary for closed platforms

**Files:**

- Create: `server/services/creators/bridge-verifier.js`
- Create: `server/routes/creator-ingest.js`
- Create: `server/tests/creator-bridge.test.js`
- Modify: `server/services/creators/creator-source-registry.js`
- Modify: `server/services/creators/creator-store.js`
- Modify: `server/index.js`
- Modify: `server/.env.example`

**Step 1: Write failing signature and replay tests**

Cover valid HMAC, wrong signature, constant-time compare path, unknown source ID, timestamp older than five minutes, duplicate/concurrent nonce, invalid body hash, equivalent JSON with different whitespace/key order, oversized batch, schema error, private/deleted payload, source writing an unbound platform/account, route-parser ordering and secret redaction. Assert invalid HMAC/schema writes no payload; a valid batch persists one `creator_bridge_payloads` row and post links only after post/run commit; persisted JSON is reconstructed from an allowlist and contains no headers, Cookie, Authorization, token, secret, signature or unknown raw field.

Run: `cd server && node --test tests/creator-bridge.test.js`

Expected: FAIL.

**Step 2: Bind every Sidecar source to an allowlist**

Extend the source registry so each `source_id` owns an explicit set of platforms and verified `external_account_id` values. Unknown or candidate-only accounts are rejected before persistence. Updating this allowlist is an authenticated operator action, not a field accepted from the Sidecar payload.

**Step 3: Implement `POST /api/ingest/v1/creator-bridge` before JSON parsing**

In `server/index.js`, mount this route before the existing global `express.json()` middleware with `express.raw({ type: 'application/json', limit: '2mb' })`. Hash the exact Buffer bytes, verify `x-aya-source-id`, timestamp, nonce and `HMAC(timestamp + '.' + nonce + '.' + sha256(rawBody))` using `crypto.timingSafeEqual`, and only then decode JSON. Atomically reserve the nonce, create the run, persist posts, store an allowlisted `creator_bridge_payloads` record and link its posts; any failure rolls back all rows and a concurrent replay must lose. Return accepted/updated/rejected counts and next expected cursor.

**Step 4: Document but do not embed Sidecars**

Define adapters for self-hosted RSSHub/NewsNow and operator-run MediaCrawler/xiaohongshu-mcp/Douyin parsers. Main server never launches a browser, stores Cookie values or claims these platforms are online before signed canary data arrives.

Run: `cd server && node --test tests/creator-bridge.test.js tests/server-lifecycle.test.js`

Expected: PASS.

**Step 5: Review the staged patch and commit**

```bash
git add server/.env.example server/index.js server/routes/creator-ingest.js server/services/creators/bridge-verifier.js server/services/creators/creator-source-registry.js server/services/creators/creator-store.js server/tests/creator-bridge.test.js
git diff --cached --check
git commit -m "feat: add signed creator sidecar ingestion"
```

## Task 7: Add incremental scheduling, resumable history backfill and reconciliation

**Files:**

- Create: `server/services/creators/creator-collector.js`
- Create: `server/services/creators/backfill-service.js`
- Create: `server/services/creators/creator-service.js`
- Create: `server/tests/creator-collector.test.js`
- Create: `server/tests/creator-backfill.test.js`
- Modify: `server/config/schedules.js`
- Modify: `server/index.js`

**Step 1: Write failing orchestration tests**

Test concurrency limits, account-level locks, single-source failure isolation, transaction-bound cursor advancement, rate budget pause, process restart resume, incremental priority over backfill, `partial/blocked` reasons and no new-post events from historical pages.

Run: `cd server && node --test tests/creator-collector.test.js tests/creator-backfill.test.js`

Expected: FAIL.

**Step 2: Implement separate realtime and backfill queues**

Use an in-process bounded scheduler backed by durable `creator_backfills` rows. Default incremental interval is platform-specific; backfill consumes remaining request budget and persists every page.

**Step 3: Implement two-pass completion**

After cursor exhaustion, restart from latest, reconcile new/edited posts, sample original URLs, then mark `complete`. API history limits mark `partial`; auth/risk-control failures mark `blocked`.

**Step 4: Add daily reconciliation and metric refresh scheduling**

Recent 100 posts per account receive edit/delete/metric checks. Support `AYA_DISABLE_CREATOR_SCHEDULER=1` in tests. Mount `/api/creators/v1` only after the Creator Service has initialized; the Task 6 raw Bridge route is already mounted before JSON parsing and receives the initialized store/registry directly.

Run: `cd server && node --test tests/creator-collector.test.js tests/creator-backfill.test.js tests/schedule.test.js tests/server-lifecycle.test.js`

Expected: PASS.

**Step 5: Commit**

```bash
git add server/config/schedules.js server/index.js server/services/creators/creator-collector.js server/services/creators/backfill-service.js server/services/creators/creator-service.js server/tests/creator-collector.test.js server/tests/creator-backfill.test.js
git diff --cached --check
git commit -m "feat: add resumable creator acquisition"
```

## Task 8: Persist metric trajectories and compute creator-relative hotness

**Files:**

- Create: `server/services/creators/creator-hotness.js`
- Create: `server/tests/creator-hotness.test.js`
- Modify: `server/services/creators/creator-store.js`

**Step 1: Write failing pure-engine tests**

Cover 15/60/180-minute velocity, acceleration, same-platform/vertical/age percentiles, 30-day creator median, small-creator fairness, missing metrics, advertisements, reshares, old-post replay and formula component sum.

Run: `cd server && node --test tests/creator-hotness.test.js`

Expected: FAIL.

**Step 2: Implement `creator-hotness-v1`**

Persist every normalized input, percentile, penalty and final score. Unknown values remain `null`; a score with insufficient evidence is marked low confidence.

**Step 3: Implement snapshot retention**

Keep fine-grained snapshots for 72 hours, compact older snapshots to daily values and preserve formula-reproduction inputs.

Run: `cd server && node --test tests/creator-hotness.test.js tests/creator-store.test.js`

Expected: PASS.

**Step 4: Commit**

```bash
git add server/services/creators/creator-hotness.js server/services/creators/creator-store.js server/tests/creator-hotness.test.js
git commit -m "feat: score creator post momentum"
```

## Task 9: Classify verticals and detect multi-creator/cross-platform topics

**Files:**

- Create: `server/services/creators/vertical-classifier.js`
- Create: `server/services/creators/creator-topic-engine.js`
- Create: `server/tests/vertical-classifier.test.js`
- Create: `server/tests/creator-topic-engine.test.js`

**Step 1: Write failing classification tests**

Include ambiguous words such as “皮肤” in games versus skincare, celebrity fashion versus unrelated gossip, AI product versus generic technology, multilingual titles and creator seed priors that must not override contradictory post evidence.

Run: `cd server && node --test tests/vertical-classifier.test.js`

Expected: FAIL.

**Step 2: Implement rules-first, model-optional classification**

Return score, version and reasons. Model enrichment is optional and cached; rules remain the deterministic fallback.

**Step 3: Write failing topic-diffusion tests**

Distinguish one viral creator, three independent creators, one creator cross-posting, syndication networks and two-platform/three-creator spread. Require evidence URLs for every counted adoption.

Run: `cd server && node --test tests/creator-topic-engine.test.js`

Expected: FAIL.

**Step 4: Implement creator topic clustering**

Reuse safe URL/entity/token helpers from Signal Topics where appropriate, but store Creator Topics separately. Persist canonical creator count, platform count, first adopter, follower sequence, evidence and snapshot version.

Run: `cd server && node --test tests/vertical-classifier.test.js tests/creator-topic-engine.test.js tests/topic-engine.test.js`

Expected: PASS.

**Step 5: Commit**

```bash
git add server/services/creators/vertical-classifier.js server/services/creators/creator-topic-engine.js server/tests/vertical-classifier.test.js server/tests/creator-topic-engine.test.js
git commit -m "feat: detect cross-creator content trends"
```

## Task 10: Generate evidence-backed content ideas by vertical and creator profile

**Files:**

- Create: `server/services/creators/content-idea-engine.js`
- Create: `server/tests/content-idea-engine.test.js`
- Modify: `server/services/ContentService.js`

**Step 1: Write failing idea-quality tests**

For all four verticals and the existing `short-video`, `tool-review`, `news-commentary`, `deep-dive`, and `general` profiles, require a specific subject, why-now evidence, target audience, format, hook, outline, source links, uncertainty and disclosure risk. Reject generic humanities questions and single-source claims presented as trends. Add regression fixtures proving the existing Signal API, old frontend request and AyaNewsSkill `tool-review` value remain accepted; do not introduce a `review` alias.

Run: `cd server && node --test tests/content-idea-engine.test.js`

Expected: FAIL.

**Step 2: Implement deterministic idea framing**

Build ideas from Creator Topics and posts, not random prompt text. If an LLM is configured it may improve phrasing, but identifiers, evidence, score and risk remain server-calculated.

**Step 3: Connect research evidence packs**

Allow `ContentService` to load a Creator Topic by ID and return original creator posts plus source boundaries without weakening existing Signal Topic support.

Run: `cd server && node --test tests/content-idea-engine.test.js tests/content-service.test.js tests/content-routes.test.js`

Expected: PASS.

**Step 4: Commit**

```bash
git add server/services/ContentService.js server/services/creators/content-idea-engine.js server/tests/content-idea-engine.test.js
git commit -m "feat: create vertical creator topic ideas"
```

## Task 11: Expose cursor APIs, FTS5 search and administrative coverage status

**Files:**

- Create: `server/routes/creators.js`
- Create: `server/scripts/benchmark-creator-query.js`
- Create: `server/tests/creator-routes.test.js`
- Modify: `server/services/creators/creator-store.js`
- Modify: `server/index.js`

**Step 1: Write failing route tests**

Cover all public and admin endpoints in the specification; `q` length/Unicode/quotes/operators; bound-parameter FTS injection attempts; query-hash cursor mismatch; `(published_at,id)` and `(bm25,published_at,id)` keyset pagination; append-only changes seq; expired cursor 410/resync; 404s; maximum limits; admin auth; account backfill fields; and evidence redaction.

Run: `cd server && node --test tests/creator-routes.test.js`

Expected: FAIL.

**Step 2: Add FTS5 and keyset pagination**

Create `creator_posts_fts` over the allowed title/text fields and update/delete it in the same transaction as `creator_posts`. With no `q`, use `(published_at DESC, id DESC)`; with `q`, use `(bm25 ASC, published_at DESC, id DESC)`. Encode the normalized query/filter hash and last sort tuple in the opaque cursor. Bind all FTS input parameters; do not concatenate user syntax into SQL and do not use unbounded offset pagination.

**Step 3: Implement `/api/creators/v1` routes**

Expose verticals, creators, creator posts, posts with `q`, hot items, topics with `q`, sources, changes, refresh, import and backfill status. Every response carries `generatedAt`, coverage, formula version and evidence boundary. `creator_events.seq INTEGER PRIMARY KEY AUTOINCREMENT` is the monotonic changes cursor; event/change and outbox rows are inserted in the same state-change transaction. `/changes` returns ascending seq plus oldest/latest/next cursor, and returns HTTP 410 with a filtered resync URL when `since` is older than the 30-day retained minimum.

Run: `cd server && node --test tests/creator-routes.test.js tests/public-routes.test.js tests/admin-auth.test.js`

Expected: PASS.

**Step 4: Add a 100k-row query benchmark fixture**

Run: `cd server && node scripts/benchmark-creator-query.js`

Expected: common local queries p95 below 300 ms on the documented test machine.

**Step 5: Commit**

```bash
git add server/index.js server/routes/creators.js server/services/creators/creator-store.js server/tests/creator-routes.test.js server/scripts/benchmark-creator-query.js
git diff --cached --check
git commit -m "feat: expose searchable creator intelligence api"
```

## Task 12: Add persistent subscriptions and a durable delivery outbox

**Files:**

- Create: `server/services/creators/subscription-service.js`
- Create: `server/services/creators/creator-event-detector.js`
- Create: `server/services/creators/outbox-worker.js`
- Create: `server/tests/creator-subscriptions.test.js`
- Create: `server/tests/creator-state-change.test.js`
- Create: `server/tests/creator-outbox.test.js`
- Modify: `server/routes/creators.js`
- Modify: `server/services/creators/creator-store.js`
- Modify: `server/services/creators/creator-collector.js`
- Modify: `server/services/creators/creator-hotness.js`
- Modify: `server/services/creators/creator-topic-engine.js`

**Step 1: Write failing subscription tests**

Cover filters by vertical/platform/creator/event/minimum score, quiet hours, immediate/digest mode, endpoint ownership and disabled rules.

Run: `cd server && node --test tests/creator-subscriptions.test.js`

Expected: FAIL.

**Step 2: Write failing outbox tests**

Cover event detection only on first threshold crossing, dedupe key `(event_id, subscription_id, endpoint_id)`, crash after send before acknowledgment, 2xx success, `Retry-After`, exponential backoff, dead letter and manual replay.

Run: `cd server && node --test tests/creator-outbox.test.js`

Expected: FAIL.

**Step 3: Write failing atomic state-change tests**

Cover post insertion, score threshold crossing, Topic multi-creator crossing, unchanged-state retry, producer retry after timeout, failure after state write but before event, failure after event but before outbox, and duplicate subscription matches. Assert state/event/outbox all commit or all roll back, and stable transition keys prevent duplicate events.

Run: `cd server && node --test tests/creator-state-change.test.js`

Expected: FAIL.

**Step 4: Implement the single producer transaction boundary**

Add `CreatorStore.applyCreatorStateChange({ producer, entityType, entityId, stateVersion, applyState, detectEvents })`. Inside one `better-sqlite3` transaction it reads prior state, executes the producer state mutation, passes before/after to the pure `creator-event-detector`, inserts unique `creator_events`, resolves matching subscriptions and inserts idempotent outbox rows. Any error rolls back everything.

Modify `creator-collector`, `creator-hotness` and `creator-topic-engine` so every notification-capable state change uses this method; direct writes are allowed only for explicitly non-event historical backfill data.

**Step 5: Implement persistence-first notifications**

The unified state-change transaction writes state/event/outbox only; network delivery happens afterward. Restarts resume pending rows and never drop an event merely because a transport failed.

Run: `cd server && node --test tests/creator-subscriptions.test.js tests/creator-state-change.test.js tests/creator-outbox.test.js tests/creator-collector.test.js tests/creator-hotness.test.js tests/creator-topic-engine.test.js`

Expected: PASS.

**Step 6: Commit**

```bash
git add server/routes/creators.js server/services/creators/subscription-service.js server/services/creators/creator-event-detector.js server/services/creators/outbox-worker.js server/services/creators/creator-store.js server/services/creators/creator-collector.js server/services/creators/creator-hotness.js server/services/creators/creator-topic-engine.js server/tests/creator-subscriptions.test.js server/tests/creator-state-change.test.js server/tests/creator-outbox.test.js
git diff --cached --check
git commit -m "feat: persist creator alerts and delivery queue"
```

## Task 13: Implement signed Webhook, in-app realtime and optional message transports

**Files:**

- Create: `server/services/creators/transports/webhook-transport.js`
- Create: `server/services/creators/transports/socket-transport.js`
- Create: `server/services/creators/transports/email-transport.js`
- Create: `server/services/creators/transports/generic-message-transport.js`
- Create: `server/routes/creator-stream.js`
- Create: `server/tests/creator-transports.test.js`
- Create: `server/tests/creator-stream.test.js`
- Create: `server/tests/nginx-creator-stream.test.js`
- Modify: `server/index.js`
- Modify: `server/.env.example`
- Modify: `nginx/nginx.conf`

**Step 1: Write failing transport tests**

Assert Webhook signature, timestamp/event ID headers, timeout, response-size cap, secret redaction and disabled optional channel behavior. For SSRF, cover HTTP/non-HTTPS schemes, userinfo, forbidden port, IPv4/IPv6 literals, loopback/private/link-local/ULA/multicast/reserved/metadata addresses, DNS resolving to a forbidden address, DNS rebinding between retry attempts, redirects to public/private targets and a valid public HTTPS hostname.

Run: `cd server && node --test tests/creator-transports.test.js`

Expected: FAIL.

**Step 2: Write failing SSE recovery tests**

Cover `Last-Event-ID` and `since`, persisted replay before live delivery, monotonic `id: seq`, filter isolation, 15-second heartbeat, no gap across reconnect, slow-client close/recovery and HTTP 410 with filtered resync URL when the cursor expired.

Run: `cd server && node --test tests/creator-stream.test.js`

Expected: FAIL.

**Step 3: Implement first-party transports and persistent SSE**

Ship signed generic Webhook and authenticated in-app SSE/Socket.IO first. The Webhook transport permits only HTTPS on port 443 or an operator allowlist, disables redirects, resolves DNS for every connection/retry, rejects all non-public IPv4/IPv6 ranges including metadata endpoints, pins the validated IP for that connection while preserving TLS hostname validation, and caps response bytes/time/concurrency. SSE reads committed `creator_events.seq`, emits that seq as the event ID, replays ascending persisted events, then subscribes to post-commit wakeups; the database remains authoritative. Add email and configurable Feishu/WeCom/DingTalk/Telegram/ntfy/Bark adapters behind explicit environment configuration; unconfigured channels remain hidden or labelled unconfigured.

**Step 4: Preserve delivery semantics**

Only the outbox worker calls transports. Test endpoints write audited attempts. Socket reconnect uses the persisted event cursor rather than ephemeral room state.

**Step 5: Add an SSE-specific Nginx location**

Add a location for `/api/creators/v1/stream` before the generic `/api/` location with `proxy_buffering off`, `proxy_cache off`, `gzip off`, `proxy_read_timeout 1h`, HTTP/1.1 and `X-Accel-Buffering: no`. The static config test must prove the specific location precedes the generic proxy and contains all no-buffer directives.

Run: `cd server && node --test tests/creator-transports.test.js tests/creator-stream.test.js tests/nginx-creator-stream.test.js tests/server-lifecycle.test.js`

Expected: PASS.

**Step 6: Validate the proxy and commit**

Run a real Nginx syntax check with the repository's documented local/Docker validation method, then start the server behind Nginx and prove an SSE event survives at least one heartbeat and reconnects from its last ID without duplication.

```bash
git add server/.env.example server/index.js server/routes/creator-stream.js server/services/creators/transports/webhook-transport.js server/services/creators/transports/socket-transport.js server/services/creators/transports/email-transport.js server/services/creators/transports/generic-message-transport.js server/tests/creator-transports.test.js server/tests/creator-stream.test.js server/tests/nginx-creator-stream.test.js nginx/nginx.conf
git diff --cached --check
git commit -m "feat: deliver creator intelligence alerts"
```

## Task 14: Implement retention, preview-first cleanup, online backup and JSONL export

**Files:**

- Create: `server/services/creators/creator-maintenance.js`
- Create: `server/scripts/creator-maintenance.js`
- Create: `server/tests/creator-maintenance.test.js`
- Modify: `server/routes/creators.js`
- Modify: `server/services/creators/creator-store.js`
- Modify: `server/.env.example`

**Step 1: Write failing retention and cleanup tests**

Create time-controlled fixtures for 365-day posts, 30-day allowlisted `creator_bridge_payloads`, 72-hour fine snapshots, 180-day daily snapshots, 30-day successful deliveries, 90-day failed/dead-letter deliveries, 30-day event cursors and 90-day maintenance audit/preview retention. Assert `preview` reports the exact Bridge payload/link rows, execute deletes expired payloads plus link rows through the declared cascade but preserves posts/runs, persists an immutable single-use boundary without mutation, rejects missing/used/expired/mismatched preview tokens, writes a redacted audit row for every attempt, and removes only frozen table/time boundaries.

Run: `cd server && node --test tests/creator-maintenance.test.js`

Expected: FAIL.

**Step 2: Implement audited preview-first maintenance**

`POST /api/creators/v1/admin/maintenance/preview` persists a `creator_maintenance_previews` row and returns candidate counts, oldest/latest timestamp and a short-lived opaque token. `execute` atomically consumes that row, runs explicit SQL per table and writes `creator_maintenance_audits`; success, rejection and failure are all auditable without recording secrets. It never accepts an arbitrary table/path from the request.

**Step 3: Implement SQLite online backup and restore verification**

Use the SQLite backup API into `AYA_CREATOR_BACKUP_DIR`, restrict the resolved path to that directory, open the result read-only, run `PRAGMA integrity_check`, and test restoring it into a temporary database while collection writes continue.

**Step 4: Implement consistent JSONL export**

Export creators/accounts/posts/metrics/topics/evidence from a consistent read transaction into `AYA_CREATOR_EXPORT_DIR`, with schema version, time range and checksums. Exclude cookies, tokens, raw request headers and secret values. Test interrupted export cleanup and path traversal rejection.

Run: `cd server && node --test tests/creator-maintenance.test.js tests/creator-routes.test.js`

Expected: PASS.

**Step 5: Review the staged patch and commit**

```bash
git add server/.env.example server/routes/creators.js server/services/creators/creator-store.js server/services/creators/creator-maintenance.js server/scripts/creator-maintenance.js server/tests/creator-maintenance.test.js
git diff --cached --check
git commit -m "feat: maintain and export creator data"
```

## Task 15: Build creator, vertical, source and alert pages

**Files:**

- Create: `client/src/features/creators/creator-types.ts`
- Create: `client/src/features/creators/creator-api.ts`
- Create: `client/src/features/creators/creator-api.test.ts`
- Create: `client/src/features/creators/creator-dashboard.tsx`
- Create: `client/src/features/creators/creator-dashboard.test.tsx`
- Create: `client/src/features/creators/creator-profile.tsx`
- Create: `client/src/features/creators/vertical-dashboard.tsx`
- Create: `client/src/features/creators/source-coverage.tsx`
- Create: `client/src/features/creators/alert-manager.tsx`
- Modify: `client/src/App.tsx`
- Modify: `client/src/index.css`

**Step 1: Write failing API and interaction tests**

Cover vertical switch, 24/48/72 windows, post/topic tabs, original-link opening, formula expansion, creator profile, loading/empty/error/partial/blocked states, cursor loading, subscription creation and failed delivery visibility.

Run: `cd client && npm test -- src/features/creators`

Expected: FAIL.

**Step 2: Implement routes and states**

Add `/creators`, `/creators/:id`, `/verticals/:id`, `/alerts`, and `/sources`. Keep the existing cinematic visual system and icons, but prioritize scanability and evidence over decorative cards.

**Step 3: Add accessible realtime updates**

New events update the correct vertical without resetting filters. Announce updates politely, preserve keyboard focus and respect reduced motion.

Run: `cd client && npm test -- src/features/creators && npm run build`

Expected: PASS.

**Step 4: Commit**

```bash
git add client/src/App.tsx client/src/index.css client/src/features/creators/creator-types.ts client/src/features/creators/creator-api.ts client/src/features/creators/creator-api.test.ts client/src/features/creators/creator-dashboard.tsx client/src/features/creators/creator-dashboard.test.tsx client/src/features/creators/creator-profile.tsx client/src/features/creators/vertical-dashboard.tsx client/src/features/creators/source-coverage.tsx client/src/features/creators/alert-manager.tsx
git diff --cached --check
git commit -m "feat: add cross-vertical creator dashboards"
```

## Task 16: Publish OpenAPI, AyaNewsSkill and operator documentation

**Files:**

- Modify: `server/services/PublicDiscoveryService.js`
- Modify: `server/routes/public.js`
- Modify: `README.md`
- Modify: `QUICKSTART.md`
- Modify: `DEPLOY.md`
- Create: `docs/CREATOR_SOURCES.md`
- Create: `docs/CREATOR_SIDECAR.md`
- Create: `docs/CREATOR_ALERTS.md`
- Test: `server/tests/public-discovery-service.test.js`
- Test: `server/tests/creator-discovery.test.js`

**Step 1: Write failing discovery tests**

Require every implemented route, schema, event type, `q`/FTS cursor field, monotonic changes cursor, SSE `Last-Event-ID`/410 behavior, backfill state, WebSub verification/signature, Bridge HMAC header, retention preview/execute, backup and export operation in OpenAPI and Skill Markdown. Require unsupported platforms to say `unconfigured`, `partial` or `Sidecar required`.

Run: `cd server && node --test tests/public-discovery-service.test.js tests/creator-discovery.test.js`

Expected: FAIL.

**Step 2: Update discovery surfaces and runbooks**

Document credential setup without values, seed import, source doctor, backfill resume, Sidecar signing, push retry/dead-letter recovery, retention, backup and platform constraints.

**Step 3: Update the separate AyaNewsSkill repository**

Create `AYA_SKILL_WORKDIR=$(mktemp -d /tmp/ayanews-skill-phase4.XXXXXX)`, clone `https://github.com/MarcusDog/AyaNewsSkill.git` to `$AYA_SKILL_WORKDIR/repo`, and check out `codex/ayanews-skill-2-2`. First read its status/progress documentation. Modify only `SKILL.md`, `references/api.md`, `references/evidence-rules.md`, `references/site-deployment-contract.md`, `scripts/ainews.mjs`, `README.md`, `package.json` and the exact affected tests; run `npm test`, `node package.mjs`, `shasum -a 256 -c dist/SHA256SUMS`, then inspect `git diff --check`. Do not call a route available until server tests prove it exists, and never copy credentials or working watchlists into the Skill repository.

Run: `cd server && node --test tests/public-discovery-service.test.js tests/creator-discovery.test.js`

Expected: PASS.

**Step 4: Commit in each repository**

```bash
git add server/routes/public.js server/services/PublicDiscoveryService.js server/tests/public-discovery-service.test.js server/tests/creator-discovery.test.js README.md QUICKSTART.md DEPLOY.md docs/CREATOR_SOURCES.md docs/CREATOR_SIDECAR.md docs/CREATOR_ALERTS.md
git diff --cached --check
git commit -m "docs: publish creator intelligence api"

cd "$AYA_SKILL_WORKDIR/repo"
git add SKILL.md references/api.md references/evidence-rules.md references/site-deployment-contract.md scripts/ainews.mjs README.md package.json tests/cli.test.mjs tests/install.test.mjs tests/package.test.mjs dist/AyaNewsSkill.tar.gz dist/AyaNewsSkill.zip dist/SHA256SUMS
git diff --cached --check
git commit -m "feat: add creator intelligence api"
```

Do not push the Skill branch yet; Task 17 pushes both repositories only after the integrated canary and package verification passes.

## Task 17: Run real-source canaries, full verification and GitHub update

**Files:**

- Create: `server/scripts/canary-creator-sources.js`
- Create: `docs/verification/2026-08-28-creator-intelligence-verification.md`
- Modify: `PROJECT_REBUILD_STATUS.md`

**Step 1: Read status and protect user changes**

Run: `tail -n 200 PROJECT_REBUILD_STATUS.md && git status --short && git diff --check`

Expected: only known Phase 4 changes; no secret, Cookie, database or unrelated user file staged. If the status file has an overlapping pre-existing owner diff, stage only an exact reviewed patch hunk or omit it from this commit and record the uncommitted Phase 4 status update in the verification report.

**Step 2: Run all automated checks**

Run:

```bash
cd server && npm test
cd ../client && npm test && npm run build && npm audit --omit=dev
cd .. && git diff --check
```

Expected: every test and build passes; production audit has no unresolved high/critical issue.

**Step 3: Run public-source canaries into a temporary database**

Use a temporary SQLite path and verified seed accounts. For every configured connector record received/saved/duplicate counts, oldest/latest post, pagination state, source latency, original URL sample and truthful zero/blocked/partial reason.

Expected: public L1 spine returns real posts with openable source URLs. Optional credential/Sidecar sources remain `unconfigured` unless the operator has supplied valid access.

**Step 4: Validate history and push correctness**

- Complete at least one multi-page backfill and restart/resume test;
- compare 100 sampled records against original platform pages;
- replay the same page without duplicates;
- simulate three-creator same-topic, two-platform spread and one-creator cross-post;
- verify YouTube WebSub challenge, signed callback, duplicate callback and lease renewal canary;
- verify Webhook signature, retry, process restart and dead-letter replay;
- expire a changes cursor and verify 410/resync, then reconnect SSE from the latest retained seq without a gap;
- create an online backup during writes, restore it, verify integrity, export JSONL and run preview-first cleanup without deleting outside the frozen range;
- benchmark 100k local posts.

**Step 5: Run browser QA**

Test desktop and 390×844 mobile for every new page, four verticals, time windows, original evidence, partial/blocked sources, subscription creation and research handoff. Confirm no console errors or horizontal overflow.

**Step 6: Update completion status without overclaiming**

Mark only proven sources and slices complete. List every platform still waiting for key, approval, account authorization or Sidecar login. Include exact test counts, canary time and limitation evidence.

**Step 7: Commit and push the existing PR branches**

```bash
git add server/scripts/canary-creator-sources.js docs/verification/2026-08-28-creator-intelligence-verification.md
git diff --cached --name-status
git diff --cached --check
git commit -m "test: verify creator intelligence platform"
git push Ainews codex/aya-creator-intelligence-radar

cd "$AYA_SKILL_WORKDIR/repo"
git status --short
git diff --cached --name-status
git diff --check
git push origin codex/ayanews-skill-2-2
git rev-parse HEAD
git ls-remote origin refs/heads/codex/ayanews-skill-2-2

cd /Users/li/Public/website/website/Ainews
git rev-parse HEAD
git ls-remote Ainews refs/heads/codex/aya-creator-intelligence-radar
```

The local and remote SHA printed for each repository must match before updating AiNews PR #1 and AyaNewsSkill PR #1 with verification results. `PROJECT_REBUILD_STATUS.md` is intentionally not included in the default `git add`: if it overlapped the pre-task dirty state, prepare and inspect an exact Phase 4 patch/hunk, stage only that hunk, and commit/push it separately; otherwise leave it uncommitted and record why in the verification report. Do not merge or deploy unless separately authorized.

---

## Required operator inputs, not implementation blockers

Slice A can begin with public YouTube Atom, Bluesky, Mastodon, GitHub and RSS accounts before any credential is supplied. The following capabilities become active only when the operator supplies access outside Git:

- YouTube statistics/history quota: `YOUTUBE_API_KEY`;
- Reddit user feeds: OAuth client credentials;
- X creator timelines/stream: paid X API bearer/token and budget;
- Instagram Business Discovery: Meta app, permissions and professional account token;
- Douyin authorized-account videos: approved app and creator authorization;
- Xiaohongshu/arbitrary Douyin/Weibo/Bilibili deep history: separately operated Sidecar login and HMAC secret;
- email/message channels: transport-specific secret references.

Missing access is a visible source state, not a reason to invent data or block the public-source implementation.

## Final acceptance gates

1. Every enabled watchlist account has a stable platform ID, verified profile URL, vertical evidence, backfill state and latest-success evidence.
2. `complete` means cursor exhaustion plus reconciliation; inaccessible history is `partial` or `blocked` with a reason.
3. Each stored post opens its original public URL; unknown metrics are `null`; repeated acquisition is idempotent.
4. Viral scoring is reproducible from stored snapshots and a creator-relative baseline.
5. Single-creator viral, multi-creator adoption and cross-platform spread are never conflated.
6. Content ideas contain a real current subject, original evidence, why-now explanation, platform/audience fit and risk boundary.
7. Notifications survive process restart, retry correctly and do not send the same event twice to one endpoint.
8. Source pages distinguish supported, configured, online, partial, blocked and auth-expired states.
9. 100k-post local query p95 is below 300 ms and SQLite backup/JSONL export works.
10. Existing News, Signal, Topic, research, Skill and user-data tests remain green.
