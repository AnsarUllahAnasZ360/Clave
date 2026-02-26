"use node";

import { api } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import type { ActionCtx } from "../_generated/server";

// NOTE: workspaceId and userId can be added to buildContextPrompt signature
// when dashboard page context is implemented (useAIContext does not yet detect dashboard routes).

// ── Types ─────────────────────────────────────────────────────────────────

export interface PageContext {
	type: string;
	entityId: string;
	entityName: string;
	summary: string;
}

// ── Constants ─────────────────────────────────────────────────────────────

const PRIORITY_EMOJI: Record<string, string> = {
	urgent: "🔴",
	high: "🟠",
	medium: "🟡",
	low: "🟢",
	no_priority: "⚪",
};

const ACTIVE_STATUSES = new Set([
	"triage",
	"backlog",
	"todo",
	"in_progress",
	"in_review",
]);

const COMPLETED_STATUSES = new Set(["done", "cancelled"]);

// ── Main Builder ──────────────────────────────────────────────────────────

/**
 * Build a rich, data-pre-loaded context block for the agent's system prompt.
 * Runs inside the sendMessage action — has full ctx.runQuery access.
 * Returns a delimited context section or empty string on failure.
 */
export async function buildContextPrompt(
	ctx: ActionCtx,
	pageContext: PageContext,
): Promise<string> {
	try {
		switch (pageContext.type) {
			case "project":
				return await buildProjectContext(ctx, pageContext.entityId);
			case "issue":
				return await buildIssueContext(ctx, pageContext.entityId);
			case "document":
				return await buildDocumentContext(ctx, pageContext.entityId);
			case "board":
				return await buildWhiteboardContext(ctx, pageContext.entityId);
			default:
				// Unknown page type — fall back to basic summary
				return buildFallbackContext(pageContext);
		}
	} catch (error) {
		console.error(
			"[contextPrompts] buildContextPrompt error:",
			error instanceof Error ? error.message : error,
		);
		// Non-fatal: fall back to basic summary
		return buildFallbackContext(pageContext);
	}
}

// ── Project Context (~400 tokens) ─────────────────────────────────────────

