# AyaNews Agent Platform Completion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete AyaNews as a secure, evidence-first Agent platform with typed tools, persistent runs, a first-party workbench, approval-gated actions, and MCP/A2A interoperability.

**Architecture:** Build one bounded Agent runtime around a typed tool registry and public projections of the existing News, Signal, Topic, Creator, and subscription services. Persist sessions/runs/events/evidence in SQLite, stream only durable progress, keep final answers behind citation audit, and map MCP/A2A to the same contracts rather than duplicating business logic.

**Tech Stack:** Node.js 24 target, Express 4, SQLite/better-sqlite3, MiniMax Anthropic-compatible provider adapter, React 18, Vite, TypeScript, Tailwind, Vitest/Testing Library, Node test runner, SSE, MCP and A2A official JavaScript SDKs selected at implementation time from current official documentation.

---

## Delivery ledger

| Module | Status | Targeted evidence | Review |
|---|---|---|---|
| 0. Baseline and plan | Complete | 348 server, 48 client, build passed | Approved |
| 1. Repository hygiene and dependency security | Complete | 22/22 targeted; 0 high/critical audit | Spec + quality approved |
| 2. Request security configuration | Complete | 377/377 server; 26/26 targeted | Spec + quality approved |
| 3. Typed read-tool registry | Complete | 412/412 server; 35/35 focused | Spec + quality approved |
| 4. Model provider abstraction | Complete | 474/474 server; 95/95 focused | Spec + quality approved |
| 5. Agent persistence and evidence ledger | Complete | 536/536 server; 61/61 focused; 169/169 Agent | Spec + quality approved |
| 6. Bounded Agent runtime | Complete | 619/619 server; 92/92 focused; 252/252 Agent | Spec + quality approved |
| 7. Persistent run API and SSE | Complete | 648/648 server; 134/134 focused; 275/275 Agent | Spec + quality approved |
| 8. `/agent` workbench | Pending | client Agent tests/build | Pending |
| 9. Approval-gated subscription tool | Pending | approval/write-tool tests | Pending |
| 10. MCP adapter | Pending | official-client integration | Pending |
| 11. A2A adapter | Pending | official-client integration | Pending |
| 12. Discovery, CI, operations and final verification | Pending | full release gate | Pending |

## Non-negotiable constraints

- Do not display or commit any secret found in the tracked `server/.env`.
- Do not rewrite Git history, force-push, rotate third-party credentials, invalidate production sessions, or deploy to production without separate explicit operator authorization.
- Do not expose admin refresh/configuration, arbitrary HTTP, shell, browser control, filesystem access, or external publishing as Agent tools.
- Do not claim citation-format validation proves factual correctness.
- Do not implement another Topic/event/Webhook/outbox subsystem; reuse current services.
- Do not show unaudited token streams as final answers.

## Module completion protocol

Every implementation module follows the same gate before its ledger row can be marked complete:

1. A fresh implementer works test-first and records the RED/GREEN evidence.
2. An independent specification reviewer checks the implementation against the task text and tests.
3. After specification approval, an independent code-quality reviewer checks security, maintainability, and regression risk.
4. Any finding returns to the implementer for correction and re-review.
5. The primary agent reruns the targeted commands, records the real output in this ledger, and commits the module status update.

### Task 0: Freeze the verified baseline and plan

**Files:**
- Create: `docs/superpowers/specs/2026-10-12-agent-platform-completion.md`
- Create: `plan.md`
- Modify: `plan.md` after every module with test evidence and review status

- [x] **Step 1: Create an isolated worktree and feature branch**

Worktree: `/Users/li/.config/superpowers/worktrees/AiNews/agent-platform`

Branch: `codex/agent-platform-completion`

- [x] **Step 2: Install dependencies without changing manifests**

Run:

```bash
npm --prefix server ci
npm --prefix client ci
```

- [x] **Step 3: Verify the clean baseline**

Run:

```bash
npm --prefix server test
npm --prefix client test
npm --prefix client run build
```

Observed baseline: server 348/348, client 48/48, production build successful.

- [x] **Step 4: Obtain independent plan review and resolve blocking findings**

Independent review status: `Approved`. No blocking gaps or duplicate Signal/Creator infrastructure were found.

- [x] **Step 5: Commit the reviewed specification and plan**

```bash
git add plan.md docs/superpowers/specs/2026-10-12-agent-platform-completion.md
git commit -m "docs: plan AyaNews agent platform completion"
```

### Task 1: Block repository and build-context data leaks; patch production dependencies

