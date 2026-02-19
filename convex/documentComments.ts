import { ConvexError, v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";
import { logActivity } from "./lib/activity";
import { requireWorkspaceMember } from "./lib/auth";
import { createNotification } from "./lib/notifications";

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Extract mentioned user IDs from a BlockNote CommentBody JSON string.
 * BlockNote CommentBody uses inline content nodes; mentions have type "mention"
 * with an `attrs.id` field containing the user ID.
 */
function extractMentionedUserIds(bodyJson: string): string[] {
	try {
		const body = JSON.parse(bodyJson);
		const ids: string[] = [];
		function walk(node: Record<string, unknown>) {
			if (
				node.type === "mention" &&
				(node.attrs as Record<string, unknown>)?.id
			) {
				ids.push((node.attrs as Record<string, string>).id);
			}
			const content = node.content as Record<string, unknown>[] | undefined;
			if (Array.isArray(content)) {
				for (const child of content) walk(child);
			}
			// Also walk array items if body itself is an array (BlockNote doc format)
			if (Array.isArray(node)) {
				for (const item of node as unknown as Record<string, unknown>[])
					walk(item);
			}
		}
		if (Array.isArray(body)) {
			for (const item of body) walk(item);
		} else {
			walk(body);
		}
		return ids;
	} catch {
		return [];
	}
}

// ── Queries ─────────────────────────────────────────────────────────────────

/**
 * List all threads for a document with nested comments and reactions.
 * Returns data shaped for the ConvexThreadStore to convert to BlockNote ThreadData.
 */
export const listThreadsByDocument = query({
	args: {
		documentId: v.id("documents"),
	},
	handler: async (ctx, args) => {
		const document = await ctx.db.get(args.documentId);
		if (!document || document.deletedAt) return [];
		await requireWorkspaceMember(ctx, document.workspaceId);

		const threads = await ctx.db
			.query("documentThreads")
			.withIndex("by_document", (q) => q.eq("documentId", args.documentId))
			.collect();

		return Promise.all(
			threads.map(async (thread) => {
				const comments = await ctx.db
					.query("documentComments")
					.withIndex("by_thread", (q) => q.eq("threadId", thread._id))
					.collect();

				const reactions = await ctx.db
					.query("documentCommentReactions")
					.withIndex("by_thread", (q) => q.eq("threadId", thread._id))
					.collect();

				// Group reactions by comment
				const reactionsByComment = new Map<string, typeof reactions>();
				for (const r of reactions) {
					const key = r.commentId as string;
					const existing = reactionsByComment.get(key) ?? [];
					existing.push(r);
					reactionsByComment.set(key, existing);
				}

				return {
					...thread,
					comments: comments
						.sort((a, b) => a._creationTime - b._creationTime)
						.map((c) => ({
							...c,
							reactions: reactionsByComment.get(c._id as string) ?? [],
						})),
				};
			}),
		);
	},
});

/**
 * List all threads for a document with nested comments, author info, and reactions.
 * Returns data shaped for the custom DocumentCommentsSidebar (includes author name/image).
 */
export const listThreadsWithAuthors = query({
	args: {
		documentId: v.id("documents"),
	},
	handler: async (ctx, args) => {
		const document = await ctx.db.get(args.documentId);
		if (!document || document.deletedAt) return [];
		await requireWorkspaceMember(ctx, document.workspaceId);

		const threads = await ctx.db
			.query("documentThreads")
			.withIndex("by_document", (q) => q.eq("documentId", args.documentId))
			.collect();

		return Promise.all(
			threads
				.filter((t) => !t.deletedAt)
				.map(async (thread) => {
					const comments = await ctx.db
						.query("documentComments")
						.withIndex("by_thread", (q) => q.eq("threadId", thread._id))
						.collect();

					const author = await ctx.db.get(thread.createdBy);
					let authorAvatarUrl: string | undefined;
					if (author?.avatarStorageId) {
						const url = await ctx.storage.getUrl(author.avatarStorageId);
						if (url) authorAvatarUrl = url;
					}

					const commentsWithAuthors = await Promise.all(
						comments
							.filter((c) => !c.deletedAt)
							.sort((a, b) => a._creationTime - b._creationTime)
							.map(async (comment) => {
								const commentAuthor = await ctx.db.get(comment.authorId);
								let commentAvatarUrl: string | undefined;
								if (commentAuthor?.avatarStorageId) {
									const url = await ctx.storage.getUrl(
										commentAuthor.avatarStorageId,
									);
									if (url) commentAvatarUrl = url;
								}
								return {
									_id: comment._id as string,
									body: comment.body,
									authorId: comment.authorId as string,
									author: commentAuthor
										? {
												name: commentAuthor.name ?? "Unknown",
												image: commentAvatarUrl ?? commentAuthor.image,
											}
										: { name: "Unknown", image: undefined },
									_creationTime: comment._creationTime,
									updatedAt: comment.updatedAt,
								};
							}),
					);

					// First comment is the root, rest are replies
					const rootComment = commentsWithAuthors[0];
					const replies = commentsWithAuthors.slice(1);

					return {
						_id: thread._id as string,
						resolved: thread.resolved,
						body: rootComment?.body ?? "",
						authorId: thread.createdBy as string,
						author: author
							? {
									name: author.name ?? "Unknown",
									image: authorAvatarUrl ?? author.image,
								}
							: { name: "Unknown", image: undefined },
						rootCommentId: rootComment?._id,
						replies,
						_creationTime: thread._creationTime,
					};
				}),
		);
	},
});

/**
 * Batch-fetch users by ID array, returning BlockNote User shape.
 */
export const resolveUsers = query({
	args: {
		userIds: v.array(v.string()),
	},
	handler: async (ctx, args) => {
		const users = await Promise.all(
			args.userIds.map(async (id) => {
				const user = await ctx.db.get(id as Id<"users">);
				if (!user) return null;
				return {
					id: user._id as string,
					username: user.name ?? user.email ?? "Unknown",
					avatarUrl: user.image ?? "",
				};
			}),
		);
		return users.filter(Boolean);
	},
});

// ── Mutations ───────────────────────────────────────────────────────────────

/**
 * Create a new thread with an initial comment.
 */
export const createThread = mutation({
	args: {
		documentId: v.id("documents"),
		initialCommentBody: v.string(),
		metadata: v.optional(v.string()),
		commentMetadata: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		const document = await ctx.db.get(args.documentId);
		if (!document || document.deletedAt) {
			throw new ConvexError("Document not found");
		}
		const { userId } = await requireWorkspaceMember(ctx, document.workspaceId);

		const threadId = await ctx.db.insert("documentThreads", {
			documentId: args.documentId,
			workspaceId: document.workspaceId,
			createdBy: userId,
			resolved: false,
			metadata: args.metadata,
		});

		const commentId = await ctx.db.insert("documentComments", {
			threadId,
			documentId: args.documentId,
			workspaceId: document.workspaceId,
			authorId: userId,
			body: args.initialCommentBody,
			metadata: args.commentMetadata,
		});

		await logActivity(ctx, {
			workspaceId: document.workspaceId,
			entityType: "comment",
			entityId: threadId,
			action: "created",
			actorId: userId,
			description: `started a comment thread on "${document.title}"`,
			documentId: args.documentId,
		});

		// Extract mentions and send notifications
		const mentionedIds = extractMentionedUserIds(args.initialCommentBody);
		const actor = await ctx.db.get(userId);
		const actorName = actor?.name ?? "Someone";
		for (const mentionedId of mentionedIds) {
			await createNotification(ctx, {
				userId: mentionedId as Id<"users">,
				workspaceId: document.workspaceId,
				type: "document_comment",
				title: `${actorName} mentioned you in a comment`,
				body: `In "${document.title}"`,
				documentId: args.documentId,
				actorId: userId,
			});
		}

		const thread = await ctx.db.get(threadId);
		const comment = await ctx.db.get(commentId);

		return { thread: thread!, comment: comment! };
	},
});

/**
 * Add a comment to an existing thread.
 */
export const addComment = mutation({
	args: {
		threadId: v.id("documentThreads"),
		body: v.string(),
		metadata: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		const thread = await ctx.db.get(args.threadId);
		if (!thread || thread.deletedAt) {
			throw new ConvexError("Thread not found");
		}
		const document = await ctx.db.get(thread.documentId);
		if (!document || document.deletedAt) {
			throw new ConvexError("Document not found");
		}
		const { userId } = await requireWorkspaceMember(ctx, thread.workspaceId);

		const commentId = await ctx.db.insert("documentComments", {
			threadId: args.threadId,
			documentId: thread.documentId,
			workspaceId: thread.workspaceId,
			authorId: userId,
			body: args.body,
			metadata: args.metadata,
		});

		// Notify thread creator when someone replies
		const actor = await ctx.db.get(userId);
		const actorName = actor?.name ?? "Someone";
		if (thread.createdBy !== userId) {
			await createNotification(ctx, {
				userId: thread.createdBy,
				workspaceId: thread.workspaceId,
				type: "document_comment",
				title: `${actorName} replied to your comment`,
				body: `In "${document.title}"`,
				documentId: thread.documentId,
				actorId: userId,
			});
		}

		// Also notify participants (other comment authors in the thread)
		const threadComments = await ctx.db
			.query("documentComments")
			.withIndex("by_thread", (q) => q.eq("threadId", args.threadId))
			.collect();
		const participantIds = new Set(
			threadComments
				.filter((c) => !c.deletedAt)
				.map((c) => c.authorId as string),
		);
		participantIds.delete(userId as string);
		participantIds.delete(thread.createdBy as string);
		for (const participantId of participantIds) {
			await createNotification(ctx, {
				userId: participantId as Id<"users">,
				workspaceId: thread.workspaceId,
				type: "document_comment",
				title: `${actorName} replied to a comment thread`,
				body: `In "${document.title}"`,
				documentId: thread.documentId,
				actorId: userId,
			});
		}

		// Extract mentions and send notifications
		const mentionedIds = extractMentionedUserIds(args.body);
		for (const mentionedId of mentionedIds) {
			if (
				mentionedId !== (userId as string) &&
				mentionedId !== (thread.createdBy as string) &&
				!participantIds.has(mentionedId)
			) {
				await createNotification(ctx, {
					userId: mentionedId as Id<"users">,
					workspaceId: thread.workspaceId,
					type: "document_comment",
					title: `${actorName} mentioned you in a comment`,
					body: `In "${document.title}"`,
					documentId: thread.documentId,
					actorId: userId,
				});
			}
		}

		const comment = await ctx.db.get(commentId);
		return comment!;
	},
});

/**
 * Update a comment's body. Author-only.
 */
export const updateComment = mutation({
	args: {
		commentId: v.id("documentComments"),
		body: v.string(),
		metadata: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		const comment = await ctx.db.get(args.commentId);
		if (!comment || comment.deletedAt) {
			throw new ConvexError("Comment not found");
		}
		const { userId } = await requireWorkspaceMember(ctx, comment.workspaceId);
		if (comment.authorId !== userId) {
			throw new ConvexError("Only the author can edit this comment");
		}

		await ctx.db.patch(args.commentId, {
			body: args.body,
			metadata: args.metadata,
			updatedAt: Date.now(),
		});
	},
});

/**
 * Soft-delete a comment. Author or editor can delete.
 */
export const softDeleteComment = mutation({
	args: {
		commentId: v.id("documentComments"),
	},
	handler: async (ctx, args) => {
		const comment = await ctx.db.get(args.commentId);
		if (!comment || comment.deletedAt) {
			throw new ConvexError("Comment not found");
		}
		await requireWorkspaceMember(ctx, comment.workspaceId);

		await ctx.db.patch(args.commentId, {
			deletedAt: Date.now(),
		});
	},
});

/**
 * Soft-delete a thread.
 */
export const softDeleteThread = mutation({
	args: {
		threadId: v.id("documentThreads"),
	},
	handler: async (ctx, args) => {
		const thread = await ctx.db.get(args.threadId);
		if (!thread || thread.deletedAt) {
			throw new ConvexError("Thread not found");
		}
		await requireWorkspaceMember(ctx, thread.workspaceId);

		await ctx.db.patch(args.threadId, {
			deletedAt: Date.now(),
		});
	},
});

/**
 * Resolve a thread.
 */
export const resolveThread = mutation({
	args: {
		threadId: v.id("documentThreads"),
	},
	handler: async (ctx, args) => {
		const thread = await ctx.db.get(args.threadId);
		if (!thread || thread.deletedAt) {
			throw new ConvexError("Thread not found");
		}
		const { userId } = await requireWorkspaceMember(ctx, thread.workspaceId);

		await ctx.db.patch(args.threadId, {
			resolved: true,
			resolvedBy: userId,
			resolvedAt: Date.now(),
		});
	},
});

/**
 * Unresolve a thread.
 */
export const unresolveThread = mutation({
	args: {
		threadId: v.id("documentThreads"),
	},
	handler: async (ctx, args) => {
		const thread = await ctx.db.get(args.threadId);
		if (!thread || thread.deletedAt) {
			throw new ConvexError("Thread not found");
		}
		await requireWorkspaceMember(ctx, thread.workspaceId);

		await ctx.db.patch(args.threadId, {
			resolved: false,
			resolvedBy: undefined,
			resolvedAt: undefined,
		});
	},
});

/**
 * Add a reaction to a comment.
 */
export const addReaction = mutation({
	args: {
		commentId: v.id("documentComments"),
		emoji: v.string(),
	},
	handler: async (ctx, args) => {
		const comment = await ctx.db.get(args.commentId);
		if (!comment || comment.deletedAt) {
			throw new ConvexError("Comment not found");
		}
		const { userId } = await requireWorkspaceMember(ctx, comment.workspaceId);

		// Check if user already reacted with this emoji
		const existing = await ctx.db
			.query("documentCommentReactions")
			.withIndex("by_comment", (q) => q.eq("commentId", args.commentId))
			.collect();
		const alreadyReacted = existing.some(
			(r) => r.userId === userId && r.emoji === args.emoji,
		);
		if (alreadyReacted) return;

		await ctx.db.insert("documentCommentReactions", {
			commentId: args.commentId,
			threadId: comment.threadId,
			userId,
			emoji: args.emoji,
		});
	},
});

/**
 * Remove a reaction from a comment.
 */
export const removeReaction = mutation({
	args: {
		commentId: v.id("documentComments"),
		emoji: v.string(),
	},
	handler: async (ctx, args) => {
		const comment = await ctx.db.get(args.commentId);
		if (!comment || comment.deletedAt) {
			throw new ConvexError("Comment not found");
		}
		const { userId } = await requireWorkspaceMember(ctx, comment.workspaceId);

		const reactions = await ctx.db
			.query("documentCommentReactions")
			.withIndex("by_comment", (q) => q.eq("commentId", args.commentId))
			.collect();
		const target = reactions.find(
			(r) => r.userId === userId && r.emoji === args.emoji,
		);
		if (target) {
			await ctx.db.delete(target._id);
		}
	},
});