async function buildProjectContext(
	ctx: ActionCtx,
	entityId: string,
): Promise<string> {
	const projectId = entityId as Id<"projects">;

	// Fetch project, issues, milestones, and members in parallel
	const [project, issues, milestones, members] = await Promise.all([
		ctx.runQuery(api.projects.getById, { projectId }),
		ctx.runQuery(api.issues.listByProject, { projectId }).catch(() => []),
		ctx.runQuery(api.milestones.listByProject, { projectId }).catch(() => []),
		ctx.runQuery(api.projectMembers.list, { projectId }).catch(() => []),
	]);

	if (!project) return "";

	// Count issues by priority (open only)
	const openIssues = issues.filter((i: { status: string }) =>
		ACTIVE_STATUSES.has(i.status),
	);
	const priorityCounts: Record<string, number> = {};
	for (const issue of openIssues) {
		const p = issue.priority || "no_priority";
		priorityCounts[p] = (priorityCounts[p] || 0) + 1;
	}

	// Recently completed (done/cancelled in last 7 days)
	const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
	const recentlyCompleted = issues.filter(
		(i: { status: string; completedAt?: number | null }) =>
			COMPLETED_STATUSES.has(i.status) &&
			i.completedAt &&
			i.completedAt > weekAgo,
	);

	// Top urgent/high issues (max 3)
	const urgentIssues = openIssues
		.filter(
			(i: { priority?: string }) =>
				i.priority === "urgent" || i.priority === "high",
		)
		.slice(0, 3);

	// Active milestones
	const activeMilestones = milestones.filter(
		(m: { status: string }) => m.status === "active",
	);

	// Build the context block
	const lines: string[] = [
		`Current context: Project "${project.name}" (${project.status ?? "active"})`,
	];

	if (project.summary) {
		lines.push(`  Summary: ${truncate(project.summary, 150)}`);
	}

	// Issue counts
	const priorityBreakdown = Object.entries(priorityCounts)
		.map(([p, count]) => `${count} ${p} ${PRIORITY_EMOJI[p] ?? ""}`)
		.join(", ");
	lines.push(
		`  Open issues: ${openIssues.length} total${priorityBreakdown ? ` (${priorityBreakdown})` : ""}`,
	);

	if (recentlyCompleted.length > 0) {
		lines.push(`  Recently closed: ${recentlyCompleted.length} this week`);
	}

	// Milestones
	if (activeMilestones.length > 0) {
		const m = activeMilestones[0]; // Show the top active milestone
		const dueStr = m.targetDate ? ` (due ${formatDate(m.targetDate)})` : "";
		lines.push(
			`  Active milestone: ${m.name} — ${m.progressPercentage}% complete${dueStr}`,
		);
	}

	// Top urgent issues
	if (urgentIssues.length > 0) {
		const issueList = urgentIssues
			.map(
				(i: { identifier: string; title: string }) =>
					`${i.identifier}: ${truncate(i.title, 40)}`,
			)
			.join("; ");
		lines.push(`  Top priority: ${issueList}`);
	}

	// Team members
	if (members.length > 0) {
		const names = members
			.slice(0, 5)
			.map((m: { name?: string | null }) => m.name ?? "Unknown")
			.join(", ");
		const suffix = members.length > 5 ? ` and ${members.length - 5} more` : "";
		lines.push(`  Team: ${names}${suffix} (${members.length} members)`);
	}

	lines.push(
		"  You have full context on this project. Answer project questions without calling tools unless more detail is needed.",
	);

	return wrapContextBlock(lines.join("\n"));
}

// ── Issue Context (~350 tokens) ───────────────────────────────────────────

async function buildIssueContext(
	ctx: ActionCtx,
	entityId: string,
): Promise<string> {
	const issueId = entityId as Id<"issues">;

	const [issue, comments] = await Promise.all([
		ctx.runQuery(api.issues.getById, { issueId }),
		ctx.runQuery(api.comments.listByIssue, { issueId }).catch(() => []),
	]);

	if (!issue) return "";

	// Look up assignee name
	let assigneeName = "Unassigned";
	if (issue.assigneeId) {
		try {
			const assignee = await ctx.runQuery(api.users.getById, {
				userId: issue.assigneeId,
			});
			if (assignee?.name) assigneeName = assignee.name;
		} catch {
			// Non-critical
		}
	}

	const lines: string[] = [
		`Current context: Issue ${issue.identifier} — ${issue.title}`,
		`  Status: ${issue.status} | Priority: ${issue.priority} | Assignee: ${assigneeName}`,
	];

	if (issue.description) {
		lines.push(
			`  Description: ${truncate(issue.description.replace(/\n+/g, " "), 200)}`,
		);
	}

	if (issue.dueDate) {
		lines.push(`  Due: ${formatDate(issue.dueDate)}`);
	}

	const createdStr = formatRelativeTime(issue._creationTime);
	const updatedStr = issue.updatedAt
		? formatRelativeTime(issue.updatedAt)
		: createdStr;
	lines.push(`  Created: ${createdStr} | Last updated: ${updatedStr}`);

	// Recent comments (last 2)
	if (comments.length > 0) {
		const recentComments = comments.slice(-2);
		for (const c of recentComments) {
			const authorName = c.author?.name ?? "Unknown";
			const commentText = truncate((c.body ?? "").replace(/\n/g, " "), 80);
			if (commentText) {
				const timeStr = formatRelativeTime(c._creationTime);
				lines.push(`  Comment (${authorName}, ${timeStr}): "${commentText}"`);
			}
		}
	}

	// Parent issue context
	if (issue.parent) {
		lines.push(
			`  Parent: ${issue.parent.identifier} — ${issue.parent.title} (${issue.parent.status})`,
		);
	}

	lines.push(
		"  You have full context on this issue. Answer questions without calling tools unless more detail is needed.",
	);

	return wrapContextBlock(lines.join("\n"));
}

