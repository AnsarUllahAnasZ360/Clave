import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import { mutation, query } from "./_generated/server";
import {
	requireAuth,
	requireOrgAdmin,
	requireOrgMember,
	requireWorkspaceAdmin,
} from "./lib/auth";
import { checkPlanLimit } from "./lib/planLimits";
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
			organizationId: v.optional(v.id("organizations")),
			visibility: v.optional(
				v.union(v.literal("public"), v.literal("private")),
			),
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
				organizationId: w.organizationId,
				visibility: w.visibility,
				description: w.description,
				logoStorageId: w.logoStorageId,
				updatedAt: w.updatedAt,
				deletedAt: w.deletedAt,
			}));
	},
});

/** Create a new workspace, add creator as admin, create default settings */
export const create = mutation({
	args: {
		name: v.string(),
		slug: v.optional(v.string()),
		organizationId: v.id("organizations"),
		visibility: v.optional(v.union(v.literal("public"), v.literal("private"))),
	},
	returns: v.id("workspaces"),
	handler: async (ctx, args) => {
		// Validate user is a member of the organization
		const { userId } = await requireOrgMember(ctx, args.organizationId);

		// Check plan workspace limit before creating
		await checkPlanLimit(ctx, args.organizationId, "maxWorkspaces");

		const slug = args.slug || generateSlug(args.name);

		// Check slug uniqueness within the organization
		const existing = await ctx.db
			.query("workspaces")
			.withIndex("by_org_slug", (q) =>
				q.eq("organizationId", args.organizationId).eq("slug", slug),
			)
			.first();
		if (existing) {
			throw new ConvexError(
				"A workspace with this slug already exists in this organization. Please choose a different name.",
			);
		}

		// Create the workspace
		const workspaceId = await ctx.db.insert("workspaces", {
			name: args.name,
			slug,
			ownerId: userId,
			organizationId: args.organizationId,
			visibility: args.visibility ?? "public",
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

		// Always provision the built-in Excalidraw MCP connector.
		await ctx.runMutation(
			internal.mcpServers.ensureSystemExcalidrawServerInternal,
			{
				workspaceId,
				createdBy: userId,
			},
		);

		// TODO(STORY-008): Seed preset sub-agents for new workspaces.
		// Once internal functions are available, add:
		//   await ctx.runMutation(internal.ai.agentPresets.seedPresetAgents, {
		//     workspaceId,
		//     seedUserId: userId,
		//   });
		// This inserts the 3 preset agents (PM, Writer, Reviewer) idempotently.

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
			// Check org-scoped slug uniqueness (allow same workspace to keep its slug)
			const workspace = await ctx.db.get(args.workspaceId);
			if (workspace?.organizationId) {
				const existing = await ctx.db
					.query("workspaces")
					.withIndex("by_org_slug", (q) =>
						q
							.eq("organizationId", workspace.organizationId)
							.eq("slug", normalized),
					)
					.first();
				if (existing && existing._id !== args.workspaceId) {
					throw new ConvexError(
						"A workspace with this slug already exists in this organization",
					);
				}
			} else {
				// Fallback to global uniqueness for orphan workspaces
				const existing = await ctx.db
					.query("workspaces")
					.withIndex("by_slug", (q) => q.eq("slug", normalized))
					.unique();
				if (existing && existing._id !== args.workspaceId) {
					throw new ConvexError("A workspace with this slug already exists");
				}
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
			organizationId: v.optional(v.id("organizations")),
			visibility: v.optional(
				v.union(v.literal("public"), v.literal("private")),
			),
			description: v.optional(v.string()),
			logoStorageId: v.optional(v.id("_storage")),
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
			organizationId: workspace.organizationId,
			visibility: workspace.visibility,
			description: workspace.description,
			logoStorageId: workspace.logoStorageId,
			isDemo: workspace.isDemo,
			updatedAt: workspace.updatedAt,
			deletedAt: workspace.deletedAt,
		};
	},
});

/** List workspaces in an organization (public + private where user is member) */
export const listByOrganization = query({
	args: { organizationId: v.id("organizations") },
	returns: v.array(
		v.object({
			_id: v.id("workspaces"),
			_creationTime: v.number(),
			name: v.string(),
			slug: v.string(),
			ownerId: v.id("users"),
			organizationId: v.optional(v.id("organizations")),
			visibility: v.optional(
				v.union(v.literal("public"), v.literal("private")),
			),
			description: v.optional(v.string()),
			logoStorageId: v.optional(v.id("_storage")),
			logoUrl: v.optional(v.string()),
			isDemo: v.optional(v.boolean()),
			updatedAt: v.optional(v.number()),
			deletedAt: v.optional(v.number()),
			isMember: v.boolean(),
			memberCount: v.number(),
		}),
	),
	handler: async (ctx, args) => {
		const { userId } = await requireOrgMember(ctx, args.organizationId);

		// Get all workspaces in this organization
		const orgWorkspaces = await ctx.db
			.query("workspaces")
			.withIndex("by_organization", (q) =>
				q.eq("organizationId", args.organizationId),
			)
			.collect();

		const activeWorkspaces = orgWorkspaces.filter((w) => !w.deletedAt);

		// Parallel fetch: membership check + member count for each workspace
		const enriched = await Promise.all(
			activeWorkspaces.map(async (workspace) => {
				const [membership, members] = await Promise.all([
					ctx.db
						.query("workspaceMembers")
						.withIndex("by_workspace_user", (q) =>
							q.eq("workspaceId", workspace._id).eq("userId", userId),
						)
						.unique(),
					ctx.db
						.query("workspaceMembers")
						.withIndex("by_workspace", (q) =>
							q.eq("workspaceId", workspace._id),
						)
						.collect(),
				]);
				return {
					workspace,
					isMember: !!membership,
					memberCount: members.length,
				};
			}),
		);

		// Filter to visible workspaces and resolve logos in parallel
		const visible = enriched.filter(
			({ workspace, isMember }) =>
				(workspace.visibility ?? "public") === "public" || isMember,
		);

		const logoUrls = await Promise.all(
			visible.map(({ workspace }) =>
				workspace.logoStorageId
					? ctx.storage.getUrl(workspace.logoStorageId)
					: null,
			),
		);

		return visible.map(({ workspace, isMember, memberCount }, i) => ({
			_id: workspace._id,
			_creationTime: workspace._creationTime,
			name: workspace.name,
			slug: workspace.slug,
			ownerId: workspace.ownerId,
			organizationId: workspace.organizationId,
			visibility: workspace.visibility,
			description: workspace.description,
			logoStorageId: workspace.logoStorageId,
			updatedAt: workspace.updatedAt,
			deletedAt: workspace.deletedAt,
			logoUrl: logoUrls[i] ?? undefined,
			isDemo: workspace.isDemo,
			isMember,
			memberCount,
		}));
	},
});

/** Join a public workspace as an org member */
export const joinPublicWorkspace = mutation({
	args: { workspaceId: v.id("workspaces") },
	returns: v.null(),
	handler: async (ctx, args) => {
		const userId = await requireAuth(ctx);

		const workspace = await ctx.db.get(args.workspaceId);
		if (!workspace || workspace.deletedAt) {
			throw new ConvexError("Workspace not found");
		}

		if (!workspace.organizationId) {
			throw new ConvexError("Workspace is not linked to an organization");
		}

		// Validate user is a member of the workspace's organization
		await requireOrgMember(ctx, workspace.organizationId);

		// Validate workspace is public
		const visibility = workspace.visibility ?? "public";
		if (visibility !== "public") {
			throw new ConvexError(
				"Workspace is private. You need an invite to join.",
			);
		}

		// Check if user is already a workspace member
		const existingMember = await ctx.db
			.query("workspaceMembers")
			.withIndex("by_workspace_user", (q) =>
				q.eq("workspaceId", args.workspaceId).eq("userId", userId),
			)
			.unique();

		if (existingMember) {
			// Already a member — no-op
			return null;
		}

		// Add user as member
		await ctx.db.insert("workspaceMembers", {
			workspaceId: args.workspaceId,
			userId,
			role: "member",
			joinedAt: Date.now(),
		});

		return null;
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

/** Fix orphan workspaces that are missing an organizationId */
export const fixOrphanWorkspaces = mutation({
	args: { organizationId: v.id("organizations") },
	returns: v.number(),
	handler: async (ctx, args) => {
		// Require org admin/owner
		const { userId } = await requireOrgAdmin(ctx, args.organizationId);

		// Find all workspaces where user is a member but organizationId is missing
		const memberships = await ctx.db
			.query("workspaceMembers")
			.withIndex("by_user", (q) => q.eq("userId", userId))
			.collect();

		let fixed = 0;
		for (const membership of memberships) {
			const workspace = await ctx.db.get(membership.workspaceId);
			if (workspace && !workspace.organizationId && !workspace.deletedAt) {
				await ctx.db.patch(workspace._id, {
					organizationId: args.organizationId,
				});
				fixed++;
			}
		}

		return fixed;
	},
});
