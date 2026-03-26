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
		// These delegate to internalMutation (not callable from outside Convex).
		// No auth check — seeding runs before the user signs in on /dev-login.
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

/** Ensure the authenticated dev user is a member of a workspace.
 *  Handles multiple scenarios:
 *  - Auth user ID differs from seed user ID
 *  - User has no workspace membership
 *  Creates missing membership records and ensures workspace access. */
export const ensureDevWorkspaceMember = mutation({
	args: {},
	returns: v.null(),
	handler: async (ctx) => {
		const userId = await getAuthUserId(ctx);
		if (!userId) return null;

		const user = await ctx.db.get(userId);
		if (!user?.email) return null;

		const now = Date.now();
		const adminEmails = [
			"admin@example.com",
			"dev@example.com",
			"editor@example.com",
			"viewer@example.com",
		];
		const isAdmin = adminEmails.includes(user.email);
		const isOwner = user.email === "admin@example.com";
		const superAdminEmails = [
			"admin@example.com",
			"editor@example.com",
			"viewer@example.com",
		];
		const shouldBeSuperAdmin = superAdminEmails.includes(user.email);

		// Promote configured dev superadmins automatically.
		if (shouldBeSuperAdmin && user.role !== "superadmin") {
			await ctx.db.patch(userId, { role: "superadmin" });
		}

		// ── 1. Ensure workspace membership for owned workspaces ─────────
		const allWorkspaces = await ctx.db
			.query("workspaces")
			.filter((q) => q.eq(q.field("ownerId"), userId))
			.collect();

		for (const ws of allWorkspaces) {
			if (!ws.deletedAt) {
				const existingMember = await ctx.db
					.query("workspaceMembers")
					.withIndex("by_workspace_user", (q) =>
						q.eq("workspaceId", ws._id).eq("userId", userId),
					)
					.unique();
				if (!existingMember) {
					await ctx.db.insert("workspaceMembers", {
						workspaceId: ws._id,
						userId,
						role: "admin",
						joinedAt: now,
					});
				}
			}
		}

		// ── 2. Ensure membership in the well-known seed workspace ───────
		const seedWorkspace = await ctx.db
			.query("workspaces")
			.withIndex("by_slug", (q) => q.eq("slug", "clave-hq"))
			.unique();

		if (seedWorkspace) {
			// Ensure workspace membership
			const existingWsMember = await ctx.db
				.query("workspaceMembers")
				.withIndex("by_workspace_user", (q) =>
					q.eq("workspaceId", seedWorkspace._id).eq("userId", userId),
				)
				.unique();

			if (!existingWsMember) {
				await ctx.db.insert("workspaceMembers", {
					workspaceId: seedWorkspace._id,
					userId,
					role: isAdmin ? "admin" : "member",
					joinedAt: now,
				});
			} else if (isAdmin && existingWsMember.role !== "admin") {
				await ctx.db.patch(existingWsMember._id, { role: "admin" });
			}

			// Update workspace owner if this is Kul
			if (isOwner && seedWorkspace.ownerId !== userId) {
				await ctx.db.patch(seedWorkspace._id, { ownerId: userId });
			}
		}

		// ── 3. Fallback: create a personal workspace if user still has none ─
		const finalWsMemberships = await ctx.db
			.query("workspaceMembers")
			.withIndex("by_user", (q) => q.eq("userId", userId))
			.collect();

		if (finalWsMemberships.length === 0) {
			const workspaceId = await ctx.db.insert("workspaces", {
				name: "My Workspace",
				slug: `dev-${userId.slice(-8)}`,
				ownerId: userId,
				createdAt: now,
				updatedAt: now,
			});
			await ctx.db.insert("workspaceMembers", {
				workspaceId,
				userId,
				role: "admin",
				joinedAt: now,
			});
		}

		return null;
	},
});
