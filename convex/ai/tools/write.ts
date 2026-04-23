import { createTool } from "@convex-dev/agent";
import type { ToolExecutionOptions } from "ai";
import { z } from "zod";
import { internal } from "../../_generated/api";
import type { Id } from "../../_generated/dataModel";
import { sanitizeDrawableElements } from "../whiteboardMcp";
import {
	buildUserNameMap,
	plateJsonToMarkdown,
	resolveToolUserId,
	resolveWorkspaceId,
	TOOL_TIMEOUT_MS,
	withTimeout,
} from "./helpers";
import type { ToolContext } from "./types";

// ── Return type interfaces ───────────────────────────────────────────────

interface CreateIssueResult {
	issueId: string;
	identifier: string;
	message: string;
}

interface UpdateIssueResult {
	issueId: string;
	updatedFields: string[];
	message: string;
}

interface ApprovalResult {
	needsApproval: true;
	description: string;
	toolCallId: string;
	issueId: string;
	message: string;
}

interface BulkCreateIssuesApprovalResult {
	needsApproval: true;
	description: string;
	toolCallId: string;
	message: string;
}

interface CommentResult {
	commentId: string;
	entityType: string;
	entityId: string;
	message: string;
}

interface CreateDocumentResult {
	documentId: string;
	title: string;
	message: string;
}

interface CreateProjectApprovalResult {
	needsApproval: true;
	description: string;
	toolCallId: string;
	message: string;
}

interface CreateLabelResult {
	labelId: string;
	name: string;
	color: string;
	message: string;
}

interface AddElementsToWhiteboardResult {
	whiteboardId: string;
	insertedCount: number;
	message: string;
}

interface ErrorResult {
	error: string;
}

type SceneElement = Record<string, unknown>;

const SHAPE_TYPES_WITH_LABELS = new Set(["rectangle", "ellipse", "diamond"]);

/**
 * Expand `label` shorthand on shapes and arrows into proper Excalidraw
 * bound text elements. Excalidraw needs:
 *  - Shape with `boundElements: [{ id: textId, type: "text" }]`
 *  - Separate text element with `containerId: shapeId`
 */
/**
 * Estimate the pixel width of text for centering calculations.
 * Approximation: ~0.6 * fontSize per character, with line-break handling.
 */
function estimateTextSize(
	text: string,
	fontSize: number,
): { width: number; height: number } {
	const lines = text.split("\n");
	const charWidth = fontSize * 0.6;
	const lineHeight = fontSize * 1.35;
	const maxLineWidth = Math.max(...lines.map((l) => l.length * charWidth));
	return {
		width: Math.ceil(maxLineWidth),
		height: Math.ceil(lines.length * lineHeight),
	};
}

function expandLabelsToTextElements(elements: SceneElement[]): SceneElement[] {
	const result: SceneElement[] = [];
	let textCounter = 0;

	for (const el of elements) {
		const label = el.label as { text?: string; fontSize?: number } | undefined;
		const type = el.type as string;

		// Shapes: expand label into bound text element
		if (SHAPE_TYPES_WITH_LABELS.has(type) && label?.text) {
			const textId = `${el.id ?? `shape-${textCounter}`}-label-${textCounter++}`;
			const shapeX = asNumber(el.x) ?? 0;
			const shapeY = asNumber(el.y) ?? 0;
			const shapeW = asNumber(el.width) ?? 100;
			const shapeH = asNumber(el.height) ?? 60;
			const fontSize = label.fontSize ?? 20;
			const textSize = estimateTextSize(label.text, fontSize);

			// Pre-compute center position so text renders correctly on load.
			// Excalidraw only recalculates on interaction, not initial render.
			const textX = shapeX + (shapeW - textSize.width) / 2;
			const textY = shapeY + (shapeH - textSize.height) / 2;

			const shape = { ...el };
			delete shape.label;
			shape.boundElements = [{ id: textId, type: "text" }];
			result.push(shape);

			result.push({
				type: "text",
				id: textId,
				x: textX,
				y: textY,
				width: textSize.width,
				height: textSize.height,
				text: label.text,
				originalText: label.text,
				fontSize,
				fontFamily: 1,
				textAlign: "center",
				verticalAlign: "middle",
				autoResize: true,
				containerId: el.id,
				strokeColor: (el.strokeColor as string) ?? "#1e1e1e",
				backgroundColor: "transparent",
			});
			continue;
		}

		// Arrows: expand label into bound text element
		if ((type === "arrow" || type === "line") && label?.text) {
			const textId = `${el.id ?? `arrow-${textCounter}`}-label-${textCounter++}`;
			const arrowX = asNumber(el.x) ?? 0;
			const arrowY = asNumber(el.y) ?? 0;
			const arrowW = asNumber(el.width) ?? 100;
			const arrowH = asNumber(el.height) ?? 0;
			const fontSize = label.fontSize ?? 16;
			const textSize = estimateTextSize(label.text, fontSize);

			// Position at arrow midpoint
			const textX = arrowX + (arrowW - textSize.width) / 2;
			const textY = arrowY + (arrowH - textSize.height) / 2;

			const arrow = { ...el };
			delete arrow.label;
			arrow.boundElements = [{ id: textId, type: "text" }];
			result.push(arrow);

			result.push({
				type: "text",
				id: textId,
				x: textX,
				y: textY,
				width: textSize.width,
				height: textSize.height,
				text: label.text,
				originalText: label.text,
				fontSize,
				fontFamily: 1,
				textAlign: "center",
				verticalAlign: "middle",
				autoResize: true,
				containerId: el.id,
				strokeColor: (el.strokeColor as string) ?? "#1e1e1e",
				backgroundColor: "transparent",
			});
			continue;
		}

		// No label — pass through unchanged
		result.push(el);
	}

	return result;
}