**Files:**
- Create: `scripts/check-repository-hygiene.mjs`
- Create: `server/tests/repository-hygiene.test.js`
- Modify: `.gitignore`
- Modify: `server/.dockerignore`
- Modify: `scripts/build-release.sh`
- Modify: `server/package.json`
- Modify: `server/package-lock.json`
- Modify: `README.md`
- Stop tracking: `server/.env`, `server/data/ainews.db`, `server/server.log`, `client/client.log`

- [x] **Step 1: Write failing repository-hygiene tests**

Test that tracked files reject `.env`, runtime databases, WAL/SHM, logs, backups, reports, and caches while allowing `.env.example`; test that Docker and release exclusion patterns cover the same classes.

Run:

```bash
/usr/local/bin/node --test server/tests/repository-hygiene.test.js
```

Expected: FAIL because tracked runtime files and incomplete Docker exclusions are present.

- [x] **Step 2: Implement the repository hygiene checker and exclusions**

The checker returns nonzero and prints only paths/categories, never file contents. Remove tracked runtime files from the feature branch without reading values into logs.

- [x] **Step 3: Add a dependency-security regression gate**

Add assertions for minimum patched transitive/direct versions and preserve Express 4/node-cron 3 compatibility. Update compatible packages and lockfile; do not run `npm audit fix --force`.

- [x] **Step 4: Run targeted and security verification**

```bash
/usr/local/bin/node --test server/tests/repository-hygiene.test.js server/tests/release-inputs.test.js server/tests/direct-upload-release.test.js server/tests/server-lifecycle.test.js
npm --prefix server audit --omit=dev --audit-level=high
git ls-files server/.env server/data/ainews.db server/server.log client/client.log
```

Expected: tests pass, audit has no critical/high findings, and `git ls-files` prints nothing.

- [x] **Step 5: Commit and update the delivery ledger**

Verified 2026-10-12 on Node 22: initial RED was 0/6; reviewer-driven regression RED runs reproduced export, Docker matcher, and SemVer gaps. Final targeted run passed 22/22. `npm audit --omit=dev --audit-level=high` exited 0 with zero high/critical and two accepted moderate `node-cron`/`uuid` findings. The checker and `git diff --check` passed; sensitive/runtime paths are untracked while local ignored copies remain present. Specification and code-quality reviews both approved commits through `60d183ab`.

### Task 2: Unify CORS, trusted proxy, public origin, and request identity

**Files:**
- Create: `server/config/security.js`
- Create: `server/middleware/requestContext.js`
- Create: `server/tests/security-config.test.js`
- Create: `server/tests/proxy-context.test.js`
- Create: `server/tests/cors-integration.test.js`
- Modify: `server/index.js`
- Modify: `server/routes/auth.js`
- Modify: `server/routes/contact.js`
- Modify: `server/.env.example`
- Modify: `nginx/nginx.conf`

- [x] **Step 1: Write RED tests for exact Origin allowlists, WebSocket reuse, proxy modes, and spoofed XFF**
- [x] **Step 2: Implement a parsed fail-closed security configuration**

Expose `allowedOrigins`, `publicOrigin`, and an explicit proxy mode. Route code consumes `req.ip`/request context and never reads raw XFF.

- [x] **Step 3: Remove wildcard CORS and duplicate preflight logic from Nginx**
- [x] **Step 4: Run targeted auth, SSE, public-route, Nginx text-contract, and security tests**
- [x] **Step 5: Commit and update the delivery ledger**

Verified 2026-10-12 on Node 22.14.0: the initial three-suite RED run had 15/16 expected failures. Final security/proxy/CORS/WebSub targeting passed 26/26 and the full server suite passed 377/377 with `NODE_ENV=test`. Independent review found and the implementation closed an expanded IPv4-mapped IPv6 proxy-trust bypass plus a production template conflict. HTTP, polling, and real WebSocket origin decisions now share one exact allowlist; public discovery and WebSub use the validated public origin; auth/contact persist only normalized Express-derived client identity. Specification and code-quality reviews approved commits through `efe13e25`.

### Task 3: Build the typed read-tool registry and shared research projections

**Files:**
- Create: `server/services/agent/tool-registry.js`
- Create: `server/services/agent/tool-schemas.js`
- Create: `server/services/agent/public-projections.js`
- Create: `server/services/agent/tools/read-tools.js`
- Create: `server/services/ContentResearchService.js`
- Create: `server/tests/agent-tool-registry.test.js`
- Create: `server/tests/agent-read-tools.test.js`
- Modify: `server/routes/content.js`
- Modify: `server/services/AgentContextService.js`

