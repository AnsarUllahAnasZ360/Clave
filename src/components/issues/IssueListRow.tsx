"use client";

import { format } from "date-fns";
import { Calendar, Check, Clock, Flag } from "lucide-react";
import { memo, useCallback, useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
	Command,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
} from "@/components/ui/command";
import { DatePicker, GenericPicker } from "@/components/ui/pickers";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { PRIORITY_ITEMS, STATUS_ITEMS } from "@/lib/issue-config";
import { cn } from "@/lib/utils";
import type { Id } from "../../../convex/_generated/dataModel";

// ── Config (from centralized module) ──────────────────────────────────────

const STATUS_CONFIG = STATUS_ITEMS;
const PRIORITY_CONFIG = PRIORITY_ITEMS;

export const ESTIMATE_OPTIONS = [
	{ id: "0", label: "No estimate" },
	{ id: "0.5", label: "0.5h" },
	{ id: "1", label: "1h" },
	{ id: "2", label: "2h" },
	{ id: "4", label: "4h" },
	{ id: "8", label: "8h" },
	{ id: "16", label: "16h" },
	{ id: "24", label: "24h" },
	{ id: "40", label: "40h" },
];

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
	labelIds?: Id<"labels">[];
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
	isHighlighted?: boolean;
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
	onLabelToggle: (issueId: Id<"issues">, labelId: Id<"labels">) => void;
	onMilestoneChange: (issueId: Id<"issues">, milestoneId: string) => void;
	onEstimateChange: (
		issueId: Id<"issues">,
		estimate: number | undefined,
	) => void;
	onDueDateChange: (issueId: Id<"issues">, dueDate: number | undefined) => void;
	onProjectChange: (issueId: Id<"issues">, projectId: string) => void;
	onClick?: () => void;
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
	isHighlighted,
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
	onLabelToggle,
	onMilestoneChange,
	onEstimateChange,
	onDueDateChange,
	onProjectChange,
	onClick,
}: IssueListRowProps) {
	const statusConfig = STATUS_CONFIG.find((s) => s.id === issue.status);
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

	const handleAssigneeSelect = useCallback(
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

	const handleEstimateSelect = useCallback(
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
									items={STATUS_CONFIG}
									onSelect={handleStatusSelect}
									selectedId={issue.status}
									placeholder="Set status..."
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
											className="flex items-center gap-1.5 w-full min-w-0 rounded px-1.5 py-0.5 hover:bg-muted transition-colors text-xs truncate"
											title={statusConfig?.label ?? "Status"}
										>
											{statusConfig ? (
												<>
													<statusConfig.icon
														className={cn(
															"h-3.5 w-3.5 shrink-0",
															statusConfig.color,
														)}
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
									"flex-1 min-w-0 px-2 truncate",
									isDone && "line-through text-muted-foreground",
								)}
							>
								{issue.title}
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
								className="w-[120px] shrink-0 px-1"
								onClick={(e) => e.stopPropagation()}
								onKeyDown={(e) => e.stopPropagation()}
							>
								<GenericPicker
									items={memberOptions}
									onSelect={handleAssigneeSelect}
									selectedId={issue.assigneeId ?? undefined}
									placeholder="Assign to..."
									renderItem={(item) => (
										<div className="flex items-center gap-2 w-full">
											<div className="size-5 rounded-full bg-muted flex items-center justify-center text-xs font-bold">
												{item.name.charAt(0)}
											</div>
											<span className="flex-1">{item.name}</span>
										</div>
									)}
									trigger={
										<button
											type="button"
											className="flex items-center gap-1.5 w-full rounded px-1 py-0.5 hover:bg-muted/80 transition-colors text-xs truncate"
										>
											{assignee ? (
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
												<span className="text-muted-foreground">-</span>
											)}
										</button>
									}
								/>
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
								className="w-[60px] shrink-0 px-1"
								onClick={(e) => e.stopPropagation()}
								onKeyDown={(e) => e.stopPropagation()}
							>
								<GenericPicker
									items={ESTIMATE_OPTIONS}
									onSelect={handleEstimateSelect}
									selectedId={issue.estimate ? String(issue.estimate) : "0"}
									placeholder="Set estimate..."
									renderItem={(item) => (
										<div className="flex items-center gap-2 w-full">
											<span className="flex-1">{item.label}</span>
										</div>
									)}
									trigger={
										<button
											type="button"
											className="flex items-center w-full rounded px-1 py-0.5 hover:bg-muted/80 transition-colors text-xs"
										>
											{issue.estimate ? (
												<span className="flex items-center gap-1">
													<Clock className="h-3 w-3 text-muted-foreground" />
													{issue.estimate}h
												</span>
											) : (
												<span className="text-muted-foreground">-</span>
											)}
										</button>
									}
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
