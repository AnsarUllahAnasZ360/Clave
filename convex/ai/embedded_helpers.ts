/**
 * Internal queries and mutations for the embedded AI dispatcher.
 * Kept in a separate file because Convex does not allow queries/mutations
 * in Node.js runtime files ("use node").
 */

import { v } from "convex/values";
import { internalMutation, internalQuery } from "../_generated/server";

// ── Internal queries for entity loading ──────────────────────────────────

export const loadDocumentContext = internalQuery({
	args: { documentId: v.id("documents") },
	returns: v.union(
		v.object({
			title: v.string(),
			content: v.optional(v.string()),
		}),
		v.null(),
	),
	handler: async (ctx, { documentId }) => {
		const doc = await ctx.db.get(documentId);
		if (!doc || doc.deletedAt) return null;
		return {
			title: doc.title,
			content: doc.content ? extractPlainTextFromBody(doc.content) : undefined,
		};
	},
});

export const loadIssueContext = internalQuery({
	args: { issueId: v.id("issues") },
	returns: v.union(
		v.object({
			identifier: v.string(),
			title: v.string(),
			description: v.optional(v.string()),
			status: v.string(),
			priority: v.string(),
			type: v.string(),
		}),
		v.null(),
	),
	handler: async (ctx, { issueId }) => {
		const issue = await ctx.db.get(issueId);
		if (!issue || issue.deletedAt) return null;
		return {
			identifier: issue.identifier,
			title: issue.title,
			description: issue.description
				? extractPlainTextFromBody(issue.description)
				: undefined,
			status: issue.status,
			priority: issue.priority,
			type: issue.type,
		};
	},
});

export const loadWhiteboardContext = internalQuery({
	args: { whiteboardId: v.id("whiteboards") },
	returns: v.union(
		v.object({
			title: v.string(),
			sceneData: v.optional(v.string()),
		}),
		v.null(),
	),
	handler: async (ctx, { whiteboardId }) => {
		const wb = await ctx.db.get(whiteboardId);
		if (!wb || wb.deletedAt) return null;
		return { title: wb.title, sceneData: wb.sceneData ?? undefined };
	},
});

export const loadProjectContext = internalQuery({
	args: { projectId: v.id("projects") },
	returns: v.union(
		v.object({
			name: v.string(),
			description: v.optional(v.string()),
		}),
		v.null(),
	),
	handler: async (ctx, { projectId }) => {
		const project = await ctx.db.get(projectId);
		if (!project || project.deletedAt) return null;
		return {
			name: project.name,
			description: project.richDescription
				? extractPlainTextFromBody(project.richDescription)
				: project.description
					? extractPlainTextFromBody(project.description)
					: undefined,
		};
	},
});

export const loadProjectIssueStats = internalQuery({
	args: { projectId: v.id("projects") },
	returns: v.object({
		total: v.number(),
		completed: v.number(),
		inProgress: v.number(),
		backlog: v.number(),
	}),
	handler: async (ctx, { projectId }) => {
		const issues = await ctx.db
			.query("issues")
			.withIndex("by_project", (q) => q.eq("projectId", projectId))
			.collect();
		const active = issues.filter((i) => !i.deletedAt);
		return {
			total: active.length,
			completed: active.filter(
				(i) => i.status === "done" || i.status === "cancelled",
			).length,
			inProgress: active.filter((i) => i.status === "in_progress").length,
			backlog: active.filter(
				(i) => i.status === "backlog" || i.status === "todo",
			).length,
		};
	},
});

export const loadWorkspaceLabels = internalQuery({
	args: { workspaceId: v.id("workspaces") },
	returns: v.array(v.string()),
	handler: async (ctx, { workspaceId }) => {
		const labels = await ctx.db
			.query("labels")
			.withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
			.collect();
		return labels.filter((l) => !l.deletedAt).map((l) => l.name);
	},
});

