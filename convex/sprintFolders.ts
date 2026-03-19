import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { canAccessProject, requireWorkspaceMember } from "./lib/auth";
import { fractionalIndex } from "./lib/utils";

export const listByProject = query({
	args: {
		projectId: v.id("projects"),
	},
	returns: v.array(
		v.object({
			_id: v.id("sprintFolders"),
			_creationTime: v.number(),
			projectId: v.id("projects"),
			name: v.string(),
			icon: v.optional(v.string()),
			sortOrder: v.number(),
			createdBy: v.id("users"),
			updatedAt: v.optional(v.number()),
			deletedAt: v.optional(v.number()),
		}),
	),
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
		const folders = await ctx.db
			.query("sprintFolders")
			.withIndex("by_project_sort", (q) => q.eq("projectId", args.projectId))
			.collect();
		return folders.filter((f) => !f.deletedAt);
	},
});

export const create = mutation({
	args: {
		projectId: v.id("projects"),
		name: v.string(),
		icon: v.optional(v.string()),
	},
	returns: v.id("sprintFolders"),
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
		const lastFolder = await ctx.db
			.query("sprintFolders")
			.withIndex("by_project_sort", (q) => q.eq("projectId", args.projectId))
			.order("desc")
			.first();
		const sortOrder = fractionalIndex(
			lastFolder ? lastFolder.sortOrder : null,
			null,
		);
		return ctx.db.insert("sprintFolders", {
			projectId: args.projectId,
			name: args.name,
			icon: args.icon,
			sortOrder,
			createdBy: userId,
		});
	},
});

export const update = mutation({
	args: {
		folderId: v.id("sprintFolders"),
		name: v.optional(v.string()),
		icon: v.optional(v.string()),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const folder = await ctx.db.get(args.folderId);
		if (!folder || folder.deletedAt) {
			throw new ConvexError("Sprint folder not found");
		}
		const project = await ctx.db.get(folder.projectId);
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
				folder.projectId,
				userId,
				member.role as "admin" | "member",
			);
			if (!hasAccess) {
				throw new ConvexError("You don't have access to this project");
			}
		}
		const { folderId: _, ...updates } = args;
		await ctx.db.patch(args.folderId, {
			...updates,
			updatedAt: Date.now(),
		});
	},
});

export const remove = mutation({
	args: {
		folderId: v.id("sprintFolders"),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const folder = await ctx.db.get(args.folderId);
		if (!folder || folder.deletedAt) {
			throw new ConvexError("Sprint folder not found");
		}
		const project = await ctx.db.get(folder.projectId);
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
				folder.projectId,
				userId,
				member.role as "admin" | "member",
			);
			if (!hasAccess) {
				throw new ConvexError("You don't have access to this project");
			}
		}
		await ctx.db.patch(args.folderId, { deletedAt: Date.now() });
		// Unset folderId on sprints in this folder
		const sprints = await ctx.db
			.query("sprints")
			.withIndex("by_folder", (q) => q.eq("folderId", args.folderId))
			.collect();
		for (const sprint of sprints) {
			if (!sprint.deletedAt) {
				await ctx.db.patch(sprint._id, {
					folderId: undefined,
					updatedAt: Date.now(),
				});
			}
		}
	},
});
