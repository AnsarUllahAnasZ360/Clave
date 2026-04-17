"use client";

import { useMutation, useQuery } from "convex/react";
import { format } from "date-fns";
import {
	Calendar,
	Check,
	ChevronDown,
	Circle,
	CircleCheck,
	CircleDashed,
	CircleX,
	Diamond,
	Eye,
	Timer,
	TriangleAlert,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useWorkspace } from "@/components/providers/workspace-context";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { EmojiPicker } from "@/components/ui/emoji-picker";
import { DatePicker } from "@/components/ui/pickers";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetHeader,
	SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

// ── Status icon helper ──────────────────────────────────────────────────────

const STATUS_ICONS: Record<string, typeof Circle> = {
	triage: TriangleAlert,
	backlog: CircleDashed,
	todo: Circle,
	in_progress: Timer,
	in_review: Eye,
	done: CircleCheck,
	cancelled: CircleX,
};

const STATUS_COLORS: Record<string, string> = {
	triage: "text-orange-500",
	backlog: "text-muted-foreground",
	todo: "text-muted-foreground",
	in_progress: "text-yellow-500",
	in_review: "text-blue-500",
	done: "text-emerald-500",
	cancelled: "text-muted-foreground",
};

// ── Component ───────────────────────────────────────────────────────────────