export const loadIssueComments = internalQuery({
	args: { issueId: v.id("issues") },
	returns: v.array(v.object({ author: v.string(), body: v.string() })),
	handler: async (ctx, { issueId }) => {
		const comments = await ctx.db
			.query("comments")
			.withIndex("by_issue", (q) => q.eq("issueId", issueId))
			.take(50);

		const activeComments = comments.filter((comment) => !comment.deletedAt);
		const authorIds = [
			...new Set(activeComments.map((comment) => comment.authorId)),
		];
		const authorResults = await Promise.all(
			authorIds.map((authorId) => ctx.db.get(authorId)),
		);
		const authorNameById = new Map(
			authorIds.map((authorId, index) => [
				authorId,
				authorResults[index]?.name ?? "Unknown",
			]),
		);

		return activeComments.map((comment) => ({
			author: authorNameById.get(comment.authorId) ?? "Unknown",
			body: comment.body,
		}));
	},
});

export const loadProjectMilestones = internalQuery({
	args: { projectId: v.id("projects") },
	returns: v.array(
		v.object({
			name: v.string(),
			status: v.string(),
			progress: v.number(),
			issueCount: v.number(),
			completedCount: v.number(),
			targetDate: v.optional(v.string()),
		}),
	),
	handler: async (ctx, { projectId }) => {
		const sprints = await ctx.db
			.query("sprints")
			.withIndex("by_project", (q) => q.eq("projectId", projectId))
			.collect();
		const issues = await ctx.db
			.query("issues")
			.withIndex("by_project", (q) => q.eq("projectId", projectId))
			.collect();

		const sprintStats = new Map<
			string,
			{ issueCount: number; completedCount: number }
		>();
		for (const issue of issues) {
			if (issue.deletedAt || !issue.sprintId) continue;
			const key = String(issue.sprintId);
			const current = sprintStats.get(key) ?? {
				issueCount: 0,
				completedCount: 0,
			};
			current.issueCount += 1;
			if (issue.status === "done" || issue.status === "cancelled") {
				current.completedCount += 1;
			}
			sprintStats.set(key, current);
		}

		const results: Array<{
			name: string;
			status: string;
			progress: number;
			issueCount: number;
			completedCount: number;
			targetDate?: string;
		}> = [];
		for (const s of sprints.filter((s) => !s.deletedAt)) {
			const stats = sprintStats.get(String(s._id)) ?? {
				issueCount: 0,
				completedCount: 0,
			};
			const progress =
				stats.issueCount > 0
					? Math.round((stats.completedCount / stats.issueCount) * 100)
					: 0;
			results.push({
				name: s.name,
				status: s.status,
				progress,
				issueCount: stats.issueCount,
				completedCount: stats.completedCount,
				targetDate: s.targetDate
					? new Date(s.targetDate).toISOString().split("T")[0]
					: undefined,
			});
		}
		return results;
	},
});

export const loadSprintVelocity = internalQuery({
	args: { projectId: v.id("projects") },
	returns: v.object({
		completedSprints: v.number(),
		avgIssuesPerSprint: v.number(),
		lastSprintCompleted: v.optional(v.number()),
	}),
	handler: async (ctx, { projectId }) => {
		const sprints = await ctx.db
			.query("sprints")
			.withIndex("by_project", (q) => q.eq("projectId", projectId))
			.collect();
		const completedSprints = sprints.filter(
			(s) => !s.deletedAt && s.status === "completed",
		);
		if (completedSprints.length === 0) {
			return { completedSprints: 0, avgIssuesPerSprint: 0 };
		}

		const completedSprintIds = new Set(
			completedSprints.map((sprint) => String(sprint._id)),
		);
		const issues = await ctx.db
			.query("issues")
			.withIndex("by_project", (q) => q.eq("projectId", projectId))
			.collect();
		const doneCountBySprintId = new Map<string, number>();
		for (const issue of issues) {
			if (
				issue.deletedAt ||
				!issue.sprintId ||
				!completedSprintIds.has(String(issue.sprintId))
			) {
				continue;
			}
			if (issue.status !== "done" && issue.status !== "cancelled") continue;
			const key = String(issue.sprintId);
			doneCountBySprintId.set(key, (doneCountBySprintId.get(key) ?? 0) + 1);
		}

		let totalCompleted = 0;
		let lastSprintCompleted: number | undefined;
		let lastSprintEndDate: number | undefined;
		for (const s of completedSprints) {
			const done = doneCountBySprintId.get(String(s._id)) ?? 0;
			totalCompleted += done;
			if (
				s.endDate &&
				(lastSprintEndDate === undefined || s.endDate > lastSprintEndDate)
			) {
				lastSprintEndDate = s.endDate;
				lastSprintCompleted = done;
			}
		}
		return {
			completedSprints: completedSprints.length,
			avgIssuesPerSprint: Math.round(totalCompleted / completedSprints.length),
			lastSprintCompleted,
		};
	},
});