- [x] **Step 1: Write RED tests for schemas, bounds, unknown tools, timeout, output limits, and secret/raw-payload exclusion**
- [x] **Step 2: Implement one declaration contract**

Each tool declares `name`, `version`, `description`, JSON input/output schemas, `effect`, `requiredScope`, `timeoutMs`, `maxOutputBytes`, and `execute`. All validation is fail-closed.

- [x] **Step 3: Implement first-party read tools**

Implement latest/search News, Topic list/detail/changes/opportunities, Creator posts/topics/source coverage, source health, and research brief by calling services directly, not localhost HTTP.

- [x] **Step 4: Extract route-level brief logic into `ContentResearchService` and preserve existing responses**
- [x] **Step 5: Run registry, content, Signal, Creator and secret-redaction tests**
- [x] **Step 6: Commit and update the delivery ledger**

Verified 2026-10-12 on Node 22.14.0. Initial RED runs covered registry contracts and all first-party read tools; reviewer-driven RED runs added hostile Symbol payloads, real platform URL identities, citation collisions, nullable metrics, and legacy trend citations. The final focused run passed 35/35, related compatibility coverage passed 91/91, and the isolated full server suite passed 412/412. The registry exposes 11 bounded read-only tools with exact scopes, generic failure envelopes, abort/timeout propagation, UTF-8 output budgets, and explicit public projections. Final citation URLs preserve validated YouTube, Weibo, WeChat, and article identities, reject ambiguous identities, strip credentials/tracking, deduplicate before readiness decisions, and preserve unknown metrics as `null`. Specification and code-quality reviews approved commits through `3c2f85ee`.

### Task 4: Introduce a model-provider abstraction with MiniMax tool-call support

**Files:**
- Create: `server/services/agent/model-provider.js`
- Create: `server/services/agent/providers/minimax-provider.js`
- Create: `server/services/agent/providers/fake-provider.js`
- Create: `server/services/agent/citation-audit.js`
- Create: `server/tests/agent-provider.test.js`
- Modify: `server/services/AgentService.js`
- Modify: `server/tests/agent-service.test.js`

- [x] **Step 1: Verify the current MiniMax tool-call protocol from official provider documentation without exposing keys**
- [x] **Step 2: Write RED provider contract tests using the deterministic fake provider**

Contract: `generate({ messages, tools, signal, limits }) -> { text, toolCalls, usage, stopReason }`.

- [x] **Step 3: Implement abort propagation, bounded retry time, capability flags, tool-call ID/order preservation, and response validation**
- [x] **Step 4: Extract citation audit and keep legacy chat/content/diversity behavior green**
- [x] **Step 5: Run provider and all legacy Agent/content tests**
- [x] **Step 6: Commit and update the delivery ledger**

Verified 2026-10-13 on Node 22.14.0 against MiniMax's official Anthropic-compatible API and function-calling documentation without reading or exposing local credentials. Initial RED coverage established the provider-neutral result contract, deterministic fake provider, abort/timeout behavior, bounded retries, tool-call ordering, capability flags, response validation, and legacy Agent compatibility. Reviewer-driven RED cases then found and fixed four boundary defects: valid thinking-only `max_tokens` responses, replayable or forged continuation state, complete serialized request bodies exceeding the 2 MiB budget, and provider-specific wording in the shared system prompt. Continuations are now identity-bound, single-use conversation state with exact pending tool-result matching; private thinking blocks remain outside public projections. The primary focused run passed 95/95 and the isolated full server suite passed 474/474. Specification and code-quality reviews approved commits through `3ddc56e5`; no live provider request or API key was used.

### Task 5: Persist sessions, messages, runs, events, and stable evidence

**Files:**
- Create: `server/services/agent/agent-store.js`
- Create: `server/services/agent/evidence-ledger.js`
- Create: `server/tests/agent-store.test.js`
- Create: `server/tests/agent-evidence-ledger.test.js`

- [x] **Step 1: Write RED tests using temporary SQLite databases**

Cover schema idempotency, ownership, transaction rollback, monotonic event sequence, request-key idempotency, one active run per session, restart reconciliation, retention, and stable `S#` assignment.

- [x] **Step 2: Implement the minimal schema**

Tables: `agent_sessions`, `agent_messages`, `agent_runs`, `agent_run_events`, and `agent_evidence`. Store structured public projections only.

