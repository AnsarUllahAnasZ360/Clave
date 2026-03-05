# Clave

> Build in sync.

AI-native project management and collaboration platform. Organizations contain workspaces; workspaces contain projects, issues, docs, boards, clients, and a deeply integrated AI layer.

## Brand

- **Product name**: Clave (repo: `millhouse-web` is the legacy repo name)
- **Tagline**: Build in sync.
- **Positioning**: A thinking workspace where AI operates as a first-class teammate — aware of your projects, issues, docs, and conversations. Combines Linear-style issue tracking with Notion-style docs and a deeply integrated Claude-powered agent layer.
- **Primary accent**: Sienna `#C26A3A` (`sienna-500`) — warm, earthy, human. In a product about human+AI collaboration, the warmth is the statement.
- **Palette**: Black `#000000`, White `#FAFAFA`, Sienna scale (50–950), Neutral scale (50–950)
- **Dark-mode first** — all surfaces and states designed for `#0A0A0A` background
- **Fonts**: Geist Sans (primary UI), Geist Mono (code and data), Pixel Grid (logo only — never replicate)
- **Icons**: Lucide React — 2px stroke, round caps/joins, inherits text color
- **Voice**: Sentence case · no emojis · short labels · verb-first actions · plain language

## Design Rules (Mandatory)

- **Never create custom UI components** — always use shadcn/ui: `bunx shadcn@latest add [name]`
- **Never introduce new accent colors** — Sienna is the only brand color; use semantic colors for status
- **Never create custom icon sets** — use Lucide React from the existing install
- **Never recreate what shadcn already provides** — check the registry first
- **Dark-mode first** — every new UI element must look correct on `#0A0A0A`
- Use `tailwind-shadcn` skill before any styling work or component additions

## Product Capabilities

- **Projects** — milestone tracking, sprints, backlog, team members, project updates, resources
- **Issues** — kanban / list / timeline views, sub-issues, relations, labels, sprints, auto-triage
- **Whiteboards** — real-time Excalidraw boards, AI diagram generation, comment pins overlay
- **Documents** — Plate.js rich editor, real-time Yjs collaboration, threaded comments, AI slash commands
- **Notes** — lightweight BlockNote editor per workspace
- **Tasks** — personal task management, my tasks view, status kanban board
- **Clients** — CRM with contacts, linked to projects
- **Files** — file storage and management via UploadThing
- **Inbox** — unified notifications, @mentions, AI smart digest
- **Analytics** — workspace performance metrics and charts
- **GitHub Integration** — repo indexing, issue sync, webhooks
- **Billing** — Stripe-powered plan limits and subscription management
- **MCP Servers** — custom Model Context Protocol server connections per workspace
- **Admin panel** — user management, org management, analytics (internal)

## AI Features

- **Chat sidebar** — Cmd+J toggle + dedicated `/chat` page with thread browser
- **Streaming** — token-level streaming via Vercel AI SDK, Streamdown renderer
- **Tools** — 21+ workspace tools: create/update issues, search docs, read boards, query data
- **Sub-agents** — presets (Planner, Researcher, Writer) + custom spawning
- **Skills** — composable AI instruction sets, user-configurable
- **Workflows** — Convex Workflows for long-running multi-step agentic tasks with human approval gates
- **RAG pipeline** — indexes issues, documents, notes, comments, GitHub repos; semantic + keyword search
- **Voice** — dictation → transcription via Whisper
- **Inline AI** — Cmd+I in Plate.js editor; selection toolbar for rewrites/summaries
- **Issue AI** — auto-triage, draft descriptions, duplicate detection, @AI comment replies
- **Whiteboard AI** — generate diagrams from prompts, explain existing diagrams
- **Project AI** — sprint planner panel, status report generator, project summary
- **Embedded AI** — context-aware suggestions surfaced throughout the app
- **Rate limiting + audit log** — usage controls and full action trail

## Stack

- **Frontend**: Next.js 16, React 19, TypeScript strict, Turbopack
- **Backend**: Convex 1.32 — real-time queries, mutations, actions, workflows
- **Editors**: Plate.js v52 (rich docs), Excalidraw (whiteboards), BlockNote (notes), TipTap (comments)
- **AI**: Vercel AI SDK v4 (`ai`), `@convex-dev/agent`, `@convex-dev/rag`, `@convex-dev/workflow`
- **UI**: Tailwind CSS 4, shadcn/ui (new-york, neutral), Radix UI, Lucide React, Phosphor Icons
- **Auth**: Convex Auth + Google OAuth
- **Files**: UploadThing
- **Billing**: Stripe via `@convex-dev/stripe`
- **Hosting**: Vercel (frontend), Convex Cloud (backend)
- **Runtime**: Bun

