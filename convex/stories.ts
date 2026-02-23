import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { logActivity } from "./lib/activity";
import { requireWorkspaceMember } from "./lib/auth";
import { createNotification } from "./lib/notifications";
import { fractionalIndex, generateIdentifier } from "./lib/utils";

// ── Shared Validators ──────────────────────────────────────────────────────

const storyStatusValidator = v.union(
	v.literal("backlog"),
	v.literal("triage"),
	v.literal("todo"),
	v.literal("in_progress"),
	v.literal("in_review"),
	v.literal("done"),
	v.literal("cancelled"),
);

const storyPriorityValidator = v.union(
	v.literal("urgent"),
	v.literal("high"),
	v.literal("medium"),
	v.literal("low"),
	v.literal("no_priority"),
);

const storyTypeValidator = v.union(
	v.literal("story"),
	v.literal("bug"),
	v.literal("improvement"),
	v.literal("feature"),
);

// ── Shared Return Validators ────────────────────────────────────────────────

const storyDocValidator = v.object({
	_id: v.id("stories"),
	_creationTime: v.number(),
	workspaceId: v.id("workspaces"),
	projectId: v.optional(v.id("projects")),
	sprintId: v.optional(v.id("sprints")),
	parentId: v.optional(v.id("stories")),
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
});

// ── Queries (9) ────────────────────────────────────────────────────────────

export const listByProject = query({
	args: {
		projectId: v.id("projects"),
	},
	returns: v.array(storyDocValidator),
	handler: async (ctx, args) => {
		const project = await ctx.db.get(args.projectId);
		if (!project || project.deletedAt) return [];
		await requireWorkspaceMember(ctx, project.workspaceId);

		const stories = await ctx.db
			.query("stories")
			.withIndex("by_project_sort", (q) => q.eq("projectId", args.projectId))
			.collect();

		return stories.filter((s) => !s.deletedAt);
	},
});

export const listBySprint = query({
	args: {
		sprintId: v.id("sprints"),
	},
	returns: v.array(storyDocValidator),
	handler: async (ctx, args) => {
		const sprint = await ctx.db.get(args.sprintId);
		if (!sprint || sprint.deletedAt) return [];

		const project = await ctx.db.get(sprint.projectId);
		if (!project || project.deletedAt) return [];
		await requireWorkspaceMember(ctx, project.workspaceId);

		const stories = await ctx.db
			.query("stories")
			.withIndex("by_sprint_sort", (q) => q.eq("sprintId", args.sprintId))
			.collect();

		return stories.filter((s) => !s.deletedAt);
	},
});

export const listByAssignee = query({
	args: {
		workspaceId: v.id("workspaces"),
		assigneeId: v.id("users"),
	},
	returns: v.array(storyDocValidator),
	handler: async (ctx, args) => {
		await requireWorkspaceMember(ctx, args.workspaceId);

		const stories = await ctx.db
			.query("stories")
			.withIndex("by_workspace_assignee", (q) =>
				q.eq("workspaceId", args.workspaceId).eq("assigneeId", args.assigneeId),
			)
			.collect();

		return stories.filter((s) => !s.deletedAt);
	},
});

export const myStories = query({
	args: {
		workspaceId: v.id("workspaces"),
	},
	returns: v.array(storyDocValidator),
	handler: async (ctx, args) => {
		const { userId } = await requireWorkspaceMember(ctx, args.workspaceId);

		const stories = await ctx.db
			.query("stories")
			.withIndex("by_workspace_assignee", (q) =>
				q.eq("workspaceId", args.workspaceId).eq("assigneeId", userId),
			)
			.collect();

		return stories.filter((s) => !s.deletedAt);
	},
});

export const getById = query({
	args: {
		storyId: v.id("stories"),
	},
	returns: v.union(storyDocValidator, v.null()),
	handler: async (ctx, args) => {
		const story = await ctx.db.get(args.storyId);
		if (!story || story.deletedAt) return null;
		await requireWorkspaceMember(ctx, story.workspaceId);
		return story;
	},
});

