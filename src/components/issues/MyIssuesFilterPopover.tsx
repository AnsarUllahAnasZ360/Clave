"use client";

import { X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useWorkspaceOptional } from "@/components/providers/workspace-context";
import { useWorkspaceProjects } from "@/components/providers/workspace-data-context";
import { Button } from "@/components/ui/button";
import {
	FilterEmptyState,
	FilterHighlightItem,
	FilterOptionItem,
	UnifiedFilterPopover,
} from "@/components/unified-filter-popover";
import {
	useEffectiveIssueConfig,
	useProjectsEffectiveConfigs,
} from "@/hooks/use-effective-issue-config";
import {
	DEFAULT_PRIORITIES,
	PRIORITY_LABELS,
	STATUS_CATEGORY_COLUMN_CONFIG,
	STATUS_CATEGORY_LABELS,
	STATUS_CATEGORY_ORDER,
	type StatusCategory,
} from "@/lib/issue-config";
import type { Id } from "../../../convex/_generated/dataModel";

// ── Types ──────────────────────────────────────────────────────────────────

export type IssueFilters = {
	statuses: string[];
	/**
	 * Status categories (Backlog · Not started · In progress · Done · Cancelled).
	 * Used on cross-project views (My Issues) where filtering by raw status key
	 * doesn't compose across projects with different custom statuses. Empty
	 * array = no category filter applied. Values are `StatusCategory` strings.
	 */
	categories: string[];
	priorities: string[];
	projectId: string | null;
	labelIds: string[];
	assigneeIds: string[];
	milestoneIds: string[];
	types: string[];
};

// ── Hook ───────────────────────────────────────────────────────────────────

const EMPTY_FILTERS: IssueFilters = {
	statuses: [],
	categories: [],
	priorities: [],
	projectId: null,
	labelIds: [],
	assigneeIds: [],
	milestoneIds: [],
	types: [],
};

const ACTIVE_SPRINT_STORAGE_KEY = "clave:active-sprint-mode";

/**
 * Issue filter hook with "Active Sprint" mode.
 *
 * When `activeSprintMode` is on (the default), issues are automatically
 * filtered to only those belonging to sprints with status "active".
 * Pass `activeSprintIds` — the IDs of all active sprints in the workspace —
 * so the filter function knows which sprint IDs qualify.
 *
 * The mode is persisted to localStorage. Manually selecting individual
 * sprints via the filter popover turns the mode off.
 */
