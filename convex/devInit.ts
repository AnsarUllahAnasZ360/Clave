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

/** Ensure the authenticated dev user is a member of an org + workspace.
 *  Handles multiple scenarios:
 *  - Seed ran before org model existed (workspace has no organizationId)
 *  - Auth user ID differs from seed user ID
 *  - User has org but workspace isn't linked to it
 *  Creates missing org/membership records and links orphan workspaces. */
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
			"kul@goclave.app",
			"alex@goclave.app",
			"cool@gocliff.app",
			"pull@gocliff.app",
		];
		const isAdmin = adminEmails.includes(user.email);
		const isOwner = user.email === "kul@goclave.app";
		const superAdminEmails = [
			"kul@goclave.app",
			"cool@gocliff.app",
			"pull@gocliff.app",
		];
		const shouldBeSuperAdmin = superAdminEmails.includes(user.email);

		// Keep existing dev superadmin behavior and add cool@gocliff.app.
		if (shouldBeSuperAdmin && user.role !== "superadmin") {
			await ctx.db.patch(userId, { role: "superadmin" });
		}

		// ── 1. Find or create an organization ───────────────────────────
		// Check user's existing org memberships first
		const existingMemberships = await ctx.db
			.query("organizationMembers")
			.withIndex("by_user", (q) => q.eq("userId", userId))
			.collect();

		let organizationId = existingMemberships[0]?.organizationId ?? null;
		const existingOrgMembership = existingMemberships[0] ?? null;

		// If no membership, look for the seed org "clave" or any existing org
		if (!organizationId) {
			const seedOrg = await ctx.db
				.query("organizations")
				.withIndex("by_slug", (q) => q.eq("slug", "clave"))
				.unique();

			if (seedOrg) {
				organizationId = seedOrg._id;
			} else {
				// Look for any org the user owns
				const ownedOrg = await ctx.db
					.query("organizations")
					.withIndex("by_owner", (q) => q.eq("ownerId", userId))
					.first();

				if (ownedOrg) {
					organizationId = ownedOrg._id;
				} else {
					// Create a default org
					organizationId = await ctx.db.insert("organizations", {
						name: "Clave",
						slug: "clave",
						ownerId: userId,
						plan: "free",
						createdAt: now,
						updatedAt: now,
					});
				}
			}

			// Add user as member of the org
			await ctx.db.insert("organizationMembers", {
				organizationId,
				userId,
				role: isOwner ? "owner" : isAdmin ? "admin" : "member",
				joinedAt: now,
			});
		}

		if (organizationId && existingOrgMembership) {
			const desiredRole = isOwner ? "owner" : isAdmin ? "admin" : "member";
			if (existingOrgMembership.role !== desiredRole) {
				await ctx.db.patch(existingOrgMembership._id, { role: desiredRole });
			}
		}

		// Update org owner if this is Kul
		if (isOwner) {
			const org = await ctx.db.get(organizationId);
			if (org && org.ownerId !== userId) {
				await ctx.db.patch(organizationId, { ownerId: userId });
			}
		}

		// ── 2. Fix orphan workspaces (no organizationId) ────────────────
		const wsMemberships = await ctx.db
			.query("workspaceMembers")
			.withIndex("by_user", (q) => q.eq("userId", userId))
			.collect();

		for (const wm of wsMemberships) {
			const ws = await ctx.db.get(wm.workspaceId);
			if (ws && !ws.organizationId) {
				await ctx.db.patch(ws._id, { organizationId });
			}
		}

		// Also fix workspaces owned by this user that are missing organizationId
		const allWorkspaces = await ctx.db
			.query("workspaces")
			.filter((q) => q.eq(q.field("ownerId"), userId))
			.collect();

		for (const ws of allWorkspaces) {
			if (!ws.organizationId && !ws.deletedAt) {
				await ctx.db.patch(ws._id, { organizationId });
				// Also ensure workspace membership exists
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

		// Also fix the well-known seed workspace even if user isn't a member yet
		const seedWorkspace = await ctx.db
			.query("workspaces")
			.withIndex("by_slug", (q) => q.eq("slug", "clave-hq"))
			.unique();

		if (seedWorkspace) {
			if (!seedWorkspace.organizationId) {
				await ctx.db.patch(seedWorkspace._id, { organizationId });
			}

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

		return null;
	},
});
