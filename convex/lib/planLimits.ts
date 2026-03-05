import { ConvexError } from "convex/values";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

type LimitKey = "maxMembers";

/** Default free plan limits used when no plan record exists */
const FREE_PLAN_DEFAULTS = {
	maxMembers: 5,
} as const;

/**
 * Get current usage counts for a workspace.
 * Returns { members } count.
 */
export async function getCurrentUsage(
	ctx: QueryCtx | MutationCtx,
	workspaceId: Id<"workspaces">,
): Promise<{ members: number }> {
	const members = await ctx.db
		.query("workspaceMembers")
		.withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
		.collect();

	return {
		members: members.length,
	};
}

/**
 * Check if the workspace is at or over its plan limit for the given key.
 * Throws ConvexError({ kind: "plan_limit", ... }) if the limit is reached.
 *
 * Priority: workspace.planLimits override > plans table > free plan defaults.
 */
export async function checkPlanLimit(
	ctx: QueryCtx | MutationCtx,
	workspaceId: Id<"workspaces">,
	limit: LimitKey,
): Promise<void> {
	const workspace = await ctx.db.get(workspaceId);
	if (!workspace) {
		throw new ConvexError("Workspace not found");
	}

	const planKey = workspace.plan ?? "free";

	// Determine the max limit value
	let max: number | undefined;

	// 1. Check per-workspace override first
	if (workspace.planLimits) {
		const override = workspace.planLimits[limit];
		if (override !== undefined) {
			max = override;
		}
	}

	// 2. Fall back to plans table
	if (max === undefined) {
		const planRecord = await ctx.db
			.query("plans")
			.withIndex("by_key", (q) => q.eq("key", planKey))
			.unique();

		if (planRecord) {
			max = planRecord.limits[limit];
		}
	}

	// 3. Fall back to hardcoded free defaults
	if (max === undefined) {
		max = FREE_PLAN_DEFAULTS[limit];
		console.warn(
			`[PlanLimits] No plan record found for "${planKey}", using free defaults`,
		);
	}

	// Get current usage
	const usage = await getCurrentUsage(ctx, workspaceId);
	const current = usage.members;

	if (current >= max) {
		throw new ConvexError({
			kind: "plan_limit" as const,
			limit,
			current,
			max,
			plan: planKey,
		});
	}
}