export function useIssueFilters(
	activeSprintIds?: string[],
	options?: {
		/**
		 * Resolver for status → category, used when filtering by category on
		 * cross-project views. Required if `filters.categories` is set;
		 * otherwise the category filter silently no-ops.
		 */
		getCategoryForIssue?: (issue: {
			status: string;
			projectId?: string | null;
		}) => StatusCategory;
	},
) {
	const getCategoryForIssue = options?.getCategoryForIssue;
	const [filters, setFilters] = useState<IssueFilters>(EMPTY_FILTERS);

	// Active Sprint mode — persisted to localStorage, default true
	const [activeSprintMode, setActiveSprintModeRaw] = useState(() => {
		if (typeof window === "undefined") return true;
		const stored = localStorage.getItem(ACTIVE_SPRINT_STORAGE_KEY);
		return stored === null ? true : stored === "true";
	});

	const setActiveSprintMode = useCallback((value: boolean) => {
		setActiveSprintModeRaw(value);
		if (typeof window !== "undefined") {
			localStorage.setItem(ACTIVE_SPRINT_STORAGE_KEY, String(value));
		}
	}, []);

	const setFilter = useCallback(
		<K extends keyof IssueFilters>(key: K, value: IssueFilters[K]) => {
			setFilters((prev) => ({ ...prev, [key]: value }));
			// Manually selecting sprints turns off active sprint mode
			if (key === "milestoneIds") {
				setActiveSprintMode(false);
			}
		},
		[setActiveSprintMode],
	);

	const clearFilter = useCallback((key: keyof IssueFilters) => {
		setFilters((prev) => ({
			...prev,
			[key]: key === "projectId" ? null : [],
		}));
	}, []);

	const clearAll = useCallback(() => {
		setFilters(EMPTY_FILTERS);
		setActiveSprintMode(false);
	}, [setActiveSprintMode]);

	const activeFilterCount = useMemo(() => {
		const sprintModeActive =
			activeSprintMode &&
			activeSprintIds &&
			activeSprintIds.length > 0 &&
			filters.milestoneIds.length === 0;
		return (
			filters.statuses.length +
			filters.categories.length +
			filters.priorities.length +
			(filters.projectId ? 1 : 0) +
			filters.labelIds.length +
			filters.assigneeIds.length +
			filters.milestoneIds.length +
			filters.types.length +
			(sprintModeActive ? 1 : 0)
		);
	}, [filters, activeSprintMode, activeSprintIds]);

	// Resolve which sprint IDs to use for filtering:
	// - activeSprintMode ON + no manual sprint filter → use activeSprintIds
	// - manual milestoneIds selected → use those (activeSprintMode is off)
	const effectiveSprintIds = useMemo(() => {
		if (filters.milestoneIds.length > 0) return filters.milestoneIds;
		if (activeSprintMode && activeSprintIds && activeSprintIds.length > 0) {
			return activeSprintIds;
		}
		return [];
	}, [filters.milestoneIds, activeSprintMode, activeSprintIds]);

	const applyFilters = useCallback(
		<
			T extends {
				status: string;
				priority: string;
				type?: string;
				projectId?: string | null;
				labelIds?: string[];
				assigneeId?: string | null;
				assigneeIds?: readonly string[] | null;
				sprintId?: string | null;
				milestoneId?: string | null;
			},
		>(
			issues: T[],
		): T[] => {
			const hasExplicitFilters =
				filters.statuses.length > 0 ||
				filters.categories.length > 0 ||
				filters.priorities.length > 0 ||
				filters.projectId !== null ||
				filters.labelIds.length > 0 ||
				filters.assigneeIds.length > 0 ||
				filters.milestoneIds.length > 0 ||
				filters.types.length > 0;
			const hasSprintFilter = effectiveSprintIds.length > 0;

			if (!hasExplicitFilters && !hasSprintFilter) return issues;

			return issues.filter((issue) => {
				if (
					filters.statuses.length > 0 &&
					!filters.statuses.includes(issue.status)
				)
					return false;
				// Category filter — only enforced when a resolver was supplied.
				// On project-scoped views (no resolver), category filters are
				// silently ignored rather than dropping every row.
				if (filters.categories.length > 0 && getCategoryForIssue) {
					const cat = getCategoryForIssue({
						status: issue.status,
						projectId: issue.projectId ?? null,
					});
					if (!filters.categories.includes(cat)) return false;
				}
				if (
					filters.priorities.length > 0 &&
					!filters.priorities.includes(issue.priority)
				)
					return false;
				if (filters.projectId && issue.projectId !== filters.projectId)
					return false;
				if (filters.labelIds.length > 0) {
					if (!issue.labelIds?.some((id) => filters.labelIds.includes(id)))
						return false;
				}
				if (filters.assigneeIds.length > 0) {
					const effective = new Set<string>();
					if (issue.assigneeId) effective.add(issue.assigneeId);
					if (issue.assigneeIds) {
						for (const id of issue.assigneeIds) effective.add(id);
					}
					if (effective.size === 0) return false;
					if (!filters.assigneeIds.some((id) => effective.has(id)))
						return false;
				}
				if (hasSprintFilter) {
					const sprintLikeId = issue.sprintId ?? issue.milestoneId;
					if (!sprintLikeId || !effectiveSprintIds.includes(sprintLikeId))
						return false;
				}
				if (filters.types.length > 0) {
					if (!issue.type || !filters.types.includes(issue.type)) return false;
				}
				return true;
			});
		},
		[filters, effectiveSprintIds, getCategoryForIssue],
	);

	return {
		filters,
		setFilter,
		clearFilter,
		clearAll,
		activeFilterCount,
		applyFilters,
		activeSprintMode,
		setActiveSprintMode,
	};
}

