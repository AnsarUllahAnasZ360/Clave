/**
 * Demo Workspace Queries and Mutations
 *
 * Public-facing queries/mutations for the demo workspace feature.
 */

import { v } from "convex/values";
import { mutation, query } from "../_generated/server";
import { requireAuth } from "../lib/auth";

/** Get the demo workspace for the current user's organization */
export const getDemoWorkspace = query({
	args: { organizationId: v.id("organizations") },
	returns: v.union(
		v.object({
			_id: v.id("workspaces"),
			name: v.string(),
			slug: v.string(),
			demoSeedStatus: v.optional(
				v.union(
					v.literal("pending"),
					v.literal("seeding"),
					v.literal("complete"),
					v.literal("failed"),
				),
			),
			demoExpiresAt: v.optional(v.number()),
		}),
		v.null(),
	),
	handler: async (ctx, { organizationId }) => {
		await requireAuth(ctx);

		const demoWorkspace = await ctx.db
			.query("workspaces")
			.withIndex("by_organization", (q) =>
				q.eq("organizationId", organizationId),
			)
			.filter((q) => q.eq(q.field("isDemo"), true))
			.first();

		if (!demoWorkspace || demoWorkspace.deletedAt) return null;

		return {
			_id: demoWorkspace._id,
			name: demoWorkspace.name,
			slug: demoWorkspace.slug,
			demoSeedStatus: demoWorkspace.demoSeedStatus,
			demoExpiresAt: demoWorkspace.demoExpiresAt,
		};
	},
});

/** Check if the user has dismissed the demo onboarding popup */
export const hasDismissedDemoOnboarding = query({
	args: {},
	returns: v.boolean(),
	handler: async (ctx) => {
		const userId = await requireAuth(ctx);
		const user = await ctx.db.get(userId);
		return user?.demoOnboardingDismissed === true;
	},
});

/** Dismiss the demo onboarding popup */
export const dismissDemoOnboarding = mutation({
	args: {},
	returns: v.null(),
	handler: async (ctx) => {
		const userId = await requireAuth(ctx);
		await ctx.db.patch(userId, { demoOnboardingDismissed: true });
		return null;
	},
});

/** Seed demo workspace for an existing organization (dev/admin only) */
export const seedForExistingOrg = mutation({
	args: { organizationId: v.id("organizations") },
	returns: v.string(),
	handler: async (ctx, { organizationId }) => {
		const userId = await requireAuth(ctx);

		// Check org exists
		const org = await ctx.db.get(organizationId);
		if (!org) return "Organization not found";

		// Check if demo already exists
		const existing = await ctx.db
			.query("workspaces")
			.withIndex("by_organization", (q) =>
				q.eq("organizationId", organizationId),
			)
			.filter((q) => q.eq(q.field("isDemo"), true))
			.first();
		if (existing)
			return `Demo workspace already exists: ${existing.slug} (status: ${existing.demoSeedStatus ?? "unknown"})`;

		// Schedule the seed
		const { internal } = await import("../_generated/api");
		await ctx.scheduler.runAfter(0, internal.demo.seed.initDemoWorkspace, {
			organizationId,
			creatorUserId: userId,
		});

		return "Demo workspace seeding started. Refresh in a few seconds.";
	},
});
