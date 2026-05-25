# Changelog

## 0.2.0

### Minor Changes

- d16ea3b: ## Per-project issue status resolution + status categories

  ### The bug — fixed

  On cross-project views (My Issues, Inbox preview, AI duplicate-detection panels), an issue whose status was a _project-only_ custom key — e.g. a project defining "Testing in staging" with key `testing_staging` — rendered as the workspace fallback ("To Do") because every row was being interpreted by a single workspace-level status dictionary.

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

- e0acfed: Remove organization-prefixed workspace URLs, add multi-repo GitHub connections with OAuth/PAT flows, and improve project view settings persistence and grouping.
- 7e2855b: Add AI tools to export whiteboard text for planning, batch-create issues after one approval, and document the sprint-from-board workflow in the default agent prompt.

### Patch Changes

- c817dea: ## Issue drag-and-drop, create flows, and assignee fixes

  ### Drag-and-drop: issues to the sidebar
  - Drag an issue from any board or list view onto a sidebar sprint, backlog, or project — the issue moves and the target lights up sienna to confirm
  - Hover over a collapsed project or sprint folder mid-drag and it auto-expands after ~400ms so you can reach nested drop targets without clicking first
  - Card shrinks to ~45% while hovering a sidebar drop target so you can aim accurately at narrow rows
  - Pointer position is the source of truth for sidebar drops — dnd-kit's rect-based collision detection no longer hijacks releases near the board/sidebar edge
  - Made the `DragOverlay` pointer-transparent so `elementFromPoint` hits the real sidebar node instead of the floating card (the reason sidebar drops silently failed from the board view)

  ### DnD performance
  - Consolidated per-item `pointermove` listeners into a single rAF-throttled global handler shared by drop-hover highlighting and hover-to-expand
  - Removed dozens of per-row `getBoundingClientRect` calls per pointer tick — drag feel is noticeably snappier on workspaces with many sidebar rows

  ### Issue creation
  - Quick-create auto-inherits the current sprint when you're on a sprint detail URL (applies to `C`/`V` shortcuts and every `openQuickCreate()` call site that doesn't pin a different project)
  - My Issues board view now renders an inline "+ Add issue" at the bottom of every status column
  - Inline create + toolbar "+ New issue" on My Issues pre-fill current user as assignee plus any single-valued filter (project, priority, labels, status, sprint) so the new issue immediately matches the view
  - Project detail toolbar "+ Create issue" extends its sprint-aware preset to also carry status, priority, labels, and assignees from active filters
  - Per-group "+" in the list view reads the parent's filter state when `hideFilter` is set — previously it read an unused local filter state and produced empty presets

  ### Backlog operations
  - New dedicated "Backlog" button on the issue bulk action bar — one click instead of three through the Sprint dropdown, available in every scope including sprint detail
  - Matching "Backlog" button on the task bulk action bar (shortcuts `Status → Backlog`)
  - New "Move to backlog" menu item on every issue's `…` menu in list rows and board cards

  ### Sidebar structure
  - Sidebar no longer hides this project's sprints, docs, and boards while viewing its backlog page — the full tree stays visible everywhere, which matters now that sprint rows are drop targets
  - Project row itself is a drop target — drop on a project to move the issue into its backlog

  ### Assignee fixes
  - Unassigning a single issue now actually clears the server. Every client path (list row picker, preview sidebar, full issue detail page) sends an empty array `[]` instead of `undefined` — Convex drops undefined fields on the wire, which silently left the server untouched
  - "Unassigned" option at the top of the assignee dropdown in the issue preview sidebar (clears everyone in one click)
  - Tasks assignee picker (`TaskDetailSheet`, `TaskQuickCreateModal`) now has an inline "Unassigned" option via a new `onClear` / `clearLabel` prop on `GenericPicker`

  ### Issue preview sidebar
  - Panel is now scrollable — content was overflowing the viewport so the new comments section at the bottom was unreachable
  - Added the full activity + comments section (reuses `IssueActivitySection` so thread, replies, @mentions, attachments, and AI reply all work identically to the issue detail page)
  - Issue title is no longer truncated; long titles wrap naturally
  - AI summarize panel renders full-width below the Activity header instead of cramped inside the header's narrow flex row (which made the summary wrap one word per line)

  ### Bug fixes
  - Fixed production crash on any issue whose description contained a link — `LinkElement` called `editor.getApi(SuggestionPlugin).suggestion.suggestionData(...)` but `SuggestionKit` is omitted from the simple Plate variant used on issues, so `.suggestion` was undefined. Now guarded with optional chaining.

  ### Tests
  - Added `tests/unit/sidebar-drag.test.ts` (15 tests) covering drag flag lifecycle, subscription semantics, drop-target resolution, pointer hit-testing priority, and the drop-success pulse

