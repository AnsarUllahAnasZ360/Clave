import { ConvexError, v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { mutation, query } from "./_generated/server";
import { requireWorkspaceMember } from "./lib/auth";
import { fractionalIndex } from "./lib/utils";

// ── Helpers ────────────────────────────────────────────────────────────────

function isCompletedStatus(status: string): boolean {
	return status === "done" || status === "cancelled";
}

async function computeProgress(ctx: QueryCtx, milestoneId: Id<"milestones">) {
	const issues = await ctx.db
		.query("issues")
		.withIndex("by_milestone", (q) => q.eq("milestoneId", milestoneId))
		.collect();

	const activeIssues = issues.filter((issue) => !issue.deletedAt);
	const issueCount = activeIssues.length;
	const completedCount = activeIssues.filter((issue) =>
		isCompletedStatus(issue.status),
	).length;
	const progressPercentage =
		issueCount > 0 ? Math.round((completedCount / issueCount) * 100) : 0;

	return { issueCount, completedCount, progressPercentage };
}

// ── Validators ─────────────────────────────────────────────────────────────

const milestoneWithProgressValidator = v.object({
	_id: v.id("milestones"),
	_creationTime: v.number(),
	projectId: v.id("projects"),
	name: v.string(),
	description: v.optional(v.string()),
	icon: v.optional(v.string()),
	startDate: v.optional(v.number()),
	targetDate: v.optional(v.number()),
	sortOrder: v.number(),
	status: v.string(),
	createdBy: v.id("users"),
	updatedAt: v.optional(v.number()),
	deletedAt: v.optional(v.number()),
	issueCount: v.number(),
	completedCount: v.number(),
	progressPercentage: v.number(),
});

// ── Queries ────────────────────────────────────────────────────────────────

/** Milestones for a project, ordered by sortOrder, with computed progress */
export const listByProject = query({
	args: {
		projectId: v.id("projects"),
	},
	returns: v.array(milestoneWithProgressValidator),
	handler: async (ctx, args) => {
		const project = await ctx.db.get(args.projectId);
		if (!project || project.deletedAt) return [];
		await requireWorkspaceMember(ctx, project.workspaceId);

		const milestones = await ctx.db
			.query("milestones")
			.withIndex("by_project_sort", (q) => q.eq("projectId", args.projectId))
			.collect();

		const activeMilestones = milestones.filter((m) => !m.deletedAt);

		return Promise.all(
			activeMilestones.map(async (milestone) => {
				const progress = await computeProgress(ctx, milestone._id);
				return { ...milestone, ...progress };
			}),
		);
	},
});

/** Single milestone by ID with progress stats and project name */
export const getById = query({
	args: {
		milestoneId: v.id("milestones"),
	},
	returns: v.union(
		v.object({
			_id: v.id("milestones"),
			_creationTime: v.number(),
			projectId: v.id("projects"),
			name: v.string(),
			description: v.optional(v.string()),
			icon: v.optional(v.string()),
			startDate: v.optional(v.number()),
			targetDate: v.optional(v.number()),
			sortOrder: v.number(),
			status: v.string(),
			createdBy: v.id("users"),
			updatedAt: v.optional(v.number()),
			deletedAt: v.optional(v.number()),
			issueCount: v.number(),
			completedCount: v.number(),
			progressPercentage: v.number(),
			projectName: v.string(),
		}),
		v.null(),
	),
	handler: async (ctx, args) => {
		const milestone = await ctx.db.get(args.milestoneId);
		if (!milestone || milestone.deletedAt) return null;

		const project = await ctx.db.get(milestone.projectId);
		if (!project || project.deletedAt) return null;
		await requireWorkspaceMember(ctx, project.workspaceId);

		const progress = await computeProgress(ctx, milestone._id);

		return {
			...milestone,
			...progress,
			projectName: project.name,
		};
	},
});

// ── Mutations ──────────────────────────────────────────────────────────────

const milestoneStatusValidator = v.union(
	v.literal("active"),
	v.literal("completed"),
	v.literal("cancelled"),
);

/** Create a new milestone */
export const create = mutation({
	args: {
		projectId: v.id("projects"),
		name: v.string(),
		description: v.optional(v.string()),
		icon: v.optional(v.string()),
		startDate: v.optional(v.number()),
		targetDate: v.optional(v.number()),
		sortOrder: v.optional(v.float64()),
	},
	returns: v.id("milestones"),
	handler: async (ctx, args) => {
		const project = await ctx.db.get(args.projectId);
		if (!project || project.deletedAt) {
			throw new ConvexError("Project not found");
		}
		const { userId } = await requireWorkspaceMember(ctx, project.workspaceId);

		// Compute sortOrder: use provided value or append at end
		let sortOrder: number;
		if (args.sortOrder !== undefined) {
			sortOrder = args.sortOrder;
		} else {
			const lastMilestone = await ctx.db
				.query("milestones")
				.withIndex("by_project_sort", (q) => q.eq("projectId", args.projectId))
				.order("desc")
				.first();
			sortOrder = fractionalIndex(
				lastMilestone ? lastMilestone.sortOrder : null,
				null,
			);
		}

		const milestoneId = await ctx.db.insert("milestones", {
			projectId: args.projectId,
			name: args.name,
			description: args.description,
			icon: args.icon,
			startDate: args.startDate,
			targetDate: args.targetDate,
			sortOrder,
			status: "active",
			createdBy: userId,
		});

		// Activity log
		await ctx.db.insert("activityLogs", {
			workspaceId: project.workspaceId,
			projectId: args.projectId,
			actorId: userId,
			action: "created",
			entityType: "milestone",
			entityId: milestoneId,
			description: `created milestone "${args.name}"`,
		});

		return milestoneId;
	},
});

/** Partial patch of milestone fields */
export const update = mutation({
	args: {
		milestoneId: v.id("milestones"),
		name: v.optional(v.string()),
		description: v.optional(v.string()),
		icon: v.optional(v.string()),
		startDate: v.optional(v.number()),
		targetDate: v.optional(v.number()),
		status: v.optional(milestoneStatusValidator),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const milestone = await ctx.db.get(args.milestoneId);
		if (!milestone || milestone.deletedAt) {
			throw new ConvexError("Milestone not found");
		}
		const project = await ctx.db.get(milestone.projectId);
		if (!project || project.deletedAt) {
			throw new ConvexError("Project not found");
		}
		const { userId } = await requireWorkspaceMember(ctx, project.workspaceId);

		const { milestoneId, ...updates } = args;

		await ctx.db.patch(milestoneId, {
			...updates,
			updatedAt: Date.now(),
		});

		// Log status change if status was updated
		if (args.status && args.status !== milestone.status) {
			await ctx.db.insert("activityLogs", {
				workspaceId: project.workspaceId,
				projectId: milestone.projectId,
				actorId: userId,
				action: "status_changed",
				entityType: "milestone",
				entityId: milestoneId,
				description: `changed milestone "${milestone.name}" status from ${milestone.status} to ${args.status}`,
				field: "status",
				oldValue: milestone.status,
				newValue: args.status,
			});
		} else {
			const changedFields: string[] = [];
			if (args.name !== undefined && args.name !== milestone.name)
				changedFields.push("name");
			if (args.description !== undefined) changedFields.push("description");
			if (args.startDate !== undefined) changedFields.push("startDate");
			if (args.targetDate !== undefined) changedFields.push("targetDate");

			if (changedFields.length > 0) {
				await ctx.db.insert("activityLogs", {
					workspaceId: project.workspaceId,
					projectId: milestone.projectId,
					actorId: userId,
					action: "updated",
					entityType: "milestone",
					entityId: milestoneId,
					description: `updated ${changedFields.join(", ")} on milestone "${milestone.name}"`,
				});
			}
		}
	},
});

/** Update sortOrder for drag-and-drop reordering */
export const reorder = mutation({
	args: {
		milestoneId: v.id("milestones"),
		newSortOrder: v.float64(),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const milestone = await ctx.db.get(args.milestoneId);
		if (!milestone || milestone.deletedAt) {
			throw new ConvexError("Milestone not found");
		}
		const project = await ctx.db.get(milestone.projectId);
		if (!project || project.deletedAt) {
			throw new ConvexError("Project not found");
		}
		await requireWorkspaceMember(ctx, project.workspaceId);

		await ctx.db.patch(args.milestoneId, {
			sortOrder: args.newSortOrder,
		});
	},
});

/** Soft delete milestone and clear milestoneId on associated issues */
export const remove = mutation({
	args: {
		milestoneId: v.id("milestones"),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const milestone = await ctx.db.get(args.milestoneId);
		if (!milestone || milestone.deletedAt) {
			throw new ConvexError("Milestone not found");
		}
		const project = await ctx.db.get(milestone.projectId);
		if (!project || project.deletedAt) {
			throw new ConvexError("Project not found");
		}
		const { userId } = await requireWorkspaceMember(ctx, project.workspaceId);

		// Soft delete the milestone
		await ctx.db.patch(args.milestoneId, {
			deletedAt: Date.now(),
		});

		// Clear milestoneId on associated issues (do NOT delete issues)
		const issues = await ctx.db
			.query("issues")
			.withIndex("by_milestone", (q) => q.eq("milestoneId", args.milestoneId))
			.collect();

		for (const issue of issues) {
			if (!issue.deletedAt) {
				await ctx.db.patch(issue._id, {
					milestoneId: undefined,
					updatedAt: Date.now(),
				});
			}
		}

		// Activity log
		await ctx.db.insert("activityLogs", {
			workspaceId: project.workspaceId,
			projectId: milestone.projectId,
			actorId: userId,
			action: "deleted",
			entityType: "milestone",
			entityId: args.milestoneId,
			description: `deleted milestone "${milestone.name}"`,
			metadata: JSON.stringify({ name: milestone.name }),
		});
	},
});

/** Set milestone status to completed */
export const complete = mutation({
	args: {
		milestoneId: v.id("milestones"),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const milestone = await ctx.db.get(args.milestoneId);
		if (!milestone || milestone.deletedAt) {
			throw new ConvexError("Milestone not found");
		}
		const project = await ctx.db.get(milestone.projectId);
		if (!project || project.deletedAt) {
			throw new ConvexError("Project not found");
		}
		const { userId } = await requireWorkspaceMember(ctx, project.workspaceId);

		const oldStatus = milestone.status;
		await ctx.db.patch(args.milestoneId, {
			status: "completed",
			updatedAt: Date.now(),
		});

		// Activity log
		await ctx.db.insert("activityLogs", {
			workspaceId: project.workspaceId,
			projectId: milestone.projectId,
			actorId: userId,
			action: "status_changed",
			entityType: "milestone",
			entityId: args.milestoneId,
			description: `completed milestone "${milestone.name}"`,
			field: "status",
			oldValue: oldStatus,
			newValue: "completed",
		});
	},
});