/** Single selected sprint/milestone chip → use for new-issue scope on project board. */
export function sprintIdFromSingleMilestoneFilter(
	milestoneIds: readonly string[],
): Id<"sprints"> | undefined {
	if (milestoneIds.length !== 1) return undefined;
	return milestoneIds[0] as Id<"sprints">;
}

// ── Priority config (derived from centralized module) ───────────

const PRIORITY_OPTIONS = [...DEFAULT_PRIORITIES]
	.sort((a, b) => {
		const order = ["urgent", "high", "medium", "low", "no_priority"];
		return order.indexOf(a.key) - order.indexOf(b.key);
	})
	.map((p) => {
		const Icon = p.icon;
		return {
			id: p.key,
			label: p.name,
			icon: <Icon className={`h-3.5 w-3.5 ${p.color}`} />,
		};
	});

// ── Filter Popover ──────────────────────────────────────────────────────

type FilterCategoryId =
	| "status"
	| "category"
	| "priority"
	| "project"
	| "labels"
	| "assignee"
	| "sprint"
	| "type";

const CATEGORY_OPTIONS = STATUS_CATEGORY_ORDER.map((cat) => {
	const cfg = STATUS_CATEGORY_COLUMN_CONFIG[cat];
	const Icon = cfg.icon;
	return {
		id: cat as string,
		label: STATUS_CATEGORY_LABELS[cat],
		icon: (
			<Icon className="h-3.5 w-3.5" style={{ color: cfg.colorHex }} />
		),
	};
});