// ── Document Context (~300 tokens) ────────────────────────────────────────

async function buildDocumentContext(
	ctx: ActionCtx,
	entityId: string,
): Promise<string> {
	const documentId = entityId as Id<"documents">;

	const doc = await ctx.runQuery(api.documents.getById, { documentId });
	if (!doc) return "";

	const lines: string[] = [
		`Current context: Document "${doc.title || "Untitled"}"`,
	];

	// Last edited info
	if (doc.updatedAt) {
		lines.push(`  Last edited: ${formatRelativeTime(doc.updatedAt)}`);
	}

	// Content preview
	if (doc.content) {
		const preview = truncate(doc.content.replace(/\n+/g, " ").trim(), 400);
		lines.push(`  Content preview: ${preview}`);
	} else {
		lines.push("  Content: Empty document");
	}

	lines.push(
		"  Answer document questions using this context. Call tools only for specific quoted content or edits.",
	);

	return wrapContextBlock(lines.join("\n"));
}

// ── Whiteboard Context (~400 tokens) ──────────────────────────────────────

const MAX_BOARD_ELEMENTS = 60;

async function buildWhiteboardContext(
	ctx: ActionCtx,
	entityId: string,
): Promise<string> {
	const whiteboardId = entityId as Id<"whiteboards">;

	const board = await ctx.runQuery(api.whiteboards.getById, { whiteboardId });
	if (!board) return "";

	const lines: string[] = [`Current context: Whiteboard "${board.title}"`];
	lines.push(`  Whiteboard ID: ${board._id}`);

	if (board.updatedAt) {
		lines.push(`  Last modified: ${formatRelativeTime(board.updatedAt)}`);
	}

	// Parse and summarize board content so the AI can "see" what's on the canvas
	const contentSummary = summarizeBoardContent(board.sceneData);
	if (contentSummary) {
		lines.push("");
		lines.push("  Board contents:");
		lines.push(contentSummary);
	} else {
		lines.push("  Board contents: Empty canvas (no elements)");
	}

	lines.push("");
	lines.push(
		"  You can see the full board contents above. For diagram generation requests, call the write tool `generateWhiteboardDiagram` and pass this exact whiteboard ID.",
	);

	return wrapContextBlock(lines.join("\n"));
}

/**
 * Parse Excalidraw sceneData JSON and produce a human-readable summary
 * of shapes, text, and connections on the board.
 */
