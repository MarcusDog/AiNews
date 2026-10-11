# AyaNews Open Agent Platform Completion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace every planned AyaNewsSkill capability with a tested, discoverable implementation for event tracking, incremental updates, realtime delivery, Webhooks, MCP, and A2A.

**Architecture:** Keep the existing read-only Content API as the source of truth. Add deterministic event clustering and an opaque database cursor for change retrieval; publish the same update contract through REST, SSE, Webhooks, MCP tools, and an A2A v1.0 agent. Use the official MCP and A2A JavaScript SDKs for wire compatibility, while keeping news research and citation enforcement inside existing AyaNews services.

**Tech Stack:** Node.js 20+, Express, SQLite/better-sqlite3, official `@modelcontextprotocol/*` v2 SDK, official `@a2a-js/sdk` v1 SDK, React 18, Jest/node:test.

---

### Task 1: Incremental update cursor and event clusters

**Files:**
- Create: `server/utils/update-cursor.js`
- Create: `server/services/UpdateFeedService.js`
- Create: `server/services/EventClusterService.js`
- Modify: `server/services/DatabaseService.js`
- Test: `server/tests/update-feed-service.test.js`
- Test: `server/tests/event-cluster-service.test.js`

- [ ] Write failing tests for valid/invalid cursor decoding, stable ordering across identical timestamps, bootstrap pagination, and created-versus-updated records.
- [ ] Run `/usr/local/bin/node --test tests/update-feed-service.test.js` and confirm missing-module failures.
- [ ] Implement a base64url cursor `{v,t,id}` and a database query ordered by `updated_at, id`, returning `items`, `nextCursor`, and `hasMore` without duplicating URLs.
- [ ] Write failing tests showing that related articles cluster only when they share a concrete topic signal, retain all original URLs, and expose `firstSeen`, `lastSeen`, `version`, `articleCount`, and `whatChanged`.
- [ ] Implement deterministic clustering over the recent 1–30 day window using the existing keyword extractor plus conservative normalized title tokens.
- [ ] Run both targeted test files and keep them green.

### Task 2: Public REST and SSE update interfaces

**Files:**
- Create: `server/services/IntegrationEventBus.js`
- Create: `server/routes/integrations.js`
- Modify: `server/services/NewsService.js`
- Modify: `server/index.js`
- Modify: `server/routes/content.js`
- Test: `server/tests/integration-routes.test.js`

- [ ] Write failing route tests for `/api/content/v1/events`, `/updates`, `/stream`, and `/integration-status`, including malformed cursors and SSE heartbeat/event framing.
- [ ] Run the targeted test and confirm 404 or missing-module failures.
- [ ] Implement REST routes with bounded inputs and `Cache-Control`; connect `NewsService.broadcastNewsUpdate` to an in-process event bus.
- [ ] Implement resumable SSE using the update cursor from `Last-Event-ID` or `cursor`, send an initial snapshot, heartbeat comments, and update notices that point back to `/updates`.
- [ ] Run the targeted route tests and existing content-route tests.

### Task 3: Signed Webhook subscriptions and delivery

**Files:**
- Create: `server/services/WebhookService.js`
- Create: `server/utils/public-callback-url.js`
- Modify: `server/services/DatabaseService.js`
- Modify: `server/routes/integrations.js`
- Modify: `server/services/NewsService.js`
- Test: `server/tests/webhook-service.test.js`
- Test: `server/tests/integration-routes.test.js`

- [ ] Write failing tests that reject HTTP/private/loopback callback destinations, require a challenge echo, return one-time signing and management secrets, and verify HMAC signatures.
- [ ] Write failing tests for bounded retries, delivery logs, cursor advancement only after 2xx, authenticated inspection/deletion, and failure suspension.
- [ ] Run tests and confirm the service/routes do not exist.
- [ ] Add SQLite tables for subscriptions and delivery attempts, plus focused repository methods.
- [ ] Implement HTTPS callback validation with DNS resolution, challenge verification, HMAC-SHA256 headers, three bounded retries, delivery history, and automatic suspension after repeated failures.
- [ ] Trigger non-blocking deliveries from the integration event bus after successful news updates.
- [ ] Run Webhook and integration route tests.

### Task 4: Official MCP Streamable HTTP server

**Files:**
- Modify: `server/package.json`
- Modify: `server/package-lock.json`
- Create: `server/services/McpRuntime.mjs`
- Create: `server/routes/mcp.js`
- Modify: `server/index.js`
- Test: `server/tests/mcp-integration.test.mjs`