## Project Structure

```
src/
├── app/
│   ├── [orgSlug]/[workspaceSlug]/   # Main app (projects, issues, boards, docs, chat…)
│   │   ├── projects/                # Project list + detail + backlog
│   │   ├── issues/[id]/             # Issue detail
│   │   ├── boards/[id]/             # Whiteboard editor
│   │   ├── docs/[id]/               # Document editor
│   │   ├── notes/                   # Notes editor
│   │   ├── tasks/                   # Personal tasks
│   │   ├── clients/                 # CRM
│   │   ├── inbox/                   # Notifications
│   │   ├── analytics/               # Analytics
│   │   ├── chat/[threadId]/         # AI chat
│   │   └── settings/billing/        # Billing + workspace settings
│   ├── (app)/organizations/         # Org management, onboarding
│   ├── (auth)/                      # Sign-in, dev-login
│   ├── (marketing)/                 # Public landing page
│   ├── admin/                       # Internal admin (users, orgs, analytics)
│   ├── share/[token]/               # Public document share
│   ├── share/board/[token]/         # Public whiteboard share
│   └── docs/                        # In-app docs (Fumadocs)
├── components/
│   ├── ai/                          # All AI UI — chat, sidebar, actions, artifacts, editor AI
│   ├── ai-elements/                 # Primitive AI chat components (prompt-input, message, reasoning…)
│   ├── issues/                      # Issue list, board, detail, create modals
│   ├── projects/                    # Dashboard, milestones, sprint planner, resources
│   ├── documents/                   # Plate.js editor + comments sidebar
│   ├── whiteboards/                 # Excalidraw + AI toolbar + comment pins
│   ├── notes/                       # BlockNote editor
│   ├── tasks/                       # Task kanban, my tasks
│   ├── clients/                     # CRM details and drawers
│   ├── billing/                     # Plan, usage, upgrade UI
│   ├── settings/                    # Workspace/org settings, skills, sub-agents
│   ├── organization/                # Org switcher, member management
│   ├── workspace/                   # Workspace selector, creation dialogs
│   ├── inbox/                       # Notifications, filter
│   ├── providers/                   # workspace-context, organization-context
│   └── ui/                          # shadcn/ui components + Plate.js node components
├── hooks/                           # use-ai-chat, use-convex-yjs, use-upload-file, etc.
└── lib/                             # AI models, uploadthing, crypto, analytics, converters

convex/
├── ai/                              # Chat, agents, RAG, tools, workflows, skills, sub-agents
│   ├── chat.ts                      # Core streaming chat handler
│   ├── agents.ts / subAgents.ts     # Agent execution + presets
│   ├── rag.ts / search.ts           # RAG pipeline + semantic search
│   ├── skills.ts / skillParser.ts   # Composable AI skills
│   ├── workflows/                   # Long-running agentic workflows
│   └── indexing/                    # Issue, doc, note, comment, GitHub indexers
├── schema.ts                        # Full DB schema (source of truth)
├── organizations.ts / workspaces.ts # Multi-tenant model
├── issues.ts / projects.ts          # Core domain
├── documents.ts / whiteboards.ts    # Content types
├── billing.ts                       # Stripe integration
├── github.ts / mcpServers.ts        # External integrations
└── workflow.ts                      # Convex Workflows

tests/
├── unit/                            # Vitest unit tests
├── integration/                     # Vitest integration tests
└── e2e/                             # Playwright E2E tests
```

## Commands

```bash
bun run dev          # Dev server (Convex + Next.js), port 4000
bun run dev:next     # Next.js only
bun run dev:convex   # Convex only
bun run build        # Production build
bun run lint         # Biome check
bun run lint:fix     # Biome autofix
bun run format:check # Biome format check (no write)
bun run typecheck    # TypeScript check
bun run test         # Vitest tests (unit + integration)
bun run test:unit    # Vitest unit tests only
bun run test:integration # Vitest integration tests only
bun run test:coverage # Vitest coverage report
bun run test:changed # Run only tests related to changed files (feature-scoped)
bun run test:gate    # Fast non-E2E gate (format + lint + typecheck + unit + integration + coverage)
bun run test:e2e     # Playwright E2E
bun run test:policy  # Enforce feature test update policy
bun run test:all     # Consolidated non-E2E gate (test:gate)
bun run clean        # Kill stale processes + clear cache
bun run changeset    # Add changeset before merging user-facing changes
```

