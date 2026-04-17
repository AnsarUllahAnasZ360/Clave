"use client";

import { format } from "date-fns";
import {
	Calendar,
	Check,
	Copy,
	ExternalLink,
	Flag,
	Link,
	Trash2,
	X,
} from "lucide-react";
import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { EstimateInput } from "@/components/issues/EstimateInput";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Checkbox } from "@/components/ui/checkbox";
import {
	Command,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
} from "@/components/ui/command";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { DatePicker, GenericPicker } from "@/components/ui/pickers";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import type { EffectivePickerItem } from "@/hooks/use-effective-issue-config";
import { PRIORITY_ITEMS } from "@/lib/issue-config";
import { cn } from "@/lib/utils";
import type { Id } from "../../../convex/_generated/dataModel";

// ── Config (from centralized module) ──────────────────────────────────────

const PRIORITY_CONFIG = PRIORITY_ITEMS;

export const ESTIMATE_OPTIONS = [
	{ id: "0", label: "No estimate" },
	{ id: "0.5", label: "0.5h" },
	{ id: "1", label: "1h" },
	{ id: "2", label: "2h" },
	{ id: "4", label: "4h" },
	{ id: "8", label: "1d" },
	{ id: "16", label: "2d" },
	{ id: "24", label: "3d" },
	{ id: "40", label: "5d" },
];

/** Parse estimate input like "2h", "1d", "0.5d", "4" → hours number */
export function parseEstimateInput(input: string): number | null {
	const trimmed = input.trim().toLowerCase();
	if (!trimmed || trimmed === "0") return 0;
	const dayMatch = trimmed.match(/^([\d.]+)\s*d$/);
	if (dayMatch) {
		const days = Number.parseFloat(dayMatch[1]);
		return Number.isNaN(days) ? null : days * 8;
	}
	const hourMatch = trimmed.match(/^([\d.]+)\s*h?$/);
	if (hourMatch) {
		const hours = Number.parseFloat(hourMatch[1]);
		return Number.isNaN(hours) ? null : hours;
	}
	return null;
}

/** Format hours as display string — always in hours */
export function formatEstimate(hours: number): string {
	if (hours === 0) return "";
	return `${hours}h`;
}

// ── Types ──────────────────────────────────────────────────────────────────

export type IssueListData = {
	_id: Id<"issues">;
	_creationTime: number;
	identifier: string;
	title: string;
	status: string;
	priority: string;
	type?: string;
	assigneeId?: Id<"users">;
	assigneeIds?: Id<"users">[];
	labelIds?: Id<"labels">[];
	startDate?: number;
	dueDate?: number;
	estimate?: number;
	sortOrder: number;
	projectId?: Id<"projects">;
	sprintId?: Id<"sprints">;
	milestoneId?: Id<"milestones">;
	updatedAt?: number;
};

export type ListColumnId =
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

export type MemberOption = {
	id: string;
	name: string;
	image?: string;
};

export type LabelOption = {
	_id: Id<"labels">;
	name: string;
	color: string;
};

export type ProjectOption = {
	id: string;
	name: string;
};

export type MilestoneOption = {
	id: string;
	name: string;
};

export type IssueListRowProps = {
	issue: IssueListData;
	columns: ListColumnId[];
	/** Effective statuses (workspace + optional project override) to render in the inline picker. */
	statusItems: EffectivePickerItem[];
	isHighlighted?: boolean;
	issueUrl?: string;
	onDelete?: (issueId: Id<"issues">) => void;
	memberOptions: MemberOption[];
	labelOptions: LabelOption[];
	projectOptions: ProjectOption[];
	milestoneOptions: MilestoneOption[];
	assignee?: MemberOption | null;
	projectName?: string;
	milestoneName?: string;
	onStatusChange: (issueId: Id<"issues">, status: string) => void;
	onPriorityChange: (issueId: Id<"issues">, priority: string) => void;
	onAssigneeChange: (
		issueId: Id<"issues">,
		assigneeId: string | undefined,
	) => void;
	onAssigneesChange?: (
		issueId: Id<"issues">,
		assigneeIds: string[] | undefined,
	) => void;
	onLabelToggle: (issueId: Id<"issues">, labelId: Id<"labels">) => void;
	onMilestoneChange: (issueId: Id<"issues">, milestoneId: string) => void;
	onEstimateChange: (
		issueId: Id<"issues">,
		estimate: number | undefined,
	) => void;
	onDueDateChange: (issueId: Id<"issues">, dueDate: number | undefined) => void;
	onProjectChange: (issueId: Id<"issues">, projectId: string) => void;
	onClick?: () => void;
	/** Bulk selection (list view): checkbox column; shift-click for range handled by parent. */
	bulkSelect?: {
		selected: boolean;
		onToggle: (shiftKey: boolean) => void;
	};
};