- [ ] Install official MCP v2 server/node/client packages and Zod v4.
- [ ] Write an official-client integration test that initializes against `/mcp`, lists tools, and calls `ayanews_latest` and `ayanews_updates`.
- [ ] Run it and confirm the endpoint is missing.
- [ ] Implement one stateless Streamable HTTP endpoint with Origin/Host checks and tools for latest, search, trends, events, updates, brief, and source health.
- [ ] Return MCP content blocks plus structured content that always retains original URLs and evidence boundaries.
- [ ] Re-run the official-client integration test and protocol error tests.

### Task 5: Official A2A v1.0 research agent

**Files:**
- Modify: `server/package.json`
- Modify: `server/package-lock.json`
- Create: `server/services/A2aResearchService.js`
- Create: `server/services/A2aRuntime.mjs`
- Create: `server/routes/a2a.js`
- Modify: `server/index.js`
- Test: `server/tests/a2a-integration.test.mjs`

- [ ] Install the official `@a2a-js/sdk` v1 package.
- [ ] Write an official-client test that discovers `/.well-known/agent-card.json`, negotiates A2A 1.0, sends a message, and receives a cited direct response.
- [ ] Run it and confirm discovery fails.
- [ ] Implement an A2A v1.0 Agent Card with accurate JSON-RPC and HTTP+JSON interfaces, skills, input/output modes, and only actually supported capabilities.
- [ ] Implement the executor: use the citation-audited MiniMax agent when configured; otherwise return a deterministic cited search/latest answer so the open interface remains usable.
- [ ] Mount official Agent Card, JSON-RPC, and REST handlers; add caching and version validation.
- [ ] Re-run the official-client tests and direct HTTP contract tests.

### Task 6: OpenAPI, machine discovery, Nginx, and Skill package

**Files:**
- Modify: `server/services/PublicDiscoveryService.js`
- Modify: `server/routes/public.js`
- Modify: `nginx/nginx.conf`
- Modify: `skills/aya-news-skill/SKILL.md`
- Modify: `skills/aya-news-skill/references/api.md`
- Modify: `skills/aya-news-skill/scripts/ainews.mjs`
- Modify: `skills/aya-news-skill/package.json`
- Test: `server/tests/public-discovery-service.test.js`
- Test: `server/tests/public-routes.test.js`
- Test: `skills/aya-news-skill/tests/cli.test.mjs`

- [ ] Extend failing tests to require all REST/SSE/Webhook/MCP/A2A discovery paths and no remaining “not live” claims.
- [ ] Add OpenAPI operations and webhook callback schemas; add `/.well-known/agent-card.json`, `/mcp`, and A2A exact Nginx proxy routes.
- [ ] Update `/skill.md` and downloadable Skill rules with working `events`, `updates`, and integration discovery commands.
- [ ] Extend the CLI with `events`, `updates`, and `integration-status`; rebuild ZIP/TAR and verify checksums.
- [ ] Run all public discovery and Skill tests.

### Task 7: AyaNewsSkill page operational completion

**Files:**
- Modify: `client/src/utils/skillHub.js`
- Modify: `client/src/utils/skillHub.test.js`
- Modify: `client/src/config/api.js`
- Modify: `client/src/pages/SkillPage.js`

- [ ] Write failing tests requiring every integration catalog item to be `live` or `configuration_required`, with real endpoints and snippets.
- [ ] Replace the roadmap section with an Integration Operations section showing REST, SSE, Webhook, MCP, and A2A state from `/integration-status`.
- [ ] Add an event/What Changed preview fed by real `/events` and `/updates` responses; retain the current editorial evidence-desk visual thesis and responsive layout.
- [ ] Add copyable connection snippets and explicit setup requirements for secure Webhook delivery.
- [ ] Run client tests and manually verify desktop/mobile interaction and overflow.

### Task 8: Full verification and release readiness

**Files:**
- Modify only if verification exposes a tested defect.

- [ ] Run all server tests against a temporary database using Node 22.
- [ ] Run all client tests and the optimized production build.
- [ ] Run AyaNewsSkill tests, package build, checksum verification, and local `doctor`, `vision`, `events`, and `updates` commands.
- [ ] Start the local stack, validate each public endpoint with real HTTP, use official MCP/A2A clients, and run Chrome desktop/mobile QA.
- [ ] Run `git diff --check`; report any deployment-only requirements such as DNS, HTTPS, or webhook callback availability.

