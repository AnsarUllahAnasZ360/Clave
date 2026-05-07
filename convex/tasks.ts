import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { logActivity } from "./lib/activity";
import { requireWorkspaceMember } from "./lib/auth";
import { createNotification } from "./lib/notifications";
import { fractionalIndex, generateIdentifier } from "./lib/utils";

// ── Shared Validators ──────────────────────────────────────────────────────

const taskStatusValidator = v.union(
	v.literal("backlog"),
	v.literal("todo"),
	v.literal("in_progress"),
	v.literal("in_review"),
	v.literal("done"),
	v.literal("cancelled"),
);

const taskPriorityValidator = v.union(
	v.literal("none"),
	v.literal("low"),
	v.literal("medium"),
	v.literal("high"),
	v.literal("urgent"),
);

const taskTypeValidator = v.union(
	v.literal("task"),
	v.literal("bug"),
	v.literal("chore"),
);

// ── Shared Return Validators ────────────────────────────────────────────────

export const taskDocValidator = v.object({
	_id: v.id("tasks"),
	_creationTime: v.number(),
	workspaceId: v.id("workspaces"),
	projectId: v.optional(v.id("projects")),
	storyId: v.optional(v.id("stories")),
	sprintId: v.optional(v.id("sprints")),
	parentId: v.optional(v.id("tasks")),
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
	returns: v.array(taskDocValidator),
	handler: async (ctx, args) => {
		const project = await ctx.db.get(args.projectId);
		if (!project || project.deletedAt) return [];
		await requireWorkspaceMember(ctx, project.workspaceId);

		const tasks = await ctx.db
			.query("tasks")
			.withIndex("by_project_sort", (q) => q.eq("projectId", args.projectId))
			.collect();

		return tasks.filter((t) => !t.deletedAt);
	},
});

export const listByStory = query({
	args: {
		storyId: v.id("stories"),
	},
	returns: v.array(taskDocValidator),
	handler: async (ctx, args) => {
		const story = await ctx.db.get(args.storyId);
		if (!story || story.deletedAt) return [];
		await requireWorkspaceMember(ctx, story.workspaceId);

		const tasks = await ctx.db
			.query("tasks")
			.withIndex("by_story", (q) => q.eq("storyId", args.storyId))
			.collect();

		return tasks.filter((t) => !t.deletedAt);
	},
});

export const listBySprint = query({
	args: {
		sprintId: v.id("sprints"),
	},
	returns: v.array(taskDocValidator),
	handler: async (ctx, args) => {
		const sprint = await ctx.db.get(args.sprintId);
		if (!sprint || sprint.deletedAt) return [];

		const project = await ctx.db.get(sprint.projectId);
		if (!project || project.deletedAt) return [];
		await requireWorkspaceMember(ctx, project.workspaceId);

		const tasks = await ctx.db
			.query("tasks")
			.withIndex("by_sprint", (q) => q.eq("sprintId", args.sprintId))
			.collect();

		return tasks.filter((t) => !t.deletedAt);
	},
});

export const listByAssignee = query({
	args: {
		workspaceId: v.id("workspaces"),
		assigneeId: v.id("users"),
	},
	returns: v.array(taskDocValidator),
	handler: async (ctx, args) => {
		await requireWorkspaceMember(ctx, args.workspaceId);

		const tasks = await ctx.db
			.query("tasks")
			.withIndex("by_workspace_assignee", (q) =>
				q.eq("workspaceId", args.workspaceId).eq("assigneeId", args.assigneeId),
			)
			.collect();

		return tasks.filter((t) => !t.deletedAt);
	},
});

export const myTasks = query({
	args: {
		workspaceId: v.id("workspaces"),
	},
	returns: v.array(taskDocValidator),
	handler: async (ctx, args) => {
		const { userId } = await requireWorkspaceMember(ctx, args.workspaceId);

		const tasks = await ctx.db
			.query("tasks")
			.withIndex("by_workspace_assignee", (q) =>
				q.eq("workspaceId", args.workspaceId).eq("assigneeId", userId),
			)
			.collect();

		return tasks.filter((t) => !t.deletedAt);
	},
});