export const loadBacklogIssues = internalQuery({
	args: { projectId: v.id("projects") },
	returns: v.array(
		v.object({
			identifier: v.string(),
			title: v.string(),
			priority: v.string(),
			type: v.string(),
		}),
	),
	handler: async (ctx, { projectId }) => {
		const issues = await ctx.db
			.query("issues")
			.withIndex("by_project", (q) => q.eq("projectId", projectId))
			.collect();
		return issues
			.filter(
				(i) => !i.deletedAt && (i.status === "backlog" || i.status === "todo"),
			)
			.slice(0, 30)
			.map((i) => ({
				identifier: i.identifier,
				title: i.title,
				priority: i.priority,
				type: i.type,
			}));
	},
});

export const loadWorkspaceProjectIds = internalQuery({
	args: { workspaceId: v.id("workspaces") },
	returns: v.array(v.id("projects")),
	handler: async (ctx, { workspaceId }) => {
		const projects = await ctx.db
			.query("projects")
			.withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
			.collect();
		return projects.filter((p) => !p.deletedAt).map((p) => p._id);
	},
});

export const loadRecentNotifications = internalQuery({
	args: { userId: v.id("users"), workspaceId: v.id("workspaces") },
	returns: v.array(
		v.object({
			type: v.string(),
			title: v.string(),
			body: v.optional(v.string()),
			isRead: v.boolean(),
			createdAt: v.number(),
			issueIdentifier: v.optional(v.string()),
			issueTitle: v.optional(v.string()),
			issuePriority: v.optional(v.string()),
			projectName: v.optional(v.string()),
			actorName: v.optional(v.string()),
		}),
	),
	handler: async (ctx, { userId, workspaceId }) => {
		const now = Date.now();
		const cutoff = now - 48 * 60 * 60 * 1000; // 48 hours
		const raw = await ctx.db
			.query("notifications")
			.withIndex("by_user_workspace", (q) =>
				q.eq("userId", userId).eq("workspaceId", workspaceId),
			)
			.order("desc")
			.take(100);

		const candidateNotifications: typeof raw = [];
		for (const notification of raw) {
			if (notification._creationTime < cutoff) break;
			if (notification.deletedAt || notification.isArchived) continue;
			if (notification.snoozedUntil && notification.snoozedUntil > now)
				continue;
			candidateNotifications.push(notification);
			if (candidateNotifications.length >= 50) break;
		}

		const actorIds = [
			...new Set(
				candidateNotifications
					.map((notification) => notification.actorId)
					.filter((id): id is NonNullable<typeof id> => Boolean(id)),
			),
		];
		const issueIds = [
			...new Set(
				candidateNotifications
					.map((notification) => notification.issueId)
					.filter((id): id is NonNullable<typeof id> => Boolean(id)),
			),
		];
		const projectIds = [
			...new Set(
				candidateNotifications
					.map((notification) => notification.projectId)
					.filter((id): id is NonNullable<typeof id> => Boolean(id)),
			),
		];

		const [actors, issues, projects] = await Promise.all([
			Promise.all(actorIds.map((actorId) => ctx.db.get(actorId))),
			Promise.all(issueIds.map((issueId) => ctx.db.get(issueId))),
			Promise.all(projectIds.map((projectId) => ctx.db.get(projectId))),
		]);
		const actorById = new Map(
			actorIds.map((actorId, index) => [actorId, actors[index]]),
		);
		const issueById = new Map(
			issueIds.map((issueId, index) => [issueId, issues[index]]),
		);
		const projectById = new Map(
			projectIds.map((projectId, index) => [projectId, projects[index]]),
		);

		const results: Array<{
			type: string;
			title: string;
			body?: string;
			isRead: boolean;
			createdAt: number;
			issueIdentifier?: string;
			issueTitle?: string;
			issuePriority?: string;
			projectName?: string;
			actorName?: string;
		}> = [];

		for (const n of candidateNotifications) {
			const actor = n.actorId ? actorById.get(n.actorId) : null;
			const issue = n.issueId ? issueById.get(n.issueId) : null;
			const project = n.projectId ? projectById.get(n.projectId) : null;

			results.push({
				type: n.type,
				title: n.title,
				body: n.body ?? undefined,
				isRead: n.isRead,
				createdAt: n._creationTime,
				issueIdentifier: issue?.identifier ?? undefined,
				issueTitle: issue?.title ?? undefined,
				issuePriority: issue?.priority ?? undefined,
				projectName: project?.name ?? undefined,
				actorName: actor?.name ?? undefined,
			});
		}

		return results;
	},
});

