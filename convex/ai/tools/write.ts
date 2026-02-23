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
			message: `⚠️ This action requires your approval: ${description}. Please approve or reject in the chat.`,
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

		// Resolve issueId from identifier if needed
		let resolvedIssueId: Id<"issues">;
		if (args.issueId) {
			// Validate the issueId by looking up the issue
			const issue = await ctx.runQuery(api.issues.getById, {
				issueId: args.issueId as Id<"issues">,
			});
			if (!issue || issue.workspaceId !== workspaceId) {
				return { error: "Issue not found." };
			}
			resolvedIssueId = issue._id;
		} else if (args.identifier) {
			const issue = await ctx.runQuery(api.issues.getByIdentifier, {
				workspaceId,
				identifier: args.identifier,
			});
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
				message: `⚠️ This action requires your approval: ${description}. Please approve or reject in the chat.`,
			};
		}

		// Non-destructive updates execute immediately
		const updatePayload: {
			issueId: Id<"issues">;
			title?: string;
			description?: string;
			status?:
				| "triage"
				| "backlog"
				| "todo"
				| "in_progress"
				| "in_review"
				| "done"
				| "cancelled";
			priority?: "urgent" | "high" | "medium" | "low" | "no_priority";
			type?: "issue" | "bug" | "improvement" | "feature";
			assigneeId?: Id<"users">;
		} = { issueId: resolvedIssueId };

		if (args.title !== undefined) updatePayload.title = args.title;
		if (args.description !== undefined)
			updatePayload.description = args.description;
		if (args.status !== undefined) updatePayload.status = args.status;
		if (args.priority !== undefined) updatePayload.priority = args.priority;
		if (args.type !== undefined) updatePayload.type = args.type;
		if (args.assigneeId !== undefined)
			updatePayload.assigneeId = args.assigneeId as Id<"users">;

		await withTimeout(
			ctx.runMutation(api.issues.update, updatePayload),
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

		if (args.issueId || args.identifier) {
			// Resolve issue
			let resolvedIssueId: Id<"issues">;
			if (args.issueId) {
				const issue = await ctx.runQuery(api.issues.getById, {
					issueId: args.issueId as Id<"issues">,
				});
				if (!issue || issue.workspaceId !== workspaceId) {
					return { error: "Issue not found." };
				}
				resolvedIssueId = issue._id;
			} else {
				const issue = await ctx.runQuery(api.issues.getByIdentifier, {
					workspaceId,
					identifier: args.identifier as string,
				});
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

		// The comments.create mutation handles auth, notifications, and activity logging
		const commentId = await withTimeout(
			ctx.runMutation(api.comments.create, createArgs),
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

		// Resolve issueId from identifier if needed
		let resolvedIssueId: Id<"issues">;
		let issueIdentifier: string;
		if (args.issueId) {
			const issue = await ctx.runQuery(api.issues.getById, {
				issueId: args.issueId as Id<"issues">,
			});
			if (!issue || issue.workspaceId !== workspaceId) {
				return { error: "Issue not found." };
			}
			resolvedIssueId = issue._id;
			issueIdentifier = issue.identifier;
		} else if (args.identifier) {
			const issue = await ctx.runQuery(api.issues.getByIdentifier, {
				workspaceId,
				identifier: args.identifier,
			});
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

		// The mutation handles auth, RBAC, workspace member validation,
		// activity logging, and notifications internally
		await withTimeout(
			ctx.runMutation(api.issues.assign, {
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

		// Validate all issueIds belong to this workspace
		const issueIds = args.issueIds as Id<"issues">[];
		const identifiers: string[] = [];
		for (const issueId of issueIds) {
			const issue = await ctx.runQuery(api.issues.getById, { issueId });
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
			message: `⚠️ This action requires your approval: ${description}. Please approve or reject in the chat.`,
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
				"Initial document content as plain text. Leave empty for the user to edit later.",
			),
	}),
	execute: async (
		ctx: ToolContext,
		args,
	): Promise<CreateDocumentResult | ErrorResult> => {
		const workspaceId = await resolveWorkspaceId(ctx);

		// Create the document — the mutation handles auth, RBAC, activity logging, and notifications
		const documentId = await withTimeout(
			ctx.runMutation(api.documents.create, {
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
				ctx.runMutation(api.documents.updateContent, {
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
			message: `⚠️ This action requires your approval: ${description}. Please approve or reject in the chat.`,
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

		// The labels.create mutation handles admin check, uniqueness validation,
		// and sort order internally
		const labelId = await withTimeout(
			ctx.runMutation(api.labels.create, {
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
			ctx.runQuery(api.whiteboards.getById, { whiteboardId }),
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

		const generationResult = await withTimeout(
			ctx.runAction(api.ai.embedded.embeddedAction, {
				type: "whiteboard_generate_diagram",
				context: {
					workspaceId,
					whiteboardId,
				},
				prompt: args.prompt,
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
			90_000,
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

		await withTimeout(
			ctx.runMutation(api.whiteboards.updateScene, {
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

// ── Export all write tools as a named toolset ─────────────────────────────

export const writeTools = {
	createIssue,
	updateIssue,
	addComment,
	assignIssue,
	batchUpdateIssues,
	createDocument,
	createProject,
	createLabel,
	generateWhiteboardDiagram,
};
