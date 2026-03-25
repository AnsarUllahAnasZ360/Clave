"use client";

import { useQuery } from "convex/react";
import {
	BarChart3,
	Calendar,
	ChevronDown,
	ChevronRight,
	CircleCheck,
	CircleDashed,
	CircleX,
	ClipboardList,
	Diamond,
	Flag,
	SignalHigh,
	Timer,
	TriangleAlert,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { formatEstimate } from "@/components/issues/IssueListRow";
import { useWorkspace } from "@/components/providers/workspace-context";
import {
	useWorkspaceLabels,
	useWorkspaceMembers,
	useWorkspaceProjects,
} from "@/components/providers/workspace-data-context";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Skeleton } from "@/components/ui/skeleton";
import { useDisplayOptions } from "@/hooks/use-display-options";
import { useShortcutsOptional } from "@/hooks/use-shortcuts";
import type { DisplayPropertyId, GroupByOption } from "@/lib/display-options";
import { type FocusGroup, groupByFocus } from "@/lib/focus-grouping";
import {
	DEFAULT_ISSUE_TYPES,
	DEFAULT_PRIORITIES,
	DEFAULT_STATUSES,
} from "@/lib/issue-config";
import { cn } from "@/lib/utils";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { DisplayOptionsPanel } from "./DisplayOptionsPanel";
import type { IssueCardData } from "./IssueBoardCard";
import { IssueBoardView } from "./IssueBoardView";
import { IssuePreviewSidebar } from "./IssuePreviewSidebar";
import {
	IssueFilterChips,
	MyIssuesFilterPopover,
	useIssueFilters,
} from "./MyIssuesFilterPopover";
import { MyIssuesInsightsPanel } from "./MyIssuesInsightsPanel";

// ── Tab types ───────────────────────────────────────────────────────────────

type MyIssuesTab = "assigned" | "created" | "subscribed" | "activity";

const TAB_OPTIONS: { id: MyIssuesTab; label: string }[] = [
	{ id: "assigned", label: "Assigned" },
	{ id: "created", label: "Created" },
	{ id: "subscribed", label: "Subscribed" },
	{ id: "activity", label: "Activity" },
];

// ── Status / Priority config (derived from centralized module) ───────────

const STATUS_ICONS: Record<string, React.ReactNode> = Object.fromEntries(
	DEFAULT_STATUSES.map((s) => {
		const Icon = s.icon;
		return [s.key, <Icon key={s.key} className={`h-4 w-4 ${s.color}`} />];
	}),
);

const STATUS_LABELS: Record<string, string> = Object.fromEntries(
	DEFAULT_STATUSES.map((s) => [s.key, s.name]),
);

const PRIORITY_ICONS: Record<string, React.ReactNode> = Object.fromEntries(
	DEFAULT_PRIORITIES.map((p) => {
		const Icon = p.icon;
		return [p.key, <Icon key={p.key} className={`h-3.5 w-3.5 ${p.color}`} />];
	}),
);

const FOCUS_GROUP_ICONS: Record<FocusGroup, React.ReactNode> = {
	urgent: <SignalHigh className="h-4 w-4 text-red-500" />,
	blocking: <Flag className="h-4 w-4 text-orange-500" />,
	milestone: <Diamond className="h-4 w-4 text-blue-500" />,
	active: <Timer className="h-4 w-4 text-yellow-500" />,
	triage: <TriangleAlert className="h-4 w-4 text-orange-500" />,
	backlog: <CircleDashed className="h-4 w-4 text-muted-foreground" />,
	done: <CircleCheck className="h-4 w-4 text-emerald-500" />,
	cancelled: <CircleX className="h-4 w-4 text-muted-foreground" />,
};

// ── Type badge config (derived from centralized module) ──────────────────

const TYPE_BADGE_BG: Record<string, string> = {
	bug: "bg-red-500/10",
	feature: "bg-violet-500/10",
	improvement: "bg-blue-500/10",
	issue: "bg-muted/50",
};

const TYPE_CONFIG: Record<
	string,
	{ label: string; icon: React.ReactNode; className: string }
> = Object.fromEntries(
	DEFAULT_ISSUE_TYPES.map((t) => {
		const Icon = t.icon;
		return [
			t.key,
			{
				label: t.name,
				icon: <Icon className="h-3 w-3" />,
				className: `${t.color} ${TYPE_BADGE_BG[t.key] ?? "bg-muted/50"}`,
			},
		];
	}),
);