export function MilestoneDetailPanel({
	sprintId,
	onClose,
}: {
	sprintId: Id<"sprints"> | null;
	onClose: () => void;
}) {
	const milestone = useQuery(
		api.sprints.getById,
		sprintId ? { sprintId } : "skip",
	);
	const issues = useQuery(
		api.issues.listBySprint,
		sprintId ? { sprintId } : "skip",
	);
	const { workspaceSlug } = useWorkspace();
	const updateMilestone = useMutation(api.sprints.update);
	const completeMilestone = useMutation(api.sprints.complete);

	const handleStartDateChange = useCallback(
		async (date: Date | undefined) => {
			if (!sprintId) return;
			try {
				await updateMilestone({
					sprintId,
					startDate: date?.getTime(),
				});
			} catch {
				toast.error("Failed to update start date");
			}
		},
		[sprintId, updateMilestone],
	);

	const handleDateChange = useCallback(
		async (date: Date | undefined) => {
			if (!sprintId) return;
			try {
				await updateMilestone({
					sprintId,
					targetDate: date?.getTime(),
				});
			} catch {
				toast.error("Failed to update target date");
			}
		},
		[sprintId, updateMilestone],
	);

	// Editable description
	const [editingDescription, setEditingDescription] = useState(false);
	const [descriptionValue, setDescriptionValue] = useState("");
	const descriptionRef = useRef<HTMLTextAreaElement>(null);

	useEffect(() => {
		if (milestone) {
			setDescriptionValue(milestone.description ?? "");
		}
	}, [milestone]);

	useEffect(() => {
		if (editingDescription) {
			descriptionRef.current?.focus();
		}
	}, [editingDescription]);

	const handleDescriptionSave = useCallback(async () => {
		setEditingDescription(false);
		if (!sprintId) return;
		const trimmed = descriptionValue.trim();
		if (trimmed === (milestone?.description ?? "")) return;
		try {
			await updateMilestone({
				sprintId,
				description: trimmed || undefined,
			});
		} catch {
			toast.error("Failed to update description");
			setDescriptionValue(milestone?.description ?? "");
		}
	}, [sprintId, descriptionValue, milestone?.description, updateMilestone]);

	// Editable name
	const [editingName, setEditingName] = useState(false);
	const [nameValue, setNameValue] = useState("");
	const nameRef = useRef<HTMLInputElement>(null);

	useEffect(() => {
		if (milestone) {
			setNameValue(milestone.name);
		}
	}, [milestone]);

	useEffect(() => {
		if (editingName) {
			nameRef.current?.focus();
			nameRef.current?.select();
		}
	}, [editingName]);

	const handleNameSave = useCallback(async () => {
		setEditingName(false);
		if (!sprintId) return;
		const trimmed = nameValue.trim();
		if (!trimmed || trimmed === milestone?.name) {
			setNameValue(milestone?.name ?? "");
			return;
		}
		try {
			await updateMilestone({ sprintId, name: trimmed });
		} catch {
			toast.error("Failed to rename sprint");
			setNameValue(milestone?.name ?? "");
		}
	}, [sprintId, nameValue, milestone?.name, updateMilestone]);

	// Lifecycle actions
	const handleComplete = useCallback(async () => {
		if (!sprintId) return;
		try {
			await completeMilestone({ sprintId });
			toast.success("Sprint completed");
		} catch {
			toast.error("Failed to complete sprint");
		}
	}, [sprintId, completeMilestone]);

	const handleCancel = useCallback(async () => {
		if (!sprintId) return;
		try {
			await updateMilestone({ sprintId, status: "cancelled" });
			toast.success("Sprint cancelled");
		} catch {
			toast.error("Failed to cancel sprint");
		}
	}, [sprintId, updateMilestone]);

	const handleReactivate = useCallback(async () => {
		if (!sprintId) return;
		try {
			await updateMilestone({ sprintId, status: "active" });
			toast.success("Sprint reactivated");
		} catch {
			toast.error("Failed to reactivate sprint");
		}
	}, [sprintId, updateMilestone]);

	const isCompleted = milestone?.status === "completed";
	const isCancelled = milestone?.status === "cancelled";
	const isActive =
		milestone?.status === "active" || milestone?.status === "planned";

	return (
		<Sheet open={sprintId !== null} onOpenChange={(o) => !o && onClose()}>
			<SheetContent className="sm:max-w-md overflow-y-auto">
				<SheetHeader>
					<div className="flex items-center gap-2">
						{milestone ? (
							<EmojiPicker
								value={milestone.icon}
								onChange={(emoji) => {
									if (!sprintId) return;
									updateMilestone({
										sprintId,
										icon: emoji ?? "",
									}).catch(() => {
										toast.error("Failed to update icon");
									});
								}}
								trigger={
									<button
										type="button"
										className="flex items-center justify-center rounded-md p-0.5 hover:bg-muted transition-colors cursor-pointer shrink-0"
									>
										{milestone.icon ? (
											<span className="text-xl leading-none">
												{milestone.icon}
											</span>
										) : (
											<Diamond
												className={cn(
													"h-5 w-5",
													isCompleted ? "text-emerald-500" : "text-primary",
												)}
											/>
										)}
									</button>
								}
							/>
						) : (
							<Diamond className="h-5 w-5 shrink-0 text-primary" />
						)}
						{editingName ? (
							<input
								ref={nameRef}
								value={nameValue}
								onChange={(e) => setNameValue(e.target.value)}
								onBlur={handleNameSave}
								onKeyDown={(e) => {
									if (e.key === "Enter") handleNameSave();
									if (e.key === "Escape") {
										setNameValue(milestone?.name ?? "");
										setEditingName(false);
									}
								}}
								className="flex-1 min-w-0 text-lg font-semibold bg-transparent border-b border-primary outline-none pb-0.5"
							/>
						) : (
							<SheetTitle
								className="truncate cursor-pointer hover:text-foreground/80"
								onClick={() => setEditingName(true)}
							>
								{milestone?.name ?? "Sprint"}
							</SheetTitle>
						)}
					</div>
					{milestone?.projectName && (
						<SheetDescription>{milestone.projectName}</SheetDescription>
					)}
				</SheetHeader>

				{milestone && (
					<div className="px-4 pb-4 space-y-6">
						{/* Properties */}
						<div className="space-y-3">
							{/* Status */}
							<div className="flex items-center justify-between text-sm">
								<span className="text-muted-foreground">Status</span>
								<DropdownMenu>
									<DropdownMenuTrigger asChild>
										<button
											type="button"
											className="inline-flex items-center gap-1 cursor-pointer hover:opacity-80 transition-opacity"
										>
											<Badge
												variant={isCompleted ? "default" : "secondary"}
												className="text-xs"
											>
												{milestone.status === "active"
													? "Active"
													: milestone.status === "planned"
														? "Planned"
														: milestone.status === "completed"
															? "Completed"
															: "Cancelled"}
												<ChevronDown className="ml-0.5 h-2.5 w-2.5 opacity-60" />
											</Badge>
										</button>
									</DropdownMenuTrigger>
									<DropdownMenuContent align="end" className="w-36">
										{(
											[
												{
													key: "active",
													label: "Active",
													color: "bg-green-500",
												},
												{
													key: "planned",
													label: "Planned",
													color: "bg-blue-500",
												},
												{
													key: "completed",
													label: "Completed",
													color: "bg-muted-foreground",
												},
												{
													key: "cancelled",
													label: "Cancelled",
													color: "bg-muted-foreground/50",
												},
											] as const
										).map((opt) => (
											<DropdownMenuItem
												key={opt.key}
												onClick={async () => {
													try {
														await updateMilestone({
															sprintId: milestone._id,
															status: opt.key,
														});
														toast.success(`Sprint marked as ${opt.label}`);
													} catch (error) {
														toast.error(
															error instanceof Error
																? error.message
																: "Failed to update status",
														);
													}
												}}
												className="gap-2 text-xs"
											>
												<span
													className={`inline-block h-2 w-2 rounded-full ${opt.color}`}
												/>
												{opt.label}
												{milestone.status === opt.key && (
													<Check className="ml-auto h-3 w-3 text-primary" />
												)}
											</DropdownMenuItem>
										))}
									</DropdownMenuContent>
								</DropdownMenu>
							</div>

							{/* Start date */}
							<div className="flex items-center justify-between text-sm">
								<span className="text-muted-foreground">Start date</span>
								<DatePicker
									date={
										milestone.startDate
											? new Date(milestone.startDate)
											: undefined
									}
									onSelect={handleStartDateChange}
									trigger={
										<button
											type="button"
											className="flex items-center gap-1.5 text-sm hover:text-foreground transition-colors"
										>
											<Calendar className="h-3.5 w-3.5 text-muted-foreground" />
											<span
												className={
													milestone.startDate
														? "text-foreground"
														: "text-muted-foreground"
												}
											>
												{milestone.startDate
													? format(new Date(milestone.startDate), "MMM d, yyyy")
													: "No date"}
											</span>
										</button>
									}
								/>
							</div>

							{/* Target date */}
							<div className="flex items-center justify-between text-sm">
								<span className="text-muted-foreground">Target date</span>
								<DatePicker
									date={
										milestone.targetDate
											? new Date(milestone.targetDate)
											: undefined
									}
									onSelect={handleDateChange}
									trigger={
										<button
											type="button"
											className="flex items-center gap-1.5 text-sm hover:text-foreground transition-colors"
										>
											<Calendar className="h-3.5 w-3.5 text-muted-foreground" />
											<span
												className={
													milestone.targetDate
														? "text-foreground"
														: "text-muted-foreground"
												}
											>
												{milestone.targetDate
													? format(
															new Date(milestone.targetDate),
															"MMM d, yyyy",
														)
													: "No date"}
											</span>
										</button>
									}
								/>
							</div>

							{/* Progress */}
							<div className="space-y-1.5">
								<div className="flex items-center justify-between text-sm">
									<span className="text-muted-foreground">Progress</span>
									<span className="text-xs tabular-nums">
										{milestone.completedCount}/{milestone.issueCount} issues (
										{milestone.progressPercentage}%)
									</span>
								</div>
								<Progress
									value={milestone.progressPercentage}
									className="h-2"
								/>
							</div>
						</div>

						{/* Description */}
						<div>
							<h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
								Description
							</h4>
							{editingDescription ? (
								<textarea
									ref={descriptionRef}
									value={descriptionValue}
									onChange={(e) => setDescriptionValue(e.target.value)}
									onBlur={handleDescriptionSave}
									onKeyDown={(e) => {
										if (e.key === "Escape") {
											setDescriptionValue(milestone.description ?? "");
											setEditingDescription(false);
										}
									}}
									className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring min-h-20 resize-y"
									placeholder="Add a description..."
								/>
							) : (
								<button
									type="button"
									onClick={() => setEditingDescription(true)}
									className="w-full text-left rounded-md px-3 py-2 text-sm hover:bg-muted/50 transition-colors cursor-pointer min-h-10"
								>
									{milestone.description ? (
										<span className="text-foreground/80 leading-relaxed whitespace-pre-wrap">
											{milestone.description}
										</span>
									) : (
										<span className="text-muted-foreground">
											Add a description...
										</span>
									)}
								</button>
							)}
						</div>

						{/* Issues list */}
						<div>
							<h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
								Issues ({issues?.length ?? 0})
							</h4>
							{(!issues || issues.length === 0) && (
								<p className="text-sm text-muted-foreground py-4 text-center">
									No issues assigned to this sprint.
								</p>
							)}
							{issues && issues.length > 0 && (
								<div className="space-y-1">
									{issues.map((issue) => {
										const StatusIconComponent =
											STATUS_ICONS[issue.status] ?? Circle;
										const statusColor =
											STATUS_COLORS[issue.status] ?? "text-muted-foreground";
										return (
											<Link
												key={issue._id}
												href={`/${workspaceSlug}/issues/${issue.identifier}`}
												className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted/50 transition-colors"
												prefetch={false}
											>
												<StatusIconComponent
													className={cn("h-4 w-4 shrink-0", statusColor)}
												/>
												<span className="text-xs font-mono text-muted-foreground shrink-0">
													{issue.identifier}
												</span>
												<span className="truncate">{issue.title}</span>
											</Link>
										);
									})}
								</div>
							)}
						</div>

						{/* Actions */}
						<Separator />
						<div className="flex items-center gap-2">
							{isActive && (
								<>
									<Button
										size="sm"
										className="h-8 gap-1.5 text-xs"
										onClick={handleComplete}
									>
										<CircleCheck className="h-3.5 w-3.5" />
										Complete sprint
									</Button>
									<Button
										variant="outline"
										size="sm"
										className="h-8 gap-1.5 text-xs"
										onClick={handleCancel}
									>
										<CircleX className="h-3.5 w-3.5" />
										Cancel sprint
									</Button>
								</>
							)}
							{(isCompleted || isCancelled) && (
								<Button
									variant="outline"
									size="sm"
									className="h-8 gap-1.5 text-xs"
									onClick={handleReactivate}
								>
									<Timer className="h-3.5 w-3.5" />
									Reactivate sprint
								</Button>
							)}
						</div>
					</div>
				)}
			</SheetContent>
		</Sheet>
	);
}