- f948ecc: ## v0.1.1

  ### Auth flow improvements
  - Added email OTP support for password reset and email verification via Resend
  - Refactored sign-in form with multi-step flows (sign-in, sign-up, forgot password, OTP verification)
  - Implemented secure redirect handling with URL sanitization for OAuth callbacks
  - Added rate limiting infrastructure for auth actions
  - Added auth feature flags for email verification and password reset capabilities

  ### Organization and workspace management
  - Added demo workspace support with expiry tracking and seed status
  - Implemented bidirectional membership sync (organization + workspace) on invite code join
  - Added onboarding guards with unauthenticated redirect and workspace routing
  - Added demo workspace popup for expiry warnings

  ### Real-time collaboration (Yjs v3)
  - Complete rewrite of Convex Yjs provider with session-based deduplication
  - Improved awareness protocol with presence debouncing and state comparison
  - Added buffer management with separate debounce timers for updates and awareness
  - Implemented retry logic with exponential backoff and jitter
  - Added v3 backend functions for sync and presence
  - Added session ID tracking per tab to prevent duplicate updates

  ### Google Chat integration
  - New Chat SDK integration with Google Chat adapter
  - Workspace-level connection management and policy configuration
  - User identity linking between Clave and Google Chat accounts
  - Unified webhook handler with routing for mentions, issue actions, approvals, and triage
  - Idempotency enforcement via audit log deduplication
  - Conversation-to-issue triage with AI-powered duplicate detection
  - Action card builders for rich Google Chat message responses

  ### AI and chat improvements
  - Increased max output tokens from 2048 to 16384 for more substantial responses
  - Added prompt persistence (saves user message to DB before generation)
  - Improved stream handling to prevent dangling mutations
  - Added error tracking with errorMessage field on responses
  - Enhanced RAG document indexing for Fumadocs MDX pages
  - Improved transcription with Azure REST API fallback and server VAD support

  ### Dictation improvements
  - Session-based chunking for long recordings (60s chunks)
  - Offline caching via IndexedDB for failed dictations
  - Global dictation provider accessible throughout the app
  - Visual recording indicator and settings pane

  ### Documentation
  - Restructured docs from developer-focused to user-focused content
  - Added new sections: AI, analytics, features, getting started, inbox, settings
  - Rewrote docs index with product overview and capability highlights

  ### CI/CD
  - Added manual workflow dispatch for on-demand CI runs
  - Enhanced CI workflow documentation for token-based team access
  - Team members can control full CI/CD pipeline via GitHub without Vercel or Convex dashboard access

  ### Test fixes
  - Fixed auth test assertions to use authenticated queries for org operations
  - Fixed Google Chat webhook route test mock hoisting
  - Fixed Yjs provider test type assertions
  - Removed stale ts-expect-error directive from source module

All notable changes to Clave will be documented in this file.

## 0.1.0 — 2026-02-21

### Added

#### Core Platform

- Real-time collaborative workspace with multi-user presence
- Workspace-scoped data with per-user authentication (Convex Auth + Google OAuth)

#### Sidebar

- Collapsible icon sidebar mode (`Cmd+B`) with tooltips in collapsed state
- Collapsible dropdown sections (Recents, Favorites, Active Projects) with per-user persistence
- Recents tracking: top 5 recently accessed items with entity-type icons
- Keyboard shortcuts menu dialog (46+ shortcuts, accessible from sidebar footer)
- Bug report dialog with GitHub Issues integration

#### Documents

- Rich collaborative document editor (Plate.js with 40+ plugins)
- Real-time multiplayer editing via Yjs + Convex sync
- Document comments with threaded replies and presence avatars
- Document sharing with public read-only view
- GIF picker, media embeds, code blocks, tables, math, and more

#### Whiteboards

- Excalidraw-powered infinite canvas with real-time collaboration
- Whiteboard comments with pin overlays
- Whiteboard sharing with public view

#### Projects

- Project dashboard with milestones, tasks, resources, and assets
- Project description editor and overview panel

#### Issues

- Issue tracking with list, board (kanban), and timeline views
- Issue relations, labels, sprints, and priority management
- Quick-create and full-create modals

#### AI Features

- AI chat sidebar with thread management
- AI teammate integration
- Editor AI inline commands

#### Documentation

- In-app docs at `/docs` powered by Fumadocs with full-text search

#### Infrastructure

- Changesets-based version management workflow
- CI/CD pipeline (GitHub Actions)
- Preview deployments via Vercel