export const getByIdentifier = query({
	args: {
		workspaceId: v.id("workspaces"),
		identifier: v.string(),
	},
	returns: v.union(storyDocValidator, v.null()),
	handler: async (ctx, args) => {
		await requireWorkspaceMember(ctx, args.workspaceId);

		const story = await ctx.db
			.query("stories")
			.withIndex("by_identifier", (q) =>
				q.eq("workspaceId", args.workspaceId).eq("identifier", args.identifier),
			)
			.unique();

		if (!story || story.deletedAt) return null;
		return story;
	},
});

export const getSubIssues = query({
	args: {
		parentId: v.id("stories"),
	},
	returns: v.array(storyDocValidator),
	handler: async (ctx, args) => {
		const parent = await ctx.db.get(args.parentId);
		if (!parent || parent.deletedAt) return [];
		await requireWorkspaceMember(ctx, parent.workspaceId);

		const children = await ctx.db
			.query("stories")
			.withIndex("by_parent", (q) => q.eq("parentId", args.parentId))
			.collect();

		return children.filter((s) => !s.deletedAt);
	},
});

export const getByStatus = query({
	args: {
		projectId: v.id("projects"),
		status: storyStatusValidator,
	},
	returns: v.array(storyDocValidator),
	handler: async (ctx, args) => {
		const project = await ctx.db.get(args.projectId);
		if (!project || project.deletedAt) return [];
		await requireWorkspaceMember(ctx, project.workspaceId);

		const stories = await ctx.db
			.query("stories")
			.withIndex("by_project_status", (q) =>
				q.eq("projectId", args.projectId).eq("status", args.status),
			)
			.collect();

		return stories.filter((s) => !s.deletedAt);
	},
});

export const search = query({
	args: {
		workspaceId: v.id("workspaces"),
		searchTerm: v.string(),
	},
	returns: v.array(storyDocValidator),
	handler: async (ctx, args) => {
		await requireWorkspaceMember(ctx, args.workspaceId);

		if (!args.searchTerm.trim()) return [];

		const stories = await ctx.db
			.query("stories")
			.withSearchIndex("search_title", (q) =>
				q.search("title", args.searchTerm).eq("workspaceId", args.workspaceId),
			)
			.take(20);

		return stories.filter((s) => !s.deletedAt);
	},
});

// ── Mutations (9) ──────────────────────────────────────────────────────────

