---
"clave": minor
---

## Per-project issue status resolution + status categories

### The bug — fixed

On cross-project views (My Issues, Inbox preview, AI duplicate-detection panels), an issue whose status was a *project-only* custom key — e.g. a project defining "Testing in staging" with key `testing_staging` — rendered as the workspace fallback ("To Do") because every row was being interpreted by a single workspace-level status dictionary.

Each issue's status now resolves via **its own project's** dictionary. A project-only status renders as itself everywhere, including pages that span many projects.

### Phase 1 — per-row resolution

- New helper `useProjectsEffectiveConfigs(workspaceId, projects)` returns a `Map<projectId, EffectiveIssueConfig>`, a `getConfigForIssue(issue)` resolver, and a deduplicated `unionStatusItems` for cross-project list/kanban column axes.
- `IssueBoardView` and `IssueListView` switch to per-issue resolution when no `projectId` prop is set. Project-scoped views are unchanged.
- `MyIssuesInsightsPanel`, `DuplicateDetection` updated to resolve per-issue.
- `IssuePreviewSidebar` and `InboxPage` were already correct (they look up the issue's project before resolving) and need no change.
- 5 new unit tests in `tests/unit/effective-issue-config.test.ts` cover project-only key resolution, project-overrides-workspace, ordering, and the `statusRecord` shape.

### Phase 2 — status categories

Every status (built-in or custom) is now classified into one of five **categories**: `backlog`, `unstarted`, `started`, `completed`, `canceled` (Linear-style).

Cross-project views can group cards by category (5 stable buckets that mean the same thing across every project) instead of by raw status key (which doesn't compose across projects).

- **Schema**: `statusCategoryValidator` and `customStatusValidator` exported from `convex/schema.ts`. Both `workspaceSettings.customStatuses` and `projects.customStatuses` accept optional `category` per entry. Optional during the backfill window — code defends against `undefined`.
- **Defaults**: built-in `triage`/`backlog` → `backlog`, `todo` → `unstarted`, `in_progress`/`in_review` → `started`, `done` → `completed`, `cancelled` → `canceled`.
- **Inference**: `convex/lib/statusCategory.ts` exports `inferStatusCategory({ key, name })`. Tries exact key match, then name keywords, defaults to `unstarted`. Pure helper consumed by the frontend resolver, the create/update mutations, and the backfill migration.
- **Resolver**: `resolveStatusCategory(def, key)` exposed from the hook — explicit category > built-in mapping > inference. The hook now exposes `getStatusCategory(key)`, `statusesByCategory: Record<StatusCategory, EffectivePickerItem[]>`, and (cross-project) `getCategoryForIssue(issue)`.
- **Mutations**: `workspaceSettings.createCustomStatus` / `updateCustomStatus` and `projects.createCustomIssueStatus` / `updateCustomIssueStatus` accept optional `category`; when omitted, the inference helper picks one from key+name.
- **Editor UIs**: workspace `TypesPane` and per-project `ProjectSettingsTab` now show a category select on each non-default status row.
- **Backfill**: `convex/migrations/backfillStatusCategories.ts` (`runBatch` / `runAll`) idempotently fills missing categories on every workspace settings row and every project. Safe to re-run.

### Cross-project kanban — category-grouped columns

My Issues board (and any other workspace-scoped board with no `projectId`) now groups cards into **5 stable category columns** — Backlog · Not started · In progress · Done · Cancelled — instead of a sprawling union of every project's custom statuses. Single-project boards keep their per-status columns (no behavior change).

- Each card surfaces its **project-specific status** as a chip ("Testing in staging", "QA review") alongside priority and labels, so you don't lose granularity even though the column is a generic category.
- **Drag-drop into a category column** resolves to the issue's own project's first status in that category (per `customStatusOrder`). If the project has no status in the target category, the move is rejected with a toast explaining why — better than silently writing a bogus status the project doesn't recognize.
- The drag overlay also renders the chip so the dragged card is visually identical to its resting state.
- New `resolveStatusForCategory(issue, category)` exposed from `useProjectsEffectiveConfigs`, plus a `STATUS_CATEGORY_COLUMN_CONFIG` map of icons/colors per category.

### My Issues — list view, sub-issues, and tab bar polish

- **Sub-issues in list view**: previously the "Show sub-issues" toggle in display options was wired to nothing — sub-issues rendered as flat rows with no relationship to their parent. Now the toggle is live: when on, sub-issues nest immediately under their parent with a left indent + tree-line `↳` indicator (when the parent is also visible) or a small `↳ PARENT-ID` hint (when the parent isn't in the same view). When off, sub-issues are filtered out entirely.
- **Sub-issues on the board**: cards for sub-issues show a small `↳` mark beside their identifier so you can spot them at a glance.
- **Sub-issue ordering**: within each list group, sub-issues are reordered to sit immediately under their parent regardless of sort key — visual coherence over a strict sort that would otherwise scatter children far from their parents.
- **Project badge by default on My Issues**: the `project` column is now in the default display properties for cross-project views, so users immediately see which project each row belongs to.
- **Group by category** is now a first-class option in the list view's groupBy picker — same 5-bucket axis as the kanban, so list and board grouping stay consistent on cross-project pages.
- **Tab bar (Assigned · Created · Subscribed · Activity)**: added Lucide icons (`UserCheck`, `Pencil`, `Bell`, `Activity`), wrapped the row in a soft container, and gave the active tab a sienna-tinted background + count chip — matches the brand accent and gives the active state genuine visual weight instead of a one-tone background.

Internal additions:
- `IssueListData` and `IssueCardData` now carry `parentId`; the My Issues converters thread it through.
- `IssueListRow` accepts a `parentRef?: { identifier; inView }` prop driving nesting visuals.
- `IssueBoardCard` accepts a `statusBadge` prop (already added in the kanban round) — sub-issue glyph leverages `issue.parentId` directly.
- New `nestSubIssuesInOrder` helper in `IssueListView` interleaves sub-issues after their parents within each group.
- `ListGroupBy` and `GroupByOption` types extended with `"category"`.

### Tests

- `tests/unit/status-category.test.ts` — 12 tests covering key matching, name fallback, default-to-`unstarted`, and key-beats-name precedence.
- `tests/unit/effective-issue-config.test.ts` — 10 new tests for per-project resolver, category resolution, `statusesByCategory` grouping, and the `category → status` precedence used by the kanban drag-drop resolver.

### Follow-ups (not in this PR)

- After deploy, run `npx convex run migrations/backfillStatusCategories:runAll` to fill categories on any pre-existing custom statuses. Until then, reads use heuristic inference — degraded but correct.
- Workspace owners may want to verify auto-inferred categories on existing custom statuses post-backfill via the new category select in workspace + project settings.
