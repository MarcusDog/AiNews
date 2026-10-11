# Aya Creator Radar Frontend Rebuild Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the legacy CRA news-list entry point with a production-ready Vite + React + TypeScript cinematic landing page that presents Aya as an AI creator intelligence radar and generates an actionable daily topic from real site news.

**Architecture:** Keep the Express server and its current real-news endpoints intact. Build a new TypeScript client entry point around a tested API adapter and a small domain module (`topic-idea`) that turns `/api/news/latest` articles into creator assignments, then present it through a full-bleed video hero and an accessible shadcn-style dialog. Preserve dirty and legacy client files as migration material; create a new stylesheet rather than overwriting the currently modified legacy stylesheet. Production uses one explicit artifact flow: a host/CI `npm ci && npm run build` creates `client/dist`, which Nginx mounts read-only; the redundant Compose client server is removed.

**Tech Stack:** React 18, Vite 8, TypeScript 7, Tailwind CSS 3.4, Radix Dialog/shadcn-style local components, Lucide React, Vitest 4, Testing Library, Node.js >=20.19.

---

## Source documents

- Product brief: `/Users/li/.codex/attachments/94782c4a-f8d4-42f4-ab8f-729b90061bd3/pasted-text.txt`
- Persistent status: `/Users/li/Public/website/website/Ainews/PROJECT_REBUILD_STATUS.md`
- Existing app reference: `/Users/li/Public/website/website/Ainews/client/src/App.js`
- Existing real-news contract: `/Users/li/Public/website/website/Ainews/server/routes/news.js`

## File map

### Create

- `client/index.html` — Vite HTML entry, metadata, font preconnects.
- `client/vite.config.ts` — React plugin, local `/api` and `/socket.io` proxy, Vitest configuration.
- `client/tsconfig.json`, `client/tsconfig.app.json`, `client/tsconfig.node.json` — strict TypeScript project references.
- `client/components.json` — shadcn/ui aliases and theme configuration.
- `client/src/main.tsx` — React root entry.
- `client/src/App.tsx` — single-page composition only.
- `client/src/vite-env.d.ts` — Vite types.
- `client/src/lib/utils.ts` — `cn()` class combiner used by shadcn components.
- `client/src/components/ui/button.tsx` — local shadcn-style Button.
- `client/src/components/ui/dialog.tsx` — accessible Radix Dialog wrapper.
- `client/src/components/brand-mark.tsx` — Aya Signals wordmark.
- `client/src/components/navigation.tsx` — glassmorphic desktop/mobile-safe navigation.
- `client/src/components/hero.tsx` — full-screen video hero and primary action.
- `client/src/features/topic-idea/topic-api.ts` — typed fetch adapter, response validation, abort support, and HTTP failure handling.
- `client/src/features/topic-idea/topic-api.test.ts` — real envelope/error/abort tests.
- `client/src/features/topic-idea/topic-idea.ts` — article validation, randomized selection, and creator assignment generation.
- `client/src/features/topic-idea/topic-idea.test.ts` — domain behavior tests.
- `client/src/features/topic-idea/use-topic-idea.ts` — loading/refresh/error state and fetch lifecycle.
- `client/src/features/topic-idea/topic-idea-dialog.tsx` — accessible result surface.
- `client/src/App.test.tsx` — first-viewport and interaction tests.
- `client/src/features/topic-idea/use-topic-idea.test.tsx` — close/unmount abort, stale response, reroll, and practice-mode tests.
- `client/src/test/setup.ts` — jsdom matchers and browser API stubs.
- `client/src/styles.css` — new landing-page tokens and styles; does not overwrite the dirty legacy `index.css`.

### Replace or modify

