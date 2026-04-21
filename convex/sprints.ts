import { ConvexError, v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { internalMutation, mutation, query } from "./_generated/server";
import {
	canAccessProject,
	getAccessibleProjectIds,
	requireWorkspaceMember,
} from "./lib/auth";
import { fractionalIndex } from "./lib/utils";

/**
 * Pure: build a burndown series for a sprint window. Each sample is one
 * midnight-aligned day between `startDate` and `endDate`. `remaining` is
 * the count of issues still open at end-of-day; `ideal` is a linear
 * descent from `totalIssues` to 0 across the window so charts can overlay
 * the two.
 *
 * v1 simplification: uses the CURRENT set of issues on the sprint and
 * their `completedAt` timestamp. Issues added or removed mid-sprint are
 * not reflected — that's a v2 follow-up that would replay activity logs.
 */
export interface BurndownPoint {
	day: number;
	remaining: number | null;
	ideal: number;
}

export function buildBurndownSeries(args: {
	startDate: number;
	endDate: number;
	totalIssues: number;
	completedTimestamps: number[];
	now?: number;
}): BurndownPoint[] {
	const { startDate, endDate, totalIssues, completedTimestamps } = args;
	const now = args.now ?? Date.now();
	if (endDate <= startDate || totalIssues < 0) return [];
	const DAY_MS = 86_400_000;
	const sorted = [...completedTimestamps].sort((a, b) => a - b);

	const points: BurndownPoint[] = [];
	const firstBin = Math.floor(startDate / DAY_MS) * DAY_MS + DAY_MS;
	const lastBin = Math.ceil(endDate / DAY_MS) * DAY_MS;
	const totalSpan = lastBin - firstBin + DAY_MS;

	for (let bin = firstBin; bin <= lastBin; bin += DAY_MS) {
		const elapsed = bin - firstBin + DAY_MS;
		const ideal =
			totalSpan > 0
				? Math.max(0, totalIssues - (totalIssues * elapsed) / totalSpan)
				: 0;
		const isFuture = bin > now;
		const remaining = isFuture
			? null
			: totalIssues - sorted.filter((ts) => ts <= bin).length;
		points.push({
			day: bin,
			remaining,
			ideal: Math.round(ideal * 100) / 100,
		});
	}
	return points;
}

/**
 * Pure: given a sprint's current state, derive the status the scheduling
 * cron should set. Returns `null` when no transition should happen (either
 * the user overrode the status, the sprint is in a terminal state, dates
 * are missing, or the date boundary hasn't been crossed yet). Exported so
 * unit tests can exercise every branch without spinning up Convex.
 */
export function deriveScheduledSprintStatus(
	sprint: {
		status: string;
		statusOverride?: boolean;
		startDate?: number;
		endDate?: number;
		targetDate?: number;
	},
	now: number,
): "active" | "completed" | null {
	if (sprint.statusOverride) return null;
	// Terminal states never auto-transition — users must reset manually
	// (e.g. un-cancel by re-setting status in the UI).
	if (sprint.status === "completed" || sprint.status === "cancelled") {
		return null;
	}
	const endBoundary = sprint.endDate ?? sprint.targetDate;
	if (endBoundary !== undefined && now >= endBoundary) return "completed";
	if (
		sprint.status === "planned" &&
		sprint.startDate !== undefined &&
		now >= sprint.startDate
	) {
		return "active";
	}
	return null;
}

function isCompletedStatus(status: string): boolean {
	return status === "done" || status === "cancelled";
}

async function computeProgress(ctx: QueryCtx, sprintId: Id<"sprints">) {
	const issues = await ctx.db
		.query("issues")
		.withIndex("by_sprint", (q) => q.eq("sprintId", sprintId))
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

const sprintStatusValidator = v.union(
	v.literal("planned"),
	v.literal("active"),
	v.literal("completed"),
	v.literal("cancelled"),
);

const sprintWithProgressValidator = v.object({
	_id: v.id("sprints"),
	_creationTime: v.number(),
	projectId: v.id("projects"),
	folderId: v.optional(v.id("sprintFolders")),
	name: v.string(),
	description: v.optional(v.string()),
	status: v.string(),
	icon: v.optional(v.string()),
	startDate: v.optional(v.number()),
	targetDate: v.optional(v.number()),
	endDate: v.optional(v.number()),
	sortOrder: v.number(),
	goals: v.optional(v.array(v.string())),
	createdBy: v.id("users"),
	updatedAt: v.optional(v.number()),
	deletedAt: v.optional(v.number()),
	issueCount: v.number(),
	completedCount: v.number(),
	progressPercentage: v.number(),
});

const sprintWithProgressAndProjectValidator = v.object({
	_id: v.id("sprints"),
	_creationTime: v.number(),
	projectId: v.id("projects"),
	folderId: v.optional(v.id("sprintFolders")),
	name: v.string(),
	description: v.optional(v.string()),
	status: v.string(),
	icon: v.optional(v.string()),
	startDate: v.optional(v.number()),
	targetDate: v.optional(v.number()),
	endDate: v.optional(v.number()),
	sortOrder: v.number(),
	goals: v.optional(v.array(v.string())),
	createdBy: v.id("users"),
	updatedAt: v.optional(v.number()),
	deletedAt: v.optional(v.number()),
	issueCount: v.number(),
	completedCount: v.number(),
	progressPercentage: v.number(),
	projectName: v.string(),
});

export const listByProject = query({
	args: {
		projectId: v.id("projects"),
	},
	returns: v.array(sprintWithProgressValidator),
	handler: async (ctx, args) => {
		const project = await ctx.db.get(args.projectId);
		if (!project || project.deletedAt) return [];
		const { userId, member } = await requireWorkspaceMember(
			ctx,
			project.workspaceId,
		);
		if (member.role !== "admin") {
			const hasAccess = await canAccessProject(
				ctx,
				args.projectId,
				userId,
				member.role as "admin" | "member",
			);
			if (!hasAccess) return [];
		}

		const sprints = await ctx.db
			.query("sprints")
			.withIndex("by_project_sort", (q) => q.eq("projectId", args.projectId))
			.collect();
		const activeSprints = sprints.filter((s) => !s.deletedAt);

		return Promise.all(
			activeSprints.map(async (sprint) => {
				const progress = await computeProgress(ctx, sprint._id);
				return {
					...sprint,
					...progress,
				};
			}),
		);
	},
});

export const listByWorkspace = query({
	args: {
		workspaceId: v.id("workspaces"),
	},
	returns: v.array(sprintWithProgressAndProjectValidator),
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

		// Parallel fetch: projects + all workspace issues (for progress computation)
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

		// Group active issues by sprintId for O(1) progress lookups
		const issuesBySprintId = new Map<
			string,
			{ total: number; completed: number }
		>();
		for (const issue of allWorkspaceIssues) {
			if (issue.deletedAt || !issue.sprintId) continue;
			const key = issue.sprintId as string;
			const stats = issuesBySprintId.get(key) ?? { total: 0, completed: 0 };
			stats.total++;
			if (isCompletedStatus(issue.status)) stats.completed++;
			issuesBySprintId.set(key, stats);
		}

		// Fetch sprints for all visible projects in parallel (no per-sprint issue query)
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

export const getById = query({
	args: {
		sprintId: v.id("sprints"),
	},
	returns: v.union(sprintWithProgressAndProjectValidator, v.null()),
	handler: async (ctx, args) => {
		const sprint = await ctx.db.get(args.sprintId);
		if (!sprint || sprint.deletedAt) return null;

		const project = await ctx.db.get(sprint.projectId);
		if (!project || project.deletedAt) return null;
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
			if (!hasAccess) return null;
		}

		const progress = await computeProgress(ctx, sprint._id);
		return {
			...sprint,
			...progress,
			projectName: project.name,
		};
	},
});

export const create = mutation({
	args: {
		projectId: v.id("projects"),
		folderId: v.optional(v.id("sprintFolders")),
		name: v.string(),
		description: v.optional(v.string()),
		status: v.optional(sprintStatusValidator),
		icon: v.optional(v.string()),
		startDate: v.optional(v.number()),
		targetDate: v.optional(v.number()),
		endDate: v.optional(v.number()),
		goals: v.optional(v.array(v.string())),
	},
	returns: v.id("sprints"),
	handler: async (ctx, args) => {
		const project = await ctx.db.get(args.projectId);
		if (!project || project.deletedAt) {
			throw new ConvexError("Project not found");
		}
		const { userId, member } = await requireWorkspaceMember(
			ctx,
			project.workspaceId,
		);
		if (member.role !== "admin") {
			const hasAccess = await canAccessProject(
				ctx,
				args.projectId,
				userId,
				member.role as "admin" | "member",
			);
			if (!hasAccess) {
				throw new ConvexError("You don't have access to this project");
			}
		}

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
			folderId: args.folderId,
			name: args.name,
			description: args.description,
			status: args.status ?? "active",
			icon: args.icon,
			startDate: args.startDate,
			targetDate: args.targetDate,
			endDate: args.endDate ?? args.targetDate,
			sortOrder,
			goals: args.goals,
			createdBy: userId,
		});

		await ctx.db.insert("activityLogs", {
			workspaceId: project.workspaceId,
			projectId: args.projectId,
			actorId: userId,
			action: "created",
			entityType: "sprint",
			entityId: sprintId,
			description: `created sprint "${args.name}"`,
		});

		return sprintId;
	},
});

export const update = mutation({
	args: {
		sprintId: v.id("sprints"),
		name: v.optional(v.string()),
		description: v.optional(v.string()),
		status: v.optional(sprintStatusValidator),
		icon: v.optional(v.string()),
		startDate: v.optional(v.number()),
		targetDate: v.optional(v.number()),
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
			if (!hasAccess) {
				throw new ConvexError("You don't have access to this project");
			}
		}

		const oldStatus = sprint.status;
		const { sprintId, ...updates } = args;
		const patch: Record<string, unknown> = {
			...updates,
			updatedAt: Date.now(),
		};
		if (args.targetDate !== undefined && args.endDate === undefined) {
			patch.endDate = args.targetDate;
		}
		// User manually picked a status → lock it. The scheduling cron
		// checks `statusOverride` before flipping planned → active →
		// completed based on dates, so manual intent (e.g. ending a sprint
		// early or cancelling) won't be clobbered.
		if (args.status !== undefined && args.status !== oldStatus) {
			patch.statusOverride = true;
		}

		await ctx.db.patch(sprintId, patch);

		if (args.status && args.status !== oldStatus) {
			await ctx.db.insert("activityLogs", {
				workspaceId: project.workspaceId,
				projectId: sprint.projectId,
				actorId: userId,
				action: "status_changed",
				entityType: "sprint",
				entityId: sprintId,
				description: `changed sprint "${sprint.name}" status from ${oldStatus} to ${args.status}`,
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
			if (!hasAccess) {
				throw new ConvexError("You don't have access to this project");
			}
		}

		await ctx.db.patch(args.sprintId, {
			deletedAt: Date.now(),
		});

		const issues = await ctx.db
			.query("issues")
			.withIndex("by_sprint", (q) => q.eq("sprintId", args.sprintId))
			.collect();
		for (const issue of issues) {
			if (!issue.deletedAt) {
				await ctx.db.patch(issue._id, {
					sprintId: undefined,
					updatedAt: Date.now(),
				});
			}
		}

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

export const complete = mutation({
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
			if (!hasAccess) {
				throw new ConvexError("You don't have access to this project");
			}
		}

		await ctx.db.patch(args.sprintId, {
			status: "completed",
			updatedAt: Date.now(),
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
			if (!hasAccess) {
				throw new ConvexError("You don't have access to this project");
			}
		}

		await ctx.db.patch(args.sprintId, {
			sortOrder: args.newSortOrder,
		});
	},
});

/**
 * Scheduled: flip planned → active → completed based on startDate / endDate.
 * Skips sprints where a user has manually picked a status (`statusOverride`)
 * so manual intent wins. Called by the hourly cron in `convex/crons.ts`.
 *
 * Status writes done via internal patch (not `update` mutation) so we don't
 * set `statusOverride` or require a user context — this is system-driven.
 */
export const autoUpdateStatus = internalMutation({
	args: {},
	returns: v.null(),
	handler: async (ctx) => {
		const now = Date.now();
		// Scan only non-terminal sprints to avoid work on completed/cancelled.
		const sprints = await ctx.db.query("sprints").collect();
		for (const sprint of sprints) {
			if (sprint.deletedAt) continue;
			const next = deriveScheduledSprintStatus(sprint, now);
			if (next === null || next === sprint.status) continue;
			await ctx.db.patch(sprint._id, {
				status: next,
				updatedAt: now,
			});
			await ctx.db.insert("activityLogs", {
				workspaceId:
					(await ctx.db.get(sprint.projectId))?.workspaceId ??
					(() => {
						throw new ConvexError("Sprint project missing for activity log");
					})(),
				projectId: sprint.projectId,
				actorId: sprint.createdBy,
				action: "status_changed",
				entityType: "sprint",
				entityId: sprint._id,
				description: `sprint "${sprint.name}" auto-transitioned from ${sprint.status} to ${next}`,
				field: "status",
				oldValue: sprint.status,
				newValue: next,
			});
		}
	},
});

// ── Reporting queries ──────────────────────────────────────────────────────

/**
 * Burndown data for a sprint — one point per day in the sprint window
 * with `remaining` (issue count still open at end-of-day) and `ideal`
 * (linear descent to zero). See `buildBurndownSeries` for the math.
 */
export const burndownData = query({
	args: { sprintId: v.id("sprints") },
	returns: v.object({
		sprintName: v.string(),
		startDate: v.optional(v.number()),
		endDate: v.optional(v.number()),
		totalIssues: v.number(),
		completedIssues: v.number(),
		openIssues: v.number(),
		points: v.array(
			v.object({
				day: v.number(),
				remaining: v.union(v.number(), v.null()),
				ideal: v.number(),
			}),
		),
		statusBreakdown: v.array(
			v.object({ status: v.string(), count: v.number() }),
		),
		priorityBreakdown: v.array(
			v.object({ priority: v.string(), count: v.number() }),
		),
		typeBreakdown: v.array(v.object({ type: v.string(), count: v.number() })),
		assigneeWorkload: v.array(
			v.object({
				assigneeId: v.optional(v.id("users")),
				name: v.string(),
				image: v.optional(v.string()),
				open: v.number(),
				completed: v.number(),
			}),
		),
	}),
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

		const issues = await ctx.db
			.query("issues")
			.withIndex("by_sprint", (q) => q.eq("sprintId", args.sprintId))
			.collect();
		const live = issues.filter((i) => !i.deletedAt);
		const totalIssues = live.length;
		const completedIssues = live.filter((i) =>
			isCompletedStatus(i.status),
		).length;
		const openIssues = totalIssues - completedIssues;

		const endBoundary = sprint.endDate ?? sprint.targetDate;
		const points =
			sprint.startDate !== undefined && endBoundary !== undefined
				? buildBurndownSeries({
						startDate: sprint.startDate,
						endDate: endBoundary,
						totalIssues,
						completedTimestamps: live
							.map((i) => i.completedAt)
							.filter((t): t is number => typeof t === "number"),
					})
				: [];

		// Breakdown aggregations — O(n) over the already-fetched issues,
		// so these piggyback on the burndown query with zero extra I/O.
		const statusCounts = new Map<string, number>();
		const priorityCounts = new Map<string, number>();
		const typeCounts = new Map<string, number>();
		type WorkloadRow = {
			assigneeId?: Id<"users">;
			open: number;
			completed: number;
		};
		const workload = new Map<string, WorkloadRow>();
		for (const issue of live) {
			statusCounts.set(issue.status, (statusCounts.get(issue.status) ?? 0) + 1);
			priorityCounts.set(
				issue.priority,
				(priorityCounts.get(issue.priority) ?? 0) + 1,
			);
			if (issue.type)
				typeCounts.set(issue.type, (typeCounts.get(issue.type) ?? 0) + 1);

			const assigneeIds =
				issue.assigneeIds && issue.assigneeIds.length > 0
					? issue.assigneeIds
					: issue.assigneeId
						? [issue.assigneeId]
						: [];
			const isDone = isCompletedStatus(issue.status);
			if (assigneeIds.length === 0) {
				const key = "__unassigned__";
				const row = workload.get(key) ?? { open: 0, completed: 0 };
				if (isDone) row.completed += 1;
				else row.open += 1;
				workload.set(key, row);
			} else {
				for (const id of assigneeIds) {
					const key = String(id);
					const row = workload.get(key) ?? {
						assigneeId: id,
						open: 0,
						completed: 0,
					};
					if (isDone) row.completed += 1;
					else row.open += 1;
					workload.set(key, row);
				}
			}
		}

		// Resolve member names for the workload chart. One db.get per
		// distinct assignee — bounded by team size, not issue count.
		const assigneeWorkload = await Promise.all(
			[...workload.entries()].map(async ([key, row]) => {
				if (key === "__unassigned__") {
					return {
						name: "Unassigned",
						open: row.open,
						completed: row.completed,
					};
				}
				if (!row.assigneeId)
					return { name: "Unknown", open: row.open, completed: row.completed };
				const user = await ctx.db.get(row.assigneeId);
				return {
					assigneeId: row.assigneeId,
					name: user?.name ?? user?.email ?? "Unknown",
					image: user?.image ?? undefined,
					open: row.open,
					completed: row.completed,
				};
			}),
		);
		// Most-open-work first; ties broken by more completed.
		assigneeWorkload.sort(
			(a, b) => b.open - a.open || b.completed - a.completed,
		);

		return {
			sprintName: sprint.name,
			startDate: sprint.startDate,
			endDate: endBoundary,
			totalIssues,
			completedIssues,
			openIssues,
			points,
			statusBreakdown: [...statusCounts.entries()].map(([status, count]) => ({
				status,
				count,
			})),
			priorityBreakdown: [...priorityCounts.entries()].map(
				([priority, count]) => ({ priority, count }),
			),
			typeBreakdown: [...typeCounts.entries()].map(([type, count]) => ({
				type,
				count,
			})),
			assigneeWorkload,
		};
	},
});

/**
 * Velocity across recent sprints in a project — for each of the last
 * `limit` sprints (ordered by end/target date desc) returns the completed
 * issue count so the UI can draw a bar chart.
 */
export const velocityByProject = query({
	args: {
		projectId: v.id("projects"),
		limit: v.optional(v.number()),
	},
	returns: v.array(
		v.object({
			sprintId: v.id("sprints"),
			name: v.string(),
			status: v.string(),
			endDate: v.optional(v.number()),
			completedCount: v.number(),
			totalCount: v.number(),
		}),
	),
	handler: async (ctx, args) => {
		const project = await ctx.db.get(args.projectId);
		if (!project || project.deletedAt) return [];
		await requireWorkspaceMember(ctx, project.workspaceId);

		const all = await ctx.db
			.query("sprints")
			.withIndex("by_project", (q) => q.eq("projectId", args.projectId))
			.collect();
		const live = all.filter((s) => !s.deletedAt);
		// Order by sprint close date descending; fall back to creation
		// time for sprints that never had a schedule.
		const ordered = [...live].sort((a, b) => {
			const aKey = a.endDate ?? a.targetDate ?? a._creationTime;
			const bKey = b.endDate ?? b.targetDate ?? b._creationTime;
			return bKey - aKey;
		});
		const limit = args.limit ?? 6;
		const picked = ordered.slice(0, limit);

		return Promise.all(
			picked.map(async (sprint) => {
				const issues = await ctx.db
					.query("issues")
					.withIndex("by_sprint", (q) => q.eq("sprintId", sprint._id))
					.collect();
				const live = issues.filter((i) => !i.deletedAt);
				return {
					sprintId: sprint._id,
					name: sprint.name,
					status: sprint.status,
					endDate: sprint.endDate ?? sprint.targetDate,
					completedCount: live.filter((i) => isCompletedStatus(i.status))
						.length,
					totalCount: live.length,
				};
			}),
		).then((rows) => rows.reverse()); // chronological for the chart
	},
});
