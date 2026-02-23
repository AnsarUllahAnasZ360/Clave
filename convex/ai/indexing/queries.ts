/**
 * Internal queries for the RAG indexing pipeline.
 *
 * These queries fetch content data (issues, documents, comments) for
 * the indexer actions. They live in a separate file because "use node" action
 * files cannot contain queries or mutations.
 */
import { v } from "convex/values";
import type { Id } from "../../_generated/dataModel";
import { internalQuery } from "../../_generated/server";

/**
 * Fetch minimal issue data for RAG indexing.
 */
export const getIssue = internalQuery({
	args: { issueId: v.id("issues") },
	returns: v.union(
		v.object({
			_id: v.id("issues"),
			identifier: v.string(),
			title: v.string(),
			description: v.optional(v.string()),
			status: v.string(),
			priority: v.string(),
			type: v.string(),
			projectId: v.optional(v.id("projects")),
			deletedAt: v.optional(v.number()),
		}),
		v.null(),
	),
	handler: async (ctx, args) => {
		const issue = await ctx.db.get(args.issueId);
		if (!issue) return null;
		return {
			_id: issue._id,
			identifier: issue.identifier,
			title: issue.title,
			description: issue.description,
			status: issue.status,
			priority: issue.priority,
			type: issue.type,
			projectId: issue.projectId,
			deletedAt: issue.deletedAt,
		};
	},
});

/**
 * Fetch minimal document data for RAG indexing.
 */
export const getDocument = internalQuery({
	args: { documentId: v.id("documents") },
	returns: v.union(
		v.object({
			_id: v.id("documents"),
			title: v.string(),
			content: v.optional(v.string()),
			projectId: v.optional(v.id("projects")),
			deletedAt: v.optional(v.number()),
		}),
		v.null(),
	),
	handler: async (ctx, args) => {
		const doc = await ctx.db.get(args.documentId);
		if (!doc) return null;
		return {
			_id: doc._id,
			title: doc.title,
			content: doc.content,
			projectId: doc.projectId,
			deletedAt: doc.deletedAt,
		};
	},
});

/**
 * Fetch a comment with its parent entity info for RAG indexing.
 * Resolves the parent (issue/task/story) to get projectId and title.
 */
export const getComment = internalQuery({
	args: { commentId: v.id("comments") },
	returns: v.union(
		v.object({
			_id: v.id("comments"),
			body: v.string(),
			deletedAt: v.optional(v.number()),
			projectId: v.optional(v.id("projects")),
			parentTitle: v.optional(v.string()),
		}),
		v.null(),
	),
	handler: async (ctx, args) => {
		const comment = await ctx.db.get(args.commentId);
		if (!comment) return null;

		// Resolve parent to get projectId and title
		let projectId: Id<"projects"> | undefined;
		let parentTitle: string | undefined;

		if (comment.issueId) {
			const issue = await ctx.db.get(comment.issueId);
			if (issue) {
				projectId = issue.projectId;
				parentTitle = issue.title;
			}
		} else if (comment.taskId) {
			const task = await ctx.db.get(comment.taskId);
			if (task) {
				projectId = task.projectId ?? undefined;
				parentTitle = task.title;
			}
		} else if (comment.storyId) {
			const story = await ctx.db.get(comment.storyId);
			if (story) {
				projectId = story.projectId ?? undefined;
				parentTitle = story.title;
			}
		}

		return {
			_id: comment._id,
			body: comment.body,
			deletedAt: comment.deletedAt,
			projectId,
			parentTitle,
		};
	},
});

/**
 * Fetch a GitHub connection for a project (used by githubIndexer).
 * Returns the connection with the encrypted access token for decryption.
 */
export const getGithubConnection = internalQuery({
	args: { projectId: v.id("projects") },
	returns: v.union(
		v.object({
			_id: v.id("githubConnections"),
			workspaceId: v.id("workspaces"),
			projectId: v.id("projects"),
			repoOwner: v.string(),
			repoName: v.string(),
			defaultBranch: v.string(),
			accessToken: v.string(),
			status: v.union(
				v.literal("active"),
				v.literal("disconnected"),
				v.literal("error"),
			),
		}),
		v.null(),
	),
	handler: async (ctx, args) => {
		const connection = await ctx.db
			.query("githubConnections")
			.withIndex("by_project", (q) => q.eq("projectId", args.projectId))
			.first();

		if (!connection || connection.status !== "active") return null;

		return {
			_id: connection._id,
			workspaceId: connection.workspaceId,
			projectId: connection.projectId,
			repoOwner: connection.repoOwner,
			repoName: connection.repoName,
			defaultBranch: connection.defaultBranch,
			accessToken: connection.accessToken,
			status: connection.status,
		};
	},
});

/**
 * Fetch a GitHub connection by repo owner/name (used by webhook handler).
 * Returns the connection with webhookSecret for HMAC signature verification.
 */
export const getConnectionByRepo = internalQuery({
	args: {
		repoOwner: v.string(),
		repoName: v.string(),
	},
	returns: v.union(
		v.object({
			_id: v.id("githubConnections"),
			workspaceId: v.id("workspaces"),
			projectId: v.id("projects"),
			repoOwner: v.string(),
			repoName: v.string(),
			defaultBranch: v.string(),
			accessToken: v.string(),
			status: v.union(
				v.literal("active"),
				v.literal("disconnected"),
				v.literal("error"),
			),
			webhookId: v.optional(v.number()),
			webhookSecret: v.optional(v.string()),
		}),
		v.null(),
	),
	handler: async (ctx, args) => {
		const connection = await ctx.db
			.query("githubConnections")
			.withIndex("by_repo", (q) =>
				q.eq("repoOwner", args.repoOwner).eq("repoName", args.repoName),
			)
			.first();

		if (!connection || connection.status !== "active") return null;

		return {
			_id: connection._id,
			workspaceId: connection.workspaceId,
			projectId: connection.projectId,
			repoOwner: connection.repoOwner,
			repoName: connection.repoName,
			defaultBranch: connection.defaultBranch,
			accessToken: connection.accessToken,
			status: connection.status,
			webhookId: connection.webhookId,
			webhookSecret: connection.webhookSecret,
		};
	},
});
