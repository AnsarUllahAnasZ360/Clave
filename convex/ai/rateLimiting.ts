/**
 * Rate limiting for sub-agent invocations and workflow execution.
 *
 * Uses simple counter-based rate limiting with Convex indexed queries.
 * Not perfectly precise under high concurrency (two requests might both
 * pass simultaneously), but acceptable for a productivity app.
 *
 * @see STORY-023 for design context
 */

import { v } from "convex/values";
import { internalQuery } from "../_generated/server";

/** Max concurrent running/paused workflows per workspace */
export const MAX_CONCURRENT_WORKFLOWS_PER_WORKSPACE = 10;

/** Max sub-agent invocations per user per hour */
export const MAX_INVOCATIONS_PER_USER_PER_HOUR = 50;

/**
 * Count active (running or paused) workflows for a workspace.
 * Uses the by_workspace index for efficient lookup.
 */
export const countActiveWorkflows = internalQuery({
	args: {
		workspaceId: v.id("workspaces"),
	},
	returns: v.number(),
	handler: async (ctx, args): Promise<number> => {
		const runs = await ctx.db
			.query("workflowRuns")
			.withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
			.collect();

		return runs.filter((r) => r.status === "running" || r.status === "paused")
			.length;
	},
});

/**
 * Count recent sub-agent invocations for a user (within the last hour).
 * Uses the aiAuditLog by_user index for accurate per-user tracking.
 * Counts entries with action "sub_agent_invoke" in the last 60 minutes.
 */
export const countRecentUserInvocations = internalQuery({
	args: {
		userId: v.id("users"),
	},
	returns: v.number(),
	handler: async (ctx, args): Promise<number> => {
		const oneHourAgo = Date.now() - 60 * 60 * 1000;
		const entries = await ctx.db
			.query("aiAuditLog")
			.withIndex("by_user", (q) =>
				q.eq("userId", args.userId).gte("timestamp", oneHourAgo),
			)
			.collect();

		return entries.filter((e) => e.action === "sub_agent_invoke").length;
	},
});
