# Clave

> Build in sync.

AI-native project management and collaboration platform. Combines Linear-style issue tracking, Notion-style documents, real-time whiteboards, and a deeply integrated AI agent layer — all in one workspace.

## What is Clave?

Clave is a thinking workspace. AI operates as a first-class teammate — aware of your projects, issues, docs, and conversations. Every surface has context-aware AI built in, not bolted on.

## Features

- **Projects** — milestones, sprints, backlog, team members, project updates
- **Issues** — kanban, list, and timeline views; sub-issues; relations; labels; auto-triage
- **Whiteboards** — real-time Excalidraw with AI diagram generation and comment pins
- **Documents** — rich Plate.js editor with real-time collaboration (Yjs), threaded comments, AI slash commands
- **Notes** — lightweight block editor per workspace
- **Tasks** — personal task management with kanban view
- **Clients** — lightweight CRM with contacts, linked to projects
- **Files** — file storage and management
- **Inbox** — unified notifications, @mentions, AI smart digest
- **AI Chat** — streaming chat with 21+ workspace tools, sub-agents, skills, RAG, and voice input
- **GitHub Integration** — repo indexing, issue sync, webhooks
- **Analytics** — workspace performance metrics

## Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 16, React 19, TypeScript |
| Backend | Convex (real-time, serverless) |
| AI | Vercel AI SDK v4, `@convex-dev/agent`, `@convex-dev/rag`, `@convex-dev/workflow` |
| Editors | Plate.js (docs), Excalidraw (boards), BlockNote (notes) |
| UI | Tailwind CSS 4, shadcn/ui, Radix UI |
| Auth | Convex Auth + Google OAuth |
| Files | UploadThing |
| Billing | Stripe |
| Hosting | Vercel + Convex Cloud |
| Runtime | Bun |

## Getting Started

### Prerequisites

- [Bun](https://bun.sh) 1.1+
- [Node.js](https://nodejs.org) 20+
- Convex account
- Google OAuth credentials

### Installation

```bash
git clone https://github.com/AnsarUllahAnasZ360/millhouse-web.git
cd millhouse-web
bun install
npx convex dev
bun run dev
```

### Environment

Copy `.env.example` to `.env.local`:

```
CONVEX_DEPLOYMENT=dev:your-deployment
NEXT_PUBLIC_CONVEX_URL=https://your-deployment.convex.cloud
```

Set auth credentials:

```bash
npx convex env set AUTH_GOOGLE_ID <your-google-client-id>
npx convex env set AUTH_GOOGLE_SECRET <your-google-client-secret>
```

## Development

```bash
bun run dev          # Start dev server (Convex + Next.js) on port 4000
bun run dev:next     # Next.js only (split-terminal mode)
bun run dev:convex   # Convex only (split-terminal mode)
bun run build        # Production build
bun run lint         # Biome linter
bun run typecheck    # TypeScript check
bun run test         # Vitest unit tests
bun run test:e2e     # Playwright E2E tests
bun run clean        # Kill stale processes and clear cache
```

**Port**: defaults to `4000`. Override with `DEV_PORT=<n> bun run dev`.

**Troubleshooting**: `EADDRINUSE`, zombie processes, or stale cache → `bun run clean`.

## Architecture

```
src/
├── app/[orgSlug]/[workspaceSlug]/   # Main app (projects, issues, boards, docs, chat…)
├── components/
│   ├── ai/                          # AI chat, sidebar, artifacts, inline AI
│   ├── issues/                      # Issue tracking UI
│   ├── projects/                    # Project management UI
│   ├── documents/                   # Rich document editor
│   ├── whiteboards/                 # Whiteboard editor
│   └── ui/                          # shadcn/ui components
└── hooks/ lib/

convex/
├── ai/                              # Chat, agents, RAG, tools, workflows
├── schema.ts                        # Database schema
└── *.ts                             # Domain functions
```

## Deployment

Pull requests get automatic preview deployments (Convex + Vercel) with URLs posted as a PR comment.

Merges to `main` trigger production deployment: Convex first, then Vercel, then a GitHub release via [Changesets](https://github.com/changesets/changesets).

Add a changeset before merging user-facing changes:

```bash
bun run changeset
```

## License

MIT