// ── Types ──────────────────────────────────────────────────────────────────

type IssueData = {
	_id: Id<"issues">;
	_creationTime: number;
	identifier: string;
	title: string;
	status: string;
	priority: string;
	type?: string;
	assigneeId?: Id<"users">;
	projectId?: Id<"projects">;
	sprintId?: Id<"sprints">;
	milestoneId?: Id<"milestones">;
	labelIds?: Id<"labels">[];
	dueDate?: number;
	estimate?: number;
	createdBy: Id<"users">;
};

type LabelData = {
	_id: Id<"labels">;
	name: string;
	color: string;
};

type GroupedSection = {
	key: string;
	label: string;
	icon?: React.ReactNode;
	issues: IssueData[];
};

// ── Adapter: IssueData -> IssueCardData for board view ──────────────────────

function toCardData(issues: IssueData[]): IssueCardData[] {
	return issues.map((issue, index) => ({
		_id: issue._id,
		identifier: issue.identifier,
		title: issue.title,
		status: issue.status,
		priority: issue.priority,
		assigneeId: issue.assigneeId,
		labelIds: issue.labelIds,
		dueDate: issue.dueDate,
		estimate: issue.estimate,
		sortOrder: issue._creationTime + index,
		projectId: issue.projectId,
		sprintId: issue.sprintId,
		milestoneId: issue.milestoneId,
	}));
}

