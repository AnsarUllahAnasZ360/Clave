import { ConvexError, v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { internalMutation, mutation, query } from "./_generated/server";
import { requireWorkspaceMember } from "./lib/auth";
import { createNotification } from "./lib/notifications";

// ── Helpers ──────────────────────────────────────────────────────────────────

type TipTapNode = { text?: string; content?: TipTapNode[] };

/** Extract plain text from a TipTap JSON body string, falling back to raw string */
function extractTextFromTipTap(body: string): string {
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
			// Not valid JSON, return as-is
		}
	}
	return body;
}

type NotificationType =
	// Issue-centric types (preferred)
	| "issue_assigned"
	| "issue_status_changed"
	| "issue_mentioned"
	| "issue_due_soon"
	| "issue_overdue"
	| "issue_stale"
	// General types
	| "comment"
	| "project_update"
	| "client_update"
	| "system"
	// Document and whiteboard types
	| "document_update"
	| "document_comment"
	| "whiteboard_update"
	// DEPRECATED -- old story/task types kept for backward compatibility
	| "story_assigned"
	| "story_status_changed"
	| "story_mentioned"
	| "task_assigned"
	| "task_status_changed";

/** Map backend notification type to UI display category */
function toDisplayType(
	type: NotificationType,
): "comment" | "task" | "client" | "project" | "system" {
	if (type === "comment" || type === "document_comment") return "comment";
	if (
		type === "issue_assigned" ||
		type === "issue_status_changed" ||
		type === "issue_mentioned" ||
		type === "issue_due_soon" ||
		type === "issue_overdue" ||
		type === "issue_stale" ||
		type === "story_assigned" ||
		type === "story_status_changed" ||
		type === "story_mentioned" ||
		type === "task_assigned" ||
		type === "task_status_changed"
	)
		return "task";
	if (type === "client_update") return "client";
	if (
		type === "project_update" ||
		type === "document_update" ||
		type === "whiteboard_update"
	)
		return "project";
	return "system";
}

/** Check if a notification is currently snoozed */
function isSnoozed(n: { snoozedUntil?: number }): boolean {
	return n.snoozedUntil !== undefined && n.snoozedUntil > Date.now();
}

// ── Queries ─────────────────────────────────────────────────────────────────

