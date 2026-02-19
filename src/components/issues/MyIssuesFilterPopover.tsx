"use client";

import { X } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import {
	FilterEmptyState,
	FilterHighlightItem,
	FilterOptionItem,
	UnifiedFilterPopover,
} from "@/components/unified-filter-popover";
import {
	DEFAULT_ISSUE_TYPES,
	DEFAULT_PRIORITIES,
	DEFAULT_STATUSES,
	PRIORITY_LABELS,
} from "@/lib/issue-config";

// ── Types ──────────────────────────────────────────────────────────────────

export type IssueFilters = {
	statuses: string[];
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
	priorities: [],
	projectId: null,
	labelIds: [],
	assigneeIds: [],
	milestoneIds: [],
	types: [],
};

export function useIssueFilters() {
	const [filters, setFilters] = useState<IssueFilters>(EMPTY_FILTERS);

	const setFilter = useCallback(
		<K extends keyof IssueFilters>(key: K, value: IssueFilters[K]) => {
			setFilters((prev) => ({ ...prev, [key]: value }));
		},
		[],
	);

	const clearFilter = useCallback((key: keyof IssueFilters) => {
		setFilters((prev) => ({
			...prev,
			[key]: key === "projectId" ? null : [],
		}));
	}, []);

	const clearAll = useCallback(() => {
		setFilters(EMPTY_FILTERS);
	}, []);

	const activeFilterCount = useMemo(() => {
		return (
			filters.statuses.length +
			filters.priorities.length +
			(filters.projectId ? 1 : 0) +
			filters.labelIds.length +
			filters.assigneeIds.length +
			filters.milestoneIds.length +
			filters.types.length
		);
	}, [filters]);

	const applyFilters = useCallback(
		<
			T extends {
				status: string;
				priority: string;
				type?: string;
				projectId?: string | null;
				labelIds?: string[];
				assigneeId?: string | null;
				milestoneId?: string | null;
			},
		>(
			issues: T[],
		): T[] => {
			if (activeFilterCount === 0) return issues;
			return issues.filter((issue) => {
				if (
					filters.statuses.length > 0 &&
					!filters.statuses.includes(issue.status)
				)
					return false;
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
					if (
						!issue.assigneeId ||
						!filters.assigneeIds.includes(issue.assigneeId)
					)
						return false;
				}
				if (filters.milestoneIds.length > 0) {
					if (
						!issue.milestoneId ||
						!filters.milestoneIds.includes(issue.milestoneId)
					)
						return false;
				}
				if (filters.types.length > 0) {
					if (!issue.type || !filters.types.includes(issue.type)) return false;
				}
				return true;
			});
		},
		[filters, activeFilterCount],
	);

	return {
		filters,
		setFilter,
		clearFilter,
		clearAll,
		activeFilterCount,
		applyFilters,
	};
}

// ── Status / Priority config (derived from centralized module) ───────────

const STATUS_OPTIONS = DEFAULT_STATUSES.map((s) => {
	const Icon = s.icon;
	return {
		id: s.key,
		label: s.name,
		icon: <Icon className={`h-3.5 w-3.5 ${s.color}`} />,
	};
});

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

const TYPE_OPTIONS = DEFAULT_ISSUE_TYPES.map((t) => {
	const Icon = t.icon;
	return {
		id: t.key,
		label: t.name,
		icon: <Icon className={`h-3.5 w-3.5 ${t.color}`} />,
	};
});

const STATUS_LABELS: Record<string, string> = Object.fromEntries(
	DEFAULT_STATUSES.map((s) => [s.key, s.name]),
);

const TYPE_LABELS: Record<string, string> = Object.fromEntries(
	DEFAULT_ISSUE_TYPES.map((t) => [t.key, t.name]),
);

// ── Filter Popover ──────────────────────────────────────────────────────

type FilterCategoryId =
	| "status"
	| "priority"
	| "project"
	| "labels"
	| "assignee"
	| "sprint"
	| "type";