## Dev Server

- Default port: **4000** (`DEV_PORT=<n>` to override)
- `bun run dev` → runs `scripts/dev-bootstrap.sh` → launches Convex + Next.js together
- Bootstrap log: `.dev/dev-bootstrap.log`
- Split-terminal mode: `bun run dev:convex` + `bun run dev:next` independently
- `EADDRINUSE` / zombie esbuild / stale cache → `bun run clean`
- Next.js DevTools MCP (`nextjs_index`, `nextjs_call`) for server logs only — never for browser automation
- Codex MCP registration is: `codex mcp add next-devtools -- npx next-devtools-mcp@latest`
- Available Codex MCPs in this workspace: `convex`, `plate`, `next-devtools`, `context7`, `linear`.
- For any boards and Plate.js work, use the `plate` MCP first (`npx shadcn@latest mcp`) so editor/plugin decisions are MCP-guided.
- For any Next.js work, run a dedicated Next.js DevTools MCP session: `nextjs_index` then `nextjs_call` with `get_project_metadata`, `get_errors`, `get_page_metadata`, `get_logs`, `get_server_action_by_id`, and `get_routes`.
- The server is available globally and auto-discovers the running Next.js dev server at `http://localhost:<port>/_next/mcp` (defaults to `http://localhost:4000/_next/mcp` in this repo)

## CI/CD

### Architecture

Three GitHub Actions workflows — contributors need only repository access; no Vercel or Convex seats required.

| Workflow | Trigger | Does |
|---|---|---|
| `ci.yml` | Every PR + push to `main` | Lint · typecheck · unit/integration tests · changeset warning |
| `preview.yml` | PR open/update (not draft) | Convex preview deploy + Vercel preview deploy + PR comment |
| `production.yml` | CI passes on `main` (workflow_run) | Convex prod deploy + Vercel prod deploy + release/tag |

**Vercel Git integration must be disabled** — otherwise Vercel double-deploys alongside Actions.

### How deployments work

```
vercel pull → vercel build → vercel deploy [--prod]
```

`vercel build` runs the `vercel.json` buildCommand:
```
npx convex deploy --cmd-url-env-var-name NEXT_PUBLIC_CONVEX_URL --cmd 'next build'
```
The `CONVEX_DEPLOY_KEY` type controls the target:
- `preview:<team>:<project>|<base64>` → Convex preview (auto-named from branch)
- `prod:<instance>|<base64>` → Convex production

### Required GitHub secrets

| Secret | Used by |
|---|---|
| `CONVEX_DEPLOY_KEY_PREVIEW` | `preview.yml` |
| `CONVEX_DEPLOY_KEY_PROD` | `production.yml` |
| `VERCEL_TOKEN` | `preview.yml`, `production.yml` |

### Changesets

- Add before merging any user-facing change: `bun run changeset`
- Include the `.changeset/*.md` file in the PR (CI warns if missing)
- Changesets action manages version PRs and git tags automatically
- Internal refactors / chores: no changeset required

### Test Policy

- Every feature change must include test updates for the feature being changed.
- Agents run **only feature-scoped tests** during development — never the full suite.
- `test:gate` and `test:all` are **CI-only** — they run in GitHub Actions, not during agent work.
- E2E tests (`test:e2e`) are **never run by agents** unless the user explicitly requests it.
- `test:policy` is **CI-only** — enforced in the PR pipeline, not during agent work.

## Skills — When to Use Which

Always check for a matching skill before implementing. Invoke with the `Skill` tool.

| Skill                     | When to invoke                                                                    |
| ------------------------- | --------------------------------------------------------------------------------- |
| `convex-rules`            | **Always** for Convex functions — queries, mutations, actions, schema, validators |
| `ai-sdk`                  | Building or modifying AI features — streaming, tools, agents, `useChat`           |
| `ai-elements`             | Adding AI chat UI to `src/components/ai/` or `src/components/ai-elements/`        |
| `react-best-practices`    | Writing React components, memoization, render optimization                        |
| `nextjs-patterns`         | Server vs client components, App Router layouts, data fetching                    |
| `tailwind-shadcn`         | **Always** before styling or adding UI components                                 |
| `test-driven-development` | **Before** writing implementation — tests first                                   |
| `agent-browser`           | **Always** to verify UI changes in the browser                                    |
| `sprint-protocol`         | Sprint planning (4-8 stories, aggressive packing), execution, review              |
| `git-workflow`            | Commits, PRs, branches, changesets                                                |

