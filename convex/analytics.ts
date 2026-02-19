import { v } from "convex/values";
import { query } from "./_generated/server";
import {
	canAccessProject,
	getAccessibleProjectIds,
	requireWorkspaceMember,
} from "./lib/auth";

// ── Helpers ─────────────────────────────────────────────────────────────────

const MS_DAY = 1000 * 60 * 60 * 24;

const MONTHS = [
	"Jan",
	"Feb",
	"Mar",
	"Apr",
	"May",
	"Jun",
	"Jul",
	"Aug",
	"Sep",
	"Oct",
	"Nov",
	"Dec",
];

function formatShortDate(ms: number): string {
	const d = new Date(ms);
	return `${MONTHS[d.getMonth()]} ${d.getDate()}`;
}

function formatFullDate(ms: number): string {
	const d = new Date(ms);
	return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

function clamp(val: number, min: number, max: number) {
	return Math.min(max, Math.max(min, val));
}

/** Map story type to analytics display category (bug | improvement | task) */
function mapStoryType(type: string): "bug" | "improvement" | "task" {
	if (type === "bug") return "bug";
	if (type === "improvement") return "improvement";
	return "task"; // story, feature → "task"
}

/**
 * Compute health indicator for a project.
 * Heuristic: completion% >= elapsed% * 0.75 → on-track,
 *            >= elapsed% * 0.5 → at-risk, else behind.
 */
function computeHealth(
	status: string,
	progress: number,
	scheduleProgress: number,
): { label: string; tone: string } {
	if (status === "completed") return { label: "Completed", tone: "positive" };
	if (status === "cancelled") return { label: "Cancelled", tone: "muted" };

	if (scheduleProgress === 0 || progress >= scheduleProgress * 0.75) {
		const variance = progress - scheduleProgress;
		if (variance >= 8) return { label: "Ahead", tone: "positive" };
		return { label: "On track", tone: "neutral" };
	}
	if (progress >= scheduleProgress * 0.5) {
		return { label: "At risk", tone: "warning" };
	}
	return { label: "Behind", tone: "danger" };
}

// ── Queries ─────────────────────────────────────────────────────────────────

/**
 * Comprehensive workspace analytics: KPIs, chart series, work mix, risk data.
 * Aggregates stories (the main work items) across all projects.
 */
export const workspaceOverview = query({
	args: {
		workspaceId: v.id("workspaces"),
		rangeStartMs: v.number(),
		rangeEndMs: v.number(),
		projectId: v.optional(v.id("projects")),
		memberId: v.optional(v.id("users")),
	},
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

		const { rangeStartMs, rangeEndMs, projectId, memberId } = args;

		// ── Fetch data ──────────────────────────────────────────────────────
		const allProjects = await ctx.db
			.query("projects")
			.withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
			.collect();
		let projects = allProjects.filter((p) => !p.deletedAt);

		// RBAC: filter projects for member users
		if (accessibleProjectIds !== null) {
			projects = projects.filter((p) => accessibleProjectIds.has(p._id));
		}

		const filteredProjects = projectId
			? projects.filter((p) => p._id === projectId)
			: projects;

		const allStories = await ctx.db
			.query("stories")
			.withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
			.collect();
		let stories = allStories.filter((s) => !s.deletedAt);

		// RBAC: filter stories to accessible projects
		if (accessibleProjectIds !== null) {
			stories = stories.filter(
				(s) => !s.projectId || accessibleProjectIds.has(s.projectId),
			);
		}

		if (projectId) {
			stories = stories.filter((s) => s.projectId === projectId);
		}
		if (memberId) {
			stories = stories.filter((s) => s.assigneeId === memberId);
		}

		// ── Group stories by project ────────────────────────────────────────
		const storiesByProject = new Map<string, typeof stories>();
		for (const story of stories) {
			if (!story.projectId) continue;
			const key = story.projectId;
			if (!storiesByProject.has(key)) storiesByProject.set(key, []);
			storiesByProject.get(key)?.push(story);
		}

		// ── Per-project health rows ─────────────────────────────────────────
		const healthRows = filteredProjects.map((project) => {
			const projectStories = storiesByProject.get(project._id) ?? [];
			const totalStories = projectStories.length;
			const doneStories = projectStories.filter(
				(s) => s.status === "done",
			).length;
			const progress =
				totalStories > 0 ? Math.round((doneStories / totalStories) * 100) : 0;

			const startMs = project.startDate ?? project._creationTime;
			const endMs = project.endDate ?? startMs + 90 * MS_DAY;
			const duration = endMs - startMs;
			const elapsed = rangeEndMs - startMs;
			const scheduleProgress =
				duration > 0
					? clamp(Math.round((elapsed / duration) * 100), 0, 100)
					: 0;

			const variance = progress - scheduleProgress;
			const daysToDue = Math.round((endMs - rangeEndMs) / MS_DAY);
			const health = computeHealth(project.status, progress, scheduleProgress);

			return {
				id: project._id as string,
				name: project.name,
				status: project.status,
				progress,
				schedule: scheduleProgress,
				variance: Math.round(variance),
				daysToDue,
				endDate: endMs,
				storyCount: totalStories,
				health,
			};
		});

		// ── KPIs ────────────────────────────────────────────────────────────
		const activeRows = healthRows.filter(
			(r) => r.status === "active" || r.status === "planned",
		);
		const onTrackRows = activeRows.filter(
			(r) => r.health.label === "On track" || r.health.label === "Ahead",
		);
		const onTrackRate = activeRows.length
			? Math.round((onTrackRows.length / activeRows.length) * 100)
			: 0;

		const overdueStories = stories.filter(
			(s) =>
				s.status !== "done" &&
				s.status !== "cancelled" &&
				s.dueDate != null &&
				s.dueDate < rangeEndMs,
		);

		const completedInRange = stories.filter(
			(s) =>
				s.completedAt != null &&
				s.completedAt >= rangeStartMs &&
				s.completedAt <= rangeEndMs,
		);

		const allRiskRows = healthRows.filter(
			(r) => r.health.label === "Behind" || r.health.label === "At risk",
		);
		const riskProjects = [...allRiskRows]
			.sort((a, b) => a.variance - b.variance)
			.slice(0, 4);

		// ── Additional KPIs (per story spec) ────────────────────────────────
		const totalProjects = filteredProjects.length;
		const activeProjects = filteredProjects.filter(
			(p) => p.status === "active",
		).length;
		const totalStories = stories.length;
		const completedStories = stories.filter((s) => s.status === "done").length;
		const completionRate =
			totalStories > 0
				? Math.round((completedStories / totalStories) * 1000) / 10
				: 0;

		// Average completion time (hours) for stories completed in range
		let avgCompletionTimeHours = 0;
		if (completedInRange.length > 0) {
			const totalMs = completedInRange.reduce((sum, s) => {
				const created = s._creationTime;
				const completed = s.completedAt ?? s._creationTime;
				return sum + (completed - created);
			}, 0);
			avgCompletionTimeHours =
				Math.round(
					(totalMs / completedInRange.length / (1000 * 60 * 60)) * 10,
				) / 10;
		}

		// On-time delivery rate
		const completedWithDueDate = completedInRange.filter(
			(s) => s.dueDate != null,
		);
		const completedOnTime = completedWithDueDate.filter(
			(s) => (s.completedAt ?? 0) <= (s.dueDate ?? 0),
		);
		const onTimeDeliveryRate =
			completedWithDueDate.length > 0
				? Math.round(
						(completedOnTime.length / completedWithDueDate.length) * 1000,
					) / 10
				: -1; // -1 indicates N/A

		// ── Work mix ────────────────────────────────────────────────────────
		const storiesInRange = stories.filter(
			(s) =>
				s._creationTime <= rangeEndMs &&
				(!s.completedAt || s.completedAt >= rangeStartMs),
		);

		const workMix = { bug: 0, improvement: 0, task: 0 };
		for (const s of storiesInRange) {
			workMix[mapStoryType(s.type)]++;
		}

		// ── Bug summary ─────────────────────────────────────────────────────
		const completedBugsInRange = completedInRange.filter(
			(s) => s.type === "bug",
		);
		const openBugs = storiesInRange.filter(
			(s) => s.type === "bug" && s.status !== "done",
		);
		const bugTotal = completedBugsInRange.length + openBugs.length;

		// ── Time series bucketing ───────────────────────────────────────────
		const totalDays = Math.max(
			1,
			Math.round((rangeEndMs - rangeStartMs) / MS_DAY) + 1,
		);
		const bucketCount = Math.min(6, totalDays);
		const baseBucketSize = Math.floor(totalDays / bucketCount);
		const bRemainder = totalDays % bucketCount;

		let bucketOffset = 0;
		const buckets = Array.from({ length: bucketCount }, (_, i) => {
			const size = baseBucketSize + (i < bRemainder ? 1 : 0);
			const bStartMs = rangeStartMs + bucketOffset * MS_DAY;
			const bEndMs = rangeStartMs + (bucketOffset + size - 1) * MS_DAY;
			bucketOffset += size;
			return {
				startMs: bStartMs,
				endMs: bEndMs,
				label: `${formatShortDate(bStartMs)} - ${formatShortDate(bEndMs)}`,
				count: 0,
				bugCount: 0,
				mixBug: 0,
				mixImprovement: 0,
				mixTask: 0,
				mixTotal: 0,
			};
		});

		const bucketEndDays = buckets.map((b) =>
			Math.round((b.endMs - rangeStartMs) / MS_DAY),
		);

		for (const story of completedInRange) {
			const completedAt = story.completedAt ?? rangeStartMs;
			const dayOffset = Math.round((completedAt - rangeStartMs) / MS_DAY);
			if (dayOffset < 0 || dayOffset >= totalDays) continue;
			const idx = bucketEndDays.findIndex((end) => dayOffset <= end);
			const bi = idx === -1 ? bucketCount - 1 : idx;

			buckets[bi].count++;
			buckets[bi].mixTotal++;

			const cat = mapStoryType(story.type);
			if (cat === "bug") {
				buckets[bi].bugCount++;
				buckets[bi].mixBug++;
			} else if (cat === "improvement") {
				buckets[bi].mixImprovement++;
			} else {
				buckets[bi].mixTask++;
			}
		}

		const maxThroughput = Math.max(...buckets.map((b) => b.count), 1);
		const maxBugCount = Math.max(...buckets.map((b) => b.bugCount), 1);
		const maxMixTotal = Math.max(...buckets.map((b) => b.mixTotal), 1);

		const throughputSeries = buckets.map((b) => ({
			label: b.label,
			count: b.count,
			height: Math.round((b.count / maxThroughput) * 100),
		}));

		const bugSeries = buckets.map((b) => ({
			label: b.label,
			count: b.bugCount,
			height: Math.round((b.bugCount / maxBugCount) * 100),
		}));

		const mixTrendSeries = buckets.map((b) => ({
			label: b.label,
			total: b.mixTotal,
			bug: b.mixBug,
			improvement: b.mixImprovement,
			task: b.mixTask,
			height: Math.round((b.mixTotal / maxMixTotal) * 100),
		}));

		return {
			// KPI raw values
			onTrackCount: onTrackRows.length,
			activeProjectCount: activeRows.length,
			onTrackRate,
			overdueCount: overdueStories.length,
			completedInRangeCount: completedInRange.length,
			riskProjectCount: allRiskRows.length,

			// Additional KPIs per story spec
			totalProjects,
			activeProjects,
			totalStories,
			completedStories,
			completionRate,
			avgCompletionTimeHours,
			onTimeDeliveryRate,

			// Health rows (for project health table)
			healthRows,

			// Work mix
			workMix,
			workMixTotal: storiesInRange.length,

			// Bug summary
			bugSummary: {
				open: openBugs.length,
				completed: completedBugsInRange.length,
				clearanceRate: bugTotal
					? Math.round((completedBugsInRange.length / bugTotal) * 100)
					: 0,
			},

			// Time series
			throughputSeries,
			bugSeries,
			mixTrendSeries,
			mixTrendTotal: buckets.reduce((acc, b) => acc + b.mixTotal, 0),

			// Risk projects (top 4)
			riskProjects,

			// Meta
			rangeLabel: `${formatShortDate(rangeStartMs)} - ${formatFullDate(rangeEndMs)}`,
			filteredProjectCount: filteredProjects.length,
		};
	},
});

