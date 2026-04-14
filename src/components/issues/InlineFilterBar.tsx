"use client";

import { useQuery } from "convex/react";
import { ChevronDown, X } from "lucide-react";
import { useCallback, useMemo } from "react";
import { useWorkspace } from "@/components/providers/workspace-context";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { useEffectiveIssueConfig } from "@/hooks/use-effective-issue-config";
import { DEFAULT_PRIORITIES, PRIORITY_LABELS } from "@/lib/issue-config";
import { cn } from "@/lib/utils";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import type { IssueFilters } from "./MyIssuesFilterPopover";

// ── Types ──────────────────────────────────────────────────────────────────

type InlineFilterBarProps = {
	filters: IssueFilters;
	setFilter: <K extends keyof IssueFilters>(
		key: K,
		value: IssueFilters[K],
	) => void;
	clearAll: () => void;
	labels?: { _id: string; name: string; color: string }[];
	members?: { id: string; name: string; image?: string }[];
	milestones?: { id: string; name: string }[];
	/** Hide specific filter categories */
	hide?: ("status" | "priority" | "assignee" | "label" | "sprint")[];
	/** Project context — merges project custom statuses into the filter options. */
	projectId?: Id<"projects">;
};

// ── Filter dropdown ────────────────────────────────────────────────────────

function FilterDropdown({
	label,
	count,
	children,
}: {
	label: string;
	count: number;
	children: React.ReactNode;
}) {
	return (
		<Popover>
			<PopoverTrigger asChild>
				<Button
					variant="ghost"
					size="sm"
					className={cn(
						"h-7 gap-1 text-xs rounded-md px-2.5",
						count > 0 ? "text-foreground bg-accent" : "text-muted-foreground",
					)}
				>
					{label}
					{count > 0 && (
						<Badge
							variant="secondary"
							className="h-4 min-w-4 px-1 text-[10px] rounded-full"
						>
							{count}
						</Badge>
					)}
					<ChevronDown className="h-3 w-3 opacity-50" />
				</Button>
			</PopoverTrigger>
			<PopoverContent
				className="w-[200px] p-1 max-h-[280px] overflow-y-auto"
				align="start"
			>
				{children}
			</PopoverContent>
		</Popover>
	);
}

function FilterCheckItem({
	checked,
	onToggle,
	icon,
	label,
	color,
}: {
	checked: boolean;
	onToggle: () => void;
	icon?: React.ReactNode;
	label: string;
	color?: string;
}) {
	return (
		<button
			type="button"
			className={cn(
				"flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-xs hover:bg-accent transition-colors cursor-pointer",
				checked && "bg-accent/60",
			)}
			onClick={onToggle}
		>
			<div
				className={cn(
					"flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-sm border",
					checked
						? "border-primary bg-primary text-primary-foreground"
						: "border-muted-foreground/40",
				)}
			>
				{checked && (
					<svg
						className="h-2.5 w-2.5"
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor"
						strokeWidth={3}
					>
						<title>Selected</title>
						<path
							strokeLinecap="round"
							strokeLinejoin="round"
							d="M5 13l4 4L19 7"
						/>
					</svg>
				)}
			</div>
			{icon}
			{color && (
				<div
					className="h-2.5 w-2.5 rounded-full shrink-0"
					style={{ backgroundColor: color }}
				/>
			)}
			<span className="truncate">{label}</span>
		</button>
	);
}

// ── Component ──────────────────────────────────────────────────────────────