export const loadUserOverdueIssues = internalQuery({
	args: { userId: v.id("users"), workspaceId: v.id("workspaces") },
	returns: v.array(
		v.object({
			identifier: v.string(),
			title: v.string(),
			priority: v.string(),
			dueDate: v.optional(v.number()),
			status: v.string(),
		}),
	),
	handler: async (ctx, { userId, workspaceId }) => {
		const now = Date.now();
		const issues = await ctx.db
			.query("issues")
			.withIndex("by_workspace_assignee", (q) =>
				q.eq("workspaceId", workspaceId).eq("assigneeId", userId),
			)
			.collect();

		return issues
			.filter(
				(i) =>
					!i.deletedAt &&
					i.status !== "done" &&
					i.status !== "cancelled" &&
					i.dueDate &&
					i.dueDate <= now,
			)
			.slice(0, 20)
			.map((i) => ({
				identifier: i.identifier,
				title: i.title,
				priority: i.priority,
				dueDate: i.dueDate ?? undefined,
				status: i.status,
			}));
	},
});

// ── AI Mention Helper mutations ────────────────────────────────────────────

/** Find or create the AI system user for a workspace */
export const getOrCreateAIUser = internalMutation({
	args: { workspaceId: v.id("workspaces") },
	returns: v.id("users"),
	handler: async (ctx, { workspaceId: _workspaceId }) => {
		const existing = await ctx.db
			.query("users")
			.filter((q) => q.eq(q.field("email"), "ai@clave.system"))
			.first();
		if (existing) return existing._id;

		const userId = await ctx.db.insert("users", {
			name: "Clave AI",
			email: "ai@clave.system",
			image: undefined,
			role: "system",
		});
		return userId;
	},
});

/** Create an AI reply comment in the comments table (issues/tasks/stories/whiteboards) */
export const createAIReplyComment = internalMutation({
	args: {
		issueId: v.optional(v.id("issues")),
		taskId: v.optional(v.id("tasks")),
		storyId: v.optional(v.id("stories")),
		whiteboardId: v.optional(v.id("whiteboards")),
		parentId: v.optional(v.id("comments")),
		body: v.string(),
		aiUserId: v.id("users"),
	},
	returns: v.id("comments"),
	handler: async (ctx, args) => {
		return await ctx.db.insert("comments", {
			issueId: args.issueId,
			taskId: args.taskId,
			storyId: args.storyId,
			whiteboardId: args.whiteboardId,
			parentId: args.parentId,
			body: args.body,
			authorId: args.aiUserId,
		});
	},
});

