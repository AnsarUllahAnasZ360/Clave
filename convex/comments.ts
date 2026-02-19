import { ConvexError, v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";
import { logActivity } from "./lib/activity";
import { requireAuth, requireWorkspaceMember } from "./lib/auth";
import { createNotification, notifySubscribers } from "./lib/notifications";

// ── Helpers ─────────────────────────────────────────────────────────────────

type TipTapNode = { text?: string; content?: TipTapNode[] };

/** Extract plain text from a comment body (TipTap JSON or plain text) */
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
			// Not valid JSON, treat as plain text
		}
	}
	return body.length > maxLength ? `${body.substring(0, maxLength)}...` : body;
}

/** Get full plain text from body for @mention regex matching */
function getBodyText(body: string): string {
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
			return texts.join(" ");
		} catch {
			// Not valid JSON
		}
	}
	return body;
}

type TipTapMentionNode = TipTapNode & {
	type?: string;
	attrs?: { id?: string; entityType?: string; label?: string };
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
				for (const child of node.content) walk(child as TipTapMentionNode);
			}
		}
		walk(doc);
		return ids;
	} catch {
		return [];
	}
}

// ── Shared Return Validators ────────────────────────────────────────────────

const commentAuthorValidator = v.object({
	name: v.string(),
	image: v.optional(v.string()),
});

const commentBaseFields = {
	_id: v.id("comments"),
	_creationTime: v.number(),
	issueId: v.optional(v.id("issues")),
	taskId: v.optional(v.id("tasks")),
	storyId: v.optional(v.id("stories")),
	whiteboardId: v.optional(v.id("whiteboards")),
	parentId: v.optional(v.id("comments")),
	body: v.string(),
	authorId: v.id("users"),
	attachmentIds: v.optional(v.array(v.id("files"))),
	updatedAt: v.optional(v.number()),
	deletedAt: v.optional(v.number()),
	canvasX: v.optional(v.number()),
	canvasY: v.optional(v.number()),
	elementId: v.optional(v.string()),
	resolved: v.optional(v.boolean()),
	resolvedBy: v.optional(v.id("users")),
	resolvedAt: v.optional(v.number()),
};

// ── Queries ────────────────────────────────────────────────────────────────

/**
 * List all non-deleted comments for an issue, sorted by creation time ascending.
 * Joins author data (name, image) for display.
 * Also includes soft-deleted comments that have active replies (for placeholder).
 */
export const listByIssue = query({
	args: {
		issueId: v.id("issues"),
	},
	returns: v.array(
		v.object({
			...commentBaseFields,
			author: commentAuthorValidator,
			attachments: v.array(
				v.object({
					_id: v.id("files"),
					name: v.string(),
					mimeType: v.optional(v.string()),
					url: v.union(v.string(), v.null()),
				}),
			),
		}),
	),
	handler: async (ctx, args) => {
		const issue = await ctx.db.get(args.issueId);
		if (!issue || issue.deletedAt) return [];
		await requireWorkspaceMember(ctx, issue.workspaceId);

		const comments = await ctx.db
			.query("comments")
			.withIndex("by_issue", (q) => q.eq("issueId", args.issueId))
			.collect();

		const active = comments.filter((c) => !c.deletedAt);
		const deleted = comments.filter((c) => c.deletedAt);
		const deletedWithReplies = deleted.filter((d) =>
			active.some((c) => c.parentId === d._id),
		);

		const allComments = [...active, ...deletedWithReplies].sort(
			(a, b) => a._creationTime - b._creationTime,
		);

		return Promise.all(
			allComments.map(async (comment) => {
				const author = await ctx.db.get(comment.authorId);
				let avatarUrl: string | undefined;
				if (author?.avatarStorageId) {
					const url = await ctx.storage.getUrl(author.avatarStorageId);
					if (url) avatarUrl = url;
				}
				// Resolve attachment file data
				const rawAttachments = comment.attachmentIds
					? await Promise.all(
							comment.attachmentIds.map(async (fileId) => {
								const file = await ctx.db.get(fileId);
								if (!file || file.deletedAt) return null;
								const url = file.storageId
									? await ctx.storage.getUrl(file.storageId)
									: (file.externalUrl ?? null);
								return {
									_id: file._id,
									name: file.name,
									mimeType: file.mimeType,
									url,
								};
							}),
						)
					: [];
				const attachments = rawAttachments.filter(
					(a): a is NonNullable<typeof a> => a !== null,
				);
				return {
					...comment,
					author: author
						? {
								name: author.name ?? "Unknown",
								image: avatarUrl ?? author.image,
							}
						: { name: "Unknown", image: undefined },
					attachments: attachments.filter(Boolean),
				};
			}),
		);
	},
});

