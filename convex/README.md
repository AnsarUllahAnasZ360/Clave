# Convex Backend

This directory contains all Convex functions for Clave — queries, mutations, actions, and workflows.

## Structure

```
convex/
├── ai/                    # AI chat, agents, RAG pipeline, tools, workflows, skills
│   ├── chat.ts            # Core streaming chat handler
│   ├── agents.ts          # Agent execution
│   ├── subAgents.ts       # Sub-agent presets (Planner, Researcher, Writer)
│   ├── rag.ts             # RAG pipeline + semantic search
│   ├── skills.ts          # Composable AI instruction sets
│   ├── workflows/         # Long-running agentic workflows
│   └── indexing/          # Content indexers (issues, docs, notes, GitHub)
├── schema.ts              # Database schema (source of truth)
├── organizations.ts       # Multi-tenant org management
├── workspaces.ts          # Workspace CRUD and membership
├── issues.ts              # Issue tracking domain logic
├── projects.ts            # Project management
├── documents.ts           # Rich document storage and sync
├── whiteboards.ts         # Whiteboard storage
├── billing.ts             # Stripe subscription integration
├── github.ts              # GitHub repo indexing and webhooks
├── devInit.ts             # Dev-only seed/clear actions
├── devSeed.ts             # Sample data seeding
└── auth.ts                # Authentication configuration
```

## Key Conventions

- **Auth check in every mutation**: Use `await getAuthUserId(ctx)` at the top of every mutation handler.
- **Validators**: Define argument and return validators for all public functions.
- **Internal functions**: Use `internalMutation`, `internalAction`, `internalQuery` for functions that should not be callable from clients.
- **Schema-first**: `schema.ts` is the single source of truth for the database. Update it before writing new queries.

## Environment Variables

Server-side secrets are stored on the Convex deployment, not in `.env.local`:

```bash
npx convex env set KEY "value"
npx convex env list
```

See the root [.env.example](../.env.example) for the full list of Convex env vars and their descriptions.

## Resources

- [Convex documentation](https://docs.convex.dev)
- [Convex functions guide](https://docs.convex.dev/functions)
- [Database reading](https://docs.convex.dev/database/reading-data)
- [Database writing](https://docs.convex.dev/database/writing-data)