- [x] **Step 3: Implement state transitions**

`queued -> running -> completed|failed|cancelled`; reserve `awaiting_approval` for Task 9. Persist state and its event in one transaction.

- [x] **Step 4: Run store/evidence tests twice, including close/reopen recovery**
- [x] **Step 5: Commit and update the delivery ledger**

Verified 2026-10-13 on Node 22.14.0 with real temporary SQLite databases and no network or production credentials. The final primary runs passed 61/61 store/evidence tests, 169/169 Agent tests, and 536/536 isolated server tests; close/reopen recovery, four-worker concurrency, stable keyset pagination, request-key idempotency, active-run uniqueness, monotonic event sequences, retention, and transaction rollback were exercised directly. The five-table store enforces owner-scoped composite foreign keys, universally opt-in startup recovery, immutable terminal runs, strict state/event transactions, public projection byte/node/depth/list budgets, and stable per-run `S#` allocation. Durable tool events accept only the current registry's closed schemas and exact `{ok,data|error}` envelopes; final sources are reconstructed from the owned evidence ledger, answer markers must match the ledger reference set, and private, malformed, local, alternate, residential, credential-bearing, or non-canonical URLs fail closed. Reviewer-driven RED rounds also fixed shared-process recovery races, unreachable pagination, post-cancel writes, unaudited answer leakage, forged citations, inconsistent tool budgets, mutable cursors, hostile descriptors, outer-transaction lock downgrades, and reserved DNS namespaces. Specification and code-quality reviews approved commits through `a30392d4`.

### Task 6: Implement the bounded Agent loop and offline evaluations

**Files:**
- Create: `server/services/agent/agent-runtime.js`
- Create: `server/services/agent/tool-policy.js`
- Create: `server/tests/fixtures/agent-evals.json`
- Create: `server/tests/agent-runtime.test.js`
- Create: `server/tests/agent-evals.test.js`

- [x] **Step 1: Write RED scenarios for multi-step research, malformed calls, injection, errors, cancellation, loop detection, and citation failure**
- [x] **Step 2: Implement bounded orchestration**

Initial hard limits: 6 model turns, 10 tool calls, 24 KiB per tool result, 120 seconds per run; repair attempts consume the same budget. Execute tools serially and cache identical read calls within a run.

- [x] **Step 3: Enforce policy outside prompts**

Only registry tools are callable; scope/effect checks happen before execution. Prompt text cannot grant tools or permissions.

- [x] **Step 4: Preserve evidence identities and audit the final answer before storing `answer.completed`**
- [x] **Step 5: Run the deterministic evaluation suite and targeted regressions**
- [x] **Step 6: Commit and update the delivery ledger**

Verified 2026-10-13 on Node 22.14.0 with deterministic providers, temporary SQLite databases, no network, and no production credentials. The initial RED run established 59 scenarios with the runtime, policy, and atomic finalization APIs absent; the implementation reached 67/67 focused tests before independent review. Reviewer-driven RED rounds then reproduced unsupported claims being mislabeled as fact-verified, conflicting tool-local versus run-level `S#` identities, four successful URL-less platform-data tools collapsing to an insufficient-evidence response, and cached transient failures blocking recovery. The final runtime separates factual verification (`verified: false`) from internally derived citation-structure verification, removes local citation markers only from model-visible projections while preserving durable registry envelopes, retries failed identical reads while caching successful ones, and atomically derives bounded unverified structured answers from owned durable schema-valid tool results. Hard limits remain six model turns, ten serial tool calls, 24 KiB per model-visible tool result, and 120 seconds total; repair, cancellation, loop, scope, usage, timeout, rollback, ownership, and stable evidence behavior are covered. Final primary runs passed 92/92 focused tests, 252/252 Agent tests, and 619/619 isolated server tests with zero failures or skips. Specification and code-quality reviews approved commits through `4d98d76c` with no remaining P1/P2/P3 findings.

### Task 7: Expose authenticated persistent-run APIs and recoverable SSE

**Files:**
- Create: `server/routes/agent-runs.js`
- Create: `server/services/agent/run-event-stream.js`
- Create: `server/tests/agent-routes.test.js`
- Create: `server/tests/agent-stream.test.js`
- Modify: `server/index.js`
- Modify: `nginx/nginx.conf`
- Modify: `server/routes/agent.js`

