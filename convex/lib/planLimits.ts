import { ConvexError } from "convex/values";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

type LimitKey = "maxMembers" | "maxWorkspaces";

/** Default free plan limits used when no plan record exists */
const FREE_PLAN_DEFAULTS = {
	maxMembers: 5,
	maxWorkspaces: 2,
} as const;

/**
 * Get current usage counts for an organization.
 * Returns { members, workspaces } counts.
 */
export async function getCurrentUsage(
	ctx: QueryCtx | MutationCtx,
	organizationId: Id<"organizations">,
): Promise<{ members: number; workspaces: number }> {
	const members = await ctx.db
		.query("organizationMembers")
		.withIndex("by_org", (q) => q.eq("organizationId", organizationId))
		.collect();

	const workspaces = await ctx.db
		.query("workspaces")
		.withIndex("by_organization", (q) => q.eq("organizationId", organizationId))
		.collect();

	// Only count non-deleted workspaces
	const activeWorkspaces = workspaces.filter((w) => !w.deletedAt);

	return {
		members: members.length,
		workspaces: activeWorkspaces.length,
	};
}

/**
 * Check if the organization is at or over its plan limit for the given key.
 * Throws ConvexError({ kind: "plan_limit", ... }) if the limit is reached.
 *
 * Priority: org.planLimits override > plans table > free plan defaults.
 */
export async function checkPlanLimit(
	ctx: QueryCtx | MutationCtx,
	organizationId: Id<"organizations">,
	limit: LimitKey,
): Promise<void> {
	const org = await ctx.db.get(organizationId);
	if (!org) {
		throw new ConvexError("Organization not found");
	}

	const planKey = org.plan ?? "free";

	// Determine the max limit value
	let max: number | undefined;

	// 1. Check per-org override first
	if (org.planLimits) {
		const override = org.planLimits[limit];
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
	const usage = await getCurrentUsage(ctx, organizationId);
	const current = limit === "maxMembers" ? usage.members : usage.workspaces;

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
