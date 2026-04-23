"use client";

import {
	closestCenter,
	DndContext,
	type DragEndEvent,
	PointerSensor,
	useDroppable,
	useSensor,
	useSensors,
} from "@dnd-kit/core";
import {
	SortableContext,
	useSortable,
	verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useMutation, useQuery } from "convex/react";
import {
	ChevronDown,
	ChevronRight,
	CircleDashed,
	Flag,
	Plus,
	Users,
} from "lucide-react";
import { useRouter } from "next/navigation";
import {
	useCallback,
	useEffect,
	useLayoutEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { toast } from "sonner";
import { IssueBulkActionBar } from "@/components/issues/IssueBulkActionBar";
import {
	type IssueCreatePreset,
	useIssueCreate,
} from "@/components/issues/IssueCreateContext";
import {
	type IssueListData,
	IssueListRow,
	type ListColumnId,
	type MemberOption,
} from "@/components/issues/IssueListRow";
import {
	IssueFilterChips,
	MyIssuesFilterPopover,
	useIssueFilters,
} from "@/components/issues/MyIssuesFilterPopover";
import { useWorkspace } from "@/components/providers/workspace-context";
import {
	useWorkspaceLabels,
	useWorkspaceMembers,
	useWorkspaceProjects,
} from "@/components/providers/workspace-data-context";
import { Checkbox } from "@/components/ui/checkbox";
import { useEffectiveIssueConfig } from "@/hooks/use-effective-issue-config";
import type {
	DisplayPropertyId,
	GroupByOption,
	OrderByOption,
	OrderDirection,
	SubGroupByOption,
} from "@/lib/display-options";
import { displayPropertiesToColumns } from "@/lib/display-options";
import {
	DEFAULT_PRIORITIES,
	PRIORITY_ITEMS as PRIORITY_CONFIG,
	PRIORITY_ORDER,
} from "@/lib/issue-config";
import {
	pulseDropTarget,
	resolveSidebarDropTarget,
	setSidebarDragActive,
} from "@/lib/sidebar-drag";
import { cn } from "@/lib/utils";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

// ── Types ──────────────────────────────────────────────────────────────────

export type ListGroupBy =
	| "none"
	| "status"
	| "priority"
	| "assignee"
	| "project"
	| "milestone";

export type ListSubGroupBy = "none" | ListGroupBy;

export type ListSortBy =
	| "status"
	| "priority"
	| "created"
	| "updated"
	| "dueDate"
	| "manual";

type GroupedIssues = {
	key: string;
	label: string;
	icon?: React.ReactNode;
	count: number;
	issues: IssueListData[];
	subGroups?: GroupedIssues[];
};

// ── Default columns ────────────────────────────────────────────────────────

const ALL_COLUMNS: { id: ListColumnId; label: string; default: boolean }[] = [
	{ id: "status", label: "Status", default: true },
	{ id: "identifier", label: "ID", default: true },
	{ id: "title", label: "Name", default: true },
	{ id: "priority", label: "Priority", default: true },
	{ id: "assignee", label: "Assignees", default: true },
	{ id: "labels", label: "Labels", default: false },
	{ id: "project", label: "Project", default: false },
	{ id: "milestone", label: "Sprint", default: false },
	{ id: "estimate", label: "Hours", default: false },
	{ id: "dueDate", label: "Due date", default: true },
];

// Column widths for header alignment (must match IssueListRow)
const COLUMN_WIDTHS: Record<ListColumnId, string> = {
	identifier: "w-[80px]",
	status: "w-[110px]",
	title: "flex-1 min-w-0",
	priority: "w-[32px]",
	assignee: "w-[140px]",
	labels: "w-[120px]",
	project: "w-[120px]",
	milestone: "w-[100px]",
	estimate: "w-[90px]",
	dueDate: "w-[90px]",
};

// ── Priority icons for group headers (status icons resolved dynamically) ─

const PRIORITY_ICONS: Record<string, React.ReactNode> = Object.fromEntries(
	DEFAULT_PRIORITIES.map((p) => {
		const Icon = p.icon;
		return [p.key, <Icon key={p.key} className={`h-4 w-4 ${p.color}`} />];
	}),
);

// ── Sorting ────────────────────────────────────────────────────────────────

function sortIssues(
	issues: IssueListData[],
	sortBy: ListSortBy,
	statusOrder: Record<string, number>,
	direction: "asc" | "desc" = "asc",
): IssueListData[] {
	const sorted = [...issues];
	const dir = direction === "desc" ? -1 : 1;
	switch (sortBy) {
		case "status":
			sorted.sort(
				(a, b) =>
					dir * ((statusOrder[a.status] ?? 99) - (statusOrder[b.status] ?? 99)),
			);
			break;
		case "priority":
			sorted.sort(
				(a, b) =>
					dir *
					((PRIORITY_ORDER[a.priority] ?? 99) -
						(PRIORITY_ORDER[b.priority] ?? 99)),
			);
			break;
		case "created":
			sorted.sort((a, b) => dir * (b._creationTime - a._creationTime));
			break;
		case "updated":
			sorted.sort(
				(a, b) =>
					dir *
					((b.updatedAt ?? b._creationTime) - (a.updatedAt ?? a._creationTime)),
			);
			break;
		case "dueDate":
			sorted.sort((a, b) => {
				if (!a.dueDate && !b.dueDate) return 0;
				if (!a.dueDate) return 1;
				if (!b.dueDate) return -1;
				return dir * (a.dueDate - b.dueDate);
			});
			break;
		case "manual":
			sorted.sort((a, b) => dir * (a.sortOrder - b.sortOrder));
			break;
	}
	return sorted;
}

// ── Grouping ───────────────────────────────────────────────────────────────

type StatusDescriptor = {
	id: string;
	label: string;
	icon: React.ReactNode;
};

function groupIssues(
	issues: IssueListData[],
	groupBy: ListGroupBy,
	memberMap: Map<string, MemberOption>,
	projectMap: Map<string, string>,
	milestoneMap: Map<string, string>,
	statusDescriptors: StatusDescriptor[],
): GroupedIssues[] {
	if (groupBy === "none") {
		return [{ key: "all", label: "All issues", count: issues.length, issues }];
	}

	const groups = new Map<string, IssueListData[]>();

	for (const issue of issues) {
		let key: string;
		switch (groupBy) {
			case "status":
				key = issue.status;
				break;
			case "priority":
				key = issue.priority;
				break;
			case "assignee":
				// Multi-assign support: group by the single assignee, otherwise "Multiple" bucket.
				// This keeps list view stable when assigneeIds is used instead of legacy assigneeId.
				{
					const effectiveIds =
						issue.assigneeIds && issue.assigneeIds.length > 0
							? issue.assigneeIds
							: issue.assigneeId
								? [issue.assigneeId]
								: [];
					key =
						effectiveIds.length === 0
							? "unassigned"
							: effectiveIds.length === 1
								? (effectiveIds[0] as string)
								: "multiple";
				}
				break;
			case "project":
				key = issue.projectId ? (issue.projectId as string) : "no_project";
				break;
			case "milestone":
				key = issue.sprintId
					? (issue.sprintId as string)
					: issue.milestoneId
						? (issue.milestoneId as string)
						: "no_milestone";
				break;
			default:
				key = "all";
		}
		const existing = groups.get(key);
		if (existing) {
			existing.push(issue);
		} else {
			groups.set(key, [issue]);
		}
	}

	const result: GroupedIssues[] = [];

	// Order groups based on the groupBy dimension
	if (groupBy === "status") {
		for (const sc of statusDescriptors) {
			const items = groups.get(sc.id);
			if (items) {
				result.push({
					key: sc.id,
					label: sc.label,
					icon: sc.icon,
					count: items.length,
					issues: items,
				});
			}
		}
	} else if (groupBy === "priority") {
		for (const pc of PRIORITY_CONFIG) {
			const items = groups.get(pc.id);
			if (items) {
				result.push({
					key: pc.id,
					label: pc.label,
					icon: PRIORITY_ICONS[pc.id],
					count: items.length,
					issues: items,
				});
			}
		}
	} else if (groupBy === "assignee") {
		// Assigned users first, then unassigned
		const unassigned = groups.get("unassigned");
		const multiple = groups.get("multiple");
		for (const [key, items] of groups) {
			if (key === "unassigned" || key === "multiple") continue;
			const member = memberMap.get(key);
			result.push({
				key,
				label: member?.name ?? "Unknown",
				icon: <Users className="h-4 w-4 text-muted-foreground" />,
				count: items.length,
				issues: items,
			});
		}
		if (multiple) {
			result.push({
				key: "multiple",
				label: "Multiple",
				icon: <Users className="h-4 w-4 text-muted-foreground" />,
				count: multiple.length,
				issues: multiple,
			});
		}
		if (unassigned) {
			result.push({
				key: "unassigned",
				label: "Unassigned",
				icon: <Users className="h-4 w-4 text-muted-foreground" />,
				count: unassigned.length,
				issues: unassigned,
			});
		}
	} else if (groupBy === "project") {
		const noProject = groups.get("no_project");
		for (const [key, items] of groups) {
			if (key === "no_project") continue;
			result.push({
				key,
				label: projectMap.get(key) ?? "Unknown project",
				count: items.length,
				issues: items,
			});
		}
		if (noProject) {
			result.push({
				key: "no_project",
				label: "No project",
				count: noProject.length,
				issues: noProject,
			});
		}
	} else if (groupBy === "milestone") {
		const noMilestone = groups.get("no_milestone");
		for (const [key, items] of groups) {
			if (key === "no_milestone") continue;
			result.push({
				key,
				label: milestoneMap.get(key) ?? "Unknown sprint",
				icon: <Flag className="h-4 w-4 text-muted-foreground" />,
				count: items.length,
				issues: items,
			});
		}
		if (noMilestone) {
			result.push({
				key: "no_milestone",
				label: "No sprint",
				icon: <Flag className="h-4 w-4 text-muted-foreground" />,
				count: noMilestone.length,
				issues: noMilestone,
			});
		}
	}

	return result;
}

// ── Component ──────────────────────────────────────────────────────────────

export type IssueListViewProps = {
	/** Issues from the parent — pass from a query */
	issues: IssueListData[];
	/** Project ID for scoped views */
	projectId?: Id<"projects">;
	/** Group by option from display settings */
	groupBy?: GroupByOption;
	/** Sub-group by option from display settings */
	subGroupBy?: SubGroupByOption;
	/** Sort/order by option from display settings */
	orderBy?: OrderByOption;
	/** Sort direction — ascending or descending */
	orderDirection?: OrderDirection;
	/** Display properties from display settings — mapped to columns */
	displayProperties?: DisplayPropertyId[];
	/** Hide empty groups when grouping is active */
	showEmptyGroups?: boolean;
	/** Hide the internal filter toolbar (when parent already provides one) */
	hideFilter?: boolean;
	/** When the parent owns the filter state (hideFilter=true), pass its
	 *  current filter snapshot so the per-group "+" button picks up the
	 *  user's active filters instead of the unused local filter state.
	 *  `projectId` accepts `null` to match `IssueFilters`, which models
	 *  "no project filter" as `null` rather than `undefined`. */
	externalFilters?: {
		statuses: string[];
		priorities: string[];
		assigneeIds: string[];
		projectId?: string | null;
		milestoneIds: string[];
		labelIds: string[];
	};
	/** Callback when an issue row is clicked (for peek sidebar). If not provided, navigates to issue page. */
	onIssueClick?: (issueId: string) => void;
	/** Multi-select + bulk actions on list rows (ClickUp-style). */
	enableBulkSelect?: boolean;
	/** All workspace sprints — used for per-issue sprint picker when no single project is selected (e.g. My Issues page). */
	allWorkspaceSprints?: Array<{
		_id: string;
		name: string;
		projectId?: string;
		projectName?: string;
	}>;
};

export function IssueListView({
	issues,
	projectId,
	groupBy: groupByProp = "status",
	subGroupBy: subGroupByProp = "none",
	orderBy: orderByProp = "manual",
	orderDirection: orderDirectionProp = "asc",
	displayProperties,
	showEmptyGroups: showEmptyGroupsProp = true,
	hideFilter,
	externalFilters,
	onIssueClick,
	allWorkspaceSprints,
}: IssueListViewProps) {
	const { workspaceId, workspaceSlug } = useWorkspace();
	const router = useRouter();
	const { openQuickCreate } = useIssueCreate();

	// Load effective statuses (workspace + optional project override).
	const project = useQuery(
		api.projects.getById,
		projectId ? { projectId } : "skip",
	);
	const effective = useEffectiveIssueConfig(workspaceId, project ?? undefined);
	const statusItems = effective.statusItems;
	const statusOrder = effective.statusOrder;
	const statusDescriptors = useMemo<StatusDescriptor[]>(
		() =>
			statusItems.map((s) => ({
				id: s.id,
				label: s.label,
				icon: (
					<s.icon
						key={s.id}
						className="h-4 w-4"
						style={{ color: s.colorHex }}
					/>
				),
			})),
		[statusItems],
	);
	const sensors = useSensors(
		useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
	);
	// Prevent accidental navigation when a drag ends (mouse up can trigger click).
	const suppressClickRef = useRef(false);
	const containerRef = useRef<HTMLDivElement>(null);

	// ── Scroll-position preservation ────────────────────────────────────
	// Snapshot scrollTop on every render so we can restore it synchronously
	// in useLayoutEffect if the DOM update would otherwise reset scroll
	// (e.g. SortableContext items change, sidebar width transition, etc.).
	const savedScrollTopRef = useRef<number>(0);
	// Track whether we're past the first render (skip restore on mount).
	const hasMountedRef = useRef(false);

	// Capture current scrollTop *before* React commits to the DOM.
	// Runs every render — reading scrollTop is cheap.
	if (containerRef.current) {
		savedScrollTopRef.current = containerRef.current.scrollTop;
	}

	useLayoutEffect(() => {
		if (!hasMountedRef.current) {
			hasMountedRef.current = true;
			return;
		}
		const el = containerRef.current;
		if (!el) return;
		// Restore the pre-render scrollTop synchronously before paint.
		if (el.scrollTop !== savedScrollTopRef.current) {
			el.scrollTop = savedScrollTopRef.current;
		}
	});

	// ── Filter state ─────────────────────────────────────────────────────
	const {
		filters,
		setFilter,
		clearAll: clearAllFilters,
		activeFilterCount,
		applyFilters,
	} = useIssueFilters();
	const [showFilters, setShowFilters] = useState(false);

	// ── Bulk selection state (ClickUp-style) ─────────────────────────────
	const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
	const [lastClickedId, setLastClickedId] = useState<string | null>(null);

	// ── View state (derived from props) ─────────────────────────────────
	const groupBy = (
		groupByProp === "focus" ? "status" : groupByProp
	) as ListGroupBy;
	const subGroupBy = (
		subGroupByProp === "focus" ? "none" : subGroupByProp
	) as ListSubGroupBy;
	const sortBy = orderByProp as ListSortBy;
	const visibleColumns = useMemo<ListColumnId[]>(
		() =>
			displayProperties
				? displayPropertiesToColumns(displayProperties)
				: ALL_COLUMNS.filter((c) => c.default).map((c) => c.id),
		[displayProperties],
	);
	const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(
		new Set(),
	);
	const [highlightedIndex, setHighlightedIndex] = useState<number>(-1);

	// ── Create-from-group helper ─────────────────────────────────────────
	// When parent owns filter state (e.g. ProjectDetailsPage passes
	// `externalFilters`), the local `filters` are empty and useless here —
	// fall through to the external snapshot so the per-group "+" picks up
	// the user's actual filters.
	const activeFilters = externalFilters ?? filters;
	const buildPresetFromGroup = useCallback(
		(groupKey: string, parentGroupKey?: string): IssueCreatePreset => {
			const preset: IssueCreatePreset = {};

			// Start with the parent project context
			if (projectId) preset.projectId = projectId as string;

			// Apply single-value filters as defaults
			if (activeFilters.statuses.length === 1)
				preset.status = activeFilters.statuses[0];
			if (activeFilters.priorities.length === 1)
				preset.priority = activeFilters.priorities[0];
			if (activeFilters.assigneeIds.length === 1)
				preset.assigneeIds = [activeFilters.assigneeIds[0]];
			if (activeFilters.projectId) preset.projectId = activeFilters.projectId;
			if (activeFilters.milestoneIds.length === 1)
				preset.sprintId = activeFilters.milestoneIds[0];
			if (activeFilters.labelIds.length > 0)
				preset.labelIds = [...activeFilters.labelIds];

			// Apply the group dimension — overrides the filter for that field
			const applyGroupKey = (dimension: string, key: string) => {
				switch (dimension) {
					case "status":
						preset.status = key;
						break;
					case "priority":
						preset.priority = key;
						break;
					case "assignee":
						if (key !== "unassigned" && key !== "multiple")
							preset.assigneeIds = [key];
						break;
					case "project":
						if (key !== "no_project") preset.projectId = key;
						break;
					case "milestone":
						if (key !== "no_milestone") preset.sprintId = key;
						break;
				}
			};

			// Apply parent group first, then the sub-group
			if (parentGroupKey) applyGroupKey(groupBy, parentGroupKey);
			applyGroupKey(parentGroupKey ? subGroupBy : groupBy, groupKey);

			return preset;
		},
		[projectId, activeFilters, groupBy, subGroupBy],
	);

	// ── Data fetching for resolving names ───────────────────────────────
	const members = useWorkspaceMembers();
	const projects = useWorkspaceProjects();
	const labels = useWorkspaceLabels();

	// When no projectId prop (e.g. My Issues), derive from selected issues
	// so the bulk sprint picker shows the right project's sprints.
	const selectedProjectId = useMemo(() => {
		if (projectId) return projectId;
		if (selectedIds.size === 0) return undefined;
		const projectIds = new Set<string>();
		for (const id of selectedIds) {
			const issue = issues.find((i) => (i._id as string) === id);
			if (issue?.projectId) projectIds.add(issue.projectId as string);
		}
		// Only use if all selected issues share the same project
		if (projectIds.size === 1) {
			const [pid] = projectIds;
			return pid as Id<"projects">;
		}
		return undefined;
	}, [projectId, selectedIds, issues]);

	const projectSprints = useQuery(
		api.sprints.listByProject,
		selectedProjectId
			? { projectId: selectedProjectId as Id<"projects"> }
			: "skip",
	);

	// Use project-specific sprints when available, fall back to workspace-wide
	// sprints (passed from parent) so the sprint picker works on pages like
	// My Issues where no single project is selected.
	const allSprints = projectSprints ?? allWorkspaceSprints ?? null;

	// ── Mutations ───────────────────────────────────────────────────────
	const updateIssue = useMutation(api.issues.update);
	const updateStatus = useMutation(api.issues.updateStatus);
	const assignIssue = useMutation(api.issues.assign);
	const removeIssue = useMutation(api.issues.remove);

	// ── Computed maps ───────────────────────────────────────────────────
	const memberOptions = useMemo(() => {
		if (!members) return [];
		return members.map((m) => ({
			id: m.userId as string,
			name: m.user?.name ?? m.user?.email ?? "Unknown",
			image: m.user?.avatarUrl ?? m.user?.image ?? undefined,
		}));
	}, [members]);

	const memberMap = useMemo(() => {
		const map = new Map<string, MemberOption>();
		for (const m of memberOptions) {
			map.set(m.id, m);
		}
		return map;
	}, [memberOptions]);

	const projectOptions = useMemo(() => {
		if (!projects) return [];
		return projects.map((p) => ({ id: p._id as string, name: p.name }));
	}, [projects]);

	const projectMap = useMemo(() => {
		const map = new Map<string, string>();
		if (projects) {
			for (const p of projects) {
				map.set(p._id as string, p.name);
			}
		}
		return map;
	}, [projects]);

	const milestoneOptions = useMemo(() => {
		if (!allSprints) return [];
		return allSprints.map((m) => ({
			id: m._id as string,
			name: m.name,
			projectId: "projectId" in m ? (m.projectId as string) : undefined,
		}));
	}, [allSprints]);

	// Per-issue sprint options: only show sprints for the issue's project.
	// No project → no sprints (sprints always belong to a project).
	const getMilestoneOptionsForIssue = useCallback(
		(issueProjectId?: string | null) => {
			if (!issueProjectId) return [];
			return milestoneOptions.filter((m) => m.projectId === issueProjectId);
		},
		[milestoneOptions],
	);

	const milestoneMap = useMemo(() => {
		const map = new Map<string, string>();
		if (allSprints) {
			for (const m of allSprints) {
				map.set(m._id as string, m.name);
			}
		}
		return map;
	}, [allSprints]);

	const labelOptions = useMemo(() => {
		if (!labels) return [];
		return labels.map((l) => ({
			_id: l._id,
			name: l.name,
			color: l.color,
		}));
	}, [labels]);

	// ── Lookup maps for filter chips ────────────────────────────────────
	const memberNameMap = useMemo(() => {
		const map = new Map<string, string>();
		for (const m of memberOptions) {
			map.set(m.id, m.name);
		}
		return map;
	}, [memberOptions]);

	const labelMap = useMemo(() => {
		const map = new Map<string, { name: string; color: string }>();
		if (labels) {
			for (const l of labels) {
				map.set(l._id as string, { name: l.name, color: l.color });
			}
		}
		return map;
	}, [labels]);

	// ── Filtered + sorted + grouped data ────────────────────────────────
	const filteredIssues = useMemo(
		() => applyFilters(issues),
		[issues, applyFilters],
	);

	const sortedIssues = useMemo(
		() => sortIssues(filteredIssues, sortBy, statusOrder, orderDirectionProp),
		[filteredIssues, sortBy, statusOrder, orderDirectionProp],
	);

	const groupedIssues = useMemo(() => {
		const groups = groupIssues(
			sortedIssues,
			groupBy,
			memberMap,
			projectMap,
			milestoneMap,
			statusDescriptors,
		);

		// Apply sub-grouping
		if (subGroupBy !== "none" && subGroupBy !== groupBy) {
			for (const group of groups) {
				group.subGroups = groupIssues(
					group.issues,
					subGroupBy,
					memberMap,
					projectMap,
					milestoneMap,
					statusDescriptors,
				);
			}
		}

		// Hide empty groups when the display option is off
		if (!showEmptyGroupsProp && groupBy !== "none") {
			return groups.filter((g) => g.issues.length > 0);
		}

		return groups;
	}, [
		sortedIssues,
		groupBy,
		subGroupBy,
		showEmptyGroupsProp,
		memberMap,
		projectMap,
		milestoneMap,
		statusDescriptors,
	]);

	// ── Flat list of visible issue IDs for keyboard nav ──────────────────
	const flatIssueIds = useMemo(() => {
		const ids: Id<"issues">[] = [];
		for (const group of groupedIssues) {
			if (collapsedGroups.has(group.key)) continue;
			if (group.subGroups) {
				for (const sub of group.subGroups) {
					const subKey = `${group.key}::${sub.key}`;
					if (collapsedGroups.has(subKey)) continue;
					for (const issue of sub.issues) {
						ids.push(issue._id);
					}
				}
			} else {
				for (const issue of group.issues) {
					ids.push(issue._id);
				}
			}
		}
		return ids;
	}, [groupedIssues, collapsedGroups]);

	const visibleIssueIds = useMemo(
		() => flatIssueIds.map(String),
		[flatIssueIds],
	);

	// Full id set across every group, *ignoring* collapse state. Collapsing
	// a group is a display toggle, not a data-set change — the selection
	// should survive it. We use this (not `visibleIssueIds`) to prune the
	// selection when the underlying data actually changes (filters, groups,
	// sorting, server updates).
	const allGroupedIssueIds = useMemo(() => {
		const ids: string[] = [];
		for (const group of groupedIssues) {
			if (group.subGroups) {
				for (const sub of group.subGroups) {
					for (const issue of sub.issues) ids.push(issue._id as string);
				}
			} else {
				for (const issue of group.issues) ids.push(issue._id as string);
			}
		}
		return ids;
	}, [groupedIssues]);

	// Prune selection to the currently-grouped set (not the visible set). This
	// keeps ids inside collapsed groups selected, so (a) toggling the group
	// checkbox while collapsed correctly selects all children, and (b) a
	// collapse/expand cycle doesn't clear prior selections.
	useEffect(() => {
		setSelectedIds((prev) => {
			if (prev.size === 0) return prev;
			const live = new Set(allGroupedIssueIds);
			const next = new Set<string>();
			for (const id of prev) {
				if (live.has(id)) next.add(id);
			}
			return next;
		});
	}, [allGroupedIssueIds]);

	// Master checkbox operates on the full grouped set, *including* items
	// inside collapsed groups — otherwise "Select all" would silently skip
	// everything the user can't currently see, which reads as a bug.
	const headerCheckboxState = useMemo<boolean | "indeterminate">(() => {
		if (allGroupedIssueIds.length === 0) return false;
		let selected = 0;
		for (const id of allGroupedIssueIds) {
			if (selectedIds.has(id)) selected++;
		}
		if (selected === 0) return false;
		if (selected === allGroupedIssueIds.length) return true;
		return "indeterminate";
	}, [allGroupedIssueIds, selectedIds]);

	const toggleSelectAllVisible = useCallback(() => {
		setSelectedIds((prev) => {
			if (allGroupedIssueIds.length === 0) return prev;
			const allSelected = allGroupedIssueIds.every((id) => prev.has(id));
			const next = new Set(prev);
			if (allSelected) {
				for (const id of allGroupedIssueIds) next.delete(id);
			} else {
				for (const id of allGroupedIssueIds) next.add(id);
			}
			return next;
		});
		setLastClickedId(null);
	}, [allGroupedIssueIds]);

	const handleSelectIssue = useCallback(
		(issueId: string, shiftKey: boolean) => {
			setSelectedIds((prev) => {
				const next = new Set(prev);
				if (shiftKey && lastClickedId) {
					const start = visibleIssueIds.indexOf(lastClickedId);
					const end = visibleIssueIds.indexOf(issueId);
					if (start !== -1 && end !== -1) {
						const [from, to] = start < end ? [start, end] : [end, start];
						for (let i = from; i <= to; i++) next.add(visibleIssueIds[i]);
					}
				} else {
					if (next.has(issueId)) next.delete(issueId);
					else next.add(issueId);
				}
				return next;
			});
			setLastClickedId(issueId);
		},
		[lastClickedId, visibleIssueIds],
	);

	// Helper: Get all issue IDs from a group (including subgroups)
	const getGroupIssueIds = useCallback((group: GroupedIssues): string[] => {
		const ids: string[] = [];
		for (const issue of group.issues) {
			ids.push(issue._id as string);
		}
		if (group.subGroups) {
			for (const subGroup of group.subGroups) {
				ids.push(...getGroupIssueIds(subGroup));
			}
		}
		return ids;
	}, []);

	// Helper: Calculate checkbox state for a group
	const getGroupCheckboxState = useCallback(
		(group: GroupedIssues): boolean | "indeterminate" => {
			const groupIds = getGroupIssueIds(group);
			if (groupIds.length === 0) return false;
			let selected = 0;
			for (const id of groupIds) {
				if (selectedIds.has(id)) selected++;
			}
			if (selected === 0) return false;
			if (selected === groupIds.length) return true;
			return "indeterminate";
		},
		[getGroupIssueIds, selectedIds],
	);

	// Helper: Toggle all issues in a group
	const toggleSelectGroup = useCallback(
		(group: GroupedIssues) => {
			const groupIds = getGroupIssueIds(group);
			setSelectedIds((prev) => {
				const allSelected = groupIds.every((id) => prev.has(id));
				const next = new Set(prev);
				if (allSelected) {
					for (const id of groupIds) next.delete(id);
				} else {
					for (const id of groupIds) next.add(id);
				}
				return next;
			});
			setLastClickedId(null);
		},
		[getGroupIssueIds],
	);

	// Map from issue ID to identifier for URL generation
	const idToIdentifier = useMemo(() => {
		const map = new Map<string, string>();
		for (const group of groupedIssues) {
			const allIssues = group.subGroups
				? group.subGroups.flatMap((sub) => sub.issues)
				: group.issues;
			for (const issue of allIssues) {
				map.set(issue._id as string, issue.identifier);
			}
		}
		return map;
	}, [groupedIssues]);

	// ── Handlers ────────────────────────────────────────────────────────
	const handleStatusChange = useCallback(
		async (issueId: Id<"issues">, status: string) => {
			try {
				await updateStatus({
					issueId,
					status: status as
						| "triage"
						| "backlog"
						| "todo"
						| "in_progress"
						| "in_review"
						| "done"
						| "cancelled",
				});
			} catch {
				toast.error("Failed to update status");
			}
		},
		[updateStatus],
	);

	const handlePriorityChange = useCallback(
		async (issueId: Id<"issues">, priority: string) => {
			try {
				await updateIssue({
					issueId,
					priority: priority as
						| "urgent"
						| "high"
						| "medium"
						| "low"
						| "no_priority",
				});
			} catch {
				toast.error("Failed to update priority");
			}
		},
		[updateIssue],
	);

	const handleAssigneeChange = useCallback(
		async (issueId: Id<"issues">, assigneeId: string | undefined) => {
			try {
				await assignIssue({
					issueId,
					assigneeId: assigneeId ? (assigneeId as Id<"users">) : undefined,
				});
			} catch {
				toast.error("Failed to update assignee");
			}
		},
		[assignIssue],
	);

	// Drag/drop across groups (status, priority, and assignee)
	const canDragAcrossGroups =
		groupBy === "status" || groupBy === "priority" || groupBy === "assignee";
	const issueIdToGroupKey = useMemo(() => {
		const map = new Map<string, string>();
		for (const issue of sortedIssues) {
			if (groupBy === "priority") {
				map.set(issue._id as string, issue.priority);
			} else if (groupBy === "assignee") {
				const ids =
					issue.assigneeIds && issue.assigneeIds.length > 0
						? issue.assigneeIds
						: issue.assigneeId
							? [issue.assigneeId]
							: [];
				const key =
					ids.length === 0
						? "unassigned"
						: ids.length === 1
							? (ids[0] as string)
							: "multiple";
				map.set(issue._id as string, key);
			} else {
				map.set(issue._id as string, issue.status);
			}
		}
		return map;
	}, [sortedIssues, groupBy]);
	const handleDragEnd = useCallback(
		(event: DragEndEvent) => {
			const activeId = String(event.active.id);

			// Sidebar hit-test runs BEFORE in-view handling. When the pointer
			// is over a sidebar drop target, that takes precedence over
			// dnd-kit's `over` (which is computed against the dragged row's
			// rect and can still reference a group dropzone at the edge).
			const sidebarTarget = resolveSidebarDropTarget(event);
			if (sidebarTarget) {
				if (sidebarTarget.kind === "sprint") {
					void updateIssue({
						issueId: activeId as Id<"issues">,
						projectId: sidebarTarget.projectId as Id<"projects">,
						sprintId: sidebarTarget.sprintId as Id<"sprints">,
					})
						.then(() => {
							toast.success("Moved to sprint");
							pulseDropTarget("sprint", {
								projectId: sidebarTarget.projectId,
								sprintId: sidebarTarget.sprintId,
							});
						})
						.catch(() => toast.error("Failed to move issue"));
				} else if (
					sidebarTarget.kind === "backlog" ||
					sidebarTarget.kind === "project"
				) {
					void updateIssue({
						issueId: activeId as Id<"issues">,
						projectId: sidebarTarget.projectId as Id<"projects">,
						sprintId: null,
						listId: null,
					})
						.then(() => {
							toast.success(
								sidebarTarget.kind === "project"
									? "Moved to project"
									: "Moved to backlog",
							);
							pulseDropTarget(sidebarTarget.kind, {
								projectId: sidebarTarget.projectId,
							});
						})
						.catch(() => toast.error("Failed to move issue"));
				}
				return;
			}

			if (!event.over) return;

			if (!canDragAcrossGroups) return;
			const overId = String(event.over.id);
			// Prefer explicit group drop zone, but also support dropping onto a row
			// inside the destination group (typical sortable list behavior).
			const nextGroupKey = overId.startsWith("group:")
				? overId.slice("group:".length)
				: issueIdToGroupKey.get(overId);
			if (!nextGroupKey) return;
			const currentGroupKey = issueIdToGroupKey.get(activeId);
			if (currentGroupKey === nextGroupKey) return;
			if (groupBy === "status") {
				void handleStatusChange(activeId as Id<"issues">, nextGroupKey);
			} else if (groupBy === "priority") {
				void handlePriorityChange(activeId as Id<"issues">, nextGroupKey);
			} else if (groupBy === "assignee") {
				if (nextGroupKey === "multiple") return;
				void handleAssigneeChange(
					activeId as Id<"issues">,
					nextGroupKey === "unassigned"
						? undefined
						: (nextGroupKey as Id<"users">),
				);
			}
		},
		[
			canDragAcrossGroups,
			handleStatusChange,
			handlePriorityChange,
			handleAssigneeChange,
			issueIdToGroupKey,
			groupBy,
			updateIssue,
		],
	);

	function SortableIssueRow({
		issueId,
		children,
	}: {
		issueId: string;
		children: React.ReactNode;
	}) {
		const {
			attributes,
			listeners,
			setNodeRef,
			transform,
			transition,
			isDragging,
		} = useSortable({ id: issueId });
		const style: React.CSSProperties = {
			transform: CSS.Transform.toString(transform),
			transition,
		};
		return (
			<div
				ref={setNodeRef}
				style={style}
				data-issue-id={issueId}
				className={cn(isDragging && "opacity-70")}
				onClickCapture={(e) => {
					if (suppressClickRef.current) {
						e.preventDefault();
						e.stopPropagation();
					}
				}}
				{...attributes}
				{...listeners}
			>
				{children}
			</div>
		);
	}

	function GroupDropZone({
		groupKey,
		children,
	}: {
		groupKey: string;
		children: React.ReactNode;
	}) {
		const { setNodeRef, isOver } = useDroppable({ id: `group:${groupKey}` });
		return (
			<div ref={setNodeRef} className={cn(isOver && "ring-1 ring-primary/30")}>
				{children}
			</div>
		);
	}

	const handleAssigneesChange = useCallback(
		async (issueId: Id<"issues">, assigneeIds: string[] | undefined) => {
			try {
				// Convex drops `undefined` keys on the wire, so passing an
				// `undefined` array here would leave the issue's assignees
				// untouched on the server — which is the "can't unassign"
				// bug. The `update` mutation explicitly treats an empty
				// array as "clear both assigneeId and assigneeIds".
				const mappedIds = (assigneeIds ?? []).map((id) => id as Id<"users">);
				await updateIssue({
					issueId,
					assigneeIds: mappedIds,
				});
			} catch {
				toast.error("Failed to update assignees");
			}
		},
		[updateIssue],
	);

	const handleLabelToggle = useCallback(
		async (issueId: Id<"issues">, labelId: Id<"labels">) => {
			const issue = issues.find((i) => i._id === issueId);
			if (!issue) return;
			const currentLabels = issue.labelIds ?? [];
			const newLabels = currentLabels.includes(labelId)
				? currentLabels.filter((id) => id !== labelId)
				: [...currentLabels, labelId];
			try {
				await updateIssue({ issueId, labelIds: newLabels });
			} catch {
				toast.error("Failed to update labels");
			}
		},
		[issues, updateIssue],
	);

	const handleMilestoneChange = useCallback(
		async (issueId: Id<"issues">, milestoneId: string) => {
			try {
				await updateIssue({
					issueId,
					sprintId: milestoneId as Id<"sprints">,
					milestoneId: undefined,
				});
			} catch {
				toast.error("Failed to update sprint");
			}
		},
		[updateIssue],
	);

	const handleEstimateChange = useCallback(
		async (issueId: Id<"issues">, estimate: number | undefined) => {
			try {
				await updateIssue({ issueId, estimate });
			} catch {
				toast.error("Failed to update estimate");
			}
		},
		[updateIssue],
	);

	const handleDueDateChange = useCallback(
		async (issueId: Id<"issues">, dueDate: number | undefined) => {
			try {
				// `undefined` means "clear it" — map to `null` sentinel so the
				// Convex mutation can actually delete the field (undefined keys
				// get stripped from the wire payload).
				await updateIssue({
					issueId,
					dueDate: dueDate === undefined ? null : dueDate,
				});
			} catch {
				toast.error("Failed to update due date");
			}
		},
		[updateIssue],
	);

	const handleProjectChange = useCallback(
		async (issueId: Id<"issues">, newProjectId: string) => {
			try {
				await updateIssue({
					issueId,
					projectId: newProjectId as Id<"projects">,
				});
			} catch {
				toast.error("Failed to update project");
			}
		},
		[updateIssue],
	);

	const handleIssueClick = useCallback(
		(identifier: string) => {
			if (onIssueClick) {
				// Find the issue ID from identifier and call the peek callback
				const issue = issues.find((i) => i.identifier === identifier);
				if (issue) {
					onIssueClick(issue._id);
					return;
				}
			}
			router.push(`/${workspaceSlug}/issues/${identifier}`);
		},
		[router, workspaceSlug, onIssueClick, issues],
	);

	const handleMoveToBacklog = useCallback(
		async (issueId: Id<"issues">) => {
			try {
				await updateIssue({
					issueId,
					sprintId: null,
					listId: null,
				});
				toast.success("Moved to backlog");
			} catch {
				toast.error("Failed to move to backlog");
			}
		},
		[updateIssue],
	);

	const handleDeleteIssue = useCallback(
		async (issueId: Id<"issues">) => {
			const issue = issues.find((i) => i._id === issueId);
			if (!issue) return;
			const ok = window.confirm(
				`Delete ${issue.identifier}? This cannot be undone.`,
			);
			if (!ok) return;
			try {
				await removeIssue({ issueId });
				toast.success("Issue deleted");
				setSelectedIds((prev) => {
					if (!prev.has(issueId as string)) return prev;
					const next = new Set(prev);
					next.delete(issueId as string);
					return next;
				});
			} catch {
				toast.error("Failed to delete issue");
			}
		},
		[issues, removeIssue],
	);

	const toggleGroup = useCallback((groupKey: string) => {
		setCollapsedGroups((prev) => {
			const next = new Set(prev);
			if (next.has(groupKey)) {
				next.delete(groupKey);
			} else {
				next.add(groupKey);
			}
			return next;
		});
	}, []);

	// ── Keyboard navigation ─────────────────────────────────────────────

	useEffect(() => {
		const container = containerRef.current;
		if (!container) return;

		const handleKeyDown = (e: KeyboardEvent) => {
			// Only handle when focus is within the list or on the container
			if (
				!container.contains(document.activeElement) &&
				document.activeElement !== container
			) {
				return;
			}

			// Don't interfere with input elements
			const target = e.target as HTMLElement;
			if (
				target.tagName === "INPUT" ||
				target.tagName === "TEXTAREA" ||
				target.isContentEditable
			) {
				return;
			}

			if (e.key === "j" || e.key === "ArrowDown") {
				e.preventDefault();
				setHighlightedIndex((prev) => {
					const next = Math.min(prev + 1, flatIssueIds.length - 1);
					return next;
				});
			} else if (e.key === "k" || e.key === "ArrowUp") {
				e.preventDefault();
				setHighlightedIndex((prev) => {
					const next = Math.max(prev - 1, 0);
					return next;
				});
			} else if (e.key === "Enter") {
				e.preventDefault();
				if (highlightedIndex >= 0 && highlightedIndex < flatIssueIds.length) {
					const id = flatIssueIds[highlightedIndex];
					const ident = idToIdentifier.get(id as string);
					if (ident) handleIssueClick(ident);
				}
			}
		};

		container.addEventListener("keydown", handleKeyDown);
		return () => container.removeEventListener("keydown", handleKeyDown);
	}, [flatIssueIds, highlightedIndex, handleIssueClick, idToIdentifier]);

	// Scroll highlighted row into view
	useEffect(() => {
		if (highlightedIndex < 0 || highlightedIndex >= flatIssueIds.length) return;
		const issueId = flatIssueIds[highlightedIndex];
		const el = containerRef.current?.querySelector(
			`[data-issue-id="${issueId}"]`,
		);
		if (el) {
			el.scrollIntoView({ block: "nearest" });
		}
	}, [highlightedIndex, flatIssueIds]);

	// ── Resolve assignee/project/milestone/labels per issue ──────────────
	const resolveIssueProps = useCallback(
		(issue: IssueListData) => {
			const sprintLikeId = issue.sprintId ?? issue.milestoneId;
			const effectiveIds =
				issue.assigneeIds && issue.assigneeIds.length > 0
					? issue.assigneeIds
					: issue.assigneeId
						? [issue.assigneeId]
						: [];
			return {
				assignee:
					effectiveIds.length === 1
						? (memberMap.get(effectiveIds[0] as string) ?? null)
						: null,
				projectName: issue.projectId
					? projectMap.get(issue.projectId as string)
					: undefined,
				milestoneName: sprintLikeId
					? milestoneMap.get(sprintLikeId as string)
					: undefined,
			};
		},
		[memberMap, projectMap, milestoneMap],
	);

	// ── Render helpers ──────────────────────────────────────────────────
	const renderColumnHeader = useCallback(() => {
		const columnLabels = new Map(ALL_COLUMNS.map((c) => [c.id, c.label]));
		return (
			<div className="sticky top-0 z-10 flex items-center gap-x-6 h-8 border-b border-border bg-muted/60 text-xs font-medium text-muted-foreground shrink-0">
				<div className="w-[36px] shrink-0 flex items-center justify-center pl-1">
					<Checkbox
						checked={headerCheckboxState}
						onCheckedChange={() => toggleSelectAllVisible()}
						aria-label="Select all visible issues"
					/>
				</div>
				{visibleColumns.map((col) => (
					<div
						key={col}
						className={cn(
							"shrink-0 px-2",
							COLUMN_WIDTHS[col],
							col === "priority" && "flex items-center justify-center",
							col !== "priority" && "truncate",
						)}
					>
						{columnLabels.get(col) ?? col}
					</div>
				))}
			</div>
		);
	}, [visibleColumns, headerCheckboxState, toggleSelectAllVisible]);

	const renderGroupHeader = useCallback(
		(group: GroupedIssues, parentKey?: string) => {
			const key = parentKey ? `${parentKey}::${group.key}` : group.key;
			const isCollapsed = collapsedGroups.has(key);
			const checkboxState = getGroupCheckboxState(group);

			// Row uses the same leading structure as the column header + issue
			// rows (flush left, `gap-x-6`, 36px checkbox column) so every
			// checkbox down the page sits on the same x-offset regardless of
			// nesting depth. Sub-group indentation lives on the *content*
			// block instead, not on the whole row — previously we padded the
			// outer wrapper which also shifted the checkbox to the right.
			return (
				<div
					key={`header-${key}`}
					className="group/header flex items-center gap-x-6 w-full h-8 pr-2 text-xs font-medium text-muted-foreground border-b border-border/30 shrink-0"
				>
					{/* Checkbox column — identical to column header + issue row */}
					<div className="w-[36px] shrink-0 flex items-center justify-center pl-1">
						<Checkbox
							checked={checkboxState}
							onCheckedChange={() => {
								toggleSelectGroup(group);
							}}
							onClick={(e) => e.stopPropagation()}
							aria-label={`Select all issues in ${group.label}`}
						/>
					</div>

					{/* Content — chevron + label + count + quick-create.
					    Indented only when this is a sub-group, so the
					    hierarchy is visible without moving the checkbox. */}
					<div
						className={cn(
							"flex items-center gap-2 flex-1 min-w-0",
							parentKey && "pl-6",
						)}
					>
						<button
							type="button"
							className="flex items-center gap-2 flex-1 hover:bg-muted/40 transition-colors rounded px-1 -mx-1 min-w-0"
							onClick={() => toggleGroup(key)}
						>
							{isCollapsed ? (
								<ChevronRight className="h-3.5 w-3.5 shrink-0" />
							) : (
								<ChevronDown className="h-3.5 w-3.5 shrink-0" />
							)}
							{group.icon}
							<span className="font-medium text-foreground">{group.label}</span>
							<span className="text-muted-foreground ml-auto">
								{group.count}
							</span>
						</button>

						{/* Quick-create with group context */}
						<button
							type="button"
							className="opacity-0 group-hover/header:opacity-100 h-5 w-5 flex items-center justify-center rounded hover:bg-muted transition-all shrink-0"
							onClick={(e) => {
								e.stopPropagation();
								openQuickCreate(buildPresetFromGroup(group.key, parentKey));
							}}
							title={`Create issue in ${group.label}`}
						>
							<Plus className="h-3.5 w-3.5" />
						</button>
					</div>
				</div>
			);
		},
		[
			collapsedGroups,
			toggleGroup,
			getGroupCheckboxState,
			toggleSelectGroup,
			openQuickCreate,
			buildPresetFromGroup,
		],
	);

	function renderIssueRow(issue: IssueListData) {
		const idx = flatIssueIds.indexOf(issue._id);
		const props = resolveIssueProps(issue);
		const issueId = issue._id as string;
		const issueUrl = `/${workspaceSlug}/issues/${issue.identifier}`;

		return (
			<SortableIssueRow key={issue._id} issueId={issueId}>
				<div
					onClickCapture={(e) => {
						// Modifier click selects (like ClickUp). Normal click opens.
						if (e.ctrlKey || e.metaKey || e.shiftKey) {
							e.preventDefault();
							e.stopPropagation();
							handleSelectIssue(issueId, e.shiftKey);
						}
					}}
				>
					<IssueListRow
						issue={issue}
						columns={visibleColumns}
						statusItems={statusItems}
						isHighlighted={idx === highlightedIndex}
						issueUrl={issueUrl}
						onDelete={handleDeleteIssue}
						onMoveToBacklog={handleMoveToBacklog}
						memberOptions={memberOptions}
						labelOptions={labelOptions}
						projectOptions={projectOptions}
						milestoneOptions={getMilestoneOptionsForIssue(
							issue.projectId as string | undefined,
						)}
						assignee={props.assignee}
						projectName={props.projectName}
						milestoneName={props.milestoneName}
						onStatusChange={handleStatusChange}
						onPriorityChange={handlePriorityChange}
						onAssigneeChange={handleAssigneeChange}
						onAssigneesChange={handleAssigneesChange}
						onLabelToggle={handleLabelToggle}
						onMilestoneChange={handleMilestoneChange}
						onEstimateChange={handleEstimateChange}
						onDueDateChange={handleDueDateChange}
						onProjectChange={handleProjectChange}
						bulkSelect={{
							selected: selectedIds.has(issueId),
							onToggle: (shiftKey) => handleSelectIssue(issueId, shiftKey),
						}}
						onClick={() => handleIssueClick(issue.identifier)}
					/>
				</div>
			</SortableIssueRow>
		);
	}

	// ── Empty state ─────────────────────────────────────────────────────
	if (issues.length === 0) {
		return (
			<div className="flex flex-col items-center justify-center py-16 text-center">
				<div className="rounded-full bg-muted p-4 mb-4">
					<CircleDashed className="h-8 w-8 text-muted-foreground" />
				</div>
				<h3 className="text-sm font-medium mb-1">No issues</h3>
				<p className="text-xs text-muted-foreground">
					Create an issue to get started.
				</p>
			</div>
		);
	}

	return (
		<div className="flex flex-col flex-1 min-h-0">
			{/* Filter toolbar — hidden when parent provides its own */}
			{!hideFilter && (
				<div className="flex items-center gap-1 px-6 py-1.5 border-b border-border/30">
					<MyIssuesFilterPopover
						open={showFilters}
						onOpenChange={setShowFilters}
						filters={filters}
						setFilter={setFilter}
						clearAll={clearAllFilters}
						projects={projectOptions.map((p) => ({
							_id: p.id,
							name: p.name,
						}))}
						labels={labelOptions.map((l) => ({
							_id: l._id as string,
							name: l.name,
							color: l.color,
						}))}
						members={memberOptions.map((m) => ({
							id: m.id,
							name: m.name,
						}))}
						milestones={milestoneOptions.map((m) => ({
							id: m.id,
							name: m.name,
						}))}
					/>
				</div>
			)}

			{/* Filter chips — hidden when parent provides its own */}
			{!hideFilter && activeFilterCount > 0 && (
				<IssueFilterChips
					filters={filters}
					setFilter={setFilter}
					clearAll={clearAllFilters}
					projectMap={projectMap}
					labelMap={labelMap}
					memberMap={memberNameMap}
					milestoneMap={milestoneMap}
				/>
			)}

			<div
				ref={containerRef}
				className="flex-1 overflow-y-auto overflow-x-auto outline-none px-6 min-w-0 overscroll-contain"
				role="listbox"
				tabIndex={0}
			>
				<DndContext
					sensors={sensors}
					collisionDetection={closestCenter}
					onDragStart={() => {
						suppressClickRef.current = true;
						setSidebarDragActive(true);
					}}
					onDragEnd={(e) => {
						requestAnimationFrame(() => {
							requestAnimationFrame(() => {
								suppressClickRef.current = false;
							});
						});
						setSidebarDragActive(false);
						handleDragEnd(e);
					}}
					onDragCancel={() => {
						suppressClickRef.current = false;
						setSidebarDragActive(false);
					}}
				>
					<SortableContext
						items={flatIssueIds}
						strategy={verticalListSortingStrategy}
					>
						{renderColumnHeader()}
						{groupedIssues.map((group) => {
							const isCollapsed = collapsedGroups.has(group.key);

							// If groupBy is "none" and there's only one group, skip the header
							if (groupBy === "none") {
								return (
									<div key={group.key}>{group.issues.map(renderIssueRow)}</div>
								);
							}

							return (
								<GroupDropZone key={group.key} groupKey={group.key}>
									{renderGroupHeader(group)}
									{!isCollapsed && (
										<>
											{group.subGroups
												? group.subGroups.map((sub) => {
														const subKey = `${group.key}::${sub.key}`;
														const isSubCollapsed = collapsedGroups.has(subKey);
														return (
															<div key={sub.key}>
																{renderGroupHeader(sub, group.key)}
																{!isSubCollapsed &&
																	sub.issues.map(renderIssueRow)}
																{!isSubCollapsed && sub.issues.length === 0 && (
																	<div className="px-8 py-3 text-xs text-muted-foreground italic">
																		No issues
																	</div>
																)}
															</div>
														);
													})
												: group.issues.map(renderIssueRow)}
											{!group.subGroups && group.issues.length === 0 && (
												<div className="px-4 py-3 text-xs text-muted-foreground italic">
													No issues
												</div>
											)}
										</>
									)}
								</GroupDropZone>
							);
						})}
					</SortableContext>
				</DndContext>
			</div>

			<IssueBulkActionBar
				selectedIds={selectedIds}
				onClearSelection={() => setSelectedIds(new Set())}
				projectId={
					(selectedProjectId as Id<"projects"> | undefined) ?? projectId
				}
				sprintOptions={(allSprints ?? []).map((s) => ({
					id: s._id as string,
					name: s.name,
				}))}
			/>
		</div>
	);
}