- [x] **Step 1: Write RED tests for session CRUD, 202 run start, status, events, cancel, ownership, and idempotency**
- [x] **Step 2: Write RED SSE tests for replay, Last-Event-ID, heartbeat, terminal reconnect, cleanup, and slow clients**
- [x] **Step 3: Implement APIs while preserving legacy `/api/agent/chat`**
- [x] **Step 4: Persist before broadcasting; SSE disconnect does not cancel a run**
- [x] **Step 5: Add the exact Nginx no-buffer route and run route/stream/auth tests**
- [x] **Step 6: Commit and update the delivery ledger**

Verified 2026-10-14 on Node 22.14.0 with real temporary SQLite databases, deterministic providers, shared-database multi-worker fixtures, no network, and no production credentials. The authenticated API now exposes owner-scoped session, message, run, event, cancel, JSON replay, and resumable SSE operations while preserving the legacy chat route. Durable events are replayed before live notifications, cross-Store commits are observed by polling, slow clients pause reads under backpressure, and disconnecting an SSE client never cancels its run. Startup recovery is disabled by default and may be enabled only for a fixed single worker or an exclusive quiesced maintenance startup; rolling multi-replica deployments remain disabled until per-run leases exist. Independent review reproduced and fixed two multi-worker defects: an idempotent claim loser could previously fail the winner's active run, and cancellation on a different worker did not abort the owning worker's provider/tool. The final design gives terminalization rights only after the runtime's successful atomic claim and polls the durable run status every 100 ms for remote cancellation, with interval cleanup on completion and shutdown. Primary verification passed 134/134 route/stream/lifecycle/runtime/store/auth tests, 275/275 Agent tests, 648/648 isolated server tests, 48/48 client regressions, and the production client build. Specification and code-quality reviews approved commits through `a1b63659` with no remaining P1/P2/P3 findings.

### Task 8: Build the `/agent` workbench

**Files:**
- Create: `client/src/features/agent/agent-types.ts`
- Create: `client/src/features/agent/agent-api.ts`
- Create: `client/src/features/agent/use-agent-run.ts`
- Create: `client/src/features/agent/agent-workbench.tsx`
- Create: `client/src/features/agent/components/conversation-list.tsx`
- Create: `client/src/features/agent/components/conversation-view.tsx`
- Create: `client/src/features/agent/components/composer.tsx`
- Create: `client/src/features/agent/components/source-cards.tsx`
- Create: `client/src/features/agent/components/activity-timeline.tsx`
- Create: matching `*.test.ts(x)` files
- Modify: `client/src/App.tsx`
- Modify: `client/src/components/workspace-header.tsx`
- Modify: `client/src/App.test.tsx`

- [ ] **Step 1: Write RED API/hook tests for success, malformed responses, cancel, reconnect, retry, stale-run suppression, anonymous login handoff, and post-login workspace recovery**
- [ ] **Step 2: Write RED component tests for citations/sources, real activity events, empty/error/disabled states, and keyboard behavior**
- [ ] **Step 3: Implement the responsive workbench in the existing Aya visual system**

Do not migrate the legacy CRA page wholesale. Do not render fictitious tool activity. Use `aria-live`, `role=alert`, visible focus, reduced-motion support, and safe external links.

- [ ] **Step 4: Run focused client tests, full client suite, and production build**
- [ ] **Step 5: Perform browser QA at desktop and 390x844 mobile sizes with a local fake provider**
- [ ] **Step 6: Commit and update the delivery ledger**

### Task 9: Add approval-gated authenticated subscription creation

**Files:**
- Create: `server/services/agent/approval-service.js`
- Create: `server/services/agent/tools/write-tools.js`
- Create: `server/tests/agent-approvals.test.js`
- Create: `server/tests/agent-write-tools.test.js`
- Create: `client/src/features/agent/components/approval-card.tsx`
- Create: `client/src/features/agent/components/approval-card.test.tsx`
- Modify: `server/services/agent/agent-store.js`
- Modify: `server/services/agent/agent-runtime.js`
- Modify: `server/routes/agent-runs.js`

- [ ] **Step 1: Write RED tests for pending/approve/reject/expire/tamper/replay/cross-user behavior**

Include crash recovery where the subscription exists but the approval result was not recorded. Derive a stable subscription ID from the approval execution key so retries query/reuse the same owned record instead of inserting a duplicate.
- [ ] **Step 2: Add `agent_approvals` and bind approvals to owner, run, tool version, canonical argument hash, and expiry**
- [ ] **Step 3: Implement one write tool that reuses the existing Creator subscription service**
- [ ] **Step 4: On approval, re-authorize and atomically claim once before idempotent execution**
- [ ] **Step 5: Implement accessible approval UI and run Agent plus Creator subscription/outbox regressions**
- [ ] **Step 6: Commit and update the delivery ledger**