- `client/package.json`, `client/package-lock.json` — remove CRA, add Vite/TypeScript/Vitest/Radix/shadcn dependencies and scripts.
- `client/tailwind.config.js` — migrate to CommonJS-compatible `.cjs` if package type becomes module; add shadcn token mappings and fonts.
- `client/postcss.config.js` — migrate to `.cjs` if required by ESM package mode.
- `client/Dockerfile` — optional standalone reproducible build/serve image for the same `dist/` output; Compose itself uses the host/CI prebuilt artifact.
- `package.json` — `client:dev` invokes Vite.
- `start.sh` — local client startup invokes `npm run dev -- --host 0.0.0.0`.
- `docker-compose.yml` — Nginx volume and client service serve `client/dist`.
- `nginx/nginx.conf` — static Vite hashed asset caching and SPA fallback remain correct.
- `docker-deploy.sh`, `docker-manage.sh` — replace frontend `build` artifact checks with `dist`.
- `README.md`, `QUICKSTART.md`, `DEPLOY.md` — current Node requirement, Vite commands, and dist path.
- `PROJECT_REBUILD_STATUS.md` — milestone state and verification evidence after every completed task.

## Product and truthfulness constraints

- Do not display invented heat, creator, confidence, platform, or recency numbers.
- The random topic must use a real item returned by `/api/news/latest` whenever usable items exist.
- If the API is empty or unavailable, return a clearly labelled `创作练习` based on a timeless prompt; never label it as trending, live, or from the last 48 hours.
- The result must expose the source name and canonical source URL for real-news ideas.
- Nav items for unfinished application areas must be semantic labels/buttons and must not masquerade as completed pages.
- The background video is decorative: `aria-hidden`, muted, non-interactive, and removed from the keyboard order.
- No decorative blobs, radial gradients, or video overlay layer.
- Video URL: `https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260314_131748_f2ca2a28-fed7-44c8-b9a9-bd9acdd5ec31.mp4`. It is a user-supplied remote asset (HTTP 200 verified 2026-08-27); ownership/licensing remains the deployer's responsibility. Do not copy it into the repository. On media error, hide the video and retain the deep-navy CSS background without claiming playback.

### Task 0: Protect dirty work and record the exact merge surface

**Files:**
- Read: all currently modified files
- Modify: `PROJECT_REBUILD_STATUS.md`

- [ ] **Step 1: Capture status and diffs before edits**

Run:

```bash
git status --short
git diff -- client/src/index.css client/src/config/api.js nginx/nginx.conf README.md server/index.js server/routes/content.js
```

Record the touched hunks in `PROJECT_REBUILD_STATUS.md`. Never rewrite `server/*` or `client/src/config/api.js` in this phase.

- [ ] **Step 2: Avoid dirty-file collisions by design**

Create `client/src/styles.css` instead of replacing `client/src/index.css`. Modify Nginx only in its static-cache and root sections, preserving the existing public discovery routes. Modify README only in its active-rebuild/development/deployment sections.

- [ ] **Step 3: Verify unrelated changes remain present after every deployment edit**

Run the same scoped `git diff` and confirm AyaNewsSkill public routes and server hunks are still intact.

### Task 1: Bootstrap Vite, TypeScript, and a narrow Vitest harness

**Files:**
- Create: `client/index.html`
- Create: `client/vite.config.ts`
- Create: `client/tsconfig.json`
- Create: `client/tsconfig.app.json`
- Create: `client/tsconfig.node.json`
- Create: `client/src/vite-env.d.ts`
- Create: `client/src/test/setup.ts`
- Modify: `client/package.json`
- Modify: `client/package-lock.json`
- Rename/modify: `client/tailwind.config.js` -> `client/tailwind.config.cjs`
- Rename/modify: `client/postcss.config.js` -> `client/postcss.config.cjs`

- [ ] **Step 1: Replace package scripts and pin compatible dependencies**

Use React 18 and the npm-verified current versions for Vite, plugin-react, TypeScript, Vitest, Testing Library, Radix Dialog, CVA, clsx, and tailwind-merge. Keep Tailwind 3.4. Set `engines.node` to `>=20.19.0`.

- [ ] **Step 2: Configure Vite port, aliases, and proxies**

`@` resolves to `client/src`. Development server defaults to port 3000 with `strictPort: true`. `/api` and `/socket.io` proxy to `http://localhost:3002`.

- [ ] **Step 3: Configure a deliberately narrow test suite**

Vitest includes only `src/**/*.test.ts` and `src/**/*.test.tsx`. Existing legacy Jest `*.test.js` files are archival tests for the inactive CRA UI and are explicitly excluded rather than falsely counted as the new client suite.