/** Create an AI reply in the documentComments table */
export const createAIDocumentComment = internalMutation({
	args: {
		threadId: v.id("documentThreads"),
		documentId: v.id("documents"),
		workspaceId: v.id("workspaces"),
		body: v.string(),
		aiUserId: v.id("users"),
	},
	returns: v.id("documentComments"),
	handler: async (ctx, args) => {
		return await ctx.db.insert("documentComments", {
			threadId: args.threadId,
			documentId: args.documentId,
			workspaceId: args.workspaceId,
			authorId: args.aiUserId,
			body: args.body,
		});
	},
});

/** Load thread comments for context */
export const loadCommentThread = internalQuery({
	args: { parentId: v.optional(v.id("comments")), commentId: v.id("comments") },
	returns: v.array(v.object({ author: v.string(), body: v.string() })),
	handler: async (ctx, { parentId, commentId }) => {
		const threadRoot = parentId ?? commentId;
		const [rootComment, replyComments] = await Promise.all([
			ctx.db.get(threadRoot),
			ctx.db
				.query("comments")
				.withIndex("by_parent", (q) => q.eq("parentId", threadRoot))
				.collect(),
		]);

		const orderedThreadComments = [
			...(rootComment ? [rootComment] : []),
			...replyComments.sort((a, b) => a._creationTime - b._creationTime),
		].filter((comment) => !comment.deletedAt);

		const authorIds = [
			...new Set(orderedThreadComments.map((comment) => comment.authorId)),
		];
		const authorResults = await Promise.all(
			authorIds.map((authorId) => ctx.db.get(authorId)),
		);
		const authorNameById = new Map(
			authorIds.map((authorId, index) => [
				authorId,
				authorResults[index]?.name ?? "Unknown",
			]),
		);

		return orderedThreadComments.map((comment) => ({
			author: authorNameById.get(comment.authorId) ?? "Unknown",
			body: extractPlainTextFromBody(comment.body),
		}));
	},
});

/** Load document thread comments for context */
export const loadDocumentThreadComments = internalQuery({
	args: { threadId: v.id("documentThreads") },
	returns: v.array(v.object({ author: v.string(), body: v.string() })),
	handler: async (ctx, { threadId }) => {
		const comments = await ctx.db
			.query("documentComments")
			.withIndex("by_thread", (q) => q.eq("threadId", threadId))
			.collect();

		const activeComments = comments.filter((comment) => !comment.deletedAt);
		const authorIds = [
			...new Set(activeComments.map((comment) => comment.authorId)),
		];
		const authorResults = await Promise.all(
			authorIds.map((authorId) => ctx.db.get(authorId)),
		);
		const authorNameById = new Map(
			authorIds.map((authorId, index) => [
				authorId,
				authorResults[index]?.name ?? "Unknown",
			]),
		);

		return activeComments.map((comment) => ({
			author: authorNameById.get(comment.authorId) ?? "Unknown",
			body: extractPlainTextFromBody(comment.body),
		}));
	},
});

/** Extract plain text from structured editor JSON or plain body. */
export function extractPlainTextFromBody(body: string): string {
	const trimmed = body.trim();
	if (!trimmed) return "";
	if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return body;

	try {
		const doc = JSON.parse(trimmed) as unknown;
		const texts: string[] = [];

		function walk(node: unknown) {
			if (!node) return;
			if (Array.isArray(node)) {
				for (const child of node) walk(child);
				return;
			}
			if (typeof node !== "object") return;

			const current = node as {
				text?: unknown;
				content?: unknown;
				children?: unknown;
			};

			if (typeof current.text === "string" && current.text.trim().length > 0) {
				texts.push(current.text.trim());
			}
			if (Array.isArray(current.content)) {
				for (const child of current.content) walk(child);
			}
			if (Array.isArray(current.children)) {
				for (const child of current.children) walk(child);
			}
		}

		walk(doc);
		if (texts.length === 0) return body;
		return texts.join(" ").replace(/\s+/g, " ").trim();
	} catch {
		return body;
	}
}