function toBoardDisplayProperties(
	ids: DisplayPropertyId[],
): Record<string, boolean> {
	const props: Record<string, boolean> = {};
	for (const id of ids) {
		props[id] = true;
	}
	return props;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function getDueDateColor(dueDate: number): string {
	const now = Date.now();
	const msInDay = 86_400_000;
	if (dueDate < now) return "text-red-500";
	if (dueDate - now < 3 * msInDay) return "text-orange-500";
	return "text-muted-foreground";
}

function formatDueDate(timestamp: number): string {
	const date = new Date(timestamp);
	const months = [
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
	return `${months[date.getMonth()]} ${date.getDate()}`;
}

// ── Grouping logic ─────────────────────────────────────────────────────────

function groupIssuesByStatus(issues: IssueData[]): GroupedSection[] {
	const statusOrder = [
		"triage",
		"backlog",
		"todo",
		"in_progress",
		"in_review",
		"done",
		"cancelled",
	];
	const groups = new Map<string, IssueData[]>();
	for (const s of statusOrder) groups.set(s, []);
	for (const issue of issues) {
		const arr = groups.get(issue.status);
		if (arr) arr.push(issue);
	}
	return statusOrder
		.filter((s) => (groups.get(s)?.length ?? 0) > 0)
		.map((s) => ({
			key: s,
			label: STATUS_LABELS[s] ?? s,
			icon: STATUS_ICONS[s],
			issues: groups.get(s) ?? [],
		}));
}

function groupIssuesByPriority(issues: IssueData[]): GroupedSection[] {
	const priorityOrder = ["urgent", "high", "medium", "low", "no_priority"];
	const labels: Record<string, string> = {
		urgent: "Urgent",
		high: "High",
		medium: "Medium",
		low: "Low",
		no_priority: "No priority",
	};
	const groups = new Map<string, IssueData[]>();
	for (const p of priorityOrder) groups.set(p, []);
	for (const issue of issues) {
		const arr = groups.get(issue.priority);
		if (arr) arr.push(issue);
	}
	return priorityOrder
		.filter((p) => (groups.get(p)?.length ?? 0) > 0)
		.map((p) => ({
			key: p,
			label: labels[p] ?? p,
			icon: PRIORITY_ICONS[p],
			issues: groups.get(p) ?? [],
		}));
}

function groupIssuesByProject(
	issues: IssueData[],
	projectMap: Map<string, string>,
): GroupedSection[] {
	const groups = new Map<string, IssueData[]>();
	for (const issue of issues) {
		const key = issue.projectId ?? "no_project";
		if (!groups.has(key)) groups.set(key, []);
		groups.get(key)?.push(issue);
	}
	return Array.from(groups.entries())
		.sort(([a], [b]) => {
			if (a === "no_project") return 1;
			if (b === "no_project") return -1;
			return (projectMap.get(a) ?? "").localeCompare(projectMap.get(b) ?? "");
		})
		.map(([key, groupIssues]) => ({
			key,
			label: key === "no_project" ? "No project" : (projectMap.get(key) ?? key),
			issues: groupIssues,
		}));
}

function groupIssuesByMilestone(
	issues: IssueData[],
	milestoneMap: Map<string, string>,
): GroupedSection[] {
	const groups = new Map<string, IssueData[]>();
	for (const issue of issues) {
		const key = issue.sprintId ?? issue.milestoneId ?? "no_milestone";
		if (!groups.has(key)) groups.set(key, []);
		groups.get(key)?.push(issue);
	}
	return Array.from(groups.entries())
		.sort(([a], [b]) => {
			if (a === "no_milestone") return 1;
			if (b === "no_milestone") return -1;
			return (milestoneMap.get(a) ?? "").localeCompare(
				milestoneMap.get(b) ?? "",
			);
		})
		.map(([key, groupIssues]) => ({
			key,
			label:
				key === "no_milestone" ? "No sprint" : (milestoneMap.get(key) ?? key),
			icon:
				key !== "no_milestone" ? (
					<Diamond className="h-4 w-4 text-blue-500" />
				) : undefined,
			issues: groupIssues,
		}));
}

function groupIssuesByAssignee(
	issues: IssueData[],
	memberMap: Map<string, { name: string; image?: string }>,
): GroupedSection[] {
	const groups = new Map<string, IssueData[]>();
	for (const issue of issues) {
		const key = issue.assigneeId ?? "unassigned";
		if (!groups.has(key)) groups.set(key, []);
		groups.get(key)?.push(issue);
	}
	return Array.from(groups.entries())
		.sort(([a], [b]) => {
			if (a === "unassigned") return 1;
			if (b === "unassigned") return -1;
			return (memberMap.get(a)?.name ?? "").localeCompare(
				memberMap.get(b)?.name ?? "",
			);
		})
		.map(([key, groupIssues]) => ({
			key,
			label:
				key === "unassigned" ? "Unassigned" : (memberMap.get(key)?.name ?? key),
			issues: groupIssues,
		}));
}

// ── Issue Row Component ────────────────────────────────────────────────────

function IssueRow({
	issue,
	isHighlighted,
	onClick,
	onNavigate,
	memberMap,
	projectMap,
	labelMap,
	displayProperties,
	workspaceSlug,
}: {
	issue: IssueData;
	isHighlighted: boolean;
	onClick: () => void;
	onNavigate: () => void;
	memberMap: Map<string, { name: string; image?: string }>;
	projectMap: Map<string, string>;
	labelMap: Map<string, LabelData>;
	displayProperties: DisplayPropertyId[];
	workspaceSlug: string;
}) {
	const assignee = issue.assigneeId
		? memberMap.get(issue.assigneeId)
		: undefined;
	const projectName = issue.projectId
		? projectMap.get(issue.projectId)
		: undefined;
	const initials = assignee?.name
		? assignee.name
				.split(" ")
				.map((n) => n[0])
				.join("")
				.toUpperCase()
				.slice(0, 2)
		: "?";

	const showLabels = displayProperties.includes("labels");
	const showProject = displayProperties.includes("project");
	const showDueDate = displayProperties.includes("dueDate");
	const showEstimate = displayProperties.includes("estimate");
	const showPriority = displayProperties.includes("priority");
	const showAssignee = displayProperties.includes("assignee");

	// Resolve labels for this issue
	const issueLabels = useMemo(() => {
		if (!showLabels || !issue.labelIds?.length) return [];
		return issue.labelIds
			.map((id) => labelMap.get(id))
			.filter((l): l is LabelData => l !== undefined);
	}, [showLabels, issue.labelIds, labelMap]);

	// Type badge
	const typeConfig =
		issue.type && issue.type !== "issue" ? TYPE_CONFIG[issue.type] : undefined;

	return (
		<Link
			href={`/${workspaceSlug}/issues/${issue.identifier}`}
			prefetch={false}
			onClick={(e) => {
				e.preventDefault();
				onClick();
			}}
			onDoubleClick={(e) => {
				e.preventDefault();
				onNavigate();
			}}
			className={cn(
				"group flex items-center gap-3 px-4 py-2 border-b border-border/30 hover:bg-muted/50 transition-colors cursor-pointer",
				isHighlighted && "ring-1 ring-primary/50 bg-muted/40",
			)}
		>
			{/* Status icon */}
			<span className="shrink-0">{STATUS_ICONS[issue.status]}</span>

			{/* Identifier */}
			<span className="shrink-0 font-mono text-xs text-muted-foreground w-[72px]">
				{issue.identifier}
			</span>

			{/* Title */}
			<span className="flex-1 text-sm truncate min-w-0">{issue.title}</span>

			{/* Type badge */}
			{typeConfig && (
				<span
					className={cn(
						"hidden sm:inline-flex items-center gap-1 shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium",
						typeConfig.className,
					)}
				>
					{typeConfig.icon}
					{typeConfig.label}
				</span>
			)}

			{/* Labels */}
			{showLabels && issueLabels.length > 0 && (
				<span className="hidden md:flex items-center gap-1.5 shrink-0 max-w-[160px]">
					{issueLabels.slice(0, 2).map((label) => (
						<span
							key={label._id}
							className="inline-flex items-center gap-1 text-[11px] text-muted-foreground truncate"
						>
							<span
								className="h-2 w-2 rounded-full shrink-0"
								style={{ backgroundColor: label.color }}
							/>
							<span className="truncate max-w-[56px]">{label.name}</span>
						</span>
					))}
					{issueLabels.length > 2 && (
						<span className="text-[10px] text-muted-foreground">
							+{issueLabels.length - 2}
						</span>
					)}
				</span>
			)}

			{/* Project name */}
			{showProject && projectName && (
				<span className="hidden sm:block shrink-0 text-xs text-muted-foreground max-w-[120px] truncate">
					{projectName}
				</span>
			)}

			{/* Due date */}
			{showDueDate && issue.dueDate && (
				<span
					className={cn(
						"hidden sm:inline-flex items-center gap-1 shrink-0 text-xs",
						getDueDateColor(issue.dueDate),
					)}
				>
					<Calendar className="h-3 w-3" />
					{formatDueDate(issue.dueDate)}
				</span>
			)}

			{/* Estimate */}
			{showEstimate && issue.estimate && (
				<span className="hidden sm:inline-flex items-center shrink-0 rounded bg-muted/60 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground tabular-nums">
					{formatEstimate(issue.estimate)}
				</span>
			)}

			{/* Priority */}
			{showPriority && (
				<span className="shrink-0">{PRIORITY_ICONS[issue.priority]}</span>
			)}

			{/* Assignee */}
			{showAssignee && assignee && (
				<Avatar className="h-5 w-5 shrink-0">
					<AvatarImage src={assignee.image} />
					<AvatarFallback className="text-[9px]">{initials}</AvatarFallback>
				</Avatar>
			)}
		</Link>
	);
}

// ── Collapsible Group Header ───────────────────────────────────────────────

function GroupHeader({
	label,
	icon,
	count,
	isCollapsed,
	onToggle,
}: {
	label: string;
	icon?: React.ReactNode;
	count: number;
	isCollapsed: boolean;
	onToggle: () => void;
}) {
	return (
		<button
			type="button"
			onClick={onToggle}
			className="flex items-center gap-2 px-4 py-2 w-full text-left hover:bg-muted/30 transition-colors border-b border-border/40 bg-muted/20"
		>
			{isCollapsed ? (
				<ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
			) : (
				<ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
			)}
			{icon}
			<span className="text-sm font-medium">{label}</span>
			<span className="text-xs text-muted-foreground ml-1">{count}</span>
		</button>
	);
}

// ── Grouped Issue List ─────────────────────────────────────────────────────

function GroupedIssueList({
	sections,
	highlightedIndex,
	flatIssues,
	memberMap,
	projectMap,
	labelMap,
	displayProperties,
	workspaceSlug,
	onIssueClick,
	onIssueNavigate,
}: {
	sections: GroupedSection[];
	highlightedIndex: number;
	flatIssues: IssueData[];
	memberMap: Map<string, { name: string; image?: string }>;
	projectMap: Map<string, string>;
	labelMap: Map<string, LabelData>;
	displayProperties: DisplayPropertyId[];
	workspaceSlug: string;
	onIssueClick: (issueId: Id<"issues">) => void;
	onIssueNavigate: (identifier: string) => void;
}) {
	const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

	const toggleGroup = useCallback((key: string) => {
		setCollapsed((prev) => {
			const next = new Set(prev);
			if (next.has(key)) next.delete(key);
			else next.add(key);
			return next;
		});
	}, []);

	return (
		<div>
			{sections.map((section) => (
				<div key={section.key}>
					<GroupHeader
						label={section.label}
						icon={section.icon}
						count={section.issues.length}
						isCollapsed={collapsed.has(section.key)}
						onToggle={() => toggleGroup(section.key)}
					/>
					{!collapsed.has(section.key) &&
						section.issues.map((issue) => {
							const flatIndex = flatIssues.findIndex(
								(i) => i._id === issue._id,
							);
							return (
								<IssueRow
									key={issue._id}
									issue={issue}
									isHighlighted={flatIndex === highlightedIndex}
									onClick={() => onIssueClick(issue._id)}
									onNavigate={() => onIssueNavigate(issue.identifier)}
									memberMap={memberMap}
									projectMap={projectMap}
									labelMap={labelMap}
									displayProperties={displayProperties}
									workspaceSlug={workspaceSlug}
								/>
							);
						})}
				</div>
			))}
		</div>
	);
}

// ── Tab Content Component ──────────────────────────────────────────────────

function IssueTabContent({
	issues,
	groupBy,
	displayProperties,
	blockingIssueIds,
	memberMap,
	projectMap,
	milestoneMap,
	labelMap,
	workspaceSlug,
	onSelectIssue,
}: {
	issues: IssueData[] | undefined;
	groupBy: GroupByOption;
	displayProperties: DisplayPropertyId[];
	blockingIssueIds: Set<string>;
	memberMap: Map<string, { name: string; image?: string }>;
	projectMap: Map<string, string>;
	milestoneMap: Map<string, string>;
	labelMap: Map<string, LabelData>;
	workspaceSlug: string;
	onSelectIssue?: (issueId: Id<"issues">) => void;
}) {
	const [highlightedIndex, setHighlightedIndex] = useState(-1);
	const containerRef = useRef<HTMLDivElement>(null);
	const router = useRouter();
	const shortcuts = useShortcutsOptional();

	const sections = useMemo<GroupedSection[]>(() => {
		if (!issues) return [];

		switch (groupBy) {
			case "focus": {
				const focusGroups = groupByFocus(issues, blockingIssueIds);
				return focusGroups.map((fg) => ({
					key: fg.group,
					label: fg.label,
					icon: FOCUS_GROUP_ICONS[fg.group],
					issues: fg.issues as IssueData[],
				}));
			}
			case "status":
				return groupIssuesByStatus(issues);
			case "priority":
				return groupIssuesByPriority(issues);
			case "project":
				return groupIssuesByProject(issues, projectMap);
			case "milestone":
				return groupIssuesByMilestone(issues, milestoneMap);
			case "assignee":
				return groupIssuesByAssignee(issues, memberMap);
			case "none":
				return [{ key: "all", label: "All issues", issues }];
			default:
				return [{ key: "all", label: "All issues", issues }];
		}
	}, [issues, groupBy, blockingIssueIds, projectMap, milestoneMap, memberMap]);

	const flatIssues = useMemo(
		() => sections.flatMap((s) => s.issues),
		[sections],
	);

	const handleIssueNavigate = useCallback(
		(identifier: string) => {
			router.push(`/${workspaceSlug}/issues/${identifier}`);
		},
		[router, workspaceSlug],
	);

	const handleIssueSelect = useCallback(
		(issueId: Id<"issues">) => {
			if (onSelectIssue) {
				onSelectIssue(issueId);
			} else {
				const issue = flatIssues.find((i) => i._id === issueId);
				if (issue) handleIssueNavigate(issue.identifier);
			}
		},
		[onSelectIssue, handleIssueNavigate, flatIssues],
	);

	// Sync active issue with shortcut provider for S/A/P/L shortcuts
	useEffect(() => {
		const activeIssue =
			highlightedIndex >= 0 ? flatIssues[highlightedIndex] : null;
		shortcuts?.setActiveIssueId(activeIssue?._id ?? null);
		return () => shortcuts?.setActiveIssueId(null);
	}, [highlightedIndex, flatIssues, shortcuts]);

	// J/K keyboard navigation
	useEffect(() => {
		const container = containerRef.current;
		if (!container) return;

		function handleKeyDown(e: KeyboardEvent) {
			const target = e.target as HTMLElement;
			if (
				target.tagName === "INPUT" ||
				target.tagName === "TEXTAREA" ||
				target.isContentEditable
			)
				return;

			if (e.key === "j" || e.key === "ArrowDown") {
				e.preventDefault();
				setHighlightedIndex((prev) =>
					Math.min(prev + 1, flatIssues.length - 1),
				);
			} else if (e.key === "k" || e.key === "ArrowUp") {
				e.preventDefault();
				setHighlightedIndex((prev) => Math.max(prev - 1, 0));
			} else if (e.key === "Enter" && highlightedIndex >= 0) {
				e.preventDefault();
				const issue = flatIssues[highlightedIndex];
				if (issue) handleIssueNavigate(issue.identifier);
			}
		}

		document.addEventListener("keydown", handleKeyDown);
		return () => document.removeEventListener("keydown", handleKeyDown);
	}, [flatIssues, highlightedIndex, handleIssueNavigate]);

	if (!issues) {
		return (
			<div className="p-4 space-y-3">
				<Skeleton className="h-10 w-full" />
				<Skeleton className="h-10 w-full" />
				<Skeleton className="h-10 w-full" />
			</div>
		);
	}

	if (issues.length === 0) {
		return (
			<div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
				<ClipboardList className="h-10 w-10 mb-3 opacity-40" />
				<p className="text-sm">No issues to show</p>
			</div>
		);
	}

	return (
		<div ref={containerRef}>
			<div className="flex items-center justify-end px-4 py-1.5 border-b border-border/40">
				<span className="text-xs text-muted-foreground">
					{issues.length} issue{issues.length !== 1 ? "s" : ""}
				</span>
			</div>
			<GroupedIssueList
				sections={sections}
				highlightedIndex={highlightedIndex}
				flatIssues={flatIssues}
				memberMap={memberMap}
				projectMap={projectMap}
				labelMap={labelMap}
				displayProperties={displayProperties}
				workspaceSlug={workspaceSlug}
				onIssueClick={handleIssueSelect}
				onIssueNavigate={handleIssueNavigate}
			/>
		</div>
	);
}

// ── Main Page Component ────────────────────────────────────────────────────

export function MyIssuesPage() {
	const { workspaceId, workspaceSlug } = useWorkspace();

	// Tab state
	const [activeTab, setActiveTab] = useState<MyIssuesTab>("assigned");

	// Toolbar toggle states (placeholders for future panels)
	const [showFilters, setShowFilters] = useState(false);
	const [showInsights, setShowInsights] = useState(false);

	// Selected issue for preview sidebar
	const [selectedIssueId, setSelectedIssueId] = useState<Id<"issues"> | null>(
		null,
	);

	// Display options (persisted per view context)
	const {
		options: displayOptions,
		setLayout,
		setGroupBy,
		setSubGroupBy,
		setOrderBy,
		setOrderDirection,
		toggleDisplayProperty,
		setShowSubIssues,
		setShowEmptyGroups,
		setSwimlaneSetting,
		reset: resetDisplayOptions,
	} = useDisplayOptions("my-issues");

	// Issue filters
	const {
		filters,
		setFilter,
		clearAll: clearAllFilters,
		activeFilterCount,
		applyFilters,
	} = useIssueFilters();

	// Queries for each tab
	const assignedIssues = useQuery(api.issues.myIssuesAssigned, { workspaceId });
	const createdIssues = useQuery(api.issues.myIssuesCreated, { workspaceId });
	const subscribedIssues = useQuery(api.issues.myIssuesSubscribed, {
		workspaceId,
	});
	const activityIssues = useQuery(api.issues.myIssuesActivity, {
		workspaceId,
	});

	// Lookup data
	const members = useWorkspaceMembers();
	const projects = useWorkspaceProjects();
	const labels = useWorkspaceLabels();
	const workspaceSprints = useQuery(api.sprints.listByWorkspace, {
		workspaceId,
	});

	// Build member lookup map
	const memberMap = useMemo(() => {
		const map = new Map<string, { name: string; image?: string }>();
		if (members) {
			for (const m of members) {
				map.set(m.userId, {
					name: m.user?.name ?? "Unknown",
					image: m.user?.avatarUrl ?? m.user?.image ?? undefined,
				});
			}
		}
		return map;
	}, [members]);

	// Build project lookup map
	const projectMap = useMemo(() => {
		const map = new Map<string, string>();
		if (projects) {
			for (const p of projects) {
				map.set(p._id, p.name);
			}
		}
		return map;
	}, [projects]);

	// Build label lookup map
	const labelMap = useMemo(() => {
		const map = new Map<string, LabelData>();
		if (labels) {
			for (const l of labels) {
				map.set(l._id, { _id: l._id, name: l.name, color: l.color });
			}
		}
		return map;
	}, [labels]);

	// Build sprint lookup map
	const milestoneMap = useMemo(() => {
		const map = new Map<string, string>();
		if (workspaceSprints) {
			for (const sprint of workspaceSprints) {
				map.set(sprint._id, sprint.name);
			}
		}
		return map;
	}, [workspaceSprints]);

	// Tab counts
	const tabCounts: Record<MyIssuesTab, number> = {
		assigned: assignedIssues?.length ?? 0,
		created: createdIssues?.length ?? 0,
		subscribed: subscribedIssues?.length ?? 0,
		activity: activityIssues?.length ?? 0,
	};

	// Active tab issues
	const activeIssues: Record<MyIssuesTab, IssueData[] | undefined> = {
		assigned: assignedIssues as IssueData[] | undefined,
		created: createdIssues as IssueData[] | undefined,
		subscribed: subscribedIssues as IssueData[] | undefined,
		activity: activityIssues as IssueData[] | undefined,
	};

	const activeIssueIds = useMemo(() => {
		const selectedIssues =
			activeTab === "assigned"
				? assignedIssues
				: activeTab === "created"
					? createdIssues
					: activeTab === "subscribed"
						? subscribedIssues
						: activityIssues;

		return (selectedIssues ?? []).map((issue) => issue._id);
	}, [
		activeTab,
		assignedIssues,
		createdIssues,
		subscribedIssues,
		activityIssues,
	]);
	const blockingIssueIdsRaw = useQuery(
		api.issueRelations.blockingIssueIdsForIssues,
		activeIssueIds.length > 0
			? { issueIds: activeIssueIds as Id<"issues">[] }
			: "skip",
	);
	const blockingIssueIds = useMemo(
		() =>
			new Set<string>((blockingIssueIdsRaw ?? []).map((id) => id as string)),
		[blockingIssueIdsRaw],
	);

	const isLoading =
		assignedIssues === undefined &&
		createdIssues === undefined &&
		subscribedIssues === undefined &&
		activityIssues === undefined;

	if (isLoading) {
		return (
			<div className="flex flex-1 flex-col min-h-0 bg-background border border-border rounded-lg min-w-0 overflow-hidden">
				<div className="sticky top-0 z-10 bg-background flex items-center gap-2 px-4 py-1.5 border-b border-border/70">
					<SidebarTrigger className="h-7 w-7 rounded-lg hover:bg-accent text-muted-foreground" />
					<Skeleton className="h-4 w-4 rounded" />
					<Skeleton className="h-4 w-24" />
				</div>
				<div className="p-4 space-y-3">
					<Skeleton className="h-10 w-full" />
					<Skeleton className="h-10 w-full" />
					<Skeleton className="h-10 w-full" />
				</div>
			</div>
		);
	}

	return (
		<div className="flex flex-1 flex-col min-h-0 bg-background border border-border rounded-lg min-w-0 overflow-hidden">
			{/* ── Row 1: Title + Tab pills ────────────────────────────── */}
			<div className="sticky top-0 z-10 bg-background shrink-0 border-b border-border/70">
				<div className="flex items-center gap-2 px-4 py-1.5">
					<SidebarTrigger className="h-7 w-7 rounded-lg hover:bg-accent text-muted-foreground shrink-0" />
					<ClipboardList className="h-4 w-4 text-muted-foreground shrink-0" />
					<h1 className="text-sm font-medium text-foreground whitespace-nowrap">
						My issues
					</h1>

					{/* Spacer */}
					<div className="flex-1" />

					{/* Tab pills */}
					<div className="flex items-center gap-0.5 p-0">
						{TAB_OPTIONS.map((tab) => (
							<button
								key={tab.id}
								type="button"
								onClick={() => setActiveTab(tab.id)}
								className={cn(
									"inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
									activeTab === tab.id
										? "bg-muted text-foreground shadow-sm"
										: "text-muted-foreground hover:text-foreground hover:bg-muted/50",
								)}
							>
								{tab.label}
								{tabCounts[tab.id] > 0 && (
									<span
										className={cn(
											"text-[10px] tabular-nums",
											activeTab === tab.id
												? "text-muted-foreground"
												: "text-muted-foreground/70",
										)}
									>
										{tabCounts[tab.id]}
									</span>
								)}
							</button>
						))}
					</div>
				</div>
			</div>

			{/* ── Row 2: Toolbar — Filter, Display, Insights ─────────── */}
			<div className="flex items-center gap-1.5 px-4 py-1.5 border-b border-border/40 bg-muted/20 shrink-0">
				<MyIssuesFilterPopover
					open={showFilters}
					onOpenChange={setShowFilters}
					filters={filters}
					setFilter={setFilter}
					clearAll={clearAllFilters}
					projects={(projects ?? []).map((p) => ({
						_id: p._id as string,
						name: p.name,
					}))}
					labels={(labels ?? []).map((l) => ({
						_id: l._id as string,
						name: l.name,
						color: l.color,
					}))}
					members={(members ?? []).map((m) => ({
						id: m.userId as string,
						name: m.user?.name ?? m.user?.email ?? "Unknown",
					}))}
					milestones={(workspaceSprints ?? []).map((s) => ({
						id: s._id as string,
						name: s.name,
					}))}
				/>
				<DisplayOptionsPanel
					layout={displayOptions.layout}
					groupBy={displayOptions.groupBy}
					subGroupBy={displayOptions.subGroupBy}
					orderBy={displayOptions.orderBy}
					orderDirection={displayOptions.orderDirection}
					displayProperties={displayOptions.displayProperties}
					showSubIssues={displayOptions.showSubIssues}
					showEmptyGroups={displayOptions.showEmptyGroups}
					swimlaneBy={displayOptions.swimlaneBy}
					onLayoutChange={setLayout}
					onGroupByChange={setGroupBy}
					onSubGroupByChange={setSubGroupBy}
					onOrderByChange={setOrderBy}
					onOrderDirectionChange={setOrderDirection}
					onDisplayPropertyToggle={toggleDisplayProperty}
					onShowSubIssuesChange={setShowSubIssues}
					onShowEmptyGroupsChange={setShowEmptyGroups}
					onSwimlaneSetting={setSwimlaneSetting}
					onReset={resetDisplayOptions}
					availableLayouts={["board", "list"]}
				/>

				{/* Spacer pushes insights to the right */}
				<div className="flex-1" />

				<Button
					variant="ghost"
					size="sm"
					onClick={() => setShowInsights((v) => !v)}
					className={cn(
						"h-7 gap-1.5 text-xs text-muted-foreground",
						showInsights && "bg-muted text-foreground",
					)}
				>
					<BarChart3 className="h-3.5 w-3.5" />
					Insights
				</Button>
			</div>

			{/* Filter chips (shown when active filters exist) */}
			{activeFilterCount > 0 && (
				<IssueFilterChips
					filters={filters}
					setFilter={setFilter}
					clearAll={clearAllFilters}
					projectMap={projectMap}
					labelMap={labelMap as Map<string, { name: string; color: string }>}
					memberMap={
						new Map(
							Array.from(memberMap.entries()).map(([k, v]) => [k, v.name]),
						)
					}
					milestoneMap={milestoneMap}
				/>
			)}

			{/* ── Main content area + sidebar panels ─────────────────── */}
			<div className="flex flex-1 min-h-0 min-w-0 overflow-hidden">
				{/* Board / List content — must shrink when insights panel opens */}
				<div
					className={cn(
						"flex-1 min-h-0 min-w-0",
						displayOptions.layout === "board"
							? "flex flex-col overflow-hidden"
							: "overflow-auto",
					)}
				>
					{displayOptions.layout === "board" ? (
						<IssueBoardView
							externalIssues={
								activeIssues[activeTab]
									? toCardData(
											applyFilters(activeIssues[activeTab] as IssueData[]),
										)
									: undefined
							}
							displayProperties={toBoardDisplayProperties(
								displayOptions.displayProperties,
							)}
							swimlaneBy={displayOptions.swimlaneBy}
							onIssueClick={(id) => setSelectedIssueId(id as Id<"issues">)}
						/>
					) : (
						<IssueTabContent
							issues={
								activeIssues[activeTab]
									? applyFilters(activeIssues[activeTab] as IssueData[])
									: undefined
							}
							groupBy={displayOptions.groupBy}
							displayProperties={displayOptions.displayProperties}
							blockingIssueIds={blockingIssueIds}
							memberMap={memberMap}
							projectMap={projectMap}
							milestoneMap={milestoneMap}
							labelMap={labelMap}
							workspaceSlug={workspaceSlug}
							onSelectIssue={setSelectedIssueId}
						/>
					)}
				</div>

				{/* Preview sidebar */}
				{selectedIssueId && (
					<IssuePreviewSidebar
						issueId={selectedIssueId}
						onClose={() => setSelectedIssueId(null)}
					/>
				)}

				{/* Insights panel — sits beside the board, doesn't overlap */}
				{showInsights && activeIssues[activeTab] && (
					<MyIssuesInsightsPanel
						issues={activeIssues[activeTab]}
						onClose={() => setShowInsights(false)}
					/>
				)}
			</div>
		</div>
	);
}
