import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
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
			visibility: v.optional(
				v.union(v.literal("public"), v.literal("private")),
			),
			description: v.optional(v.string()),
			logoStorageId: v.optional(v.id("_storage")),
			plan: v.optional(
				v.union(v.literal("free"), v.literal("pro"), v.literal("enterprise")),
			),
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

		// Batch-fetch all workspace details in parallel
		const workspaceResults = await Promise.all(
			memberships.map((m) => ctx.db.get(m.workspaceId)),
		);

		return workspaceResults
			.filter((w): w is NonNullable<typeof w> => w !== null && !w.deletedAt)
			.map((w) => ({
				_id: w._id,
				_creationTime: w._creationTime,
				name: w.name,
				slug: w.slug,
				ownerId: w.ownerId,
				visibility: w.visibility,
				description: w.description,
				logoStorageId: w.logoStorageId,
				plan: w.plan,
				updatedAt: w.updatedAt,
				deletedAt: w.deletedAt,
			}));
	},
});

/** List all workspaces the authenticated user is a member of, with their role */
export const listWithRole = query({
	args: {},
	returns: v.array(
		v.object({
			_id: v.id("workspaces"),
			name: v.string(),
			slug: v.string(),
			role: v.string(),
			logoStorageId: v.optional(v.id("_storage")),
		}),
	),
	handler: async (ctx) => {
		const userId = await requireAuth(ctx);

		const memberships = await ctx.db
			.query("workspaceMembers")
			.withIndex("by_user", (q) => q.eq("userId", userId))
			.collect();

		const results = await Promise.all(
			memberships.map(async (m) => {
				const w = await ctx.db.get(m.workspaceId);
				if (!w || w.deletedAt) return null;
				return {
					_id: w._id,
					name: w.name,
					slug: w.slug,
					role: m.role,
					logoStorageId: w.logoStorageId,
				};
			}),
		);

		return results.filter(
			(r): r is NonNullable<typeof r> => r !== null,
		);
	},
});

/** Create a new workspace, add creator as admin, create default settings */
export const create = mutation({
	args: {
		name: v.string(),
		slug: v.optional(v.string()),
		visibility: v.optional(v.union(v.literal("public"), v.literal("private"))),
	},
	returns: v.id("workspaces"),
	handler: async (ctx, args) => {
		const userId = await requireAuth(ctx);

		const slug = args.slug || generateSlug(args.name);

		// Check slug uniqueness globally
		const existing = await ctx.db
			.query("workspaces")
			.withIndex("by_slug", (q) => q.eq("slug", slug))
			.unique();
		if (existing) {
			throw new ConvexError(
				"A workspace with this slug already exists. Please choose a different name.",
			);
		}

		const now = Date.now();

		// Create the workspace
		const workspaceId = await ctx.db.insert("workspaces", {
			name: args.name,
			slug,
			ownerId: userId,
			visibility: args.visibility ?? "public",
			plan: "free",
			createdAt: now,
			updatedAt: now,
		});

		// Add creator as admin member
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

		// Always provision the built-in Excalidraw MCP connector.
		await ctx.runMutation(
			internal.mcpServers.ensureSystemExcalidrawServerInternal,
			{
				workspaceId,
				createdBy: userId,
			},
		);

		return workspaceId;
	},
});

/** Update workspace name, slug, description, logo, or visibility (admin only) */
export const update = mutation({
	args: {
		workspaceId: v.id("workspaces"),
		name: v.optional(v.string()),
		slug: v.optional(v.string()),
		description: v.optional(v.string()),
		logoStorageId: v.optional(v.id("_storage")),
		visibility: v.optional(v.union(v.literal("public"), v.literal("private"))),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		await requireWorkspaceAdmin(ctx, args.workspaceId);

		const patch: Record<string, unknown> = { updatedAt: Date.now() };
		if (args.name !== undefined) patch.name = args.name;
		if (args.description !== undefined) patch.description = args.description;
		if (args.logoStorageId !== undefined)
			patch.logoStorageId = args.logoStorageId;
		if (args.visibility !== undefined) patch.visibility = args.visibility;

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
			// Check global uniqueness (allow same workspace to keep its slug)
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
		await requireAuth(ctx);
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
			visibility: v.optional(
				v.union(v.literal("public"), v.literal("private")),
			),
			description: v.optional(v.string()),
			logoStorageId: v.optional(v.id("_storage")),
			plan: v.optional(
				v.union(v.literal("free"), v.literal("pro"), v.literal("enterprise")),
			),
			isDemo: v.optional(v.boolean()),
			updatedAt: v.optional(v.number()),
			deletedAt: v.optional(v.number()),
		}),
		v.null(),
	),
	handler: async (ctx, args) => {
		await requireAuth(ctx);
		const workspace = await ctx.db
			.query("workspaces")
			.withIndex("by_slug", (q) => q.eq("slug", args.slug))
			.unique();

		if (!workspace || workspace.deletedAt) return null;
		return {
			_id: workspace._id,
			_creationTime: workspace._creationTime,
			name: workspace.name,
			slug: workspace.slug,
			ownerId: workspace.ownerId,
			visibility: workspace.visibility,
			description: workspace.description,
			logoStorageId: workspace.logoStorageId,
			plan: workspace.plan,
			isDemo: workspace.isDemo,
			updatedAt: workspace.updatedAt,
			deletedAt: workspace.deletedAt,
		};
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