export function MyIssuesFilterPopover({
	open,
	onOpenChange,
	filters,
	setFilter,
	clearAll,
	activeFilterCount,
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
	activeFilterCount: number;
	projects: { _id: string; name: string }[];
	labels: { _id: string; name: string; color: string }[];
	members?: { id: string; name: string }[];
	milestones?: { id: string; name: string }[];
}) {
	const [activeCategory, setActiveCategory] =
		useState<FilterCategoryId>("status");

	const toggleArrayItem = (
		key:
			| "statuses"
			| "priorities"
			| "labelIds"
			| "assigneeIds"
			| "milestoneIds"
			| "types",
		item: string,
	) => {
		const arr = filters[key];
		const next = arr.includes(item)
			? arr.filter((v) => v !== item)
			: [...arr, item];
		setFilter(key, next);
	};

	const categories = [
		{ id: "status", label: "Status", count: filters.statuses.length },
		{ id: "priority", label: "Priority", count: filters.priorities.length },
		{ id: "assignee", label: "Assignee", count: filters.assigneeIds.length },
		{ id: "labels", label: "Labels", count: filters.labelIds.length },
		{ id: "project", label: "Project", count: filters.projectId ? 1 : 0 },
		{ id: "sprint", label: "Sprint", count: filters.milestoneIds.length },
		{ id: "type", label: "Type", count: filters.types.length },
	];

	const renderOptions = (categoryId: string) => {
		switch (categoryId) {
			case "status":
				return STATUS_OPTIONS.map((opt) => (
					<FilterOptionItem
						key={opt.id}
						checked={filters.statuses.includes(opt.id)}
						onToggle={() => toggleArrayItem("statuses", opt.id)}
						icon={opt.icon}
						label={opt.label}
					/>
				));

			case "priority":
				return PRIORITY_OPTIONS.map((opt) => (
					<FilterOptionItem
						key={opt.id}
						checked={filters.priorities.includes(opt.id)}
						onToggle={() => toggleArrayItem("priorities", opt.id)}
						icon={opt.icon}
						label={opt.label}
					/>
				));

			case "project":
				return (
					<>
						<FilterHighlightItem
							isActive={!filters.projectId}
							onClick={() => setFilter("projectId", null)}
							label="All projects"
						/>
						{projects.map((project) => (
							<FilterHighlightItem
								key={project._id}
								isActive={filters.projectId === project._id}
								onClick={() =>
									setFilter(
										"projectId",
										filters.projectId === project._id ? null : project._id,
									)
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
						checked={filters.labelIds.includes(label._id)}
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
						checked={filters.assigneeIds.includes(member.id)}
						onToggle={() => toggleArrayItem("assigneeIds", member.id)}
						label={member.name}
					/>
				));

			case "sprint":
				if (milestones.length === 0) {
					return <FilterEmptyState message="No sprints available" />;
				}
				return milestones.map((ms) => (
					<FilterOptionItem
						key={ms.id}
						checked={filters.milestoneIds.includes(ms.id)}
						onToggle={() => toggleArrayItem("milestoneIds", ms.id)}
						label={ms.name}
					/>
				));

			case "type":
				return TYPE_OPTIONS.map((opt) => (
					<FilterOptionItem
						key={opt.id}
						checked={filters.types.includes(opt.id)}
						onToggle={() => toggleArrayItem("types", opt.id)}
						icon={opt.icon}
						label={opt.label}
					/>
				));

			default:
				return null;
		}
	};

	return (
		<UnifiedFilterPopover
			open={open}
			onOpenChange={onOpenChange}
			categories={categories}
			activeCategory={activeCategory}
			onCategoryChange={(id) => setActiveCategory(id as FilterCategoryId)}
			renderOptions={renderOptions}
			activeFilterCount={activeFilterCount}
			onClearAll={clearAll}
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
}) {
	const removeArrayItem = (
		key:
			| "statuses"
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

	for (const s of filters.statuses) {
		chips.push({
			key: `status-${s}`,
			label: `Status: ${STATUS_LABELS[s] ?? s}`,
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
			label: `Type: ${TYPE_LABELS[t] ?? t}`,
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
