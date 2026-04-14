"use client";

import { useMutation, useQuery } from "convex/react";
import { Check, Diamond, FolderOpen, type LucideIcon, Tag } from "lucide-react";
import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useWorkspace } from "@/components/providers/workspace-context";
import {
	useWorkspaceLabels,
	useWorkspaceMembers,
	useWorkspaceProjects,
} from "@/components/providers/workspace-data-context";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogTitle,
} from "@/components/ui/dialog";
import { useEffectiveIssueConfig } from "@/hooks/use-effective-issue-config";
import { type PropertyPickerType, useShortcuts } from "@/hooks/use-shortcuts";
import { PRIORITY_ITEMS } from "@/lib/issue-config";
import { cn } from "@/lib/utils";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

// ── Config (from centralized module) ──────────────────────────────────────

interface PickerOption {
	id: string;
	label: string;
	icon?: LucideIcon;
	color?: string;
	colorHex?: string;
	image?: string;
}

const PRIORITY_OPTIONS: PickerOption[] = PRIORITY_ITEMS;

// ── Picker Dialog ─────────────────────────────────────────────────────────

function PickerDialog({
	title,
	options,
	currentValue,
	onSelect,
	onClose,
	multi,
}: {
	title: string;
	options: PickerOption[];
	currentValue?: string | string[];
	onSelect: (id: string) => void;
	onClose: () => void;
	multi?: boolean;
}) {
	const [search, setSearch] = useState("");
	const [highlightedIndex, setHighlightedIndex] = useState(0);
	const inputRef = useRef<HTMLInputElement>(null);

	const filteredOptions = search
		? options.filter((o) =>
				o.label.toLowerCase().includes(search.toLowerCase()),
			)
		: options;

	// Auto-focus search input
	useEffect(() => {
		requestAnimationFrame(() => inputRef.current?.focus());
	}, []);

	// Clamp highlighted index
	useEffect(() => {
		if (highlightedIndex >= filteredOptions.length) {
			setHighlightedIndex(Math.max(0, filteredOptions.length - 1));
		}
	}, [filteredOptions.length, highlightedIndex]);

	const handleKeyDown = useCallback(
		(e: React.KeyboardEvent) => {
			if (e.key === "ArrowDown" || e.key === "j") {
				e.preventDefault();
				setHighlightedIndex((prev) =>
					Math.min(prev + 1, filteredOptions.length - 1),
				);
			} else if (e.key === "ArrowUp" || e.key === "k") {
				e.preventDefault();
				setHighlightedIndex((prev) => Math.max(prev - 1, 0));
			} else if (e.key === "Enter") {
				e.preventDefault();
				const option = filteredOptions[highlightedIndex];
				if (option) {
					onSelect(option.id);
					if (!multi) onClose();
				}
			}
		},
		[filteredOptions, highlightedIndex, onSelect, onClose, multi],
	);

	const isSelected = (id: string) => {
		if (Array.isArray(currentValue)) return currentValue.includes(id);
		return currentValue === id;
	};

	return (
		<Dialog open onOpenChange={(open) => !open && onClose()}>
			<DialogContent
				className="sm:max-w-[280px] p-0 gap-0"
				showCloseButton={false}
			>
				<DialogTitle className="sr-only">{title}</DialogTitle>
				<DialogDescription className="sr-only">
					Select a value for {title.toLowerCase()}
				</DialogDescription>
				<div className="border-b border-border">
					<input
						ref={inputRef}
						value={search}
						onChange={(e) => {
							setSearch(e.target.value);
							setHighlightedIndex(0);
						}}
						onKeyDown={handleKeyDown}
						placeholder={title}
						className="w-full px-3 py-2.5 text-sm bg-transparent outline-none placeholder:text-muted-foreground"
					/>
				</div>
				<div className="max-h-[280px] overflow-y-auto py-1">
					{filteredOptions.length === 0 ? (
						<div className="px-3 py-4 text-center text-sm text-muted-foreground">
							No results
						</div>
					) : (
						filteredOptions.map((option, index) => {
							const Icon = option.icon;
							const selected = isSelected(option.id);
							return (
								<button
									key={option.id}
									type="button"
									className={cn(
										"flex w-full items-center gap-2 px-3 py-1.5 text-sm transition-colors text-left",
										index === highlightedIndex
											? "bg-muted"
											: "hover:bg-muted/50",
									)}
									onClick={() => {
										onSelect(option.id);
										if (!multi) onClose();
									}}
									onMouseEnter={() => setHighlightedIndex(index)}
								>
									{Icon && (
										<Icon
											className={cn(
												"h-4 w-4 shrink-0",
												!option.colorHex && option.color,
											)}
											style={
												option.colorHex ? { color: option.colorHex } : undefined
											}
										/>
									)}
									{option.image && (
										<Image
											src={option.image}
											alt=""
											className="h-5 w-5 rounded-full shrink-0"
											height={20}
											width={20}
											unoptimized
										/>
									)}
									{!Icon && !option.image && (
										<span className="h-5 w-5 rounded-full bg-muted flex items-center justify-center text-[10px] font-bold shrink-0">
											{option.label.charAt(0)}
										</span>
									)}
									<span className="flex-1 truncate">{option.label}</span>
									{selected && (
										<Check className="h-3.5 w-3.5 text-primary shrink-0" />
									)}
								</button>
							);
						})
					)}
				</div>
			</DialogContent>
		</Dialog>
	);
}