/**
 * Project-specific dashboard analytics.
 * Returns issue counts by status, by assignee, and completion metrics.
 */
export const projectDashboard = query({
	args: {
		projectId: v.id("projects"),
	},
	handler: async (ctx, args) => {
		const project = await ctx.db.get(args.projectId);
		if (!project || project.deletedAt) return null;
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
			if (!hasAccess) return null;
		}

		const allIssues = await ctx.db
			.query("issues")
			.withIndex("by_project", (q) => q.eq("projectId", args.projectId))
			.collect();

		const issues = allIssues.filter((i) => !i.deletedAt && !i.parentId);

		const total = issues.length;
		const done = issues.filter(
			(i) => i.status === "done" || i.status === "cancelled",
		).length;
		const completionPercent = total > 0 ? Math.round((done / total) * 100) : 0;

		// Status breakdown
		const statusCounts: Record<string, number> = {};
		for (const issue of issues) {
			statusCounts[issue.status] = (statusCounts[issue.status] ?? 0) + 1;
		}

		const statusBreakdown = Object.entries(statusCounts).map(
			([status, count]) => ({
				status,
				count,
				percent: total > 0 ? Math.round((count / total) * 100) : 0,
			}),
		);

		// Assignee breakdown
		const assigneeMap = new Map<
			string,
			{ total: number; completed: number; userId: string }
		>();
		for (const issue of issues) {
			const key = issue.assigneeId ?? "__unassigned__";
			const entry = assigneeMap.get(key) ?? {
				total: 0,
				completed: 0,
				userId: key,
			};
			entry.total++;
			if (issue.status === "done" || issue.status === "cancelled") {
				entry.completed++;
			}
			assigneeMap.set(key, entry);
		}

		// Resolve user names
		const assigneeBreakdown = await Promise.all(
			Array.from(assigneeMap.values()).map(async (entry) => {
				let name = "Unassigned";
				let image: string | undefined;
				if (entry.userId !== "__unassigned__") {
					const user = await ctx.db.get(
						entry.userId as typeof project.createdBy,
					);
					if (user) {
						name = user.name ?? user.email ?? "Unknown";
						image = user.image;
					}
				}
				const completionRate =
					entry.total > 0
						? Math.round((entry.completed / entry.total) * 100)
						: 0;
				return {
					userId: entry.userId,
					name,
					image,
					total: entry.total,
					completed: entry.completed,
					completionRate,
				};
			}),
		);

		// Sort by total descending
		assigneeBreakdown.sort((a, b) => b.total - a.total);

		return {
			total,
			done,
			completionPercent,
			statusBreakdown,
			assigneeBreakdown,
		};
	},
});