export const list = query({
	args: {
		workspaceId: v.id("workspaces"),
		filter: v.optional(
			v.union(v.literal("all"), v.literal("unread"), v.literal("read")),
		),
		types: v.optional(
			v.array(
				v.union(
					v.literal("comment"),
					v.literal("task"),
					v.literal("client"),
					v.literal("project"),
					v.literal("system"),
				),
			),
		),
		limit: v.optional(v.number()),
		cursor: v.optional(v.number()),
	},
	returns: v.object({
		notifications: v.array(
			v.object({
				_id: v.id("notifications"),
				_creationTime: v.number(),
				userId: v.id("users"),
				workspaceId: v.id("workspaces"),
				type: v.string(),
				eventType: v.optional(v.string()),
				title: v.string(),
				body: v.optional(v.string()),
				preview: v.optional(v.string()),
				isRead: v.boolean(),
				readAt: v.optional(v.number()),
				isArchived: v.optional(v.boolean()),
				deletedAt: v.optional(v.number()),
				snoozedUntil: v.optional(v.number()),
				actorId: v.optional(v.id("users")),
				projectId: v.optional(v.id("projects")),
				clientId: v.optional(v.id("clients")),
				issueId: v.optional(v.id("issues")),
				taskId: v.optional(v.id("tasks")),
				storyId: v.optional(v.id("stories")),
				documentId: v.optional(v.id("documents")),
				whiteboardId: v.optional(v.id("whiteboards")),
				commentId: v.optional(v.id("comments")),
				entityType: v.optional(v.string()),
				entityId: v.optional(v.string()),
				reason: v.optional(v.string()),
				eventAt: v.optional(v.number()),
				source: v.optional(v.string()),
				dedupeKey: v.optional(v.string()),
				displayType: v.string(),
				actorName: v.union(v.string(), v.null()),
				actorImage: v.union(v.string(), v.null()),
				projectName: v.union(v.string(), v.null()),
				projectSlug: v.union(v.string(), v.null()),
				clientName: v.union(v.string(), v.null()),
				issueIdentifier: v.union(v.string(), v.null()),
				issueTitle: v.union(v.string(), v.null()),
				issueStatus: v.union(v.string(), v.null()),
				issuePriority: v.union(v.string(), v.null()),
				issueAssigneeId: v.union(v.id("users"), v.null()),
				issueLabelIds: v.union(v.array(v.id("labels")), v.null()),
				taskIdentifier: v.union(v.string(), v.null()),
				storyIdentifier: v.union(v.string(), v.null()),
				documentTitle: v.union(v.string(), v.null()),
				whiteboardTitle: v.union(v.string(), v.null()),
				commentBody: v.union(v.string(), v.null()),
			}),
		),
		hasMore: v.boolean(),
		nextCursor: v.optional(v.number()),
	}),
	handler: async (ctx, args) => {
		const { userId } = await requireWorkspaceMember(ctx, args.workspaceId);
		const limit = args.limit ?? 50;
		const filter = args.filter ?? "all";
		const cursor = args.cursor;

		// Build query based on filter
		const buildQuery = () => {
			if (filter === "unread") {
				return ctx.db
					.query("notifications")
					.withIndex("by_user_workspace_unread", (idx) =>
						idx
							.eq("userId", userId)
							.eq("workspaceId", args.workspaceId)
							.eq("isRead", false),
					)
					.order("desc");
			}
			if (filter === "read") {
				return ctx.db
					.query("notifications")
					.withIndex("by_user_workspace_unread", (idx) =>
						idx
							.eq("userId", userId)
							.eq("workspaceId", args.workspaceId)
							.eq("isRead", true),
					)
					.order("desc");
			}
			return ctx.db
				.query("notifications")
				.withIndex("by_user_workspace", (idx) =>
					idx.eq("userId", userId).eq("workspaceId", args.workspaceId),
				)
				.order("desc");
		};

		// Fetch more to account for filtering; cursor and extra filters are applied in memory.
		const raw = await buildQuery().take(200);

		// Filter out archived, deleted, and snoozed
		let filtered = raw.filter(
			(n) =>
				!n.isArchived &&
				!n.deletedAt &&
				!isSnoozed(n) &&
				(cursor === undefined || n._creationTime < cursor),
		);

		// Filter by display types
		if (args.types && args.types.length > 0) {
			const typeSet = new Set(args.types);
			filtered = filtered.filter((n) =>
				typeSet.has(toDisplayType(n.type as NotificationType)),
			);
		}

		const hasMore = filtered.length > limit;
		const page = hasMore ? filtered.slice(0, limit) : filtered;

		// Batch-fetch: collect unique entity IDs across the page
		const actorIds = new Set<string>();
		const projectIds = new Set<string>();
		const clientIds = new Set<string>();
		const issueIds = new Set<string>();
		const taskIds = new Set<string>();
		const storyIds = new Set<string>();
		const documentIds = new Set<string>();
		const whiteboardIds = new Set<string>();
		const commentIds = new Set<string>();
		for (const n of page) {
			if (n.actorId) actorIds.add(n.actorId);
			if (n.projectId) projectIds.add(n.projectId);
			if (n.clientId) clientIds.add(n.clientId);
			if (n.issueId) issueIds.add(n.issueId);
			if (n.taskId) taskIds.add(n.taskId);
			if (n.storyId) storyIds.add(n.storyId);
			if (n.documentId) documentIds.add(n.documentId);
			if (n.whiteboardId) whiteboardIds.add(n.whiteboardId);
			if (n.commentId) commentIds.add(n.commentId);
		}

		// Parallel batch-fetch all entity types
		const [
			actorResults,
			projectResults,
			clientResults,
			issueResults,
			taskResults,
			storyResults,
			documentResults,
			whiteboardResults,
			commentResults,
		] = await Promise.all([
			Promise.all([...actorIds].map((id) => ctx.db.get(id as Id<"users">))),
			Promise.all(
				[...projectIds].map((id) => ctx.db.get(id as Id<"projects">)),
			),
			Promise.all([...clientIds].map((id) => ctx.db.get(id as Id<"clients">))),
			Promise.all([...issueIds].map((id) => ctx.db.get(id as Id<"issues">))),
			Promise.all([...taskIds].map((id) => ctx.db.get(id as Id<"tasks">))),
			Promise.all([...storyIds].map((id) => ctx.db.get(id as Id<"stories">))),
			Promise.all(
				[...documentIds].map((id) => ctx.db.get(id as Id<"documents">)),
			),
			Promise.all(
				[...whiteboardIds].map((id) => ctx.db.get(id as Id<"whiteboards">)),
			),
			Promise.all(
				[...commentIds].map((id) => ctx.db.get(id as Id<"comments">)),
			),
		]);

		// Build lookup maps
		const actorMap = new Map(
			[...actorIds].map((id, i) => [id, actorResults[i]]),
		);
		const projectMap = new Map(
			[...projectIds].map((id, i) => [id, projectResults[i]]),
		);
		const clientMap = new Map(
			[...clientIds].map((id, i) => [id, clientResults[i]]),
		);
		const issueMap = new Map(
			[...issueIds].map((id, i) => [id, issueResults[i]]),
		);
		const taskMap = new Map([...taskIds].map((id, i) => [id, taskResults[i]]));
		const storyMap = new Map(
			[...storyIds].map((id, i) => [id, storyResults[i]]),
		);
		const documentMap = new Map(
			[...documentIds].map((id, i) => [id, documentResults[i]]),
		);
		const whiteboardMap = new Map(
			[...whiteboardIds].map((id, i) => [id, whiteboardResults[i]]),
		);
		const commentMap = new Map(
			[...commentIds].map((id, i) => [id, commentResults[i]]),
		);

		// Resolve actor avatar URLs in parallel
		const actorAvatarUrls = new Map<string, string | null>();
		const avatarEntries = [...actorMap.entries()].filter(
			(entry): entry is [string, NonNullable<(typeof actorResults)[number]>] =>
				entry[1]?.avatarStorageId !== undefined,
		);
		const avatarUrlResults = await Promise.all(
			avatarEntries.map(([, actor]) => {
				const avatarStorageId = actor.avatarStorageId;
				if (!avatarStorageId) return null;
				return ctx.storage.getUrl(avatarStorageId);
			}),
		);
		for (let i = 0; i < avatarEntries.length; i++) {
			actorAvatarUrls.set(avatarEntries[i][0], avatarUrlResults[i]);
		}

		// Enrich using lookup maps
		const enriched = page.map((n) => {
			const actor = n.actorId ? (actorMap.get(n.actorId) ?? null) : null;
			const project = n.projectId
				? (projectMap.get(n.projectId) ?? null)
				: null;
			const client = n.clientId ? (clientMap.get(n.clientId) ?? null) : null;
			const issue = n.issueId ? (issueMap.get(n.issueId) ?? null) : null;
			const task = n.taskId ? (taskMap.get(n.taskId) ?? null) : null;
			const story = n.storyId ? (storyMap.get(n.storyId) ?? null) : null;
			const document = n.documentId
				? (documentMap.get(n.documentId) ?? null)
				: null;
			const whiteboard = n.whiteboardId
				? (whiteboardMap.get(n.whiteboardId) ?? null)
				: null;
			const comment = n.commentId
				? (commentMap.get(n.commentId) ?? null)
				: null;

			return {
				...n,
				displayType: toDisplayType(n.type as NotificationType),
				actorName: actor?.name ?? null,
				actorImage:
					(n.actorId ? (actorAvatarUrls.get(n.actorId) ?? null) : null) ??
					actor?.image ??
					null,
				projectName: project?.name ?? null,
				projectSlug: project?.slug ?? null,
				clientName: client?.name ?? null,
				issueIdentifier: issue?.identifier ?? null,
				issueTitle: issue?.title ?? null,
				issueStatus: issue?.status ?? null,
				issuePriority: issue?.priority ?? null,
				issueAssigneeId: issue?.assigneeId ?? null,
				issueLabelIds: issue?.labelIds ?? null,
				taskIdentifier: task?.identifier ?? null,
				storyIdentifier: story?.identifier ?? null,
				documentTitle: document?.title ?? null,
				whiteboardTitle: whiteboard?.title ?? null,
				commentBody:
					comment && !comment.deletedAt
						? extractTextFromTipTap(comment.body)
						: null,
			};
		});

		return {
			notifications: enriched,
			hasMore,
			nextCursor:
				hasMore && page.length > 0
					? page[page.length - 1]._creationTime
					: undefined,
		};
	},
});

