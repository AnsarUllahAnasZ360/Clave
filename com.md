# Test And Quality Workflow

Default development gate excludes end-to-end execution.

## Required command

Run this before finishing any implementation:

```bash
bun run test:all
```

`test:all` runs:

1. `bun run format:gate`
2. `bun run lint:gate`
3. `bun run typecheck:gate`
4. `bun run test:unit`
5. `bun run test:integration`
6. `bun run test:coverage`

## Mandatory behavior for Codex and Claude

1. If any step fails, fix the issue immediately.
2. Do not report a failure as “pre-existing” and leave it unresolved.
3. Do not complete a task while gate checks are failing.
4. Feature changes must include unit and integration test updates.

## E2E policy

`bun run test:e2e` remains available, but it is not part of the default development gate in this repository.