/**
 * List all non-deleted comments for a task, sorted by creation time ascending.
 * Joins author data (name, image) for display.
 * Also includes soft-deleted comments that have active replies (for placeholder).
 */
export const listByTask = query({
	args: {
		taskId: v.id("tasks"),
	},
	returns: v.array(
		v.object({
			...commentBaseFields,
			author: commentAuthorValidator,
		}),
	),
	handler: async (ctx, args) => {
		const task = await ctx.db.get(args.taskId);
		if (!task || task.deletedAt) return [];
		await requireWorkspaceMember(ctx, task.workspaceId);

		const comments = await ctx.db
			.query("comments")
			.withIndex("by_task", (q) => q.eq("taskId", args.taskId))
			.collect();

		const active = comments.filter((c) => !c.deletedAt);

		// Include soft-deleted comments that have active replies (for placeholder display)
		const deleted = comments.filter((c) => c.deletedAt);
		const deletedWithReplies = deleted.filter((d) =>
			active.some((c) => c.parentId === d._id),
		);

		const allComments = [...active, ...deletedWithReplies].sort(
			(a, b) => a._creationTime - b._creationTime,
		);

		// Join author data
		return Promise.all(
			allComments.map(async (comment) => {
				const author = await ctx.db.get(comment.authorId);
				let avatarUrl: string | undefined;
				if (author?.avatarStorageId) {
					const url = await ctx.storage.getUrl(author.avatarStorageId);
					if (url) avatarUrl = url;
				}
				return {
					...comment,
					author: author
						? {
								name: author.name ?? "Unknown",
								image: avatarUrl ?? author.image,
							}
						: { name: "Unknown", image: undefined },
				};
			}),
		);
	},
});

/**
 * List all non-deleted comments for a story, sorted by creation time ascending.
 */
export const listByStory = query({
	args: {
		storyId: v.id("stories"),
	},
	returns: v.array(
		v.object({
			...commentBaseFields,
			author: commentAuthorValidator,
		}),
	),
	handler: async (ctx, args) => {
		const story = await ctx.db.get(args.storyId);
		if (!story || story.deletedAt) return [];
		await requireWorkspaceMember(ctx, story.workspaceId);

		const comments = await ctx.db
			.query("comments")
			.withIndex("by_story", (q) => q.eq("storyId", args.storyId))
			.collect();

		const active = comments.filter((c) => !c.deletedAt);
		const deleted = comments.filter((c) => c.deletedAt);
		const deletedWithReplies = deleted.filter((d) =>
			active.some((c) => c.parentId === d._id),
		);

		const allComments = [...active, ...deletedWithReplies].sort(
			(a, b) => a._creationTime - b._creationTime,
		);

		return Promise.all(
			allComments.map(async (comment) => {
				const author = await ctx.db.get(comment.authorId);
				let avatarUrl: string | undefined;
				if (author?.avatarStorageId) {
					const url = await ctx.storage.getUrl(author.avatarStorageId);
					if (url) avatarUrl = url;
				}
				return {
					...comment,
					author: author
						? {
								name: author.name ?? "Unknown",
								image: avatarUrl ?? author.image,
							}
						: { name: "Unknown", image: undefined },
				};
			}),
		);
	},
});

// ── Mutations ──────────────────────────────────────────────────────────────

/**
 * Create a new comment on an issue, task, or story.
 * Triggers notifications to assignee and @mentioned users.
 */
