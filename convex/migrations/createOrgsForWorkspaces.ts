import { v } from "convex/values";
import { internalMutation } from "../_generated/server";

const BATCH_SIZE = 100;

/**
 * Migration: Create a default organization for each workspace that doesn't have one.
 *
 * For each workspace without organizationId:
 * 1. Create an org with workspace's name/slug/ownerId
 * 2. Copy workspaceMembers to organizationMembers (role mapping)
 * 3. Patch workspace with organizationId
 *
 * Idempotent — safe to run multiple times.
 * Call from Convex dashboard or schedule via ctx.scheduler.
 * Returns { migrated, remaining } so caller knows if another batch is needed.
 */
export const run = internalMutation({
	args: {},
	returns: v.object({
		migrated: v.number(),
		remaining: v.boolean(),
	}),
	handler: async (ctx) => {
		// Get workspaces without organizationId (take batch + 1 to detect remaining)
		const allWorkspaces = await ctx.db.query("workspaces").collect();

		const unlinked = allWorkspaces.filter(
			(ws) => !ws.organizationId && !ws.deletedAt,
		);

		const batch = unlinked.slice(0, BATCH_SIZE);
		const remaining = unlinked.length > BATCH_SIZE;

		let migrated = 0;

		for (const workspace of batch) {
			// 1. Determine a unique org slug
			let orgSlug = workspace.slug;
			const existingOrg = await ctx.db
				.query("organizations")
				.withIndex("by_slug", (q) => q.eq("slug", orgSlug))
				.unique();
			if (existingOrg) {
				orgSlug = `${workspace.slug}-org`;
				// If even the suffixed slug exists, append a numeric suffix
				const existingSuffixed = await ctx.db
					.query("organizations")
					.withIndex("by_slug", (q) => q.eq("slug", orgSlug))
					.unique();
				if (existingSuffixed) {
					orgSlug = `${workspace.slug}-org-${Date.now()}`;
				}
			}

			const now = Date.now();

			// 2. Create the organization
			const organizationId = await ctx.db.insert("organizations", {
				name: workspace.name,
				slug: orgSlug,
				ownerId: workspace.ownerId,
				plan: "free",
				createdAt: now,
				updatedAt: now,
			});

			// 3. Copy workspaceMembers to organizationMembers
			const wsMembers = await ctx.db
				.query("workspaceMembers")
				.withIndex("by_workspace", (q) => q.eq("workspaceId", workspace._id))
				.collect();

			// Track which users we've added to avoid duplicates
			const addedUsers = new Set<string>();

			// Add workspace owner as org "owner" first
			addedUsers.add(workspace.ownerId);
			await ctx.db.insert("organizationMembers", {
				organizationId,
				userId: workspace.ownerId,
				role: "owner",
				joinedAt: now,
			});

			// Add remaining workspace members
			for (const wsMember of wsMembers) {
				if (addedUsers.has(wsMember.userId)) continue;
				addedUsers.add(wsMember.userId);

				// Map roles: workspace "admin" → org "admin", workspace "member" → org "member"
				const orgRole = wsMember.role === "admin" ? "admin" : "member";

				await ctx.db.insert("organizationMembers", {
					organizationId,
					userId: wsMember.userId,
					role: orgRole as "owner" | "admin" | "member",
					joinedAt: now,
				});
			}

			// 4. Patch workspace with organizationId
			await ctx.db.patch(workspace._id, { organizationId });

			migrated++;
		}

		return { migrated, remaining };
	},
});
