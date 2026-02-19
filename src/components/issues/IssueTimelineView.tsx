"use client";

import { useMutation, useQuery } from "convex/react";
import {
	addDays,
	addWeeks,
	differenceInCalendarDays,
	format,
	isSameDay,
	startOfWeek,
	subWeeks,
} from "date-fns";
import {
	ChevronLeft,
	ChevronRight,
	Diamond,
	ZoomIn,
	ZoomOut,
} from "lucide-react";
import {
	type PointerEvent as ReactPointerEvent,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { toast } from "sonner";
import { useWorkspace } from "@/components/providers/workspace-context";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import {
	getStatusConfig as getCentralizedStatusConfig,
	TIMELINE_BAR_COLORS,
} from "@/lib/issue-config";
import { cn } from "@/lib/utils";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

// ── Status configuration (from centralized module) ───────────────────────

function getStatusConfig(status: string) {
	const item = getCentralizedStatusConfig(status);
	return {
		id: item.key,
		label: item.name,
		icon: item.icon,
		color: item.color,
		barColor: TIMELINE_BAR_COLORS[item.key] ?? "bg-muted border-border",
	};
}

// ── Types ─────────────────────────────────────────────────────────────────

type IssueTimelineData = {
	_id: Id<"issues">;
	identifier: string;
	title: string;
	status: string;
	priority: string;
	assigneeId?: Id<"users">;
	startDate?: number;
	dueDate?: number;
	milestoneId?: Id<"milestones">;
	sortOrder: number;
};

type MilestoneData = {
	_id: Id<"milestones">;
	name: string;
	targetDate?: number;
	status: string;
	issueCount: number;
	completedCount: number;
	progressPercentage: number;
};

type MemberInfo = {
	userId: Id<"users">;
	name: string;
	image?: string;
};

type ViewMode = "day" | "week" | "month";

type GroupBy = "none" | "milestone" | "assignee";

// ── Props ─────────────────────────────────────────────────────────────────

export type IssueTimelineViewProps = {
	projectId: Id<"projects">;
};

// ── Constants ─────────────────────────────────────────────────────────────

const TODAY = new Date();
const ROW_HEIGHT = 44;
const SIDEBAR_WIDTH = 280;
const MILESTONE_ROW_HEIGHT = 32;

// ── Component ─────────────────────────────────────────────────────────────

export function IssueTimelineView({ projectId }: IssueTimelineViewProps) {
	const { workspaceId, workspaceSlug } = useWorkspace();

	// ── Data queries ────────────────────────────────────────────────────
	const issues = useQuery(api.issues.listByProject, { projectId });
	const milestones = useQuery(api.milestones.listByProject, { projectId });
	const members = useQuery(api.workspaceMembers.list, { workspaceId });
	const updateIssueMutation = useMutation(api.issues.update);

	// ── State ───────────────────────────────────────────────────────────
	const [viewMode, setViewMode] = useState<ViewMode>("week");
	const [zoom, setZoom] = useState(1);
	const [viewStartDate, setViewStartDate] = useState(() =>
		startOfWeek(subWeeks(TODAY, 1), { weekStartsOn: 1 }),
	);
	const [groupBy, setGroupBy] = useState<GroupBy>("none");
	const [showUnscheduled, setShowUnscheduled] = useState(true);
	const scrollContainerRef = useRef<HTMLDivElement>(null);
	const shouldAutoScrollRef = useRef(true);

	// ── Derived data ────────────────────────────────────────────────────
	const memberMap = useMemo(() => {
		if (!members) return new Map<string, MemberInfo>();
		const map = new Map<string, MemberInfo>();
		for (const m of members) {
			if (m.user) {
				map.set(m.userId, {
					userId: m.userId as Id<"users">,
					name: m.user.name ?? "Unknown",
					image: m.user.avatarUrl ?? m.user.image,
				});
			}
		}
		return map;
	}, [members]);

	const scheduledIssues = useMemo(() => {
		if (!issues) return [];
		return issues.filter(
			(i) => i.startDate != null && i.dueDate != null,
		) as (IssueTimelineData & { startDate: number; dueDate: number })[];
	}, [issues]);

	const unscheduledIssues = useMemo(() => {
		if (!issues) return [];
		return issues.filter(
			(i) => i.startDate == null || i.dueDate == null,
		) as IssueTimelineData[];
	}, [issues]);

	// ── Timeline date generation ────────────────────────────────────────
	const dates = useMemo(() => {
		const daysToRender =
			viewMode === "day" ? 21 : viewMode === "week" ? 60 : 90;
		return Array.from({ length: daysToRender }).map((_, i) =>
			addDays(viewStartDate, i),
		);
	}, [viewStartDate, viewMode]);

	const baseCellWidth = viewMode === "day" ? 80 : viewMode === "week" ? 40 : 20;
	const cellWidth = Math.max(16, Math.round(baseCellWidth * zoom));
	const timelineWidth = dates.length * cellWidth;

	// ── Today line position ─────────────────────────────────────────────
	const todayOffset = useMemo(() => {
		if (dates.length === 0) return null;
		const offset = differenceInCalendarDays(TODAY, dates[0]);
		if (offset < 0 || offset >= dates.length) return null;
		return offset;
	}, [dates]);

	// Auto-scroll to today on mount
	useEffect(() => {
		if (!shouldAutoScrollRef.current || todayOffset == null) return;
		const el = scrollContainerRef.current;
		if (!el) return;
		const dayX = todayOffset * cellWidth;
		const target = Math.max(0, dayX - el.clientWidth / 3);
		el.scrollTo({ left: target, behavior: "smooth" });
		shouldAutoScrollRef.current = false;
	}, [todayOffset, cellWidth]);

	// ── Navigation handlers ─────────────────────────────────────────────
	const goToToday = useCallback(() => {
		shouldAutoScrollRef.current = true;
		setViewStartDate(startOfWeek(subWeeks(TODAY, 1), { weekStartsOn: 1 }));
	}, []);

	const navigateTime = useCallback(
		(direction: "prev" | "next") => {
			const step = direction === "next" ? 1 : -1;
			const weeksStep = viewMode === "month" ? 4 : viewMode === "week" ? 2 : 1;
			setViewStartDate((d) =>
				step === 1 ? addWeeks(d, weeksStep) : subWeeks(d, weeksStep),
			);
		},
		[viewMode],
	);

	// ── Drag-to-adjust handler ──────────────────────────────────────────
	const handleDragEnd = useCallback(
		async (issueId: Id<"issues">, newStartDate: number, newDueDate: number) => {
			try {
				await updateIssueMutation({
					issueId,
					startDate: newStartDate,
					dueDate: newDueDate,
				});
			} catch {
				toast.error("Failed to update dates");
			}
		},
		[updateIssueMutation],
	);

	// ── Grouping ────────────────────────────────────────────────────────
	type GroupedSection = {
		key: string;
		label: string;
		icon?: React.ReactNode;
		issues: (IssueTimelineData & { startDate: number; dueDate: number })[];
	};

	const groupedSections = useMemo((): GroupedSection[] => {
		if (groupBy === "none") {
			return [{ key: "all", label: "All issues", issues: scheduledIssues }];
		}

		if (groupBy === "milestone") {
			const groups: GroupedSection[] = [];
			const milestoneMap = new Map<string, MilestoneData>();
			if (milestones) {
				for (const m of milestones) {
					milestoneMap.set(m._id, m);
				}
			}

			// Group by milestone
			const byMilestone = new Map<
				string,
				(IssueTimelineData & { startDate: number; dueDate: number })[]
			>();
			for (const issue of scheduledIssues) {
				const key = issue.milestoneId ?? "no-milestone";
				if (!byMilestone.has(key)) byMilestone.set(key, []);
				byMilestone.get(key)?.push(issue);
			}

			// Milestones first, then "No milestone"
			if (milestones) {
				for (const m of milestones) {
					const issues = byMilestone.get(m._id) ?? [];
					groups.push({
						key: m._id,
						label: m.name,
						icon: m.icon ? (
							<span className="text-sm leading-none">{m.icon}</span>
						) : (
							<Diamond className="h-3.5 w-3.5 text-sienna-500 fill-sienna-500" />
						),
						issues,
					});
				}
			}

			const noMilestone = byMilestone.get("no-milestone");
			if (noMilestone && noMilestone.length > 0) {
				groups.push({
					key: "no-milestone",
					label: "No sprint",
					issues: noMilestone,
				});
			}

			return groups;
		}

		// groupBy === "assignee"
		const byAssignee = new Map<
			string,
			(IssueTimelineData & { startDate: number; dueDate: number })[]
		>();
		for (const issue of scheduledIssues) {
			const key = issue.assigneeId ?? "unassigned";
			if (!byAssignee.has(key)) byAssignee.set(key, []);
			byAssignee.get(key)?.push(issue);
		}

		const groups: GroupedSection[] = [];
		for (const [key, groupIssues] of byAssignee) {
			if (key === "unassigned") continue;
			const member = memberMap.get(key);
			groups.push({
				key,
				label: member?.name ?? "Unknown",
				icon: member ? (
					<Avatar className="h-4 w-4">
						<AvatarImage src={member.image} />
						<AvatarFallback className="text-[8px]">
							{member.name.charAt(0).toUpperCase()}
						</AvatarFallback>
					</Avatar>
				) : undefined,
				issues: groupIssues,
			});
		}

		// Sort by name
		groups.sort((a, b) => a.label.localeCompare(b.label));

		const unassigned = byAssignee.get("unassigned");
		if (unassigned && unassigned.length > 0) {
			groups.push({
				key: "unassigned",
				label: "Unassigned",
				issues: unassigned,
			});
		}

		return groups;
	}, [groupBy, scheduledIssues, milestones, memberMap]);

	// Build issue ID -> row index map for dependency arrows
	const issueRowMap = useMemo(() => {
		const map = new Map<string, number>();
		let rowIndex = 0;
		for (const section of groupedSections) {
			if (groupBy !== "none") rowIndex++; // skip group header row
			for (const issue of section.issues) {
				map.set(issue._id, rowIndex);
				rowIndex++;
			}
		}
		return map;
	}, [groupedSections, groupBy]);

	// ── Loading state ───────────────────────────────────────────────────
	if (!issues || !milestones || !members) {
		return (
			<div className="flex flex-1 flex-col items-center justify-center py-20">
				<div className="text-sm text-muted-foreground animate-pulse">
					Loading timeline...
				</div>
			</div>
		);
	}

	// ── Compute total rows for proper height ────────────────────────────
	let totalRows = 0;
	for (const section of groupedSections) {
		if (groupBy !== "none") totalRows++; // group header
		totalRows += section.issues.length;
	}

	// Add milestone row if any milestones have targetDate
	const milestonesWithDates = milestones.filter((m) => m.targetDate != null);
	const hasMilestoneRow = milestonesWithDates.length > 0;

	return (
		<div className="flex flex-1 flex-col overflow-hidden min-w-0">
			{/* ── Toolbar ──────────────────────────────────────────────── */}
			<div className="flex items-center justify-between border-b border-border/30 px-4 py-2 shrink-0">
				<div className="flex items-center gap-2">
					{/* Navigation */}
					<Button
						variant="ghost"
						size="icon"
						className="h-7 w-7"
						onClick={() => navigateTime("prev")}
					>
						<ChevronLeft className="h-4 w-4" />
					</Button>
					<Button
						variant="ghost"
						size="sm"
						className="h-7 px-3 text-xs"
						onClick={goToToday}
					>
						Today
					</Button>
					<Button
						variant="ghost"
						size="icon"
						className="h-7 w-7"
						onClick={() => navigateTime("next")}
					>
						<ChevronRight className="h-4 w-4" />
					</Button>

					<span className="text-sm text-muted-foreground ml-2">
						{format(viewStartDate, "MMM yyyy")}
					</span>
				</div>

				<div className="flex items-center gap-2">
					{/* View mode */}
					<Popover>
						<PopoverTrigger asChild>
							<Button
								variant="outline"
								size="sm"
								className="h-7 px-3 text-xs capitalize"
							>
								{viewMode}
							</Button>
						</PopoverTrigger>
						<PopoverContent className="w-[100px] p-1" align="end">
							{(["day", "week", "month"] as ViewMode[]).map((mode) => (
								<Button
									key={mode}
									variant={viewMode === mode ? "secondary" : "ghost"}
									size="sm"
									className="w-full justify-start h-7 px-2 text-xs capitalize"
									onClick={() => setViewMode(mode)}
								>
									{mode}
								</Button>
							))}
						</PopoverContent>
					</Popover>

					{/* Group by */}
					<Popover>
						<PopoverTrigger asChild>
							<Button variant="outline" size="sm" className="h-7 px-3 text-xs">
								Group: {groupBy === "none" ? "None" : groupBy}
							</Button>
						</PopoverTrigger>
						<PopoverContent className="w-[120px] p-1" align="end">
							{(["none", "milestone", "assignee"] as GroupBy[]).map((g) => (
								<Button
									key={g}
									variant={groupBy === g ? "secondary" : "ghost"}
									size="sm"
									className="w-full justify-start h-7 px-2 text-xs capitalize"
									onClick={() => setGroupBy(g)}
								>
									{g === "none" ? "None" : g === "milestone" ? "Sprint" : g}
								</Button>
							))}
						</PopoverContent>
					</Popover>

					{/* Zoom */}
					<Button
						variant="ghost"
						size="icon"
						className="h-7 w-7"
						onClick={() => setZoom((z) => Math.min(2.5, z * 1.2))}
					>
						<ZoomIn className="h-4 w-4" />
					</Button>
					<Button
						variant="ghost"
						size="icon"
						className="h-7 w-7"
						onClick={() => setZoom((z) => Math.max(0.5, z / 1.2))}
					>
						<ZoomOut className="h-4 w-4" />
					</Button>
				</div>
			</div>

			{/* ── Timeline content ─────────────────────────────────────── */}
			<div ref={scrollContainerRef} className="flex-1 overflow-auto min-w-0">
				<div className="relative min-w-max">
					{/* ── Date header ──────────────────────────────────── */}
					<div className="flex h-10 items-center border-b border-border/40 sticky top-0 z-20 bg-background">
						{/* Sticky sidebar header */}
						<div
							className="shrink-0 bg-background sticky left-0 z-30 border-r border-border/20 flex items-center px-4"
							style={{ width: SIDEBAR_WIDTH }}
						>
							<span className="text-xs font-medium text-muted-foreground">
								Issues
							</span>
						</div>

						{/* Date columns */}
						<div
							className="relative shrink-0 h-full flex items-center"
							style={{ width: timelineWidth }}
						>
							{dates.map((day) => {
								const isWeekend = day.getDay() === 0 || day.getDay() === 6;
								const showLabel =
									viewMode === "day" ||
									(viewMode === "week" && day.getDay() === 1) ||
									(viewMode === "month" && day.getDate() === 1);

								const label =
									viewMode === "day"
										? format(day, "EEE d")
										: viewMode === "week"
											? format(day, "d MMM")
											: format(day, "MMM");

								return (
									<div
										key={`hd-${day.getTime()}`}
										className={cn(
											"flex-none h-full flex items-center justify-center border-r border-border/20",
											isWeekend && viewMode === "day" ? "bg-muted/20" : "",
										)}
										style={{ width: cellWidth }}
									>
										{showLabel && (
											<span
												className={cn(
													"text-xs whitespace-nowrap",
													isSameDay(day, TODAY)
														? "text-primary font-semibold"
														: "text-muted-foreground",
												)}
											>
												{label}
											</span>
										)}
									</div>
								);
							})}
						</div>
					</div>

					{/* ── Milestone row ─────────────────────────────────── */}
					{hasMilestoneRow && (
						<div className="flex border-b border-border/20">
							<div
								className="shrink-0 sticky left-0 z-10 bg-background border-r border-border/20 flex items-center px-4"
								style={{
									width: SIDEBAR_WIDTH,
									height: MILESTONE_ROW_HEIGHT,
								}}
							>
								<span className="text-xs font-medium text-muted-foreground">
									Sprints
								</span>
							</div>
							<div
								className="relative shrink-0"
								style={{
									width: timelineWidth,
									height: MILESTONE_ROW_HEIGHT,
								}}
							>
								{/* Grid lines */}
								<div className="absolute inset-0 flex pointer-events-none">
									{dates.map((mDay) => (
										<div
											key={`mg-${mDay.getTime()}`}
											style={{ width: cellWidth }}
											className="flex-none h-full border-r border-border/10"
										/>
									))}
								</div>

								{/* Milestone diamonds */}
								<TooltipProvider delayDuration={200}>
									{milestonesWithDates.map((milestone) => {
										if (milestone.targetDate == null) return null;
										const targetDay = new Date(milestone.targetDate);
										const offset = differenceInCalendarDays(
											targetDay,
											dates[0],
										);
										if (offset < 0 || offset >= dates.length) return null;
										const x = offset * cellWidth + cellWidth / 2;

										return (
											<Tooltip key={milestone._id}>
												<TooltipTrigger asChild>
													<div
														className="absolute flex items-center justify-center"
														style={{
															left: x - 8,
															top: (MILESTONE_ROW_HEIGHT - 16) / 2,
															width: 16,
															height: 16,
														}}
													>
														{milestone.icon ? (
															<span className="text-sm leading-none">
																{milestone.icon}
															</span>
														) : (
															<Diamond className="h-4 w-4 text-sienna-500 fill-sienna-500" />
														)}
													</div>
												</TooltipTrigger>
												<TooltipContent side="bottom" className="text-xs">
													<p className="font-medium">{milestone.name}</p>
													<p className="text-muted-foreground">
														{format(targetDay, "MMM d, yyyy")}
													</p>
													<p className="text-muted-foreground">
														{milestone.completedCount}/{milestone.issueCount}{" "}
														complete ({milestone.progressPercentage}%)
													</p>
												</TooltipContent>
											</Tooltip>
										);
									})}
								</TooltipProvider>
							</div>
						</div>
					)}

					{/* ── Issue rows ────────────────────────────────────── */}
					<div className="flex flex-col relative">
						{groupedSections.map((section) => (
							<div key={section.key}>
								{/* Group header */}
								{groupBy !== "none" && (
									<div className="flex h-8 items-center border-b border-border/20">
										<div
											className="shrink-0 sticky left-0 z-10 bg-background border-r border-border/20 flex items-center gap-2 px-4"
											style={{ width: SIDEBAR_WIDTH }}
										>
											{section.icon}
											<span className="text-xs font-medium">
												{section.label}
											</span>
											<span className="text-xs text-muted-foreground">
												{section.issues.length}
											</span>
										</div>
										<div
											className="shrink-0"
											style={{ width: timelineWidth }}
										/>
									</div>
								)}

								{/* Issue bars */}
								{section.issues.map((issue) => (
									<IssueTimelineRow
										key={issue._id}
										issue={issue}
										dates={dates}
										cellWidth={cellWidth}
										sidebarWidth={SIDEBAR_WIDTH}
										timelineWidth={timelineWidth}
										viewMode={viewMode}
										memberMap={memberMap}
										workspaceSlug={workspaceSlug}
										onDragEnd={handleDragEnd}
									/>
								))}

								{section.issues.length === 0 && groupBy !== "none" && (
									<div className="flex h-10 items-center border-b border-border/20">
										<div
											className="shrink-0 sticky left-0 z-10 bg-background border-r border-border/20 flex items-center px-4 pl-8"
											style={{ width: SIDEBAR_WIDTH }}
										>
											<span className="text-xs text-muted-foreground italic">
												No scheduled issues
											</span>
										</div>
										<div
											className="shrink-0"
											style={{ width: timelineWidth }}
										/>
									</div>
								)}
							</div>
						))}
					</div>

					{/* ── Dependency arrows (SVG overlay) ──────────────── */}
					<DependencyArrowsOverlay
						scheduledIssues={scheduledIssues}
						issueRowMap={issueRowMap}
						dates={dates}
						cellWidth={cellWidth}
						sidebarWidth={SIDEBAR_WIDTH}
						milestoneRowOffset={hasMilestoneRow ? MILESTONE_ROW_HEIGHT : 0}
					/>

					{/* ── Today line ───────────────────────────────────── */}
					{todayOffset != null && (
						<div
							className="absolute z-10 pointer-events-none"
							style={{
								left: SIDEBAR_WIDTH,
								top: 40,
								bottom: 0,
								width: timelineWidth,
								height:
									(hasMilestoneRow ? MILESTONE_ROW_HEIGHT : 0) +
									totalRows * ROW_HEIGHT +
									(groupBy !== "none" ? groupedSections.length * 32 : 0),
							}}
						>
							<div
								className="absolute top-0 bottom-0 w-0.5 bg-primary"
								style={{
									left: todayOffset * cellWidth + cellWidth / 2,
								}}
							/>
						</div>
					)}
				</div>

				{/* ── Unscheduled section ─────────────────────────────── */}
				{showUnscheduled && unscheduledIssues.length > 0 && (
					<div className="border-t border-border/40">
						<div className="flex h-8 items-center bg-muted/20 px-4">
							<button
								type="button"
								className="text-xs font-medium text-muted-foreground hover:text-foreground flex items-center gap-1"
								onClick={() => setShowUnscheduled(!showUnscheduled)}
							>
								Unscheduled ({unscheduledIssues.length})
							</button>
						</div>
						<div className="divide-y divide-border/20">
							{unscheduledIssues.map((issue) => {
								const sc = getStatusConfig(issue.status);
								const StatusIcon = sc.icon;
								const member = issue.assigneeId
									? memberMap.get(issue.assigneeId)
									: null;

								return (
									<div
										key={issue._id}
										className="flex items-center gap-3 px-4 py-2 hover:bg-accent/20"
									>
										<StatusIcon className={cn("h-4 w-4", sc.color)} />
										<span className="text-xs font-mono text-muted-foreground">
											{issue.identifier}
										</span>
										<a
											href={`/${workspaceSlug}/issues/${issue.identifier}`}
											className="text-sm truncate hover:underline flex-1 min-w-0"
										>
											{issue.title}
										</a>
										{member && (
											<Avatar className="h-5 w-5">
												<AvatarImage src={member.image} />
												<AvatarFallback className="text-[8px]">
													{member.name.charAt(0).toUpperCase()}
												</AvatarFallback>
											</Avatar>
										)}
										<span className="text-xs text-muted-foreground">
											No dates
										</span>
									</div>
								);
							})}
						</div>
					</div>
				)}

				{unscheduledIssues.length > 0 && !showUnscheduled && (
					<div className="border-t border-border/40 px-4 py-2">
						<button
							type="button"
							className="text-xs text-muted-foreground hover:text-foreground"
							onClick={() => setShowUnscheduled(true)}
						>
							Show unscheduled ({unscheduledIssues.length})
						</button>
					</div>
				)}

				{/* Empty state */}
				{issues.length === 0 && (
					<div className="flex flex-col items-center justify-center py-20 text-center">
						<p className="text-sm text-muted-foreground">
							No issues in this project yet.
						</p>
					</div>
				)}

				{issues.length > 0 &&
					scheduledIssues.length === 0 &&
					unscheduledIssues.length > 0 && (
						<div className="flex flex-col items-center justify-center py-10 text-center border-b border-border/20">
							<p className="text-sm text-muted-foreground">
								No issues with dates to display on the timeline.
							</p>
							<p className="text-xs text-muted-foreground mt-1">
								Set start and due dates on issues to see them here.
							</p>
						</div>
					)}
			</div>
		</div>
	);
}

// ── Issue Timeline Row ────────────────────────────────────────────────────

function IssueTimelineRow({
	issue,
	dates,
	cellWidth,
	sidebarWidth,
	timelineWidth,
	viewMode,
	memberMap,
	workspaceSlug,
	onDragEnd,
}: {
	issue: IssueTimelineData & { startDate: number; dueDate: number };
	dates: Date[];
	cellWidth: number;
	sidebarWidth: number;
	timelineWidth: number;
	viewMode: ViewMode;
	memberMap: Map<string, MemberInfo>;
	workspaceSlug: string;
	onDragEnd: (
		issueId: Id<"issues">,
		newStartDate: number,
		newDueDate: number,
	) => void;
}) {
	const sc = getStatusConfig(issue.status);
	const StatusIcon = sc.icon;
	const member = issue.assigneeId ? memberMap.get(issue.assigneeId) : null;

	const startDate = new Date(issue.startDate);
	const dueDate = new Date(issue.dueDate);
	const firstDate = dates[0];

	const offsetDays = differenceInCalendarDays(startDate, firstDate);
	const durationDays = differenceInCalendarDays(dueDate, startDate) + 1;
	const barLeft = offsetDays * cellWidth;
	const barWidth = Math.max(durationDays * cellWidth, cellWidth);

	// ── Drag state ──────────────────────────────────────────────────────
	const [isDragging, setIsDragging] = useState(false);
	const [dragOffset, setDragOffset] = useState(0);
	const [dragType, setDragType] = useState<
		"move" | "resize-left" | "resize-right" | null
	>(null);

	const handlePointerDown = useCallback(
		(e: ReactPointerEvent<HTMLDivElement>) => {
			e.preventDefault();
			e.stopPropagation();
			setIsDragging(true);

			const rect = e.currentTarget.getBoundingClientRect();
			const offsetX = e.clientX - rect.left;
			const dragKind =
				offsetX < 8
					? "resize-left"
					: offsetX > rect.width - 8
						? "resize-right"
						: "move";
			setDragType(dragKind);

			const startX = e.clientX;
			document.body.style.cursor =
				dragKind === "move" ? "grabbing" : "col-resize";

			const handlePointerMove = (moveEvent: PointerEvent) => {
				setDragOffset(moveEvent.clientX - startX);
			};

			const handlePointerUp = (upEvent: PointerEvent) => {
				const deltaX = upEvent.clientX - startX;
				const daysMoved = Math.round(deltaX / cellWidth);

				if (daysMoved !== 0) {
					if (dragKind === "move") {
						const newStart = addDays(startDate, daysMoved);
						const newEnd = addDays(dueDate, daysMoved);
						onDragEnd(issue._id, newStart.getTime(), newEnd.getTime());
					} else if (dragKind === "resize-left") {
						const newStart = addDays(startDate, daysMoved);
						if (newStart < dueDate) {
							onDragEnd(issue._id, newStart.getTime(), dueDate.getTime());
						}
					} else if (dragKind === "resize-right") {
						const newEnd = addDays(dueDate, daysMoved);
						if (newEnd > startDate) {
							onDragEnd(issue._id, startDate.getTime(), newEnd.getTime());
						}
					}
				}

				setIsDragging(false);
				setDragOffset(0);
				setDragType(null);
				document.body.style.cursor = "";
				window.removeEventListener("pointermove", handlePointerMove);
				window.removeEventListener("pointerup", handlePointerUp);
			};

			window.addEventListener("pointermove", handlePointerMove);
			window.addEventListener("pointerup", handlePointerUp);
		},
		[cellWidth, startDate, dueDate, issue._id, onDragEnd],
	);

	// Visual position during drag
	let visualLeft = barLeft;
	let visualWidth = barWidth;
	if (isDragging && dragType) {
		if (dragType === "move") {
			visualLeft = barLeft + dragOffset;
		} else if (dragType === "resize-right") {
			visualWidth = Math.max(cellWidth, barWidth + dragOffset);
		} else if (dragType === "resize-left") {
			visualLeft = barLeft + dragOffset;
			visualWidth = Math.max(cellWidth, barWidth - dragOffset);
		}
	}

	return (
		<div
			className="flex group hover:bg-accent/10 border-b border-border/20"
			style={{ height: ROW_HEIGHT }}
		>
			{/* Sidebar */}
			<div
				className="shrink-0 sticky left-0 z-10 bg-background border-r border-border/20 flex items-center gap-2 px-4"
				style={{ width: sidebarWidth }}
			>
				<StatusIcon className={cn("h-3.5 w-3.5 shrink-0", sc.color)} />
				<span className="text-xs font-mono text-muted-foreground shrink-0">
					{issue.identifier}
				</span>
				<a
					href={`/${workspaceSlug}/issues/${issue.identifier}`}
					className="text-sm truncate hover:underline flex-1 min-w-0"
				>
					{issue.title}
				</a>
				{member && (
					<Avatar className="h-5 w-5 shrink-0">
						<AvatarImage src={member.image} />
						<AvatarFallback className="text-[8px]">
							{member.name.charAt(0).toUpperCase()}
						</AvatarFallback>
					</Avatar>
				)}
			</div>

			{/* Timeline area */}
			<div
				className="relative shrink-0 overflow-visible"
				style={{ width: timelineWidth, height: ROW_HEIGHT }}
			>
				{/* Grid lines */}
				<div className="absolute inset-0 flex pointer-events-none">
					{dates.map((day) => {
						const isWeekend = day.getDay() === 0 || day.getDay() === 6;
						return (
							<div
								key={`rg-${day.getTime()}`}
								style={{ width: cellWidth }}
								className={cn(
									"flex-none h-full border-r border-border/10",
									isWeekend && viewMode === "day" ? "bg-muted/10" : "",
								)}
							/>
						);
					})}
				</div>

				{/* Bar */}
				<TooltipProvider delayDuration={300}>
					<Tooltip>
						<TooltipTrigger asChild>
							<div
								onPointerDown={handlePointerDown}
								className={cn(
									"absolute h-[28px] top-[8px] rounded-md border flex items-center px-2 gap-1 select-none cursor-grab active:cursor-grabbing group/bar overflow-hidden",
									sc.barColor,
									isDragging ? "shadow-lg z-30 opacity-90" : "",
								)}
								style={{
									left: `${visualLeft}px`,
									width: `${Math.max(visualWidth, 30)}px`,
									transition: isDragging
										? "none"
										: "left 0.2s ease, width 0.2s ease",
								}}
							>
								{/* Resize handles */}
								<div className="absolute left-0 top-0 bottom-0 w-2 cursor-col-resize opacity-0 group-hover/bar:opacity-100 bg-white/20 rounded-l-md" />
								<div className="absolute right-0 top-0 bottom-0 w-2 cursor-col-resize opacity-0 group-hover/bar:opacity-100 bg-white/20 rounded-r-md" />

								<span className="text-xs font-medium whitespace-nowrap overflow-hidden text-ellipsis flex-1 min-w-0">
									{issue.identifier}
								</span>
							</div>
						</TooltipTrigger>
						<TooltipContent side="bottom" className="text-xs max-w-[280px]">
							<div className="space-y-1">
								<p className="font-medium">{issue.title}</p>
								<div className="flex items-center gap-2 text-muted-foreground">
									<StatusIcon className={cn("h-3 w-3", sc.color)} />
									<span>{sc.label}</span>
								</div>
								<p className="text-muted-foreground">
									{format(startDate, "MMM d")} -{" "}
									{format(dueDate, "MMM d, yyyy")}
								</p>
								{member && (
									<p className="text-muted-foreground">
										Assignee: {member.name}
									</p>
								)}
							</div>
						</TooltipContent>
					</Tooltip>
				</TooltipProvider>
			</div>
		</div>
	);
}

// ── Dependency Arrows Overlay ─────────────────────────────────────────────

function DependencyArrowsOverlay({
	scheduledIssues,
	issueRowMap,
	dates,
	cellWidth,
	sidebarWidth,
	milestoneRowOffset,
}: {
	scheduledIssues: (IssueTimelineData & {
		startDate: number;
		dueDate: number;
	})[];
	issueRowMap: Map<string, number>;
	dates: Date[];
	cellWidth: number;
	sidebarWidth: number;
	milestoneRowOffset: number;
}) {
	if (scheduledIssues.length === 0 || dates.length === 0) return null;

	// Render individual arrow queries per issue
	return (
		<>
			{scheduledIssues.map((issue) => (
				<DependencyArrowsForIssue
					key={issue._id}
					issue={issue}
					scheduledIssues={scheduledIssues}
					issueRowMap={issueRowMap}
					dates={dates}
					cellWidth={cellWidth}
					sidebarWidth={sidebarWidth}
					milestoneRowOffset={milestoneRowOffset}
				/>
			))}
		</>
	);
}

function DependencyArrowsForIssue({
	issue,
	scheduledIssues,
	issueRowMap,
	dates,
	cellWidth,
	sidebarWidth,
	milestoneRowOffset,
}: {
	issue: IssueTimelineData & { startDate: number; dueDate: number };
	scheduledIssues: (IssueTimelineData & {
		startDate: number;
		dueDate: number;
	})[];
	issueRowMap: Map<string, number>;
	dates: Date[];
	cellWidth: number;
	sidebarWidth: number;
	milestoneRowOffset: number;
}) {
	const relations = useQuery(api.issueRelations.listByIssue, {
		issueId: issue._id,
	});

	if (!relations) return null;

	// Only render "blocks" arrows (from this issue to the one it blocks)
	// to avoid double-rendering (the blocked issue would render from its side)
	const blockingRelations = relations.blocks;
	if (blockingRelations.length === 0) return null;

	const firstDate = dates[0];

	return (
		<>
			{blockingRelations.map((rel) => {
				const fromRow = issueRowMap.get(issue._id);
				const toRow = issueRowMap.get(rel.relatedIssue._id);

				// Both issues must be visible in the timeline
				if (fromRow === undefined || toRow === undefined) return null;

				// Compute x positions: from = end of blocking bar, to = start of blocked bar
				const fromEndDays =
					differenceInCalendarDays(new Date(issue.dueDate), firstDate) + 1;
				const fromX = sidebarWidth + fromEndDays * cellWidth;

				const toIssue = scheduledIssues.find(
					(i) => i._id === rel.relatedIssue._id,
				);
				if (!toIssue) return null;

				const toStartDays = differenceInCalendarDays(
					new Date(toIssue.startDate),
					firstDate,
				);
				const toX = sidebarWidth + toStartDays * cellWidth;

				// Compute y positions (center of each row)
				const fromY =
					milestoneRowOffset + fromRow * ROW_HEIGHT + ROW_HEIGHT / 2;
				const toY = milestoneRowOffset + toRow * ROW_HEIGHT + ROW_HEIGHT / 2;

				return (
					<svg
						key={`${issue._id}-${rel.relatedIssue._id}`}
						className="absolute top-[40px] left-0 pointer-events-none z-5"
						role="img"
						aria-label={`Dependency arrow from ${issue.identifier}`}
						style={{
							width: sidebarWidth + dates.length * cellWidth,
							height:
								milestoneRowOffset + issueRowMap.size * ROW_HEIGHT + ROW_HEIGHT,
							overflow: "visible",
						}}
					>
						<line
							x1={fromX}
							y1={fromY}
							x2={toX}
							y2={toY}
							stroke="currentColor"
							strokeWidth={1.5}
							className="text-orange-500/60"
							markerEnd="url(#arrowhead)"
						/>
						<defs>
							<marker
								id="arrowhead"
								markerWidth="8"
								markerHeight="6"
								refX="8"
								refY="3"
								orient="auto"
							>
								<polygon
									points="0 0, 8 3, 0 6"
									className="fill-orange-500/60"
								/>
							</marker>
						</defs>
					</svg>
				);
			})}
		</>
	);
}