export const listSnoozed = query({
	args: {
		workspaceId: v.id("workspaces"),
		limit: v.optional(v.number()),
	},
	returns: v.object({
		notifications: v.array(
			v.object({
				_id: v.id("notifications"),
				_creationTime: v.number(),
				userId: v.id("users"),
				workspaceId: v.id("workspaces"),
				type: v.string(),
				eventType: v.optional(v.string()),
				title: v.string(),
				body: v.optional(v.string()),
				preview: v.optional(v.string()),
				isRead: v.boolean(),
				readAt: v.optional(v.number()),
				isArchived: v.optional(v.boolean()),
				deletedAt: v.optional(v.number()),
				snoozedUntil: v.optional(v.number()),
				actorId: v.optional(v.id("users")),
				projectId: v.optional(v.id("projects")),
				clientId: v.optional(v.id("clients")),
				issueId: v.optional(v.id("issues")),
				taskId: v.optional(v.id("tasks")),
				storyId: v.optional(v.id("stories")),
				documentId: v.optional(v.id("documents")),
				whiteboardId: v.optional(v.id("whiteboards")),
				commentId: v.optional(v.id("comments")),
				entityType: v.optional(v.string()),
				entityId: v.optional(v.string()),
				reason: v.optional(v.string()),
				eventAt: v.optional(v.number()),
				source: v.optional(v.string()),
				dedupeKey: v.optional(v.string()),
				displayType: v.string(),
				actorName: v.union(v.string(), v.null()),
				actorImage: v.union(v.string(), v.null()),
				projectName: v.union(v.string(), v.null()),
				projectSlug: v.union(v.string(), v.null()),
				issueIdentifier: v.union(v.string(), v.null()),
				issueTitle: v.union(v.string(), v.null()),
				issueStatus: v.union(v.string(), v.null()),
				issuePriority: v.union(v.string(), v.null()),
				issueAssigneeId: v.union(v.id("users"), v.null()),
				issueLabelIds: v.union(v.array(v.id("labels")), v.null()),
				commentBody: v.union(v.string(), v.null()),
			}),
		),
	}),
	handler: async (ctx, args) => {
		const { userId } = await requireWorkspaceMember(ctx, args.workspaceId);
		const limit = args.limit ?? 50;
		const now = Date.now();

		const raw = await ctx.db
			.query("notifications")
			.withIndex("by_user_workspace_snoozed_until", (idx) =>
				idx
					.eq("userId", userId)
					.eq("workspaceId", args.workspaceId)
					.gt("snoozedUntil", now),
			)
			.order("asc")
			.take(limit * 3);

		const snoozed = raw
			.filter((n) => !n.deletedAt && !n.isArchived)
			.slice(0, limit);

		// Enrich
		const enriched = await Promise.all(
			snoozed.map(async (n) => {
				const actor = n.actorId ? await ctx.db.get(n.actorId) : null;
				const project = n.projectId ? await ctx.db.get(n.projectId) : null;
				const issue = n.issueId ? await ctx.db.get(n.issueId) : null;
				const comment = n.commentId ? await ctx.db.get(n.commentId) : null;

				return {
					...n,
					displayType: toDisplayType(n.type as NotificationType),
					actorName: actor?.name ?? null,
					actorImage:
						(actor?.avatarStorageId
							? await ctx.storage.getUrl(actor.avatarStorageId)
							: null) ??
						actor?.image ??
						null,
					projectName: project?.name ?? null,
					projectSlug: project?.slug ?? null,
					issueIdentifier: issue?.identifier ?? null,
					issueTitle: issue?.title ?? null,
					issueStatus: issue?.status ?? null,
					issuePriority: issue?.priority ?? null,
					issueAssigneeId: issue?.assigneeId ?? null,
					issueLabelIds: issue?.labelIds ?? null,
					commentBody:
						comment && !comment.deletedAt
							? extractTextFromTipTap(comment.body)
							: null,
				};
			}),
		);

		return { notifications: enriched };
	},
});

