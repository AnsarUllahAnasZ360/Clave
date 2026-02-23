import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";
import { logActivity } from "./lib/activity";
import { requireAuth, requireWorkspaceMember } from "./lib/auth";
import { createNotification } from "./lib/notifications";

// ── Helpers ─────────────────────────────────────────────────────────────────

type TipTapMentionNode = {
	type?: string;
	text?: string;
	attrs?: { id?: string; entityType?: string; label?: string };
	content?: TipTapMentionNode[];
};

/** Extract user IDs from TipTap JSON mention nodes */
function extractMentionedUserIds(body: string): string[] {
	if (!body.startsWith("{")) return [];
	try {
		const doc = JSON.parse(body) as TipTapMentionNode;
		const ids: string[] = [];
		function walk(node: TipTapMentionNode) {
			if (
				node.type === "mention" &&
				node.attrs?.entityType === "user" &&
				node.attrs?.id
			) {
				ids.push(node.attrs.id);
			}
			if (node.content && Array.isArray(node.content)) {
				for (const child of node.content) walk(child);
			}
		}
		walk(doc);
		return ids;
	} catch {
		return [];
	}
}

/** Check if body contains an @AI mention node */
function hasAIMention(body: string): boolean {
	if (!body.startsWith("{")) return false;
	try {
		const doc = JSON.parse(body) as TipTapMentionNode;
		function walk(node: TipTapMentionNode): boolean {
			if (node.type === "mention" && node.attrs?.entityType === "ai") {
				return true;
			}
			if (node.content && Array.isArray(node.content)) {
				for (const child of node.content) {
					if (walk(child)) return true;
				}
			}
			return false;
		}
		return walk(doc);
	} catch {
		return false;
	}
}

type TipTapNode = { text?: string; content?: TipTapNode[] };

/** Extract plain text from a comment body */
function extractPlainText(body: string, maxLength = 100): string {
	if (body.startsWith("{")) {
		try {
			const doc = JSON.parse(body) as TipTapNode;
			const texts: string[] = [];
			function walk(node: TipTapNode) {
				if (node.text) texts.push(node.text);
				if (node.content && Array.isArray(node.content)) {
					for (const child of node.content) walk(child);
				}
			}
			walk(doc);
			const full = texts.join(" ");
			return full.length > maxLength
				? `${full.substring(0, maxLength)}...`
				: full;
		} catch {
			// Not valid JSON
		}
	}
	return body.length > maxLength ? `${body.substring(0, maxLength)}...` : body;
}

// ── Queries ────────────────────────────────────────────────────────────────

/**
 * List all comments for a whiteboard, grouped into threads.
 * Returns root comments (no parentId) with their replies nested.
 * Joins author data for display.
 */
export const listByWhiteboard = query({
	args: {
		whiteboardId: v.id("whiteboards"),
	},
	handler: async (ctx, args) => {
		const whiteboard = await ctx.db.get(args.whiteboardId);
		if (!whiteboard || whiteboard.deletedAt) return [];
		await requireWorkspaceMember(ctx, whiteboard.workspaceId);

		const comments = await ctx.db
			.query("comments")
			.withIndex("by_whiteboard", (q) =>
				q.eq("whiteboardId", args.whiteboardId),
			)
			.collect();

		// Separate root comments and replies
		const rootComments = comments.filter(
			(c) => !c.parentId && !c.deletedAt && c.canvasX !== undefined,
		);
		const allReplies = comments.filter((c) => c.parentId);

		// Build threads with author data
		const threads = await Promise.all(
			rootComments.map(async (root) => {
				const author = await ctx.db.get(root.authorId);
				const replies = allReplies
					.filter((r) => r.parentId === root._id && !r.deletedAt)
					.sort((a, b) => a._creationTime - b._creationTime);

				const repliesWithAuthors = await Promise.all(
					replies.map(async (reply) => {
						const replyAuthor = await ctx.db.get(reply.authorId);
						let replyAvatarUrl: string | undefined;
						if (replyAuthor?.avatarStorageId) {
							const url = await ctx.storage.getUrl(replyAuthor.avatarStorageId);
							if (url) replyAvatarUrl = url;
						}
						return {
							...reply,
							author: replyAuthor
								? {
										name: replyAuthor.name ?? "Unknown",
										image: replyAvatarUrl ?? replyAuthor.image,
									}
								: { name: "Unknown", image: undefined },
						};
					}),
				);

				let authorAvatarUrl: string | undefined;
				if (author?.avatarStorageId) {
					const url = await ctx.storage.getUrl(author.avatarStorageId);
					if (url) authorAvatarUrl = url;
				}
				return {
					...root,
					author: author
						? {
								name: author.name ?? "Unknown",
								image: authorAvatarUrl ?? author.image,
							}
						: { name: "Unknown", image: undefined },
					replies: repliesWithAuthors,
				};
			}),
		);

		// Sort by creation time ascending
		return threads.sort((a, b) => a._creationTime - b._creationTime);
	},
});

