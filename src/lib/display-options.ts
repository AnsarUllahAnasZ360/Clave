// ── Display Options types and defaults ──────────────────────────────────────
// Shared configuration for issue views (board, list, timeline).
// Used by DisplayOptionsPanel, useDisplayOptions hook, and all view components.

export type LayoutType = "board" | "list" | "timeline";

export type GroupByOption =
	| "none"
	| "focus"
	| "status"
	| "priority"
	| "assignee"
	| "project"
	| "milestone";

export type SubGroupByOption = GroupByOption;

export type OrderByOption =
	| "manual"
	| "status"
	| "priority"
	| "created"
	| "updated"
	| "dueDate";

export type OrderDirection = "asc" | "desc";

export type SwimlaneSetting = "none" | "assignee" | "priority" | "milestone";

export type DisplayPropertyId =
	| "identifier"
	| "priority"
	| "status"
	| "labels"
	| "assignee"
	| "project"
	| "milestone"
	| "estimate"
	| "dueDate"
	| "created"
	| "updated";

export type DisplayOptions = {
	layout: LayoutType;
	groupBy: GroupByOption;
	subGroupBy: SubGroupByOption;
	orderBy: OrderByOption;
	orderDirection: OrderDirection;
	displayProperties: DisplayPropertyId[];
	showSubIssues: boolean;
	showEmptyGroups: boolean;
	/** Board-specific: swimlane grouping */
	swimlaneBy: SwimlaneSetting;
};

// ── Defaults ────────────────────────────────────────────────────────────────

export const DEFAULT_DISPLAY_PROPERTIES: DisplayPropertyId[] = [
	"identifier",
	"priority",
	"status",
	"assignee",
	"labels",
	"dueDate",
];

export const DEFAULT_DISPLAY_OPTIONS: DisplayOptions = {
	layout: "board",
	groupBy: "status",
	subGroupBy: "none",
	orderBy: "manual",
	orderDirection: "asc",
	displayProperties: DEFAULT_DISPLAY_PROPERTIES,
	showSubIssues: true,
	showEmptyGroups: true,
	swimlaneBy: "none",
};

// ── Option labels ───────────────────────────────────────────────────────────

export const GROUP_BY_LABELS: Record<GroupByOption, string> = {
	none: "No grouping",
	focus: "Focus",
	status: "Status",
	priority: "Priority",
	assignee: "Assignee",
	project: "Project",
	milestone: "Sprint",
};

export const ORDER_BY_LABELS: Record<OrderByOption, string> = {
	manual: "Manual",
	status: "Status",
	priority: "Priority",
	created: "Created date",
	updated: "Updated date",
	dueDate: "Due date",
};

export const SWIMLANE_LABELS: Record<SwimlaneSetting, string> = {
	none: "No swimlanes",
	assignee: "Assignee",
	priority: "Priority",
	milestone: "Sprint",
};

export const DISPLAY_PROPERTY_LABELS: Record<DisplayPropertyId, string> = {
	identifier: "ID",
	priority: "Priority",
	status: "Status",
	labels: "Labels",
	assignee: "Assignee",
	project: "Project",
	milestone: "Sprint",
	estimate: "Hours",
	dueDate: "Due date",
	created: "Created",
	updated: "Updated",
};

// ── Mapping: DisplayPropertyId → list column IDs ───────────────────────────
// Maps display properties to list-view column IDs.
// "title" is always included. Properties without a matching column are ignored.

/** Column IDs used by IssueListView / IssueListRow. */
type ListColumnId =
	| "identifier"
	| "status"
	| "title"
	| "priority"
	| "assignee"
	| "labels"
	| "project"
	| "milestone"
	| "estimate"
	| "dueDate";

/** Canonical column order for the issue list view. */
const LIST_COLUMN_ORDER: ListColumnId[] = [
	"status",
	"identifier",
	"title",
	"priority",
	"assignee",
	"labels",
	"project",
	"milestone",
	"estimate",
	"dueDate",
];

/** IDs that exist both in DisplayPropertyId and ListColumnId */
const SHARED_IDS = new Set<string>([
	"identifier",
	"status",
	"priority",
	"assignee",
	"labels",
	"project",
	"milestone",
	"estimate",
	"dueDate",
]);

/**
 * Convert an array of DisplayPropertyId to an ordered array of ListColumnId.
 * Always includes "title". Preserves canonical column order.
 */
export function displayPropertiesToColumns(
	properties: DisplayPropertyId[],
): ListColumnId[] {
	const active = new Set<ListColumnId>(["title"]);
	for (const p of properties) {
		if (SHARED_IDS.has(p)) {
			active.add(p as ListColumnId);
		}
	}
	return LIST_COLUMN_ORDER.filter((col) => active.has(col));
}

// ── Storage key helper ──────────────────────────────────────────────────────

const STORAGE_PREFIX = "clave:display-options:";

export function getStorageKey(viewContext: string): string {
	return `${STORAGE_PREFIX}${viewContext}`;
}
