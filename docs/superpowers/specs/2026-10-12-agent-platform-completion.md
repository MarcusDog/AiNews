# AyaNews Agent Platform Completion Specification

## Objective

Turn the existing citation-audited AyaNews chatbot into a production-oriented Agent platform that can retrieve real News, Signal, Topic, Creator, and source-health data through typed tools; persist private sessions and runs; expose recoverable progress events; support a first-party `/agent` workbench; gate all side effects behind explicit user approval; and later expose the same tool/runtime contracts through MCP and A2A.

## Product boundaries

- Preserve the existing evidence-first behavior: unsupported claims are not shown as verified.
- Reuse existing Signal topics/changes and Creator events/SSE/outbox/webhooks. Do not build parallel event, clustering, subscription, or delivery systems.
- Keep `/api/agent/chat` backward compatible while the new persistent run API is introduced.
- The first Agent runtime is single-orchestrator, bounded, and tool-driven. Multi-Agent handoffs are out of scope until evaluation evidence justifies them.
- Read tools may access only public projections. Raw connector payloads, credentials, cookies, filesystem paths, and internal errors never enter model context.
- The first write tool may create a subscription owned by the current authenticated user. Admin refresh, source configuration, backfill, arbitrary HTTP, shell, browser control, and external publishing remain unavailable.
- Every write pauses for explicit approval. Approval is bound to user, run, tool version, canonical arguments, and expiry.
- No raw token streaming is shown before citation audit. The UI streams persisted run progress and only reveals the final audited answer.
- Existing MiniMax support remains. Provider interfaces must permit a second provider without coupling runtime policy to a model vendor.

## Security and repository requirements

- Stop tracking runtime `.env`, SQLite databases, logs, WAL/SHM files, caches, backups, and generated snapshots.
- Never print or copy the tracked non-placeholder NewsAPI credential. Treat it as exposed and require operator rotation.
- Removing files from the current tree does not claim to remove them from Git history. History rewrite, force push, credential rotation, and production session invalidation require explicit operator action.
- Patch production critical/high dependency advisories without forcing unrelated major upgrades.
- Make CORS, Socket.IO origin policy, public origin, and trusted proxy behavior explicit and testable. Do not trust raw `X-Forwarded-For` in route code.
- Docker and release contexts must exclude all runtime data and secret configuration, not only one database filename.

## Required user-visible capabilities

1. `/agent` workbench with session list, composer, audited answer, source cards, progress timeline, cancel/retry, recoverable errors, responsive layout, and keyboard-accessible controls.
2. Read-only Agent tools for News search/latest, Topic list/detail/changes/opportunities, Creator posts/topics/coverage, source health, and research briefs.
3. Persistent sessions, messages, runs, ordered events, usage, evidence ledger, cancellation, idempotency, and ownership enforcement.
4. Bounded Agent loop with typed tool validation, time/output/tool-call budgets, prompt-injection resistance, citation audit, and deterministic fake-provider tests.
5. Approval UI/API and one safe authenticated subscription write tool.
6. Read-only MCP adapter generated from the same tool registry.
7. A2A adapter mapped to the same persistent Agent runtime after the run API is stable.
8. OpenAPI, Skill, deployment, operations, and security documentation that describe only implemented capabilities.

## Quality gates

- Every behavior change follows RED → GREEN → REFACTOR and records the exact targeted test command.
- Each module receives spec review, code-quality review, and targeted verification before the next module begins.
- Offline tests use deterministic providers and temporary databases; they never require production secrets or network services.
- Final verification runs the complete server/client suites, production builds/audits, release checks, Compose/Nginx validation where available, repository hygiene checks, and `git diff --check`.

## External input note

The supplied ChatGPT share URL returned HTTP 403 in both the web fetcher and a real browser. This specification therefore reconciles the user's explicit requirements with the repository's current implementation, prior audit, and the existing Open Agent plan. If the inaccessible share contains additional acceptance criteria, they must be added without weakening the security or evidence boundaries above.