// ── Mutations ──────────────────────────────────────────────────────────────

/**
 * Create a new comment thread anchored to canvas coordinates.
 */
export const createThread = mutation({
	args: {
		whiteboardId: v.id("whiteboards"),
		canvasX: v.float64(),
		canvasY: v.float64(),
		elementId: v.optional(v.string()),
		body: v.string(),
	},
	handler: async (ctx, args) => {
		const whiteboard = await ctx.db.get(args.whiteboardId);
		if (!whiteboard || whiteboard.deletedAt) {
			throw new ConvexError("Whiteboard not found");
		}
		const { userId } = await requireWorkspaceMember(
			ctx,
			whiteboard.workspaceId,
		);

		const commentId = await ctx.db.insert("comments", {
			whiteboardId: args.whiteboardId,
			canvasX: args.canvasX,
			canvasY: args.canvasY,
			elementId: args.elementId,
			body: args.body,
			authorId: userId,
			resolved: false,
		});

		// Activity log
		await logActivity(ctx, {
			workspaceId: whiteboard.workspaceId,
			entityType: "comment",
			entityId: commentId,
			action: "created",
			actorId: userId,
			description: `commented on whiteboard "${whiteboard.title}"`,
			whiteboardId: args.whiteboardId,
			projectId: whiteboard.projectId ?? undefined,
		});

		// Parse @mentions and send notifications
		const actor = await ctx.db.get(userId);
		const actorName = actor?.name ?? "Someone";
		const preview = extractPlainText(args.body);

		const mentionedIds = extractMentionedUserIds(args.body);
		for (const mentionedId of mentionedIds) {
			const mentionedUserId = mentionedId as Id<"users">;
			await createNotification(ctx, {
				userId: mentionedUserId,
				workspaceId: whiteboard.workspaceId,
				type: "comment",
				title: `${actorName} mentioned you on "${whiteboard.title}"`,
				body: preview,
				whiteboardId: args.whiteboardId,
				commentId,
				actorId: userId,
			});
		}

		// Schedule AI mention handler if @AI was mentioned
		if (hasAIMention(args.body)) {
			await ctx.scheduler.runAfter(0, internal.ai.embedded.handleAIMention, {
				commentId,
				workspaceId: whiteboard.workspaceId,
				whiteboardId: args.whiteboardId,
				commentBody: args.body,
			});
		}

		return commentId;
	},
});

/**
 * Add a reply to a whiteboard comment thread.
 */
