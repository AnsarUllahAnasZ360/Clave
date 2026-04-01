/**
 * Internal mutations for AI tools — bypass Convex auth for external contexts.
 *
 * When AI tools run from the Google Chat webhook path, there is no Convex
 * auth session. These internal mutations accept explicit `userId` parameters
 * and perform the same operations + RBAC checks as the public mutations,
 * enabling write tools to work from any context.
 */
import { ConvexError, v } from "convex/values";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { internalMutation } from "../_generated/server";
import { logActivity } from "../lib/activity";
import { canAccessProject } from "../lib/auth";
import {
	createNotification,
	notifySubscribers,
	notifyUsers,
} from "../lib/notifications";
import { getRandomEmoji } from "../lib/randomEmoji";
import { fractionalIndex } from "../lib/utils";

// ── Shared helpers ──────────────────────────────────────────────────────

async function requireMembership(
	ctx: MutationCtx,
	workspaceId: Id<"workspaces">,
	userId: Id<"users">,
) {
	const member = await ctx.db
		.query("workspaceMembers")
		.withIndex("by_workspace_user", (q) =>
			q.eq("workspaceId", workspaceId).eq("userId", userId),
		)
		.unique();
	if (!member) {
		throw new ConvexError("Not a member of this workspace");
	}
	return member;
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

function isCompletedStatus(status: string): boolean {
	return status === "done" || status === "cancelled";
}

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

// ── Issue status/priority validators ──────────────────────────────────

const issueStatusValues = [
	"triage",
	"backlog",
	"todo",
	"in_progress",
	"in_review",
	"done",
	"cancelled",
] as const;

const issuePriorityValues = [
	"urgent",
	"high",
	"medium",
	"low",
	"no_priority",
] as const;

const issueTypeValues = ["issue", "bug", "improvement", "feature"] as const;

// ── 1. updateIssue ───────────────────────────────────────────────────────

export const updateIssue = internalMutation({
	args: {
		userId: v.id("users"),
		issueId: v.id("issues"),
		title: v.optional(v.string()),
		description: v.optional(v.string()),
		status: v.optional(v.union(...issueStatusValues.map((s) => v.literal(s)))),
		priority: v.optional(
			v.union(...issuePriorityValues.map((s) => v.literal(s))),
		),
		type: v.optional(v.union(...issueTypeValues.map((s) => v.literal(s)))),
		assigneeId: v.optional(v.id("users")),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const issue = await ctx.db.get(args.issueId);
		if (!issue || issue.deletedAt) {
			throw new ConvexError("Issue not found");
		}

		const member = await requireMembership(ctx, issue.workspaceId, args.userId);

		// RBAC: verify project access for member users
		if (member.role !== "admin" && issue.projectId) {
			const hasAccess = await canAccessProject(
				ctx,
				issue.projectId,
				args.userId,
				member.role as "admin" | "member",
			);
			if (
				!hasAccess &&
				issue.assigneeId !== args.userId &&
				issue.createdBy !== args.userId
			) {
				throw new ConvexError("You don't have access to this issue's project");
			}
		}

		if (args.assigneeId) {
			await ensureAssigneeInWorkspace(ctx, issue.workspaceId, args.assigneeId);
		}

		const { userId: _userId, issueId: _issueId, ...updates } = args;
		const patch: Record<string, unknown> = {
			...updates,
			updatedAt: Date.now(),
		};

		// Handle completedAt logic for status changes
		if (args.status) {
			if (isCompletedStatus(args.status) && !isCompletedStatus(issue.status)) {
				patch.completedAt = Date.now();
			}
			if (!isCompletedStatus(args.status) && isCompletedStatus(issue.status)) {
				patch.completedAt = undefined;
			}
		}

		await ctx.db.patch(args.issueId, patch);

		// Activity log
		const baseLog = {
			workspaceId: issue.workspaceId,
			entityType: "issue" as const,
			entityId: args.issueId,
			action: "updated",
			actorId: args.userId,
			issueId: args.issueId,
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
			(args.priority && args.priority !== issue.priority);

		if (significantChange) {
			const actor = await ctx.db.get(args.userId);
			const actorName = actor?.name ?? "Someone";
			const body = `${actorName} updated '${issue.identifier}: ${issue.title}'`;
			await notifySubscribers(ctx, args.issueId, {
				workspaceId: issue.workspaceId,
				type: "issue_status_changed",
				title: "Issue updated",
				body,
				issueId: args.issueId,
				projectId: issue.projectId ?? undefined,
				actorId: args.userId,
			});
		}

		// Schedule RAG re-indexing
		await ctx.scheduler.runAfter(
			0,
			internal.ai.indexing.issueIndexer.indexIssue,
			{ issueId: args.issueId },
		);
	},
});

// ── 2. assignIssue ───────────────────────────────────────────────────────

export const assignIssue = internalMutation({
	args: {
		userId: v.id("users"),
		issueId: v.id("issues"),
		assigneeId: v.optional(v.id("users")),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const issue = await ctx.db.get(args.issueId);
		if (!issue || issue.deletedAt) {
			throw new ConvexError("Issue not found");
		}

		const member = await requireMembership(ctx, issue.workspaceId, args.userId);

		// RBAC: verify project access for member users
		if (member.role !== "admin" && issue.projectId) {
			const hasAccess = await canAccessProject(
				ctx,
				issue.projectId,
				args.userId,
				member.role as "admin" | "member",
			);
			if (
				!hasAccess &&
				issue.assigneeId !== args.userId &&
				issue.createdBy !== args.userId
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

		// Activity log
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
			actorId: args.userId,
			description: `assigned issue from ${oldName} to ${newName}`,
			issueId: args.issueId,
			projectId: issue.projectId,
			field: "assigneeId",
			oldValue: oldAssigneeId ?? undefined,
			newValue: args.assigneeId ?? undefined,
		});

		// Notify new assignee and auto-subscribe
		const actor = await ctx.db.get(args.userId);
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
				actorId: args.userId,
			});
		}
	},
});