- [ ] **Step 4: Install and prove the harness itself works**

Create a one-assertion `src/test/harness.test.ts`, run `npm test -- src/test/harness.test.ts`, expect PASS, then remove the temporary harness test before domain work.

- [ ] **Step 5: Verify Vite starts on the required local port**

Run Vite on port 3000, request `http://127.0.0.1:3000`, and verify the server is reachable. The app may still fail to render until Task 5; this step verifies port and HTML serving only.

### Task 2: Freeze the daily-topic domain contract with genuine failing tests

**Files:**
- Create: `client/src/features/topic-idea/topic-idea.test.ts`
- Create later: `client/src/features/topic-idea/topic-idea.ts`

- [ ] **Step 1: Write a failing response-normalization test**

```ts
expect(extractArticles({ success: true, data: { data: [article] } })).toEqual([article])
expect(extractArticles({ success: false })).toEqual([])
```

- [ ] **Step 2: Run the targeted test and verify RED**

Run: `npm test -- src/features/topic-idea/topic-idea.test.ts`

Expected: FAIL because `topic-idea.ts` does not exist.

- [ ] **Step 3: Add tests for truthful idea generation**

Verify that a real article produces:

```ts
{
  kind: 'source-backed',
  title: article.title,
  source: article.source,
  sourceUrl: article.url,
  angle: expect.any(String),
  audience: expect.any(String),
  deliverable: expect.any(String)
}
```

Also verify invalid URLs and empty titles are filtered.

- [ ] **Step 4: Add deterministic random injection tests**

Pass `random: () => 0` and `random: () => 0.99` to prove the selector can choose different valid articles without depending on ambient randomness.

- [ ] **Step 5: Add fallback tests**

Verify empty/error input returns `kind: 'practice'`, `label: '创作练习'`, no source URL, and no words such as `实时`, `正在爆`, or `过去 48 小时`.

### Task 3: Implement the daily-topic domain module

**Files:**
- Create: `client/src/features/topic-idea/topic-idea.ts`
- Test: `client/src/features/topic-idea/topic-idea.test.ts`

- [ ] **Step 1: Implement typed API and domain models**

```ts
export interface NewsArticle {
  id?: string
  title: string
  description?: string
  source?: string
  url: string
  publishedAt?: string
}

export type TopicIdea = SourceBackedIdea | PracticeIdea
```

- [ ] **Step 2: Implement `extractArticles`**

Accept the current nested response shape, reject non-array payloads, empty titles, non-HTTP(S) URLs, and explicit demo/example URLs.

- [ ] **Step 3: Implement `buildTopicIdea`**

Use a small, deterministic set of creator lenses (`小白解释`, `真实体验`, `对比判断`, `争议拆解`) selected from the article identity. Do not invent facts beyond the source headline/description.

- [ ] **Step 4: Implement `pickTopicIdea` with injected randomness**

Choose a source-backed idea when articles exist; otherwise choose a clearly marked practice prompt.

- [ ] **Step 5: Run targeted tests and verify GREEN**

Run: `npm test -- src/features/topic-idea/topic-idea.test.ts`

Expected: all topic idea tests pass.

### Task 4: Build and test the real-news fetch boundary

**Files:**
- Create: `client/src/features/topic-idea/topic-api.test.ts`
- Create: `client/src/features/topic-idea/topic-api.ts`

- [ ] **Step 1: Write failing tests for the current response envelope**

Use an injected `fetch` implementation to verify `{ success: true, data: { data: [...] } }` becomes a filtered article array.

- [ ] **Step 2: Add failure and safety tests**

Cover non-2xx, `success: false`, malformed JSON/envelopes, invalid items, and preservation of the caller's `AbortSignal`.

- [ ] **Step 3: Run and verify RED**

Expected: failure because `topic-api.ts` does not exist.

- [ ] **Step 4: Implement `fetchLatestArticles`**

Request `/api/news/latest?page=1&limit=24`, reject non-OK responses, parse only the real nested shape, and delegate item filtering to the domain module.

- [ ] **Step 5: Run and verify GREEN**

Run both domain and API tests; expect zero failures.

### Task 5: Add shadcn-style primitives and first-viewport tests