// ── Inline labels picker ──────────────────────────────────────────────────

function InlineLabelsPicker({
	allLabels,
	selectedIds,
	onToggle,
}: {
	allLabels: LabelOption[];
	selectedIds: Id<"labels">[];
	onToggle: (labelId: Id<"labels">) => void;
}) {
	const [open, setOpen] = useState(false);
	const selectedLabels = allLabels.filter((l) => selectedIds.includes(l._id));

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>
				<button
					type="button"
					className="flex items-center gap-1 min-w-0 max-w-full h-full rounded px-1 py-0.5 hover:bg-muted/80 transition-colors text-xs truncate"
				>
					{selectedLabels.length > 0 ? (
						<span className="flex items-center gap-1 truncate">
							{selectedLabels.slice(0, 2).map((label) => (
								<span
									key={label._id}
									className="inline-flex items-center gap-1 truncate"
								>
									<span
										className="h-2 w-2 rounded-full shrink-0"
										style={{ backgroundColor: label.color }}
									/>
									<span className="truncate max-w-[48px]">{label.name}</span>
								</span>
							))}
							{selectedLabels.length > 2 && (
								<span className="text-muted-foreground">
									+{selectedLabels.length - 2}
								</span>
							)}
						</span>
					) : (
						<span className="text-muted-foreground">-</span>
					)}
				</button>
			</PopoverTrigger>
			<PopoverContent className="p-0 w-[220px]" align="start">
				<Command>
					<CommandInput placeholder="Search labels..." />
					<CommandList>
						<CommandEmpty>No labels found.</CommandEmpty>
						<CommandGroup>
							{allLabels.map((label) => {
								const isSelected = selectedIds.includes(label._id);
								return (
									<CommandItem
										key={label._id}
										value={label.name}
										onSelect={() => onToggle(label._id)}
										className="cursor-pointer"
									>
										<div className="flex items-center gap-2 w-full">
											<span
												className="h-3 w-3 rounded-full shrink-0"
												style={{ backgroundColor: label.color }}
											/>
											<span className="flex-1">{label.name}</span>
											{isSelected && <Check className="h-4 w-4 text-primary" />}
										</div>
									</CommandItem>
								);
							})}
						</CommandGroup>
					</CommandList>
				</Command>
			</PopoverContent>
		</Popover>
	);
}

// ── Component ──────────────────────────────────────────────────────────────

