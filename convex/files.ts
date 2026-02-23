import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireAuth, requireWorkspaceMember } from "./lib/auth";

const fileWithUrlValidator = v.object({
	_id: v.id("files"),
	_creationTime: v.number(),
	workspaceId: v.id("workspaces"),
	projectId: v.optional(v.id("projects")),
	issueId: v.optional(v.id("issues")),
	storyId: v.optional(v.id("stories")),
	name: v.string(),
	description: v.optional(v.string()),
	storageId: v.optional(v.id("_storage")),
	externalUrl: v.optional(v.string()),
	mimeType: v.optional(v.string()),
	size: v.optional(v.number()),
	fileType: v.optional(v.string()),
	uploadedBy: v.id("users"),
	deletedAt: v.optional(v.number()),
	url: v.union(v.string(), v.null()),
});

/** List files for a project, excluding soft-deleted, sorted by _creationTime desc, with resolved URLs */
export const listByProject = query({
	args: {
		projectId: v.id("projects"),
	},
	returns: v.array(fileWithUrlValidator),
	handler: async (ctx, args) => {
		const project = await ctx.db.get(args.projectId);
		if (!project) return [];
		await requireWorkspaceMember(ctx, project.workspaceId);

		const files = await ctx.db
			.query("files")
			.withIndex("by_project", (q) => q.eq("projectId", args.projectId))
			.order("desc")
			.collect();

		const activeFiles = files.filter((f) => !f.deletedAt);

		// Resolve storage URLs for uploaded files
		return Promise.all(
			activeFiles.map(async (f) => ({
				...f,
				url: f.storageId
					? await ctx.storage.getUrl(f.storageId)
					: (f.externalUrl ?? null),
			})),
		);
	},
});

/** List files attached to a specific task (story), excluding soft-deleted, with resolved URLs */
export const listByTask = query({
	args: {
		storyId: v.id("stories"),
	},
	returns: v.array(fileWithUrlValidator),
	handler: async (ctx, args) => {
		const story = await ctx.db.get(args.storyId);
		if (!story) return [];
		await requireWorkspaceMember(ctx, story.workspaceId);

		const files = await ctx.db
			.query("files")
			.withIndex("by_story", (q) => q.eq("storyId", args.storyId))
			.order("desc")
			.collect();

		const activeFiles = files.filter((f) => !f.deletedAt);

		return Promise.all(
			activeFiles.map(async (f) => ({
				...f,
				url: f.storageId
					? await ctx.storage.getUrl(f.storageId)
					: (f.externalUrl ?? null),
			})),
		);
	},
});

/** Generate an upload URL for Convex file storage */
export const generateUploadUrl = mutation({
	args: {},
	returns: v.string(),
	handler: async (ctx) => {
		await requireAuth(ctx);
		return await ctx.storage.generateUploadUrl();
	},
});

/** Generate an upload URL for public edit mode (no auth required).
 *  Validates that the entity exists, is public, and has edit permission. */
export const generatePublicUploadUrl = mutation({
	args: {
		documentId: v.optional(v.id("documents")),
		whiteboardId: v.optional(v.id("whiteboards")),
	},
	returns: v.string(),
	handler: async (ctx, args) => {
		if (args.documentId) {
			const doc = await ctx.db.get(args.documentId);
			if (
				!doc ||
				doc.deletedAt ||
				doc.visibility !== "public" ||
				doc.defaultPermission !== "edit"
			) {
				throw new ConvexError("Public edit access required");
			}
		} else if (args.whiteboardId) {
			const wb = await ctx.db.get(args.whiteboardId);
			if (
				!wb ||
				wb.deletedAt ||
				wb.visibility !== "public" ||
				wb.defaultPermission !== "edit"
			) {
				throw new ConvexError("Public edit access required");
			}
		} else {
			throw new ConvexError(
				"Either documentId or whiteboardId must be provided",
			);
		}

		return await ctx.storage.generateUploadUrl();
	},
});

/** Get a serving URL for a stored file */
export const getUrl = query({
	args: {
		storageId: v.id("_storage"),
	},
	returns: v.union(v.string(), v.null()),
	handler: async (ctx, args) => {
		return await ctx.storage.getUrl(args.storageId);
	},
});

/** List files attached to a specific issue, excluding soft-deleted, with resolved URLs */
export const listByIssue = query({
	args: {
		issueId: v.id("issues"),
	},
	returns: v.array(fileWithUrlValidator),
	handler: async (ctx, args) => {
		const issue = await ctx.db.get(args.issueId);
		if (!issue) return [];
		await requireWorkspaceMember(ctx, issue.workspaceId);

		const files = await ctx.db
			.query("files")
			.withIndex("by_issue", (q) => q.eq("issueId", args.issueId))
			.order("desc")
			.collect();

		const activeFiles = files.filter((f) => !f.deletedAt);

		return Promise.all(
			activeFiles.map(async (f) => ({
				...f,
				url: f.storageId
					? await ctx.storage.getUrl(f.storageId)
					: (f.externalUrl ?? null),
			})),
		);
	},
});

/** Create a file record -- accepts either storageId (upload) or externalUrl (link) */
export const create = mutation({
	args: {
		workspaceId: v.id("workspaces"),
		projectId: v.optional(v.id("projects")),
		issueId: v.optional(v.id("issues")),
		storyId: v.optional(v.id("stories")),
		name: v.string(),
		description: v.optional(v.string()),
		storageId: v.optional(v.id("_storage")),
		externalUrl: v.optional(v.string()),
		mimeType: v.optional(v.string()),
		size: v.optional(v.float64()),
		fileType: v.optional(v.string()),
	},
	returns: v.id("files"),
	handler: async (ctx, args) => {
		const { userId } = await requireWorkspaceMember(ctx, args.workspaceId);

		// Validate: must have either storageId or externalUrl
		if (!args.storageId && !args.externalUrl) {
			throw new ConvexError("Either storageId or externalUrl must be provided");
		}

		const fileId = await ctx.db.insert("files", {
			workspaceId: args.workspaceId,
			projectId: args.projectId,
			issueId: args.issueId,
			storyId: args.storyId,
			name: args.name,
			description: args.description,
			storageId: args.storageId,
			externalUrl: args.externalUrl,
			mimeType: args.mimeType,
			size: args.size,
			fileType: args.fileType,
			uploadedBy: userId,
		});

		return fileId;
	},
});

/** Soft-delete a file record */
export const remove = mutation({
	args: {
		fileId: v.id("files"),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const file = await ctx.db.get(args.fileId);
		if (!file || file.deletedAt) throw new ConvexError("File not found");
		await requireWorkspaceMember(ctx, file.workspaceId);

		await ctx.db.patch(args.fileId, {
			deletedAt: Date.now(),
		});
	},
});