**Files:**
- Create: `client/components.json`
- Create: `client/src/lib/utils.ts`
- Create: `client/src/components/ui/button.tsx`
- Create: `client/src/components/ui/dialog.tsx`
- Create: `client/src/test/setup.ts`
- Create: `client/src/App.test.tsx`

- [ ] **Step 1: Write failing hero structure tests**

Verify brand text, headline, body copy, nav labels, primary action, and a video with `autoplay`, `loop`, `muted`, and `playsinline`.

- [ ] **Step 2: Run and verify RED**

Run: `npm test -- src/App.test.tsx`

Expected: FAIL because the TypeScript App does not exist.

- [ ] **Step 3: Add local shadcn primitives**

Use `forwardRef`, CVA button variants, and Radix Dialog semantics. Preserve visible focus rings and keyboard dismissal.

- [ ] **Step 4: Add failing dialog interaction test**

Click `随机一个选题`; expect the dialog title, loading state, result fields, source/fallback label, reroll button, and close behavior.

### Task 6: Implement the cinematic single-page home

**Files:**
- Create: `client/src/main.tsx`
- Create: `client/src/App.tsx`
- Create: `client/src/components/brand-mark.tsx`
- Create: `client/src/components/navigation.tsx`
- Create: `client/src/components/hero.tsx`
- Create: `client/src/features/topic-idea/use-topic-idea.ts`
- Create: `client/src/features/topic-idea/topic-idea-dialog.tsx`
- Create: `client/src/styles.css`
- Create: `client/index.html`

- [ ] **Step 1: Implement the page composition**

`App` owns only dialog open state and composes `Navigation`, `Hero`, and `TopicIdeaDialog`.

- [ ] **Step 2: Implement exact background-video behavior**

Use the user-provided MP4 in an absolute, full-bleed `video` with `autoPlay`, `loop`, `muted`, `playsInline`, `object-cover`, and `z-0`.

- [ ] **Step 3: Adapt template content to Aya**

Brand: `Aya Signals®`.

Headline:

```text
在噪声里，先看见下一个值得做的 AI 选题。
```

Support copy explains that Aya turns scattered AI signals into topics, angles, and source-backed material for ordinary users and creators.

- [ ] **Step 4: Implement navigation without fake routes**

Desktop labels: `看热点`, `找选题`, `做研究`, `Aya Skill`. The current item uses stronger foreground. Items not yet backed by pages remain non-deceptive buttons/labels with descriptive accessible titles; no dead links.

- [ ] **Step 5: Implement and test the data-backed topic lifecycle**

On open, fetch with a fresh `AbortController`. Abort on close/unmount; ignore stale responses under StrictMode or rapid reopen; reroll only from the already validated real article set. Present source-backed ideas with a safe `https?` source link using `target="_blank" rel="noreferrer noopener"`. If empty/error, show `创作练习` and an explicit `实时来源暂不可用` note. Tests must distinguish source-backed and practice modes.

- [ ] **Step 6: Implement CSS tokens and motion**

Use the supplied HSL variables, Instrument Serif/Inter, liquid glass pseudo-border, three fade-rise timings, `100svh`, text shadow for video contrast, and `prefers-reduced-motion` rules. Do not add an overlay, blobs, or radial gradients.

- [ ] **Step 7: Run App and domain tests**

Run: `npm test`

Expected: all new Vite/Vitest tests pass.

### Task 7: Migrate runtime and deployment paths

**Files:**
- Modify: `package.json`
- Modify: `start.sh`
- Modify: `client/Dockerfile`
- Modify: `docker-compose.yml`
- Modify: `nginx/nginx.conf`
- Modify: `docker-deploy.sh`
- Modify: `docker-manage.sh`

- [ ] **Step 1: Update local development commands**

Root `client:dev` runs `npm run dev`; `start.sh` launches `npm run dev -- --host 0.0.0.0 --port "$CLIENT_PORT" --strictPort` and health-checks the same port.

- [ ] **Step 2: Replace `build/` references with `dist/`**

Update volume mounts, static artifact checks, serve commands, Docker `COPY`, and Nginx cache handling.

- [ ] **Step 3: Freeze the Compose artifact flow**

