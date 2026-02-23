import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { type MutationCtx, mutation, query } from "./_generated/server";
import { logActivity } from "./lib/activity";
import {
	canAccessProject,
	getAccessibleProjectIds,
	requireWorkspaceMember,
} from "./lib/auth";
import { createNotification, notifySubscribers } from "./lib/notifications";
import { fractionalIndex, generateIdentifier } from "./lib/utils";

// ── Shared Validators ──────────────────────────────────────────────────────

const issueStatusValidator = v.union(
	v.literal("triage"),
	v.literal("backlog"),
	v.literal("todo"),
	v.literal("in_progress"),
	v.literal("in_review"),
	v.literal("done"),
	v.literal("cancelled"),
);

const issuePriorityValidator = v.union(
	v.literal("urgent"),
	v.literal("high"),
	v.literal("medium"),
	v.literal("low"),
	v.literal("no_priority"),
);

const issueTypeValidator = v.union(
	v.literal("issue"),
	v.literal("bug"),
	v.literal("improvement"),
	v.literal("feature"),
);

// ── Helpers ────────────────────────────────────────────────────────────────

function isCompletedStatus(status: string): boolean {
	return status === "done" || status === "cancelled";
}

async function ensureAssigneeInWorkspace(
	ctx: MutationCtx,
	workspaceId: Id<"workspaces">,
	assigneeId: Id<"users">,
) {
	const membership = await ctx.db
		.query("workspaceMembers")
		.withIndex("by_workspace_user", (q) =>
			q.eq("workspaceId", workspaceId).eq("userId", assigneeId),
		)
		.unique();
	if (!membership) {
		throw new ConvexError("Assignee must be a member of this workspace");
	}
}

// ── Shared Return Validators ────────────────────────────────────────────────

const issueDocValidator = v.object({
	_id: v.id("issues"),
	_creationTime: v.number(),
	workspaceId: v.id("workspaces"),
	projectId: v.optional(v.id("projects")),
	sprintId: v.optional(v.id("sprints")),
	milestoneId: v.optional(v.id("milestones")),
	parentId: v.optional(v.id("issues")),
	identifier: v.string(),
	title: v.string(),
	description: v.optional(v.string()),
	status: v.string(),
	priority: v.string(),
	type: v.string(),
	assigneeId: v.optional(v.id("users")),
	labelIds: v.optional(v.array(v.id("labels"))),
	startDate: v.optional(v.number()),
	dueDate: v.optional(v.number()),
	sortOrder: v.number(),
	estimate: v.optional(v.number()),
	tags: v.optional(v.array(v.string())),
	createdBy: v.id("users"),
	completedAt: v.optional(v.number()),
	updatedAt: v.optional(v.number()),
	deletedAt: v.optional(v.number()),
	gitBranchName: v.optional(v.string()),
	linkedDocumentIds: v.optional(v.array(v.id("documents"))),
	linkedWhiteboardIds: v.optional(v.array(v.id("whiteboards"))),
});

const issueWithParentValidator = v.object({
	_id: v.id("issues"),
	_creationTime: v.number(),
	workspaceId: v.id("workspaces"),
	projectId: v.optional(v.id("projects")),
	sprintId: v.optional(v.id("sprints")),
	milestoneId: v.optional(v.id("milestones")),
	parentId: v.optional(v.id("issues")),
	identifier: v.string(),
	title: v.string(),
	description: v.optional(v.string()),
	status: v.string(),
	priority: v.string(),
	type: v.string(),
	assigneeId: v.optional(v.id("users")),
	labelIds: v.optional(v.array(v.id("labels"))),
	startDate: v.optional(v.number()),
	dueDate: v.optional(v.number()),
	sortOrder: v.number(),
	estimate: v.optional(v.number()),
	tags: v.optional(v.array(v.string())),
	createdBy: v.id("users"),
	completedAt: v.optional(v.number()),
	updatedAt: v.optional(v.number()),
	deletedAt: v.optional(v.number()),
	gitBranchName: v.optional(v.string()),
	linkedDocumentIds: v.optional(v.array(v.id("documents"))),
	linkedWhiteboardIds: v.optional(v.array(v.id("whiteboards"))),
	parent: v.union(
		v.object({
			_id: v.id("issues"),
			identifier: v.string(),
			title: v.string(),
			status: v.string(),
		}),
		v.null(),
	),
});

// ── Queries (10) ───────────────────────────────────────────────────────────

/** Paginated list of issues in a workspace, with optional filters */
export const listByWorkspace = query({
	args: {
		workspaceId: v.id("workspaces"),
		status: v.optional(issueStatusValidator),
		priority: v.optional(issuePriorityValidator),
		assigneeId: v.optional(v.id("users")),
		projectId: v.optional(v.id("projects")),
		sprintId: v.optional(v.id("sprints")),
		milestoneId: v.optional(v.id("milestones")),
		labelId: v.optional(v.id("labels")),
		cursor: v.optional(v.number()),
		limit: v.optional(v.float64()),
	},
	returns: v.object({
		issues: v.array(issueDocValidator),
		nextCursor: v.optional(v.number()),
		hasMore: v.boolean(),
	}),
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

		const pageSize = args.limit ?? 50;
		// Overfetch factor accounts for in-memory filters (RBAC, deleted, status, etc.)
		const fetchLimit = pageSize * 4;

		// Smart index selection: use narrower index when a filter is provided.
		// Order descending so newest issues come first, enabling cursor-based pagination.
		const buildIssueQuery = () => {
			if (args.projectId) {
				const projectId = args.projectId;
				return ctx.db
					.query("issues")
					.withIndex("by_project", (q) => q.eq("projectId", projectId))
					.order("desc");
			}
			if (args.assigneeId) {
				const assigneeId = args.assigneeId;
				return ctx.db
					.query("issues")
					.withIndex("by_workspace_assignee", (q) =>
						q.eq("workspaceId", args.workspaceId).eq("assigneeId", assigneeId),
					)
					.order("desc");
			}
			if (args.status) {
				return ctx.db
					.query("issues")
					.withIndex("by_workspace_status", (q) =>
						q.eq("workspaceId", args.workspaceId).eq("status", args.status!),
					)
					.order("desc");
			}
			return ctx.db
				.query("issues")
				.withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
				.order("desc");
		};

		const allIssues = await buildIssueQuery().take(fetchLimit);

		// Apply filters and pagination
		const filtered = allIssues.filter((issue) => {
			if (issue.deletedAt) return false;
			// RBAC: members only see issues in accessible projects or assigned to them
			if (accessibleProjectIds !== null) {
				const inAccessibleProject =
					issue.projectId && accessibleProjectIds.has(issue.projectId);
				const isAssigned = issue.assigneeId === userId;
				const isCreator = issue.createdBy === userId;
				if (!inAccessibleProject && !isAssigned && !isCreator) return false;
			}
			if (args.status && issue.status !== args.status) return false;
			if (args.priority && issue.priority !== args.priority) return false;
			if (args.assigneeId && issue.assigneeId !== args.assigneeId) return false;
			if (args.projectId && issue.projectId !== args.projectId) return false;
			if (args.sprintId && issue.sprintId !== args.sprintId) return false;
			if (args.milestoneId && issue.milestoneId !== args.milestoneId)
				return false;
			if (
				args.labelId &&
				(!issue.labelIds || !issue.labelIds.includes(args.labelId))
			)
				return false;
			if (args.cursor && issue._creationTime <= args.cursor) return false;
			return true;
		});

		// Already sorted descending by _creationTime from the index order
		const page = filtered.slice(0, pageSize);
		const nextCursor =
			page.length === pageSize
				? page[page.length - 1]._creationTime
				: undefined;

		return {
			issues: page,
			nextCursor,
			hasMore: page.length === pageSize,
		};
	},
});

/** Issues for a specific project, ordered by sortOrder */
export const listByProject = query({
	args: {
		projectId: v.id("projects"),
		status: v.optional(issueStatusValidator),
		priority: v.optional(issuePriorityValidator),
		sprintId: v.optional(v.id("sprints")),
		milestoneId: v.optional(v.id("milestones")),
		showSubIssues: v.optional(v.boolean()),
	},
	returns: v.array(issueDocValidator),
	handler: async (ctx, args) => {
		const project = await ctx.db.get(args.projectId);
		if (!project || project.deletedAt) return [];
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

		const issues = await ctx.db
			.query("issues")
			.withIndex("by_project_sort", (q) => q.eq("projectId", args.projectId))
			.collect();

		return issues.filter((issue) => {
			if (issue.deletedAt) return false;
			if (args.status && issue.status !== args.status) return false;
			if (args.priority && issue.priority !== args.priority) return false;
			if (args.sprintId && issue.sprintId !== args.sprintId) return false;
			if (args.milestoneId && issue.milestoneId !== args.milestoneId)
				return false;
			// By default, only return top-level issues (no parent)
			if (!args.showSubIssues && issue.parentId) return false;
			return true;
		});
	},
});

/** Issues for a specific sprint, ordered by sortOrder */
export const listBySprint = query({
	args: {
		sprintId: v.id("sprints"),
	},
	returns: v.array(issueDocValidator),
	handler: async (ctx, args) => {
		const sprint = await ctx.db.get(args.sprintId);
		if (!sprint || sprint.deletedAt) return [];

		const project = await ctx.db.get(sprint.projectId);
		if (!project || project.deletedAt) return [];
		const { userId, member } = await requireWorkspaceMember(
			ctx,
			project.workspaceId,
		);

		if (member.role !== "admin") {
			const hasAccess = await canAccessProject(
				ctx,
				sprint.projectId,
				userId,
				member.role as "admin" | "member",
			);
			if (!hasAccess) return [];
		}

		const issues = await ctx.db
			.query("issues")
			.withIndex("by_sprint_sort", (q) => q.eq("sprintId", args.sprintId))
			.collect();

		return issues.filter((issue) => !issue.deletedAt);
	},
});

