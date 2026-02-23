import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { query } from "./_generated/server";
import {
	clamp,
	computeHealth,
	isClosedStatus,
	isDoneStatus,
	isWipStatus,
	MS_DAY,
	mapIssueTypeToWorkCategory,
	median,
	roundToOneDecimal,
} from "./lib/analyticsMetrics";
import {
	canAccessProject,
	getAccessibleProjectIds,
	requireWorkspaceMember,
} from "./lib/auth";

// ── Helpers ─────────────────────────────────────────────────────────────────

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

function buildBuckets(rangeStartMs: number, rangeEndMs: number) {
	const totalDays = Math.max(
		1,
		Math.round((rangeEndMs - rangeStartMs) / MS_DAY) + 1,
	);
	const bucketCount = Math.min(6, totalDays);
	const baseBucketSize = Math.floor(totalDays / bucketCount);
	const remainder = totalDays % bucketCount;

	let offset = 0;
	return Array.from({ length: bucketCount }, (_, i) => {
		const size = baseBucketSize + (i < remainder ? 1 : 0);
		const startMs = rangeStartMs + offset * MS_DAY;
		const endMs = rangeStartMs + (offset + size - 1) * MS_DAY;
		offset += size;
		return {
			startMs,
			endMs,
			label: `${formatShortDate(startMs)} - ${formatShortDate(endMs)}`,
			doneCount: 0,
			createdCount: 0,
			cancelledCount: 0,
		};
	});
}

function findBucketIndex(
	buckets: Array<{ startMs: number; endMs: number }>,
	ts: number,
) {
	for (let i = 0; i < buckets.length; i++) {
		if (ts >= buckets[i].startMs && ts <= buckets[i].endMs) return i;
	}
	return -1;
}

async function getBlockedOpenIssueCount(
	ctx: QueryCtx,
	openIssues: Doc<"issues">[],
): Promise<number> {
	const blockedFlags = await Promise.all(
		openIssues.map(async (issue) => {
			const blockedBySample = await ctx.db
				.query("issueRelations")
				.withIndex("by_issue_type", (q) =>
					q.eq("issueId", issue._id).eq("type", "blocked_by"),
				)
				.take(1);
			return blockedBySample.length > 0;
		}),
	);
	return blockedFlags.filter(Boolean).length;
}

function buildHealthRows(
	projects: Doc<"projects">[],
	issuesByProject: Map<string, Doc<"issues">[]>,
	rangeEndMs: number,
) {
	return projects.map((project) => {
		const projectIssues = issuesByProject.get(project._id as string) ?? [];
		const totalIssues = projectIssues.length;
		const doneIssues = projectIssues.filter((issue) =>
			isDoneStatus(issue.status),
		).length;
		const progress =
			totalIssues > 0 ? Math.round((doneIssues / totalIssues) * 100) : 0;

		const startMs = project.startDate ?? project._creationTime;
		const endMs = project.endDate ?? startMs + 90 * MS_DAY;
		const duration = endMs - startMs;
		const elapsed = rangeEndMs - startMs;
		const scheduleProgress =
			duration > 0 ? clamp(Math.round((elapsed / duration) * 100), 0, 100) : 0;

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
			issueCount: totalIssues,
			health,
		};
	});
}

// ── Queries ─────────────────────────────────────────────────────────────────

