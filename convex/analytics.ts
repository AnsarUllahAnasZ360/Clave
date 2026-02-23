import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
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
	openIssueIds: Set<string>,
): Promise<number> {
	const ISSUE_RELATION_BATCH_SIZE = 64;

	if (openIssueIds.size === 0) return 0;

	const openIssueIdList = [...openIssueIds];
	let blockedCount = 0;

	for (let i = 0; i < openIssueIdList.length; i += ISSUE_RELATION_BATCH_SIZE) {
		const batch = openIssueIdList.slice(i, i + ISSUE_RELATION_BATCH_SIZE);
		const blockStates = await Promise.all(
			batch.map((issueId) =>
				ctx.db
					.query("issueRelations")
					.withIndex("by_issue_type", (q) =>
						q.eq("issueId", issueId as Id<"issues">).eq("type", "blocked_by"),
					)
					.first(),
			),
		);

		for (const relation of blockStates) {
			if (relation !== null) blockedCount++;
		}
	}

	return blockedCount;
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

		// ── Fetch projects + issues in parallel ─────────────────────────────
		const issueQuery = projectId
			? ctx.db
					.query("issues")
					.withIndex("by_project", (q) => q.eq("projectId", projectId))
			: memberId
				? ctx.db
						.query("issues")
						.withIndex("by_workspace_assignee", (q) =>
							q.eq("workspaceId", args.workspaceId).eq("assigneeId", memberId),
						)
				: ctx.db
						.query("issues")
						.withIndex("by_workspace", (q) =>
							q.eq("workspaceId", args.workspaceId),
						);

		const [allProjects, allIssues] = await Promise.all([
			ctx.db
				.query("projects")
				.withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
				.collect(),
			issueQuery.collect(),
		]);

		let projects = allProjects.filter((project) => !project.deletedAt);
		if (accessibleProjectIds !== null) {
			projects = projects.filter((project) =>
				accessibleProjectIds.has(project._id),
			);
		}

		const selectedProjects = projectId
			? projects.filter((project) => project._id === projectId)
			: projects;

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

		const buckets = buildBuckets(rangeStartMs, rangeEndMs);
		const workTypeMix = {
			bug: 0,
			improvement: 0,
			feature: 0,
			issue: 0,
		};

		const openIssueIds = new Set<string>();
		const cycleTimeSamples: number[] = [];
		let overdueOpenCount = 0;
		let doneInRangeCount = 0;
		let createdInRangeCount = 0;
		let closedInRangeCount = 0;
		let cancelledInRangeCount = 0;
		let wipCount = 0;
		let issuesInRangeCount = 0;

		for (const issue of issues) {
			const isDone = isDoneStatus(issue.status);
			const isClosed = isClosedStatus(issue.status);
			const isOpen = !isClosed;
			const isCompletedInRange =
				isDone &&
				issue.completedAt != null &&
				issue.completedAt >= rangeStartMs &&
				issue.completedAt <= rangeEndMs;
			const isCreatedInRange =
				issue._creationTime >= rangeStartMs &&
				issue._creationTime <= rangeEndMs;
			const isInRangeWindow =
				issue._creationTime <= rangeEndMs &&
				(!issue.completedAt || issue.completedAt >= rangeStartMs);
			const isCompletedInAnyRange =
				issue.completedAt != null &&
				issue.completedAt >= rangeStartMs &&
				issue.completedAt <= rangeEndMs;
			const isCreatedForSeries =
				issue._creationTime >= rangeStartMs &&
				issue._creationTime <= rangeEndMs;
			const isClosedInRange = isClosed && isCompletedInAnyRange;

			if (isOpen) {
				openIssueIds.add(issue._id as string);
				if (issue.dueDate != null && issue.dueDate < rangeEndMs) {
					overdueOpenCount++;
				}
			}

			if (isWipStatus(issue.status)) {
				wipCount++;
			}

			if (isCompletedInRange) {
				doneInRangeCount++;
				if (issue.completedAt != null) {
					const duration = (issue.completedAt - issue._creationTime) / MS_DAY;
					if (duration > 0) cycleTimeSamples.push(duration);
				}
			}

			if (isCreatedInRange) {
				createdInRangeCount++;
			}

			if (isClosedInRange) {
				closedInRangeCount++;
				if (issue.status === "cancelled") cancelledInRangeCount++;
			}

			if (isInRangeWindow) {
				issuesInRangeCount++;
				workTypeMix[mapIssueTypeToWorkCategory(issue.type)]++;
			}

			if (isCreatedForSeries) {
				const bucketIdx = findBucketIndex(buckets, issue._creationTime);
				if (bucketIdx !== -1) {
					buckets[bucketIdx].createdCount++;
				}
			}

			if (isCompletedInAnyRange && issue.completedAt !== undefined) {
				const bucketIdx = findBucketIndex(buckets, issue.completedAt);
				if (bucketIdx !== -1) {
					if (isDone) buckets[bucketIdx].doneCount++;
					if (issue.status === "cancelled") buckets[bucketIdx].cancelledCount++;
				}
			}
		}

		const cycleTimeP50Days = roundToOneDecimal(
			median(cycleTimeSamples.length ? cycleTimeSamples : [0]),
		);
		const scopeDelta = createdInRangeCount - doneInRangeCount;
		const cancellationRate =
			closedInRangeCount > 0
				? roundToOneDecimal((cancelledInRangeCount / closedInRangeCount) * 100)
				: 0;
		const blockedOpenCount = await getBlockedOpenIssueCount(ctx, openIssueIds);
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
			overdueOpenCount,
			completedInRangeCount: doneInRangeCount,
			riskProjectCount: atRiskRows.length,
			cycleTimeP50Days,
			wipCount,
			blockedOpenCount,
			scopeDelta,
			scopeCreatedInRange: createdInRangeCount,
			cancellationRate,
			healthRows,
			workTypeMix,
			workTypeMixTotal: issuesInRangeCount,
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
		const openIssueIds = new Set<string>(
			openIssues.map((issue) => issue._id as string),
		);

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

		const blockedOpenCount = await getBlockedOpenIssueCount(ctx, openIssueIds);

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

		// Parallel fetch: projects + issues
		const [allProjects, allIssues] = await Promise.all([
			ctx.db
				.query("projects")
				.withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
				.collect(),
			ctx.db
				.query("issues")
				.withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
				.collect(),
		]);

		let projects = allProjects.filter((project) => !project.deletedAt);
		if (accessibleProjectIds !== null) {
			projects = projects.filter((project) =>
				accessibleProjectIds.has(project._id),
			);
		}

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
