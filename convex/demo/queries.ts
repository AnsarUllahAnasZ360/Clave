/**
 * Demo Workspace Queries and Mutations
 *
 * Public-facing queries/mutations for the demo workspace feature.
 */

import { v } from "convex/values";
import { mutation, query } from "../_generated/server";
import { requireAuth } from "../lib/auth";

/** Get demo workspace info by workspace ID */
export const getDemoWorkspace = query({
	args: { workspaceId: v.id("workspaces") },
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
	handler: async (ctx, { workspaceId }) => {
		await requireAuth(ctx);

		const workspace = await ctx.db.get(workspaceId);
		if (!workspace || workspace.deletedAt || !workspace.isDemo) return null;

		return {
			_id: workspace._id,
			name: workspace.name,
			slug: workspace.slug,
			demoSeedStatus: workspace.demoSeedStatus,
			demoExpiresAt: workspace.demoExpiresAt,
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

/** Auto-create a demo workspace for a new user (called from onboarding) */
export const createDemoWorkspaceForUser = mutation({
	args: {},
	returns: v.object({ slug: v.string(), workspaceId: v.id("workspaces") }),
	handler: async (ctx) => {
		const userId = await requireAuth(ctx);

		// Check if the user already has any workspaces
		const existingMemberships = await ctx.db
			.query("workspaceMembers")
			.withIndex("by_user", (q) => q.eq("userId", userId))
			.first();
		if (existingMemberships) {
			// User already has a workspace — find it and return its slug
			const ws = await ctx.db.get(existingMemberships.workspaceId);
			if (ws && !ws.deletedAt) {
				return { slug: ws.slug, workspaceId: ws._id };
			}
		}

		// Generate a unique slug for the demo workspace
		const user = await ctx.db.get(userId);
		const baseName = user?.name ?? "Demo";
		const baseSlug = baseName
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, "-")
			.replace(/^-|-$/g, "");
		const slug = `${baseSlug}-demo-${Date.now().toString(36)}`;

		const now = Date.now();

		// Create the workspace
		const workspaceId = await ctx.db.insert("workspaces", {
			name: `${baseName}'s Demo`,
			slug,
			ownerId: userId,
			visibility: "public",
			plan: "free",
			createdAt: now,
			updatedAt: now,
		});

		// Add user as admin
		await ctx.db.insert("workspaceMembers", {
			workspaceId,
			userId,
			role: "admin",
			joinedAt: now,
		});

		// Create default workspace settings
		await ctx.db.insert("workspaceSettings", {
			workspaceId,
			storyPrefix: "CLV",
			nextStoryNumber: 1,
			taskPrefix: "TSK",
			nextTaskNumber: 1,
		});

		// Provision built-in Excalidraw MCP connector
		const { internal } = await import("../_generated/api");
		await ctx.runMutation(
			internal.mcpServers.ensureSystemExcalidrawServerInternal,
			{ workspaceId, createdBy: userId },
		);

		// Schedule demo data seeding
		await ctx.scheduler.runAfter(0, internal.demo.seed.seedDemoData, {
			workspaceId,
			creatorUserId: userId,
		});

		return { slug, workspaceId };
	},
});

/** Seed demo data into an existing workspace (dev/admin only) */
export const seedForWorkspace = mutation({
	args: { workspaceId: v.id("workspaces") },
	returns: v.string(),
	handler: async (ctx, { workspaceId }) => {
		const userId = await requireAuth(ctx);

		// Check workspace exists
		const workspace = await ctx.db.get(workspaceId);
		if (!workspace) return "Workspace not found";

		// Check if demo already seeded
		if (workspace.isDemo && workspace.demoSeedStatus) {
			return `Demo data already exists for workspace: ${workspace.slug} (status: ${workspace.demoSeedStatus})`;
		}

		// Schedule the seed
		const { internal } = await import("../_generated/api");
		await ctx.scheduler.runAfter(0, internal.demo.seed.seedDemoData, {
			workspaceId,
			creatorUserId: userId,
		});

		return "Demo workspace seeding started. Refresh in a few seconds.";
	},
});

/**
 * @deprecated Use seedForWorkspace instead. Kept temporarily for backward compatibility.
 */
export const seedForExistingOrg = seedForWorkspace;
