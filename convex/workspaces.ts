import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireAuth, requireWorkspaceAdmin } from "./lib/auth";
import { generateSlug } from "./lib/utils";

/** List all workspaces the authenticated user is a member of */
export const list = query({
	args: {},
	returns: v.array(
		v.object({
			_id: v.id("workspaces"),
			_creationTime: v.number(),
			name: v.string(),
			slug: v.string(),
			ownerId: v.id("users"),
			description: v.optional(v.string()),
			logoStorageId: v.optional(v.id("_storage")),
			updatedAt: v.optional(v.number()),
			deletedAt: v.optional(v.number()),
		}),
	),
	handler: async (ctx) => {
		const userId = await requireAuth(ctx);

		// Get all workspace memberships for this user
		const memberships = await ctx.db
			.query("workspaceMembers")
			.withIndex("by_user", (q) => q.eq("userId", userId))
			.collect();

		// Fetch workspace details for each membership
		const workspaces = [];
		for (const membership of memberships) {
			const workspace = await ctx.db.get(membership.workspaceId);
			if (workspace && !workspace.deletedAt) {
				workspaces.push(workspace);
			}
		}

		return workspaces;
	},
});

/** Create a new workspace, add creator as admin, create default settings */
export const create = mutation({
	args: {
		name: v.string(),
		slug: v.optional(v.string()),
	},
	returns: v.id("workspaces"),
	handler: async (ctx, args) => {
		const userId = await requireAuth(ctx);

		const slug = args.slug || generateSlug(args.name);

		// Check slug uniqueness
		const existing = await ctx.db
			.query("workspaces")
			.withIndex("by_slug", (q) => q.eq("slug", slug))
			.unique();
		if (existing) {
			throw new Error(
				"A workspace with this slug already exists. Please choose a different name.",
			);
		}

		// Create the workspace
		const workspaceId = await ctx.db.insert("workspaces", {
			name: args.name,
			slug,
			ownerId: userId,
		});

		// Add creator as admin member
		await ctx.db.insert("workspaceMembers", {
			workspaceId,
			userId,
			role: "admin",
			joinedAt: Date.now(),
		});

		// Create default workspace settings
		await ctx.db.insert("workspaceSettings", {
			workspaceId,
			storyPrefix: "CLV",
			nextStoryNumber: 1,
			taskPrefix: "TSK",
			nextTaskNumber: 1,
		});

		return workspaceId;
	},
});

/** Update workspace name, slug, description, or logo (admin only) */
export const update = mutation({
	args: {
		workspaceId: v.id("workspaces"),
		name: v.optional(v.string()),
		slug: v.optional(v.string()),
		description: v.optional(v.string()),
		logoStorageId: v.optional(v.id("_storage")),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		await requireWorkspaceAdmin(ctx, args.workspaceId);

		const patch: Record<string, unknown> = { updatedAt: Date.now() };
		if (args.name !== undefined) patch.name = args.name;
		if (args.description !== undefined) patch.description = args.description;
		if (args.logoStorageId !== undefined)
			patch.logoStorageId = args.logoStorageId;

		// Validate and update slug
		if (args.slug !== undefined) {
			const normalized = args.slug
				.toLowerCase()
				.replace(/[^a-z0-9-]/g, "")
				.replace(/-+/g, "-")
				.replace(/^-|-$/g, "");
			if (normalized.length < 2) {
				throw new ConvexError("Slug must be at least 2 characters");
			}
			// Check uniqueness (allow same workspace to keep its slug)
			const existing = await ctx.db
				.query("workspaces")
				.withIndex("by_slug", (q) => q.eq("slug", normalized))
				.unique();
			if (existing && existing._id !== args.workspaceId) {
				throw new ConvexError("A workspace with this slug already exists");
			}
			patch.slug = normalized;
		}

		await ctx.db.patch(args.workspaceId, patch);
		return null;
	},
});

/** Generate a logo upload URL (admin only) */
export const generateLogoUploadUrl = mutation({
	args: { workspaceId: v.id("workspaces") },
	returns: v.string(),
	handler: async (ctx, args) => {
		await requireWorkspaceAdmin(ctx, args.workspaceId);
		return await ctx.storage.generateUploadUrl();
	},
});

/** Get the logo URL for a workspace */
export const getLogoUrl = query({
	args: { workspaceId: v.id("workspaces") },
	returns: v.union(v.string(), v.null()),
	handler: async (ctx, args) => {
		const workspace = await ctx.db.get(args.workspaceId);
		if (!workspace || !workspace.logoStorageId) return null;
		return await ctx.storage.getUrl(workspace.logoStorageId);
	},
});

/** Get a workspace by its slug */
export const getBySlug = query({
	args: { slug: v.string() },
	returns: v.union(
		v.object({
			_id: v.id("workspaces"),
			_creationTime: v.number(),
			name: v.string(),
			slug: v.string(),
			ownerId: v.id("users"),
			description: v.optional(v.string()),
			logoStorageId: v.optional(v.id("_storage")),
			updatedAt: v.optional(v.number()),
			deletedAt: v.optional(v.number()),
		}),
		v.null(),
	),
	handler: async (ctx, args) => {
		const workspace = await ctx.db
			.query("workspaces")
			.withIndex("by_slug", (q) => q.eq("slug", args.slug))
			.unique();

		if (!workspace || workspace.deletedAt) return null;
		return workspace;
	},
});

/** Soft-delete a workspace (owner only) */
export const remove = mutation({
	args: { workspaceId: v.id("workspaces") },
	returns: v.null(),
	handler: async (ctx, args) => {
		const userId = await requireAuth(ctx);
		const workspace = await ctx.db.get(args.workspaceId);
		if (!workspace) throw new Error("Workspace not found");
		if (workspace.ownerId !== userId) {
			throw new Error("Only the workspace owner can delete a workspace");
		}

		await ctx.db.patch(args.workspaceId, { deletedAt: Date.now() });
		return null;
	},
});
