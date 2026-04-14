"use client";

import { X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useWorkspaceOptional } from "@/components/providers/workspace-context";
import { Button } from "@/components/ui/button";
import {
	FilterEmptyState,
	FilterHighlightItem,
	FilterOptionItem,
	UnifiedFilterPopover,
} from "@/components/unified-filter-popover";
import { useEffectiveIssueConfig } from "@/hooks/use-effective-issue-config";
import { DEFAULT_PRIORITIES, PRIORITY_LABELS } from "@/lib/issue-config";
import type { Id } from "../../../convex/_generated/dataModel";

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
				assigneeIds?: readonly string[] | null;
				sprintId?: string | null;
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
					// Multi-assign aware: an issue matches if ANY of its assignees
					// (legacy single + multi array) is in the selected filter set.
					const effective = new Set<string>();
					if (issue.assigneeId) effective.add(issue.assigneeId);
					if (issue.assigneeIds) {
						for (const id of issue.assigneeIds) effective.add(id);
					}
					if (effective.size === 0) return false;
					if (!filters.assigneeIds.some((id) => effective.has(id)))
						return false;
				}
				if (filters.milestoneIds.length > 0) {
					const sprintLikeId = issue.sprintId ?? issue.milestoneId;
					if (!sprintLikeId || !filters.milestoneIds.includes(sprintLikeId))
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
	milestones?: { id: string; name: string }[];
}) {
	const [activeCategory, setActiveCategory] =
		useState<FilterCategoryId>("status");
	const workspace = useWorkspaceOptional();
	const issueConfig = useEffectiveIssueConfig(workspace?.workspaceId);
	const statusOptions = useMemo(() => {
		return issueConfig.statuses.map((s) => {
			const Icon = issueConfig.getStatusIcon(s.key);
			return {
				id: s.key,
				label: s.name,
				icon: (
					<Icon
						className="h-3.5 w-3.5"
						style={{ color: issueConfig.getStatusColor(s.key) }}
					/>
				),
			};
		});
	}, [issueConfig]);
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
		temp.priorities.length +
		(temp.projectId ? 1 : 0) +
		temp.labelIds.length +
		temp.assigneeIds.length +
		temp.milestoneIds.length +
		temp.types.length;

	const handleApply = () => {
		setFilter("statuses", temp.statuses);
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

			case "sprint":
				if (milestones.length === 0) {
					return <FilterEmptyState message="No sprints available" />;
				}
				return milestones.map((ms) => (
					<FilterOptionItem
						key={ms.id}
						checked={temp.milestoneIds.includes(ms.id)}
						onToggle={() => toggleArrayItem("milestoneIds", ms.id)}
						label={ms.name}
					/>
				));

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
	const workspace = useWorkspaceOptional();
	const issueConfig = useEffectiveIssueConfig(workspace?.workspaceId);
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