function summarizeBoardContent(sceneData?: string): string | null {
	if (!sceneData) return null;

	try {
		const parsed = JSON.parse(sceneData) as unknown;
		if (!Array.isArray(parsed)) return null;

		type SceneElement = {
			id: string;
			type: string;
			x: number;
			y: number;
			width: number;
			height: number;
			text?: string;
			isDeleted?: boolean;
			containerId?: string;
			boundElements?: Array<{ id: string; type: string }>;
			startBinding?: { elementId?: string };
			endBinding?: { elementId?: string };
		};

		const elements = (parsed as SceneElement[]).filter(
			(el) => el && typeof el === "object" && !el.isDeleted && el.type,
		);

		if (elements.length === 0) return null;

		// Build a lookup for bound text extraction
		const elementMap = new Map(elements.map((el) => [el.id, el]));

		function getBoundText(el: SceneElement): string | null {
			if (el.text) return el.text;
			const textBinding = el.boundElements?.find((b) => b.type === "text");
			if (!textBinding) return null;
			const textEl = elementMap.get(textBinding.id);
			return textEl?.text ?? null;
		}

		const shapes = elements.filter(
			(e) =>
				e.type === "rectangle" ||
				e.type === "ellipse" ||
				e.type === "diamond" ||
				e.type === "freedraw" ||
				e.type === "image" ||
				e.type === "frame",
		);
		const standaloneText = elements.filter(
			(e) => e.type === "text" && !e.containerId,
		);
		const arrows = elements.filter(
			(e) => e.type === "arrow" || e.type === "line",
		);

		const lines: string[] = [];
		lines.push(`    ${elements.length} elements total`);

		if (shapes.length > 0) {
			lines.push("    Shapes:");
			for (const shape of shapes.slice(0, MAX_BOARD_ELEMENTS)) {
				const label = getBoundText(shape);
				const labelStr = label ? ` "${truncate(label, 50)}"` : "";
				lines.push(
					`      - ${shape.type}${labelStr} at (${Math.round(shape.x)},${Math.round(shape.y)}) size ${Math.round(shape.width)}x${Math.round(shape.height)}`,
				);
			}
			if (shapes.length > MAX_BOARD_ELEMENTS) {
				lines.push(
					`      ... and ${shapes.length - MAX_BOARD_ELEMENTS} more shapes`,
				);
			}
		}

		if (standaloneText.length > 0) {
			lines.push("    Text:");
			for (const t of standaloneText.slice(0, 20)) {
				lines.push(
					`      - "${truncate(t.text ?? "", 60)}" at (${Math.round(t.x)},${Math.round(t.y)})`,
				);
			}
			if (standaloneText.length > 20) {
				lines.push(
					`      ... and ${standaloneText.length - 20} more text elements`,
				);
			}
		}

		if (arrows.length > 0) {
			lines.push("    Connections:");
			for (const arrow of arrows.slice(0, 20)) {
				const fromEl = arrow.startBinding?.elementId
					? elementMap.get(arrow.startBinding.elementId)
					: null;
				const toEl = arrow.endBinding?.elementId
					? elementMap.get(arrow.endBinding.elementId)
					: null;
				const fromLabel = fromEl ? getBoundText(fromEl) : null;
				const toLabel = toEl ? getBoundText(toEl) : null;
				const fromStr = fromLabel
					? `"${truncate(fromLabel, 30)}"`
					: (arrow.startBinding?.elementId?.slice(0, 8) ?? "?");
				const toStr = toLabel
					? `"${truncate(toLabel, 30)}"`
					: (arrow.endBinding?.elementId?.slice(0, 8) ?? "?");
				lines.push(`      - ${fromStr} -> ${toStr}`);
			}
			if (arrows.length > 20) {
				lines.push(`      ... and ${arrows.length - 20} more connections`);
			}
		}

		return lines.join("\n");
	} catch {
		return null;
	}
}

// ── Fallback Context ──────────────────────────────────────────────────────

function buildFallbackContext(pageContext: PageContext): string {
	return wrapContextBlock(`Current context: ${pageContext.summary}`);
}

// ── Utilities ─────────────────────────────────────────────────────────────

function wrapContextBlock(content: string): string {
	return `\n\n--- Page Context ---\n${content}\n--------------------`;
}

function truncate(text: string, maxLength: number): string {
	if (text.length <= maxLength) return text;
	return `${text.slice(0, maxLength - 3)}...`;
}

function formatDate(timestamp: number): string {
	return new Date(timestamp).toLocaleDateString("en-US", {
		month: "short",
		day: "numeric",
		year: "numeric",
	});
}

function formatRelativeTime(timestamp: number): string {
	const diff = Date.now() - timestamp;
	const minutes = Math.floor(diff / 60000);
	const hours = Math.floor(diff / 3600000);
	const days = Math.floor(diff / 86400000);

	if (minutes < 1) return "just now";
	if (minutes < 60) return `${minutes}m ago`;
	if (hours < 24) return `${hours}h ago`;
	if (days < 7) return `${days}d ago`;
	return formatDate(timestamp);
}