export const create = mutation({
	args: {
		workspaceId: v.id("workspaces"),
		projectId: v.optional(v.id("projects")),
		sprintId: v.optional(v.id("sprints")),
		parentId: v.optional(v.id("stories")),
		title: v.string(),
		description: v.optional(v.string()),
		status: v.optional(storyStatusValidator),
		priority: v.optional(storyPriorityValidator),
		type: v.optional(storyTypeValidator),
		assigneeId: v.optional(v.id("users")),
		labelIds: v.optional(v.array(v.id("labels"))),
		startDate: v.optional(v.number()),
		dueDate: v.optional(v.number()),
		estimate: v.optional(v.float64()),
		tags: v.optional(v.array(v.string())),
	},
	returns: v.object({
		storyId: v.id("stories"),
		identifier: v.string(),
	}),
	handler: async (ctx, args) => {
		const { userId } = await requireWorkspaceMember(ctx, args.workspaceId);

		// Auto-generate identifier from workspace settings
		const settings = await ctx.db
			.query("workspaceSettings")
			.withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
			.unique();

		if (!settings) {
			throw new ConvexError("Workspace settings not found");
		}

		const identifier = generateIdentifier(
			settings.storyPrefix,
			settings.nextStoryNumber,
		);

		// Atomically increment the counter
		await ctx.db.patch(settings._id, {
			nextStoryNumber: settings.nextStoryNumber + 1,
		});

		// Compute sortOrder: append at end of project or sprint
		let lastSortOrder: number | null = null;
		if (args.sprintId) {
			const last = await ctx.db
				.query("stories")
				.withIndex("by_sprint_sort", (q) => q.eq("sprintId", args.sprintId))
				.order("desc")
				.first();
			if (last) lastSortOrder = last.sortOrder;
		} else if (args.projectId) {
			const last = await ctx.db
				.query("stories")
				.withIndex("by_project_sort", (q) => q.eq("projectId", args.projectId))
				.order("desc")
				.first();
			if (last) lastSortOrder = last.sortOrder;
		}
		const sortOrder = fractionalIndex(lastSortOrder, null);

		const storyId = await ctx.db.insert("stories", {
			workspaceId: args.workspaceId,
			projectId: args.projectId,
			sprintId: args.sprintId,
			parentId: args.parentId,
			identifier,
			title: args.title,
			description: args.description,
			status: args.status ?? "backlog",
			priority: args.priority ?? "no_priority",
			type: args.type ?? "story",
			assigneeId: args.assigneeId,
			labelIds: args.labelIds,
			startDate: args.startDate,
			dueDate: args.dueDate,
			sortOrder,
			estimate: args.estimate,
			tags: args.tags,
			createdBy: userId,
		});

		// Activity log
		await logActivity(ctx, {
			workspaceId: args.workspaceId,
			entityType: "story",
			entityId: storyId,
			action: "created",
			actorId: userId,
			description: `created story "${identifier}: ${args.title}"`,
			storyId,
			projectId: args.projectId,
			metadata: JSON.stringify({ identifier }),
		});

		return { storyId, identifier };
	},
});

export const update = mutation({
	args: {
		storyId: v.id("stories"),
		title: v.optional(v.string()),
		description: v.optional(v.string()),
		priority: v.optional(storyPriorityValidator),
		type: v.optional(storyTypeValidator),
		labelIds: v.optional(v.array(v.id("labels"))),
		startDate: v.optional(v.number()),
		dueDate: v.optional(v.number()),
		estimate: v.optional(v.float64()),
		tags: v.optional(v.array(v.string())),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const story = await ctx.db.get(args.storyId);
		if (!story || story.deletedAt) {
			throw new ConvexError("Story not found");
		}
		await requireWorkspaceMember(ctx, story.workspaceId);

		const { storyId, ...updates } = args;
		await ctx.db.patch(storyId, {
			...updates,
			updatedAt: Date.now(),
		});
	},
});

export const updateStatus = mutation({
	args: {
		storyId: v.id("stories"),
		status: storyStatusValidator,
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const story = await ctx.db.get(args.storyId);
		if (!story || story.deletedAt) {
			throw new ConvexError("Story not found");
		}
		const { userId } = await requireWorkspaceMember(ctx, story.workspaceId);

		const oldStatus = story.status;
		const patch: Record<string, unknown> = {
			status: args.status,
			updatedAt: Date.now(),
		};

		// Set completedAt when status is done
		if (args.status === "done" && oldStatus !== "done") {
			patch.completedAt = Date.now();
		}
		// Clear completedAt if moving away from done
		if (args.status !== "done" && oldStatus === "done") {
			patch.completedAt = undefined;
		}

		await ctx.db.patch(args.storyId, patch);

		// Activity log for status change
		if (args.status !== oldStatus) {
			const oldLabel = oldStatus.replace(/_/g, " ");
			const newLabel = args.status.replace(/_/g, " ");
			await logActivity(ctx, {
				workspaceId: story.workspaceId,
				entityType: "story",
				entityId: args.storyId,
				action: "status_changed",
				actorId: userId,
				description: `changed status from ${oldLabel} to ${newLabel}`,
				storyId: args.storyId,
				projectId: story.projectId,
				field: "status",
				oldValue: oldStatus,
				newValue: args.status,
			});

			// Notify creator and assignee (excluding actor)
			const actor = await ctx.db.get(userId);
			const actorName = actor?.name ?? "Someone";
			const statusLabel = args.status.replace(/_/g, " ");
			const oldStatusLabel = oldStatus.replace(/_/g, " ");
			const body = `${actorName} changed '${story.identifier}: ${story.title}' from ${oldStatusLabel} to ${statusLabel}`;

			const recipientIds: Set<string> = new Set();
			if (story.createdBy) recipientIds.add(story.createdBy);
			if (story.assigneeId) recipientIds.add(story.assigneeId);

			for (const recipientId of recipientIds) {
				await createNotification(ctx, {
					userId: recipientId as typeof story.createdBy,
					workspaceId: story.workspaceId,
					type: "story_status_changed",
					title: "Story status changed",
					body,
					storyId: args.storyId,
					projectId: story.projectId ?? undefined,
					actorId: userId,
				});
			}
		}
	},
});

