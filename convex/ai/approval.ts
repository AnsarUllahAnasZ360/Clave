import { saveMessages } from "@convex-dev/agent";
import { v } from "convex/values";
import { api, components } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { internalMutation, mutation, query } from "../_generated/server";
import { requireThreadOwnership } from "./chatQueries";

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

// ── Approve Action (executes the deferred mutation) ───────────────────────

export const approveAction = mutation({
	args: { approvalId: v.id("aiToolApprovals") },
	returns: v.null(),
	handler: async (ctx, { approvalId }) => {
		const approval = await ctx.db.get(approvalId);
		if (!approval) throw new Error("Approval not found");
		if (approval.status !== "pending") {
			throw new Error(`Approval already ${approval.status}`);
		}

		// Verify thread ownership (not just workspace membership)
		await requireThreadOwnership(ctx, approval.threadId);

		// Parse and execute the deferred action
		const payload = JSON.parse(approval.actionPayload) as {
			type: string;
			issueId?: string;
			issueIds?: string[];
			workspaceId?: string;
			args?: Record<string, unknown>;
			updates?: Record<string, unknown>;
			status?: string;
			assigneeId?: string;
		};

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
			};
			const result = await ctx.runMutation(api.issues.create, {
				workspaceId: payload.workspaceId as Id<"workspaces">,
				title: args.title,
				description: args.description,
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
			};
			await ctx.runMutation(api.projects.create, {
				workspaceId: payload.workspaceId as Id<"workspaces">,
				name: args.name,
				description: args.description,
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

		// Mark approval as approved
		await ctx.db.patch(approvalId, {
			status: "approved",
			resultMessage,
			resolvedAt: Date.now(),
		});

		return null;
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

		return null;
	},
});
