---
"clave": patch
---

## Issue drag-and-drop, create flows, and assignee fixes

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