export const assign = mutation({
	args: {
		storyId: v.id("stories"),
		assigneeId: v.optional(v.id("users")),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const story = await ctx.db.get(args.storyId);
		if (!story || story.deletedAt) {
			throw new ConvexError("Story not found");
		}
		const { userId } = await requireWorkspaceMember(ctx, story.workspaceId);

		const oldAssigneeId = story.assigneeId;
		await ctx.db.patch(args.storyId, {
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
			workspaceId: story.workspaceId,
			entityType: "story",
			entityId: args.storyId,
			action: "assigned",
			actorId: userId,
			description: `assigned story from ${oldName} to ${newName}`,
			storyId: args.storyId,
			projectId: story.projectId,
			field: "assigneeId",
			oldValue: oldAssigneeId ?? undefined,
			newValue: args.assigneeId ?? undefined,
		});

		// Notify assignee
		if (args.assigneeId) {
			const actor = await ctx.db.get(userId);
			const actorName = actor?.name ?? "Someone";
			await createNotification(ctx, {
				userId: args.assigneeId,
				workspaceId: story.workspaceId,
				type: "story_assigned",
				title: "Story assigned to you",
				body: `${actorName} assigned '${story.identifier}: ${story.title}' to you`,
				storyId: args.storyId,
				projectId: story.projectId ?? undefined,
				actorId: userId,
			});
		}
	},
});

export const reorder = mutation({
	args: {
		storyId: v.id("stories"),
		newSortOrder: v.float64(),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const story = await ctx.db.get(args.storyId);
		if (!story || story.deletedAt) {
			throw new ConvexError("Story not found");
		}
		await requireWorkspaceMember(ctx, story.workspaceId);

		await ctx.db.patch(args.storyId, {
			sortOrder: args.newSortOrder,
		});
	},
});

export const bulkUpdateStatus = mutation({
	args: {
		storyIds: v.array(v.id("stories")),
		status: storyStatusValidator,
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		if (args.storyIds.length === 0) return;

		// Verify auth from the first story's workspace
		const firstStory = await ctx.db.get(args.storyIds[0]);
		if (!firstStory || firstStory.deletedAt) {
			throw new ConvexError("Story not found");
		}
		const { userId } = await requireWorkspaceMember(
			ctx,
			firstStory.workspaceId,
		);

		for (const storyId of args.storyIds) {
			const story = await ctx.db.get(storyId);
			if (!story || story.deletedAt) continue;

			const oldStatus = story.status;
			const patch: Record<string, unknown> = {
				status: args.status,
				updatedAt: Date.now(),
			};

			if (args.status === "done" && oldStatus !== "done") {
				patch.completedAt = Date.now();
			}
			if (args.status !== "done" && oldStatus === "done") {
				patch.completedAt = undefined;
			}

			await ctx.db.patch(storyId, patch);

			// Activity log for each status change
			if (args.status !== oldStatus) {
				const oldLabel = oldStatus.replace(/_/g, " ");
				const newLabel = args.status.replace(/_/g, " ");
				await logActivity(ctx, {
					workspaceId: story.workspaceId,
					entityType: "story",
					entityId: storyId,
					action: "status_changed",
					actorId: userId,
					description: `changed status from ${oldLabel} to ${newLabel}`,
					storyId,
					projectId: story.projectId,
					field: "status",
					oldValue: oldStatus,
					newValue: args.status,
				});
			}
		}
	},
});