/**
 * Workspace analytics based on issues + sub-issues.
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

		// ── Fetch projects ───────────────────────────────────────────────────
		const allProjects = await ctx.db
			.query("projects")
			.withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
			.collect();
		let projects = allProjects.filter((project) => !project.deletedAt);

		if (accessibleProjectIds !== null) {
			projects = projects.filter((project) =>
				accessibleProjectIds.has(project._id),
			);
		}

		const selectedProjects = projectId
			? projects.filter((project) => project._id === projectId)
			: projects;

		// ── Fetch issues (includes sub-issues) ──────────────────────────────
		const allIssues = await ctx.db
			.query("issues")
			.withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
			.collect();
		let issues = allIssues.filter((issue) => !issue.deletedAt);

		if (accessibleProjectIds !== null) {
			issues = issues.filter(
				(issue) =>
					!issue.projectId || accessibleProjectIds.has(issue.projectId),
			);
		}

		if (projectId) {
			issues = issues.filter((issue) => issue.projectId === projectId);
		}

		if (memberId) {
			issues = issues.filter((issue) => issue.assigneeId === memberId);
		}

		const issuesByProject = new Map<string, Doc<"issues">[]>();
		for (const issue of issues) {
			if (!issue.projectId) continue;
			const key = issue.projectId as string;
			if (!issuesByProject.has(key)) issuesByProject.set(key, []);
			issuesByProject.get(key)?.push(issue);
		}

		const scopedProjects = memberId
			? selectedProjects.filter((project) =>
					issuesByProject.has(project._id as string),
				)
			: selectedProjects;

		const healthRows = buildHealthRows(
			scopedProjects,
			issuesByProject,
			rangeEndMs,
		);

		// ── KPI metrics ──────────────────────────────────────────────────────
		const activeRows = healthRows.filter(
			(row) => row.status === "active" || row.status === "planned",
		);
		const onTrackRows = activeRows.filter(
			(row) => row.health.label === "On track" || row.health.label === "Ahead",
		);
		const onTrackRate = activeRows.length
			? Math.round((onTrackRows.length / activeRows.length) * 100)
			: 0;

		const openIssues = issues.filter((issue) => !isClosedStatus(issue.status));
		const overdueOpenIssues = openIssues.filter(
			(issue) => issue.dueDate != null && issue.dueDate < rangeEndMs,
		);

		const doneInRange = issues.filter(
			(issue) =>
				isDoneStatus(issue.status) &&
				issue.completedAt != null &&
				issue.completedAt >= rangeStartMs &&
				issue.completedAt <= rangeEndMs,
		);

		const closedInRange = issues.filter(
			(issue) =>
				isClosedStatus(issue.status) &&
				issue.completedAt != null &&
				issue.completedAt >= rangeStartMs &&
				issue.completedAt <= rangeEndMs,
		);

		const cancelledInRange = closedInRange.filter(
			(issue) => issue.status === "cancelled",
		);

		const cycleTimeSamples = doneInRange
			.map((issue) => {
				if (!issue.completedAt) return 0;
				const duration = (issue.completedAt - issue._creationTime) / MS_DAY;
				return duration > 0 ? duration : 0;
			})
			.filter((duration) => duration > 0);
		const cycleTimeP50Days = roundToOneDecimal(median(cycleTimeSamples));

		const wipCount = issues.filter((issue) => isWipStatus(issue.status)).length;

		const createdInRange = issues.filter(
			(issue) =>
				issue._creationTime >= rangeStartMs &&
				issue._creationTime <= rangeEndMs,
		);
		const scopeDelta = createdInRange.length - doneInRange.length;

		const cancellationRate =
			closedInRange.length > 0
				? roundToOneDecimal(
						(cancelledInRange.length / closedInRange.length) * 100,
					)
				: 0;

		const blockedOpenCount = await getBlockedOpenIssueCount(ctx, openIssues);

		// ── Work type mix in selected window ────────────────────────────────
		const issuesInRange = issues.filter(
			(issue) =>
				issue._creationTime <= rangeEndMs &&
				(!issue.completedAt || issue.completedAt >= rangeStartMs),
		);

		const workTypeMix = {
			bug: 0,
			improvement: 0,
			feature: 0,
			issue: 0,
		};
		for (const issue of issuesInRange) {
			workTypeMix[mapIssueTypeToWorkCategory(issue.type)]++;
		}

		// ── Time series ─────────────────────────────────────────────────────
		const buckets = buildBuckets(rangeStartMs, rangeEndMs);
		for (const issue of issues) {
			if (
				issue._creationTime >= rangeStartMs &&
				issue._creationTime <= rangeEndMs
			) {
				const idx = findBucketIndex(buckets, issue._creationTime);
				if (idx !== -1) buckets[idx].createdCount++;
			}

			if (
				issue.completedAt != null &&
				issue.completedAt >= rangeStartMs &&
				issue.completedAt <= rangeEndMs
			) {
				const idx = findBucketIndex(buckets, issue.completedAt);
				if (idx !== -1) {
					if (isDoneStatus(issue.status)) buckets[idx].doneCount++;
					if (issue.status === "cancelled") buckets[idx].cancelledCount++;
				}
			}
		}

		const maxThroughput = Math.max(
			...buckets.map((bucket) => bucket.doneCount),
			1,
		);
		const maxScope = Math.max(
			...buckets.map((bucket) =>
				Math.max(bucket.createdCount, bucket.doneCount),
			),
			1,
		);

		const throughputSeries = buckets.map((bucket) => ({
			label: bucket.label,
			count: bucket.doneCount,
			height: Math.round((bucket.doneCount / maxThroughput) * 100),
		}));

		const scopeSeries = buckets.map((bucket) => ({
			label: bucket.label,
			created: bucket.createdCount,
			completed: bucket.doneCount,
			net: bucket.createdCount - bucket.doneCount,
			cancelled: bucket.cancelledCount,
			height: Math.round(
				(Math.max(bucket.createdCount, bucket.doneCount) / maxScope) * 100,
			),
		}));

		// ── Risk projections ────────────────────────────────────────────────
		const atRiskRows = healthRows.filter(
			(row) => row.health.label === "Behind" || row.health.label === "At risk",
		);
		const riskProjects = [...atRiskRows]
			.sort((a, b) => a.variance - b.variance)
			.slice(0, 4);

		return {
			onTrackCount: onTrackRows.length,
			activeProjectCount: activeRows.length,
			onTrackRate,
			overdueOpenCount: overdueOpenIssues.length,
			completedInRangeCount: doneInRange.length,
			riskProjectCount: atRiskRows.length,
			cycleTimeP50Days,
			wipCount,
			blockedOpenCount,
			scopeDelta,
			scopeCreatedInRange: createdInRange.length,
			cancellationRate,
			healthRows,
			workTypeMix,
			workTypeMixTotal: issuesInRange.length,
			throughputSeries,
			scopeSeries,
			riskProjects,
			rangeLabel: `${formatShortDate(rangeStartMs)} - ${formatFullDate(rangeEndMs)}`,
			filteredProjectCount: scopedProjects.length,
			filteredIssueCount: issues.length,
		};
	},
});

/**
 * Project dashboard analytics (includes sub-issues).
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
		const issues = allIssues.filter((issue) => !issue.deletedAt);

		const total = issues.length;
		const done = issues.filter((issue) => isDoneStatus(issue.status)).length;
		const completionPercent = total > 0 ? Math.round((done / total) * 100) : 0;

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
			if (isDoneStatus(issue.status)) {
				entry.completed++;
			}
			assigneeMap.set(key, entry);
		}

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
		assigneeBreakdown.sort((a, b) => b.total - a.total);

		const now = Date.now();
		const rangeStartMs = now - 29 * MS_DAY;

		const openIssues = issues.filter((issue) => !isClosedStatus(issue.status));
		const overdueOpenCount = openIssues.filter(
			(issue) => issue.dueDate != null && issue.dueDate < now,
		).length;

		const doneInRange = issues.filter(
			(issue) =>
				isDoneStatus(issue.status) &&
				issue.completedAt != null &&
				issue.completedAt >= rangeStartMs &&
				issue.completedAt <= now,
		);
		const cycleTimeSamples = doneInRange
			.map((issue) => {
				if (!issue.completedAt) return 0;
				const duration = (issue.completedAt - issue._creationTime) / MS_DAY;
				return duration > 0 ? duration : 0;
			})
			.filter((duration) => duration > 0);
		const cycleTimeP50Days = roundToOneDecimal(median(cycleTimeSamples));

		const createdInRange = issues.filter(
			(issue) =>
				issue._creationTime >= rangeStartMs && issue._creationTime <= now,
		).length;

		const closedInRange = issues.filter(
			(issue) =>
				isClosedStatus(issue.status) &&
				issue.completedAt != null &&
				issue.completedAt >= rangeStartMs &&
				issue.completedAt <= now,
		);
		const cancelledInRange = closedInRange.filter(
			(issue) => issue.status === "cancelled",
		).length;
		const cancellationRate =
			closedInRange.length > 0
				? roundToOneDecimal((cancelledInRange / closedInRange.length) * 100)
				: 0;

		const blockedOpenCount = await getBlockedOpenIssueCount(ctx, openIssues);

		return {
			total,
			done,
			completionPercent,
			statusBreakdown,
			assigneeBreakdown,
			kpis: {
				overdueOpenCount,
				blockedOpenCount,
				cycleTimeP50Days,
				scopeDelta: createdInRange - doneInRange.length,
				cancellationRate,
				rangeLabel: `${formatShortDate(rangeStartMs)} - ${formatFullDate(now)}`,
			},
		};
	},
});

/**
 * Standalone project health query.
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

		const allProjects = await ctx.db
			.query("projects")
			.withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
			.collect();
		let projects = allProjects.filter((project) => !project.deletedAt);
		if (accessibleProjectIds !== null) {
			projects = projects.filter((project) =>
				accessibleProjectIds.has(project._id),
			);
		}

		const allIssues = await ctx.db
			.query("issues")
			.withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
			.collect();
		let issues = allIssues.filter((issue) => !issue.deletedAt);
		if (accessibleProjectIds !== null) {
			issues = issues.filter(
				(issue) =>
					!issue.projectId || accessibleProjectIds.has(issue.projectId),
			);
		}

		const issuesByProject = new Map<string, Doc<"issues">[]>();
		for (const issue of issues) {
			if (!issue.projectId) continue;
			const key = issue.projectId as string;
			if (!issuesByProject.has(key)) issuesByProject.set(key, []);
			issuesByProject.get(key)?.push(issue);
		}

		return buildHealthRows(projects, issuesByProject, args.rangeEndMs);
	},
});