export const getById = query({
	args: {
		taskId: v.id("tasks"),
	},
	returns: v.union(taskDocValidator, v.null()),
	handler: async (ctx, args) => {
		const task = await ctx.db.get(args.taskId);
		if (!task || task.deletedAt) return null;
		await requireWorkspaceMember(ctx, task.workspaceId);
		return task;
	},
});

export const getByIdentifier = query({
	args: {
		workspaceId: v.id("workspaces"),
		identifier: v.string(),
	},
	returns: v.union(taskDocValidator, v.null()),
	handler: async (ctx, args) => {
		await requireWorkspaceMember(ctx, args.workspaceId);

		const task = await ctx.db
			.query("tasks")
			.withIndex("by_identifier", (q) =>
				q.eq("workspaceId", args.workspaceId).eq("identifier", args.identifier),
			)
			.unique();

		if (!task || task.deletedAt) return null;
		return task;
	},
});

export const getSubtasks = query({
	args: {
		parentId: v.id("tasks"),
	},
	returns: v.array(taskDocValidator),
	handler: async (ctx, args) => {
		const parent = await ctx.db.get(args.parentId);
		if (!parent || parent.deletedAt) return [];
		await requireWorkspaceMember(ctx, parent.workspaceId);

		const children = await ctx.db
			.query("tasks")
			.withIndex("by_parent", (q) => q.eq("parentId", args.parentId))
			.collect();

		return children.filter((t) => !t.deletedAt);
	},
});

export const search = query({
	args: {
		workspaceId: v.id("workspaces"),
		searchTerm: v.string(),
	},
	returns: v.array(taskDocValidator),
	handler: async (ctx, args) => {
		await requireWorkspaceMember(ctx, args.workspaceId);

		if (!args.searchTerm.trim()) return [];

		const tasks = await ctx.db
			.query("tasks")
			.withSearchIndex("search_title", (q) =>
				q.search("title", args.searchTerm).eq("workspaceId", args.workspaceId),
			)
			.take(20);

		return tasks.filter((t) => !t.deletedAt);
	},
});

// ── Mutations (8) ──────────────────────────────────────────────────────────