export const bulkAssign = mutation({
	args: {
		storyIds: v.array(v.id("stories")),
		assigneeId: v.optional(v.id("users")),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		if (args.storyIds.length === 0) return;

		// Verify auth from the first story's workspace
		const firstStory = await ctx.db.get(args.storyIds[0]);
		if (!firstStory || firstStory.deletedAt) {
			throw new ConvexError("Story not found");
		}
		const { userId } = await requireWorkspaceMember(
			ctx,
			firstStory.workspaceId,
		);

		for (const storyId of args.storyIds) {
			const story = await ctx.db.get(storyId);
			if (!story || story.deletedAt) continue;

			const oldAssigneeId = story.assigneeId;
			await ctx.db.patch(storyId, {
				assigneeId: args.assigneeId,
				updatedAt: Date.now(),
			});

			// Activity log for each assignment
			await logActivity(ctx, {
				workspaceId: story.workspaceId,
				entityType: "story",
				entityId: storyId,
				action: "assigned",
				actorId: userId,
				description: "reassigned story",
				storyId,
				projectId: story.projectId,
				field: "assigneeId",
				oldValue: oldAssigneeId ?? undefined,
				newValue: args.assigneeId ?? undefined,
			});
		}
	},
});

export const remove = mutation({
	args: {
		storyId: v.id("stories"),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const story = await ctx.db.get(args.storyId);
		if (!story || story.deletedAt) {
			throw new ConvexError("Story not found");
		}
		const { userId } = await requireWorkspaceMember(ctx, story.workspaceId);

		// Soft delete the story
		await ctx.db.patch(args.storyId, {
			deletedAt: Date.now(),
		});

		// Also soft-delete sub-issues
		const children = await ctx.db
			.query("stories")
			.withIndex("by_parent", (q) => q.eq("parentId", args.storyId))
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
			workspaceId: story.workspaceId,
			entityType: "story",
			entityId: args.storyId,
			action: "deleted",
			actorId: userId,
			description: `deleted story "${story.identifier}: ${story.title}"`,
			storyId: args.storyId,
			projectId: story.projectId,
			metadata: JSON.stringify({
				identifier: story.identifier,
				title: story.title,
			}),
		});
	},
});

export const moveToSprint = mutation({
	args: {
		storyId: v.id("stories"),
		sprintId: v.optional(v.id("sprints")),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const story = await ctx.db.get(args.storyId);
		if (!story || story.deletedAt) {
			throw new ConvexError("Story not found");
		}
		const { userId } = await requireWorkspaceMember(ctx, story.workspaceId);

		// Validate the target sprint exists and belongs to the same project
		if (args.sprintId) {
			const sprint = await ctx.db.get(args.sprintId);
			if (!sprint || sprint.deletedAt) {
				throw new ConvexError("Sprint not found");
			}
			if (story.projectId && sprint.projectId !== story.projectId) {
				throw new ConvexError("Sprint does not belong to the same project");
			}
		}

		const oldSprintId = story.sprintId;
		await ctx.db.patch(args.storyId, {
			sprintId: args.sprintId,
			updatedAt: Date.now(),
		});

		// Activity log for sprint move
		await logActivity(ctx, {
			workspaceId: story.workspaceId,
			entityType: "story",
			entityId: args.storyId,
			action: "moved_to_sprint",
			actorId: userId,
			description: "moved story to a different sprint",
			storyId: args.storyId,
			projectId: story.projectId,
			field: "sprintId",
			oldValue: oldSprintId ?? undefined,
			newValue: args.sprintId ?? undefined,
		});
	},
});