export const unreadCount = query({
	args: {
		workspaceId: v.id("workspaces"),
	},
	returns: v.number(),
	handler: async (ctx, args) => {
		const { userId } = await requireWorkspaceMember(ctx, args.workspaceId);

		const unread = await ctx.db
			.query("notifications")
			.withIndex("by_user_workspace_unread", (q) =>
				q
					.eq("userId", userId)
					.eq("workspaceId", args.workspaceId)
					.eq("isRead", false),
			)
			.collect();

		// Exclude archived, deleted, and snoozed from unread count
		return unread.filter((n) => !n.isArchived && !n.deletedAt && !isSnoozed(n))
			.length;
	},
});

// ── Mutations ───────────────────────────────────────────────────────────────

export const markAsRead = mutation({
	args: {
		notificationId: v.id("notifications"),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const notification = await ctx.db.get(args.notificationId);
		if (!notification) {
			throw new ConvexError("Notification not found");
		}

		await requireWorkspaceMember(ctx, notification.workspaceId);

		if (!notification.isRead) {
			await ctx.db.patch(args.notificationId, {
				isRead: true,
				readAt: Date.now(),
			});
		}
	},
});

export const markAllRead = mutation({
	args: {
		workspaceId: v.id("workspaces"),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const { userId } = await requireWorkspaceMember(ctx, args.workspaceId);

		const unread = await ctx.db
			.query("notifications")
			.withIndex("by_user_workspace_unread", (q) =>
				q
					.eq("userId", userId)
					.eq("workspaceId", args.workspaceId)
					.eq("isRead", false),
			)
			.collect();

		const now = Date.now();
		for (const notification of unread) {
			if (!notification.deletedAt && !isSnoozed(notification)) {
				await ctx.db.patch(notification._id, {
					isRead: true,
					readAt: now,
				});
			}
		}
	},
});