/**
 * Standalone project health query.
 * Returns per-project progress, schedule, and health indicators.
 */
export const projectHealth = query({
	args: {
		workspaceId: v.id("workspaces"),
		rangeEndMs: v.number(),
	},
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

		const { rangeEndMs } = args;

		const allProjects = await ctx.db
			.query("projects")
			.withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
			.collect();
		let projects = allProjects.filter((p) => !p.deletedAt);

		// RBAC: filter projects for member users
		if (accessibleProjectIds !== null) {
			projects = projects.filter((p) => accessibleProjectIds.has(p._id));
		}

		const allStories = await ctx.db
			.query("stories")
			.withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
			.collect();
		let stories = allStories.filter((s) => !s.deletedAt);

		// RBAC: filter stories to accessible projects
		if (accessibleProjectIds !== null) {
			stories = stories.filter(
				(s) => !s.projectId || accessibleProjectIds.has(s.projectId),
			);
		}

		const storiesByProject = new Map<string, typeof stories>();
		for (const story of stories) {
			if (!story.projectId) continue;
			const key = story.projectId;
			if (!storiesByProject.has(key)) storiesByProject.set(key, []);
			storiesByProject.get(key)?.push(story);
		}

		return projects.map((project) => {
			const projectStories = storiesByProject.get(project._id) ?? [];
			const totalStories = projectStories.length;
			const doneStories = projectStories.filter(
				(s) => s.status === "done",
			).length;
			const progress =
				totalStories > 0 ? Math.round((doneStories / totalStories) * 100) : 0;

			const startMs = project.startDate ?? project._creationTime;
			const endMs = project.endDate ?? startMs + 90 * MS_DAY;
			const duration = endMs - startMs;
			const elapsed = rangeEndMs - startMs;
			const scheduleProgress =
				duration > 0
					? clamp(Math.round((elapsed / duration) * 100), 0, 100)
					: 0;

			const variance = progress - scheduleProgress;
			const daysToDue = Math.round((endMs - rangeEndMs) / MS_DAY);
			const health = computeHealth(project.status, progress, scheduleProgress);

			return {
				id: project._id as string,
				name: project.name,
				status: project.status,
				progress,
				schedule: scheduleProgress,
				variance: Math.round(variance),
				daysToDue,
				endDate: endMs,
				storyCount: totalStories,
				health,
			};
		});
	},
});