export function MyIssuesFilterPopover({
	open,
	onOpenChange,
	filters,
	setFilter,
	clearAll,
	projects,
	labels,
	members = [],
	milestones = [],
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	filters: IssueFilters;
	setFilter: <K extends keyof IssueFilters>(
		key: K,
		value: IssueFilters[K],
	) => void;
	clearAll: () => void;
	projects: { _id: string; name: string }[];
	labels: { _id: string; name: string; color: string }[];
	members?: { id: string; name: string }[];
	milestones?: {
		id: string;
		name: string;
		status?: string;
		projectName?: string;
	}[];
}) {
	const [activeCategory, setActiveCategory] =
		useState<FilterCategoryId>("category");
	const workspace = useWorkspaceOptional();
	const issueConfig = useEffectiveIssueConfig(workspace?.workspaceId);
	// On cross-project My Issues we want filter options to include statuses
	// from every visible project — not just the workspace's defaults — so the
	// user can filter by a project-only "Testing in staging". The union
	// resolver provides exactly this view.
	const workspaceProjects = useWorkspaceProjects();
	const crossProject = useProjectsEffectiveConfigs(
		workspace?.workspaceId,
		workspaceProjects ?? undefined,
	);
	const statusOptions = useMemo(() => {
		// Use the cross-project union when projects are loaded; fall back to
		// workspace-only otherwise so initial render isn't empty.
		const items =
			crossProject.unionStatusItems.length > 0
				? crossProject.unionStatusItems
				: issueConfig.statuses.map((s) => ({
						id: s.key,
						label: s.name,
						icon: issueConfig.getStatusIcon(s.key),
						colorHex: issueConfig.getStatusColor(s.key),
					}));
		return items.map((s) => {
			const Icon = s.icon;
			return {
				id: s.id,
				label: s.label,
				icon: (
					<Icon className="h-3.5 w-3.5" style={{ color: s.colorHex }} />
				),
			};
		});
	}, [crossProject.unionStatusItems, issueConfig]);
	const typeOptions = useMemo(() => {
		return issueConfig.types.map((t) => {
			const Icon = issueConfig.getTypeIcon(t.key);
			return {
				id: t.key,
				label: t.name,
				icon: (
					<Icon
						className="h-3.5 w-3.5"
						style={{ color: issueConfig.getTypeColor(t.key) }}
					/>
				),
			};
		});
	}, [issueConfig]);

	// ── Temp (draft) state – committed only on Apply ──────────────────────
	const [temp, setTemp] = useState<IssueFilters>({ ...EMPTY_FILTERS });

	// Seed temp from external filters every time the popover opens
	useEffect(() => {
		if (open) {
			setTemp({
				statuses: [...filters.statuses],
				categories: [...filters.categories],
				priorities: [...filters.priorities],
				projectId: filters.projectId,
				labelIds: [...filters.labelIds],
				assigneeIds: [...filters.assigneeIds],
				milestoneIds: [...filters.milestoneIds],
				types: [...filters.types],
			});
		}
	}, [open, filters]);

	const toggleArrayItem = (
		key:
			| "statuses"
			| "categories"
			| "priorities"
			| "labelIds"
			| "assigneeIds"
			| "milestoneIds"
			| "types",
		item: string,
	) => {
		setTemp((prev) => {
			const arr = prev[key];
			const next = arr.includes(item)
				? arr.filter((v) => v !== item)
				: [...arr, item];
			return { ...prev, [key]: next };
		});
	};

	const draftCount =
		temp.statuses.length +
		temp.categories.length +
		temp.priorities.length +
		(temp.projectId ? 1 : 0) +
		temp.labelIds.length +
		temp.assigneeIds.length +
		temp.milestoneIds.length +
		temp.types.length;

	const handleApply = () => {
		setFilter("statuses", temp.statuses);
		setFilter("categories", temp.categories);
		setFilter("priorities", temp.priorities);
		setFilter("projectId", temp.projectId);
		setFilter("labelIds", temp.labelIds);
		setFilter("assigneeIds", temp.assigneeIds);
		setFilter("milestoneIds", temp.milestoneIds);
		setFilter("types", temp.types);
		onOpenChange(false);
	};

	const handleClear = () => {
		setTemp({ ...EMPTY_FILTERS });
		clearAll();
	};

	const categories = [
		// Category bucket filter — listed first because it's the consistent
		// cross-project axis (Backlog · Not started · In progress · Done ·
		// Cancelled). The status filter below is still useful for picking a
		// specific status name across projects but produces a noisy list.
		{ id: "category", label: "Category", count: temp.categories.length },
		{ id: "status", label: "Status", count: temp.statuses.length },
		{ id: "priority", label: "Priority", count: temp.priorities.length },
		{ id: "assignee", label: "Assignee", count: temp.assigneeIds.length },
		{ id: "labels", label: "Labels", count: temp.labelIds.length },
		{ id: "project", label: "Project", count: temp.projectId ? 1 : 0 },
		{ id: "sprint", label: "Sprint", count: temp.milestoneIds.length },
		{ id: "type", label: "Type", count: temp.types.length },
	];

	const renderOptions = (categoryId: string) => {
		switch (categoryId) {
			case "category":
				return CATEGORY_OPTIONS.map((opt) => (
					<FilterOptionItem
						key={opt.id}
						checked={temp.categories.includes(opt.id)}
						onToggle={() => toggleArrayItem("categories", opt.id)}
						icon={opt.icon}
						label={opt.label}
					/>
				));

			case "status":
				return statusOptions.map((opt) => (
					<FilterOptionItem
						key={opt.id}
						checked={temp.statuses.includes(opt.id)}
						onToggle={() => toggleArrayItem("statuses", opt.id)}
						icon={opt.icon}
						label={opt.label}
					/>
				));

			case "priority":
				return PRIORITY_OPTIONS.map((opt) => (
					<FilterOptionItem
						key={opt.id}
						checked={temp.priorities.includes(opt.id)}
						onToggle={() => toggleArrayItem("priorities", opt.id)}
						icon={opt.icon}
						label={opt.label}
					/>
				));

			case "project":
				return (
					<>
						<FilterHighlightItem
							isActive={!temp.projectId}
							onClick={() => setTemp((prev) => ({ ...prev, projectId: null }))}
							label="All projects"
						/>
						{projects.map((project) => (
							<FilterHighlightItem
								key={project._id}
								isActive={temp.projectId === project._id}
								onClick={() =>
									setTemp((prev) => ({
										...prev,
										projectId:
											prev.projectId === project._id ? null : project._id,
									}))
								}
								label={project.name}
							/>
						))}
					</>
				);

			case "labels":
				if (labels.length === 0) {
					return <FilterEmptyState message="No labels in this workspace" />;
				}
				return labels.map((label) => (
					<FilterOptionItem
						key={label._id}
						checked={temp.labelIds.includes(label._id)}
						onToggle={() => toggleArrayItem("labelIds", label._id)}
						color={label.color}
						label={label.name}
					/>
				));

			case "assignee":
				if (members.length === 0) {
					return <FilterEmptyState message="No members in this workspace" />;
				}
				return members.map((member) => (
					<FilterOptionItem
						key={member.id}
						checked={temp.assigneeIds.includes(member.id)}
						onToggle={() => toggleArrayItem("assigneeIds", member.id)}
						label={member.name}
					/>
				));

			case "sprint": {
				if (milestones.length === 0) {
					return <FilterEmptyState message="No sprints available" />;
				}
				// Group sprints: active first, then planned, then rest
				const statusOrder: Record<string, number> = {
					active: 0,
					planned: 1,
					completed: 2,
					cancelled: 3,
				};
				const sorted = [...milestones].sort((a, b) => {
					const aOrder = statusOrder[a.status ?? ""] ?? 9;
					const bOrder = statusOrder[b.status ?? ""] ?? 9;
					return aOrder - bOrder;
				});
				return sorted.map((ms) => (
					<FilterOptionItem
						key={ms.id}
						checked={temp.milestoneIds.includes(ms.id)}
						onToggle={() => toggleArrayItem("milestoneIds", ms.id)}
						label={`${ms.name}${ms.projectName ? ` — ${ms.projectName}` : ""}${ms.status === "active" ? " (active)" : ""}`}
					/>
				));
			}

			case "type":
				return typeOptions.map((opt) => (
					<FilterOptionItem
						key={opt.id}
						checked={temp.types.includes(opt.id)}
						onToggle={() => toggleArrayItem("types", opt.id)}
						icon={opt.icon}
						label={opt.label}
					/>
				));

			default:
				return null;
		}
	};

	const renderFooter = () => (
		<div className="border-t border-border/40 px-3 py-2.5 flex items-center justify-between">
			<button
				type="button"
				onClick={handleClear}
				className="text-xs font-medium text-primary hover:underline transition-colors"
			>
				Clear
			</button>
			<Button
				size="sm"
				className="h-7 rounded-lg text-xs"
				onClick={handleApply}
			>
				Apply
			</Button>
		</div>
	);

	return (
		<UnifiedFilterPopover
			open={open}
			onOpenChange={onOpenChange}
			categories={categories}
			activeCategory={activeCategory}
			onCategoryChange={(id) => setActiveCategory(id as FilterCategoryId)}
			renderOptions={renderOptions}
			activeFilterCount={draftCount}
			onClearAll={handleClear}
			triggerVariant="outline"
			renderFooter={renderFooter}
		/>
	);
}