export const create = mutation({
	args: {
		workspaceId: v.id("workspaces"),
		projectId: v.optional(v.id("projects")),
		storyId: v.optional(v.id("stories")),
		sprintId: v.optional(v.id("sprints")),
		parentId: v.optional(v.id("tasks")),
		title: v.string(),
		description: v.optional(v.string()),
		status: v.optional(taskStatusValidator),
		priority: v.optional(taskPriorityValidator),
		type: v.optional(taskTypeValidator),
		assigneeId: v.optional(v.id("users")),
		labelIds: v.optional(v.array(v.id("labels"))),
		startDate: v.optional(v.number()),
		dueDate: v.optional(v.number()),
		estimate: v.optional(v.float64()),
		tags: v.optional(v.array(v.string())),
	},
	returns: v.object({
		taskId: v.id("tasks"),
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

		const taskPrefix = settings.taskPrefix ?? "TSK";
		const nextTaskNumber = settings.nextTaskNumber ?? 1;

		const identifier = generateIdentifier(taskPrefix, nextTaskNumber);

		// Atomically increment the counter
		await ctx.db.patch(settings._id, {
			taskPrefix,
			nextTaskNumber: nextTaskNumber + 1,
		});

		// Compute sortOrder: append at end of project
		let lastSortOrder: number | null = null;
		if (args.projectId) {
			const last = await ctx.db
				.query("tasks")
				.withIndex("by_project_sort", (q) => q.eq("projectId", args.projectId))
				.order("desc")
				.first();
			if (last) lastSortOrder = last.sortOrder;
		}
		const sortOrder = fractionalIndex(lastSortOrder, null);

		const taskId = await ctx.db.insert("tasks", {
			workspaceId: args.workspaceId,
			projectId: args.projectId,
			storyId: args.storyId,
			sprintId: args.sprintId,
			parentId: args.parentId,
			identifier,
			title: args.title,
			description: args.description,
			status: args.status ?? "todo",
			priority: args.priority ?? "none",
			type: args.type ?? "task",
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
			entityType: "task",
			entityId: taskId,
			action: "created",
			actorId: userId,
			description: `created task "${args.title}"`,
			projectId: args.projectId,
			taskId,
			metadata: JSON.stringify({ identifier }),
		});

		return { taskId, identifier };
	},
});

export const update = mutation({
	args: {
		taskId: v.id("tasks"),
		title: v.optional(v.string()),
		description: v.optional(v.string()),
		priority: v.optional(taskPriorityValidator),
		type: v.optional(taskTypeValidator),
		labelIds: v.optional(v.array(v.id("labels"))),
		// Explicit-clear sentinel: `null` wipes the field. Convex drops
		// `undefined` values from mutation args on the wire, so an explicit
		// null is the only way to signal "clear this date".
		startDate: v.optional(v.union(v.number(), v.null())),
		dueDate: v.optional(v.union(v.number(), v.null())),
		estimate: v.optional(v.float64()),
		tags: v.optional(v.array(v.string())),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const task = await ctx.db.get(args.taskId);
		if (!task || task.deletedAt) {
			throw new ConvexError("Task not found");
		}
		await requireWorkspaceMember(ctx, task.workspaceId);

		const { taskId, ...updates } = args;
		const patch: Record<string, unknown> = {
			...updates,
			updatedAt: Date.now(),
		};
		// Map null → undefined so ctx.db.patch deletes the field.
		if (args.dueDate === null) patch.dueDate = undefined;
		if (args.startDate === null) patch.startDate = undefined;
		await ctx.db.patch(taskId, patch);
	},
});

export const updateStatus = mutation({
	args: {
		taskId: v.id("tasks"),
		status: taskStatusValidator,
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const task = await ctx.db.get(args.taskId);
		if (!task || task.deletedAt) {
			throw new ConvexError("Task not found");
		}
		const { userId } = await requireWorkspaceMember(ctx, task.workspaceId);

		const oldStatus = task.status;
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

		await ctx.db.patch(args.taskId, patch);

		// Activity log for status change
		if (args.status !== oldStatus) {
			const oldLabel = oldStatus.replace(/_/g, " ");
			const newLabel = args.status.replace(/_/g, " ");
			await logActivity(ctx, {
				workspaceId: task.workspaceId,
				entityType: "task",
				entityId: args.taskId,
				action: "status_changed",
				actorId: userId,
				description: `changed status from ${oldLabel} to ${newLabel}`,
				projectId: task.projectId,
				taskId: args.taskId,
				field: "status",
				oldValue: oldStatus,
				newValue: args.status,
			});

			// Notify creator and assignee (excluding actor)
			const actor = await ctx.db.get(userId);
			const actorName = actor?.name ?? "Someone";
			const statusLabel = args.status.replace(/_/g, " ");
			const oldStatusLabel = oldStatus.replace(/_/g, " ");
			const body = `${actorName} changed '${task.title}' from ${oldStatusLabel} to ${statusLabel}`;

			const recipientIds: Set<string> = new Set();
			if (task.createdBy) recipientIds.add(task.createdBy);
			if (task.assigneeId) recipientIds.add(task.assigneeId);

			for (const recipientId of recipientIds) {
				await createNotification(ctx, {
					userId: recipientId as typeof task.createdBy,
					workspaceId: task.workspaceId,
					type: "task_status_changed",
					title: "Task status changed",
					body,
					taskId: args.taskId,
					projectId: task.projectId ?? undefined,
					actorId: userId,
				});
			}
		}
	},
});

export const assign = mutation({
	args: {
		taskId: v.id("tasks"),
		assigneeId: v.optional(v.id("users")),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const task = await ctx.db.get(args.taskId);
		if (!task || task.deletedAt) {
			throw new ConvexError("Task not found");
		}
		const { userId } = await requireWorkspaceMember(ctx, task.workspaceId);

		const oldAssigneeId = task.assigneeId;
		await ctx.db.patch(args.taskId, {
			assigneeId: args.assigneeId,
			updatedAt: Date.now(),
		});

		// Activity log for assignment
		const oldAssigneeName = oldAssigneeId
			? ((await ctx.db.get(oldAssigneeId))?.name ?? "someone")
			: "unassigned";
		const newAssigneeName = args.assigneeId
			? ((await ctx.db.get(args.assigneeId))?.name ?? "someone")
			: "unassigned";
		await logActivity(ctx, {
			workspaceId: task.workspaceId,
			entityType: "task",
			entityId: args.taskId,
			action: "assigned",
			actorId: userId,
			description: `assigned task from ${oldAssigneeName} to ${newAssigneeName}`,
			projectId: task.projectId,
			taskId: args.taskId,
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
				workspaceId: task.workspaceId,
				type: "task_assigned",
				title: "Task assigned to you",
				body: `${actorName} assigned '${task.title}' to you`,
				taskId: args.taskId,
				projectId: task.projectId ?? undefined,
				actorId: userId,
			});
		}
	},
});

