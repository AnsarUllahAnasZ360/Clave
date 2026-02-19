import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireWorkspaceMember } from "./lib/auth";
import { fractionalIndex } from "./lib/utils";

// ── Shared Return Validators ────────────────────────────────────────────────

const sprintDocValidator = v.object({
	_id: v.id("sprints"),
	_creationTime: v.number(),
	projectId: v.id("projects"),
	name: v.string(),
	description: v.optional(v.string()),
	status: v.string(),
	startDate: v.optional(v.number()),
	endDate: v.optional(v.number()),
	sortOrder: v.number(),
	goals: v.optional(v.array(v.string())),
	createdBy: v.id("users"),
	updatedAt: v.optional(v.number()),
	deletedAt: v.optional(v.number()),
});

// ── Queries ────────────────────────────────────────────────────────────────

export const listByProject = query({
	args: {
		projectId: v.id("projects"),
	},
	returns: v.array(sprintDocValidator),
	handler: async (ctx, args) => {
		const project = await ctx.db.get(args.projectId);
		if (!project || project.deletedAt) return [];
		await requireWorkspaceMember(ctx, project.workspaceId);

		const sprints = await ctx.db
			.query("sprints")
			.withIndex("by_project_sort", (q) => q.eq("projectId", args.projectId))
			.collect();

		return sprints.filter((s) => !s.deletedAt);
	},
});

export const getById = query({
	args: {
		sprintId: v.id("sprints"),
	},
	returns: v.union(sprintDocValidator, v.null()),
	handler: async (ctx, args) => {
		const sprint = await ctx.db.get(args.sprintId);
		if (!sprint || sprint.deletedAt) return null;

		const project = await ctx.db.get(sprint.projectId);
		if (!project || project.deletedAt) return null;
		await requireWorkspaceMember(ctx, project.workspaceId);

		return sprint;
	},
});

// ── Mutations ──────────────────────────────────────────────────────────────

export const create = mutation({
	args: {
		projectId: v.id("projects"),
		name: v.string(),
		description: v.optional(v.string()),
		status: v.optional(
			v.union(
				v.literal("planned"),
				v.literal("active"),
				v.literal("completed"),
				v.literal("cancelled"),
			),
		),
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
		const { userId } = await requireWorkspaceMember(ctx, project.workspaceId);

		// Compute sortOrder: append at end
		const lastSprint = await ctx.db
			.query("sprints")
			.withIndex("by_project_sort", (q) => q.eq("projectId", args.projectId))
			.order("desc")
			.first();
		const sortOrder = fractionalIndex(
			lastSprint ? lastSprint.sortOrder : null,
			null,
		);

		const sprintId = await ctx.db.insert("sprints", {
			projectId: args.projectId,
			name: args.name,
			description: args.description,
			status: args.status ?? "planned",
			startDate: args.startDate,
			endDate: args.endDate,
			sortOrder,
			goals: args.goals,
			createdBy: userId,
		});

		// Activity log
		await ctx.db.insert("activityLogs", {
			workspaceId: project.workspaceId,
			projectId: args.projectId,
			actorId: userId,
			action: "created",
			entityType: "sprint",
			entityId: sprintId,
		});

		return sprintId;
	},
});

export const update = mutation({
	args: {
		sprintId: v.id("sprints"),
		name: v.optional(v.string()),
		description: v.optional(v.string()),
		status: v.optional(
			v.union(
				v.literal("planned"),
				v.literal("active"),
				v.literal("completed"),
				v.literal("cancelled"),
			),
		),
		startDate: v.optional(v.number()),
		endDate: v.optional(v.number()),
		goals: v.optional(v.array(v.string())),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const sprint = await ctx.db.get(args.sprintId);
		if (!sprint || sprint.deletedAt) {
			throw new ConvexError("Sprint not found");
		}
		const project = await ctx.db.get(sprint.projectId);
		if (!project || project.deletedAt) {
			throw new ConvexError("Project not found");
		}
		const { userId } = await requireWorkspaceMember(ctx, project.workspaceId);

		const oldStatus = sprint.status;
		const { sprintId, ...updates } = args;

		await ctx.db.patch(sprintId, {
			...updates,
			updatedAt: Date.now(),
		});

		// Log status change if status was updated
		if (args.status && args.status !== oldStatus) {
			await ctx.db.insert("activityLogs", {
				workspaceId: project.workspaceId,
				projectId: sprint.projectId,
				actorId: userId,
				action: "status_changed",
				entityType: "sprint",
				entityId: sprintId,
				field: "status",
				oldValue: oldStatus,
				newValue: args.status,
			});
		}
	},
});

export const remove = mutation({
	args: {
		sprintId: v.id("sprints"),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const sprint = await ctx.db.get(args.sprintId);
		if (!sprint || sprint.deletedAt) {
			throw new ConvexError("Sprint not found");
		}
		const project = await ctx.db.get(sprint.projectId);
		if (!project || project.deletedAt) {
			throw new ConvexError("Project not found");
		}
		const { userId } = await requireWorkspaceMember(ctx, project.workspaceId);

		// Soft delete the sprint
		await ctx.db.patch(args.sprintId, {
			deletedAt: Date.now(),
		});

		// Move stories from this sprint back to project root (no sprint)
		const stories = await ctx.db
			.query("stories")
			.withIndex("by_sprint", (q) => q.eq("sprintId", args.sprintId))
			.collect();

		for (const story of stories) {
			if (!story.deletedAt) {
				await ctx.db.patch(story._id, {
					sprintId: undefined,
					updatedAt: Date.now(),
				});
			}
		}

		// Activity log
		await ctx.db.insert("activityLogs", {
			workspaceId: project.workspaceId,
			projectId: sprint.projectId,
			actorId: userId,
			action: "deleted",
			entityType: "sprint",
			entityId: args.sprintId,
			metadata: JSON.stringify({ name: sprint.name }),
		});
	},
});

export const reorder = mutation({
	args: {
		sprintId: v.id("sprints"),
		newSortOrder: v.float64(),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const sprint = await ctx.db.get(args.sprintId);
		if (!sprint || sprint.deletedAt) {
			throw new ConvexError("Sprint not found");
		}
		const project = await ctx.db.get(sprint.projectId);
		if (!project || project.deletedAt) {
			throw new ConvexError("Project not found");
		}
		await requireWorkspaceMember(ctx, project.workspaceId);

		await ctx.db.patch(args.sprintId, {
			sortOrder: args.newSortOrder,
		});
	},
});