### Task 10: Expose the read registry through MCP

**Files:**
- Create: `server/services/McpRuntime.mjs`
- Create: `server/routes/mcp.js`
- Create: `server/tests/mcp-integration.test.mjs`
- Modify: `server/package.json`
- Modify: `server/package-lock.json`
- Modify: `server/index.js`
- Modify: `nginx/nginx.conf`

- [ ] **Step 1: Check current official MCP SDK documentation and lock exact versions**
- [ ] **Step 2: Write an official-client RED integration test for initialize/list/call/protocol errors**
- [ ] **Step 3: Generate read-only MCP tools from the registry; retain structured sources and evidence boundaries**
- [ ] **Step 4: Enforce Origin/Host, response-size, timeout and rate limits at the server boundary**
- [ ] **Step 5: Update the server test script so `.test.mjs` files run in the normal suite**
- [ ] **Step 6: Run MCP, registry, public-discovery and full server tests; commit**

### Task 11: Map A2A to the persistent Agent runtime

**Files:**
- Create: `server/services/A2aRuntime.mjs`
- Create: `server/routes/a2a.js`
- Create: `server/tests/a2a-integration.test.mjs`
- Modify: `server/package.json`
- Modify: `server/package-lock.json`
- Modify: `server/index.js`
- Modify: `nginx/nginx.conf`

- [ ] **Step 1: Check the current official A2A SDK/protocol and lock exact versions**
- [ ] **Step 2: Write official-client RED tests for Agent Card, create/read/cancel task, events, and cited artifacts**
- [ ] **Step 3: Map A2A tasks to existing Agent sessions/runs/events without a second executor**
- [ ] **Step 4: Advertise only capabilities proven by tests; write tools remain subject to the same approval policy**
- [ ] **Step 5: Run A2A, Agent runtime, ownership and cancellation tests; commit**

### Task 12: Finish discovery, CI, operations, cleanup and release verification

**Files:**
- Create: `.github/workflows/ci.yml`
- Create: `docs/operations/AGENT_PLATFORM.md`
- Create: `docs/operations/SECURITY_INCIDENT_2026-10-12.md`
- Modify: `server/services/PublicDiscoveryService.js`
- Modify: `server/routes/public.js`
- Modify: `client/src/features/skill/skill-page.tsx`
- Modify: `client/public/ai-news-content-api.openapi.yaml`
- Modify: `README.md`
- Modify: `docs/SYSTEM_USAGE_GUIDE.md`
- Modify: `plan.md`
- Remove only after import-graph proof: obsolete Agent/Skill legacy UI and backup route copies

- [ ] **Step 1: Write RED discovery/documentation tests requiring implemented REST/SSE/MCP/A2A contracts and truthful unsupported boundaries**
- [ ] **Step 2: Add CI for supported Node 24, server tests including `.mjs`, client tests/build, audits and repository hygiene**
- [ ] **Step 3: Document model setup, tools, permissions, approvals, recovery, retention, evaluation, operations and the credential/history incident response**
- [ ] **Step 4: Prove unused legacy files with import/reference checks before removing them; run regressions after each removal group**
- [ ] **Step 5: Run the complete final gate**

```bash
npm --prefix server test
/usr/local/bin/node --test server/tests/*.test.mjs
npm --prefix client test
npm --prefix client run build
npm --prefix server audit --omit=dev --audit-level=high
npm --prefix client audit --omit=dev --audit-level=high
node scripts/check-repository-hygiene.mjs
docker compose config --quiet
bash -n scripts/build-release.sh scripts/activate-release.sh scripts/upload-release.sh scripts/upload-data-snapshot.sh
git diff --check
git status --short
```

- [ ] **Step 6: Run final independent spec and code-quality reviews; fix all Critical/Important findings**
- [ ] **Step 7: Record exact evidence in this ledger and use `finishing-a-development-branch` for user-selected integration**

## Operator-only closeout actions

These remain explicitly outside automated execution until separately authorized:

1. Rotate/revoke the exposed NewsAPI credential and any other confirmed secret.
2. Decide whether to invalidate existing production sessions or force password resets.
3. Rewrite Git history in a disposable mirror and force-push rewritten refs.
4. Change repository visibility or contact GitHub Support about cached sensitive data.
5. Deploy to production, run data migrations against production, or restore/replace production databases.
