import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import {
	canAccessProject,
	getAccessibleProjectIds,
	requireWorkspaceMember,
} from "./lib/auth";

const noteValidator = v.object({
	_id: v.id("notes"),
	_creationTime: v.number(),
	workspaceId: v.id("workspaces"),
	projectId: v.optional(v.id("projects")),
	title: v.string(),
	content: v.optional(v.string()),
	noteType: v.optional(v.string()),
	labelIds: v.optional(v.array(v.id("labels"))),
	createdBy: v.id("users"),
	updatedAt: v.optional(v.number()),
	deletedAt: v.optional(v.number()),
});

/** List notes for a project, excluding soft-deleted, sorted by _creationTime desc */
export const listByProject = query({
	args: {
		projectId: v.id("projects"),
	},
	returns: v.array(noteValidator),
	handler: async (ctx, args) => {
		const project = await ctx.db.get(args.projectId);
		if (!project) return [];
		const { userId, member } = await requireWorkspaceMember(
			ctx,
			project.workspaceId,
		);

		// RBAC: check project access for member users
		if (member.role !== "admin") {
			const hasAccess = await canAccessProject(
				ctx,
				args.projectId,
				userId,
				member.role as "admin" | "member",
			);
			if (!hasAccess) return [];
		}

		const notes = await ctx.db
			.query("notes")
			.withIndex("by_project", (q) => q.eq("projectId", args.projectId))
			.order("desc")
			.collect();

		return notes.filter((n) => !n.deletedAt);
	},
});

/** List notes for a workspace, excluding soft-deleted, sorted by _creationTime desc */
export const listByWorkspace = query({
	args: {
		workspaceId: v.id("workspaces"),
	},
	returns: v.array(noteValidator),
	handler: async (ctx, args) => {
		const { userId, member } = await requireWorkspaceMember(
			ctx,
			args.workspaceId,
		);
		const accessibleProjectIds = await getAccessibleProjectIds(
			ctx,
			args.workspaceId,
			userId,
			member.role as "admin" | "member",
		);

		const notes = await ctx.db
			.query("notes")
			.withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
			.order("desc")
			.collect();

		return notes.filter((n) => {
			if (n.deletedAt) return false;
			if (accessibleProjectIds !== null) {
				if (n.projectId) return accessibleProjectIds.has(n.projectId);
				return n.createdBy === userId;
			}
			return true;
		});
	},
});

/** Get a single note by ID */
export const getById = query({
	args: {
		noteId: v.id("notes"),
	},
	returns: v.union(noteValidator, v.null()),
	handler: async (ctx, args) => {
		const note = await ctx.db.get(args.noteId);
		if (!note || note.deletedAt) return null;
		const { userId, member } = await requireWorkspaceMember(
			ctx,
			note.workspaceId,
		);

		// RBAC: members can only see notes in accessible projects or their own
		if (member.role !== "admin" && note.projectId) {
			const hasAccess = await canAccessProject(
				ctx,
				note.projectId,
				userId,
				member.role as "admin" | "member",
			);
			if (!hasAccess && note.createdBy !== userId) return null;
		}

		return note;
	},
});

/** Create a new note */
export const create = mutation({
	args: {
		workspaceId: v.id("workspaces"),
		projectId: v.optional(v.id("projects")),
		title: v.string(),
		content: v.optional(v.string()),
		noteType: v.union(
			v.literal("general"),
			v.literal("meeting"),
			v.literal("audio"),
		),
		labelIds: v.optional(v.array(v.id("labels"))),
	},
	returns: v.id("notes"),
	handler: async (ctx, args) => {
		const { userId, member } = await requireWorkspaceMember(
			ctx,
			args.workspaceId,
		);

		// RBAC: verify project access for member users
		if (member.role !== "admin" && args.projectId) {
			const hasAccess = await canAccessProject(
				ctx,
				args.projectId,
				userId,
				member.role as "admin" | "member",
			);
			if (!hasAccess) throw new ConvexError("You don't have access to this project");
		}

		const noteId = await ctx.db.insert("notes", {
			workspaceId: args.workspaceId,
			projectId: args.projectId,
			title: args.title,
			content: args.content,
			noteType: args.noteType,
			labelIds: args.labelIds,
			createdBy: userId,
			updatedAt: Date.now(),
		});

		return noteId;
	},
});

/** Update a note's title and/or content */
export const update = mutation({
	args: {
		noteId: v.id("notes"),
		title: v.optional(v.string()),
		content: v.optional(v.string()),
		noteType: v.optional(
			v.union(v.literal("general"), v.literal("meeting"), v.literal("audio")),
		),
		labelIds: v.optional(v.array(v.id("labels"))),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const note = await ctx.db.get(args.noteId);
		if (!note || note.deletedAt) throw new ConvexError("Note not found");
		const { userId, member } = await requireWorkspaceMember(
			ctx,
			note.workspaceId,
		);

		// RBAC: verify project access or creator for member users
		if (member.role !== "admin" && note.projectId) {
			const hasAccess = await canAccessProject(
				ctx,
				note.projectId,
				userId,
				member.role as "admin" | "member",
			);
			if (!hasAccess && note.createdBy !== userId)
				throw new ConvexError("You don't have access to this note");
		}

		const updates: Record<string, unknown> = {
			updatedAt: Date.now(),
		};
		if (args.title !== undefined) updates.title = args.title;
		if (args.content !== undefined) updates.content = args.content;
		if (args.noteType !== undefined) updates.noteType = args.noteType;
		if (args.labelIds !== undefined) updates.labelIds = args.labelIds;

		await ctx.db.patch(args.noteId, updates);
	},
});

/** Link a note to a project by setting its projectId */
export const linkToProject = mutation({
	args: {
		noteId: v.id("notes"),
		projectId: v.id("projects"),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const note = await ctx.db.get(args.noteId);
		if (!note || note.deletedAt) throw new ConvexError("Note not found");
		await requireWorkspaceMember(ctx, note.workspaceId);

		const project = await ctx.db.get(args.projectId);
		if (!project || project.deletedAt) throw new ConvexError("Project not found");

		await ctx.db.patch(args.noteId, {
			projectId: args.projectId,
			updatedAt: Date.now(),
		});
	},
});

/** Unlink a note from its project by clearing projectId */
export const unlinkFromProject = mutation({
	args: {
		noteId: v.id("notes"),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const note = await ctx.db.get(args.noteId);
		if (!note || note.deletedAt) throw new ConvexError("Note not found");
		await requireWorkspaceMember(ctx, note.workspaceId);

		const { _id, _creationTime, projectId: _removed, ...rest } = note;
		await ctx.db.replace(args.noteId, {
			...rest,
			updatedAt: Date.now(),
		});
	},
});

/** Soft-delete a note */
export const remove = mutation({
	args: {
		noteId: v.id("notes"),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const note = await ctx.db.get(args.noteId);
		if (!note || note.deletedAt) throw new ConvexError("Note not found");
		const { userId, member } = await requireWorkspaceMember(
			ctx,
			note.workspaceId,
		);

		// RBAC: verify project access or creator for member users
		if (member.role !== "admin" && note.projectId) {
			const hasAccess = await canAccessProject(
				ctx,
				note.projectId,
				userId,
				member.role as "admin" | "member",
			);
			if (!hasAccess && note.createdBy !== userId)
				throw new ConvexError("You don't have access to this note");
		}

		await ctx.db.patch(args.noteId, {
			deletedAt: Date.now(),
		});
	},
});