export const addReply = mutation({
	args: {
		parentId: v.id("comments"),
		body: v.string(),
	},
	handler: async (ctx, args) => {
		const parent = await ctx.db.get(args.parentId);
		if (!parent || parent.deletedAt || !parent.whiteboardId) {
			throw new ConvexError("Parent comment not found");
		}

		// Normalize to one-level threading
		const rootId = parent.parentId ?? parent._id;

		const whiteboard = await ctx.db.get(parent.whiteboardId);
		if (!whiteboard || whiteboard.deletedAt) {
			throw new ConvexError("Whiteboard not found");
		}
		const { userId } = await requireWorkspaceMember(
			ctx,
			whiteboard.workspaceId,
		);

		const commentId = await ctx.db.insert("comments", {
			whiteboardId: parent.whiteboardId,
			parentId: rootId,
			body: args.body,
			authorId: userId,
		});

		// Activity log
		await logActivity(ctx, {
			workspaceId: whiteboard.workspaceId,
			entityType: "comment",
			entityId: commentId,
			action: "created",
			actorId: userId,
			description: `replied to a comment on "${whiteboard.title}"`,
			whiteboardId: parent.whiteboardId,
			projectId: whiteboard.projectId ?? undefined,
		});

		// Notify thread creator
		const root = rootId === parent._id ? parent : await ctx.db.get(rootId);
		const actor = await ctx.db.get(userId);
		const actorName = actor?.name ?? "Someone";
		const preview = extractPlainText(args.body);

		const notifiedUserIds = new Set<string>();

		if (root && root.authorId !== userId) {
			notifiedUserIds.add(root.authorId);
			await createNotification(ctx, {
				userId: root.authorId,
				workspaceId: whiteboard.workspaceId,
				type: "comment",
				title: `${actorName} replied to your comment on "${whiteboard.title}"`,
				body: preview,
				whiteboardId: parent.whiteboardId,
				commentId,
				actorId: userId,
			});
		}

		// Notify @mentioned users
		const mentionedIds = extractMentionedUserIds(args.body);
		for (const mentionedId of mentionedIds) {
			const mentionedUserId = mentionedId as Id<"users">;
			if (!notifiedUserIds.has(mentionedUserId)) {
				notifiedUserIds.add(mentionedUserId);
				await createNotification(ctx, {
					userId: mentionedUserId,
					workspaceId: whiteboard.workspaceId,
					type: "comment",
					title: `${actorName} mentioned you on "${whiteboard.title}"`,
					body: preview,
					whiteboardId: parent.whiteboardId,
					commentId,
					actorId: userId,
				});
			}
		}

		// Schedule AI mention handler if @AI was mentioned
		if (hasAIMention(args.body)) {
			await ctx.scheduler.runAfter(0, internal.ai.embedded.handleAIMention, {
				commentId,
				workspaceId: whiteboard.workspaceId,
				whiteboardId: parent.whiteboardId,
				parentId: rootId,
				commentBody: args.body,
			});
		}

		return commentId;
	},
});

/**
 * Resolve a comment thread.
 */
export const resolve = mutation({
	args: {
		commentId: v.id("comments"),
	},
	handler: async (ctx, args) => {
		const comment = await ctx.db.get(args.commentId);
		if (!comment || comment.deletedAt || !comment.whiteboardId) {
			throw new ConvexError("Comment not found");
		}
		if (comment.parentId) {
			throw new ConvexError("Can only resolve root comments");
		}

		const whiteboard = await ctx.db.get(comment.whiteboardId);
		if (!whiteboard) throw new ConvexError("Whiteboard not found");
		const { userId } = await requireWorkspaceMember(
			ctx,
			whiteboard.workspaceId,
		);

		await ctx.db.patch(args.commentId, {
			resolved: true,
			resolvedBy: userId,
			resolvedAt: Date.now(),
		});
	},
});

/**
 * Unresolve a comment thread.
 */
export const unresolve = mutation({
	args: {
		commentId: v.id("comments"),
	},
	handler: async (ctx, args) => {
		const comment = await ctx.db.get(args.commentId);
		if (!comment || comment.deletedAt || !comment.whiteboardId) {
			throw new ConvexError("Comment not found");
		}
		if (comment.parentId) {
			throw new ConvexError("Can only unresolve root comments");
		}

		const whiteboard = await ctx.db.get(comment.whiteboardId);
		if (!whiteboard) throw new ConvexError("Whiteboard not found");
		await requireWorkspaceMember(ctx, whiteboard.workspaceId);

		await ctx.db.patch(args.commentId, {
			resolved: false,
			resolvedBy: undefined,
			resolvedAt: undefined,
		});
	},
});

/**
 * Update a comment body (author-only).
 */
export const update = mutation({
	args: {
		commentId: v.id("comments"),
		body: v.string(),
	},
	handler: async (ctx, args) => {
		const comment = await ctx.db.get(args.commentId);
		if (!comment || comment.deletedAt) {
			throw new ConvexError("Comment not found");
		}
		const userId = await requireAuth(ctx);
		if (comment.authorId !== userId) {
			throw new ConvexError("Only the author can edit this comment");
		}
		await ctx.db.patch(args.commentId, {
			body: args.body,
			updatedAt: Date.now(),
		});
	},
});

/**
 * Soft-delete a comment (author-only).
 */
export const remove = mutation({
	args: {
		commentId: v.id("comments"),
	},
	handler: async (ctx, args) => {
		const comment = await ctx.db.get(args.commentId);
		if (!comment || comment.deletedAt) {
			throw new ConvexError("Comment not found");
		}
		const userId = await requireAuth(ctx);
		if (comment.authorId !== userId) {
			throw new ConvexError("Only the author can delete this comment");
		}
		await ctx.db.patch(args.commentId, {
			deletedAt: Date.now(),
		});
	},
});