// ── 3. createComment ─────────────────────────────────────────────────────

export const createComment = internalMutation({
	args: {
		userId: v.id("users"),
		issueId: v.optional(v.id("issues")),
		taskId: v.optional(v.id("tasks")),
		storyId: v.optional(v.id("stories")),
		body: v.string(),
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
			if (!args.storyId) {
				throw new ConvexError("storyId is required");
			}
			const story = await ctx.db.get(args.storyId);
			if (!story || story.deletedAt) throw new ConvexError("Story not found");
			workspaceId = story.workspaceId;
			entityTitle = story.title;
			entityAssigneeId = story.assigneeId;
			projectId = story.projectId ?? undefined;
		}

		// Verify user is a workspace member
		await requireMembership(ctx, workspaceId, args.userId);

		const commentId = await ctx.db.insert("comments", {
			issueId: args.issueId,
			taskId: args.taskId,
			storyId: args.storyId,
			body: args.body,
			authorId: args.userId,
		});

		// Activity log
		await logActivity(ctx, {
			workspaceId,
			entityType: "comment",
			entityId: commentId,
			action: "created",
			actorId: args.userId,
			description: `commented on "${entityTitle}"`,
			issueId: args.issueId,
			taskId: args.taskId,
			storyId: args.storyId,
			projectId,
		});

		// Notifications
		const actor = await ctx.db.get(args.userId);
		const actorName = actor?.name ?? "Someone";
		const preview =
			args.body.length > 100 ? `${args.body.substring(0, 100)}...` : args.body;

		if (args.issueId) {
			await notifySubscribers(ctx, args.issueId, {
				workspaceId,
				type: "comment",
				title: `New comment on "${entityTitle}"`,
				body: `${actorName} commented: ${preview}`,
				issueId: args.issueId,
				commentId,
				projectId,
				actorId: args.userId,
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
				actorId: args.userId,
			});
		}

		return commentId;
	},
});

// ── 4. createDocument ────────────────────────────────────────────────────

export const createDocument = internalMutation({
	args: {
		userId: v.id("users"),
		workspaceId: v.id("workspaces"),
		projectId: v.optional(v.id("projects")),
		title: v.string(),
	},
	returns: v.id("documents"),
	handler: async (ctx, args) => {
		const member = await requireMembership(ctx, args.workspaceId, args.userId);

		// RBAC: verify project access for member users
		if (member.role !== "admin" && args.projectId) {
			const hasAccess = await canAccessProject(
				ctx,
				args.projectId,
				args.userId,
				member.role as "admin" | "member",
			);
			if (!hasAccess)
				throw new ConvexError("You don't have access to this project");
		}

		const documentId = await ctx.db.insert("documents", {
			workspaceId: args.workspaceId,
			projectId: args.projectId,
			title: args.title,
			icon: getRandomEmoji(),
			sortOrder: Date.now(),
			createdBy: args.userId,
			lastEditedBy: args.userId,
			updatedAt: Date.now(),
			syncVersion: "v3",
		});

		await logActivity(ctx, {
			workspaceId: args.workspaceId,
			entityType: "document",
			entityId: documentId,
			action: "created",
			actorId: args.userId,
			description: `Created document "${args.title}"`,
			projectId: args.projectId,
			documentId,
		});

		// Notify project members
		const projectId = args.projectId;
		if (projectId) {
			const members = await ctx.db
				.query("projectMembers")
				.withIndex("by_project", (q) => q.eq("projectId", projectId))
				.collect();
			const memberUserIds = members.map((m) => m.userId);
			await notifyUsers(ctx, memberUserIds, {
				workspaceId: args.workspaceId,
				type: "document_update",
				title: `New document: "${args.title}"`,
				preview: `Created a new document in the project`,
				projectId: args.projectId,
				documentId,
				actorId: args.userId,
			});
		}

		return documentId;
	},
});