## Slash Commands

- `/refine` — Investigate → fix → verify. Task list first, always.
- `/sprint-start <id> <goal>` — Initialize sprint, run intake decomposition
- `/sprint-plan <id>` — Produce reviewed, implementation-ready stories
- `/sprint-finalize <id>` — Freeze README/INSTRUCTIONS/PROGRESS contracts
- `/sprint-execute <id>` — Execute stories with dependency-aware orchestration
- `/sprint-review <id>` — Audit outcomes, classify follow-up
- `/sprint-retro <id>` — Write retrospective, process improvements

## Hooks (Auto-Run on Every File Write)

1. **Biome** — `biome check --write --unsafe` → format + lint + autofix (scoped to the edited file)
2. **TypeScript** — `tsc --noEmit | grep <file>` → type errors for the edited file only

## Agent Protocol — How to Work

### Standard Task Flow (always in this order)

1. **TaskCreate first** — create a task list before ANY work. This survives compaction.
2. **Investigate** — read relevant files, understand current state before touching anything
3. **Plan** — outline the approach, identify files to change, present to user if non-trivial
4. **Implement** — make the smallest correct diff; use appropriate skills
5. **Feature-scoped verify** — run only the tests related to the feature you changed:
   - Write unit/integration tests for the code you changed
   - Run only those specific test files (e.g. `bunx vitest run tests/unit/my-feature.test.ts`)
   - If tests fail → fix the code, re-run only the failing test files
   - **NEVER** run `test:gate`, `test:all`, `test:e2e`, or the full test suite — those are CI-only
6. **Report** — summarize what was done, what was skipped, any blockers

After compaction: `TaskList` → re-read relevant files → continue. Never work from memory.

### When to Spawn a Team

- Task touches 3+ features or requires parallel research → `TeamCreate` + spawn teammates via `Task` tool with `team_name`
- Sprint execution → always use teams (see `sprint-protocol` skill)
- Never use local sub-agent types (Explore, Plan) for implementation work — use named teammates
- Max 3 concurrent execution workers; no file overlap between workers
- Shut down teammates with `SendMessage` (`shutdown_request`) when work is done
- Clean up with `TeamDelete` when all work is done

### Sprint Story Sizing

- **4-8 stories** per sprint (typical), **12-15 max**. Never 20+.
- **10-30 files** per story, **500-2000 lines**, **5-12 tasks**
- Pack aggressively: 3-5 related bugs = 1 story, feature + tests = 1 story
- Each story startup costs ~20K tokens — fewer stories = less overhead

### Asking vs Assuming

- Unclear intent → **ask** before implementing
- Major structural change → **present the plan** and wait for approval
- Planning sessions produce **markdown only** — never code changes during planning

## Golden Rules — DO

- Server Components by default; `"use client"` only when interactivity requires it
- Check auth in every mutation: `await getAuthUserId(ctx)`
- Use `convex-rules` skill for all Convex code
- Use `tailwind-shadcn` skill before any UI work
- Use `agent-browser` skill to verify every UI change
- Write tests for the feature you're implementing
- Run only feature-scoped tests — never the full suite
- Add a changeset for every user-facing PR: `bun run changeset`
- Keep PRs focused — one concern per PR

## Golden Rules — DO NOT

- **NEVER** modify: `convex/_generated/`, `node_modules/`, `.next/`
- **NEVER** use `browser_eval` (Next.js DevTools MCP) for browser verification — use `agent-browser` skill
- **NEVER** skip `convex-rules` skill when writing backend code
- **NEVER** commit directly to `main` — always branch + PR
- **NEVER** force-push without explicit user instruction
- **NEVER** produce code changes during a planning/research session
- **NEVER** add features, refactors, or "improvements" beyond what was asked
- **NEVER** add speculative error handling, fallbacks, or abstractions
- **NEVER** create custom UI components when shadcn has an equivalent
- **NEVER** introduce new brand colors — Sienna only
- **NEVER** run `test:gate`, `test:all`, `test:e2e`, or the full test suite — those are CI-only
- **NEVER** claim completion while feature-scoped tests are failing

## CLIs

```bash
bunx shadcn@latest add [name]   # Add shadcn component
npx convex env set KEY val       # Set Convex env variable
vercel deploy                    # Manual preview deploy
gh pr create                     # Create PR
bun run changeset                # Add changeset
```

## Commits

```
feat|fix|chore|docs: description

- Ansar
```