export const reorder = mutation({
	args: {
		taskId: v.id("tasks"),
		newSortOrder: v.float64(),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const task = await ctx.db.get(args.taskId);
		if (!task || task.deletedAt) {
			throw new ConvexError("Task not found");
		}
		await requireWorkspaceMember(ctx, task.workspaceId);

		await ctx.db.patch(args.taskId, {
			sortOrder: args.newSortOrder,
		});
	},
});

export const bulkUpdateStatus = mutation({
	args: {
		taskIds: v.array(v.id("tasks")),
		status: taskStatusValidator,
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		if (args.taskIds.length === 0) return;

		const firstTask = await ctx.db.get(args.taskIds[0]);
		if (!firstTask || firstTask.deletedAt) {
			throw new ConvexError("Task not found");
		}
		const { userId } = await requireWorkspaceMember(ctx, firstTask.workspaceId);

		for (const taskId of args.taskIds) {
			const task = await ctx.db.get(taskId);
			if (!task || task.deletedAt) continue;

			const oldStatus = task.status;
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

			await ctx.db.patch(taskId, patch);

			if (args.status !== oldStatus) {
				const oldLabel = oldStatus.replace(/_/g, " ");
				const newLabel = args.status.replace(/_/g, " ");
				await logActivity(ctx, {
					workspaceId: task.workspaceId,
					entityType: "task",
					entityId: taskId,
					action: "status_changed",
					actorId: userId,
					description: `changed status from ${oldLabel} to ${newLabel}`,
					projectId: task.projectId,
					taskId,
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
		taskIds: v.array(v.id("tasks")),
		assigneeId: v.optional(v.id("users")),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		if (args.taskIds.length === 0) return;

		const firstTask = await ctx.db.get(args.taskIds[0]);
		if (!firstTask || firstTask.deletedAt) {
			throw new ConvexError("Task not found");
		}
		const { userId } = await requireWorkspaceMember(ctx, firstTask.workspaceId);

		for (const taskId of args.taskIds) {
			const task = await ctx.db.get(taskId);
			if (!task || task.deletedAt) continue;

			const oldAssigneeId = task.assigneeId;
			await ctx.db.patch(taskId, {
				assigneeId: args.assigneeId,
				updatedAt: Date.now(),
			});

			await logActivity(ctx, {
				workspaceId: task.workspaceId,
				entityType: "task",
				entityId: taskId,
				action: "assigned",
				actorId: userId,
				description: "reassigned task",
				projectId: task.projectId,
				taskId,
				field: "assigneeId",
				oldValue: oldAssigneeId ?? undefined,
				newValue: args.assigneeId ?? undefined,
			});
		}
	},
});

export const remove = mutation({
	args: {
		taskId: v.id("tasks"),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const task = await ctx.db.get(args.taskId);
		if (!task || task.deletedAt) {
			throw new ConvexError("Task not found");
		}
		const { userId } = await requireWorkspaceMember(ctx, task.workspaceId);

		// Soft delete the task
		await ctx.db.patch(args.taskId, {
			deletedAt: Date.now(),
		});

		// Also soft-delete sub-tasks
		const children = await ctx.db
			.query("tasks")
			.withIndex("by_parent", (q) => q.eq("parentId", args.taskId))
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
			workspaceId: task.workspaceId,
			entityType: "task",
			entityId: args.taskId,
			action: "deleted",
			actorId: userId,
			description: `deleted task "${task.identifier}: ${task.title}"`,
			projectId: task.projectId,
			taskId: args.taskId,
			metadata: JSON.stringify({
				identifier: task.identifier,
				title: task.title,
			}),
		});
	},
});
