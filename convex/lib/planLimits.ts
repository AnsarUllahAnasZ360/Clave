import type { Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

type LimitKey = "maxMembers" | "maxWorkspaces";

/** Default free plan limits used when no plan record exists */
const _FREE_PLAN_DEFAULTS = {
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

	// Exclude demo users from the member count
	let realMemberCount = 0;
	for (const member of members) {
		const user = await ctx.db.get(member.userId);
		if (user && !user.isDemoUser) {
			realMemberCount++;
		}
	}

	const workspaces = await ctx.db
		.query("workspaces")
		.withIndex("by_organization", (q) => q.eq("organizationId", organizationId))
		.collect();

	// Only count non-deleted, non-demo workspaces
	const activeWorkspaces = workspaces.filter((w) => !w.deletedAt && !w.isDemo);

	return {
		members: realMemberCount,
		workspaces: activeWorkspaces.length,
	};
}

/**
 * Plan limit check — currently disabled (unlimited).
 *
 * Kept as a no-op so call-sites don't need to change. Re-enable when
 * billing tiers are enforced.
 */
export async function checkPlanLimit(
	_ctx: QueryCtx | MutationCtx,
	_organizationId: Id<"organizations">,
	_limit: LimitKey,
): Promise<void> {
	// No-op: all plans are unlimited for now.
}
