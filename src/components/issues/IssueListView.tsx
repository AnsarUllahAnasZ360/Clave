"use client";

import { useMutation, useQuery } from "convex/react";
import {
	ChevronDown,
	ChevronRight,
	CircleDashed,
	Flag,
	Users,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
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
import type {
	DisplayPropertyId,
	GroupByOption,
	OrderByOption,
	SubGroupByOption,
} from "@/lib/display-options";
import { displayPropertiesToColumns } from "@/lib/display-options";
import {
	DEFAULT_PRIORITIES,
	DEFAULT_STATUSES,
	PRIORITY_ITEMS as PRIORITY_CONFIG,
	PRIORITY_ORDER,
	STATUS_ITEMS as STATUS_CONFIG,
	STATUS_ORDER,
} from "@/lib/issue-config";
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
	{ id: "assignee", label: "Assignee", default: true },
	{ id: "labels", label: "Labels", default: false },
	{ id: "project", label: "Project", default: false },
	{ id: "milestone", label: "Sprint", default: false },
	{ id: "estimate", label: "Time estimate", default: false },
	{ id: "dueDate", label: "Due date", default: true },
];

// Column widths for header alignment (must match IssueListRow)
const COLUMN_WIDTHS: Record<ListColumnId, string> = {
	identifier: "w-[80px]",
	status: "w-[110px]",
	title: "flex-1 min-w-0",
	priority: "w-[32px]",
	assignee: "w-[120px]",
	labels: "w-[120px]",
	project: "w-[120px]",
	milestone: "w-[100px]",
	estimate: "w-[60px]",
	dueDate: "w-[90px]",
};

// ── Status/Priority icons for group headers (from centralized module) ────

const STATUS_ICONS: Record<string, React.ReactNode> = Object.fromEntries(
	DEFAULT_STATUSES.map((s) => {
		const Icon = s.icon;
		return [s.key, <Icon key={s.key} className={`h-4 w-4 ${s.color}`} />];
	}),
);

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
): IssueListData[] {
	const sorted = [...issues];
	switch (sortBy) {
		case "status":
			sorted.sort(
				(a, b) =>
					(STATUS_ORDER[a.status] ?? 99) - (STATUS_ORDER[b.status] ?? 99),
			);
			break;
		case "priority":
			sorted.sort(
				(a, b) =>
					(PRIORITY_ORDER[a.priority] ?? 99) -
					(PRIORITY_ORDER[b.priority] ?? 99),
			);
			break;
		case "created":
			sorted.sort((a, b) => b._creationTime - a._creationTime);
			break;
		case "updated":
			sorted.sort(
				(a, b) =>
					(b.updatedAt ?? b._creationTime) - (a.updatedAt ?? a._creationTime),
			);
			break;
		case "dueDate":
			sorted.sort((a, b) => {
				if (!a.dueDate && !b.dueDate) return 0;
				if (!a.dueDate) return 1;
				if (!b.dueDate) return -1;
				return a.dueDate - b.dueDate;
			});
			break;
		case "manual":
			sorted.sort((a, b) => a.sortOrder - b.sortOrder);
			break;
	}
	return sorted;
}

// ── Grouping ───────────────────────────────────────────────────────────────