export const create = mutation({
	args: {
		issueId: v.optional(v.id("issues")),
		taskId: v.optional(v.id("tasks")),
		storyId: v.optional(v.id("stories")),
		parentId: v.optional(v.id("comments")),
		body: v.string(),
		attachmentIds: v.optional(v.array(v.id("files"))),
	},
	returns: v.id("comments"),
	handler: async (ctx, args) => {
		if (!args.issueId && !args.taskId && !args.storyId) {
			throw new ConvexError("issueId, taskId, or storyId is required");
		}

		// Determine workspace from issue, task, or story
		let workspaceId: Id<"workspaces">;
		let entityTitle: string;
		let entityAssigneeId: Id<"users"> | undefined;
		let projectId: Id<"projects"> | undefined;

		if (args.issueId) {
			const issue = await ctx.db.get(args.issueId);
			if (!issue || issue.deletedAt) throw new ConvexError("Issue not found");
			workspaceId = issue.workspaceId;
			entityTitle = issue.title;
			entityAssigneeId = issue.assigneeId;
			projectId = issue.projectId;
		} else if (args.taskId) {
			const task = await ctx.db.get(args.taskId);
			if (!task || task.deletedAt) throw new ConvexError("Task not found");
			workspaceId = task.workspaceId;
			entityTitle = task.title;
			entityAssigneeId = task.assigneeId;
			projectId = task.projectId ?? undefined;
		} else {
			const story = await ctx.db.get(args.storyId!);
			if (!story || story.deletedAt) throw new ConvexError("Story not found");
			workspaceId = story.workspaceId;
			entityTitle = story.title;
			entityAssigneeId = story.assigneeId;
			projectId = story.projectId ?? undefined;
		}

		const { userId } = await requireWorkspaceMember(ctx, workspaceId);

		// If replying to a comment, normalize to one-level threading
		let effectiveParentId = args.parentId;
		if (effectiveParentId) {
			const parent = await ctx.db.get(effectiveParentId);
			if (parent?.parentId) {
				effectiveParentId = parent.parentId;
			}
		}

		const commentId = await ctx.db.insert("comments", {
			issueId: args.issueId,
			taskId: args.taskId,
			storyId: args.storyId,
			parentId: effectiveParentId,
			body: args.body,
			authorId: userId,
			attachmentIds: args.attachmentIds,
		});

		// Activity log
		await logActivity(ctx, {
			workspaceId,
			entityType: "comment",
			entityId: commentId,
			action: "created",
			actorId: userId,
			description: `commented on "${entityTitle}"`,
			issueId: args.issueId,
			taskId: args.taskId,
			storyId: args.storyId,
			projectId,
		});

		// Notifications
		const actor = await ctx.db.get(userId);
		const actorName = actor?.name ?? "Someone";
		const preview = extractPlainText(args.body);

		// For issues, notify all subscribers; for tasks/stories, notify assignee
		if (args.issueId) {
			await notifySubscribers(ctx, args.issueId, {
				workspaceId,
				type: "comment",
				title: `New comment on "${entityTitle}"`,
				body: `${actorName} commented: ${preview}`,
				issueId: args.issueId,
				commentId,
				projectId,
				actorId: userId,
			});
		} else if (entityAssigneeId) {
			await createNotification(ctx, {
				userId: entityAssigneeId,
				workspaceId,
				type: "comment",
				title: `New comment on "${entityTitle}"`,
				body: `${actorName} commented: ${preview}`,
				taskId: args.taskId,
				storyId: args.storyId,
				commentId,
				actorId: userId,
			});
		}

		// Parse @mentions from body
		// 1. TipTap JSON: extract mention nodes with entityType=user
		const tiptapMentionIds = extractMentionedUserIds(args.body);
		for (const mentionedId of tiptapMentionIds) {
			const mentionedUserId = mentionedId as Id<"users">;
			if (
				mentionedUserId !== (userId as string) &&
				mentionedUserId !== (entityAssigneeId as string | undefined)
			) {
				await createNotification(ctx, {
					userId: mentionedUserId,
					workspaceId,
					type: args.issueId ? "issue_mentioned" : "comment",
					title: `${actorName} mentioned you`,
					body: `In "${entityTitle}": ${preview}`,
					issueId: args.issueId,
					taskId: args.taskId,
					storyId: args.storyId,
					commentId,
					actorId: userId,
				});
			}
		}

		// 2. Legacy plain text: @[Name](userId) regex
		if (tiptapMentionIds.length === 0) {
			const bodyText = getBodyText(args.body);
			const mentionRegex = /@\[([^\]]+)\]\(([^)]+)\)/g;
			let match = mentionRegex.exec(bodyText);
			while (match !== null) {
				const mentionedUserId = match[2] as Id<"users">;
				if (
					mentionedUserId !== (userId as string) &&
					mentionedUserId !== (entityAssigneeId as string | undefined)
				) {
					await createNotification(ctx, {
						userId: mentionedUserId,
						workspaceId,
						type: args.issueId ? "issue_mentioned" : "comment",
						title: `${actorName} mentioned you`,
						body: `In "${entityTitle}": ${preview}`,
						issueId: args.issueId,
						taskId: args.taskId,
						storyId: args.storyId,
						commentId,
						actorId: userId,
					});
				}
				match = mentionRegex.exec(bodyText);
			}
		}

		return commentId;
	},
});

/**
 * Update a comment's body. Only the author can edit.
 */
export const update = mutation({
	args: {
		commentId: v.id("comments"),
		body: v.string(),
	},
	returns: v.null(),
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
 * Soft-delete a comment. Only the author can delete.
 */
export const remove = mutation({
	args: {
		commentId: v.id("comments"),
	},
	returns: v.null(),
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
