import { saveMessages } from "@convex-dev/agent";
import { ConvexError, v } from "convex/values";
import { api, components, internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import {
	internalMutation,
	internalQuery,
	type MutationCtx,
	mutation,
	type QueryCtx,
	query,
} from "../_generated/server";
import {
	type BoardImageAttachment,
	mergeDescriptionWithBoardImages,
} from "./boardImageDescription";
import { requireThreadOwnership } from "./chatQueries";

/**
 * Resolve a list of whiteboardImages row IDs to markdown-embed-ready
 * attachments. Used by the create{Issue,Project} approval handlers to attach
 * board visuals inline. Rows that no longer exist are silently dropped.
 */
async function resolveBoardImageAttachments(
	ctx: MutationCtx,
	imageIds: string[] | undefined,
): Promise<BoardImageAttachment[]> {
	if (!imageIds || imageIds.length === 0) return [];
	const out: BoardImageAttachment[] = [];
	for (const raw of imageIds) {
		const row = await ctx.db.get(raw as Id<"whiteboardImages">);
		if (!row) continue;
		// Use a stable proxy URL so the embed survives signed-URL rotation.
		out.push({
			url: `/api/whiteboard-image/${row._id}`,
			caption: row.caption,
		});
	}
	return out;
}

type DeferredApprovalPayload = {
	type: string;
	issueId?: string;
	issueIds?: string[];
	/** `bulkCreateIssues` tool — rows approved in one step */
	issues?: Array<{
		title: string;
		description?: string;
		status?: string;
		priority?: string;
		type?: string;
		assigneeId?: string;
		projectId?: string;
		sprintId?: string;
		labelIds?: string[];
	}>;
	workspaceId?: string;
	args?: Record<string, unknown>;
	updates?: Record<string, unknown>;
	status?: string;
	assigneeId?: string;
};

function toSlug(value: string): string {
	return (
		value
			.toLowerCase()
			.trim()
			.replace(/[^a-z0-9]+/g, "-")
			.replace(/^-+|-+$/g, "") || "project"
	);
}

async function assertWorkspaceMember(
	ctx: MutationCtx | QueryCtx,
	workspaceId: Id<"workspaces">,
	actorUserId: Id<"users">,
) {
	const membership = await ctx.db
		.query("workspaceMembers")
		.withIndex("by_workspace_user", (q) =>
			q.eq("workspaceId", workspaceId).eq("userId", actorUserId),
		)
		.unique();
	if (!membership) {
		throw new ConvexError("Not a workspace member");
	}
	return membership;
}

async function resolveIssueIdentifierAndSortOrder(
	ctx: MutationCtx,
	workspaceId: Id<"workspaces">,
) {
	const settings = await ctx.db
		.query("workspaceSettings")
		.withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
		.unique();
	const prefix = (settings?.issuePrefix ?? "ISS").trim().toUpperCase();
	const issues = await ctx.db
		.query("issues")
		.withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
		.collect();
	const issueNumberFromIdentifier = (identifier: string) => {
		const regex = new RegExp(`^${prefix}-(\\d+)$`, "i");
		const match = identifier.match(regex);
		if (!match) return null;
		const parsed = Number.parseInt(match[1], 10);
		return Number.isFinite(parsed) ? parsed : null;
	};
	let maxIssueNumber =
		typeof settings?.nextIssueNumber === "number"
			? settings.nextIssueNumber - 1
			: 0;
	let maxSortOrder = 0;
	for (const issue of issues) {
		const issueNumber = issueNumberFromIdentifier(issue.identifier);
		if (issueNumber && issueNumber > maxIssueNumber) {
			maxIssueNumber = issueNumber;
		}
		if (issue.sortOrder > maxSortOrder) {
			maxSortOrder = issue.sortOrder;
		}
	}
	const nextIssueNumber = maxIssueNumber + 1;
	if (settings) {
		await ctx.db.patch(settings._id, {
			nextIssueNumber: nextIssueNumber + 1,
		});
	}

	return {
		identifier: `${prefix}-${String(nextIssueNumber).padStart(3, "0")}`,
		sortOrder: maxSortOrder + 1024,
	};
}

function normalizeStatusPatch(
	status:
		| "triage"
		| "backlog"
		| "todo"
		| "in_progress"
		| "in_review"
		| "done"
		| "cancelled"
		| undefined,
) {
	if (!status) {
		return {};
	}
	if (status === "done" || status === "cancelled") {
		return { completedAt: Date.now() };
	}
	return { completedAt: undefined };
}

async function assertThreadOwnedByActor(
	ctx: MutationCtx | QueryCtx,
	threadId: string,
	actorUserId: Id<"users">,
): Promise<Id<"users">> {
	const threadMeta = await ctx.db
		.query("aiThreads")
		.withIndex("by_thread_id", (q) => q.eq("threadId", threadId))
		.unique();
	if (!threadMeta) {
		throw new ConvexError("Thread not found");
	}
	if (threadMeta.userId !== actorUserId) {
		throw new ConvexError("Approval action denied for this actor");
	}
	return threadMeta.userId;
}

async function executeDeferredApprovalMutation(
	ctx: MutationCtx,
	payload: DeferredApprovalPayload,
	actorUserId?: Id<"users">,
) {
	let resultMessage = "Action executed successfully";

	if (payload.type === "createIssue") {
		const args = payload.args as {
			title: string;
			description?: string;
			status?: string;
			priority?: string;
			type?: string;
			assigneeId?: string;
			projectId?: string;
			labelIds?: string[];
			attachBoardImageIds?: string[];
		};
		const attachments = await resolveBoardImageAttachments(
			ctx,
			args.attachBoardImageIds,
		);
		const descriptionWithImages = mergeDescriptionWithBoardImages(
			args.description,
			attachments,
		);
		const result = await ctx.runMutation(api.issues.create, {
			workspaceId: payload.workspaceId as Id<"workspaces">,
			title: args.title,
			description: descriptionWithImages,
			status: args.status as
				| "triage"
				| "backlog"
				| "todo"
				| "in_progress"
				| "in_review"
				| "done"
				| "cancelled"
				| undefined,
			priority: args.priority as
				| "urgent"
				| "high"
				| "medium"
				| "low"
				| "no_priority"
				| undefined,
			type: args.type as
				| "issue"
				| "bug"
				| "improvement"
				| "feature"
				| undefined,
			assigneeId: args.assigneeId as Id<"users"> | undefined,
			projectId: args.projectId as Id<"projects"> | undefined,
			labelIds: args.labelIds as Array<Id<"labels">> | undefined,
		});
		resultMessage = `Created issue ${result.identifier}: "${args.title}"`;
	} else if (payload.type === "bulkCreateIssues") {
		const workspaceId = payload.workspaceId as Id<"workspaces">;
		const rawIssues = payload.issues as
			| Array<{
					title: string;
					description?: string;
					status?: string;
					priority?: string;
					type?: string;
					assigneeId?: string;
					projectId?: string;
					sprintId?: string;
					labelIds?: string[];
					attachBoardImageIds?: string[];
			  }>
			| undefined;
		if (!rawIssues?.length) {
			throw new ConvexError("bulkCreateIssues: no issues in payload");
		}

		// Batch-resolve identifiers and sortOrder once for all issues.
		// This avoids calling api.issues.create N times which triggers
		// N × (auth + settings patch + activity + notifications + indexing)
		// and easily overflows the transaction document limit.
		const settings = await ctx.db
			.query("workspaceSettings")
			.withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
			.unique();
		const prefix = (settings?.issuePrefix ?? "ISS").trim().toUpperCase();
		let nextNumber = settings?.nextIssueNumber ?? 1;

		const allIssues = await ctx.db
			.query("issues")
			.withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
			.collect();
		let maxSortOrder = 0;
		for (const issue of allIssues) {
			if (issue.sortOrder > maxSortOrder) maxSortOrder = issue.sortOrder;
		}

		const identifiers: string[] = [];
		for (const args of rawIssues) {
			if (!args.title?.trim()) continue;
			const attachments = await resolveBoardImageAttachments(
				ctx,
				args.attachBoardImageIds,
			);
			const descriptionWithImages = mergeDescriptionWithBoardImages(
				args.description,
				attachments,
			);
			const identifier = `${prefix}-${String(nextNumber).padStart(3, "0")}`;
			nextNumber += 1;
			maxSortOrder += 1024;
			const status = (args.status ?? "backlog") as string;
			const issueId = await ctx.db.insert("issues", {
				workspaceId,
				projectId: args.projectId
					? (args.projectId as Id<"projects">)
					: undefined,
				sprintId: args.sprintId ? (args.sprintId as Id<"sprints">) : undefined,
				identifier,
				title: args.title.trim(),
				description: descriptionWithImages,
				status,
				priority: (args.priority ?? "no_priority") as string,
				type: (args.type ?? "issue") as string,
				assigneeId: args.assigneeId
					? (args.assigneeId as Id<"users">)
					: undefined,
				assigneeIds: args.assigneeId
					? [args.assigneeId as Id<"users">]
					: undefined,
				labelIds: args.labelIds as Array<Id<"labels">> | undefined,
				sortOrder: maxSortOrder,
				createdBy: actorUserId ?? (workspaceId as unknown as Id<"users">),
				updatedAt: Date.now(),
				completedAt:
					status === "done" || status === "cancelled" ? Date.now() : undefined,
			});
			identifiers.push(identifier);
			// Schedule indexing asynchronously (non-blocking)
			await ctx.scheduler.runAfter(
				0,
				internal.ai.indexing.issueIndexer.indexIssue,
				{ issueId },
			);
		}

		// Persist the incremented counter once for the whole batch
		if (settings) {
			await ctx.db.patch(settings._id, { nextIssueNumber: nextNumber });
		}

		resultMessage = `Created ${identifiers.length} issues: ${identifiers.join(", ")}`;
	} else if (payload.type === "updateIssue") {
		// Route through api.issues.update for full RBAC, activity logging, and notifications
		await ctx.runMutation(api.issues.update, {
			issueId: payload.issueId as Id<"issues">,
			...payload.updates,
		});
		const updatedFields = Object.keys(payload.updates ?? {});
		resultMessage = `Updated issue: ${updatedFields.join(", ")}`;
	} else if (payload.type === "batchUpdateStatus") {
		const issueIds = (payload.issueIds ?? []) as Id<"issues">[];
		const status = payload.status as
			| "triage"
			| "backlog"
			| "todo"
			| "in_progress"
			| "in_review"
			| "done"
			| "cancelled";
		await ctx.runMutation(api.issues.bulkUpdateStatus, {
			issueIds,
			status,
		});
		const statusLabel = status.replace(/_/g, " ");
		resultMessage = `Updated ${issueIds.length} issues to status "${statusLabel}"`;
	} else if (payload.type === "batchAssign") {
		const issueIds = (payload.issueIds ?? []) as Id<"issues">[];
		const assigneeId = payload.assigneeId
			? (payload.assigneeId as Id<"users">)
			: undefined;
		await ctx.runMutation(api.issues.bulkAssign, {
			issueIds,
			assigneeId,
		});
		resultMessage = assigneeId
			? `Assigned ${issueIds.length} issues`
			: `Unassigned ${issueIds.length} issues`;
	} else if (payload.type === "createProject") {
		const args = payload.args as {
			name: string;
			description?: string;
			status?: string;
			priority?: string;
			leadId?: string;
			startDate?: number;
			endDate?: number;
			attachBoardImageIds?: string[];
		};
		const attachments = await resolveBoardImageAttachments(
			ctx,
			args.attachBoardImageIds,
		);
		const descriptionWithImages = mergeDescriptionWithBoardImages(
			args.description,
			attachments,
		);
		await ctx.runMutation(api.projects.create, {
			workspaceId: payload.workspaceId as Id<"workspaces">,
			name: args.name,
			description: descriptionWithImages,
			status: args.status as
				| "backlog"
				| "planned"
				| "active"
				| "completed"
				| "cancelled"
				| undefined,
			priority: args.priority as
				| "urgent"
				| "high"
				| "medium"
				| "low"
				| "no_priority"
				| undefined,
			leadId: args.leadId as Id<"users"> | undefined,
			startDate: args.startDate,
			endDate: args.endDate,
		});
		resultMessage = `Created project: "${args.name}"`;
	}

	return resultMessage;
}

async function executeDeferredApprovalMutationForGoogleChat(
	ctx: MutationCtx,
	payload: DeferredApprovalPayload,
	actorUserId: Id<"users">,
) {
	let resultMessage = "Action executed successfully";

	if (payload.type === "createIssue") {
		const workspaceId = payload.workspaceId as Id<"workspaces">;
		if (!workspaceId) {
			throw new ConvexError("createIssue payload missing workspaceId");
		}
		await assertWorkspaceMember(ctx, workspaceId, actorUserId);

		const args = payload.args as {
			title: string;
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
			assigneeId?: string;
			projectId?: string;
			labelIds?: string[];
			attachBoardImageIds?: string[];
		};
		if (!args?.title?.trim()) {
			throw new ConvexError("createIssue payload missing title");
		}

		const attachments = await resolveBoardImageAttachments(
			ctx,
			args.attachBoardImageIds,
		);
		const descriptionWithImages = mergeDescriptionWithBoardImages(
			args.description,
			attachments,
		);

		const { identifier, sortOrder } = await resolveIssueIdentifierAndSortOrder(
			ctx,
			workspaceId,
		);
		const status = args.status ?? "triage";
		const issueId = await ctx.db.insert("issues", {
			workspaceId,
			projectId: args.projectId as Id<"projects"> | undefined,
			identifier,
			title: args.title.trim(),
			description: descriptionWithImages,
			status,
			priority: args.priority ?? "no_priority",
			type: args.type ?? "issue",
			assigneeId: args.assigneeId as Id<"users"> | undefined,
			labelIds: args.labelIds as Array<Id<"labels">> | undefined,
			sortOrder,
			createdBy: actorUserId,
			updatedAt: Date.now(),
			...normalizeStatusPatch(status),
		});
		resultMessage = `Created issue ${identifier}: "${args.title}"`;

		// Ensure the issue exists before returning and keep TypeScript aware of usage.
		if (!issueId) {
			throw new ConvexError("Failed to create issue");
		}
	} else if (payload.type === "bulkCreateIssues") {
		const workspaceId = payload.workspaceId as Id<"workspaces">;
		if (!workspaceId) {
			throw new ConvexError("bulkCreateIssues payload missing workspaceId");
		}
		await assertWorkspaceMember(ctx, workspaceId, actorUserId);
		return await executeDeferredApprovalMutation(ctx, payload, actorUserId);
	} else if (payload.type === "updateIssue") {
		const issueId = payload.issueId as Id<"issues">;
		if (!issueId) {
			throw new ConvexError("updateIssue payload missing issueId");
		}
		const issue = await ctx.db.get(issueId);
		if (!issue) {
			throw new ConvexError("Issue not found");
		}
		await assertWorkspaceMember(ctx, issue.workspaceId, actorUserId);

		const rawUpdates = (payload.updates ?? {}) as Record<string, unknown>;
		const patch: {
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
			projectId?: Id<"projects">;
			labelIds?: Array<Id<"labels">>;
			startDate?: number;
			dueDate?: number;
			estimate?: number;
			updatedAt: number;
			completedAt?: number;
		} = {
			updatedAt: Date.now(),
		};

		if (typeof rawUpdates.title === "string") patch.title = rawUpdates.title;
		if (typeof rawUpdates.description === "string") {
			patch.description = rawUpdates.description;
		}
		if (typeof rawUpdates.status === "string") {
			patch.status = rawUpdates.status as
				| "triage"
				| "backlog"
				| "todo"
				| "in_progress"
				| "in_review"
				| "done"
				| "cancelled";
			Object.assign(patch, normalizeStatusPatch(patch.status));
		}
		if (typeof rawUpdates.priority === "string") {
			patch.priority = rawUpdates.priority as
				| "urgent"
				| "high"
				| "medium"
				| "low"
				| "no_priority";
		}
		if (typeof rawUpdates.type === "string") {
			patch.type = rawUpdates.type as
				| "issue"
				| "bug"
				| "improvement"
				| "feature";
		}
		if (typeof rawUpdates.assigneeId === "string") {
			patch.assigneeId = rawUpdates.assigneeId as Id<"users">;
		}
		if (typeof rawUpdates.projectId === "string") {
			patch.projectId = rawUpdates.projectId as Id<"projects">;
		}
		if (Array.isArray(rawUpdates.labelIds)) {
			patch.labelIds = rawUpdates.labelIds as Array<Id<"labels">>;
		}
		if (typeof rawUpdates.startDate === "number") {
			patch.startDate = rawUpdates.startDate;
		}
		if (typeof rawUpdates.dueDate === "number") {
			patch.dueDate = rawUpdates.dueDate;
		}
		if (typeof rawUpdates.estimate === "number") {
			patch.estimate = rawUpdates.estimate;
		}

		await ctx.db.patch(issueId, patch);
		const updatedFields = Object.keys(rawUpdates);
		resultMessage = `Updated issue: ${updatedFields.join(", ")}`;
	} else if (payload.type === "batchUpdateStatus") {
		const issueIds = (payload.issueIds ?? []) as Id<"issues">[];
		const status = payload.status as
			| "triage"
			| "backlog"
			| "todo"
			| "in_progress"
			| "in_review"
			| "done"
			| "cancelled";
		for (const issueId of issueIds) {
			const issue = await ctx.db.get(issueId);
			if (!issue) continue;
			await assertWorkspaceMember(ctx, issue.workspaceId, actorUserId);
			await ctx.db.patch(issueId, {
				status,
				updatedAt: Date.now(),
				...normalizeStatusPatch(status),
			});
		}
		const statusLabel = status.replace(/_/g, " ");
		resultMessage = `Updated ${issueIds.length} issues to status "${statusLabel}"`;
	} else if (payload.type === "batchAssign") {
		const issueIds = (payload.issueIds ?? []) as Id<"issues">[];
		const assigneeId = payload.assigneeId
			? (payload.assigneeId as Id<"users">)
			: undefined;
		for (const issueId of issueIds) {
			const issue = await ctx.db.get(issueId);
			if (!issue) continue;
			await assertWorkspaceMember(ctx, issue.workspaceId, actorUserId);
			await ctx.db.patch(issueId, {
				assigneeId,
				updatedAt: Date.now(),
			});
		}
		resultMessage = assigneeId
			? `Assigned ${issueIds.length} issues`
			: `Unassigned ${issueIds.length} issues`;
	} else if (payload.type === "createProject") {
		const workspaceId = payload.workspaceId as Id<"workspaces">;
		if (!workspaceId) {
			throw new ConvexError("createProject payload missing workspaceId");
		}
		await assertWorkspaceMember(ctx, workspaceId, actorUserId);

		const args = payload.args as {
			name: string;
			description?: string;
			status?: string;
			priority?: string;
			leadId?: string;
			startDate?: number;
			endDate?: number;
		};
		if (!args?.name?.trim()) {
			throw new ConvexError("createProject payload missing name");
		}

		const baseSlug = toSlug(args.name);
		let slug = baseSlug;
		let suffix = 1;
		while (
			await ctx.db
				.query("projects")
				.withIndex("by_workspace_slug", (q) =>
					q.eq("workspaceId", workspaceId).eq("slug", slug),
				)
				.unique()
		) {
			suffix += 1;
			slug = `${baseSlug}-${suffix}`;
		}

		const lastProject = await ctx.db
			.query("projects")
			.withIndex("by_workspace_sort", (q) => q.eq("workspaceId", workspaceId))
			.order("desc")
			.first();
		const sortOrder = (lastProject?.sortOrder ?? 0) + 1024;

		await ctx.db.insert("projects", {
			workspaceId,
			name: args.name.trim(),
			slug,
			description: args.description,
			status: args.status ?? "planned",
			priority: args.priority,
			leadId: args.leadId as Id<"users"> | undefined,
			startDate: args.startDate,
			endDate: args.endDate,
			sortOrder,
			createdBy: actorUserId,
			updatedAt: Date.now(),
		});
		resultMessage = `Created project: "${args.name}"`;
	}

	return resultMessage;
}

// ── Create Approval (called from tool handler via ctx.runMutation) ────────

export const createApproval = internalMutation({
	args: {
		threadId: v.string(),
		toolCallId: v.string(),
		toolName: v.string(),
		description: v.string(),
		actionPayload: v.string(),
	},
	returns: v.id("aiToolApprovals"),
	handler: async (ctx, args) => {
		return await ctx.db.insert("aiToolApprovals", {
			threadId: args.threadId,
			toolCallId: args.toolCallId,
			toolName: args.toolName,
			description: args.description,
			actionPayload: args.actionPayload,
			status: "pending",
			createdAt: Date.now(),
		});
	},
});

// ── List Approvals for a Thread (real-time query) ─────────────────────────

export const listApprovals = query({
	args: { threadId: v.string() },
	returns: v.array(
		v.object({
			_id: v.id("aiToolApprovals"),
			_creationTime: v.number(),
			threadId: v.string(),
			toolCallId: v.string(),
			toolName: v.string(),
			description: v.string(),
			actionPayload: v.string(),
			status: v.union(
				v.literal("pending"),
				v.literal("approved"),
				v.literal("rejected"),
			),
			resultMessage: v.optional(v.string()),
			createdAt: v.number(),
			resolvedAt: v.optional(v.number()),
		}),
	),
	handler: async (ctx, { threadId }) => {
		await requireThreadOwnership(ctx, threadId);
		return await ctx.db
			.query("aiToolApprovals")
			.withIndex("by_thread", (q) => q.eq("threadId", threadId))
			.collect();
	},
});

export const listPendingApprovalsForThread = internalQuery({
	args: { threadId: v.string() },
	returns: v.array(
		v.object({
			_id: v.id("aiToolApprovals"),
			toolCallId: v.string(),
			toolName: v.string(),
			description: v.string(),
			status: v.literal("pending"),
			createdAt: v.number(),
		}),
	),
	handler: async (ctx, { threadId }) => {
		const approvals = await ctx.db
			.query("aiToolApprovals")
			.withIndex("by_thread", (q) => q.eq("threadId", threadId))
			.collect();
		return approvals
			.filter((approval) => approval.status === "pending")
			.sort((a, b) => b.createdAt - a.createdAt)
			.map((approval) => ({
				_id: approval._id,
				toolCallId: approval.toolCallId,
				toolName: approval.toolName,
				description: approval.description,
				status: "pending" as const,
				createdAt: approval.createdAt,
			}));
	},
});

// ── Approve Action (executes the deferred mutation) ───────────────────────

export const approveAction = mutation({
	args: { approvalId: v.id("aiToolApprovals") },
	returns: v.null(),
	handler: async (ctx, { approvalId }) => {
		const approval = await ctx.db.get(approvalId);
		if (!approval) throw new ConvexError("Approval not found");
		if (approval.status !== "pending") {
			throw new ConvexError(`Approval already ${approval.status}`);
		}

		// Verify thread ownership (not just workspace membership)
		const { userId } = await requireThreadOwnership(ctx, approval.threadId);

		const payload = JSON.parse(
			approval.actionPayload,
		) as DeferredApprovalPayload;

		let resultMessage: string;
		try {
			resultMessage = await executeDeferredApprovalMutation(
				ctx,
				payload,
				userId,
			);
		} catch (error) {
			const errMsg =
				error instanceof ConvexError
					? String(error.data)
					: error instanceof Error
						? error.message
						: "Unknown error during approval execution";
			// Mark approval as failed so the user sees what went wrong
			await ctx.db.patch(approvalId, {
				status: "rejected",
				resultMessage: `Execution failed: ${errMsg}`,
				resolvedAt: Date.now(),
			});
			throw new ConvexError(`Approval execution failed: ${errMsg}`);
		}

		await ctx.db.patch(approvalId, {
			status: "approved",
			resultMessage,
			resolvedAt: Date.now(),
		});

		return null;
	},
});

export const approveActionForGoogleChat = internalMutation({
	args: {
		approvalId: v.id("aiToolApprovals"),
		actorUserId: v.id("users"),
		expectedToolCallId: v.string(),
	},
	returns: v.object({
		status: v.union(v.literal("approved"), v.literal("duplicate")),
		message: v.string(),
		toolName: v.string(),
		description: v.string(),
	}),
	handler: async (ctx, args) => {
		const approval = await ctx.db.get(args.approvalId);
		if (!approval) {
			throw new ConvexError("Approval not found");
		}
		if (approval.toolCallId !== args.expectedToolCallId) {
			throw new ConvexError("Approval payload mismatch");
		}

		await assertThreadOwnedByActor(ctx, approval.threadId, args.actorUserId);

		if (approval.status !== "pending") {
			return {
				status: "duplicate" as const,
				message:
					approval.resultMessage ??
					`Approval already ${approval.status}. No changes applied.`,
				toolName: approval.toolName,
				description: approval.description,
			};
		}

		const payload = JSON.parse(
			approval.actionPayload,
		) as DeferredApprovalPayload;
		const resultMessage = await executeDeferredApprovalMutationForGoogleChat(
			ctx,
			payload,
			args.actorUserId,
		);
		await ctx.db.patch(args.approvalId, {
			status: "approved",
			resultMessage,
			resolvedAt: Date.now(),
		});

		return {
			status: "approved" as const,
			message: resultMessage,
			toolName: approval.toolName,
			description: approval.description,
		};
	},
});

// ── Reject Action ─────────────────────────────────────────────────────────

export const rejectAction = mutation({
	args: {
		approvalId: v.id("aiToolApprovals"),
		reason: v.optional(v.string()),
	},
	returns: v.null(),
	handler: async (ctx, { approvalId, reason }) => {
		const approval = await ctx.db.get(approvalId);
		if (!approval) throw new Error("Approval not found");
		if (approval.status !== "pending") {
			throw new Error(`Approval already ${approval.status}`);
		}

		// Verify thread ownership (not just workspace membership)
		const { metadata: threadMeta } = await requireThreadOwnership(
			ctx,
			approval.threadId,
		);

		// Mark approval as rejected
		await ctx.db.patch(approvalId, {
			status: "rejected",
			resultMessage: reason ?? "User rejected this action",
			resolvedAt: Date.now(),
		});

		// Save a system message to the thread so the agent knows about the rejection.
		try {
			await saveMessages(ctx, components.agent, {
				threadId: approval.threadId,
				userId: threadMeta.userId,
				agentName: "System",
				messages: [
					{
						role: "user",
						content: `[System] The user rejected the proposed action: "${approval.description}". ${reason ? `Reason: ${reason}` : "No reason given."}`,
					},
				],
			});
		} catch (error) {
			console.warn(
				"[ai/approval] Failed to persist rejection system message",
				error instanceof Error ? error.message : error,
			);
		}

		return null;
	},
});

export const rejectActionForGoogleChat = internalMutation({
	args: {
		approvalId: v.id("aiToolApprovals"),
		actorUserId: v.id("users"),
		expectedToolCallId: v.string(),
		reason: v.optional(v.string()),
	},
	returns: v.object({
		status: v.union(v.literal("rejected"), v.literal("duplicate")),
		message: v.string(),
		toolName: v.string(),
		description: v.string(),
	}),
	handler: async (ctx, args) => {
		const approval = await ctx.db.get(args.approvalId);
		if (!approval) {
			throw new ConvexError("Approval not found");
		}
		if (approval.toolCallId !== args.expectedToolCallId) {
			throw new ConvexError("Approval payload mismatch");
		}

		const threadOwnerId = await assertThreadOwnedByActor(
			ctx,
			approval.threadId,
			args.actorUserId,
		);

		if (approval.status !== "pending") {
			return {
				status: "duplicate" as const,
				message:
					approval.resultMessage ??
					`Approval already ${approval.status}. No changes applied.`,
				toolName: approval.toolName,
				description: approval.description,
			};
		}

		const resultMessage = args.reason ?? "User rejected this action";
		await ctx.db.patch(args.approvalId, {
			status: "rejected",
			resultMessage,
			resolvedAt: Date.now(),
		});

		try {
			await saveMessages(ctx, components.agent, {
				threadId: approval.threadId,
				userId: threadOwnerId,
				agentName: "System",
				messages: [
					{
						role: "user",
						content: `[System] The user rejected the proposed action: "${approval.description}". ${args.reason ? `Reason: ${args.reason}` : "No reason given."}`,
					},
				],
			});
		} catch (error) {
			console.warn(
				"[ai/approval] Failed to persist Google Chat rejection system message",
				error instanceof Error ? error.message : error,
			);
		}

		return {
			status: "rejected" as const,
			message: resultMessage,
			toolName: approval.toolName,
			description: approval.description,
		};
	},
});
