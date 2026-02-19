// ── Focus Grouping ──────────────────────────────────────────────────────────
// Sorts assigned issues into 8 priority tiers (Clave's adaptation of Linear's
// 10-tier system, simplified without SLAs or cycles).
//
// Tier order:
//   1. Urgent — priority === "urgent"
//   2. Blocking Others — has "blocks" relations
//   3. Current Milestone — assigned to an active milestone
//   4. Active — status is "in_progress" or "in_review"
//   5. Triage — status is "triage"
//   6. Backlog — status is "backlog" or "todo"
//   7. Done — status is "done"
//   8. Canceled — status is "cancelled"
//
// Within each tier, issues sort by priority (urgent > high > medium > low > none),
// then by started issues first (in_progress/in_review before others).

export type FocusGroup =
	| "urgent"
	| "blocking"
	| "milestone"
	| "active"
	| "triage"
	| "backlog"
	| "done"
	| "cancelled";

export const FOCUS_GROUP_ORDER: FocusGroup[] = [
	"urgent",
	"blocking",
	"milestone",
	"active",
	"triage",
	"backlog",
	"done",
	"cancelled",
];

export const FOCUS_GROUP_LABELS: Record<FocusGroup, string> = {
	urgent: "Urgent",
	blocking: "Blocking others",
	milestone: "Current sprint",
	active: "Active",
	triage: "Triage",
	backlog: "Backlog",
	done: "Done",
	cancelled: "Cancelled",
};

const PRIORITY_SORT: Record<string, number> = {
	urgent: 0,
	high: 1,
	medium: 2,
	low: 3,
	no_priority: 4,
};

const STARTED_STATUSES = new Set(["in_progress", "in_review"]);

type IssueForFocus = {
	_id: string;
	status: string;
	priority: string;
	milestoneId?: string;
};

/** Determine the focus group for a single issue */
export function getFocusGroup(
	issue: IssueForFocus,
	blockingIssueIds: Set<string>,
): FocusGroup {
	// Tier 7-8: Terminal statuses take priority
	if (issue.status === "done") return "done";
	if (issue.status === "cancelled") return "cancelled";

	// Tier 1: Urgent priority
	if (issue.priority === "urgent") return "urgent";

	// Tier 2: Blocking others
	if (blockingIssueIds.has(issue._id)) return "blocking";

	// Tier 3: Has an active milestone
	if (issue.milestoneId) return "milestone";

	// Tier 4: Active (in progress or in review)
	if (STARTED_STATUSES.has(issue.status)) return "active";

	// Tier 5: Triage
	if (issue.status === "triage") return "triage";

	// Tier 6: Backlog (backlog, todo, or anything else)
	return "backlog";
}

/** Sort comparator within a focus group: by priority, then by started status */
function withinGroupSort(a: IssueForFocus, b: IssueForFocus): number {
	const priorityA = PRIORITY_SORT[a.priority] ?? 4;
	const priorityB = PRIORITY_SORT[b.priority] ?? 4;
	if (priorityA !== priorityB) return priorityA - priorityB;

	// Started issues come first
	const aStarted = STARTED_STATUSES.has(a.status) ? 0 : 1;
	const bStarted = STARTED_STATUSES.has(b.status) ? 0 : 1;
	return aStarted - bStarted;
}

export type FocusGroupResult<T extends IssueForFocus> = {
	group: FocusGroup;
	label: string;
	issues: T[];
};

/** Group and sort issues by focus tier */
export function groupByFocus<T extends IssueForFocus>(
	issues: T[],
	blockingIssueIds: Set<string>,
): FocusGroupResult<T>[] {
	const groups = new Map<FocusGroup, T[]>();

	// Initialize all groups
	for (const group of FOCUS_GROUP_ORDER) {
		groups.set(group, []);
	}

	// Assign each issue to its group
	for (const issue of issues) {
		const group = getFocusGroup(issue, blockingIssueIds);
		groups.get(group)?.push(issue);
	}

	// Sort within each group
	for (const [, groupIssues] of groups) {
		groupIssues.sort(withinGroupSort);
	}

	// Return only non-empty groups
	return FOCUS_GROUP_ORDER.filter((g) => (groups.get(g)?.length ?? 0) > 0).map(
		(group) => ({
			group,
			label: FOCUS_GROUP_LABELS[group],
			issues: groups.get(group) ?? [],
		}),
	);
}