function groupIssues(
	issues: IssueListData[],
	groupBy: ListGroupBy,
	memberMap: Map<string, MemberOption>,
	projectMap: Map<string, string>,
	milestoneMap: Map<string, string>,
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
				key = issue.assigneeId ?? "unassigned";
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
		for (const sc of STATUS_CONFIG) {
			const items = groups.get(sc.id);
			if (items) {
				result.push({
					key: sc.id,
					label: sc.label,
					icon: STATUS_ICONS[sc.id],
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
		for (const [key, items] of groups) {
			if (key === "unassigned") continue;
			const member = memberMap.get(key);
			result.push({
				key,
				label: member?.name ?? "Unknown",
				icon: <Users className="h-4 w-4 text-muted-foreground" />,
				count: items.length,
				issues: items,
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
	/** Display properties from display settings — mapped to columns */
	displayProperties?: DisplayPropertyId[];
	/** Hide the internal filter toolbar (when parent already provides one) */
	hideFilter?: boolean;
};

export function IssueListView({
	issues,
	projectId,
	groupBy: groupByProp = "status",
	subGroupBy: subGroupByProp = "none",
	orderBy: orderByProp = "manual",
	displayProperties,
	hideFilter,
}: IssueListViewProps) {
	const { workspaceId, workspaceSlug } = useWorkspace();
	const router = useRouter();

	// ── Filter state ─────────────────────────────────────────────────────
	const {
		filters,
		setFilter,
		clearAll: clearAllFilters,
		activeFilterCount,
		applyFilters,
	} = useIssueFilters();
	const [showFilters, setShowFilters] = useState(false);

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

	// ── Data fetching for resolving names ───────────────────────────────
	const members = useWorkspaceMembers();
	const projects = useWorkspaceProjects();
	const labels = useWorkspaceLabels();
	const allSprints = useQuery(
		api.sprints.listByProject,
		projectId ? { projectId } : "skip",
	);

	// ── Mutations ───────────────────────────────────────────────────────
	const updateIssue = useMutation(api.issues.update);
	const updateStatus = useMutation(api.issues.updateStatus);
	const assignIssue = useMutation(api.issues.assign);

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
		return allSprints.map((m) => ({ id: m._id as string, name: m.name }));
	}, [allSprints]);

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
		() => sortIssues(filteredIssues, sortBy),
		[filteredIssues, sortBy],
	);

	const groupedIssues = useMemo(() => {
		const groups = groupIssues(
			sortedIssues,
			groupBy,
			memberMap,
			projectMap,
			milestoneMap,
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
				);
			}
		}

		return groups;
	}, [sortedIssues, groupBy, subGroupBy, memberMap, projectMap, milestoneMap]);

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
				await updateIssue({ issueId, dueDate });
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
			router.push(`/${workspaceSlug}/issues/${identifier}`);
		},
		[router, workspaceSlug],
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
	const containerRef = useRef<HTMLDivElement>(null);

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
			return {
				assignee: issue.assigneeId
					? (memberMap.get(issue.assigneeId as string) ?? null)
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
			<div
				className="sticky top-0 z-10 flex items-center gap-x-6 h-8 border-b border-border bg-muted/60 text-xs font-medium text-muted-foreground shrink-0"
				role="row"
				tabIndex={-1}
			>
				{visibleColumns.map((col) => (
					<div
						key={col}
						className={cn(
							"shrink-0 px-2",
							COLUMN_WIDTHS[col],
							col === "priority" && "flex items-center justify-center",
							col !== "priority" && "truncate",
						)}
						role="columnheader"
						tabIndex={-1}
					>
						{columnLabels.get(col) ?? col}
					</div>
				))}
			</div>
		);
	}, [visibleColumns]);

	const renderGroupHeader = useCallback(
		(group: GroupedIssues, parentKey?: string) => {
			const key = parentKey ? `${parentKey}::${group.key}` : group.key;
			const isCollapsed = collapsedGroups.has(key);

			return (
				<button
					key={`header-${key}`}
					type="button"
					className={cn(
						"flex items-center gap-2 w-full h-8 px-2 text-xs font-medium text-muted-foreground hover:bg-muted/40 transition-colors border-b border-border/30",
						parentKey && "pl-6",
					)}
					onClick={() => toggleGroup(key)}
				>
					{isCollapsed ? (
						<ChevronRight className="h-3.5 w-3.5 shrink-0" />
					) : (
						<ChevronDown className="h-3.5 w-3.5 shrink-0" />
					)}
					{group.icon}
					<span className="font-medium text-foreground">{group.label}</span>
					<span className="text-muted-foreground">{group.count}</span>
				</button>
			);
		},
		[collapsedGroups, toggleGroup],
	);

	const renderIssueRow = useCallback(
		(issue: IssueListData) => {
			const idx = flatIssueIds.indexOf(issue._id);
			const props = resolveIssueProps(issue);

			return (
				<IssueListRow
					key={issue._id}
					issue={issue}
					columns={visibleColumns}
					isHighlighted={idx === highlightedIndex}
					memberOptions={memberOptions}
					labelOptions={labelOptions}
					projectOptions={projectOptions}
					milestoneOptions={milestoneOptions}
					assignee={props.assignee}
					projectName={props.projectName}
					milestoneName={props.milestoneName}
					onStatusChange={handleStatusChange}
					onPriorityChange={handlePriorityChange}
					onAssigneeChange={handleAssigneeChange}
					onLabelToggle={handleLabelToggle}
					onMilestoneChange={handleMilestoneChange}
					onEstimateChange={handleEstimateChange}
					onDueDateChange={handleDueDateChange}
					onProjectChange={handleProjectChange}
					onClick={() => handleIssueClick(issue.identifier)}
				/>
			);
		},
		[
			flatIssueIds,
			highlightedIndex,
			visibleColumns,
			memberOptions,
			labelOptions,
			projectOptions,
			milestoneOptions,
			resolveIssueProps,
			handleStatusChange,
			handlePriorityChange,
			handleAssigneeChange,
			handleLabelToggle,
			handleMilestoneChange,
			handleEstimateChange,
			handleDueDateChange,
			handleProjectChange,
			handleIssueClick,
		],
	);

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
		<div className="flex flex-col h-full">
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
				className="flex-1 overflow-y-auto overflow-x-hidden outline-none px-6 min-w-0"
				role="listbox"
				tabIndex={0}
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
						<div key={group.key}>
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
														{!isSubCollapsed && sub.issues.map(renderIssueRow)}
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
						</div>
					);
				})}
			</div>
		</div>
	);
}