// ── 5. updateDocumentContent ─────────────────────────────────────────────

export const updateDocumentContent = internalMutation({
	args: {
		userId: v.id("users"),
		documentId: v.id("documents"),
		content: v.string(),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const document = await ctx.db.get(args.documentId);
		if (!document || document.deletedAt) {
			throw new ConvexError("Document not found");
		}

		// Verify user is a workspace member (write access)
		await requireMembership(ctx, document.workspaceId, args.userId);

		const now = Date.now();
		await ctx.db.patch(args.documentId, {
			content: args.content,
			updatedAt: now,
			lastEditedBy: args.userId,
		});

		// Index document for search
		const shouldIndex =
			!document.updatedAt || now - document.updatedAt > 30_000;
		if (shouldIndex) {
			await ctx.scheduler.runAfter(
				0,
				internal.ai.indexing.documentIndexer.indexDocument,
				{ documentId: args.documentId },
			);
		}
	},
});

// ── 5b. updateDocument ──────────────────────────────────────────────────

export const updateDocument = internalMutation({
	args: {
		userId: v.id("users"),
		documentId: v.id("documents"),
		title: v.optional(v.string()),
		content: v.optional(v.string()),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const document = await ctx.db.get(args.documentId);
		if (!document || document.deletedAt) {
			throw new ConvexError("Document not found");
		}

		await requireMembership(ctx, document.workspaceId, args.userId);

		const now = Date.now();
		const patch: Record<string, unknown> = {
			updatedAt: now,
			lastEditedBy: args.userId,
		};
		if (args.title !== undefined) patch.title = args.title;
		if (args.content !== undefined) patch.content = args.content;

		await ctx.db.patch(args.documentId, patch);

		// Re-index if title or content changed
		const shouldIndex = args.title !== undefined || args.content !== undefined;
		if (shouldIndex) {
			await ctx.scheduler.runAfter(
				0,
				internal.ai.indexing.documentIndexer.indexDocument,
				{ documentId: args.documentId },
			);
		}

		await logActivity(ctx, {
			workspaceId: document.workspaceId,
			entityType: "document",
			entityId: args.documentId,
			action: "updated",
			actorId: args.userId,
			description: `Updated document "${args.title ?? document.title}"`,
			projectId: document.projectId,
			documentId: args.documentId,
		});
	},
});

// ── 6. createLabel ───────────────────────────────────────────────────────

export const createLabel = internalMutation({
	args: {
		userId: v.id("users"),
		workspaceId: v.id("workspaces"),
		name: v.string(),
		color: v.string(),
		description: v.optional(v.string()),
	},
	returns: v.id("labels"),
	handler: async (ctx, args) => {
		const member = await requireMembership(ctx, args.workspaceId, args.userId);
		if (member.role !== "admin") {
			throw new ConvexError("Admin access required");
		}

		// Check name uniqueness within workspace
		const existing = await ctx.db
			.query("labels")
			.withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
			.collect();
		const activeLabels = existing.filter((l) => !l.deletedAt);
		if (activeLabels.some((l) => l.name === args.name)) {
			throw new ConvexError("A label with this name already exists");
		}

		// Compute sortOrder: append at end
		const lastOrder =
			activeLabels.length > 0
				? Math.max(...activeLabels.map((l) => l.sortOrder ?? 0))
				: null;
		const sortOrder = fractionalIndex(lastOrder, null);

		return await ctx.db.insert("labels", {
			workspaceId: args.workspaceId,
			name: args.name,
			color: args.color,
			description: args.description,
			sortOrder,
			createdBy: args.userId,
			createdAt: Date.now(),
		});
	},
});

// ── 7. updateWhiteboardScene ─────────────────────────────────────────────

export const updateWhiteboardScene = internalMutation({
	args: {
		userId: v.id("users"),
		whiteboardId: v.id("whiteboards"),
		sceneData: v.string(),
		appState: v.string(),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const whiteboard = await ctx.db.get(args.whiteboardId);
		if (!whiteboard || whiteboard.deletedAt) {
			throw new ConvexError("Whiteboard not found");
		}

		// Verify user is a workspace member (write access)
		await requireMembership(ctx, whiteboard.workspaceId, args.userId);

		await ctx.db.patch(args.whiteboardId, {
			sceneData: args.sceneData,
			appState: args.appState,
			lastEditedBy: args.userId,
			updatedAt: Date.now(),
		});
	},
});

// ── 7b. updateProject ───────────────────────────────────────────────────