export const toggleRead = mutation({
	args: {
		notificationId: v.id("notifications"),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const notification = await ctx.db.get(args.notificationId);
		if (!notification) {
			throw new ConvexError("Notification not found");
		}

		await requireWorkspaceMember(ctx, notification.workspaceId);

		await ctx.db.patch(args.notificationId, {
			isRead: !notification.isRead,
			readAt: !notification.isRead ? Date.now() : undefined,
		});
	},
});

export const snooze = mutation({
	args: {
		notificationId: v.id("notifications"),
		snoozedUntil: v.number(),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const notification = await ctx.db.get(args.notificationId);
		if (!notification) {
			throw new ConvexError("Notification not found");
		}

		await requireWorkspaceMember(ctx, notification.workspaceId);

		await ctx.db.patch(args.notificationId, {
			snoozedUntil: args.snoozedUntil,
			isRead: true,
			readAt: Date.now(),
		});
	},
});

export const unsnooze = mutation({
	args: {
		notificationId: v.id("notifications"),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const notification = await ctx.db.get(args.notificationId);
		if (!notification) {
			throw new ConvexError("Notification not found");
		}

		await requireWorkspaceMember(ctx, notification.workspaceId);

		await ctx.db.patch(args.notificationId, {
			snoozedUntil: undefined,
		});
	},
});

export const deleteNotification = mutation({
	args: {
		notificationId: v.id("notifications"),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const notification = await ctx.db.get(args.notificationId);
		if (!notification) {
			throw new ConvexError("Notification not found");
		}

		await requireWorkspaceMember(ctx, notification.workspaceId);

		await ctx.db.patch(args.notificationId, {
			deletedAt: Date.now(),
		});
	},
});

export const bulkDelete = mutation({
	args: {
		workspaceId: v.id("workspaces"),
		notificationIds: v.array(v.id("notifications")),
	},
	returns: v.number(),
	handler: async (ctx, args) => {
		const { userId } = await requireWorkspaceMember(ctx, args.workspaceId);
		const now = Date.now();
		let deleted = 0;

		for (const notificationId of args.notificationIds) {
			const notification = await ctx.db.get(notificationId);
			if (!notification) continue;
			if (notification.workspaceId !== args.workspaceId) continue;
			if (notification.userId !== userId) continue;
			if (notification.deletedAt) continue;

			await ctx.db.patch(notificationId, { deletedAt: now });
			deleted++;
		}

		return deleted;
	},
});

export const deleteAllRead = mutation({
	args: {
		workspaceId: v.id("workspaces"),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const { userId } = await requireWorkspaceMember(ctx, args.workspaceId);

		const read = await ctx.db
			.query("notifications")
			.withIndex("by_user_workspace_unread", (q) =>
				q
					.eq("userId", userId)
					.eq("workspaceId", args.workspaceId)
					.eq("isRead", true),
			)
			.collect();

		const now = Date.now();
		for (const notification of read) {
			if (!notification.deletedAt) {
				await ctx.db.patch(notification._id, { deletedAt: now });
			}
		}
	},
});

