// Dev-only actions for seeding and clearing sample data.
// These are public actions that wrap internal mutations from devSeed.ts.
// Only use in development — do not deploy to production.

import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { action, mutation } from "./_generated/server";

export const seedDatabase = action({
	args: {},
	handler: async (ctx) => {
		await ctx.runMutation(internal.devSeed.seed);
		return { success: true, message: "Sample data seeded successfully." };
	},
});

export const clearDatabase = action({
	args: {},
	handler: async (ctx) => {
		await ctx.runMutation(internal.devSeed.clearSeed);
		return { success: true, message: "Sample data cleared successfully." };
	},
});

/** Ensure the authenticated dev user is a member of the seeded workspace.
 *  Called after dev login to handle the case where auth creates a new user ID
 *  that doesn't match the seeded workspace members. */
export const ensureDevWorkspaceMember = mutation({
	args: {},
	returns: v.null(),
	handler: async (ctx) => {
		const userId = await getAuthUserId(ctx);
		if (!userId) return null;

		const user = await ctx.db.get(userId);
		if (!user?.email) return null;

		// Find the dev workspace
		const workspace = await ctx.db
			.query("workspaces")
			.withIndex("by_slug", (q) => q.eq("slug", "clave-hq"))
			.unique();
		if (!workspace) return null;

		// Check if already a member
		const existing = await ctx.db
			.query("workspaceMembers")
			.withIndex("by_workspace_user", (q) =>
				q.eq("workspaceId", workspace._id).eq("userId", userId),
			)
			.unique();
		if (existing) return null;

		// Determine role based on email
		const adminEmails = ["kul@goclave.app", "alex@goclave.app"];
		const role = adminEmails.includes(user.email) ? "admin" : "member";

		await ctx.db.insert("workspaceMembers", {
			workspaceId: workspace._id,
			userId,
			role,
			joinedAt: Date.now(),
		});

		// If this is Kul, also update workspace owner to the auth user
		if (user.email === "kul@goclave.app") {
			await ctx.db.patch(workspace._id, { ownerId: userId });
		}

		return null;
	},
});
