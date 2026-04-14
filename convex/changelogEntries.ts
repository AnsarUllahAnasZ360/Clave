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