export const archive = mutation({
	args: {
		notificationId: v.id("notifications"),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const notification = await ctx.db.get(args.notificationId);
		if (!notification) {
			throw new ConvexError("Notification not found");
		}

		await requireWorkspaceMember(ctx, notification.workspaceId);

		await ctx.db.patch(args.notificationId, {
			isArchived: true,
		});
	},
});

// ── Internal: Un-snooze cron handler ────────────────────────────────────────

export const unsnoozeExpired = internalMutation({
	handler: async (ctx) => {
		const now = Date.now();

		// Find notifications where snoozedUntil has passed.
		// This is bounded but intentionally large; if there are more, the next cron tick picks up the rest.
		const candidates = await ctx.db
			.query("notifications")
			.withIndex("by_snoozed_until", (q) => q.lte("snoozedUntil", now))
			.take(50000);

		let count = 0;
		for (const n of candidates) {
			if (
				n.snoozedUntil !== undefined &&
				n.snoozedUntil <= now &&
				!n.deletedAt
			) {
				await ctx.db.patch(n._id, {
					snoozedUntil: undefined,
					isRead: false,
				});
				count++;
			}
		}

		if (count > 0) {
			console.log(`Unsnoozed ${count} notifications`);
		}
	},
});

// ── Internal: Due-date reminder cron handler ────────────────────────────────

export const sendDueDateReminders = internalMutation({
	handler: async (ctx) => {
		const now = Date.now();
		const in24Hours = now + 24 * 60 * 60 * 1000;
		const staleThreshold = now - 7 * 24 * 60 * 60 * 1000;
		const todayKey = new Date(now).toISOString().slice(0, 10);

		// Get all workspaces to iterate through issues
		const workspaces = await ctx.db.query("workspaces").collect();

		let count = 0;
		for (const workspace of workspaces) {
			const issues = await ctx.db
				.query("issues")
				.withIndex("by_workspace", (q) => q.eq("workspaceId", workspace._id))
				.collect();

			for (const issue of issues) {
				if (issue.deletedAt) continue;
				if (!issue.assigneeId) continue;
				if (issue.status === "done" || issue.status === "cancelled") continue;

				// Due within next 24 hours and not already past.
				if (
					issue.dueDate &&
					issue.dueDate > now &&
					issue.dueDate <= in24Hours
				) {
					const dueDate = new Date(issue.dueDate).toLocaleDateString();
					const created = await createNotification(ctx, {
						userId: issue.assigneeId,
						workspaceId: issue.workspaceId,
						type: "issue_due_soon",
						title: "Issue due soon",
						body: `'${issue.identifier}: ${issue.title}' is due on ${dueDate}`,
						issueId: issue._id,
						projectId: issue.projectId ?? undefined,
						source: "cron",
						dedupeKey: `issue_due_soon:${issue._id}:${issue.dueDate}`,
					});
					if (created) count++;
				}

				// Overdue notifications (at most once per day per issue).
				if (issue.dueDate && issue.dueDate <= now) {
					const created = await createNotification(ctx, {
						userId: issue.assigneeId,
						workspaceId: issue.workspaceId,
						type: "issue_overdue",
						title: "Issue is overdue",
						body: `'${issue.identifier}: ${issue.title}' missed its due date`,
						issueId: issue._id,
						projectId: issue.projectId ?? undefined,
						source: "cron",
						dedupeKey: `issue_overdue:${issue._id}:${todayKey}`,
					});
					if (created) count++;
				}

				// Out-of-date (stale) notifications for active assigned issues.
				const issueUpdatedAt = issue.updatedAt ?? issue._creationTime;
				if (issueUpdatedAt < staleThreshold) {
					const staleBucket = Math.floor(now / (7 * 24 * 60 * 60 * 1000));
					const created = await createNotification(ctx, {
						userId: issue.assigneeId,
						workspaceId: issue.workspaceId,
						type: "issue_stale",
						title: "Issue is out of date",
						body: `'${issue.identifier}: ${issue.title}' has not been updated recently`,
						issueId: issue._id,
						projectId: issue.projectId ?? undefined,
						source: "cron",
						dedupeKey: `issue_stale:${issue._id}:${staleBucket}`,
					});
					if (created) count++;
				}
			}
		}

		if (count > 0) {
			console.log(`Sent ${count} reminder notifications`);
		}
	},
});
