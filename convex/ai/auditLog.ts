/**
 * Centralized audit logging for AI sub-agent and workflow operations.
 *
 * All entries are created via `logAction` (internal mutation) — never
 * directly by clients. This prevents clients from spoofing audit entries.
 *
 * @see STORY-024 for design context
 */

import { ConvexError, v } from "convex/values";
import { internalMutation, query } from "../_generated/server";
import { requireWorkspaceMember } from "../lib/auth";

// ── Constants ──────────────────────────────────────────────────────────────

/** Maximum length for the details field to avoid storing full prompts */
const MAX_DETAILS_LENGTH = 200;

// ── Internal Mutation ──────────────────────────────────────────────────────

/**
 * Write an audit log entry. Internal-only — called from other mutations/actions.
 * Truncates details to MAX_DETAILS_LENGTH characters.
 */
export const logAction = internalMutation({
	args: {
		workspaceId: v.id("workspaces"),
		userId: v.id("users"),
		subAgentId: v.optional(v.id("subAgents")),
		action: v.string(),
		details: v.optional(v.string()),
		threadId: v.optional(v.string()),
		workflowId: v.optional(v.string()),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const details = args.details
			? args.details.slice(0, MAX_DETAILS_LENGTH)
			: undefined;

		await ctx.db.insert("aiAuditLog", {
			workspaceId: args.workspaceId,
			userId: args.userId,
			subAgentId: args.subAgentId,
			action: args.action,
			details,
			threadId: args.threadId,
			workflowId: args.workflowId,
			timestamp: Date.now(),
		});

		return null;
	},
});

// ── Queries ────────────────────────────────────────────────────────────────

/**
 * Get audit log entries for a workspace. Admin-only.
 * Returns recent entries ordered by timestamp descending.
 */
export const getAuditLog = query({
	args: {
		workspaceId: v.id("workspaces"),
		limit: v.optional(v.number()),
	},
	returns: v.array(
		v.object({
			_id: v.id("aiAuditLog"),
			_creationTime: v.number(),
			workspaceId: v.id("workspaces"),
			userId: v.id("users"),
			subAgentId: v.optional(v.id("subAgents")),
			action: v.string(),
			details: v.optional(v.string()),
			threadId: v.optional(v.string()),
			workflowId: v.optional(v.string()),
			timestamp: v.number(),
		}),
	),
	handler: async (ctx, args) => {
		const { member } = await requireWorkspaceMember(ctx, args.workspaceId);

		if (member.role !== "admin") {
			throw new ConvexError("Admin access required to view audit log");
		}

		const limit = args.limit ?? 100;
		const entries = await ctx.db
			.query("aiAuditLog")
			.withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
			.order("desc")
			.take(limit);

		return entries;
	},
});

/**
 * Get audit log entries for the current authenticated user.
 * Returns the user's own entries ordered by timestamp descending.
 */
export const getAuditLogForUser = query({
	args: {
		workspaceId: v.id("workspaces"),
		limit: v.optional(v.number()),
	},
	returns: v.array(
		v.object({
			_id: v.id("aiAuditLog"),
			_creationTime: v.number(),
			workspaceId: v.id("workspaces"),
			userId: v.id("users"),
			subAgentId: v.optional(v.id("subAgents")),
			action: v.string(),
			details: v.optional(v.string()),
			threadId: v.optional(v.string()),
			workflowId: v.optional(v.string()),
			timestamp: v.number(),
		}),
	),
	handler: async (ctx, args) => {
		const { userId } = await requireWorkspaceMember(ctx, args.workspaceId);

		const limit = args.limit ?? 50;
		const entries = await ctx.db
			.query("aiAuditLog")
			.withIndex("by_user", (q) => q.eq("userId", userId))
			.order("desc")
			.take(limit);

		// Filter to only entries in the requested workspace
		return entries.filter((e) => e.workspaceId === args.workspaceId);
	},
});