export function InlineFilterBar({
	filters,
	setFilter,
	clearAll,
	labels = [],
	members = [],
	milestones = [],
	hide = [],
	projectId,
}: InlineFilterBarProps) {
	const { workspaceId } = useWorkspace();
	const project = useQuery(
		api.projects.getById,
		projectId ? { projectId } : "skip",
	);
	const effective = useEffectiveIssueConfig(workspaceId, project ?? undefined);
	const toggleArrayItem = useCallback(
		(
			key:
				| "statuses"
				| "priorities"
				| "labelIds"
				| "assigneeIds"
				| "milestoneIds",
			item: string,
		) => {
			const arr = filters[key];
			const next = arr.includes(item)
				? arr.filter((v) => v !== item)
				: [...arr, item];
			setFilter(key, next);
		},
		[filters, setFilter],
	);

	const activeCount =
		filters.statuses.length +
		filters.priorities.length +
		filters.labelIds.length +
		filters.assigneeIds.length +
		filters.milestoneIds.length;

	const statusOptions = useMemo(
		() =>
			effective.statusItems.map((s) => ({
				id: s.id,
				label: s.label,
				icon: <s.icon className="h-3.5 w-3.5" style={{ color: s.colorHex }} />,
			})),
		[effective.statusItems],
	);

	const priorityOptions = useMemo(
		() =>
			DEFAULT_PRIORITIES.map((p) => ({
				id: p.key,
				label: PRIORITY_LABELS[p.key] ?? p.name,
				icon: <p.icon className={cn("h-3.5 w-3.5", p.color)} />,
			})),
		[],
	);

	return (
		<div className="flex items-center gap-1 flex-wrap">
			{/* Status */}
			{!hide.includes("status") && (
				<FilterDropdown label="Status" count={filters.statuses.length}>
					{statusOptions.map((opt) => (
						<FilterCheckItem
							key={opt.id}
							checked={filters.statuses.includes(opt.id)}
							onToggle={() => toggleArrayItem("statuses", opt.id)}
							icon={opt.icon}
							label={opt.label}
						/>
					))}
				</FilterDropdown>
			)}

			{/* Priority */}
			{!hide.includes("priority") && (
				<FilterDropdown label="Priority" count={filters.priorities.length}>
					{priorityOptions.map((opt) => (
						<FilterCheckItem
							key={opt.id}
							checked={filters.priorities.includes(opt.id)}
							onToggle={() => toggleArrayItem("priorities", opt.id)}
							icon={opt.icon}
							label={opt.label}
						/>
					))}
				</FilterDropdown>
			)}

			{/* Assignee */}
			{!hide.includes("assignee") && members.length > 0 && (
				<FilterDropdown label="Assignee" count={filters.assigneeIds.length}>
					{members.map((m) => (
						<FilterCheckItem
							key={m.id}
							checked={filters.assigneeIds.includes(m.id)}
							onToggle={() => toggleArrayItem("assigneeIds", m.id)}
							icon={
								<Avatar className="h-4 w-4">
									<AvatarFallback className="text-[8px]">
										{m.name.charAt(0).toUpperCase()}
									</AvatarFallback>
								</Avatar>
							}
							label={m.name}
						/>
					))}
				</FilterDropdown>
			)}

			{/* Label */}
			{!hide.includes("label") && labels.length > 0 && (
				<FilterDropdown label="Label" count={filters.labelIds.length}>
					{labels.map((l) => (
						<FilterCheckItem
							key={l._id}
							checked={filters.labelIds.includes(l._id)}
							onToggle={() => toggleArrayItem("labelIds", l._id)}
							color={l.color}
							label={l.name}
						/>
					))}
				</FilterDropdown>
			)}

			{/* Sprint */}
			{!hide.includes("sprint") && milestones.length > 0 && (
				<FilterDropdown label="Sprint" count={filters.milestoneIds.length}>
					{milestones.map((m) => (
						<FilterCheckItem
							key={m.id}
							checked={filters.milestoneIds.includes(m.id)}
							onToggle={() => toggleArrayItem("milestoneIds", m.id)}
							label={m.name}
						/>
					))}
				</FilterDropdown>
			)}

			{/* Clear all */}
			{activeCount > 0 && (
				<Button
					variant="ghost"
					size="sm"
					className="h-7 gap-1 text-xs text-muted-foreground px-2"
					onClick={clearAll}
				>
					<X className="h-3 w-3" />
					Clear
				</Button>
			)}
		</div>
	);
}
