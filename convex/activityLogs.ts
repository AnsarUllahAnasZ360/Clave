import { v } from "convex/values";
import { query } from "./_generated/server";
import { requireWorkspaceMember } from "./lib/auth";

/**
 * List activity logs for a specific issue, sorted by newest first.
 * Joins actor data (name, image) for display.
 */
export const listByIssue = query({
	args: {
		issueId: v.id("issues"),
		limit: v.optional(v.float64()),
	},
	handler: async (ctx, args) => {
		const issue = await ctx.db.get(args.issueId);
		if (!issue || issue.deletedAt) return [];
		await requireWorkspaceMember(ctx, issue.workspaceId);

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

/**
 * List activity logs for a specific task, sorted by newest first.
 * Joins actor data (name, image) for display.
 */
export const listByTask = query({
	args: {
		taskId: v.id("tasks"),
		limit: v.optional(v.float64()),
		cursor: v.optional(v.float64()),
	},
	handler: async (ctx, args) => {
		const task = await ctx.db.get(args.taskId);
		if (!task || task.deletedAt) return { entries: [], hasMore: false };
		await requireWorkspaceMember(ctx, task.workspaceId);

		const limit = args.limit ?? 50;

		let logs = await ctx.db
			.query("activityLogs")
			.withIndex("by_task", (q) => q.eq("taskId", args.taskId))
			.order("desc")
			.collect();

		// Apply cursor-based pagination (cursor = _creationTime of last item)
		if (args.cursor) {
			logs = logs.filter((l) => l._creationTime < args.cursor!);
		}

		const hasMore = logs.length > limit;
		const entries = logs.slice(0, limit);

		// Join actor data
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

/**
 * List activity logs for a specific project, including task-level activity
 * within the project. Sorted by newest first, with actor data joined.
 */
export const listByProject = query({
	args: {
		projectId: v.id("projects"),
		limit: v.optional(v.float64()),
		cursor: v.optional(v.float64()),
	},
	handler: async (ctx, args) => {
		const project = await ctx.db.get(args.projectId);
		if (!project || project.deletedAt) return { entries: [], hasMore: false };
		await requireWorkspaceMember(ctx, project.workspaceId);

		const limit = args.limit ?? 50;

		let logs = await ctx.db
			.query("activityLogs")
			.withIndex("by_project", (q) => q.eq("projectId", args.projectId))
			.order("desc")
			.collect();

		// Apply cursor-based pagination
		if (args.cursor) {
			logs = logs.filter((l) => l._creationTime < args.cursor!);
		}

		const hasMore = logs.length > limit;
		const entries = logs.slice(0, limit);

		// Join actor data
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