// ── Main component ────────────────────────────────────────────────────────

export function PropertyShortcutPicker() {
	const { propertyPicker, activeIssueId, closePropertyPicker } = useShortcuts();
	const { workspaceId } = useWorkspace();

	const issue = useQuery(
		api.issues.getById,
		activeIssueId ? { issueId: activeIssueId as Id<"issues"> } : "skip",
	);

	const members = useWorkspaceMembers();
	const labels = useWorkspaceLabels();
	const projects = useWorkspaceProjects();

	const projectId = issue?.projectId;
	const projectForStatuses = useQuery(
		api.projects.getById,
		projectId ? { projectId: projectId as Id<"projects"> } : "skip",
	);
	const effective = useEffectiveIssueConfig(
		workspaceId,
		projectForStatuses ?? undefined,
	);
	const STATUS_OPTIONS: PickerOption[] = effective.statusItems.map((s) => ({
		id: s.id,
		label: s.label,
		icon: s.icon,
		colorHex: s.colorHex,
	}));
	const sprints = useQuery(
		api.sprints.listByProject,
		projectId ? { projectId: projectId as Id<"projects"> } : "skip",
	);

	const updateStatusMut = useMutation(api.issues.updateStatus);
	const updateMut = useMutation(api.issues.update);
	const assignMut = useMutation(api.issues.assign);

	const handleStatusSelect = useCallback(
		(statusId: string) => {
			if (!activeIssueId) return;
			updateStatusMut({
				issueId: activeIssueId as Id<"issues">,
				status: statusId,
			});
			toast.success(
				`Status set to ${effective.statusItems.find((s) => s.id === statusId)?.label ?? statusId}`,
			);
		},
		[activeIssueId, updateStatusMut, effective.statusItems],
	);

	const handlePrioritySelect = useCallback(
		(priorityId: string) => {
			if (!activeIssueId) return;
			updateMut({
				issueId: activeIssueId as Id<"issues">,
				priority: priorityId as
					| "urgent"
					| "high"
					| "medium"
					| "low"
					| "no_priority",
			});
			toast.success(
				`Priority set to ${PRIORITY_OPTIONS.find((p) => p.id === priorityId)?.label}`,
			);
		},
		[activeIssueId, updateMut],
	);

	const handleAssigneeToggle = useCallback(
		(userId: string) => {
			if (!activeIssueId || !issue) return;
			const current = new Set<Id<"users">>([
				...((issue.assigneeIds ?? []) as Id<"users">[]),
				...(issue.assigneeId ? [issue.assigneeId as Id<"users">] : []),
			]);
			const userIdTyped = userId as Id<"users">;
			const wasAssigned = current.has(userIdTyped);
			if (wasAssigned) current.delete(userIdTyped);
			else current.add(userIdTyped);
			const next = [...current];
			assignMut({
				issueId: activeIssueId as Id<"issues">,
				assigneeIds: next,
			});
			const member = members?.find((m) => m.userId === userId);
			toast.success(
				wasAssigned
					? `Unassigned ${member?.user?.name ?? "user"}`
					: `Assigned ${member?.user?.name ?? "user"}`,
			);
		},
		[activeIssueId, issue, assignMut, members],
	);

	const handleLabelToggle = useCallback(
		(labelId: string) => {
			if (!activeIssueId || !issue) return;
			const current = issue.labelIds ?? [];
			const isSelected = current.includes(labelId as Id<"labels">);
			const newLabels = isSelected
				? current.filter((id) => id !== labelId)
				: [...current, labelId as Id<"labels">];
			updateMut({
				issueId: activeIssueId as Id<"issues">,
				labelIds: newLabels,
			});
		},
		[activeIssueId, issue, updateMut],
	);

	const handleMilestoneSelect = useCallback(
		(sprintId: string) => {
			if (!activeIssueId) return;
			updateMut({
				issueId: activeIssueId as Id<"issues">,
				sprintId: sprintId as Id<"sprints">,
				milestoneId: undefined,
			});
			const sprint = sprints?.find((m) => m._id === sprintId);
			toast.success(`Sprint set to ${sprint?.name ?? "sprint"}`);
		},
		[activeIssueId, updateMut, sprints],
	);

	const handleProjectSelect = useCallback(
		(projId: string) => {
			if (!activeIssueId) return;
			updateMut({
				issueId: activeIssueId as Id<"issues">,
				projectId: projId as Id<"projects">,
			});
			const proj = projects?.find((p) => p._id === projId);
			toast.success(`Project set to ${proj?.name ?? "project"}`);
		},
		[activeIssueId, updateMut, projects],
	);

	if (!propertyPicker || !activeIssueId) return null;

	const pickerConfig: Record<
		NonNullable<PropertyPickerType>,
		{
			title: string;
			options: PickerOption[];
			currentValue?: string | string[];
			onSelect: (id: string) => void;
			multi?: boolean;
		}
	> = {
		status: {
			title: "Set status",
			options: STATUS_OPTIONS,
			currentValue: issue?.status,
			onSelect: handleStatusSelect,
		},
		priority: {
			title: "Set priority",
			options: PRIORITY_OPTIONS,
			currentValue: issue?.priority,
			onSelect: handlePrioritySelect,
		},
		assignee: {
			title: "Set assignees",
			options: (members ?? []).map((m) => ({
				id: m.userId as string,
				label: m.user?.name ?? m.user?.email ?? "Unknown",
				image: m.user?.avatarUrl ?? m.user?.image ?? undefined,
			})),
			currentValue: [
				...((issue?.assigneeIds as string[] | undefined) ?? []),
				...(issue?.assigneeId &&
				!(issue?.assigneeIds ?? []).includes(issue.assigneeId)
					? [issue.assigneeId as string]
					: []),
			],
			onSelect: handleAssigneeToggle,
			multi: true,
		},
		labels: {
			title: "Set labels",
			options: (labels ?? []).map((l) => ({
				id: l._id as string,
				label: l.name,
				icon: Tag,
				color: undefined,
			})),
			currentValue: (issue?.labelIds as string[]) ?? [],
			onSelect: handleLabelToggle,
			multi: true,
		},
		milestone: {
			title: "Set sprint",
			options: (sprints ?? []).map((m) => ({
				id: m._id as string,
				label: m.name,
				icon: Diamond,
				color: "text-blue-500",
			})),
			currentValue: issue?.sprintId ?? issue?.milestoneId ?? undefined,
			onSelect: handleMilestoneSelect,
		},
		project: {
			title: "Set project",
			options: (projects ?? []).map((p) => ({
				id: p._id as string,
				label: p.name,
				icon: FolderOpen,
				color: "text-muted-foreground",
			})),
			currentValue: issue?.projectId ?? undefined,
			onSelect: handleProjectSelect,
		},
	};

	const config = pickerConfig[propertyPicker];
	if (!config) return null;

	return (
		<PickerDialog
			title={config.title}
			options={config.options}
			currentValue={config.currentValue}
			onSelect={config.onSelect}
			onClose={closePropertyPicker}
			multi={config.multi}
		/>
	);
}