Before `docker compose up`, host/CI runs `cd client && npm ci && npm run build`. Nginx mounts `./client/dist:/usr/share/nginx/html:ro`. Remove the redundant `ainews-client` Compose service and dependency. Keep `client/Dockerfile` as a separately testable standalone image, not as an implicit source of the Nginx volume.

- [ ] **Step 4: Correct Nginx cache policy**

Serve `/assets/*` with a one-year immutable cache. Serve `/index.html` and SPA fallback with `Cache-Control: no-cache`; do not match HTML in the immutable extension regex. Preserve all current `/api`, WebSocket, health, `/skill.md`, `/openapi.json`, `/feed.json`, and `/rss.xml` proxy locations.

- [ ] **Step 5: Validate config references**

Run:

```bash
rg -n "react-scripts|client/build|serve build|npm start" package.json client docker-compose.yml nginx start.sh docker-*.sh README.md QUICKSTART.md DEPLOY.md
```

Expected: no active frontend runtime instructions still point at CRA or `client/build`.

- [ ] **Step 6: Smoke-test the actual deployment path**

Run `docker compose config`. When Docker is available, run `docker compose up --build`, request `/`, one `/assets/*` file, and `/api/news/latest?limit=1`, then modify/rebuild the HTML marker and prove a second request receives the new non-cached HTML. If Docker is unavailable, record that exact limitation without claiming the Compose runtime was verified.

### Task 8: Update project documentation and persistent status

**Files:**
- Modify: `README.md`
- Modify: `QUICKSTART.md`
- Modify: `DEPLOY.md`
- Modify: `PROJECT_REBUILD_STATUS.md`

- [ ] **Step 1: Update the current frontend stack**

Document Node >=20.19, `npm run dev`, Vite default/local configured port, `npm test`, and `npm run build` output to `dist/`.

- [ ] **Step 2: Explain first-phase boundaries**

State that the new landing page and topic generator are live in code, while Topic/Trend scoring and deeper creator intelligence remain later backend milestones.

- [ ] **Step 3: Record milestone evidence**

Update each status row with exact command and pass/fail counts. Preserve limitations and set only the next unfinished action.

### Task 9: Full verification

**Files:**
- Verify all changed frontend, runtime, and documentation files.

- [ ] **Step 1: Read persistent status before verification**

Run: `sed -n '1,280p' PROJECT_REBUILD_STATUS.md`

- [ ] **Step 2: Run the complete new TypeScript client test suite**

Run: `cd client && npm test`

Expected: zero failures across all `*.test.ts(x)` files. State separately that inactive legacy CRA `*.test.js` tests are archival and excluded.

- [ ] **Step 3: Run TypeScript and production build**

Run: `cd client && npm run build`

Expected: exit 0 and `dist/index.html` plus hashed assets.

- [ ] **Step 4: Run existing server tests**

Run: `cd server && npm test`

Interpret results against the pre-task baseline. Zero failures proves frontend work did not introduce a server regression; pre-existing failures must be reported as pre-existing and investigated only if they overlap this phase.

- [ ] **Step 5: Inspect generated HTML/assets**

Verify `dist/index.html` contains current metadata and hashed assets; verify no source map or secret-bearing environment content is published.

- [ ] **Step 6: Perform available static responsive/accessibility checks**

Because the user declined installing the gstack browser dependency, use the already installed local Google Chrome in headless mode. Capture desktop and mobile screenshots, inspect console output, verify no horizontal overflow, test dialog open/reroll/close, and verify the background falls back to deep navy if the remote video is blocked. Do not install a browser package.

- [ ] **Step 7: Re-read and finalize persistent status**

Record exact test/build output, remaining limitations, and the next backend milestone.

- [ ] **Step 8: Verify dirty-worktree preservation**

Compare the final scoped diff with Task 0. Confirm `server/*`, `client/src/config/api.js`, legacy `client/src/index.css`, and Nginx public discovery proxy routes remain intact.

## Execution note

The user explicitly requested implementation in the current task, so execution will proceed inline after plan review. No commit will be created: the current `main` worktree already contains unrelated uncommitted AyaNewsSkill/server changes, and preserving user-owned state is safer than creating mixed commits.