function asNumber(value: unknown): number | null {
	return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function getSceneBoundingBox(elements: SceneElement[]) {
	let minX = Number.POSITIVE_INFINITY;
	let minY = Number.POSITIVE_INFINITY;
	let maxX = Number.NEGATIVE_INFINITY;
	let maxY = Number.NEGATIVE_INFINITY;
	let found = false;

	for (const element of elements) {
		if (element.isDeleted === true) continue;
		const x = asNumber(element.x);
		const y = asNumber(element.y);
		const width = asNumber(element.width);
		const height = asNumber(element.height);
		if (x === null || y === null || width === null || height === null) continue;
		minX = Math.min(minX, x);
		minY = Math.min(minY, y);
		maxX = Math.max(maxX, x + width);
		maxY = Math.max(maxY, y + height);
		found = true;
	}

	return found
		? { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY }
		: null;
}

function positionGeneratedElements(
	existingElements: SceneElement[],
	generatedElements: SceneElement[],
): SceneElement[] {
	const existingBB = getSceneBoundingBox(existingElements);
	const newBB = getSceneBoundingBox(generatedElements);
	if (!newBB) return generatedElements;

	let offsetX = 100 - newBB.minX;
	let offsetY = 100 - newBB.minY;
	if (existingBB) {
		offsetX = existingBB.maxX + 160 - newBB.minX;
		offsetY = existingBB.minY - newBB.minY;
	}

	return generatedElements.map((element) => {
		const x = asNumber(element.x);
		const y = asNumber(element.y);
		if (x === null || y === null) return element;
		return {
			...element,
			x: x + offsetX,
			y: y + offsetY,
		};
	});
}

function ensureUniqueElementIds(
	elements: SceneElement[],
	existingElements: SceneElement[],
): SceneElement[] {
	const usedIds = new Set<string>();
	for (const element of existingElements) {
		if (typeof element.id === "string" && element.id.trim()) {
			usedIds.add(element.id.trim());
		}
	}

	const rawToAssigned = new Map<string, string>();
	let nonce = 1;

	const assigned: SceneElement[] = elements.map((element, index) => {
		const rawId =
			typeof element.id === "string" && element.id.trim()
				? element.id.trim()
				: `ai-${Date.now()}-${index}`;
		let assignedId = rawId;
		while (usedIds.has(assignedId)) {
			assignedId = `${rawId}-${nonce++}`;
		}
		usedIds.add(assignedId);
		if (!rawToAssigned.has(rawId)) rawToAssigned.set(rawId, assignedId);
		return {
			...element,
			id: assignedId,
		};
	});

	return assigned.map((element) => {
		const next: SceneElement = { ...element };
		for (const bindingKey of ["startBinding", "endBinding"] as const) {
			const binding = next[bindingKey];
			if (!binding || typeof binding !== "object") continue;
			const rawElementId = (binding as { elementId?: unknown }).elementId;
			if (typeof rawElementId !== "string" || !rawElementId.trim()) continue;
			const resolved = rawToAssigned.get(rawElementId.trim());
			if (!resolved) continue;
			next[bindingKey] = { elementId: resolved };
		}
		return next;
	});
}

function parseSceneData(sceneData: string | undefined): SceneElement[] {
	if (!sceneData) return [];
	try {
		const parsed = JSON.parse(sceneData);
		if (Array.isArray(parsed)) {
			return parsed.filter(
				(element): element is SceneElement =>
					Boolean(element) && typeof element === "object",
			);
		}
	} catch {
		// Ignore malformed persisted scene data and recover with empty scene.
	}
	return [];
}

const issueBulkItemSchema = z.object({
	title: z.string().describe("Issue title"),
	description: z.string().optional().describe("Issue description"),
	status: z
		.enum([
			"triage",
			"backlog",
			"todo",
			"in_progress",
			"in_review",
			"done",
			"cancelled",
		])
		.optional(),
	priority: z
		.enum(["urgent", "high", "medium", "low", "no_priority"])
		.optional(),
	type: z.enum(["issue", "bug", "improvement", "feature"]).optional(),
	assigneeId: z
		.string()
		.optional()
		.describe("Workspace member user ID from listWorkspaceMembers"),
	projectId: z.string().optional(),
	sprintId: z
		.string()
		.optional()
		.describe("Sprint ID when issues should be created in that sprint"),
	labelIds: z.array(z.string()).optional(),
	attachBoardImageIds: z
		.array(z.string())
		.optional()
		.describe(
			"Optional whiteboardImages row IDs to embed as markdown images in this issue's description. Useful when a specific diagram/screenshot supports exactly one issue in the batch.",
		),
});

// ── 1. bulkCreateIssues ───────────────────────────────────────────────────

export const bulkCreateIssues = createTool({
	description:
		"Create many issues in a single approval step. Use after turning a planning whiteboard into a backlog (with exportWhiteboardForPlanning), confirming project and sprint with the user, and resolving assignee names to user IDs via listWorkspaceMembers. Maximum 40 issues per call; split larger sets across multiple calls. Prefer this over repeated createIssue when the user approves a whole batch.",
	inputSchema: z.object({
		issues: z
			.array(issueBulkItemSchema)
			.min(1)
			.max(40)
			.describe("Issues to create (max 40 per batch)"),
	}),
	execute: async (
		ctx: ToolContext,
		args,
		options: ToolExecutionOptions,
	): Promise<BulkCreateIssuesApprovalResult | ErrorResult> => {
		const workspaceId = await resolveWorkspaceId(ctx);

		if (!ctx.threadId) {
			throw new Error("No thread context available for approval.");
		}

		const count = args.issues.length;
		const description = `Create ${count} issues (batch from planning)`;

		await ctx.runMutation(internal.ai.approval.createApproval, {
			threadId: ctx.threadId,
			toolCallId: options.toolCallId,
			toolName: "bulkCreateIssues",
			description,
			actionPayload: JSON.stringify({
				type: "bulkCreateIssues",
				workspaceId,
				issues: args.issues,
			}),
		});

		return {
			needsApproval: true,
			description,
			toolCallId: options.toolCallId,
			message: `This batch create requires approval: ${description}. Approve once to create all ${count} issues.`,
		};
	},
});

// ── 2. createIssue ───────────────────────────────────────────────────────

export const createIssue = createTool({
	description:
		'Create a new issue in the workspace. Use this when the user asks to create an issue, bug report, task, or feature request. Returns the new issue ID and identifier (e.g., "CLV-042").',
	inputSchema: z.object({
		title: z.string().describe("Issue title"),
		description: z.string().optional().describe("Issue description or details"),
		status: z
			.enum([
				"triage",
				"backlog",
				"todo",
				"in_progress",
				"in_review",
				"done",
				"cancelled",
			])
			.optional()
			.describe("Issue status (defaults to triage)"),
		priority: z
			.enum(["urgent", "high", "medium", "low", "no_priority"])
			.optional()
			.describe("Issue priority"),
		type: z
			.enum(["issue", "bug", "improvement", "feature"])
			.optional()
			.describe("Issue type (defaults to issue)"),
		assigneeId: z
			.string()
			.optional()
			.describe("User ID to assign the issue to"),
		projectId: z
			.string()
			.optional()
			.describe("Project ID to associate the issue with"),
		labelIds: z
			.array(z.string())
			.optional()
			.describe("Array of label IDs to attach"),
		attachBoardImageIds: z
			.array(z.string())
			.optional()
			.describe(
				"Optional whiteboardImages row IDs (from listImagesForBoard / readBoardWithVision) to embed as markdown images at the top of the description. Use when turning a board into an issue and the user wants the visual evidence inline.",
			),
	}),
	execute: async (
		ctx: ToolContext,
		args,
		options: ToolExecutionOptions,
	): Promise<CreateIssueResult | ApprovalResult | ErrorResult> => {
		const workspaceId = await resolveWorkspaceId(ctx);

		const description = `Create issue: "${args.title}"${args.projectId ? " in project" : ""}`;

		if (!ctx.threadId) {
			throw new Error("No thread context available for approval.");
		}

		await ctx.runMutation(internal.ai.approval.createApproval, {
			threadId: ctx.threadId,
			toolCallId: options.toolCallId,
			toolName: "createIssue",
			description,
			actionPayload: JSON.stringify({
				type: "createIssue",
				workspaceId,
				args: {
					title: args.title,
					description: args.description,
					status: args.status,
					priority: args.priority,
					type: args.type,
					assigneeId: args.assigneeId,
					projectId: args.projectId,
					labelIds: args.labelIds,
					attachBoardImageIds: args.attachBoardImageIds,
				},
			}),
		});

		return {
			needsApproval: true,
			description,
			toolCallId: options.toolCallId,
			issueId: "",
			message: `⚠️ This action requires your approval: ${description}. Use the Approve or Reject buttons shown in the chat.`,
		};
	},
});

// ── 3. updateIssue ───────────────────────────────────────────────────────

export const updateIssue = createTool({
	description:
		'Update an existing issue\'s fields. Use this when the user asks to change an issue\'s status, priority, assignee, title, description, or labels (a.k.a. tags). Provide either the issue identifier (e.g., "CLV-042") or the issue ID. Labels can be added/removed by name or id — pass `addLabels: ["bug"]` to tag, `removeLabels: ["bug"]` to untag. Label names are matched case-insensitively against the workspace\'s labels; names the workspace doesn\'t have yet are silently skipped (call `listLabels` first to see what exists).',
	inputSchema: z.object({
		identifier: z
			.string()
			.optional()
			.describe('Issue identifier like "CLV-042"'),
		issueId: z.string().optional().describe("Issue ID (Convex document ID)"),
		title: z.string().optional().describe("New title"),
		description: z.string().optional().describe("New description"),
		status: z
			.enum([
				"triage",
				"backlog",
				"todo",
				"in_progress",
				"in_review",
				"done",
				"cancelled",
			])
			.optional()
			.describe("New status"),
		priority: z
			.enum(["urgent", "high", "medium", "low", "no_priority"])
			.optional()
			.describe("New priority"),
		type: z
			.enum(["issue", "bug", "improvement", "feature"])
			.optional()
			.describe("New type"),
		assigneeId: z.string().optional().describe("New assignee user ID"),
		addLabels: z
			.array(z.string())
			.optional()
			.describe(
				"Labels to add to the issue — each entry may be a label name (e.g. 'bug') or a label id. Existing labels on the issue are preserved; this is an additive union. Unknown names are ignored.",
			),
		removeLabels: z
			.array(z.string())
			.optional()
			.describe(
				"Labels to remove from the issue — each entry may be a label name or label id. Labels the issue doesn't currently have are ignored.",
			),
	}),
	execute: async (
		ctx: ToolContext,
		args,
		options: ToolExecutionOptions,
	): Promise<UpdateIssueResult | ApprovalResult | ErrorResult> => {
		if (!args.identifier && !args.issueId) {
			return { error: "Provide either an identifier or issueId." };
		}

		const workspaceId = await resolveWorkspaceId(ctx);
		const userId = resolveToolUserId(ctx);

		// Resolve issueId from identifier if needed
		let resolvedIssueId: Id<"issues">;
		if (args.issueId) {
			const issue = await ctx.runQuery(internal.ai.toolQueries.getIssueById, {
				issueId: args.issueId as Id<"issues">,
				userId,
			});
			if (!issue || issue.workspaceId !== workspaceId) {
				return { error: "Issue not found." };
			}
			resolvedIssueId = issue._id;
		} else if (args.identifier) {
			const issue = await ctx.runQuery(
				internal.ai.toolQueries.getIssueByIdentifier,
				{ workspaceId, identifier: args.identifier, userId },
			);
			if (!issue) {
				return { error: `Issue "${args.identifier}" not found.` };
			}
			resolvedIssueId = issue._id;
		} else {
			return { error: "Provide either an identifier or issueId." };
		}

		// Resolve label add/remove directives against workspace labels so
		// the AI can pass friendly names like "bug" without first calling
		// `listLabels`. Case-insensitive name match; ids also accepted.
		let resolvedLabelIds: Id<"labels">[] | undefined;
		if (args.addLabels || args.removeLabels) {
			const [issueDoc, workspaceLabels] = await Promise.all([
				ctx.runQuery(internal.ai.toolQueries.getIssueById, {
					issueId: resolvedIssueId,
					userId,
				}),
				ctx.runQuery(internal.ai.toolQueries.listLabels, { workspaceId }),
			]);
			const byIdOrName = new Map<string, Id<"labels">>();
			for (const l of workspaceLabels ?? []) {
				byIdOrName.set(String(l._id), l._id as Id<"labels">);
				byIdOrName.set(l.name.toLowerCase(), l._id as Id<"labels">);
			}
			const resolve = (entry: string) =>
				byIdOrName.get(entry) ?? byIdOrName.get(entry.toLowerCase());
			const current = new Set<string>(
				(issueDoc?.labelIds ?? []).map((id: Id<"labels">) => String(id)),
			);
			for (const entry of args.addLabels ?? []) {
				const id = resolve(entry);
				if (id) current.add(String(id));
			}
			for (const entry of args.removeLabels ?? []) {
				const id = resolve(entry);
				if (id) current.delete(String(id));
			}
			resolvedLabelIds = [...current] as Id<"labels">[];
		}

		// Build the update payload with only provided fields
		const updates: Record<string, unknown> = {};
		if (args.title !== undefined) updates.title = args.title;
		if (args.description !== undefined) updates.description = args.description;
		if (args.status !== undefined) updates.status = args.status;
		if (args.priority !== undefined) updates.priority = args.priority;
		if (args.type !== undefined) updates.type = args.type;
		if (args.assigneeId !== undefined) updates.assigneeId = args.assigneeId;
		if (resolvedLabelIds !== undefined) updates.labelIds = resolvedLabelIds;

		// Destructive status transitions require approval
		const DESTRUCTIVE_STATUSES = ["done", "cancelled"];
		if (args.status && DESTRUCTIVE_STATUSES.includes(args.status)) {
			const displayName = args.identifier ?? resolvedIssueId;
			const statusLabel = args.status === "done" ? "Done" : "Cancelled";
			const description = `Mark issue ${displayName} as ${statusLabel}`;

			if (!ctx.threadId) {
				throw new Error("No thread context available for approval.");
			}
			await ctx.runMutation(internal.ai.approval.createApproval, {
				threadId: ctx.threadId,
				toolCallId: options.toolCallId,
				toolName: "updateIssue",
				description,
				actionPayload: JSON.stringify({
					type: "updateIssue",
					issueId: resolvedIssueId,
					updates,
				}),
			});

			return {
				needsApproval: true,
				description,
				toolCallId: options.toolCallId,
				issueId: resolvedIssueId,
				message: `⚠️ This action requires your approval: ${description}. Use the Approve or Reject buttons shown in the chat.`,
			};
		}

		// Non-destructive updates execute immediately
		const updatePayload: Record<string, unknown> = {
			userId,
			issueId: resolvedIssueId,
		};

		if (args.title !== undefined) updatePayload.title = args.title;
		if (args.description !== undefined)
			updatePayload.description = args.description;
		if (args.status !== undefined) updatePayload.status = args.status;
		if (args.priority !== undefined) updatePayload.priority = args.priority;
		if (args.type !== undefined) updatePayload.type = args.type;
		if (args.assigneeId !== undefined)
			updatePayload.assigneeId = args.assigneeId as Id<"users">;
		if (resolvedLabelIds !== undefined)
			updatePayload.labelIds = resolvedLabelIds;

		await withTimeout(
			ctx.runMutation(
				internal.ai.toolMutations.updateIssue,
				updatePayload as Parameters<typeof ctx.runMutation>[1],
			),
			TOOL_TIMEOUT_MS,
			"updateIssue",
		);

		const updatedFields = Object.keys(updates);
		return {
			issueId: resolvedIssueId,
			updatedFields,
			message: `Updated issue ${args.identifier ?? resolvedIssueId}: ${updatedFields.join(", ")}`,
		};
	},
});

// ── 4. addComment ────────────────────────────────────────────────────────

export const addComment = createTool({
	description:
		'Add a comment to an issue, task, or story. Use this when the user asks to comment on, reply to, or leave a note on an entity. For issues, provide the identifier (e.g., "CLV-042") or issueId. For tasks/stories, provide the entity ID directly. Exactly one target must be specified.',
	inputSchema: z.object({
		identifier: z
			.string()
			.optional()
			.describe('Issue identifier like "CLV-042" (for issues only)'),
		issueId: z.string().optional().describe("Issue ID (Convex document ID)"),
		taskId: z.string().optional().describe("Task ID (Convex document ID)"),
		storyId: z.string().optional().describe("Story ID (Convex document ID)"),
		body: z.string().describe("Comment text"),
	}),
	execute: async (
		ctx: ToolContext,
		args,
	): Promise<CommentResult | ErrorResult> => {
		// Validate exactly one target is specified
		const targets = [
			args.identifier ? "issue" : null,
			args.issueId ? "issue" : null,
			args.taskId ? "task" : null,
			args.storyId ? "story" : null,
		].filter(Boolean);

		if (targets.length === 0) {
			return {
				error:
					"Provide exactly one target: identifier, issueId, taskId, or storyId.",
			};
		}

		// Allow identifier + issueId to both refer to an issue, but not mixed types
		const uniqueTypes = [...new Set(targets)];
		if (uniqueTypes.length > 1) {
			return {
				error:
					"Provide only one entity type: issue (identifier/issueId), taskId, or storyId.",
			};
		}

		const workspaceId = await resolveWorkspaceId(ctx);

		// Build the create args for the comments.create mutation
		const createArgs: {
			issueId?: Id<"issues">;
			taskId?: Id<"tasks">;
			storyId?: Id<"stories">;
			body: string;
		} = { body: args.body };

		let entityType: string;
		let entityId: string;

		const userId = resolveToolUserId(ctx);

		if (args.issueId || args.identifier) {
			// Resolve issue
			let resolvedIssueId: Id<"issues">;
			if (args.issueId) {
				const issue = await ctx.runQuery(internal.ai.toolQueries.getIssueById, {
					issueId: args.issueId as Id<"issues">,
					userId,
				});
				if (!issue || issue.workspaceId !== workspaceId) {
					return { error: "Issue not found." };
				}
				resolvedIssueId = issue._id;
			} else {
				const issue = await ctx.runQuery(
					internal.ai.toolQueries.getIssueByIdentifier,
					{
						workspaceId,
						identifier: args.identifier as string,
						userId,
					},
				);
				if (!issue) {
					return { error: `Issue "${args.identifier}" not found.` };
				}
				resolvedIssueId = issue._id;
			}
			createArgs.issueId = resolvedIssueId;
			entityType = "issue";
			entityId = resolvedIssueId;
		} else if (args.taskId) {
			createArgs.taskId = args.taskId as Id<"tasks">;
			entityType = "task";
			entityId = args.taskId;
		} else {
			createArgs.storyId = args.storyId as Id<"stories">;
			entityType = "story";
			entityId = args.storyId as string;
		}

		// Use internal mutation to bypass auth for Google Chat context
		const commentId = await withTimeout(
			ctx.runMutation(internal.ai.toolMutations.createComment, {
				userId,
				...createArgs,
			}),
			TOOL_TIMEOUT_MS,
			"addComment",
		);

		const displayId = args.identifier ?? entityId;
		return {
			commentId,
			entityType,
			entityId,
			message: `Added comment to ${entityType} ${displayId}`,
		};
	},
});

// ── 5. assignIssue ────────────────────────────────────────────────────────

interface AssignIssueResult {
	issueId: string;
	identifier: string;
	assigneeName: string | null;
	message: string;
}

export const assignIssue = createTool({
	description:
		'Assign or unassign an issue to a workspace member. Use this when the user asks to assign, reassign, or unassign an issue. Provide either the issue identifier (e.g., "CLV-042") or the issue ID. Omit assigneeId (or set null) to unassign.',
	inputSchema: z.object({
		identifier: z
			.string()
			.optional()
			.describe('Issue identifier like "CLV-042"'),
		issueId: z.string().optional().describe("Issue ID (Convex document ID)"),
		assigneeId: z
			.string()
			.optional()
			.nullable()
			.describe("User ID to assign to, or null/omit to unassign"),
	}),
	execute: async (
		ctx: ToolContext,
		args,
	): Promise<AssignIssueResult | ErrorResult> => {
		if (!args.identifier && !args.issueId) {
			return { error: "Provide either an identifier or issueId." };
		}

		const workspaceId = await resolveWorkspaceId(ctx);
		const userId = resolveToolUserId(ctx);

		// Resolve issueId from identifier if needed
		let resolvedIssueId: Id<"issues">;
		let issueIdentifier: string;
		if (args.issueId) {
			const issue = await ctx.runQuery(internal.ai.toolQueries.getIssueById, {
				issueId: args.issueId as Id<"issues">,
				userId,
			});
			if (!issue || issue.workspaceId !== workspaceId) {
				return { error: "Issue not found." };
			}
			resolvedIssueId = issue._id;
			issueIdentifier = issue.identifier;
		} else if (args.identifier) {
			const issue = await ctx.runQuery(
				internal.ai.toolQueries.getIssueByIdentifier,
				{ workspaceId, identifier: args.identifier, userId },
			);
			if (!issue) {
				return { error: `Issue "${args.identifier}" not found.` };
			}
			resolvedIssueId = issue._id;
			issueIdentifier = issue.identifier;
		} else {
			return { error: "Provide either an identifier or issueId." };
		}

		// Resolve assigneeId: null or undefined means unassign
		const assigneeId = args.assigneeId
			? (args.assigneeId as Id<"users">)
			: undefined;

		await withTimeout(
			ctx.runMutation(internal.ai.toolMutations.assignIssue, {
				userId,
				issueId: resolvedIssueId,
				assigneeId,
			}),
			TOOL_TIMEOUT_MS,
			"assignIssue",
		);

		// Resolve assignee name for the response
		let assigneeName: string | null = null;
		if (assigneeId) {
			const nameMap = await buildUserNameMap(ctx, workspaceId);
			assigneeName = nameMap.get(assigneeId) ?? "Unknown user";
		}

		const action = assigneeName
			? `to ${assigneeName}`
			: "from current assignee";
		return {
			issueId: resolvedIssueId,
			identifier: issueIdentifier,
			assigneeName,
			message: `Assigned issue ${issueIdentifier} ${action}`,
		};
	},
});

// ── 6. batchUpdateIssues ──────────────────────────────────────────────────

interface BatchUpdateResult {
	needsApproval: true;
	description: string;
	toolCallId: string;
	issueCount: number;
	message: string;
}

export const batchUpdateIssues = createTool({
	description:
		'Bulk update multiple issues at once. Supports two operations: "updateStatus" to change the status of multiple issues, or "assign" to assign/unassign multiple issues. This action always requires human approval before executing.',
	inputSchema: z.object({
		issueIds: z
			.array(z.string())
			.min(1)
			.describe("Array of issue IDs to update"),
		operation: z
			.enum(["updateStatus", "assign"])
			.describe("The batch operation to perform"),
		status: z
			.enum([
				"triage",
				"backlog",
				"todo",
				"in_progress",
				"in_review",
				"done",
				"cancelled",
			])
			.optional()
			.describe('New status (required when operation is "updateStatus")'),
		assigneeId: z
			.string()
			.optional()
			.nullable()
			.describe(
				'User ID to assign to (for "assign" operation). Omit or null to unassign.',
			),
	}),
	execute: async (
		ctx: ToolContext,
		args,
		options: ToolExecutionOptions,
	): Promise<BatchUpdateResult | ErrorResult> => {
		// Validate operation-specific args
		if (args.operation === "updateStatus" && !args.status) {
			return {
				error:
					'The "status" field is required when operation is "updateStatus".',
			};
		}

		const workspaceId = await resolveWorkspaceId(ctx);
		const userId = resolveToolUserId(ctx);

		// Validate all issueIds belong to this workspace
		const issueIds = args.issueIds as Id<"issues">[];
		const identifiers: string[] = [];
		for (const issueId of issueIds) {
			const issue = await ctx.runQuery(internal.ai.toolQueries.getIssueById, {
				issueId,
				userId,
			});
			if (!issue || issue.workspaceId !== workspaceId) {
				return { error: `Issue not found or not in workspace: ${issueId}` };
			}
			identifiers.push(issue.identifier);
		}

		// Build description for approval
		const issueList =
			identifiers.length <= 3
				? identifiers.join(", ")
				: `${identifiers.slice(0, 3).join(", ")} and ${identifiers.length - 3} more`;

		let description: string;
		if (args.operation === "updateStatus") {
			const statusLabel = (args.status ?? "").replace(/_/g, " ");
			description = `Bulk update ${identifiers.length} issues to status "${statusLabel}": ${issueList}`;
		} else {
			const action = args.assigneeId ? "assign" : "unassign";
			description = `Bulk ${action} ${identifiers.length} issues: ${issueList}`;
		}

		if (!ctx.threadId) {
			throw new Error("No thread context available for approval.");
		}

		// Always require approval for batch operations
		await ctx.runMutation(internal.ai.approval.createApproval, {
			threadId: ctx.threadId,
			toolCallId: options.toolCallId,
			toolName: "batchUpdateIssues",
			description,
			actionPayload: JSON.stringify({
				type:
					args.operation === "updateStatus"
						? "batchUpdateStatus"
						: "batchAssign",
				workspaceId,
				issueIds: args.issueIds,
				status: args.status,
				assigneeId: args.assigneeId ?? undefined,
			}),
		});

		return {
			needsApproval: true,
			description,
			toolCallId: options.toolCallId,
			issueCount: identifiers.length,
			message: `⚠️ This action requires your approval: ${description}. Use the Approve or Reject buttons shown in the chat.`,
		};
	},
});

// ── 7. createDocument ─────────────────────────────────────────────────────

export const createDocument = createTool({
	description:
		"Create a new document in the workspace. Use this when the user asks to create a document, spec, note, or written artifact. Optionally associates it with a project and sets initial content.",
	inputSchema: z.object({
		title: z.string().describe("Document title"),
		projectId: z
			.string()
			.optional()
			.describe("Project ID to associate the document with"),
		content: z
			.string()
			.optional()
			.describe(
				"Initial document content in markdown format. Use proper markdown: # headings, **bold**, *italic*, - bullet lists, 1. numbered lists, ```code blocks```, > blockquotes, and | markdown tables | with header and separator rows. The editor will convert markdown to rich text automatically.",
			),
	}),
	execute: async (
		ctx: ToolContext,
		args,
	): Promise<CreateDocumentResult | ErrorResult> => {
		const workspaceId = await resolveWorkspaceId(ctx);
		const userId = resolveToolUserId(ctx);

		const documentId = await withTimeout(
			ctx.runMutation(internal.ai.toolMutations.createDocument, {
				userId,
				workspaceId,
				projectId: args.projectId
					? (args.projectId as Id<"projects">)
					: undefined,
				title: args.title,
			}),
			TOOL_TIMEOUT_MS,
			"createDocument",
		);

		// If content was provided, set it on the newly created document
		if (args.content) {
			await withTimeout(
				ctx.runMutation(internal.ai.toolMutations.updateDocumentContent, {
					userId,
					documentId,
					content: args.content,
				}),
				TOOL_TIMEOUT_MS,
				"createDocument:setContent",
			);
		}

		return {
			documentId,
			title: args.title,
			message: `Created document "${args.title}"${args.projectId ? " in project" : ""}`,
		};
	},
});

// ── 7b. updateDocument ───────────────────────────────────────────────────

interface UpdateDocumentResult {
	documentId: string;
	updatedFields: string[];
	message: string;
}

export const updateDocument = createTool({
	description:
		"Update an existing document's title or content. Use this when the user asks to rename, edit, or rewrite a document. Provide the document ID.",
	inputSchema: z.object({
		documentId: z.string().describe("Document ID (Convex document ID)"),
		title: z.string().optional().describe("New document title"),
		content: z
			.string()
			.optional()
			.describe(
				"New document content in markdown format. Use proper markdown: # headings, **bold**, *italic*, - bullet lists, 1. numbered lists, ```code blocks```, > blockquotes, and | markdown tables |.",
			),
	}),
	execute: async (
		ctx: ToolContext,
		args,
	): Promise<UpdateDocumentResult | ErrorResult> => {
		const workspaceId = await resolveWorkspaceId(ctx);
		const userId = resolveToolUserId(ctx);

		if (!args.title && !args.content) {
			return {
				error: "Provide at least one field to update (title or content).",
			};
		}

		const docId = args.documentId as Id<"documents">;
		const document = await ctx.runQuery(
			internal.ai.toolQueries.getDocumentById,
			{ documentId: docId },
		);
		if (!document || document.workspaceId !== workspaceId) {
			return { error: "Document not found." };
		}

		// Update title and content via separate mutations — mirrors
		// the createDocument flow where content is written through
		// the dedicated updateDocumentContent path.
		if (args.title !== undefined) {
			await withTimeout(
				ctx.runMutation(internal.ai.toolMutations.updateDocumentTitle, {
					userId,
					documentId: docId,
					title: args.title,
				}),
				TOOL_TIMEOUT_MS,
				"updateDocument:title",
			);
		}

		if (args.content !== undefined) {
			await withTimeout(
				ctx.runMutation(internal.ai.toolMutations.updateDocumentContent, {
					userId,
					documentId: docId,
					content: args.content,
				}),
				TOOL_TIMEOUT_MS,
				"updateDocument:content",
			);

			// Reset Yjs state so the editor re-bootstraps from the
			// updated content field instead of stale Yjs snapshots.
			await withTimeout(
				ctx.runMutation(internal.ai.toolMutations.resetDocumentYjsState, {
					documentId: docId,
				}),
				TOOL_TIMEOUT_MS,
				"updateDocument:resetYjs",
			);
		}

		const updatedFields = [
			...(args.title !== undefined ? ["title"] : []),
			...(args.content !== undefined ? ["content"] : []),
		];
		return {
			documentId: args.documentId,
			updatedFields,
			message: `Updated document "${args.title ?? document.title}": ${updatedFields.join(", ")}`,
		};
	},
});

// ── 7c. appendToDocument ────────────────────────────────────────────────

export const appendToDocument = createTool({
	description:
		"Append content to the end of an existing document without overwriting what is already there. Use this when the user asks to add a section, notes, or additional content to an existing document. Accepts Markdown which is appended after the current content with a blank line separator.",
	inputSchema: z.object({
		documentId: z.string().describe("Document ID to append to"),
		content: z
			.string()
			.describe(
				"Markdown content to append. Use proper markdown: # headings, **bold**, *italic*, - bullet lists, 1. numbered lists, ```code blocks```, > blockquotes, and | markdown tables |.",
			),
	}),
	execute: async (
		ctx: ToolContext,
		args,
	): Promise<{ documentId: string; message: string } | ErrorResult> => {
		const workspaceId = await resolveWorkspaceId(ctx);
		const userId = resolveToolUserId(ctx);

		const docId = args.documentId as Id<"documents">;
		const document = await ctx.runQuery(
			internal.ai.toolQueries.getDocumentById,
			{ documentId: docId },
		);
		if (!document || document.workspaceId !== workspaceId) {
			return { error: "Document not found." };
		}

		// Append to existing content (content is stored as Plate JSON or markdown)
		const existingContent = document.content ?? "";
		const separator = existingContent.length > 0 ? "\n\n" : "";
		const newContent = `${existingContent}${separator}${args.content}`;

		await withTimeout(
			ctx.runMutation(internal.ai.toolMutations.updateDocumentContent, {
				userId,
				documentId: docId,
				content: newContent,
			}),
			TOOL_TIMEOUT_MS,
			"appendToDocument",
		);

		// Reset Yjs state so the editor re-bootstraps
		await withTimeout(
			ctx.runMutation(internal.ai.toolMutations.resetDocumentYjsState, {
				documentId: docId,
			}),
			TOOL_TIMEOUT_MS,
			"appendToDocument:resetYjs",
		);

		return {
			documentId: args.documentId,
			message: `Appended content to "${document.title}"`,
		};
	},
});

// ── 7d. updateDocumentSection ──────────────────────────────────────────

export const updateDocumentSection = createTool({
	description:
		"Replace a specific section of a document identified by its heading. Finds the section starting at the given heading (e.g. '## Design') and replaces everything up to the next heading of the same or higher level. Use this for targeted edits to long documents without rewriting the entire content. The replacement content should include the heading line itself. Use getDocument or readDocumentChunked first to read the current content and identify section headings.",
	inputSchema: z.object({
		documentId: z.string().describe("Document ID to update"),
		sectionHeading: z
			.string()
			.describe(
				"The exact heading text to find (e.g. '## Design' or '### API Reference'). Must match the heading line in the Markdown output.",
			),
		newContent: z
			.string()
			.describe(
				"The replacement content for the section, including the heading line. Everything from the matched heading to the next same-or-higher-level heading will be replaced.",
			),
	}),
	execute: async (
		ctx: ToolContext,
		args,
	): Promise<
		{ documentId: string; replaced: boolean; message: string } | ErrorResult
	> => {
		const workspaceId = await resolveWorkspaceId(ctx);
		const userId = resolveToolUserId(ctx);

		const docId = args.documentId as Id<"documents">;
		const document = await ctx.runQuery(
			internal.ai.toolQueries.getDocumentById,
			{ documentId: docId },
		);
		if (!document || document.workspaceId !== workspaceId) {
			return { error: "Document not found." };
		}

		// Convert to markdown, do the replacement, store the result.
		// The editor re-parses via parseAnyContentToSlate on load.
		const markdown = plateJsonToMarkdown(document.content);

		// Find the heading level and position
		const headingTrimmed = args.sectionHeading.trim();
		const headingMatch = headingTrimmed.match(/^(#{1,6})\s/);
		const headingLevel = headingMatch ? headingMatch[1].length : 0;

		const startIdx = markdown.indexOf(headingTrimmed);
		if (startIdx === -1) {
			return {
				documentId: args.documentId,
				replaced: false,
				message: `Section heading "${headingTrimmed}" not found in document. Use getDocument to check the current headings.`,
			};
		}

		// Find the end of this section (next heading of same or higher level)
		let endIdx = markdown.length;
		if (headingLevel > 0) {
			const afterHeading = startIdx + headingTrimmed.length;
			const rest = markdown.slice(afterHeading);
			// Match next heading of same or higher level
			const pattern = new RegExp(`\n(#{1,${headingLevel}})\\s`);
			const nextMatch = rest.match(pattern);
			if (nextMatch?.index !== undefined) {
				endIdx = afterHeading + nextMatch.index;
			}
		}

		const newMarkdown =
			markdown.slice(0, startIdx) +
			args.newContent.trim() +
			markdown.slice(endIdx);

		await withTimeout(
			ctx.runMutation(internal.ai.toolMutations.updateDocumentContent, {
				userId,
				documentId: docId,
				content: newMarkdown,
			}),
			TOOL_TIMEOUT_MS,
			"updateDocumentSection",
		);

		await withTimeout(
			ctx.runMutation(internal.ai.toolMutations.resetDocumentYjsState, {
				documentId: docId,
			}),
			TOOL_TIMEOUT_MS,
			"updateDocumentSection:resetYjs",
		);

		return {
			documentId: args.documentId,
			replaced: true,
			message: `Replaced section "${headingTrimmed}" in "${document.title}"`,
		};
	},
});

// ── 8. createProject ──────────────────────────────────────────────────────

export const createProject = createTool({
	description:
		"Create a new project in the workspace. This is a high-impact operation that always requires human approval before executing. Use when the user asks to create a project, initiative, or workstream.",
	inputSchema: z.object({
		name: z.string().describe("Project name"),
		description: z.string().optional().describe("Project description"),
		status: z
			.enum(["backlog", "planned", "active", "completed", "cancelled"])
			.optional()
			.describe("Project status (defaults to planned)"),
		priority: z
			.enum(["urgent", "high", "medium", "low", "no_priority"])
			.optional()
			.describe("Project priority"),
		leadId: z.string().optional().describe("User ID of the project lead"),
		startDate: z
			.number()
			.optional()
			.describe("Project start date as Unix timestamp (ms)"),
		endDate: z
			.number()
			.optional()
			.describe("Project end date as Unix timestamp (ms)"),
		attachBoardImageIds: z
			.array(z.string())
			.optional()
			.describe(
				"Optional whiteboardImages row IDs (from listImagesForBoard / readBoardWithVision) to embed as markdown images at the top of the description. Use when turning a planning board into a project and the user wants the visual evidence inline.",
			),
	}),
	execute: async (
		ctx: ToolContext,
		args,
		options: ToolExecutionOptions,
	): Promise<CreateProjectApprovalResult | ErrorResult> => {
		const workspaceId = await resolveWorkspaceId(ctx);

		const description = `Create project: "${args.name}"`;

		if (!ctx.threadId) {
			throw new Error("No thread context available for approval.");
		}

		// Always require approval for project creation
		await ctx.runMutation(internal.ai.approval.createApproval, {
			threadId: ctx.threadId,
			toolCallId: options.toolCallId,
			toolName: "createProject",
			description,
			actionPayload: JSON.stringify({
				type: "createProject",
				workspaceId,
				args: {
					name: args.name,
					description: args.description,
					status: args.status,
					priority: args.priority,
					leadId: args.leadId,
					startDate: args.startDate,
					endDate: args.endDate,
					attachBoardImageIds: args.attachBoardImageIds,
				},
			}),
		});

		return {
			needsApproval: true,
			description,
			toolCallId: options.toolCallId,
			message: `⚠️ This action requires your approval: ${description}. Use the Approve or Reject buttons shown in the chat.`,
		};
	},
});

// ── 8b. updateProject ────────────────────────────────────────────────────

interface UpdateProjectResult {
	projectId: string;
	updatedFields: string[];
	message: string;
}

export const updateProject = createTool({
	description:
		"Update an existing project's fields. Use this when the user asks to change a project's name, description, status, priority, lead, or dates. Provide the project ID or use getProjectDetails to find it first.",
	inputSchema: z.object({
		projectId: z.string().describe("Project ID (Convex document ID)"),
		name: z.string().optional().describe("New project name"),
		description: z.string().optional().describe("New project description"),
		status: z
			.enum(["backlog", "planned", "active", "completed", "cancelled"])
			.optional()
			.describe("New project status"),
		priority: z
			.enum(["urgent", "high", "medium", "low", "no_priority"])
			.optional()
			.describe("New project priority"),
		leadId: z.string().optional().describe("New project lead user ID"),
		startDate: z
			.number()
			.optional()
			.describe("New start date as Unix timestamp (ms)"),
		endDate: z
			.number()
			.optional()
			.describe("New end date as Unix timestamp (ms)"),
	}),
	execute: async (
		ctx: ToolContext,
		args,
	): Promise<UpdateProjectResult | ErrorResult> => {
		const workspaceId = await resolveWorkspaceId(ctx);
		const userId = resolveToolUserId(ctx);

		const updates: Record<string, unknown> = {};
		if (args.name !== undefined) updates.name = args.name;
		if (args.description !== undefined) updates.description = args.description;
		if (args.status !== undefined) updates.status = args.status;
		if (args.priority !== undefined) updates.priority = args.priority;
		if (args.leadId !== undefined) updates.leadId = args.leadId;
		if (args.startDate !== undefined) updates.startDate = args.startDate;
		if (args.endDate !== undefined) updates.endDate = args.endDate;

		if (Object.keys(updates).length === 0) {
			return { error: "No fields to update." };
		}

		const project = await ctx.runQuery(internal.ai.toolQueries.getProjectById, {
			projectId: args.projectId as Id<"projects">,
			userId,
		});
		if (!project || project.workspaceId !== workspaceId) {
			return { error: "Project not found." };
		}

		await withTimeout(
			ctx.runMutation(internal.ai.toolMutations.updateProject, {
				userId,
				projectId: args.projectId as Id<"projects">,
				...(args.name !== undefined && { name: args.name }),
				...(args.description !== undefined && {
					description: args.description,
				}),
				...(args.status !== undefined && { status: args.status }),
				...(args.priority !== undefined && { priority: args.priority }),
				...(args.leadId !== undefined && {
					leadId: args.leadId as Id<"users">,
				}),
				...(args.startDate !== undefined && { startDate: args.startDate }),
				...(args.endDate !== undefined && { endDate: args.endDate }),
			}),
			TOOL_TIMEOUT_MS,
			"updateProject",
		);

		const updatedFields = Object.keys(updates);
		return {
			projectId: args.projectId,
			updatedFields,
			message: `Updated project "${args.name ?? project.name}": ${updatedFields.join(", ")}`,
		};
	},
});

// ── 9. createLabel ────────────────────────────────────────────────────────

export const createLabel = createTool({
	description:
		"Create a new label in the workspace. Labels are used to categorize issues. Only workspace admins can create labels. The mutation will throw if the user is not an admin.",
	inputSchema: z.object({
		name: z.string().describe("Label name"),
		color: z
			.string()
			.describe(
				'Label color as a hex string (e.g., "#ef4444" for red, "#3b82f6" for blue)',
			),
		description: z.string().optional().describe("Label description"),
	}),
	execute: async (
		ctx: ToolContext,
		args,
	): Promise<CreateLabelResult | ErrorResult> => {
		const workspaceId = await resolveWorkspaceId(ctx);
		const userId = resolveToolUserId(ctx);

		const labelId = await withTimeout(
			ctx.runMutation(internal.ai.toolMutations.createLabel, {
				userId,
				workspaceId,
				name: args.name,
				color: args.color,
				description: args.description,
			}),
			TOOL_TIMEOUT_MS,
			"createLabel",
		);

		return {
			labelId,
			name: args.name,
			color: args.color,
			message: `Created label "${args.name}" (${args.color})`,
		};
	},
});

// ── 10a. createWhiteboard ─────────────────────────────────────────────────

interface CreateWhiteboardResult {
	whiteboardId: string;
	title: string;
	message: string;
}

export const createWhiteboard = createTool({
	description:
		"Create a new whiteboard/board in the workspace. Use this when the user asks to create a board, or when they request a diagram/wireframe/flowchart and no suitable board exists yet. After creating the board, use addElementsToWhiteboard to add content to it.",
	inputSchema: z.object({
		title: z.string().describe("Whiteboard title"),
		projectId: z
			.string()
			.optional()
			.describe("Project ID to associate the board with"),
		icon: z.string().optional().describe("Emoji icon for the board"),
	}),
	execute: async (
		ctx: ToolContext,
		args,
	): Promise<CreateWhiteboardResult | ErrorResult> => {
		const workspaceId = await resolveWorkspaceId(ctx);
		const userId = resolveToolUserId(ctx);

		const whiteboardId = await withTimeout(
			ctx.runMutation(internal.ai.toolMutations.createWhiteboard, {
				userId,
				workspaceId,
				projectId: args.projectId
					? (args.projectId as Id<"projects">)
					: undefined,
				title: args.title,
				icon: args.icon,
			}),
			TOOL_TIMEOUT_MS,
			"createWhiteboard",
		);

		return {
			whiteboardId,
			title: args.title,
			message: `Created whiteboard "${args.title}" (${whiteboardId}). Use addElementsToWhiteboard with this ID to add diagrams.`,
		};
	},
});

// ── 10b. updateWhiteboard ─────────────────────────────────────────────────

interface UpdateWhiteboardResult {
	whiteboardId: string;
	updatedFields: string[];
	message: string;
}

export const updateWhiteboard = createTool({
	description:
		"Update a whiteboard's metadata (title, icon, project association). Use this when the user asks to rename a board, change its icon, or move it to a different project.",
	inputSchema: z.object({
		whiteboardId: z.string().describe("The whiteboard ID to update"),
		title: z.string().optional().describe("New board title"),
		icon: z.string().optional().describe("New emoji icon"),
		projectId: z
			.string()
			.optional()
			.describe("New project ID to associate with"),
	}),
	execute: async (
		ctx: ToolContext,
		args,
	): Promise<UpdateWhiteboardResult | ErrorResult> => {
		const workspaceId = await resolveWorkspaceId(ctx);
		const userId = resolveToolUserId(ctx);

		const board = await withTimeout(
			ctx.runQuery(internal.ai.toolQueries.getWhiteboardById, {
				whiteboardId: args.whiteboardId as Id<"whiteboards">,
			}),
			TOOL_TIMEOUT_MS,
			"updateWhiteboard:getById",
		);

		if (!board) {
			return { error: "Whiteboard not found or has been deleted." };
		}
		if (board.workspaceId !== workspaceId) {
			return { error: "Whiteboard belongs to a different workspace." };
		}

		await withTimeout(
			ctx.runMutation(internal.ai.toolMutations.updateWhiteboard, {
				userId,
				whiteboardId: args.whiteboardId as Id<"whiteboards">,
				title: args.title,
				icon: args.icon,
				projectId: args.projectId
					? (args.projectId as Id<"projects">)
					: undefined,
			}),
			TOOL_TIMEOUT_MS,
			"updateWhiteboard",
		);

		const updatedFields = [
			args.title ? "title" : null,
			args.icon ? "icon" : null,
			args.projectId ? "projectId" : null,
		].filter(Boolean) as string[];

		return {
			whiteboardId: args.whiteboardId,
			updatedFields,
			message: `Updated whiteboard: ${updatedFields.join(", ")}`,
		};
	},
});

// ── 10c. addElementsToWhiteboard ──────────────────────────────────────────

export const addElementsToWhiteboard = createTool({
	description: `Add Excalidraw elements to a whiteboard. Use this AFTER generating elements yourself.

Workflow for diagrams/wireframes/flowcharts:
1. Call the MCP tool "read_me" first to learn the Excalidraw element format.
2. Generate the elements JSON array yourself based on the format reference.
3. Call this tool with the elements JSON string to persist them to the board.

The elements are validated, positioned to avoid overlapping existing content, and given unique IDs automatically.`,
	inputSchema: z.object({
		whiteboardId: z
			.string()
			.describe(
				"Target whiteboard ID. Use the ID from page context, or from createWhiteboard.",
			),
		elements: z
			.string()
			.describe(
				'JSON string of an Excalidraw elements array. Example: \'[{"type":"rectangle","id":"r1","x":100,"y":100,"width":200,"height":80,"backgroundColor":"#a5d8ff","fillStyle":"solid","label":{"text":"Start","fontSize":20}}]\'',
			),
	}),
	execute: async (
		ctx: ToolContext,
		args,
	): Promise<AddElementsToWhiteboardResult | ErrorResult> => {
		const workspaceId = await resolveWorkspaceId(ctx);

		const whiteboardId = args.whiteboardId as Id<"whiteboards">;
		const board = await withTimeout(
			ctx.runQuery(internal.ai.toolQueries.getWhiteboardById, {
				whiteboardId,
			}),
			TOOL_TIMEOUT_MS,
			"addElementsToWhiteboard:getById",
		);
		if (!board) {
			return { error: "Whiteboard not found or access denied." };
		}
		if (board.workspaceId !== workspaceId) {
			return { error: "Whiteboard belongs to a different workspace." };
		}

		// Parse and validate the provided elements
		let rawElements: unknown[];
		try {
			const parsed = JSON.parse(args.elements);
			if (Array.isArray(parsed)) {
				rawElements = parsed;
			} else if (
				parsed &&
				typeof parsed === "object" &&
				Array.isArray(parsed.elements)
			) {
				rawElements = parsed.elements;
			} else {
				return {
					error:
						'Invalid elements format. Provide a JSON array of Excalidraw elements, or an object with an "elements" array.',
				};
			}
		} catch {
			return { error: "Invalid JSON in elements parameter." };
		}

		const sanitized = sanitizeDrawableElements(rawElements);
		if (sanitized.length === 0) {
			return {
				error:
					"No valid Excalidraw elements found. Each element needs at minimum: type, id, x, y, width, height. Valid types: rectangle, ellipse, diamond, text, arrow, line.",
			};
		}

		// Expand `label` shorthand into proper Excalidraw bound text elements.
		// Excalidraw doesn't understand `label` as a property — it needs a
		// separate text element with `containerId` linked via `boundElements`.
		const expanded = expandLabelsToTextElements(sanitized);

		// Add required Excalidraw metadata so the client-side reconciler
		// can merge these elements with the live editor state.
		const withMetadata = expanded.map((el) => ({
			...el,
			version: (el.version as number) || 1,
			versionNonce: Math.floor(Math.random() * 2_000_000_000),
			seed: Math.floor(Math.random() * 2_000_000_000),
			isDeleted: false,
			updated: Date.now(),
		}));

		const currentScene = parseSceneData(board.sceneData);
		const positioned = positionGeneratedElements(currentScene, withMetadata);
		const normalized = ensureUniqueElementIds(positioned, currentScene);
		const nextScene = [...currentScene, ...normalized];

		const userId = resolveToolUserId(ctx);
		await withTimeout(
			ctx.runMutation(internal.ai.toolMutations.updateWhiteboardScene, {
				userId,
				whiteboardId,
				sceneData: JSON.stringify(nextScene),
				appState: board.appState ?? "{}",
			}),
			TOOL_TIMEOUT_MS,
			"addElementsToWhiteboard:updateScene",
		);

		return {
			whiteboardId,
			insertedCount: normalized.length,
			message: `Inserted ${normalized.length} elements on whiteboard "${board.title}".`,
		};
	},
});

// ── 11. approvePendingAction ──────────────────────────────────────────────

interface ApproveResult {
	approved: number;
	results: string[];
	message: string;
}

export const approvePendingAction = createTool({
	description:
		'Approve and execute pending actions that require user confirmation. Use this when the user says "approve", "confirm", "yes", "go ahead", or similar confirmations. This resolves any pending issue creations, project creations, or destructive updates that were waiting for approval.',
	inputSchema: z.object({
		approvalId: z
			.string()
			.optional()
			.describe(
				"Specific approval ID to approve. If omitted, approves all pending approvals for the current thread.",
			),
	}),
	execute: async (
		ctx: ToolContext,
		args,
	): Promise<ApproveResult | ErrorResult> => {
		if (!ctx.threadId) {
			return { error: "No thread context available." };
		}
		const userId = resolveToolUserId(ctx);

		// Get pending approvals for this thread
		const pending = await ctx.runQuery(
			internal.ai.approval.listPendingApprovalsForThread,
			{ threadId: ctx.threadId },
		);

		if (pending.length === 0) {
			return { error: "No pending approvals found for this conversation." };
		}

		// Filter to specific approval if provided
		const toApprove = args.approvalId
			? pending.filter((a: { _id: string }) => a._id === args.approvalId)
			: pending;

		if (toApprove.length === 0) {
			return { error: "Specified approval not found or already resolved." };
		}

		const results: string[] = [];
		let approved = 0;

		for (const approval of toApprove) {
			try {
				const result = await ctx.runMutation(
					internal.ai.approval.approveActionForGoogleChat,
					{
						approvalId: approval._id,
						actorUserId: userId,
						expectedToolCallId: approval.toolCallId,
					},
				);
				results.push(result.message);
				if (result.status === "approved") approved++;
			} catch (error) {
				results.push(
					`Failed to approve ${approval.toolName}: ${error instanceof Error ? error.message : "unknown error"}`,
				);
			}
		}

		return {
			approved,
			results,
			message:
				approved > 0
					? `Approved and executed ${approved} action(s): ${results.join("; ")}`
					: `No actions were executed: ${results.join("; ")}`,
		};
	},
});

// ── 12. createSprint ──────────────────────────────────────────────────────

interface CreateSprintResult {
	sprintId: string;
	name: string;
	message: string;
}

export const createSprint = createTool({
	description:
		"Create a new sprint in a project. Use this when the user asks to create a sprint, iteration, or cycle. Sprints organize issues into time-boxed work periods.",
	inputSchema: z.object({
		projectId: z.string().describe("Project ID to create the sprint in"),
		name: z
			.string()
			.describe("Sprint name (e.g., 'Sprint 12', 'March Week 1')"),
		description: z.string().optional().describe("Sprint description or goals"),
		startDate: z
			.number()
			.optional()
			.describe("Sprint start date as Unix timestamp (ms)"),
		endDate: z
			.number()
			.optional()
			.describe("Sprint end date as Unix timestamp (ms)"),
		goals: z
			.array(z.string())
			.optional()
			.describe(
				"Sprint goals — short descriptions of what the sprint aims to achieve",
			),
	}),
	execute: async (
		ctx: ToolContext,
		args,
	): Promise<CreateSprintResult | ErrorResult> => {
		const workspaceId = await resolveWorkspaceId(ctx);
		const userId = resolveToolUserId(ctx);

		// Verify project exists and belongs to workspace
		const project = await ctx.runQuery(internal.ai.toolQueries.getProjectById, {
			projectId: args.projectId as Id<"projects">,
			userId,
		});
		if (!project || project.workspaceId !== workspaceId) {
			return { error: "Project not found." };
		}

		const sprintId = await withTimeout(
			ctx.runMutation(internal.ai.toolMutations.createSprint, {
				userId,
				projectId: args.projectId as Id<"projects">,
				name: args.name,
				description: args.description,
				startDate: args.startDate,
				endDate: args.endDate,
				goals: args.goals,
			}),
			TOOL_TIMEOUT_MS,
			"createSprint",
		);

		return {
			sprintId,
			name: args.name,
			message: `Created sprint "${args.name}" in project "${project.name}"`,
		};
	},
});

// ── 13. moveIssueToSprint ────────────────────────────────────────────────

interface MoveIssueToSprintResult {
	issueId: string;
	identifier: string;
	sprintName: string | null;
	message: string;
}

export const moveIssueToSprint = createTool({
	description:
		'Move an issue to a sprint or back to the backlog. Use this when the user asks to assign an issue to a sprint, move issues between sprints, or send an issue back to the backlog. Provide the issue identifier (e.g., "CLV-042") and the target sprint ID. Omit sprintId to move to backlog.',
	inputSchema: z.object({
		identifier: z
			.string()
			.optional()
			.describe('Issue identifier like "CLV-042"'),
		issueId: z.string().optional().describe("Issue ID (Convex document ID)"),
		sprintId: z
			.string()
			.optional()
			.nullable()
			.describe("Sprint ID to move to. Omit or null to move to backlog."),
	}),
	execute: async (
		ctx: ToolContext,
		args,
	): Promise<MoveIssueToSprintResult | ErrorResult> => {
		if (!args.identifier && !args.issueId) {
			return { error: "Provide either an identifier or issueId." };
		}

		const workspaceId = await resolveWorkspaceId(ctx);
		const userId = resolveToolUserId(ctx);

		// Resolve issue
		let resolvedIssueId: Id<"issues">;
		let issueIdentifier: string;
		if (args.issueId) {
			const issue = await ctx.runQuery(internal.ai.toolQueries.getIssueById, {
				issueId: args.issueId as Id<"issues">,
				userId,
			});
			if (!issue || issue.workspaceId !== workspaceId) {
				return { error: "Issue not found." };
			}
			resolvedIssueId = issue._id;
			issueIdentifier = issue.identifier;
		} else {
			const issue = await ctx.runQuery(
				internal.ai.toolQueries.getIssueByIdentifier,
				{ workspaceId, identifier: args.identifier as string, userId },
			);
			if (!issue) {
				return { error: `Issue "${args.identifier}" not found.` };
			}
			resolvedIssueId = issue._id;
			issueIdentifier = issue.identifier;
		}

		// Move the issue
		await withTimeout(
			ctx.runMutation(internal.ai.toolMutations.moveIssueToSprint, {
				userId,
				issueId: resolvedIssueId,
				sprintId: args.sprintId ? (args.sprintId as Id<"sprints">) : undefined,
			}),
			TOOL_TIMEOUT_MS,
			"moveIssueToSprint",
		);

		const destination = args.sprintId ? "sprint" : "backlog";
		return {
			issueId: resolvedIssueId,
			identifier: issueIdentifier,
			sprintName: null,
			message: `Moved issue ${issueIdentifier} to ${destination}`,
		};
	},
});

// ── 14. updateSprint ─────────────────────────────────────────────────────

interface UpdateSprintResult {
	sprintId: string;
	updatedFields: string[];
	message: string;
}

export const updateSprint = createTool({
	description:
		"Update a sprint's fields — name, status, dates, goals. Use when the user asks to start a sprint, complete a sprint, change sprint dates, or update sprint goals.",
	inputSchema: z.object({
		sprintId: z.string().describe("Sprint ID to update"),
		name: z.string().optional().describe("New sprint name"),
		status: z
			.enum(["planned", "active", "completed", "cancelled"])
			.optional()
			.describe("New sprint status"),
		startDate: z.number().optional().describe("New start date (Unix ms)"),
		endDate: z.number().optional().describe("New end date (Unix ms)"),
		goals: z.array(z.string()).optional().describe("Updated sprint goals"),
	}),
	execute: async (
		ctx: ToolContext,
		args,
	): Promise<UpdateSprintResult | ErrorResult> => {
		const userId = resolveToolUserId(ctx);

		const updates: Record<string, unknown> = {};
		if (args.name !== undefined) updates.name = args.name;
		if (args.status !== undefined) updates.status = args.status;
		if (args.startDate !== undefined) updates.startDate = args.startDate;
		if (args.endDate !== undefined) updates.endDate = args.endDate;
		if (args.goals !== undefined) updates.goals = args.goals;

		if (Object.keys(updates).length === 0) {
			return { error: "No fields to update." };
		}

		await withTimeout(
			ctx.runMutation(internal.ai.toolMutations.updateSprint, {
				userId,
				sprintId: args.sprintId as Id<"sprints">,
				...updates,
			}),
			TOOL_TIMEOUT_MS,
			"updateSprint",
		);

		return {
			sprintId: args.sprintId,
			updatedFields: Object.keys(updates),
			message: `Updated sprint: ${Object.keys(updates).join(", ")}`,
		};
	},
});

// ── Export all write tools as a named toolset ─────────────────────────────

export const writeTools = {
	bulkCreateIssues,
	createIssue,
	updateIssue,
	addComment,
	assignIssue,
	batchUpdateIssues,
	createDocument,
	updateDocument,
	appendToDocument,
	updateDocumentSection,
	createProject,
	updateProject,
	createLabel,
	createWhiteboard,
	updateWhiteboard,
	addElementsToWhiteboard,
	approvePendingAction,
	createSprint,
	moveIssueToSprint,
	updateSprint,
};
