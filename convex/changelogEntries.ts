/**
 * Single source of truth for the app changelog.
 *
 * Add a new object at the top of `CHANGELOG_ENTRIES` on every release. The
 * `syncChangelog` mutation in `versions.ts` reconciles this array against
 * the `appVersions` table on each workspace load — any entry whose `version`
 * string isn't already in the DB gets inserted. Because the mutation is
 * idempotent per-version, pushing to prod and letting the next authed client
 * open the workspace is enough to seed new entries automatically.
 *
 * Rules:
 * - `version` must be unique (string used as the idempotency key).
 * - `releasedAt` is an ISO 8601 string — converted to a ms timestamp on write.
 * - `features` / `bugFixes` are user-facing, plain-English lines. No emojis.
 * - Keep entries in descending version order so reviewers see the latest first.
 */

export type ChangelogEntry = {
	version: string;
	releasedAt: string;
	title: string;
	features: string[];
	bugFixes: string[];
};

export const CHANGELOG_ENTRIES: ChangelogEntry[] = [
	{
		version: "0.5.0",
		releasedAt: "2026-04-21T00:00:00Z",
		title: "Sprint reports: burndown, velocity, schedule-aware summary",
		features: [
			"New 'Reports' tab on every sprint detail page — click the Reports button in the toolbar to swap the issue view for a Jira-style report pane",
			"Burndown chart: daily remaining-issues line vs a linear ideal trend across the sprint window; in-flight sprints leave the future open-ended instead of flatlining to zero",
			"Velocity chart: committed vs completed across the last six sprints in the project, chronological order, so you can read trend at a glance",
			"Summary tiles on the reports pane: committed, completed, open, schedule range, and an 'On track' / 'Behind' chip derived from the burndown",
		],
		bugFixes: [],
	},
	{
		version: "0.4.0",
		releasedAt: "2026-04-20T00:00:00Z",
		title: "Sidebar drag-and-drop, filter-aware creation, assignee fixes",
		features: [
			"Drag any issue from a board or list view onto a sidebar sprint, backlog, or project to move it — target row lights up sienna to confirm",
			"Hover a collapsed project or sprint folder while dragging and it auto-expands after a short dwell, so nested drop targets are reachable without clicking first",
			"Dragged card shrinks when it enters the sidebar so you can aim at narrow sprint rows",
			"My Issues board view now has an inline '+ Add issue' at the bottom of every status column",
			"Inline and toolbar create on My Issues pre-fill the current user as assignee plus any active single-valued filter (project, priority, labels, status, sprint) — new issues immediately match the view",
			"Project-page toolbar 'Create issue' now carries every active single-valued filter into the modal, not just sprint",
			"Per-group '+' in the list view respects the page-level filter state when the parent owns it (previously read an unused local filter)",
			"Quick create (C) and full create (V) shortcuts auto-inherit the current sprint when you're on a sprint detail URL",
			"Dedicated 'Backlog' button on the issue and task bulk action bars — one click instead of three",
			"'Move to backlog' on every issue's row and card `…` menu",
			"Bulk select now works on the board view — shift or cmd/ctrl-click a card to pick it, and the bulk action bar appears with Status, Priority, Label, Assignee, Sprint, Backlog, and Delete",
			"New bulk 'Label' picker (both list and board) — tag every selected issue with a label in one click; existing labels are preserved (union)",
			"Schedule sprints like Jira / ClickUp: set start + end dates on a sprint and it auto-transitions planned → active → completed as the dates cross. Picking a status manually locks it (e.g. marking 'cancelled' or closing early) so the scheduler never clobbers your intent.",
			"Creating a sprint inline now auto-opens the edit dialog pre-focused on the date pickers — keep the inline create fast, still easy to schedule",
			"Sprint detail header shows a 'Starts in Nd' / 'Ends in Nd' / 'Overdue Nd' chip so the schedule is visible at a glance",
			"Project row in the sidebar is a drop target — drop an issue on a project to move it to that project's backlog",
			"Issue preview sidebar now scrolls and includes the full activity + comments section (threaded replies, @mentions, attachments, AI reply)",
			"'Unassigned' option inside the assignee dropdown on issues (preview sidebar) and tasks (detail sheet, quick create) — clears everyone in one click",
			"Sidebar keeps the full project tree visible while viewing the backlog page so sprint drop targets stay reachable",
			"AI activity summary card renders full-width below the Activity header on both the issue detail page and the preview sidebar",
		],
		bugFixes: [
			"Unassigning an issue actually clears the assignee now — every picker sends an empty array instead of undefined, which Convex was dropping on the wire and leaving the server untouched",
			"Sidebar drops from the board view work — the floating drag overlay no longer blocks pointer hit-tests against the sidebar",
			"Sidebar drops at the board/sidebar edge no longer get hijacked by in-view collision detection; pointer position is the source of truth",
			"Production crash on any issue with a link in its description — the link element now guards against the optional Suggestion plugin being absent",
			"Issue title in the preview sidebar wraps instead of truncating",
			"Issue preview sidebar's activity section is reachable on short viewports (the panel is now actually scrollable)",
			"Drag performance: one global pointermove handler replaces per-item listeners and per-row layout thrash",
		],
	},
	{
		version: "0.3.0",
		releasedAt: "2026-04-17T00:00:00Z",
		title: "Active Sprints, doc-aware AI, better approvals",
		features: [
			"Active Sprints filter on My Issues — open the page and see only issues from active sprints; toggle off in one click",
			"Set sprint status (active, planned, completed, cancelled) directly from the sprint detail page and the milestone panel",
			"Sprint picker on issues now scopes to the issue's own project — no more picking sprints that don't belong to it",
			"AI agent can read your documents — full Markdown with headings, tables, images, lists, and code blocks",
			"AI can append to documents and edit specific sections without rewriting the whole doc",
			"Whiteboards now feed the AI's knowledge (new 6th RAG source): images and text are indexed and searchable",
			"Sprint filter in the popover groups sprints by status and shows the project name so you can tell them apart",
		],
		bugFixes: [
			"Approving a batch of AI-proposed issues no longer crashes with a server error",
			"Failed approvals now show the real reason instead of a generic server error",
			"AI 'Get document' returned an empty doc for every collaborative document — it now reads them",
			"Removed the inline AI slash commands and floating AI popover from the document editor (keeping the AI chat sidebar)",
			"Whiteboard image sync tests no longer flake on the CI runtime",
		],
	},
	{
		version: "0.2.0",
		releasedAt: "2026-04-14T00:00:00Z",
		title: "Multi-assign, custom workflows, bulk delete",
		features: [
			"Put multiple people on the same issue — everywhere: inbox, bulk bar, shortcuts, sub-issues, board, list",
			"Custom issue statuses and types per workspace and per project",
			"Drag statuses into the order you actually work in (workspace + project settings)",
			"Bulk delete: select multiple issues and delete them with a confirm dialog",
			"Select-all checkbox now picks up rows inside collapsed groups",
			"Sprint filter on the My Issues page",
			"Faster typing in the issue create modals — no more lag on long descriptions",
			"Status colors flow from settings to kanban, list, timeline, and pickers",
			"Changelog auto-syncs from source on workspace load (no manual seed needed)",
		],
		bugFixes: [
			"Assigned issues now appear on My Issues even with multi-assignees",
			"Activity tab includes issues where you're in the multi-assignee array",
			"Moving an issue to a new project no longer fails when it has a sprint from the old project",
			"GitHub-synced issues no longer crash the My Issues query",
			"Kanban board cards render a primary avatar for multi-assigned issues",
			"Kanban card root is no longer a nested <button>, fixing a hydration warning",
			"Collapsing a group no longer drops its rows from the current selection",
			"Clicking a collapsed group's checkbox now correctly selects its children",
			"Adding images to whiteboards works again (drag-drop and paste)",
			"Adding images to Clave AI chat works again — attachments upload and reach the thread",
		],
	},
	{
		// Backdated so it sorts before v0.2.0 in the Changelog dialog.
		version: "0.1.0",
		releasedAt: "2026-02-14T00:00:00Z",
		title: "Initial Release",
		features: [
			"Real-time collaborative workspace with multi-user presence",
			"Collapsible icon sidebar with keyboard shortcuts menu",
			"Rich document editor with Yjs collaboration",
			"Excalidraw whiteboards with real-time sync",
			"Project management with milestones and sprints",
			"Issue tracking with list, board, and timeline views",
			"AI chat sidebar with thread management",
			"In-app documentation powered by Fumadocs",
		],
		bugFixes: [],
	},
];
