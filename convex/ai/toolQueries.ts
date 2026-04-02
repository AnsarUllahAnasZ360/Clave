/**
 * Internal queries for AI tools — bypass Convex auth for external contexts.
 *
 * When AI tools run from the Google Chat webhook path, there is no Convex
 * auth session. These internal queries accept explicit `workspaceId` and
 * `userId` parameters and perform the same data fetching + RBAC filtering
 * as the public queries, enabling tools to work from any context.
 */

import { v } from "convex/values";
import type { Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import { internalQuery } from "../_generated/server";
import { canAccessProject, getAccessibleProjectIds } from "../lib/auth";

// ── Shared helpers ──────────────────────────────────────────────────────

async function getMembership(
	ctx: QueryCtx,
	workspaceId: Id<"workspaces">,
	userId: Id<"users">,
) {
	const member = await ctx.db
		.query("workspaceMembers")
		.withIndex("by_workspace_user", (q) =>
			q.eq("workspaceId", workspaceId).eq("userId", userId),
		)
		.unique();
	return member;
}

async function getMemberRole(
	ctx: QueryCtx,
	workspaceId: Id<"workspaces">,
	userId: Id<"users">,
): Promise<"admin" | "member"> {
	const member = await getMembership(ctx, workspaceId, userId);
	return (member?.role as "admin" | "member") ?? "member";
}

// ── 1. Workspace Members ────────────────────────────────────────────────

export const listMembers = internalQuery({
	args: {
		workspaceId: v.id("workspaces"),
	},
	handler: async (ctx, args) => {
		const members = await ctx.db
			.query("workspaceMembers")
			.withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
			.collect();

		const result = [];
		for (const member of members) {
			const user = await ctx.db.get(member.userId);
			let avatarUrl: string | undefined;
			if (user?.avatarStorageId) {
				const url = await ctx.storage.getUrl(user.avatarStorageId);
				if (url) avatarUrl = url;
			}
			result.push({
				...member,
				user: user
					? {
							_id: user._id,
							name: user.name,
							email: user.email,
							image: user.image,
							avatarUrl: avatarUrl ?? user.image,
							role: user.role,
						}
					: null,
			});
		}
		return result;
	},
});

// ── 2. Projects ─────────────────────────────────────────────────────────

export const listProjects = internalQuery({
	args: {
		workspaceId: v.id("workspaces"),
		userId: v.id("users"),
	},
	handler: async (ctx, args) => {
		const role = await getMemberRole(ctx, args.workspaceId, args.userId);
		const projects = await ctx.db
			.query("projects")
			.withIndex("by_workspace_sort", (q) =>
				q.eq("workspaceId", args.workspaceId),
			)
			.collect();
		const active = projects.filter((p) => !p.deletedAt);
		const accessible = await getAccessibleProjectIds(
			ctx,
			args.workspaceId,
			args.userId,
			role,
		);
		if (accessible === null) return active;
		return active.filter((p) => accessible.has(p._id));
	},
});

export const getProjectStats = internalQuery({
	args: {
		projectId: v.id("projects"),
	},
	handler: async (ctx, args) => {
		const project = await ctx.db.get(args.projectId);
		if (!project || project.deletedAt) return null;

		const issues = await ctx.db
			.query("issues")
			.withIndex("by_project", (q) => q.eq("projectId", args.projectId))
			.collect();

		const active = issues.filter((i) => !i.deletedAt && !i.parentId);
		const counts = {
			triage: 0,
			backlog: 0,
			todo: 0,
			in_progress: 0,
			in_review: 0,
			done: 0,
			cancelled: 0,
			total: 0,
		};

		for (const issue of active) {
			counts.total++;
			const status = issue.status as keyof typeof counts;
			if (status in counts && status !== "total") {
				counts[status]++;
			}
		}

		return counts;
	},
});

export const getProjectById = internalQuery({
	args: {
		projectId: v.id("projects"),
		userId: v.id("users"),
	},
	handler: async (ctx, args) => {
		const project = await ctx.db.get(args.projectId);
		if (!project || project.deletedAt) return null;
		const role = await getMemberRole(ctx, project.workspaceId, args.userId);
		const hasAccess = await canAccessProject(
			ctx,
			args.projectId,
			args.userId,
			role,
		);
		if (!hasAccess) return null;
		return project;
	},
});

export const getProjectBySlug = internalQuery({
	args: {
		workspaceId: v.id("workspaces"),
		slug: v.string(),
		userId: v.id("users"),
	},
	handler: async (ctx, args) => {
		const role = await getMemberRole(ctx, args.workspaceId, args.userId);
		const project = await ctx.db
			.query("projects")
			.withIndex("by_workspace_slug", (q) =>
				q.eq("workspaceId", args.workspaceId).eq("slug", args.slug),
			)
			.unique();
		if (!project || project.deletedAt) return null;
		const hasAccess = await canAccessProject(
			ctx,
			project._id,
			args.userId,
			role,
		);
		if (!hasAccess) return null;
		return project;
	},
});

// ── 3. Issues ───────────────────────────────────────────────────────────

export const searchIssues = internalQuery({
	args: {
		workspaceId: v.id("workspaces"),
		searchTerm: v.string(),
		userId: v.id("users"),
	},
	handler: async (ctx, args) => {
		const role = await getMemberRole(ctx, args.workspaceId, args.userId);
		const accessibleProjectIds = await getAccessibleProjectIds(
			ctx,
			args.workspaceId,
			args.userId,
			role,
		);

		if (!args.searchTerm.trim()) return [];

		const issues = await ctx.db
			.query("issues")
			.withSearchIndex("search_title", (q) =>
				q.search("title", args.searchTerm).eq("workspaceId", args.workspaceId),
			)
			.take(20);

		return issues.filter((issue) => {
			if (issue.deletedAt) return false;
			if (accessibleProjectIds !== null) {
				const inAccessibleProject =
					issue.projectId && accessibleProjectIds.has(issue.projectId);
				const isAssigned = issue.assigneeId === args.userId;
				const isCreator = issue.createdBy === args.userId;
				if (!inAccessibleProject && !isAssigned && !isCreator) return false;
			}
			return true;
		});
	},
});

export const listIssues = internalQuery({
	args: {
		workspaceId: v.id("workspaces"),
		userId: v.id("users"),
		status: v.optional(v.string()),
		priority: v.optional(v.string()),
		assigneeId: v.optional(v.string()),
		projectId: v.optional(v.string()),
		limit: v.optional(v.float64()),
	},
	handler: async (ctx, args) => {
		const role = await getMemberRole(ctx, args.workspaceId, args.userId);
		const accessibleProjectIds = await getAccessibleProjectIds(
			ctx,
			args.workspaceId,
			args.userId,
			role,
		);

		// Sanitize optional ID fields — AI models may pass empty strings
		const assigneeId = args.assigneeId?.trim()
			? (args.assigneeId as Id<"users">)
			: undefined;
		const projectId = args.projectId?.trim()
			? (args.projectId as Id<"projects">)
			: undefined;

		const pageSize = args.limit ?? 50;
		const fetchLimit = pageSize * 4;

		// Status groups: some statuses are logically related and should match together
		const statusMatches = (issueStatus: string, filterStatus: string) => {
			if (issueStatus === filterStatus) return true;
			// "backlog" filter also matches "triage" issues
			if (filterStatus === "backlog" && issueStatus === "triage") return true;
			if (filterStatus === "triage" && issueStatus === "backlog") return true;
			return false;
		};

		const buildIssueQuery = () => {
			if (projectId) {
				return ctx.db
					.query("issues")
					.withIndex("by_project", (q) => q.eq("projectId", projectId))
					.order("desc");
			}
			if (assigneeId) {
				return ctx.db
					.query("issues")
					.withIndex("by_workspace_assignee", (q) =>
						q.eq("workspaceId", args.workspaceId).eq("assigneeId", assigneeId),
					)
					.order("desc");
			}
			// Don't use status index — post-filter instead to handle status grouping
			return ctx.db
				.query("issues")
				.withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
				.order("desc");
		};

		const allIssues = await buildIssueQuery().take(fetchLimit);

		const filtered = allIssues.filter((issue) => {
			if (issue.deletedAt) return false;
			if (accessibleProjectIds !== null) {
				const inAccessibleProject =
					issue.projectId && accessibleProjectIds.has(issue.projectId);
				const isAssigned = issue.assigneeId === args.userId;
				const isCreator = issue.createdBy === args.userId;
				if (!inAccessibleProject && !isAssigned && !isCreator) return false;
			}
			if (args.status && !statusMatches(issue.status, args.status))
				return false;
			if (args.priority && issue.priority !== args.priority) return false;
			if (assigneeId && issue.assigneeId !== assigneeId) return false;
			if (projectId && issue.projectId !== projectId) return false;
			return true;
		});

		const page = filtered.slice(0, pageSize);
		const nextCursor =
			page.length > 0 ? page[page.length - 1]._creationTime : undefined;
		return {
			issues: page,
			nextCursor,
			hasMore: filtered.length > pageSize,
		};
	},
});

export const getIssueById = internalQuery({
	args: {
		issueId: v.id("issues"),
		userId: v.id("users"),
	},
	handler: async (ctx, args) => {
		const issue = await ctx.db.get(args.issueId);
		if (!issue || issue.deletedAt) return null;
		const role = await getMemberRole(ctx, issue.workspaceId, args.userId);

		if (role !== "admin" && issue.projectId) {
			const hasAccess = await canAccessProject(
				ctx,
				issue.projectId,
				args.userId,
				role,
			);
			if (
				!hasAccess &&
				issue.assigneeId !== args.userId &&
				issue.createdBy !== args.userId
			)
				return null;
		}

		let parent = null;
		if (issue.parentId) {
			const parentIssue = await ctx.db.get(issue.parentId);
			if (parentIssue && !parentIssue.deletedAt) {
				parent = {
					_id: parentIssue._id,
					identifier: parentIssue.identifier,
					title: parentIssue.title,
					status: parentIssue.status,
				};
			}
		}

		return { ...issue, parent };
	},
});

export const getIssueByIdentifier = internalQuery({
	args: {
		workspaceId: v.id("workspaces"),
		identifier: v.string(),
		userId: v.id("users"),
	},
	handler: async (ctx, args) => {
		const role = await getMemberRole(ctx, args.workspaceId, args.userId);
		const normalizedIdentifier = args.identifier.toUpperCase();

		const issue = await ctx.db
			.query("issues")
			.withIndex("by_identifier", (q) =>
				q
					.eq("workspaceId", args.workspaceId)
					.eq("identifier", normalizedIdentifier),
			)
			.unique();

		if (!issue || issue.deletedAt) return null;

		if (role !== "admin" && issue.projectId) {
			const hasAccess = await canAccessProject(
				ctx,
				issue.projectId,
				args.userId,
				role,
			);
			if (
				!hasAccess &&
				issue.assigneeId !== args.userId &&
				issue.createdBy !== args.userId
			)
				return null;
		}

		let parent = null;
		if (issue.parentId) {
			const parentIssue = await ctx.db.get(issue.parentId);
			if (parentIssue && !parentIssue.deletedAt) {
				parent = {
					_id: parentIssue._id,
					identifier: parentIssue.identifier,
					title: parentIssue.title,
					status: parentIssue.status,
				};
			}
		}

		return { ...issue, parent };
	},
});

export const getSubIssues = internalQuery({
	args: {
		parentId: v.id("issues"),
		userId: v.id("users"),
	},
	handler: async (ctx, args) => {
		const parent = await ctx.db.get(args.parentId);
		if (!parent || parent.deletedAt) return null;
		const role = await getMemberRole(ctx, parent.workspaceId, args.userId);

		if (role !== "admin" && parent.projectId) {
			const hasAccess = await canAccessProject(
				ctx,
				parent.projectId,
				args.userId,
				role,
			);
			if (
				!hasAccess &&
				parent.assigneeId !== args.userId &&
				parent.createdBy !== args.userId
			)
				return null;
		}

		const children = await ctx.db
			.query("issues")
			.withIndex("by_parent", (q) => q.eq("parentId", args.parentId))
			.collect();

		const activeChildren = children.filter((c) => !c.deletedAt);
		activeChildren.sort((a, b) => a.sortOrder - b.sortOrder);

		const total = activeChildren.length;
		const completed = activeChildren.filter(
			(c) => c.status === "done" || c.status === "cancelled",
		).length;
		const inProgress = activeChildren.filter(
			(c) => c.status === "in_progress" || c.status === "in_review",
		).length;

		return {
			subIssues: activeChildren,
			stats: { total, completed, inProgress },
		};
	},
});

// ── 4. Labels ───────────────────────────────────────────────────────────

export const listLabels = internalQuery({
	args: {
		workspaceId: v.id("workspaces"),
	},
	handler: async (ctx, args) => {
		const labels = await ctx.db
			.query("labels")
			.withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
			.collect();
		return labels.filter((l) => !l.deletedAt);
	},
});

// ── 5. Comments ─────────────────────────────────────────────────────────

export const listCommentsByIssue = internalQuery({
	args: {
		issueId: v.id("issues"),
	},
	handler: async (ctx, args) => {
		const issue = await ctx.db.get(args.issueId);
		if (!issue || issue.deletedAt) return [];

		const comments = await ctx.db
			.query("comments")
			.withIndex("by_issue", (q) => q.eq("issueId", args.issueId))
			.collect();

		return comments.filter((c) => !c.deletedAt);
	},
});

// ── 6. Documents ────────────────────────────────────────────────────────

export const getDocumentById = internalQuery({
	args: {
		documentId: v.id("documents"),
	},
	handler: async (ctx, args) => {
		const document = await ctx.db.get(args.documentId);
		if (!document || document.deletedAt) return null;
		return document;
	},
});

export const listDocuments = internalQuery({
	args: {
		workspaceId: v.id("workspaces"),
		userId: v.id("users"),
	},
	handler: async (ctx, args) => {
		const role = await getMemberRole(ctx, args.workspaceId, args.userId);
		const accessibleProjectIds = await getAccessibleProjectIds(
			ctx,
			args.workspaceId,
			args.userId,
			role,
		);

		const documents = await ctx.db
			.query("documents")
			.withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
			.order("desc")
			.take(200);

		return documents.filter((d) => {
			if (d.deletedAt) return false;
			if (accessibleProjectIds !== null) {
				if (d.projectId) return accessibleProjectIds.has(d.projectId);
				return d.createdBy === args.userId;
			}
			return true;
		});
	},
});

// ── 7. Global Search ────────────────────────────────────────────────────

export const globalSearch = internalQuery({
	args: {
		workspaceId: v.id("workspaces"),
		searchTerm: v.string(),
		userId: v.id("users"),
	},
	handler: async (ctx, args) => {
		const role = await getMemberRole(ctx, args.workspaceId, args.userId);
		const accessibleProjectIds = await getAccessibleProjectIds(
			ctx,
			args.workspaceId,
			args.userId,
			role,
		);

		const term = args.searchTerm.trim();
		if (!term)
			return {
				projects: [],
				issues: [],
				stories: [],
				tasks: [],
				clients: [],
				documents: [],
				whiteboards: [],
			};

		const [projects, issues, documents, whiteboards] = await Promise.all([
			ctx.db
				.query("projects")
				.withSearchIndex("search_name", (q) =>
					q.search("name", term).eq("workspaceId", args.workspaceId),
				)
				.take(10)
				.then((results) =>
					results
						.filter((p) => {
							if (p.deletedAt) return false;
							if (accessibleProjectIds !== null)
								return accessibleProjectIds.has(p._id);
							return true;
						})
						.slice(0, 5)
						.map((p) => ({
							_id: p._id,
							name: p.name,
							slug: p.slug,
							status: p.status,
							icon: p.icon,
							color: p.color,
						})),
				),
			ctx.db
				.query("issues")
				.withSearchIndex("search_title", (q) =>
					q.search("title", term).eq("workspaceId", args.workspaceId),
				)
				.take(10)
				.then((results) =>
					results
						.filter((i) => {
							if (i.deletedAt) return false;
							if (accessibleProjectIds !== null) {
								const inAccessibleProject =
									i.projectId && accessibleProjectIds.has(i.projectId);
								return (
									inAccessibleProject ||
									i.assigneeId === args.userId ||
									i.createdBy === args.userId
								);
							}
							return true;
						})
						.slice(0, 5)
						.map((i) => ({
							_id: i._id,
							identifier: i.identifier,
							title: i.title,
							status: i.status,
							projectId: i.projectId,
						})),
				),
			ctx.db
				.query("documents")
				.withSearchIndex("search_title", (q) =>
					q.search("title", term).eq("workspaceId", args.workspaceId),
				)
				.take(10)
				.then((results) =>
					results
						.filter((d) => {
							if (d.deletedAt) return false;
							if (accessibleProjectIds !== null) {
								if (d.projectId) return accessibleProjectIds.has(d.projectId);
								return d.createdBy === args.userId;
							}
							return true;
						})
						.slice(0, 5)
						.map((d) => ({
							_id: d._id,
							title: d.title,
							projectId: d.projectId,
						})),
				),
			ctx.db
				.query("whiteboards")
				.withSearchIndex("search_title", (q) =>
					q.search("title", term).eq("workspaceId", args.workspaceId),
				)
				.take(10)
				.then((results) =>
					results
						.filter((w) => !w.deletedAt)
						.slice(0, 5)
						.map((w) => ({
							_id: w._id,
							title: w.title,
							projectId: w.projectId,
						})),
				),
		]);

		// Stories/tasks/clients — search if tables exist, return empty if not
		let stories: Array<{
			_id: Id<"stories">;
			identifier: string;
			title: string;
			status: string;
			projectId?: Id<"projects">;
		}> = [];
		let tasks: Array<{
			_id: Id<"tasks">;
			identifier: string;
			title: string;
			status: string;
			projectId?: Id<"projects">;
		}> = [];
		let clients: Array<{
			_id: Id<"clients">;
			name: string;
			status: string;
		}> = [];

		try {
			stories = await ctx.db
				.query("stories")
				.withSearchIndex("search_title", (q) =>
					q.search("title", term).eq("workspaceId", args.workspaceId),
				)
				.take(10)
				.then((results) =>
					results
						.filter((s) => !s.deletedAt)
						.slice(0, 5)
						.map((s) => ({
							_id: s._id,
							identifier: s.identifier,
							title: s.title,
							status: s.status,
							projectId: s.projectId,
						})),
				);
		} catch {
			// stories table may not exist
		}

		try {
			tasks = await ctx.db
				.query("tasks")
				.withSearchIndex("search_title", (q) =>
					q.search("title", term).eq("workspaceId", args.workspaceId),
				)
				.take(10)
				.then((results) =>
					results
						.filter((t) => !t.deletedAt)
						.slice(0, 5)
						.map((t) => ({
							_id: t._id,
							identifier: t.identifier,
							title: t.title,
							status: t.status,
							projectId: t.projectId,
						})),
				);
		} catch {
			// tasks table may not exist
		}

		try {
			clients = await ctx.db
				.query("clients")
				.withSearchIndex("search_name", (q) =>
					q.search("name", term).eq("workspaceId", args.workspaceId),
				)
				.take(10)
				.then((results) =>
					results
						.filter((c) => !c.deletedAt)
						.slice(0, 5)
						.map((c) => ({
							_id: c._id,
							name: c.name,
							status: c.status,
						})),
				);
		} catch {
			// clients table may not exist
		}

		return {
			projects,
			issues,
			stories,
			tasks,
			clients,
			documents,
			whiteboards,
		};
	},
});

// ── 8. Sprints ──────────────────────────────────────────────────────────

function isCompletedStatus(status: string): boolean {
	return status === "done" || status === "cancelled";
}

export const listSprints = internalQuery({
	args: {
		workspaceId: v.id("workspaces"),
		userId: v.id("users"),
	},
	handler: async (ctx, args) => {
		const role = await getMemberRole(ctx, args.workspaceId, args.userId);
		const accessibleProjectIds = await getAccessibleProjectIds(
			ctx,
			args.workspaceId,
			args.userId,
			role,
		);

		const [projects, allWorkspaceIssues] = await Promise.all([
			ctx.db
				.query("projects")
				.withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
				.collect(),
			ctx.db
				.query("issues")
				.withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
				.collect(),
		]);

		const visibleProjects = projects.filter((p) => {
			if (p.deletedAt) return false;
			if (accessibleProjectIds === null) return true;
			return accessibleProjectIds.has(p._id);
		});

		const issuesBySprintId = new Map<
			string,
			{ total: number; completed: number }
		>();
		for (const issue of allWorkspaceIssues) {
			if (issue.deletedAt || !issue.sprintId) continue;
			const key = issue.sprintId as string;
			const stats = issuesBySprintId.get(key) ?? {
				total: 0,
				completed: 0,
			};
			stats.total++;
			if (isCompletedStatus(issue.status)) stats.completed++;
			issuesBySprintId.set(key, stats);
		}

		const sprintRows = await Promise.all(
			visibleProjects.map(async (project) => {
				const sprints = await ctx.db
					.query("sprints")
					.withIndex("by_project_sort", (q) => q.eq("projectId", project._id))
					.collect();
				return sprints
					.filter((s) => !s.deletedAt)
					.map((sprint) => {
						const stats = issuesBySprintId.get(sprint._id as string) ?? {
							total: 0,
							completed: 0,
						};
						return {
							...sprint,
							issueCount: stats.total,
							completedCount: stats.completed,
							progressPercentage:
								stats.total > 0
									? Math.round((stats.completed / stats.total) * 100)
									: 0,
							projectName: project.name,
						};
					});
			}),
		);

		return sprintRows
			.flat()
			.sort(
				(a, b) =>
					a.projectName.localeCompare(b.projectName) ||
					a.sortOrder - b.sortOrder,
			);
	},
});

// ── 9. Notifications ────────────────────────────────────────────────────

function isSnoozed(n: { snoozedUntil?: number }): boolean {
	return !!n.snoozedUntil && n.snoozedUntil > Date.now();
}

export const listNotifications = internalQuery({
	args: {
		workspaceId: v.id("workspaces"),
		userId: v.id("users"),
		filter: v.optional(v.string()),
		limit: v.optional(v.number()),
	},
	handler: async (ctx, args) => {
		const limit = args.limit ?? 50;
		const filter = args.filter ?? "all";

		const buildQuery = () => {
			if (filter === "unread") {
				return ctx.db
					.query("notifications")
					.withIndex("by_user_workspace_unread", (idx) =>
						idx
							.eq("userId", args.userId)
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
							.eq("userId", args.userId)
							.eq("workspaceId", args.workspaceId)
							.eq("isRead", true),
					)
					.order("desc");
			}
			return ctx.db
				.query("notifications")
				.withIndex("by_user_workspace", (idx) =>
					idx.eq("userId", args.userId).eq("workspaceId", args.workspaceId),
				)
				.order("desc");
		};

		const raw = await buildQuery().take(200);
		const filtered = raw.filter(
			(n) => !n.isArchived && !n.deletedAt && !isSnoozed(n),
		);

		const hasMore = filtered.length > limit;
		const page = hasMore ? filtered.slice(0, limit) : filtered;

		// Batch-fetch entity data for display
		const actorIds = new Set<string>();
		const projectIds = new Set<string>();
		const issueIds = new Set<string>();
		const documentIds = new Set<string>();
		const whiteboardIds = new Set<string>();
		for (const n of page) {
			if (n.actorId) actorIds.add(n.actorId);
			if (n.projectId) projectIds.add(n.projectId);
			if (n.issueId) issueIds.add(n.issueId);
			if (n.documentId) documentIds.add(n.documentId);
			if (n.whiteboardId) whiteboardIds.add(n.whiteboardId);
		}

		const [
			actorResults,
			projectResults,
			issueResults,
			documentResults,
			whiteboardResults,
		] = await Promise.all([
			Promise.all([...actorIds].map((id) => ctx.db.get(id as Id<"users">))),
			Promise.all(
				[...projectIds].map((id) => ctx.db.get(id as Id<"projects">)),
			),
			Promise.all([...issueIds].map((id) => ctx.db.get(id as Id<"issues">))),
			Promise.all(
				[...documentIds].map((id) => ctx.db.get(id as Id<"documents">)),
			),
			Promise.all(
				[...whiteboardIds].map((id) => ctx.db.get(id as Id<"whiteboards">)),
			),
		]);

		const actorMap = new Map<string, { name?: string }>();
		for (const actor of actorResults) {
			if (actor) actorMap.set(actor._id, { name: actor.name });
		}
		const projectMap = new Map<string, { name: string; slug: string }>();
		for (const p of projectResults) {
			if (p) projectMap.set(p._id, { name: p.name, slug: p.slug });
		}
		const issueMap = new Map<
			string,
			{
				identifier: string;
				title: string;
				status: string;
				priority: string;
				assigneeId?: Id<"users">;
				labelIds?: Id<"labels">[];
			}
		>();
		for (const i of issueResults) {
			if (i)
				issueMap.set(i._id, {
					identifier: i.identifier,
					title: i.title,
					status: i.status,
					priority: i.priority,
					assigneeId: i.assigneeId,
					labelIds: i.labelIds,
				});
		}
		const documentMap = new Map<string, { title: string }>();
		for (const d of documentResults) {
			if (d) documentMap.set(d._id, { title: d.title });
		}
		const whiteboardMap = new Map<string, { title: string }>();
		for (const w of whiteboardResults) {
			if (w) whiteboardMap.set(w._id, { title: w.title });
		}

		const notifications = page.map((n) => {
			const actor = n.actorId ? actorMap.get(n.actorId) : null;
			const project = n.projectId ? projectMap.get(n.projectId) : null;
			const issue = n.issueId ? issueMap.get(n.issueId) : null;
			const document = n.documentId ? documentMap.get(n.documentId) : null;
			const whiteboard = n.whiteboardId
				? whiteboardMap.get(n.whiteboardId)
				: null;

			return {
				...n,
				displayType: n.type,
				actorName: actor?.name ?? null,
				actorImage: null as string | null,
				projectName: project?.name ?? null,
				projectSlug: project?.slug ?? null,
				clientName: null as string | null,
				issueIdentifier: issue?.identifier ?? null,
				issueTitle: issue?.title ?? null,
				issueStatus: issue?.status ?? null,
				issuePriority: issue?.priority ?? null,
				issueAssigneeId: issue?.assigneeId ?? null,
				issueLabelIds: issue?.labelIds ?? null,
				taskIdentifier: null as string | null,
				storyIdentifier: null as string | null,
				documentTitle: document?.title ?? null,
				whiteboardTitle: whiteboard?.title ?? null,
				commentBody: null as string | null,
			};
		});

		return { notifications, hasMore };
	},
});

export const unreadNotificationCount = internalQuery({
	args: {
		workspaceId: v.id("workspaces"),
		userId: v.id("users"),
	},
	handler: async (ctx, args) => {
		const unread = await ctx.db
			.query("notifications")
			.withIndex("by_user_workspace_unread", (q) =>
				q
					.eq("userId", args.userId)
					.eq("workspaceId", args.workspaceId)
					.eq("isRead", false),
			)
			.take(500);

		return unread.filter((n) => !n.isArchived && !n.deletedAt && !isSnoozed(n))
			.length;
	},
});

// ── 10. Activity Logs ───────────────────────────────────────────────────

export const listActivityByIssue = internalQuery({
	args: {
		issueId: v.id("issues"),
		limit: v.optional(v.float64()),
	},
	handler: async (ctx, args) => {
		const issue = await ctx.db.get(args.issueId);
		if (!issue || issue.deletedAt) return [];

		const limit = args.limit ?? 100;
		const logs = await ctx.db
			.query("activityLogs")
			.withIndex("by_issue", (q) => q.eq("issueId", args.issueId))
			.order("asc")
			.take(limit);

		return Promise.all(
			logs.map(async (log) => {
				const actor = await ctx.db.get(log.actorId);
				return {
					...log,
					actorName: actor?.name ?? "Unknown",
					actorImage:
						(actor?.avatarStorageId
							? await ctx.storage.getUrl(actor.avatarStorageId)
							: null) ?? actor?.image,
				};
			}),
		);
	},
});

export const listActivityByProject = internalQuery({
	args: {
		projectId: v.id("projects"),
		limit: v.optional(v.float64()),
	},
	handler: async (ctx, args) => {
		const project = await ctx.db.get(args.projectId);
		if (!project || project.deletedAt) return { entries: [], hasMore: false };

		const limit = args.limit ?? 50;
		const logs = await ctx.db
			.query("activityLogs")
			.withIndex("by_project", (q) => q.eq("projectId", args.projectId))
			.order("desc")
			.collect();

		const hasMore = logs.length > limit;
		const entries = logs.slice(0, limit);

		const enriched = await Promise.all(
			entries.map(async (log) => {
				const actor = await ctx.db.get(log.actorId);
				return {
					...log,
					actorName: actor?.name ?? "Unknown",
					actorImage:
						(actor?.avatarStorageId
							? await ctx.storage.getUrl(actor.avatarStorageId)
							: null) ?? actor?.image,
				};
			}),
		);

		return { entries: enriched, hasMore };
	},
});

// ── 11. Milestones ──────────────────────────────────────────────────────

export const listMilestones = internalQuery({
	args: {
		projectId: v.id("projects"),
	},
	handler: async (ctx, args) => {
		const project = await ctx.db.get(args.projectId);
		if (!project || project.deletedAt) return [];

		const milestones = await ctx.db
			.query("milestones")
			.withIndex("by_project_sort", (q) => q.eq("projectId", args.projectId))
			.collect();

		const activeMilestones = milestones.filter((m) => !m.deletedAt);

		return Promise.all(
			activeMilestones.map(async (milestone) => {
				const issues = await ctx.db
					.query("issues")
					.withIndex("by_milestone", (q) => q.eq("milestoneId", milestone._id))
					.collect();

				const activeIssues = issues.filter((i) => !i.deletedAt);
				const issueCount = activeIssues.length;
				const completedCount = activeIssues.filter(
					(i) => i.status === "done" || i.status === "cancelled",
				).length;
				const progressPercentage =
					issueCount > 0 ? Math.round((completedCount / issueCount) * 100) : 0;

				return {
					...milestone,
					issueCount,
					completedCount,
					progressPercentage,
				};
			}),
		);
	},
});

// ── 12. Whiteboards ─────────────────────────────────────────────────────

export const getWhiteboardById = internalQuery({
	args: {
		whiteboardId: v.id("whiteboards"),
	},
	handler: async (ctx, args) => {
		const whiteboard = await ctx.db.get(args.whiteboardId);
		if (!whiteboard || whiteboard.deletedAt) return null;
		return whiteboard;
	},
});

export const listWhiteboards = internalQuery({
	args: {
		workspaceId: v.id("workspaces"),
		projectId: v.optional(v.id("projects")),
		limit: v.optional(v.float64()),
	},
	handler: async (ctx, args) => {
		const limit = args.limit ?? 25;

		const boards = args.projectId
			? (
					await ctx.db
						.query("whiteboards")
						.withIndex("by_project", (q) => q.eq("projectId", args.projectId))
						.collect()
				).filter((b) => b.workspaceId === args.workspaceId)
			: await ctx.db
					.query("whiteboards")
					.withIndex("by_workspace", (q) =>
						q.eq("workspaceId", args.workspaceId),
					)
					.collect();

		// Filter deleted, sort by most recent
		const active = boards
			.filter((b) => !b.deletedAt)
			.sort(
				(a, b) =>
					(b.updatedAt ?? b._creationTime) - (a.updatedAt ?? a._creationTime),
			)
			.slice(0, limit);

		return active.map((b) => ({
			id: b._id,
			title: b.title,
			icon: b.icon ?? null,
			projectId: b.projectId ?? null,
			createdBy: b.createdBy,
			updatedAt: b.updatedAt ?? b._creationTime,
			elementCount: countSceneElements(b.sceneData),
		}));
	},
});

export const getWhiteboardDetails = internalQuery({
	args: {
		whiteboardId: v.id("whiteboards"),
	},
	handler: async (ctx, args) => {
		const board = await ctx.db.get(args.whiteboardId);
		if (!board || board.deletedAt) return null;

		const creator = await ctx.db.get(board.createdBy);
		const lastEditor = board.lastEditedBy
			? await ctx.db.get(board.lastEditedBy)
			: null;
		const project = board.projectId ? await ctx.db.get(board.projectId) : null;

		return {
			id: board._id,
			title: board.title,
			icon: board.icon ?? null,
			projectId: board.projectId ?? null,
			projectName: project?.name ?? null,
			createdBy: board.createdBy,
			creatorName: creator?.name ?? "Unknown",
			lastEditedBy: board.lastEditedBy ?? null,
			lastEditorName: lastEditor?.name ?? null,
			updatedAt: board.updatedAt ?? board._creationTime,
			createdAt: board._creationTime,
			elementCount: countSceneElements(board.sceneData),
			contentSummary: summarizeSceneForTool(board.sceneData),
			visibility: board.visibility ?? "workspace",
			isPinned: board.isPinned ?? false,
		};
	},
});

/** Count non-deleted elements in Excalidraw scene JSON. */
function countSceneElements(sceneData?: string | null): number {
	if (!sceneData) return 0;
	try {
		const parsed = JSON.parse(sceneData);
		if (!Array.isArray(parsed)) return 0;
		return parsed.filter((el: { isDeleted?: boolean }) => el && !el.isDeleted)
			.length;
	} catch {
		return 0;
	}
}

/** Produce a short summary of board elements for AI tools. */
function summarizeSceneForTool(sceneData?: string | null): string | null {
	if (!sceneData) return null;
	try {
		const parsed = JSON.parse(sceneData);
		if (!Array.isArray(parsed)) return null;
		type El = {
			type: string;
			text?: string;
			isDeleted?: boolean;
			containerId?: string;
			boundElements?: Array<{ id: string; type: string }>;
			label?: { text?: string };
		};
		const elements = (parsed as El[]).filter((el) => el && !el.isDeleted);
		if (elements.length === 0) return "Empty canvas";

		const typeCounts: Record<string, number> = {};
		const labels: string[] = [];
		for (const el of elements) {
			typeCounts[el.type] = (typeCounts[el.type] || 0) + 1;
			const labelText =
				el.label?.text ??
				(el.type === "text" && !el.containerId ? el.text : null);
			if (labelText && labels.length < 15) {
				labels.push(
					labelText.length > 40 ? `${labelText.slice(0, 37)}...` : labelText,
				);
			}
		}

		const parts = Object.entries(typeCounts)
			.map(([type, count]) => `${count} ${type}${count > 1 ? "s" : ""}`)
			.join(", ");
		const summary = `${elements.length} elements: ${parts}`;
		if (labels.length > 0) {
			return `${summary}. Labels: ${labels.join(", ")}`;
		}
		return summary;
	} catch {
		return null;
	}
}