/** Issues for a specific milestone (legacy), ordered by sortOrder */
export const listByMilestone = query({
	args: {
		milestoneId: v.id("milestones"),
	},
	returns: v.array(issueDocValidator),
	handler: async (ctx, args) => {
		const milestone = await ctx.db.get(args.milestoneId);
		if (!milestone || milestone.deletedAt) return [];

		const project = await ctx.db.get(milestone.projectId);
		if (!project || project.deletedAt) return [];
		const { userId, member } = await requireWorkspaceMember(
			ctx,
			project.workspaceId,
		);

		// RBAC: check project access for member users
		if (member.role !== "admin") {
			const hasAccess = await canAccessProject(
				ctx,
				milestone.projectId,
				userId,
				member.role as "admin" | "member",
			);
			if (!hasAccess) return [];
		}

		const issues = await ctx.db
			.query("issues")
			.withIndex("by_milestone_sort", (q) =>
				q.eq("milestoneId", args.milestoneId),
			)
			.collect();

		return issues.filter((issue) => !issue.deletedAt);
	},
});

/** Issues assigned to a specific user across the workspace */
export const listByAssignee = query({
	args: {
		workspaceId: v.id("workspaces"),
		assigneeId: v.id("users"),
	},
	returns: v.array(issueDocValidator),
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

		const issues = await ctx.db
			.query("issues")
			.withIndex("by_workspace_assignee", (q) =>
				q.eq("workspaceId", args.workspaceId).eq("assigneeId", args.assigneeId),
			)
			.collect();

		return issues.filter((issue) => {
			if (issue.deletedAt) return false;
			if (accessibleProjectIds !== null) {
				const inAccessibleProject =
					issue.projectId && accessibleProjectIds.has(issue.projectId);
				const isAssigned = issue.assigneeId === userId;
				const isCreator = issue.createdBy === userId;
				if (!inAccessibleProject && !isAssigned && !isCreator) return false;
			}
			return true;
		});
	},
});

/** Current user's issues in a workspace (for My Issues page) */
export const myIssues = query({
	args: {
		workspaceId: v.id("workspaces"),
	},
	returns: v.array(issueDocValidator),
	handler: async (ctx, args) => {
		const { userId } = await requireWorkspaceMember(ctx, args.workspaceId);

		const issues = await ctx.db
			.query("issues")
			.withIndex("by_workspace_assignee", (q) =>
				q.eq("workspaceId", args.workspaceId).eq("assigneeId", userId),
			)
			.collect();

		// RBAC: myIssues already filters by assigneeId === userId
		// Per edge case rule, assigned issues are always visible regardless of project access
		return issues.filter((issue) => !issue.deletedAt);
	},
});