// ── Filter Chips ──────────────────────────────────────────────────────────

export function IssueFilterChips({
	filters,
	setFilter,
	clearAll,
	projectMap,
	labelMap,
	memberMap = new Map(),
	milestoneMap = new Map(),
	activeSprintMode,
	onToggleActiveSprintMode,
}: {
	filters: IssueFilters;
	setFilter: <K extends keyof IssueFilters>(
		key: K,
		value: IssueFilters[K],
	) => void;
	clearAll: () => void;
	projectMap: Map<string, string>;
	labelMap: Map<string, { name: string; color: string }>;
	memberMap?: Map<string, string>;
	milestoneMap?: Map<string, string>;
	activeSprintMode?: boolean;
	onToggleActiveSprintMode?: () => void;
}) {
	const workspace = useWorkspaceOptional();
	const issueConfig = useEffectiveIssueConfig(workspace?.workspaceId);
	const removeArrayItem = (
		key:
			| "statuses"
			| "categories"
			| "priorities"
			| "labelIds"
			| "assigneeIds"
			| "milestoneIds"
			| "types",
		item: string,
	) => {
		setFilter(
			key,
			filters[key].filter((v) => v !== item),
		);
	};

	const chips: { key: string; label: string; onRemove: () => void }[] = [];

	for (const c of filters.categories) {
		chips.push({
			key: `category-${c}`,
			label: `Category: ${STATUS_CATEGORY_LABELS[c as StatusCategory] ?? c}`,
			onRemove: () => removeArrayItem("categories", c),
		});
	}
	for (const s of filters.statuses) {
		chips.push({
			key: `status-${s}`,
			label: `Status: ${issueConfig.getStatusName(s)}`,
			onRemove: () => removeArrayItem("statuses", s),
		});
	}
	for (const p of filters.priorities) {
		chips.push({
			key: `priority-${p}`,
			label: `Priority: ${PRIORITY_LABELS[p] ?? p}`,
			onRemove: () => removeArrayItem("priorities", p),
		});
	}
	for (const id of filters.assigneeIds) {
		chips.push({
			key: `assignee-${id}`,
			label: `Assignee: ${memberMap.get(id) ?? "Unknown"}`,
			onRemove: () => removeArrayItem("assigneeIds", id),
		});
	}
	if (filters.projectId) {
		chips.push({
			key: "project",
			label: `Project: ${projectMap.get(filters.projectId) ?? "Unknown"}`,
			onRemove: () => setFilter("projectId", null),
		});
	}
	for (const id of filters.labelIds) {
		const label = labelMap.get(id);
		chips.push({
			key: `label-${id}`,
			label: `Label: ${label?.name ?? "Unknown"}`,
			onRemove: () => removeArrayItem("labelIds", id),
		});
	}
	if (activeSprintMode && onToggleActiveSprintMode) {
		chips.push({
			key: "active-sprint-mode",
			label: "Active Sprints",
			onRemove: onToggleActiveSprintMode,
		});
	}
	for (const id of filters.milestoneIds) {
		chips.push({
			key: `milestone-${id}`,
			label: `Sprint: ${milestoneMap.get(id) ?? "Unknown"}`,
			onRemove: () => removeArrayItem("milestoneIds", id),
		});
	}
	for (const t of filters.types) {
		chips.push({
			key: `type-${t}`,
			label: `Type: ${issueConfig.getTypeName(t)}`,
			onRemove: () => removeArrayItem("types", t),
		});
	}

	if (chips.length === 0) return null;

	return (
		<div className="flex items-center gap-1.5 px-4 py-1.5 border-b border-border/40 flex-wrap">
			{chips.map((chip) => (
				<span
					key={chip.key}
					className="inline-flex items-center gap-1 rounded-md bg-muted/60 px-2 py-0.5 text-xs text-muted-foreground"
				>
					{chip.label}
					<button
						type="button"
						onClick={chip.onRemove}
						className="ml-0.5 rounded p-0.5 hover:bg-muted hover:text-foreground transition-colors"
					>
						<X className="h-3 w-3" />
					</button>
				</span>
			))}
			<button
				type="button"
				onClick={clearAll}
				className="text-xs text-muted-foreground hover:text-foreground transition-colors ml-1"
			>
				Clear all
			</button>
		</div>
	);
}
