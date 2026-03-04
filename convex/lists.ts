import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { canAccessProject, requireWorkspaceMember } from "./lib/auth";
import { fractionalIndex } from "./lib/utils";

const listDocValidator = v.object({
	_id: v.id("lists"),
	_creationTime: v.number(),
	projectId: v.id("projects"),
	workspaceId: v.id("workspaces"),
	name: v.string(),
	description: v.optional(v.string()),
	icon: v.optional(v.string()),
	color: v.optional(v.string()),
	sortOrder: v.number(),
	createdBy: v.id("users"),
	updatedAt: v.optional(v.number()),
	deletedAt: v.optional(v.number()),
});

// ── Queries ─────────────────────────────────────────────────────────────────

/** All lists for a project, ordered by sortOrder */
export const listByProject = query({
	args: {
		projectId: v.id("projects"),
	},
	returns: v.array(listDocValidator),
	handler: async (ctx, args) => {
		const project = await ctx.db.get(args.projectId);
		if (!project || project.deletedAt) return [];
		const { userId, member } = await requireWorkspaceMember(
			ctx,
			project.workspaceId,
		);

		if (member.role !== "admin") {
			const hasAccess = await canAccessProject(
				ctx,
				args.projectId,
				userId,
				member.role as "admin" | "member",
			);
			if (!hasAccess) return [];
		}

		const lists = await ctx.db
			.query("lists")
			.withIndex("by_project_sort", (q) => q.eq("projectId", args.projectId))
			.collect();

		return lists.filter((l) => !l.deletedAt);
	},
});

/** Single list by ID */
export const getById = query({
	args: {
		listId: v.id("lists"),
	},
	returns: v.union(listDocValidator, v.null()),
	handler: async (ctx, args) => {
		const list = await ctx.db.get(args.listId);
		if (!list || list.deletedAt) return null;
		const { userId, member } = await requireWorkspaceMember(
			ctx,
			list.workspaceId,
		);

		if (member.role !== "admin") {
			const hasAccess = await canAccessProject(
				ctx,
				list.projectId,
				userId,
				member.role as "admin" | "member",
			);
			if (!hasAccess) return null;
		}

		return list;
	},
});

// ── Mutations ────────────────────────────────────────────────────────────────

/** Create a new list in a project */
export const create = mutation({
	args: {
		projectId: v.id("projects"),
		name: v.string(),
		description: v.optional(v.string()),
		icon: v.optional(v.string()),
		color: v.optional(v.string()),
	},
	returns: v.id("lists"),
	handler: async (ctx, args) => {
		const project = await ctx.db.get(args.projectId);
		if (!project || project.deletedAt) {
			throw new ConvexError("Project not found");
		}
		const { userId, member } = await requireWorkspaceMember(
			ctx,
			project.workspaceId,
		);

		if (member.role !== "admin") {
			const hasAccess = await canAccessProject(
				ctx,
				args.projectId,
				userId,
				member.role as "admin" | "member",
			);
			if (!hasAccess) {
				throw new ConvexError("You don't have access to this project");
			}
		}

		// Append at end
		const last = await ctx.db
			.query("lists")
			.withIndex("by_project_sort", (q) => q.eq("projectId", args.projectId))
			.order("desc")
			.first();
		const sortOrder = fractionalIndex(last?.sortOrder ?? null, null);

		return ctx.db.insert("lists", {
			projectId: args.projectId,
			workspaceId: project.workspaceId,
			name: args.name,
			description: args.description,
			icon: args.icon,
			color: args.color,
			sortOrder,
			createdBy: userId,
		});
	},
});

/** Update list metadata */
export const update = mutation({
	args: {
		listId: v.id("lists"),
		name: v.optional(v.string()),
		description: v.optional(v.string()),
		icon: v.optional(v.string()),
		color: v.optional(v.string()),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const list = await ctx.db.get(args.listId);
		if (!list || list.deletedAt) {
			throw new ConvexError("List not found");
		}
		const { userId, member } = await requireWorkspaceMember(
			ctx,
			list.workspaceId,
		);

		if (member.role !== "admin") {
			const hasAccess = await canAccessProject(
				ctx,
				list.projectId,
				userId,
				member.role as "admin" | "member",
			);
			if (!hasAccess) {
				throw new ConvexError("You don't have access to this list");
			}
		}

		const { listId, ...updates } = args;
		await ctx.db.patch(listId, { ...updates, updatedAt: Date.now() });
		return null;
	},
});

/** Soft-delete a list */
export const remove = mutation({
	args: {
		listId: v.id("lists"),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const list = await ctx.db.get(args.listId);
		if (!list || list.deletedAt) {
			throw new ConvexError("List not found");
		}
		const { userId, member } = await requireWorkspaceMember(
			ctx,
			list.workspaceId,
		);

		if (member.role !== "admin") {
			const hasAccess = await canAccessProject(
				ctx,
				list.projectId,
				userId,
				member.role as "admin" | "member",
			);
			if (!hasAccess) {
				throw new ConvexError("You don't have access to this list");
			}
		}

		await ctx.db.patch(args.listId, { deletedAt: Date.now() });
		return null;
	},
});

/** Reorder a list within a project by updating its sortOrder */
export const reorder = mutation({
	args: {
		listId: v.id("lists"),
		beforeSortOrder: v.optional(v.number()),
		afterSortOrder: v.optional(v.number()),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const list = await ctx.db.get(args.listId);
		if (!list || list.deletedAt) {
			throw new ConvexError("List not found");
		}
		const { userId, member } = await requireWorkspaceMember(
			ctx,
			list.workspaceId,
		);

		if (member.role !== "admin") {
			const hasAccess = await canAccessProject(
				ctx,
				list.projectId,
				userId,
				member.role as "admin" | "member",
			);
			if (!hasAccess) {
				throw new ConvexError("You don't have access to this list");
			}
		}

		const sortOrder = fractionalIndex(
			args.beforeSortOrder ?? null,
			args.afterSortOrder ?? null,
		);
		await ctx.db.patch(args.listId, { sortOrder, updatedAt: Date.now() });
		return null;
	},
});