export const updateProject = internalMutation({
	args: {
		userId: v.id("users"),
		projectId: v.id("projects"),
		name: v.optional(v.string()),
		description: v.optional(v.string()),
		status: v.optional(v.string()),
		priority: v.optional(v.string()),
		leadId: v.optional(v.id("users")),
		startDate: v.optional(v.number()),
		endDate: v.optional(v.number()),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const project = await ctx.db.get(args.projectId);
		if (!project || project.deletedAt) {
			throw new ConvexError("Project not found");
		}

		await requireMembership(ctx, project.workspaceId, args.userId);

		const patch: Record<string, unknown> = { updatedAt: Date.now() };
		if (args.name !== undefined) patch.name = args.name;
		if (args.description !== undefined) patch.description = args.description;
		if (args.status !== undefined) patch.status = args.status;
		if (args.priority !== undefined) patch.priority = args.priority;
		if (args.leadId !== undefined) patch.leadId = args.leadId;
		if (args.startDate !== undefined) patch.startDate = args.startDate;
		if (args.endDate !== undefined) patch.endDate = args.endDate;

		await ctx.db.patch(args.projectId, patch);

		await logActivity(ctx, {
			workspaceId: project.workspaceId,
			entityType: "project",
			entityId: args.projectId,
			action: "updated",
			actorId: args.userId,
			description: `Updated project "${args.name ?? project.name}"`,
			projectId: args.projectId,
		});
	},
});

// ── 8. createSprint ─────────────────────────────────────────────────────

export const createSprint = internalMutation({
	args: {
		userId: v.id("users"),
		projectId: v.id("projects"),
		name: v.string(),
		description: v.optional(v.string()),
		startDate: v.optional(v.number()),
		endDate: v.optional(v.number()),
		goals: v.optional(v.array(v.string())),
	},
	returns: v.id("sprints"),
	handler: async (ctx, args) => {
		const project = await ctx.db.get(args.projectId);
		if (!project || project.deletedAt) {
			throw new ConvexError("Project not found");
		}
		await requireMembership(ctx, project.workspaceId, args.userId);

		// Get next sort order
		const existing = await ctx.db
			.query("sprints")
			.withIndex("by_project_sort", (q) => q.eq("projectId", args.projectId))
			.collect();
		const sortOrder =
			existing.length > 0
				? Math.max(...existing.map((s) => s.sortOrder)) + 1
				: 0;

		const sprintId = await ctx.db.insert("sprints", {
			projectId: args.projectId,
			name: args.name,
			description: args.description,
			status: "planned",
			sortOrder,
			createdBy: args.userId,
			startDate: args.startDate,
			endDate: args.endDate,
			goals: args.goals,
		});

		return sprintId;
	},
});

// ── 9. moveIssueToSprint ────────────────────────────────────────────────

export const moveIssueToSprint = internalMutation({
	args: {
		userId: v.id("users"),
		issueId: v.id("issues"),
		sprintId: v.optional(v.id("sprints")),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const issue = await ctx.db.get(args.issueId);
		if (!issue || issue.deletedAt) {
			throw new ConvexError("Issue not found");
		}
		await requireMembership(ctx, issue.workspaceId, args.userId);

		// If moving to a sprint, verify it exists and belongs to same workspace
		if (args.sprintId) {
			const sprint = await ctx.db.get(args.sprintId);
			if (!sprint) {
				throw new ConvexError("Sprint not found");
			}
		}

		await ctx.db.patch(args.issueId, {
			sprintId: args.sprintId,
			listId: undefined, // Sprint and list are mutually exclusive
			updatedAt: Date.now(),
		});

		// Sprint issue counts are computed dynamically in queries,
		// no need to patch sprint records here.
	},
});

// ── 10. updateSprint ────────────────────────────────────────────────────

export const updateSprint = internalMutation({
	args: {
		userId: v.id("users"),
		sprintId: v.id("sprints"),
		name: v.optional(v.string()),
		status: v.optional(v.string()),
		startDate: v.optional(v.number()),
		endDate: v.optional(v.number()),
		goals: v.optional(v.array(v.string())),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const sprint = await ctx.db.get(args.sprintId);
		if (!sprint) {
			throw new ConvexError("Sprint not found");
		}
		const project = await ctx.db.get(sprint.projectId);
		if (!project) {
			throw new ConvexError("Project not found");
		}
		await requireMembership(ctx, project.workspaceId, args.userId);

		const patch: Record<string, unknown> = { updatedAt: Date.now() };
		if (args.name !== undefined) patch.name = args.name;
		if (args.status !== undefined) patch.status = args.status;
		if (args.startDate !== undefined) patch.startDate = args.startDate;
		if (args.endDate !== undefined) patch.endDate = args.endDate;
		if (args.goals !== undefined) patch.goals = args.goals;

		await ctx.db.patch(args.sprintId, patch);
	},
});