/** Single issue by ID with workspace membership check */
export const getById = query({
	args: {
		issueId: v.id("issues"),
	},
	returns: v.union(issueWithParentValidator, v.null()),
	handler: async (ctx, args) => {
		const issue = await ctx.db.get(args.issueId);
		if (!issue || issue.deletedAt) return null;
		const { userId, member } = await requireWorkspaceMember(
			ctx,
			issue.workspaceId,
		);

		// RBAC: check access for member users
		if (member.role !== "admin" && issue.projectId) {
			const hasAccess = await canAccessProject(
				ctx,
				issue.projectId,
				userId,
				member.role as "admin" | "member",
			);
			if (
				!hasAccess &&
				issue.assigneeId !== userId &&
				issue.createdBy !== userId
			)
				return null;
		}

		// Include parent data if this is a sub-issue
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

/** Single issue by workspace + identifier string (e.g., "CLV-042") */
export const getByIdentifier = query({
	args: {
		workspaceId: v.id("workspaces"),
		identifier: v.string(),
	},
	returns: v.union(issueWithParentValidator, v.null()),
	handler: async (ctx, args) => {
		const { userId, member } = await requireWorkspaceMember(
			ctx,
			args.workspaceId,
		);

		// Case-insensitive: normalize to uppercase for lookup
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

		// RBAC: check access for member users
		if (member.role !== "admin" && issue.projectId) {
			const hasAccess = await canAccessProject(
				ctx,
				issue.projectId,
				userId,
				member.role as "admin" | "member",
			);
			if (
				!hasAccess &&
				issue.assigneeId !== userId &&
				issue.createdBy !== userId
			)
				return null;
		}

		// Include parent data if this is a sub-issue (matching getById shape)
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

/** Full-text search on issue titles within a workspace */
export const search = query({
	args: {
		workspaceId: v.id("workspaces"),
		searchTerm: v.string(),
	},
	returns: v.array(issueDocValidator),
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
				const isAssigned = issue.assigneeId === userId;
				const isCreator = issue.createdBy === userId;
				if (!inAccessibleProject && !isAssigned && !isCreator) return false;
			}
			return true;
		});
	},
});

/** Sub-issues of a parent, ordered by sortOrder, with completion stats */
export const getSubIssues = query({
	args: {
		parentId: v.id("issues"),
	},
	returns: v.union(
		v.object({
			subIssues: v.array(issueDocValidator),
			stats: v.object({
				total: v.number(),
				completed: v.number(),
				inProgress: v.number(),
			}),
		}),
		v.null(),
	),
	handler: async (ctx, args) => {
		const parent = await ctx.db.get(args.parentId);
		if (!parent || parent.deletedAt) return null;
		const { userId, member } = await requireWorkspaceMember(
			ctx,
			parent.workspaceId,
		);

		// RBAC: check parent issue's project access
		if (member.role !== "admin" && parent.projectId) {
			const hasAccess = await canAccessProject(
				ctx,
				parent.projectId,
				userId,
				member.role as "admin" | "member",
			);
			if (
				!hasAccess &&
				parent.assigneeId !== userId &&
				parent.createdBy !== userId
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
		const completed = activeChildren.filter((c) =>
			isCompletedStatus(c.status),
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

/** Progress stats for a parent issue based on sub-issue completion */
export const getProgress = query({
	args: {
		issueId: v.id("issues"),
	},
	returns: v.union(
		v.object({
			subIssueCount: v.number(),
			completedCount: v.number(),
			progressPercentage: v.number(),
		}),
		v.null(),
	),
	handler: async (ctx, args) => {
		const issue = await ctx.db.get(args.issueId);
		if (!issue || issue.deletedAt) return null;
		const { userId, member } = await requireWorkspaceMember(
			ctx,
			issue.workspaceId,
		);

		// RBAC: check issue's project access
		if (member.role !== "admin" && issue.projectId) {
			const hasAccess = await canAccessProject(
				ctx,
				issue.projectId,
				userId,
				member.role as "admin" | "member",
			);
			if (
				!hasAccess &&
				issue.assigneeId !== userId &&
				issue.createdBy !== userId
			)
				return null;
		}

		const children = await ctx.db
			.query("issues")
			.withIndex("by_parent", (q) => q.eq("parentId", args.issueId))
			.collect();

		const activeChildren = children.filter((c) => !c.deletedAt);
		if (activeChildren.length === 0) return null;

		const subIssueCount = activeChildren.length;
		const completedCount = activeChildren.filter((c) =>
			isCompletedStatus(c.status),
		).length;
		const progressPercentage = Math.round(
			(completedCount / subIssueCount) * 100,
		);

		return { subIssueCount, completedCount, progressPercentage };
	},
});

// ── Mutations (11) ─────────────────────────────────────────────────────────

/** Create a new issue with auto-generated identifier */
export const create = mutation({
	args: {
		workspaceId: v.id("workspaces"),
		projectId: v.optional(v.id("projects")),
		sprintId: v.optional(v.id("sprints")),
		milestoneId: v.optional(v.id("milestones")),
		parentId: v.optional(v.id("issues")),
		title: v.string(),
		description: v.optional(v.string()),
		status: v.optional(issueStatusValidator),
		priority: v.optional(issuePriorityValidator),
		type: v.optional(issueTypeValidator),
		assigneeId: v.optional(v.id("users")),
		labelIds: v.optional(v.array(v.id("labels"))),
		startDate: v.optional(v.number()),
		dueDate: v.optional(v.number()),
		estimate: v.optional(v.float64()),
		tags: v.optional(v.array(v.string())),
	},
	returns: v.object({
		issueId: v.id("issues"),
		identifier: v.string(),
	}),
	handler: async (ctx, args) => {
		const { userId, member } = await requireWorkspaceMember(
			ctx,
			args.workspaceId,
		);

		// Get workspace settings for identifier generation
		const settings = await ctx.db
			.query("workspaceSettings")
			.withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
			.unique();

		if (!settings) {
			throw new ConvexError("Workspace settings not found");
		}

		const prefix = settings.issuePrefix ?? settings.storyPrefix;
		const nextNumber = settings.nextIssueNumber ?? 1;
		const identifier = generateIdentifier(prefix, nextNumber);

		// Atomically increment the counter
		await ctx.db.patch(settings._id, {
			issuePrefix: prefix,
			nextIssueNumber: nextNumber + 1,
		});

		// Validate foreign keys
		const explicitProjectId = args.projectId;
		if (explicitProjectId) {
			const project = await ctx.db.get(explicitProjectId);
			if (!project || project.deletedAt) {
				throw new ConvexError("Project not found");
			}
			if (project.workspaceId !== args.workspaceId) {
				throw new ConvexError("Project must belong to the same workspace");
			}
		}

		let sprintProjectId: Id<"projects"> | undefined;
		if (args.sprintId) {
			const sprint = await ctx.db.get(args.sprintId);
			if (!sprint || sprint.deletedAt) {
				throw new ConvexError("Sprint not found");
			}
			const sprintProject = await ctx.db.get(sprint.projectId);
			if (!sprintProject || sprintProject.deletedAt) {
				throw new ConvexError("Sprint project not found");
			}
			if (sprintProject.workspaceId !== args.workspaceId) {
				throw new ConvexError("Sprint must belong to the same workspace");
			}
			sprintProjectId = sprintProject._id;
		}

		let milestoneProjectId: Id<"projects"> | undefined;
		if (args.milestoneId) {
			const milestone = await ctx.db.get(args.milestoneId);
			if (!milestone || milestone.deletedAt) {
				throw new ConvexError("Milestone not found");
			}
			const milestoneProject = await ctx.db.get(milestone.projectId);
			if (!milestoneProject || milestoneProject.deletedAt) {
				throw new ConvexError("Milestone project not found");
			}
			if (milestoneProject.workspaceId !== args.workspaceId) {
				throw new ConvexError("Milestone must belong to the same workspace");
			}
			milestoneProjectId = milestoneProject._id;
		}

		if (
			explicitProjectId &&
			sprintProjectId &&
			explicitProjectId !== sprintProjectId
		) {
			throw new ConvexError("Sprint does not belong to the target project");
		}
		if (
			explicitProjectId &&
			milestoneProjectId &&
			explicitProjectId !== milestoneProjectId
		) {
			throw new ConvexError("Milestone does not belong to the target project");
		}
		if (
			sprintProjectId &&
			milestoneProjectId &&
			sprintProjectId !== milestoneProjectId
		) {
			throw new ConvexError(
				"Sprint and milestone must belong to the same project",
			);
		}

		let projectId = explicitProjectId ?? sprintProjectId ?? milestoneProjectId;

		if (args.parentId) {
			const parent = await ctx.db.get(args.parentId);
			if (!parent || parent.deletedAt) {
				throw new ConvexError("Parent issue not found");
			}
			if (parent.workspaceId !== args.workspaceId) {
				throw new ConvexError("Parent issue must be in the same workspace");
			}
			if (projectId && parent.projectId && projectId !== parent.projectId) {
				throw new ConvexError(
					"Parent issue must belong to the same project as the child issue",
				);
			}
			if (!projectId && parent.projectId) {
				projectId = parent.projectId;
			}
		}
		// RBAC: verify project access for member users after all project resolution.
		if (member.role !== "admin" && projectId) {
			const hasAccess = await canAccessProject(
				ctx,
				projectId,
				userId,
				member.role as "admin" | "member",
			);
			if (!hasAccess)
				throw new ConvexError("You don't have access to this project");
		}
		if (args.assigneeId) {
			await ensureAssigneeInWorkspace(ctx, args.workspaceId, args.assigneeId);
		}

		// Compute sortOrder: append at end of sprint/project bucket
		let lastSortOrder: number | null = null;
		if (args.sprintId) {
			const last = await ctx.db
				.query("issues")
				.withIndex("by_sprint_sort", (q) => q.eq("sprintId", args.sprintId))
				.order("desc")
				.first();
			if (last) lastSortOrder = last.sortOrder;
		} else if (args.milestoneId) {
			const last = await ctx.db
				.query("issues")
				.withIndex("by_milestone_sort", (q) =>
					q.eq("milestoneId", args.milestoneId),
				)
				.order("desc")
				.first();
			if (last) lastSortOrder = last.sortOrder;
		} else if (projectId) {
			const last = await ctx.db
				.query("issues")
				.withIndex("by_project_sort", (q) => q.eq("projectId", projectId))
				.order("desc")
				.first();
			if (last) lastSortOrder = last.sortOrder;
		}
		const sortOrder = fractionalIndex(lastSortOrder, null);

		const status = args.status ?? "backlog";

		const issueId = await ctx.db.insert("issues", {
			workspaceId: args.workspaceId,
			projectId,
			sprintId: args.sprintId,
			milestoneId: args.milestoneId,
			parentId: args.parentId,
			identifier,
			title: args.title,
			description: args.description,
			status,
			priority: args.priority ?? "no_priority",
			type: args.type ?? "issue",
			assigneeId: args.assigneeId,
			labelIds: args.labelIds,
			startDate: args.startDate,
			dueDate: args.dueDate,
			sortOrder,
			estimate: args.estimate,
			tags: args.tags,
			createdBy: userId,
			completedAt: isCompletedStatus(status) ? Date.now() : undefined,
		});

		// Activity log
		await logActivity(ctx, {
			workspaceId: args.workspaceId,
			entityType: "issue",
			entityId: issueId,
			action: "created",
			actorId: userId,
			description: `created issue "${identifier}: ${args.title}"`,
			issueId,
			projectId,
			metadata: JSON.stringify({ identifier }),
		});

		// Auto-subscribe creator
		await autoSubscribe(ctx, issueId, userId);

		// Notify assignee if set and auto-subscribe them
		if (args.assigneeId) {
			await autoSubscribe(ctx, issueId, args.assigneeId);
			const actor = await ctx.db.get(userId);
			const actorName = actor?.name ?? "Someone";
			await createNotification(ctx, {
				userId: args.assigneeId,
				workspaceId: args.workspaceId,
				type: "issue_assigned",
				title: "Issue assigned to you",
				body: `${actorName} assigned '${identifier}: ${args.title}' to you`,
				issueId,
				projectId,
				actorId: userId,
			});
		}

		// Schedule RAG indexing (async, non-blocking)
		await ctx.scheduler.runAfter(
			0,
			internal.ai.indexing.issueIndexer.indexIssue,
			{ issueId },
		);

		return { issueId, identifier };
	},
});

/** Partial patch of issue fields */
export const update = mutation({
	args: {
		issueId: v.id("issues"),
		title: v.optional(v.string()),
		description: v.optional(v.string()),
		status: v.optional(issueStatusValidator),
		priority: v.optional(issuePriorityValidator),
		type: v.optional(issueTypeValidator),
		assigneeId: v.optional(v.id("users")),
		projectId: v.optional(v.id("projects")),
		sprintId: v.optional(v.id("sprints")),
		milestoneId: v.optional(v.id("milestones")),
		labelIds: v.optional(v.array(v.id("labels"))),
		startDate: v.optional(v.number()),
		dueDate: v.optional(v.number()),
		estimate: v.optional(v.float64()),
		tags: v.optional(v.array(v.string())),
		gitBranchName: v.optional(v.string()),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const issue = await ctx.db.get(args.issueId);
		if (!issue || issue.deletedAt) {
			throw new ConvexError("Issue not found");
		}
		const { userId, member } = await requireWorkspaceMember(
			ctx,
			issue.workspaceId,
		);

		// RBAC: verify project access for member users
		if (member.role !== "admin" && issue.projectId) {
			const hasAccess = await canAccessProject(
				ctx,
				issue.projectId,
				userId,
				member.role as "admin" | "member",
			);
			if (
				!hasAccess &&
				issue.assigneeId !== userId &&
				issue.createdBy !== userId
			) {
				throw new ConvexError("You don't have access to this issue's project");
			}
		}

		let targetProjectId = args.projectId ?? issue.projectId;

		if (args.projectId) {
			const project = await ctx.db.get(args.projectId);
			if (!project || project.deletedAt) {
				throw new ConvexError("Project not found");
			}
			if (project.workspaceId !== issue.workspaceId) {
				throw new ConvexError("Project must belong to the same workspace");
			}
		}
		if (args.assigneeId) {
			await ensureAssigneeInWorkspace(ctx, issue.workspaceId, args.assigneeId);
		}

		const resolvedSprintId =
			args.sprintId !== undefined ? args.sprintId : issue.sprintId;
		const resolvedMilestoneId =
			args.milestoneId !== undefined ? args.milestoneId : issue.milestoneId;

		if (resolvedSprintId) {
			const sprint = await ctx.db.get(resolvedSprintId);
			if (!sprint || sprint.deletedAt) {
				throw new ConvexError("Sprint not found");
			}
			const sprintProject = await ctx.db.get(sprint.projectId);
			if (!sprintProject || sprintProject.deletedAt) {
				throw new ConvexError("Sprint project not found");
			}
			if (sprintProject.workspaceId !== issue.workspaceId) {
				throw new ConvexError("Sprint must belong to the same workspace");
			}
			if (targetProjectId && sprint.projectId !== targetProjectId) {
				throw new ConvexError("Sprint does not belong to the target project");
			}
			if (!targetProjectId) {
				targetProjectId = sprintProject._id;
			}
		}

		if (resolvedMilestoneId) {
			const milestone = await ctx.db.get(resolvedMilestoneId);
			if (!milestone || milestone.deletedAt) {
				throw new ConvexError("Milestone not found");
			}
			const milestoneProject = await ctx.db.get(milestone.projectId);
			if (!milestoneProject || milestoneProject.deletedAt) {
				throw new ConvexError("Milestone project not found");
			}
			if (milestoneProject.workspaceId !== issue.workspaceId) {
				throw new ConvexError("Milestone must belong to the same workspace");
			}
			if (targetProjectId && milestone.projectId !== targetProjectId) {
				throw new ConvexError(
					"Milestone does not belong to the target project",
				);
			}
			if (!targetProjectId) {
				targetProjectId = milestoneProject._id;
			}
		}

		const isProjectChanged = targetProjectId !== issue.projectId;
		const isSprintChanged =
			args.sprintId !== undefined && args.sprintId !== issue.sprintId;
		const isMilestoneChanged =
			args.milestoneId !== undefined && args.milestoneId !== issue.milestoneId;

		if (
			member.role !== "admin" &&
			targetProjectId &&
			(isProjectChanged || isSprintChanged || isMilestoneChanged)
		) {
			const hasTargetAccess = await canAccessProject(
				ctx,
				targetProjectId,
				userId,
				member.role as "admin" | "member",
			);
			if (!hasTargetAccess) {
				throw new ConvexError("You don't have access to the target project");
			}
		}

		const { issueId, ...updates } = args;
		const patch: Record<string, unknown> = {
			...updates,
			projectId: targetProjectId ?? undefined,
			updatedAt: Date.now(),
		};

		// Handle completedAt logic for status changes
		if (args.status) {
			const oldStatus = issue.status;
			if (isCompletedStatus(args.status) && !isCompletedStatus(oldStatus)) {
				patch.completedAt = Date.now();
			}
			if (!isCompletedStatus(args.status) && isCompletedStatus(oldStatus)) {
				patch.completedAt = undefined;
			}
		}

		await ctx.db.patch(issueId, patch);

		// Activity log -- log a separate entry per changed field
		const baseLog = {
			workspaceId: issue.workspaceId,
			entityType: "issue" as const,
			entityId: issueId,
			action: "updated",
			actorId: userId,
			issueId,
			projectId: issue.projectId,
		};
		let logged = false;

		if (args.title !== undefined && args.title !== issue.title) {
			await logActivity(ctx, {
				...baseLog,
				description: `changed title on ${issue.identifier}`,
				field: "title",
				oldValue: issue.title,
				newValue: args.title,
			});
			logged = true;
		}

		if (args.status && args.status !== issue.status) {
			const oldLabel = issue.status.replace(/_/g, " ");
			const newLabel = args.status.replace(/_/g, " ");
			await logActivity(ctx, {
				...baseLog,
				action: "status_changed",
				description: `changed status from ${oldLabel} to ${newLabel}`,
				field: "status",
				oldValue: issue.status,
				newValue: args.status,
			});
			logged = true;
		}

		if (args.priority && args.priority !== issue.priority) {
			const oldLabel = issue.priority.replace(/_/g, " ");
			const newLabel = args.priority.replace(/_/g, " ");
			await logActivity(ctx, {
				...baseLog,
				description: `changed priority from ${oldLabel} to ${newLabel}`,
				field: "priority",
				oldValue: issue.priority,
				newValue: args.priority,
			});
			logged = true;
		}

		if (args.type && args.type !== issue.type) {
			await logActivity(ctx, {
				...baseLog,
				description: `changed type from ${issue.type} to ${args.type}`,
				field: "type",
				oldValue: issue.type,
				newValue: args.type,
			});
			logged = true;
		}

		if (args.assigneeId !== undefined && args.assigneeId !== issue.assigneeId) {
			const oldName = issue.assigneeId
				? ((await ctx.db.get(issue.assigneeId))?.name ?? "someone")
				: "unassigned";
			const newName = args.assigneeId
				? ((await ctx.db.get(args.assigneeId))?.name ?? "someone")
				: "unassigned";
			await logActivity(ctx, {
				...baseLog,
				action: "assigned",
				description: `assigned issue from ${oldName} to ${newName}`,
				field: "assigneeId",
				oldValue: issue.assigneeId ?? undefined,
				newValue: args.assigneeId ?? undefined,
			});
			logged = true;
		}

		if (args.projectId !== undefined && args.projectId !== issue.projectId) {
			const oldName = issue.projectId
				? ((await ctx.db.get(issue.projectId))?.name ?? "unknown")
				: "none";
			const newName = args.projectId
				? ((await ctx.db.get(args.projectId))?.name ?? "unknown")
				: "none";
			await logActivity(ctx, {
				...baseLog,
				description: `moved from project ${oldName} to ${newName}`,
				field: "projectId",
				oldValue: oldName,
				newValue: newName,
			});
			logged = true;
		}

		if (
			args.milestoneId !== undefined &&
			args.milestoneId !== issue.milestoneId
		) {
			const oldName = issue.milestoneId
				? ((await ctx.db.get(issue.milestoneId))?.name ?? "unknown")
				: "none";
			const newName = args.milestoneId
				? ((await ctx.db.get(args.milestoneId))?.name ?? "unknown")
				: "none";
			await logActivity(ctx, {
				...baseLog,
				description: `changed sprint from ${oldName} to ${newName}`,
				field: "milestoneId",
				oldValue: oldName,
				newValue: newName,
			});
			logged = true;
		}

		if (args.sprintId !== undefined && args.sprintId !== issue.sprintId) {
			const oldName = issue.sprintId
				? ((await ctx.db.get(issue.sprintId))?.name ?? "unknown")
				: "none";
			const newName = args.sprintId
				? ((await ctx.db.get(args.sprintId))?.name ?? "unknown")
				: "none";
			await logActivity(ctx, {
				...baseLog,
				description: `changed sprint from ${oldName} to ${newName}`,
				field: "sprintId",
				oldValue: oldName,
				newValue: newName,
			});
			logged = true;
		}

		if (args.labelIds !== undefined) {
			const oldIds = new Set(issue.labelIds ?? []);
			const newIds = new Set(args.labelIds);
			const added = args.labelIds.filter((id) => !oldIds.has(id));
			const removed = (issue.labelIds ?? []).filter((id) => !newIds.has(id));
			for (const id of added) {
				const label = await ctx.db.get(id);
				await logActivity(ctx, {
					...baseLog,
					description: `added label ${label?.name ?? "unknown"}`,
					field: "labelIds",
					newValue: label?.name ?? "unknown",
				});
				logged = true;
			}
			for (const id of removed) {
				const label = await ctx.db.get(id);
				await logActivity(ctx, {
					...baseLog,
					description: `removed label ${label?.name ?? "unknown"}`,
					field: "labelIds",
					oldValue: label?.name ?? "unknown",
				});
				logged = true;
			}
		}

		if (
			args.description !== undefined &&
			args.description !== issue.description
		) {
			await logActivity(ctx, {
				...baseLog,
				description: `updated description on ${issue.identifier}`,
				field: "description",
			});
			logged = true;
		}

		if (args.estimate !== undefined && args.estimate !== issue.estimate) {
			await logActivity(ctx, {
				...baseLog,
				description: `changed estimate from ${issue.estimate ?? "none"} to ${args.estimate}`,
				field: "estimate",
				oldValue: issue.estimate != null ? String(issue.estimate) : undefined,
				newValue: String(args.estimate),
			});
			logged = true;
		}

		if (args.dueDate !== undefined && args.dueDate !== issue.dueDate) {
			const fmt = (v?: number | null) =>
				v ? new Date(v).toLocaleDateString() : "none";
			await logActivity(ctx, {
				...baseLog,
				description: `changed due date from ${fmt(issue.dueDate)} to ${fmt(args.dueDate)}`,
				field: "dueDate",
				oldValue: fmt(issue.dueDate),
				newValue: fmt(args.dueDate),
			});
			logged = true;
		}

		if (args.startDate !== undefined && args.startDate !== issue.startDate) {
			const fmt = (v?: number | null) =>
				v ? new Date(v).toLocaleDateString() : "none";
			await logActivity(ctx, {
				...baseLog,
				description: `changed start date from ${fmt(issue.startDate)} to ${fmt(args.startDate)}`,
				field: "startDate",
				oldValue: fmt(issue.startDate),
				newValue: fmt(args.startDate),
			});
			logged = true;
		}

		// Fallback: if nothing was specifically tracked, log a generic entry
		if (!logged) {
			await logActivity(ctx, {
				...baseLog,
				description: `updated issue "${issue.identifier}"`,
			});
		}

		// Notify subscribers for significant field changes
		const significantChange =
			(args.status && args.status !== issue.status) ||
			(args.assigneeId !== undefined && args.assigneeId !== issue.assigneeId) ||
			(args.sprintId !== undefined && args.sprintId !== issue.sprintId) ||
			(args.milestoneId !== undefined &&
				args.milestoneId !== issue.milestoneId) ||
			(args.priority && args.priority !== issue.priority);

		if (significantChange) {
			const actor = await ctx.db.get(userId);
			const actorName = actor?.name ?? "Someone";
			const body = `${actorName} updated '${issue.identifier}: ${issue.title}'`;
			await notifySubscribers(ctx, args.issueId, {
				workspaceId: issue.workspaceId,
				type: "issue_status_changed",
				title: "Issue updated",
				body,
				issueId: args.issueId,
				projectId: issue.projectId ?? undefined,
				actorId: userId,
			});
		}

		// Schedule RAG re-indexing (async, non-blocking)
		await ctx.scheduler.runAfter(
			0,
			internal.ai.indexing.issueIndexer.indexIssue,
			{ issueId: args.issueId },
		);
	},
});

/** Dedicated status change mutation with notifications */
export const updateStatus = mutation({
	args: {
		issueId: v.id("issues"),
		status: issueStatusValidator,
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const issue = await ctx.db.get(args.issueId);
		if (!issue || issue.deletedAt) {
			throw new ConvexError("Issue not found");
		}
		const { userId, member } = await requireWorkspaceMember(
			ctx,
			issue.workspaceId,
		);

		// RBAC: verify project access for member users
		if (member.role !== "admin" && issue.projectId) {
			const hasAccess = await canAccessProject(
				ctx,
				issue.projectId,
				userId,
				member.role as "admin" | "member",
			);
			if (
				!hasAccess &&
				issue.assigneeId !== userId &&
				issue.createdBy !== userId
			) {
				throw new ConvexError("You don't have access to this issue's project");
			}
		}

		const oldStatus = issue.status;
		const patch: Record<string, unknown> = {
			status: args.status,
			updatedAt: Date.now(),
		};

		// Set completedAt when status becomes done/cancelled
		if (isCompletedStatus(args.status) && !isCompletedStatus(oldStatus)) {
			patch.completedAt = Date.now();
		}
		// Clear completedAt when moving away from done/cancelled
		if (!isCompletedStatus(args.status) && isCompletedStatus(oldStatus)) {
			patch.completedAt = undefined;
		}

		await ctx.db.patch(args.issueId, patch);

		// Activity log for status change
		if (args.status !== oldStatus) {
			const oldLabel = oldStatus.replace(/_/g, " ");
			const newLabel = args.status.replace(/_/g, " ");
			await logActivity(ctx, {
				workspaceId: issue.workspaceId,
				entityType: "issue",
				entityId: args.issueId,
				action: "status_changed",
				actorId: userId,
				description: `changed status from ${oldLabel} to ${newLabel}`,
				issueId: args.issueId,
				projectId: issue.projectId,
				field: "status",
				oldValue: oldStatus,
				newValue: args.status,
			});

			// Notify all subscribers (excluding actor)
			const actor = await ctx.db.get(userId);
			const actorName = actor?.name ?? "Someone";
			const statusLabel = args.status.replace(/_/g, " ");
			const oldStatusLabel = oldStatus.replace(/_/g, " ");
			const body = `${actorName} changed '${issue.identifier}: ${issue.title}' from ${oldStatusLabel} to ${statusLabel}`;

			await notifySubscribers(ctx, args.issueId, {
				workspaceId: issue.workspaceId,
				type: "issue_status_changed",
				title: "Issue status changed",
				body,
				issueId: args.issueId,
				projectId: issue.projectId ?? undefined,
				actorId: userId,
			});
		}

		// ── Auto-close logic ──────────────────────────────────────────────
		if (isCompletedStatus(args.status) && !isCompletedStatus(oldStatus)) {
			// Direction 1: Sub-issue marked done → check if all siblings done → auto-close parent
			if (issue.parentId) {
				const siblings = await ctx.db
					.query("issues")
					.withIndex("by_parent", (q) => q.eq("parentId", issue.parentId))
					.collect();

				const activeSiblings = siblings.filter((s) => !s.deletedAt);
				const allDone = activeSiblings.every((s) =>
					isCompletedStatus(s.status),
				);

				if (allDone) {
					const parentIssue = await ctx.db.get(issue.parentId);
					if (
						parentIssue &&
						!parentIssue.deletedAt &&
						!isCompletedStatus(parentIssue.status)
					) {
						await ctx.db.patch(issue.parentId, {
							status: "done",
							completedAt: Date.now(),
							updatedAt: Date.now(),
						});

						await logActivity(ctx, {
							workspaceId: parentIssue.workspaceId,
							entityType: "issue",
							entityId: issue.parentId,
							action: "status_changed",
							actorId: userId,
							description: "auto-closed: all sub-issues completed",
							issueId: issue.parentId,
							projectId: parentIssue.projectId,
							field: "status",
							oldValue: parentIssue.status,
							newValue: "done",
						});

						const parentRecipientIds = new Set<string>();
						if (parentIssue.createdBy)
							parentRecipientIds.add(parentIssue.createdBy);
						if (parentIssue.assigneeId)
							parentRecipientIds.add(parentIssue.assigneeId);

						for (const recipientId of parentRecipientIds) {
							await createNotification(ctx, {
								userId: recipientId as typeof parentIssue.createdBy,
								workspaceId: parentIssue.workspaceId,
								type: "issue_status_changed",
								title: "Issue auto-closed",
								body: `'${parentIssue.identifier}: ${parentIssue.title}' was auto-closed because all sub-issues are complete`,
								issueId: issue.parentId,
								projectId: parentIssue.projectId ?? undefined,
								actorId: userId,
							});
						}
					}
				}
			}

			// Direction 2: Parent marked done → auto-close all remaining sub-issues
			const children = await ctx.db
				.query("issues")
				.withIndex("by_parent", (q) => q.eq("parentId", args.issueId))
				.collect();

			for (const child of children) {
				if (!child.deletedAt && !isCompletedStatus(child.status)) {
					await ctx.db.patch(child._id, {
						status: "done",
						completedAt: Date.now(),
						updatedAt: Date.now(),
					});

					await logActivity(ctx, {
						workspaceId: child.workspaceId,
						entityType: "issue",
						entityId: child._id,
						action: "status_changed",
						actorId: userId,
						description: "auto-closed: parent issue completed",
						issueId: child._id,
						projectId: child.projectId,
						field: "status",
						oldValue: child.status,
						newValue: "done",
					});
				}
			}
		}
	},
});

/** Assign issue to a user */
export const assign = mutation({
	args: {
		issueId: v.id("issues"),
		assigneeId: v.optional(v.id("users")),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const issue = await ctx.db.get(args.issueId);
		if (!issue || issue.deletedAt) {
			throw new ConvexError("Issue not found");
		}
		const { userId, member } = await requireWorkspaceMember(
			ctx,
			issue.workspaceId,
		);

		// RBAC: verify project access for member users
		if (member.role !== "admin" && issue.projectId) {
			const hasAccess = await canAccessProject(
				ctx,
				issue.projectId,
				userId,
				member.role as "admin" | "member",
			);
			if (
				!hasAccess &&
				issue.assigneeId !== userId &&
				issue.createdBy !== userId
			) {
				throw new ConvexError("You don't have access to this issue's project");
			}
		}
		if (args.assigneeId) {
			await ensureAssigneeInWorkspace(ctx, issue.workspaceId, args.assigneeId);
		}

		const oldAssigneeId = issue.assigneeId;
		await ctx.db.patch(args.issueId, {
			assigneeId: args.assigneeId,
			updatedAt: Date.now(),
		});

		// Activity log for assignment
		const oldName = oldAssigneeId
			? ((await ctx.db.get(oldAssigneeId))?.name ?? "someone")
			: "unassigned";
		const newName = args.assigneeId
			? ((await ctx.db.get(args.assigneeId))?.name ?? "someone")
			: "unassigned";
		await logActivity(ctx, {
			workspaceId: issue.workspaceId,
			entityType: "issue",
			entityId: args.issueId,
			action: "assigned",
			actorId: userId,
			description: `assigned issue from ${oldName} to ${newName}`,
			issueId: args.issueId,
			projectId: issue.projectId,
			field: "assigneeId",
			oldValue: oldAssigneeId ?? undefined,
			newValue: args.assigneeId ?? undefined,
		});

		// Notify new assignee and auto-subscribe
		const actor = await ctx.db.get(userId);
		const actorName = actor?.name ?? "Someone";
		if (args.assigneeId) {
			await autoSubscribe(ctx, args.issueId, args.assigneeId);
			await createNotification(ctx, {
				userId: args.assigneeId,
				workspaceId: issue.workspaceId,
				type: "issue_assigned",
				title: "Issue assigned to you",
				body: `${actorName} assigned '${issue.identifier}: ${issue.title}' to you`,
				issueId: args.issueId,
				projectId: issue.projectId ?? undefined,
				actorId: userId,
			});
		}

		// Notify other subscribers (exclude assignee to avoid double-notification)
		const excludeIds: Id<"users">[] = [];
		if (args.assigneeId) excludeIds.push(args.assigneeId);
		await notifySubscribers(
			ctx,
			args.issueId,
			{
				workspaceId: issue.workspaceId,
				type: "issue_assigned",
				title: "Issue reassigned",
				body: `${actorName} assigned '${issue.identifier}: ${issue.title}' to ${args.assigneeId ? ((await ctx.db.get(args.assigneeId))?.name ?? "someone") : "unassigned"}`,
				issueId: args.issueId,
				projectId: issue.projectId ?? undefined,
				actorId: userId,
			},
			excludeIds,
		);
	},
});

/** Update sortOrder for drag-and-drop reordering */
export const reorder = mutation({
	args: {
		issueId: v.id("issues"),
		newSortOrder: v.float64(),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const issue = await ctx.db.get(args.issueId);
		if (!issue || issue.deletedAt) {
			throw new ConvexError("Issue not found");
		}
		await requireWorkspaceMember(ctx, issue.workspaceId);

		await ctx.db.patch(args.issueId, {
			sortOrder: args.newSortOrder,
		});
	},
});

/** Bulk update status for multiple issues */
export const bulkUpdateStatus = mutation({
	args: {
		issueIds: v.array(v.id("issues")),
		status: issueStatusValidator,
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		if (args.issueIds.length === 0) return;

		// Verify auth from the first issue's workspace
		const firstIssue = await ctx.db.get(args.issueIds[0]);
		if (!firstIssue || firstIssue.deletedAt) {
			throw new ConvexError("Issue not found");
		}
		const { userId, member } = await requireWorkspaceMember(
			ctx,
			firstIssue.workspaceId,
		);
		const accessibleProjectIds = await getAccessibleProjectIds(
			ctx,
			firstIssue.workspaceId,
			userId,
			member.role as "admin" | "member",
		);

		const actor = await ctx.db.get(userId);
		const actorName = actor?.name ?? "Someone";
		const issueDocs = await Promise.all(
			args.issueIds.map(async (issueId) => {
				const issue = await ctx.db.get(issueId);
				if (!issue || issue.deletedAt) {
					throw new ConvexError(`Issue not found: ${issueId}`);
				}
				if (issue.workspaceId !== firstIssue.workspaceId) {
					throw new ConvexError(
						"All selected issues must belong to the same workspace",
					);
				}
				if (accessibleProjectIds !== null && issue.projectId) {
					const canAccess =
						accessibleProjectIds.has(issue.projectId) ||
						issue.assigneeId === userId ||
						issue.createdBy === userId;
					if (!canAccess) {
						throw new ConvexError(
							`You don't have access to issue ${issue.identifier}`,
						);
					}
				}
				return issue;
			}),
		);

		for (const issue of issueDocs) {
			const issueId = issue._id;

			const oldStatus = issue.status;
			const patch: Record<string, unknown> = {
				status: args.status,
				updatedAt: Date.now(),
			};

			if (isCompletedStatus(args.status) && !isCompletedStatus(oldStatus)) {
				patch.completedAt = Date.now();
			}
			if (!isCompletedStatus(args.status) && isCompletedStatus(oldStatus)) {
				patch.completedAt = undefined;
			}

			await ctx.db.patch(issueId, patch);

			// Activity log for each status change
			if (args.status !== oldStatus) {
				const oldLabel = oldStatus.replace(/_/g, " ");
				const newLabel = args.status.replace(/_/g, " ");
				await logActivity(ctx, {
					workspaceId: issue.workspaceId,
					entityType: "issue",
					entityId: issueId,
					action: "status_changed",
					actorId: userId,
					description: `changed status from ${oldLabel} to ${newLabel}`,
					issueId,
					projectId: issue.projectId,
					field: "status",
					oldValue: oldStatus,
					newValue: args.status,
				});

				// Notify subscribers of the status change
				const statusLabel = args.status.replace(/_/g, " ");
				await notifySubscribers(ctx, issueId, {
					workspaceId: issue.workspaceId,
					type: "issue_status_changed",
					title: "Issue status changed",
					body: `${actorName} changed '${issue.identifier}: ${issue.title}' to ${statusLabel}`,
					issueId,
					projectId: issue.projectId ?? undefined,
					actorId: userId,
				});
			}
		}
	},
});

/** Bulk assign multiple issues to a user */
export const bulkAssign = mutation({
	args: {
		issueIds: v.array(v.id("issues")),
		assigneeId: v.optional(v.id("users")),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		if (args.issueIds.length === 0) return;

		// Verify auth from the first issue's workspace
		const firstIssue = await ctx.db.get(args.issueIds[0]);
		if (!firstIssue || firstIssue.deletedAt) {
			throw new ConvexError("Issue not found");
		}
		const { userId, member } = await requireWorkspaceMember(
			ctx,
			firstIssue.workspaceId,
		);
		const accessibleProjectIds = await getAccessibleProjectIds(
			ctx,
			firstIssue.workspaceId,
			userId,
			member.role as "admin" | "member",
		);
		if (args.assigneeId) {
			await ensureAssigneeInWorkspace(
				ctx,
				firstIssue.workspaceId,
				args.assigneeId,
			);
		}
		const issueDocs = await Promise.all(
			args.issueIds.map(async (issueId) => {
				const issue = await ctx.db.get(issueId);
				if (!issue || issue.deletedAt) {
					throw new ConvexError(`Issue not found: ${issueId}`);
				}
				if (issue.workspaceId !== firstIssue.workspaceId) {
					throw new ConvexError(
						"All selected issues must belong to the same workspace",
					);
				}
				if (accessibleProjectIds !== null && issue.projectId) {
					const canAccess =
						accessibleProjectIds.has(issue.projectId) ||
						issue.assigneeId === userId ||
						issue.createdBy === userId;
					if (!canAccess) {
						throw new ConvexError(
							`You don't have access to issue ${issue.identifier}`,
						);
					}
				}
				return issue;
			}),
		);

		for (const issue of issueDocs) {
			const issueId = issue._id;

			const oldAssigneeId = issue.assigneeId;
			await ctx.db.patch(issueId, {
				assigneeId: args.assigneeId,
				updatedAt: Date.now(),
			});

			// Activity log for each assignment
			await logActivity(ctx, {
				workspaceId: issue.workspaceId,
				entityType: "issue",
				entityId: issueId,
				action: "assigned",
				actorId: userId,
				description: "reassigned issue",
				issueId,
				projectId: issue.projectId,
				field: "assigneeId",
				oldValue: oldAssigneeId ?? undefined,
				newValue: args.assigneeId ?? undefined,
			});

			// Notify new assignee and other subscribers
			if (args.assigneeId) {
				const actor = await ctx.db.get(userId);
				const actorName = actor?.name ?? "Someone";
				const assigneeName =
					(await ctx.db.get(args.assigneeId))?.name ?? "someone";
				await createNotification(ctx, {
					userId: args.assigneeId,
					workspaceId: issue.workspaceId,
					type: "issue_assigned",
					title: "Issue assigned to you",
					body: `${actorName} assigned '${issue.identifier}: ${issue.title}' to you`,
					issueId,
					projectId: issue.projectId ?? undefined,
					actorId: userId,
				});

				// Notify other subscribers (exclude assignee to avoid duplicates)
				await notifySubscribers(
					ctx,
					issueId,
					{
						workspaceId: issue.workspaceId,
						type: "issue_assigned",
						title: "Issue reassigned",
						body: `${actorName} assigned '${issue.identifier}: ${issue.title}' to ${assigneeName}`,
						issueId,
						projectId: issue.projectId ?? undefined,
						actorId: userId,
					},
					[args.assigneeId],
				);
			}
		}
	},
});

/** Soft delete an issue and cascade to child issues */
export const remove = mutation({
	args: {
		issueId: v.id("issues"),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const issue = await ctx.db.get(args.issueId);
		if (!issue || issue.deletedAt) {
			throw new ConvexError("Issue not found");
		}
		const { userId, member } = await requireWorkspaceMember(
			ctx,
			issue.workspaceId,
		);

		// RBAC: verify project access for member users
		if (member.role !== "admin" && issue.projectId) {
			const hasAccess = await canAccessProject(
				ctx,
				issue.projectId,
				userId,
				member.role as "admin" | "member",
			);
			if (
				!hasAccess &&
				issue.assigneeId !== userId &&
				issue.createdBy !== userId
			) {
				throw new ConvexError("You don't have access to this issue's project");
			}
		}

		// Soft delete the issue
		await ctx.db.patch(args.issueId, {
			deletedAt: Date.now(),
		});

		// Cascade soft-delete to child issues (sub-issues)
		const children = await ctx.db
			.query("issues")
			.withIndex("by_parent", (q) => q.eq("parentId", args.issueId))
			.collect();

		for (const child of children) {
			if (!child.deletedAt) {
				await ctx.db.patch(child._id, {
					deletedAt: Date.now(),
				});
			}
		}

		// Activity log
		await logActivity(ctx, {
			workspaceId: issue.workspaceId,
			entityType: "issue",
			entityId: args.issueId,
			action: "deleted",
			actorId: userId,
			description: `deleted issue "${issue.identifier}: ${issue.title}"`,
			issueId: args.issueId,
			projectId: issue.projectId,
			metadata: JSON.stringify({
				identifier: issue.identifier,
				title: issue.title,
			}),
		});

		// Schedule RAG de-indexing for parent and children
		await ctx.scheduler.runAfter(
			0,
			internal.ai.indexing.issueIndexer.indexIssue,
			{ issueId: args.issueId },
		);
		for (const child of children) {
			if (!child.deletedAt) {
				await ctx.scheduler.runAfter(
					0,
					internal.ai.indexing.issueIndexer.indexIssue,
					{ issueId: child._id },
				);
			}
		}
	},
});

/** Create a sub-issue under a parent with inherited properties */
export const createSubIssue = mutation({
	args: {
		parentId: v.id("issues"),
		title: v.string(),
		description: v.optional(v.string()),
		status: v.optional(issueStatusValidator),
		priority: v.optional(issuePriorityValidator),
		type: v.optional(issueTypeValidator),
		assigneeId: v.optional(v.id("users")),
		labelIds: v.optional(v.array(v.id("labels"))),
		startDate: v.optional(v.number()),
		dueDate: v.optional(v.number()),
		estimate: v.optional(v.float64()),
		projectId: v.optional(v.id("projects")),
		sprintId: v.optional(v.id("sprints")),
		milestoneId: v.optional(v.id("milestones")),
	},
	returns: v.object({
		issueId: v.id("issues"),
		identifier: v.string(),
	}),
	handler: async (ctx, args) => {
		const parent = await ctx.db.get(args.parentId);
		if (!parent || parent.deletedAt) {
			throw new ConvexError("Parent issue not found");
		}

		// Single-level nesting: parent cannot be a sub-issue itself
		if (parent.parentId) {
			throw new ConvexError(
				"Cannot create sub-issues under a sub-issue (single-level nesting only)",
			);
		}

		const { userId, member } = await requireWorkspaceMember(
			ctx,
			parent.workspaceId,
		);

		// Inherit project/sprint from parent if not explicitly provided.
		let projectId = args.projectId ?? parent.projectId;
		const sprintId = args.sprintId ?? parent.sprintId;
		const milestoneId = args.milestoneId ?? parent.milestoneId;

		if (args.projectId) {
			const project = await ctx.db.get(args.projectId);
			if (!project || project.deletedAt) {
				throw new ConvexError("Project not found");
			}
			if (project.workspaceId !== parent.workspaceId) {
				throw new ConvexError("Project must belong to the same workspace");
			}
		}

		if (sprintId) {
			const sprint = await ctx.db.get(sprintId);
			if (!sprint || sprint.deletedAt) {
				throw new ConvexError("Sprint not found");
			}
			const sprintProject = await ctx.db.get(sprint.projectId);
			if (!sprintProject || sprintProject.deletedAt) {
				throw new ConvexError("Sprint project not found");
			}
			if (sprintProject.workspaceId !== parent.workspaceId) {
				throw new ConvexError("Sprint must belong to the same workspace");
			}
			if (projectId && sprint.projectId !== projectId) {
				throw new ConvexError("Sprint does not belong to the target project");
			}
			projectId = projectId ?? sprintProject._id;
		}
		if (milestoneId) {
			const milestone = await ctx.db.get(milestoneId);
			if (!milestone || milestone.deletedAt) {
				throw new ConvexError("Milestone not found");
			}
			const milestoneProject = await ctx.db.get(milestone.projectId);
			if (!milestoneProject || milestoneProject.deletedAt) {
				throw new ConvexError("Milestone project not found");
			}
			if (milestoneProject.workspaceId !== parent.workspaceId) {
				throw new ConvexError("Milestone must belong to the same workspace");
			}
			if (projectId && milestone.projectId !== projectId) {
				throw new ConvexError(
					"Milestone does not belong to the target project",
				);
			}
			projectId = projectId ?? milestoneProject._id;
		}

		if (projectId && parent.projectId && projectId !== parent.projectId) {
			throw new ConvexError(
				"Sub-issue must stay in the same project as parent",
			);
		}
		if (args.assigneeId) {
			await ensureAssigneeInWorkspace(ctx, parent.workspaceId, args.assigneeId);
		}

		// RBAC: verify project access for member users
		if (member.role !== "admin" && projectId) {
			const hasAccess = await canAccessProject(
				ctx,
				projectId,
				userId,
				member.role as "admin" | "member",
			);
			if (!hasAccess)
				throw new ConvexError("You don't have access to this project");
		}

		// Generate identifier
		const settings = await ctx.db
			.query("workspaceSettings")
			.withIndex("by_workspace", (q) => q.eq("workspaceId", parent.workspaceId))
			.unique();

		if (!settings) {
			throw new ConvexError("Workspace settings not found");
		}

		const prefix = settings.issuePrefix ?? settings.storyPrefix;
		const nextNumber = settings.nextIssueNumber ?? 1;
		const identifier = generateIdentifier(prefix, nextNumber);

		await ctx.db.patch(settings._id, {
			issuePrefix: prefix,
			nextIssueNumber: nextNumber + 1,
		});

		// Compute sortOrder: append after last sibling
		const siblings = await ctx.db
			.query("issues")
			.withIndex("by_parent", (q) => q.eq("parentId", args.parentId))
			.collect();

		const activeSiblings = siblings.filter((s) => !s.deletedAt);
		const maxSort =
			activeSiblings.length > 0
				? Math.max(...activeSiblings.map((s) => s.sortOrder))
				: null;
		const sortOrder = fractionalIndex(maxSort, null);

		const status = args.status ?? "backlog";

		const issueId = await ctx.db.insert("issues", {
			workspaceId: parent.workspaceId,
			projectId,
			sprintId,
			milestoneId,
			parentId: args.parentId,
			identifier,
			title: args.title,
			description: args.description,
			status,
			priority: args.priority ?? "no_priority",
			type: args.type ?? "issue",
			assigneeId: args.assigneeId,
			labelIds: args.labelIds,
			startDate: args.startDate,
			dueDate: args.dueDate,
			sortOrder,
			estimate: args.estimate,
			createdBy: userId,
			completedAt: isCompletedStatus(status) ? Date.now() : undefined,
		});

		// Log activity on the parent issue
		await logActivity(ctx, {
			workspaceId: parent.workspaceId,
			entityType: "issue",
			entityId: args.parentId,
			action: "sub_issue_created",
			actorId: userId,
			description: `created sub-issue "${identifier}: ${args.title}"`,
			issueId: args.parentId,
			projectId: projectId ?? undefined,
			metadata: JSON.stringify({
				subIssueId: issueId,
				subIssueIdentifier: identifier,
			}),
		});

		// Notify assignee if set
		if (args.assigneeId) {
			const actor = await ctx.db.get(userId);
			const actorName = actor?.name ?? "Someone";
			await createNotification(ctx, {
				userId: args.assigneeId,
				workspaceId: parent.workspaceId,
				type: "issue_assigned",
				title: "Sub-issue assigned to you",
				body: `${actorName} assigned '${identifier}: ${args.title}' to you`,
				issueId,
				projectId: projectId ?? undefined,
				actorId: userId,
			});
		}

		return { issueId, identifier };
	},
});

/** Convert an existing issue to a sub-issue of another issue */
export const convertToSubIssue = mutation({
	args: {
		issueId: v.id("issues"),
		parentId: v.id("issues"),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const issue = await ctx.db.get(args.issueId);
		if (!issue || issue.deletedAt) {
			throw new ConvexError("Issue not found");
		}

		const parent = await ctx.db.get(args.parentId);
		if (!parent || parent.deletedAt) {
			throw new ConvexError("Parent issue not found");
		}

		const { userId } = await requireWorkspaceMember(ctx, issue.workspaceId);

		// Prevent self-reference
		if (args.issueId === args.parentId) {
			throw new ConvexError("An issue cannot be a sub-issue of itself");
		}

		// Must be in same workspace
		if (issue.workspaceId !== parent.workspaceId) {
			throw new ConvexError("Issues must be in the same workspace");
		}

		// Single-level nesting: target parent cannot be a sub-issue itself
		if (parent.parentId) {
			throw new ConvexError(
				"Cannot nest under a sub-issue (single-level nesting only)",
			);
		}

		// Cannot convert an issue that has sub-issues (would create 2-level nesting)
		const children = await ctx.db
			.query("issues")
			.withIndex("by_parent", (q) => q.eq("parentId", args.issueId))
			.collect();
		const activeChildren = children.filter((c) => !c.deletedAt);
		if (activeChildren.length > 0) {
			throw new ConvexError(
				"Cannot convert an issue with sub-issues to a sub-issue (single-level nesting only)",
			);
		}

		await ctx.db.patch(args.issueId, {
			parentId: args.parentId,
			updatedAt: Date.now(),
		});

		await logActivity(ctx, {
			workspaceId: issue.workspaceId,
			entityType: "issue",
			entityId: args.issueId,
			action: "converted_to_sub_issue",
			actorId: userId,
			description: `converted "${issue.identifier}" to sub-issue of "${parent.identifier}"`,
			issueId: args.issueId,
			projectId: issue.projectId,
			metadata: JSON.stringify({
				parentId: args.parentId,
				parentIdentifier: parent.identifier,
			}),
		});
	},
});

// ── Subscriptions ───────────────────────────────────────────────────────────

/** Check if the current user is subscribed to an issue */
export const getSubscriptionStatus = query({
	args: {
		issueId: v.id("issues"),
	},
	returns: v.object({ isSubscribed: v.boolean() }),
	handler: async (ctx, args) => {
		const issue = await ctx.db.get(args.issueId);
		if (!issue || issue.deletedAt) {
			return { isSubscribed: false };
		}
		const { userId } = await requireWorkspaceMember(ctx, issue.workspaceId);

		const existing = await ctx.db
			.query("issueSubscriptions")
			.withIndex("by_issue_user", (q) =>
				q.eq("issueId", args.issueId).eq("userId", userId),
			)
			.unique();

		return { isSubscribed: !!existing };
	},
});

/** Subscribe the current user to an issue */
export const subscribe = mutation({
	args: {
		issueId: v.id("issues"),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const issue = await ctx.db.get(args.issueId);
		if (!issue || issue.deletedAt) {
			throw new ConvexError("Issue not found");
		}
		const { userId } = await requireWorkspaceMember(ctx, issue.workspaceId);

		// Check if already subscribed
		const existing = await ctx.db
			.query("issueSubscriptions")
			.withIndex("by_issue_user", (q) =>
				q.eq("issueId", args.issueId).eq("userId", userId),
			)
			.unique();

		if (existing) return; // Already subscribed

		await ctx.db.insert("issueSubscriptions", {
			issueId: args.issueId,
			userId,
			createdAt: Date.now(),
		});
	},
});

/** Unsubscribe the current user from an issue */
export const unsubscribe = mutation({
	args: {
		issueId: v.id("issues"),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const issue = await ctx.db.get(args.issueId);
		if (!issue || issue.deletedAt) {
			throw new ConvexError("Issue not found");
		}
		const { userId } = await requireWorkspaceMember(ctx, issue.workspaceId);

		const existing = await ctx.db
			.query("issueSubscriptions")
			.withIndex("by_issue_user", (q) =>
				q.eq("issueId", args.issueId).eq("userId", userId),
			)
			.unique();

		if (existing) {
			await ctx.db.delete(existing._id);
		}
	},
});

/** Auto-subscribe a user to an issue (internal helper used by create/assign) */
async function autoSubscribe(
	ctx: MutationCtx,
	issueId: Id<"issues">,
	userId: Id<"users">,
) {
	const existing = await ctx.db
		.query("issueSubscriptions")
		.withIndex("by_issue_user", (q) =>
			q.eq("issueId", issueId).eq("userId", userId),
		)
		.unique();

	if (!existing) {
		await ctx.db.insert("issueSubscriptions", {
			issueId,
			userId,
			createdAt: Date.now(),
		});
	}
}

// ── My Issues Queries ───────────────────────────────────────────────────────

/** Issues assigned to the current user in the workspace */
export const myIssuesAssigned = query({
	args: {
		workspaceId: v.id("workspaces"),
	},
	returns: v.array(issueDocValidator),
	handler: async (ctx, args) => {
		const { userId } = await requireWorkspaceMember(ctx, args.workspaceId);

		const issues = await ctx.db
			.query("issues")
			.withIndex("by_workspace_assignee", (q) =>
				q.eq("workspaceId", args.workspaceId).eq("assigneeId", userId),
			)
			.collect();

		// RBAC: assigned issues are always visible to the assignee
		return issues.filter((issue) => !issue.deletedAt);
	},
});

/** Issues created by the current user in the workspace */
export const myIssuesCreated = query({
	args: {
		workspaceId: v.id("workspaces"),
	},
	returns: v.array(issueDocValidator),
	handler: async (ctx, args) => {
		const { userId } = await requireWorkspaceMember(ctx, args.workspaceId);

		const issues = await ctx.db
			.query("issues")
			.withIndex("by_workspace_creator", (q) =>
				q.eq("workspaceId", args.workspaceId).eq("createdBy", userId),
			)
			.collect();

		// RBAC: created issues are always visible to the creator
		return issues.filter((issue) => !issue.deletedAt);
	},
});

/** Issues the current user is subscribed to */
export const myIssuesSubscribed = query({
	args: {
		workspaceId: v.id("workspaces"),
	},
	returns: v.array(issueDocValidator),
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

		const subscriptions = await ctx.db
			.query("issueSubscriptions")
			.withIndex("by_user", (q) => q.eq("userId", userId))
			.collect();

		const issueResults = await Promise.all(
			subscriptions.map(async (sub) => {
				const issue = await ctx.db.get(sub.issueId);
				return issue;
			}),
		);

		return issueResults
			.filter(
				(issue): issue is NonNullable<typeof issue> =>
					issue !== null &&
					!issue.deletedAt &&
					issue.workspaceId === args.workspaceId,
			)
			.filter((issue) => {
				if (accessibleProjectIds !== null) {
					const inAccessibleProject =
						issue.projectId && accessibleProjectIds.has(issue.projectId);
					const isAssigned = issue.assigneeId === userId;
					const isCreator = issue.createdBy === userId;
					if (!inAccessibleProject && !isAssigned && !isCreator) return false;
				}
				return true;
			});
	},
});

/** Issues with recent activity involving the current user */
export const myIssuesActivity = query({
	args: {
		workspaceId: v.id("workspaces"),
	},
	returns: v.array(issueDocValidator),
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

		const subscriptions = await ctx.db
			.query("issueSubscriptions")
			.withIndex("by_user", (q) => q.eq("userId", userId))
			.collect();
		const subscribedIssueIds = new Set<string>(
			subscriptions.map((s) => s.issueId as string),
		);

		const logs = await ctx.db
			.query("activityLogs")
			.withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
			.order("desc")
			.take(1000);

		const issueIdSet = new Set<string>();
		const lastSeenAt = new Map<string, number>();

		for (const log of logs) {
			if (!log.issueId) continue;
			const issueId = log.issueId as string;
			const isRelevantActor = log.actorId === userId;
			const isSubscribed = subscribedIssueIds.has(issueId);
			if (!isRelevantActor && !isSubscribed) continue;
			issueIdSet.add(issueId);
			if (!lastSeenAt.has(issueId)) {
				lastSeenAt.set(issueId, log._creationTime);
			}
		}

		// Parallel fetch: assigned issues + created issues (targeted index queries, no full scan)
		const [assignedIssues, createdIssues] = await Promise.all([
			ctx.db
				.query("issues")
				.withIndex("by_workspace_assignee", (q) =>
					q.eq("workspaceId", args.workspaceId).eq("assigneeId", userId),
				)
				.collect(),
			ctx.db
				.query("issues")
				.withIndex("by_workspace_creator", (q) =>
					q.eq("workspaceId", args.workspaceId).eq("createdBy", userId),
				)
				.collect(),
		]);
		for (const issue of assignedIssues) {
			issueIdSet.add(issue._id as string);
		}
		for (const issue of createdIssues) {
			issueIdSet.add(issue._id as string);
		}

		const issueResults = await Promise.all(
			Array.from(issueIdSet).map((id) => ctx.db.get(id as Id<"issues">)),
		);

		return issueResults
			.filter(
				(issue): issue is NonNullable<typeof issue> =>
					issue !== null &&
					!issue.deletedAt &&
					issue.workspaceId === args.workspaceId,
			)
			.filter((issue) => {
				if (accessibleProjectIds !== null) {
					const inAccessibleProject =
						issue.projectId && accessibleProjectIds.has(issue.projectId);
					const isAssigned = issue.assigneeId === userId;
					const isCreator = issue.createdBy === userId;
					if (!inAccessibleProject && !isAssigned && !isCreator) return false;
				}
				return true;
			})
			.sort((a, b) => {
				const aTime =
					lastSeenAt.get(a._id as string) ?? a.updatedAt ?? a._creationTime;
				const bTime =
					lastSeenAt.get(b._id as string) ?? b.updatedAt ?? b._creationTime;
				return bTime - aTime;
			});
	},
});

/** Remove parent from a sub-issue, promoting it to top-level */
export const removeParent = mutation({
	args: {
		issueId: v.id("issues"),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const issue = await ctx.db.get(args.issueId);
		if (!issue || issue.deletedAt) {
			throw new ConvexError("Issue not found");
		}
		if (!issue.parentId) {
			throw new ConvexError("Issue is not a sub-issue");
		}

		const { userId } = await requireWorkspaceMember(ctx, issue.workspaceId);

		const parent = await ctx.db.get(issue.parentId);
		const parentIdentifier =
			parent && !parent.deletedAt ? parent.identifier : "unknown";

		await ctx.db.patch(args.issueId, {
			parentId: undefined,
			updatedAt: Date.now(),
		});

		await logActivity(ctx, {
			workspaceId: issue.workspaceId,
			entityType: "issue",
			entityId: args.issueId,
			action: "removed_parent",
			actorId: userId,
			description: `promoted "${issue.identifier}" to top-level issue (was sub-issue of "${parentIdentifier}")`,
			issueId: args.issueId,
			projectId: issue.projectId,
		});
	},
});

// ── Linked Resources ──────────────────────────────────────────────────────

export const linkResource = mutation({
	args: {
		issueId: v.id("issues"),
		resourceType: v.union(v.literal("document"), v.literal("whiteboard")),
		resourceId: v.string(),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const issue = await ctx.db.get(args.issueId);
		if (!issue || issue.deletedAt) {
			throw new ConvexError("Issue not found");
		}
		const { userId } = await requireWorkspaceMember(ctx, issue.workspaceId);

		if (args.resourceType === "document") {
			const docId = args.resourceId as Id<"documents">;
			const doc = await ctx.db.get(docId);
			if (!doc || doc.deletedAt) throw new ConvexError("Document not found");

			const existing = issue.linkedDocumentIds ?? [];
			if (existing.includes(docId)) return;

			await ctx.db.patch(args.issueId, {
				linkedDocumentIds: [...existing, docId],
				updatedAt: Date.now(),
			});

			await logActivity(ctx, {
				workspaceId: issue.workspaceId,
				entityType: "issue",
				entityId: args.issueId,
				action: "linked_resource",
				actorId: userId,
				description: `linked document "${doc.title}" to "${issue.identifier}"`,
				issueId: args.issueId,
				projectId: issue.projectId,
			});
		} else {
			const boardId = args.resourceId as Id<"whiteboards">;
			const board = await ctx.db.get(boardId);
			if (!board || board.deletedAt)
				throw new ConvexError("Whiteboard not found");

			const existing = issue.linkedWhiteboardIds ?? [];
			if (existing.includes(boardId)) return;

			await ctx.db.patch(args.issueId, {
				linkedWhiteboardIds: [...existing, boardId],
				updatedAt: Date.now(),
			});

			await logActivity(ctx, {
				workspaceId: issue.workspaceId,
				entityType: "issue",
				entityId: args.issueId,
				action: "linked_resource",
				actorId: userId,
				description: `linked whiteboard "${board.title}" to "${issue.identifier}"`,
				issueId: args.issueId,
				projectId: issue.projectId,
			});
		}
	},
});

export const unlinkResource = mutation({
	args: {
		issueId: v.id("issues"),
		resourceType: v.union(v.literal("document"), v.literal("whiteboard")),
		resourceId: v.string(),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const issue = await ctx.db.get(args.issueId);
		if (!issue || issue.deletedAt) {
			throw new ConvexError("Issue not found");
		}
		await requireWorkspaceMember(ctx, issue.workspaceId);

		if (args.resourceType === "document") {
			const docId = args.resourceId as Id<"documents">;
			const existing = issue.linkedDocumentIds ?? [];
			await ctx.db.patch(args.issueId, {
				linkedDocumentIds: existing.filter((id) => id !== docId),
				updatedAt: Date.now(),
			});
		} else {
			const boardId = args.resourceId as Id<"whiteboards">;
			const existing = issue.linkedWhiteboardIds ?? [];
			await ctx.db.patch(args.issueId, {
				linkedWhiteboardIds: existing.filter((id) => id !== boardId),
				updatedAt: Date.now(),
			});
		}
	},
});
