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
		return { title: doc.title, content: doc.content ?? undefined };
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
			description: issue.description ?? undefined,
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
			description: project.description ?? undefined,
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
		const results: Array<{ author: string; body: string }> = [];
		for (const c of comments) {
			if (c.deletedAt) continue;
			const user = await ctx.db.get(c.authorId);
			results.push({
				author: user?.name ?? "Unknown",
				body: c.body,
			});
		}
		return results;
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
		const results: Array<{
			name: string;
			status: string;
			progress: number;
			issueCount: number;
			completedCount: number;
			targetDate?: string;
		}> = [];
		for (const s of sprints.filter((s) => !s.deletedAt)) {
			const issues = await ctx.db
				.query("issues")
				.withIndex("by_sprint", (q) => q.eq("sprintId", s._id))
				.collect();
			const active = issues.filter((i) => !i.deletedAt);
			const completed = active.filter(
				(i) => i.status === "done" || i.status === "cancelled",
			);
			const progress =
				active.length > 0
					? Math.round((completed.length / active.length) * 100)
					: 0;
			results.push({
				name: s.name,
				status: s.status,
				progress,
				issueCount: active.length,
				completedCount: completed.length,
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
		let totalCompleted = 0;
		let lastSprintCompleted: number | undefined;
		for (const s of completedSprints) {
			const issues = await ctx.db
				.query("issues")
				.withIndex("by_sprint", (q) => q.eq("sprintId", s._id))
				.collect();
			const done = issues.filter(
				(i) =>
					!i.deletedAt && (i.status === "done" || i.status === "cancelled"),
			).length;
			totalCompleted += done;
			if (
				s.endDate &&
				(!lastSprintCompleted || s.endDate > lastSprintCompleted)
			) {
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
		const cutoff = Date.now() - 48 * 60 * 60 * 1000; // 48 hours
		const raw = await ctx.db
			.query("notifications")
			.withIndex("by_user_workspace", (q) =>
				q.eq("userId", userId).eq("workspaceId", workspaceId),
			)
			.order("desc")
			.take(100);

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

		for (const n of raw) {
			if (n._creationTime < cutoff) break;
			if (n.deletedAt || n.isArchived) continue;
			if (n.snoozedUntil && n.snoozedUntil > Date.now()) continue;

			const actor = n.actorId ? await ctx.db.get(n.actorId) : null;
			const issue = n.issueId ? await ctx.db.get(n.issueId) : null;
			const project = n.projectId ? await ctx.db.get(n.projectId) : null;

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
			.withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
			.collect();

		return issues
			.filter(
				(i) =>
					!i.deletedAt &&
					i.assigneeId === userId &&
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
		const comments = await ctx.db
			.query("comments")
			.filter((q) =>
				q.or(
					q.eq(q.field("_id"), threadRoot),
					q.eq(q.field("parentId"), threadRoot),
				),
			)
			.collect();

		const results: Array<{ author: string; body: string }> = [];
		for (const c of comments.filter((c) => !c.deletedAt)) {
			const user = await ctx.db.get(c.authorId);
			results.push({
				author: user?.name ?? "Unknown",
				body: extractPlainTextFromBody(c.body),
			});
		}
		return results;
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

		const results: Array<{ author: string; body: string }> = [];
		for (const c of comments.filter((c) => !c.deletedAt)) {
			const user = await ctx.db.get(c.authorId);
			results.push({
				author: user?.name ?? "Unknown",
				body: extractPlainTextFromBody(c.body),
			});
		}
		return results;
	},
});

/** Extract plain text from TipTap JSON or plain body */
export function extractPlainTextFromBody(body: string): string {
	if (!body.startsWith("{")) return body;
	try {
		type TNode = { text?: string; content?: TNode[] };
		const doc = JSON.parse(body) as TNode;
		const texts: string[] = [];
		function walk(node: TNode) {
			if (node.text) texts.push(node.text);
			if (node.content && Array.isArray(node.content)) {
				for (const child of node.content) walk(child);
			}
		}
		walk(doc);
		return texts.join(" ");
	} catch {
		return body;
	}
}