export const IssueListRow = memo(function IssueListRow({
	issue,
	columns,
	statusItems,
	isHighlighted,
	issueUrl,
	onDelete,
	memberOptions,
	labelOptions,
	projectOptions,
	milestoneOptions,
	assignee,
	projectName,
	milestoneName,
	onStatusChange,
	onPriorityChange,
	onAssigneeChange,
	onAssigneesChange,
	onLabelToggle,
	onMilestoneChange,
	onEstimateChange,
	onDueDateChange,
	onProjectChange,
	onClick,
	bulkSelect,
}: IssueListRowProps) {
	const statusConfig = statusItems.find((s) => s.id === issue.status);
	const priorityConfig = PRIORITY_CONFIG.find((p) => p.id === issue.priority);
	const isDone = issue.status === "done" || issue.status === "cancelled";

	const handleStatusSelect = useCallback(
		(item: { id: string }) => {
			onStatusChange(issue._id, item.id);
		},
		[issue._id, onStatusChange],
	);

	const handlePrioritySelect = useCallback(
		(item: { id: string }) => {
			onPriorityChange(issue._id, item.id);
		},
		[issue._id, onPriorityChange],
	);

	const _handleAssigneeSelect = useCallback(
		(item: { id: string }) => {
			onAssigneeChange(issue._id, item.id);
		},
		[issue._id, onAssigneeChange],
	);

	const handleProjectSelect = useCallback(
		(item: { id: string }) => {
			onProjectChange(issue._id, item.id);
		},
		[issue._id, onProjectChange],
	);

	const handleMilestoneSelect = useCallback(
		(item: { id: string }) => {
			onMilestoneChange(issue._id, item.id);
		},
		[issue._id, onMilestoneChange],
	);

	const _handleEstimateSelect = useCallback(
		(item: { id: string }) => {
			const val = Number.parseFloat(item.id);
			onEstimateChange(issue._id, val === 0 ? undefined : val);
		},
		[issue._id, onEstimateChange],
	);

	const handleDueDateSelect = useCallback(
		(date: Date | undefined) => {
			onDueDateChange(issue._id, date?.getTime());
		},
		[issue._id, onDueDateChange],
	);

	const handleLabelToggle = useCallback(
		(labelId: Id<"labels">) => {
			onLabelToggle(issue._id, labelId);
		},
		[issue._id, onLabelToggle],
	);

	const handleCopyIdentifier = useCallback(async () => {
		try {
			await navigator.clipboard.writeText(issue.identifier);
			toast.success(`Copied "${issue.identifier}"`);
		} catch {
			toast.error("Failed to copy identifier");
		}
	}, [issue.identifier]);

	const handleCopyLink = useCallback(async () => {
		if (!issueUrl) {
			toast.error("No link available");
			return;
		}
		try {
			const absolute = new URL(issueUrl, window.location.origin).toString();
			await navigator.clipboard.writeText(absolute);
			toast.success("Link copied to clipboard");
		} catch {
			toast.error("Failed to copy link");
		}
	}, [issueUrl]);

	const handleDelete = useCallback(() => {
		if (!onDelete) return;
		onDelete(issue._id);
	}, [issue._id, onDelete]);

	const derivedAssigneeIds = useMemo(() => {
		return issue.assigneeIds && issue.assigneeIds.length > 0
			? issue.assigneeIds
			: issue.assigneeId
				? [issue.assigneeId]
				: [];
	}, [issue.assigneeIds, issue.assigneeId]);

	// Keep a local selection for instant multi-toggle (prevents "last click wins"
	// when the parent list hasn't re-rendered with updated issue data yet).
	const [selectedAssigneeIds, setSelectedAssigneeIds] =
		useState<Id<"users">[]>(derivedAssigneeIds);

	useEffect(() => {
		setSelectedAssigneeIds((prev) => {
			if (prev.length === derivedAssigneeIds.length) {
				const prevSet = new Set(prev);
				const same = derivedAssigneeIds.every((id) => prevSet.has(id));
				if (same) return prev;
			}
			return derivedAssigneeIds;
		});
	}, [derivedAssigneeIds]);

	const [assigneeDropdownOpen, setAssigneeDropdownOpen] = useState(false);

	const handleAssigneeToggle = useCallback(
		(memberId: string) => {
			if (!onAssigneesChange) return;

			const memberIdTyped = memberId as Id<"users">;
			setSelectedAssigneeIds((prev) => {
				const isSelected = prev.includes(memberIdTyped);
				const next = isSelected
					? prev.filter((id) => id !== memberIdTyped)
					: [...prev, memberIdTyped];
				onAssigneesChange(
					issue._id,
					next.length > 0 ? (next as unknown as string[]) : undefined,
				);
				return next;
			});
		},
		[issue._id, onAssigneesChange],
	);

	return (
		// biome-ignore lint/a11y/noStaticElementInteractions: spreadsheet-like list row with click-to-open and inline editing cells
		<div
			data-issue-id={issue._id}
			className={cn(
				"group flex items-center gap-x-6 h-9 border-b border-border/50 text-sm hover:bg-muted/40 transition-colors cursor-pointer",
				isHighlighted && "bg-muted/60 ring-1 ring-primary/30",
				isDone && "opacity-60",
			)}
			onClick={onClick}
			onKeyDown={(e) => {
				if (e.key === "Enter") onClick?.();
			}}
		>
			{bulkSelect ? (
				<div
					role="presentation"
					data-issue-select=""
					className="w-[36px] shrink-0 flex items-center justify-center pl-1"
					onClick={(e) => {
						e.stopPropagation();
						bulkSelect.onToggle(e.shiftKey);
					}}
				>
					<Checkbox
						checked={bulkSelect.selected}
						aria-label="Select issue"
						tabIndex={-1}
						className="pointer-events-none"
					/>
				</div>
			) : null}
			{columns.map((col) => {
				switch (col) {
					case "identifier":
						return (
							<div
								key={col}
								className="w-[80px] shrink-0 px-2 text-xs text-muted-foreground font-mono truncate"
							>
								{issue.identifier}
							</div>
						);

					case "status":
						return (
							// biome-ignore lint/a11y/noStaticElementInteractions: inline editing cell
							<div
								key={col}
								className="w-[110px] shrink-0 flex items-center"
								onClick={(e) => e.stopPropagation()}
								onKeyDown={(e) => e.stopPropagation()}
							>
								<GenericPicker
									items={statusItems}
									onSelect={handleStatusSelect}
									selectedId={issue.status}
									placeholder="Set status..."
									renderItem={(item) => {
										const Icon = item.icon;
										return (
											<div className="flex items-center gap-2 w-full">
												<Icon
													className="h-4 w-4"
													style={{ color: item.colorHex }}
												/>
												<span className="flex-1">{item.label}</span>
											</div>
										);
									}}
									trigger={
										<button
											type="button"
											className="flex items-center gap-1.5 w-full min-w-0 rounded px-1.5 py-0.5 hover:bg-muted transition-colors text-xs truncate"
											title={statusConfig?.label ?? "Status"}
										>
											{statusConfig ? (
												<>
													<statusConfig.icon
														className="h-3.5 w-3.5 shrink-0"
														style={{ color: statusConfig.colorHex }}
													/>
													<span className="truncate">{statusConfig.label}</span>
												</>
											) : (
												<span className="text-muted-foreground truncate">
													{issue.status || "-"}
												</span>
											)}
										</button>
									}
								/>
							</div>
						);

					case "title":
						return (
							<div
								key={col}
								className={cn(
									"flex-1 min-w-0 px-2",
									isDone && "line-through text-muted-foreground",
								)}
							>
								<div className="flex items-center gap-2 min-w-0">
									<div className="min-w-0 flex-1 truncate">{issue.title}</div>
									<div
										className={cn(
											"shrink-0 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity",
										)}
									>
										<DropdownMenu>
											<DropdownMenuTrigger asChild>
												<button
													type="button"
													aria-label="Issue options"
													className="h-6 w-6 inline-flex items-center justify-center rounded hover:bg-muted/80 text-muted-foreground hover:text-foreground transition-colors"
													onPointerDown={(e) => {
														// Avoid triggering drag + row click.
														e.stopPropagation();
													}}
												>
													<span className="sr-only">Open issue menu</span>
													<svg
														viewBox="0 0 24 24"
														aria-hidden="true"
														className="h-4 w-4"
														fill="none"
														stroke="currentColor"
														strokeWidth="2"
														strokeLinecap="round"
														strokeLinejoin="round"
													>
														<circle cx="12" cy="5" r="1" />
														<circle cx="12" cy="12" r="1" />
														<circle cx="12" cy="19" r="1" />
													</svg>
												</button>
											</DropdownMenuTrigger>
											<DropdownMenuContent align="end">
												<DropdownMenuItem
													onClick={(e) => {
														e.stopPropagation();
														onClick?.();
													}}
													className="gap-2"
												>
													<ExternalLink className="h-4 w-4" />
													Open issue
												</DropdownMenuItem>
												<DropdownMenuItem
													onClick={(e) => {
														e.stopPropagation();
														void handleCopyLink();
													}}
													className="gap-2"
												>
													<Link className="h-4 w-4" />
													Copy link
												</DropdownMenuItem>
												<DropdownMenuItem
													onClick={(e) => {
														e.stopPropagation();
														void handleCopyIdentifier();
													}}
													className="gap-2"
												>
													<Copy className="h-4 w-4" />
													Copy ID
												</DropdownMenuItem>
												{onDelete ? (
													<>
														<DropdownMenuSeparator />
														<DropdownMenuItem
															variant="destructive"
															onClick={(e) => {
																e.stopPropagation();
																handleDelete();
															}}
															className="gap-2"
														>
															<Trash2 className="h-4 w-4" />
															Delete issue
														</DropdownMenuItem>
													</>
												) : null}
											</DropdownMenuContent>
										</DropdownMenu>
									</div>
								</div>
							</div>
						);

					case "priority":
						return (
							// biome-ignore lint/a11y/noStaticElementInteractions: inline editing cell
							<div
								key={col}
								className="w-[32px] shrink-0 flex items-center justify-center"
								onClick={(e) => e.stopPropagation()}
								onKeyDown={(e) => e.stopPropagation()}
							>
								<GenericPicker
									items={PRIORITY_CONFIG}
									onSelect={handlePrioritySelect}
									selectedId={issue.priority}
									placeholder="Set priority..."
									renderItem={(item) => {
										const Icon = item.icon;
										return (
											<div className="flex items-center gap-2 w-full">
												<Icon className={cn("h-4 w-4", item.color)} />
												<span className="flex-1">{item.label}</span>
											</div>
										);
									}}
									trigger={
										<button
											type="button"
											className="p-1 rounded hover:bg-muted transition-colors"
											title={priorityConfig?.label ?? "Priority"}
										>
											{priorityConfig && (
												<priorityConfig.icon
													className={cn("h-3.5 w-3.5", priorityConfig.color)}
												/>
											)}
										</button>
									}
								/>
							</div>
						);

					case "assignee":
						return (
							// biome-ignore lint/a11y/noStaticElementInteractions: inline editing cell
							<div
								key={col}
								className="w-[140px] shrink-0 px-1"
								onClick={(e) => e.stopPropagation()}
								onKeyDown={(e) => e.stopPropagation()}
							>
								<Popover
									open={assigneeDropdownOpen}
									onOpenChange={setAssigneeDropdownOpen}
								>
									<PopoverTrigger asChild>
										<button
											type="button"
											aria-label="Edit assignees"
											className="flex items-center gap-1.5 w-full h-7 rounded-md px-1.5 hover:bg-muted transition-colors text-xs"
										>
											{selectedAssigneeIds.length > 0 ? (
												<div className="flex items-center gap-1 w-full">
													{selectedAssigneeIds.slice(0, 2).map((assigneeId) => {
														const assigneeOption = memberOptions.find(
															(m) => m.id === assigneeId,
														);
														return assigneeOption ? (
															<Avatar
																key={assigneeId}
																className="size-4 shrink-0"
															>
																{assigneeOption.image && (
																	<AvatarImage
																		src={assigneeOption.image}
																		alt={assigneeOption.name}
																	/>
																)}
																<AvatarFallback className="text-[8px]">
																	{assigneeOption.name.charAt(0).toUpperCase()}
																</AvatarFallback>
															</Avatar>
														) : null;
													})}
													{selectedAssigneeIds.length > 2 && (
														<span className="text-[10px] text-muted-foreground">
															+{selectedAssigneeIds.length - 2}
														</span>
													)}
												</div>
											) : assignee ? (
												<>
													<Avatar className="size-4 shrink-0">
														{assignee.image && (
															<AvatarImage
																src={assignee.image}
																alt={assignee.name}
															/>
														)}
														<AvatarFallback className="text-[8px]">
															{assignee.name.charAt(0).toUpperCase()}
														</AvatarFallback>
													</Avatar>
													<span className="truncate">{assignee.name}</span>
												</>
											) : (
												<span className="text-muted-foreground/50 group-hover:text-muted-foreground transition-colors">
													+ Assignee
												</span>
											)}
										</button>
									</PopoverTrigger>
									<PopoverContent className="p-0 w-[280px]" align="start">
										<Command
											onPointerDown={(e) => {
												if (
													e.target instanceof HTMLElement &&
													e.target.closest("[cmdk-item]")
												) {
													e.preventDefault();
												}
											}}
										>
											<CommandInput placeholder="Search members..." />
											<CommandList>
												<CommandEmpty>No members found.</CommandEmpty>
												<CommandGroup>
													<CommandItem
														value="Unassigned"
														onSelect={() => {
															onAssigneesChange?.(issue._id, undefined);
															setSelectedAssigneeIds([]);
														}}
														className="cursor-pointer"
													>
														<div className="flex items-center gap-2 w-full">
															<X className="h-4 w-4 text-muted-foreground" />
															<span className="flex-1">Unassigned</span>
															{selectedAssigneeIds.length === 0 && (
																<Check className="h-4 w-4 text-primary" />
															)}
														</div>
													</CommandItem>
												</CommandGroup>
												<CommandGroup>
													{memberOptions.map((option) => {
														const isSelected = selectedAssigneeIds.includes(
															option.id as Id<"users">,
														);
														return (
															<CommandItem
																key={option.id}
																value={option.name}
																onSelect={() => {
																	handleAssigneeToggle(option.id);
																}}
																className="cursor-pointer"
															>
																<div className="flex items-center gap-2 w-full">
																	<Avatar className="h-4 w-4">
																		{option.image && (
																			<AvatarImage
																				src={option.image}
																				alt={option.name}
																			/>
																		)}
																		<AvatarFallback className="text-[8px]">
																			{option.name.charAt(0).toUpperCase()}
																		</AvatarFallback>
																	</Avatar>
																	<span className="flex-1">{option.name}</span>
																	{isSelected && (
																		<Check className="h-4 w-4 text-primary" />
																	)}
																</div>
															</CommandItem>
														);
													})}
												</CommandGroup>
											</CommandList>
										</Command>
									</PopoverContent>
								</Popover>
							</div>
						);

					case "labels":
						return (
							// biome-ignore lint/a11y/noStaticElementInteractions: inline editing cell
							<div
								key={col}
								className="w-[120px] shrink-0 px-1"
								onClick={(e) => e.stopPropagation()}
								onKeyDown={(e) => e.stopPropagation()}
							>
								<InlineLabelsPicker
									allLabels={labelOptions}
									selectedIds={(issue.labelIds as Id<"labels">[]) ?? []}
									onToggle={handleLabelToggle}
								/>
							</div>
						);

					case "project":
						return (
							// biome-ignore lint/a11y/noStaticElementInteractions: inline editing cell
							<div
								key={col}
								className="w-[120px] shrink-0 px-1"
								onClick={(e) => e.stopPropagation()}
								onKeyDown={(e) => e.stopPropagation()}
							>
								<GenericPicker
									items={projectOptions}
									onSelect={handleProjectSelect}
									selectedId={
										issue.projectId ? (issue.projectId as string) : undefined
									}
									placeholder="Set project..."
									renderItem={(item) => (
										<div className="flex items-center gap-2 w-full">
											<span className="flex-1">{item.name}</span>
										</div>
									)}
									trigger={
										<button
											type="button"
											className="flex items-center w-full rounded px-1 py-0.5 hover:bg-muted/80 transition-colors text-xs truncate"
										>
											<span className="truncate">
												{projectName ?? (
													<span className="text-muted-foreground">-</span>
												)}
											</span>
										</button>
									}
								/>
							</div>
						);

					case "milestone":
						return (
							// biome-ignore lint/a11y/noStaticElementInteractions: inline editing cell
							<div
								key={col}
								className="w-[100px] shrink-0 px-1"
								onClick={(e) => e.stopPropagation()}
								onKeyDown={(e) => e.stopPropagation()}
							>
								<GenericPicker
									items={milestoneOptions}
									onSelect={handleMilestoneSelect}
									selectedId={
										issue.sprintId
											? (issue.sprintId as string)
											: issue.milestoneId
												? (issue.milestoneId as string)
												: undefined
									}
									placeholder="Set sprint..."
									renderItem={(item) => (
										<div className="flex items-center gap-2 w-full">
											<Flag className="h-3.5 w-3.5 text-muted-foreground" />
											<span className="flex-1">{item.name}</span>
										</div>
									)}
									trigger={
										<button
											type="button"
											className="flex items-center w-full rounded px-1 py-0.5 hover:bg-muted/80 transition-colors text-xs truncate"
										>
											<span className="truncate">
												{milestoneName ?? (
													<span className="text-muted-foreground">-</span>
												)}
											</span>
										</button>
									}
								/>
							</div>
						);

					case "estimate":
						return (
							// biome-ignore lint/a11y/noStaticElementInteractions: inline editing cell
							<div
								key={col}
								className="w-[90px] shrink-0 px-1"
								onClick={(e) => e.stopPropagation()}
								onKeyDown={(e) => e.stopPropagation()}
							>
								<EstimateInput
									value={issue.estimate ?? undefined}
									onChange={(hours) =>
										onEstimateChange(issue._id, hours === 0 ? undefined : hours)
									}
									compact
								/>
							</div>
						);

					case "dueDate":
						return (
							// biome-ignore lint/a11y/noStaticElementInteractions: inline editing cell
							<div
								key={col}
								className="w-[90px] shrink-0 px-1"
								onClick={(e) => e.stopPropagation()}
								onKeyDown={(e) => e.stopPropagation()}
							>
								<DatePicker
									date={issue.dueDate ? new Date(issue.dueDate) : undefined}
									onSelect={handleDueDateSelect}
									trigger={
										<button
											type="button"
											className="flex items-center gap-1 w-full rounded px-1 py-0.5 hover:bg-muted/80 transition-colors text-xs"
										>
											{issue.dueDate ? (
												<>
													<Calendar className="h-3 w-3 text-muted-foreground shrink-0" />
													<span className="truncate">
														{format(issue.dueDate, "MMM d")}
													</span>
												</>
											) : (
												<span className="text-muted-foreground">-</span>
											)}
										</button>
									}
								/>
							</div>
						);

					default:
						return null;
				}
			})}
		</div>
	);
});
