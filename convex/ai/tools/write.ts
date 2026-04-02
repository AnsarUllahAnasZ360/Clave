import { createTool } from "@convex-dev/agent";
import type { ToolExecutionOptions } from "ai";
import { z } from "zod";
import { api, internal } from "../../_generated/api";
import type { Id } from "../../_generated/dataModel";
import {
	extractElementsPayload,
	sanitizeDrawableElements,
} from "../whiteboardMcp";
import {
	buildUserNameMap,
	resolveToolUserId,
	resolveWorkspaceId,
	TOOL_TIMEOUT_MS,
	withTimeout,
} from "./helpers";
import type { ToolContext } from "./types";

// ── Whiteboard scene summarizer ───────────────────────────────────────────

const MAX_SUMMARY_ELEMENTS = 60;

/**
 * Produce a human-readable summary of an Excalidraw scene for AI prompt
 * enrichment. Mirrors the client-side `serializeCanvasForAI` logic.
 */
function summarizeBoardScene(sceneData?: string | null): string | null {
	if (!sceneData) return null;
	try {
		const parsed = JSON.parse(sceneData) as unknown;
		if (!Array.isArray(parsed)) return null;

		type El = {
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
		const elements = (parsed as El[]).filter(
			(el) => el && typeof el === "object" && !el.isDeleted && el.type,
		);
		if (elements.length === 0) return null;

		const elementMap = new Map(elements.map((el) => [el.id, el]));
		function getBoundText(el: El): string | null {
			if (el.text) return el.text;
			const b = el.boundElements?.find((b) => b.type === "text");
			if (!b) return null;
			return elementMap.get(b.id)?.text ?? null;
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

		const lines: string[] = [`${elements.length} elements total`];

		if (shapes.length > 0) {
			lines.push("Shapes:");
			for (const shape of shapes.slice(0, MAX_SUMMARY_ELEMENTS)) {
				const label = getBoundText(shape);
				const labelStr = label
					? ` "${label.length > 50 ? `${label.slice(0, 47)}...` : label}"`
					: "";
				lines.push(
					`  - ${shape.type}${labelStr} at (${Math.round(shape.x)},${Math.round(shape.y)}) size ${Math.round(shape.width)}x${Math.round(shape.height)}`,
				);
			}
			if (shapes.length > MAX_SUMMARY_ELEMENTS) {
				lines.push(
					`  ... and ${shapes.length - MAX_SUMMARY_ELEMENTS} more shapes`,
				);
			}
		}

		if (standaloneText.length > 0) {
			lines.push("Text:");
			for (const t of standaloneText.slice(0, 20)) {
				const txt = t.text ?? "";
				lines.push(
					`  - "${txt.length > 60 ? `${txt.slice(0, 57)}...` : txt}" at (${Math.round(t.x)},${Math.round(t.y)})`,
				);
			}
		}

		if (arrows.length > 0) {
			lines.push("Connections:");
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
					? `"${fromLabel.slice(0, 30)}"`
					: (arrow.startBinding?.elementId?.slice(0, 8) ?? "?");
				const toStr = toLabel
					? `"${toLabel.slice(0, 30)}"`
					: (arrow.endBinding?.elementId?.slice(0, 8) ?? "?");
				lines.push(`  - ${fromStr} -> ${toStr}`);
			}
		}

		return lines.join("\n");
	} catch {
		return null;
	}
}

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

interface GenerateWhiteboardDiagramResult {
	whiteboardId: string;
	insertedCount: number;
	message: string;
}

interface ErrorResult {
	error: string;
}

type SceneElement = Record<string, unknown>;
const WHITEBOARD_GENERATION_TIMEOUT_MS = 120_000;

const SHAPE_TYPES = new Set(["rectangle", "ellipse", "diamond"]);

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

function parseLooseJson(text: string): unknown {
	const cleaned = text
		.replace(/^```(?:json)?\s*/i, "")
		.replace(/\s*```$/i, "")
		.trim();
	if (!cleaned) return null;
	try {
		return JSON.parse(cleaned);
	} catch {
		return null;
	}
}

function convertNodesEdgesToElements(
	payload: Record<string, unknown>,
): SceneElement[] {
	const nodes = Array.isArray(payload.nodes)
		? payload.nodes.filter(
				(node): node is Record<string, unknown> =>
					Boolean(node) && typeof node === "object",
			)
		: [];
	const edges = Array.isArray(payload.edges)
		? payload.edges.filter(
				(edge): edge is Record<string, unknown> =>
					Boolean(edge) && typeof edge === "object",
			)
		: [];
	if (nodes.length === 0) return [];

	const elements: SceneElement[] = [];
	const positions = new Map<string, { x: number; y: number }>();
	const cols = Math.max(1, Math.ceil(Math.sqrt(nodes.length)));
	const nodeWidth = 180;
	const nodeHeight = 80;
	const hSpacing = 240;
	const vSpacing = 140;

	for (const [index, node] of nodes.entries()) {
		const nodeId =
			typeof node.id === "string" && node.id.trim()
				? node.id.trim()
				: `node-${index + 1}`;
		const nodeType =
			typeof node.type === "string" && SHAPE_TYPES.has(node.type)
				? node.type
				: "rectangle";
		const label =
			typeof node.label === "string" && node.label.trim()
				? node.label.trim()
				: `Step ${index + 1}`;
		const col = index % cols;
		const row = Math.floor(index / cols);
		const x = col * hSpacing;
		const y = row * vSpacing;
		elements.push({
			type: nodeType,
			id: nodeId,
			x,
			y,
			width: nodeWidth,
			height: nodeHeight,
			label: { text: label, fontSize: 16 },
		});
		positions.set(nodeId, { x: x + nodeWidth / 2, y: y + nodeHeight / 2 });
	}

	let arrowCounter = 1;
	for (const edge of edges) {
		const fromId =
			typeof edge.from === "string" && edge.from.trim()
				? edge.from.trim()
				: null;
		const toId =
			typeof edge.to === "string" && edge.to.trim() ? edge.to.trim() : null;
		if (!fromId || !toId) continue;
		const fromPos = positions.get(fromId);
		const toPos = positions.get(toId);
		if (!fromPos || !toPos) continue;
		elements.push({
			type: "arrow",
			id: `edge-${arrowCounter++}`,
			x: fromPos.x,
			y: fromPos.y,
			width: toPos.x - fromPos.x,
			height: toPos.y - fromPos.y,
			startBinding: { elementId: fromId },
			endBinding: { elementId: toId },
			endArrowhead: "arrow",
		});
	}

	return elements;
}

function normalizeGeneratedPayload(payload: unknown): SceneElement[] {
	const sanitized = sanitizeDrawableElements(extractElementsPayload(payload));
	if (sanitized.length > 0) return sanitized;
	if (payload && typeof payload === "object") {
		return sanitizeDrawableElements(
			convertNodesEdgesToElements(payload as Record<string, unknown>),
		);
	}
	return [];
}

// ── 1. createIssue ───────────────────────────────────────────────────────

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

// ── 2. updateIssue ───────────────────────────────────────────────────────

export const updateIssue = createTool({
	description:
		"Update an existing issue's fields. Use this when the user asks to change an issue's status, priority, assignee, title, or description. Provide either the issue identifier (e.g., \"CLV-042\") or the issue ID.",
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

		// Build the update payload with only provided fields
		const updates: Record<string, unknown> = {};
		if (args.title !== undefined) updates.title = args.title;
		if (args.description !== undefined) updates.description = args.description;
		if (args.status !== undefined) updates.status = args.status;
		if (args.priority !== undefined) updates.priority = args.priority;
		if (args.type !== undefined) updates.type = args.type;
		if (args.assigneeId !== undefined) updates.assigneeId = args.assigneeId;

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

// ── 3. addComment ────────────────────────────────────────────────────────

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

// ── 4. assignIssue ────────────────────────────────────────────────────────

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

// ── 5. batchUpdateIssues ──────────────────────────────────────────────────

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

// ── 6. createDocument ─────────────────────────────────────────────────────

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

// ── 6b. updateDocument ───────────────────────────────────────────────────

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

// ── 7. createProject ──────────────────────────────────────────────────────

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

// ── 7b. updateProject ────────────────────────────────────────────────────

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

// ── 8. createLabel ────────────────────────────────────────────────────────

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

// ── 9. generateWhiteboardDiagram ─────────────────────────────────────────

export const generateWhiteboardDiagram = createTool({
	description:
		"Generate a diagram on a whiteboard and persist it directly to the board scene. Use this when the user asks in chat to create a wireframe/flowchart/architecture diagram on the current whiteboard.",
	inputSchema: z.object({
		prompt: z
			.string()
			.describe("The diagram request, e.g. 'Wireframe for a todo app'."),
		whiteboardId: z
			.string()
			.optional()
			.describe(
				"Target whiteboard ID. Use the ID from page context when on a board page.",
			),
		mode: z
			.enum(["wireframe", "flowchart", "architecture"])
			.optional()
			.describe("Optional generation mode override."),
	}),
	execute: async (
		ctx: ToolContext,
		args,
	): Promise<GenerateWhiteboardDiagramResult | ErrorResult> => {
		const workspaceId = await resolveWorkspaceId(ctx);

		if (!args.whiteboardId) {
			return {
				error:
					"whiteboardId is required. Use the active board ID from page context.",
			};
		}

		const whiteboardId = args.whiteboardId as Id<"whiteboards">;
		const board = await withTimeout(
			ctx.runQuery(internal.ai.toolQueries.getWhiteboardById, {
				whiteboardId,
			}),
			TOOL_TIMEOUT_MS,
			"generateWhiteboardDiagram:getById",
		);
		if (!board) {
			return { error: "Whiteboard not found or access denied." };
		}
		if (board.workspaceId !== workspaceId) {
			return {
				error:
					"Target whiteboard belongs to a different workspace than the current chat.",
			};
		}

		// Build an enriched prompt with canvas context for quality parity
		// with the toolbar's client-side generation path.
		const canvasSummary = summarizeBoardScene(board.sceneData);
		const enrichedPrompt = [
			`User request:\n${args.prompt}`,
			canvasSummary ? `Canvas snapshot:\n${canvasSummary}` : null,
			canvasSummary
				? "Extend or complement the existing layout where relevant."
				: "Generate a fresh layout.",
		]
			.filter(Boolean)
			.join("\n\n");

		const generationResult = await withTimeout(
			ctx.runAction(api.ai.embedded.embeddedAction, {
				type: "whiteboard_generate_diagram",
				context: {
					workspaceId,
					whiteboardId,
				},
				prompt: enrichedPrompt,
				...(args.mode
					? {
							whiteboard: {
								generation: {
									mode: args.mode,
								},
							},
						}
					: {}),
			}),
			WHITEBOARD_GENERATION_TIMEOUT_MS,
			"generateWhiteboardDiagram:embeddedAction",
		);

		if (generationResult.error) {
			return { error: generationResult.error };
		}

		let generatedElements = normalizeGeneratedPayload(generationResult.data);
		if (
			generatedElements.length === 0 &&
			typeof generationResult.text === "string"
		) {
			generatedElements = normalizeGeneratedPayload(
				parseLooseJson(generationResult.text),
			);
		}
		if (generatedElements.length === 0) {
			return {
				error:
					"Generation did not return drawable elements for this whiteboard prompt.",
			};
		}

		const currentScene = parseSceneData(board.sceneData);
		const positioned = positionGeneratedElements(
			currentScene,
			generatedElements,
		);
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
			"generateWhiteboardDiagram:updateScene",
		);

		return {
			whiteboardId,
			insertedCount: normalized.length,
			message: `Generated and inserted ${normalized.length} elements on whiteboard ${whiteboardId}.`,
		};
	},
});

// ── 10. approvePendingAction ──────────────────────────────────────────────

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

// ── 11. createSprint ──────────────────────────────────────────────────────

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

// ── 12. moveIssueToSprint ────────────────────────────────────────────────

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

// ── 13. updateSprint ─────────────────────────────────────────────────────

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
	createIssue,
	updateIssue,
	addComment,
	assignIssue,
	batchUpdateIssues,
	createDocument,
	updateDocument,
	createProject,
	updateProject,
	createLabel,
	generateWhiteboardDiagram,
	approvePendingAction,
	createSprint,
	moveIssueToSprint,
	updateSprint,
};
