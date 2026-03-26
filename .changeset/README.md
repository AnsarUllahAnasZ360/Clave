# Changesets — Contributor Workflow

This project uses [Changesets](https://github.com/changesets/changesets) for version management and changelog generation.

## When to add a changeset

Add a changeset for every PR that contains a user-visible change:
- New features
- Bug fixes
- Breaking changes
- Deprecations

You do **not** need a changeset for internal refactors, docs-only changes, or test additions.

## Adding a changeset (on your PR branch)

```bash
bun run changeset
```

This opens an interactive prompt:
1. **Select packages** — press Space on `clave`, then Enter
2. **Select bump type** — `patch` (bug fix), `minor` (new feature), or `major` (breaking change)
3. **Write a summary** — one-line description of the change (shown in CHANGELOG.md)

A `.changeset/<random-id>.md` file will be created. Commit it alongside your code changes.

## Releasing a new version

When ready to cut a release (done by maintainers):

```bash
# 1. Consume all pending changesets → bumps version + updates CHANGELOG.md
bun run changeset:version

# 2. Commit the version bump
git add . && git commit -m "chore: release v$(node -p "require('./package.json').version")"

# 3. Tag and push
git tag "v$(node -p "require('./package.json').version")"
git push && git push --tags
```

## Bump type guide

| Bump | When to use | Example |
|------|-------------|---------|
| `patch` | Bug fix, no API change | Fix sidebar icon tooltip not showing |
| `minor` | New feature, backwards compatible | Add recents section to sidebar |
| `major` | Breaking change, requires migration | Rename workspace slug format |

## Config reference

See `.changeset/config.json`:
- `baseBranch`: `main` — changesets are relative to the main branch
- `commit`: `false` — changesets are not auto-committed (commit manually)
- `access`: `restricted` — package is private, not published to npm
