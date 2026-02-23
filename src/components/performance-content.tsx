"use client";

import {
	ArrowDown,
	ArrowUp,
	CalendarBlank,
	ChartBar,
	CheckCircle,
	Clock,
	Funnel,
	Info,
	WarningOctagon,
} from "@phosphor-icons/react/dist/ssr";
import { useQuery } from "convex/react";
import { format } from "date-fns";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import { ChipOverflow } from "@/components/chip-overflow";
import { ProgressCircle } from "@/components/progress-circle";
import { useWorkspace } from "@/components/providers/workspace-context";
import {
	useWorkspaceMembers,
	useWorkspaceProjects,
} from "@/components/providers/workspace-data-context";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { Progress } from "@/components/ui/progress";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Skeleton } from "@/components/ui/skeleton";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";

const MS_DAY = 1000 * 60 * 60 * 24;

const RANGE_OPTIONS = [
	{ id: "7d", label: "Last 7 days", days: 7 },
	{ id: "30d", label: "Last 30 days", days: 30 },
	{ id: "90d", label: "Last 90 days", days: 90 },
	{ id: "custom", label: "Custom range" },
] as const;

type RangeId = (typeof RANGE_OPTIONS)[number]["id"];

type HealthTone = "positive" | "warning" | "danger" | "neutral" | "muted";

function getProgressColor(percent: number): string {
	if (percent >= 80) return "var(--chart-3)";
	if (percent >= 50) return "var(--chart-4)";
	if (percent > 0) return "var(--chart-5)";
	return "var(--chart-2)";
}

function getStatusLabel(status: string) {
	if (status === "active") return "Active";
	if (status === "planned") return "Planned";
	if (status === "backlog") return "Backlog";
	if (status === "completed") return "Completed";
	if (status === "cancelled") return "Cancelled";
	return "Unknown";
}

function getStatusBadgeClass(status: string) {
	if (status === "active") return "bg-teal-50 text-teal-700 border-transparent";
	if (status === "planned")
		return "bg-amber-50 text-amber-700 border-transparent";
	if (status === "backlog")
		return "bg-slate-100 text-slate-600 border-transparent";
	if (status === "completed")
		return "bg-emerald-50 text-emerald-700 border-transparent";
	if (status === "cancelled")
		return "bg-slate-200 text-slate-600 border-transparent";
	return "bg-muted text-muted-foreground border-transparent";
}

function getHealthBadgeClass(tone: HealthTone) {
	if (tone === "positive")
		return "bg-emerald-50 text-emerald-700 border-transparent";
	if (tone === "warning")
		return "bg-amber-50 text-amber-700 border-transparent";
	if (tone === "danger") return "bg-rose-50 text-rose-700 border-transparent";
	if (tone === "muted") return "bg-slate-100 text-slate-600 border-transparent";
	return "bg-blue-50 text-blue-700 border-transparent";
}

function getDueLabel(daysToDue: number) {
	if (daysToDue === 0) return "Due today";
	if (daysToDue < 0) return `Overdue ${Math.abs(daysToDue)}d`;
	return `Due in ${daysToDue}d`;
}

type MetricCardProps = {
	title: string;
	value: string;
	description: string;
	icon: ReactNode;
	tooltip: string;
	tone?: "positive" | "warning" | "danger" | "neutral";
};

function MetricCard({
	title,
	value,
	description,
	icon,
	tooltip,
	tone = "neutral",
}: MetricCardProps) {
	const toneClass =
		tone === "positive"
			? "text-emerald-600"
			: tone === "warning"
				? "text-amber-600"
				: tone === "danger"
					? "text-rose-600"
					: "text-muted-foreground";

	return (
		<Card className="border-border/60 bg-card/70">
			<CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
				<div className="flex items-center gap-2">
					<CardTitle className="text-sm font-medium text-muted-foreground">
						{title}
					</CardTitle>
					<Tooltip>
						<TooltipTrigger asChild>
							<button
								type="button"
								className="inline-flex h-5 w-5 items-center justify-center rounded-full text-muted-foreground hover:text-foreground"
								aria-label={`Info about ${title}`}
							>
								<Info className="h-3.5 w-3.5" />
							</button>
						</TooltipTrigger>
						<TooltipContent side="top" className="max-w-[220px] text-xs">
							{tooltip}
						</TooltipContent>
					</Tooltip>
				</div>
				<div
					className={cn(
						"h-8 w-8 rounded-full bg-muted/40 flex items-center justify-center",
						toneClass,
					)}
				>
					{icon}
				</div>
			</CardHeader>
			<CardContent className="space-y-2">
				<div className="text-2xl font-semibold text-foreground">{value}</div>
				<p className="text-xs text-muted-foreground">{description}</p>
			</CardContent>
		</Card>
	);
}

// ── Filter Popover ──────────────────────────────────────────────────────────

type PerformanceFilterValue = {
	projectId: string;
	memberId: string;
};

type FilterProject = { _id: string; name: string };
type FilterMember = { _id: string; name: string };

type PerformanceFilterPopoverProps = {
	projects: FilterProject[];
	members: FilterMember[];
	value: PerformanceFilterValue;
	onApply: (next: PerformanceFilterValue) => void;
	onClear: () => void;
};

function PerformanceFilterPopover({
	projects,
	members,
	value,
	onApply,
	onClear,
}: PerformanceFilterPopoverProps) {
	const [open, setOpen] = useState(false);
	const [tempProjectId, setTempProjectId] = useState(value.projectId);
	const [tempMemberId, setTempMemberId] = useState(value.memberId);
	const [active, setActive] = useState<"project" | "member">("project");

	useEffect(() => {
		if (!open) return;
		setTempProjectId(value.projectId);
		setTempMemberId(value.memberId);
		setActive("project");
	}, [open, value.memberId, value.projectId]);

	useEffect(() => {
		if (tempMemberId === "all") return;
		if (!members.find((m) => m._id === tempMemberId)) {
			setTempMemberId("all");
		}
	}, [members, tempMemberId]);

	const handleApply = () => {
		onApply({ projectId: tempProjectId, memberId: tempMemberId });
		setOpen(false);
	};

	const handleClear = () => {
		setTempProjectId("all");
		setTempMemberId("all");
		onClear();
		setOpen(false);
	};

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>
				<Button
					variant="outline"
					size="sm"
					className="h-8 gap-2 rounded-lg border-border/60 px-3 bg-transparent"
				>
					<Funnel className="h-4 w-4" />
					Filter
				</Button>
			</PopoverTrigger>
			<PopoverContent align="start" className="w-[560px] p-0 rounded-xl">
				<div className="grid grid-cols-[220px_minmax(0,1fr)]">
					<div className="border-r border-border/40 p-3">
						<div className="space-y-1">
							<button
								type="button"
								onClick={() => setActive("project")}
								className={cn(
									"flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm hover:bg-accent",
									active === "project" && "bg-accent",
								)}
							>
								<span>Project</span>
								<span className="text-xs text-muted-foreground">
									{projects.length}
								</span>
							</button>
							<button
								type="button"
								onClick={() => setActive("member")}
								className={cn(
									"flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm hover:bg-accent",
									active === "member" && "bg-accent",
								)}
							>
								<span>Members</span>
								<span className="text-xs text-muted-foreground">
									{members.length}
								</span>
							</button>
						</div>
					</div>
					<div className="p-3">
						{active === "project" && (
							<>
								<p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
									Project
								</p>
								<div className="mt-2 space-y-1">
									<button
										type="button"
										onClick={() => setTempProjectId("all")}
										className={cn(
											"flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm",
											tempProjectId === "all"
												? "bg-accent text-foreground"
												: "text-muted-foreground hover:bg-accent",
										)}
									>
										<span>All projects</span>
										{tempProjectId === "all" && (
											<CheckCircle
												className="h-4 w-4 text-primary"
												weight="fill"
											/>
										)}
									</button>
									{projects.map((project) => (
										<button
											key={project._id}
											type="button"
											onClick={() => setTempProjectId(project._id)}
											className={cn(
												"flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm",
												tempProjectId === project._id
													? "bg-accent text-foreground"
													: "text-muted-foreground hover:bg-accent",
											)}
										>
											<span className="truncate">{project.name}</span>
											{tempProjectId === project._id && (
												<CheckCircle
													className="h-4 w-4 text-primary"
													weight="fill"
												/>
											)}
										</button>
									))}
								</div>
							</>
						)}
						{active === "member" && (
							<>
								<p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
									Member
								</p>
								<div className="mt-2 space-y-1">
									<button
										type="button"
										onClick={() => setTempMemberId("all")}
										className={cn(
											"flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm",
											tempMemberId === "all"
												? "bg-accent text-foreground"
												: "text-muted-foreground hover:bg-accent",
										)}
									>
										<span>All members</span>
										{tempMemberId === "all" && (
											<CheckCircle
												className="h-4 w-4 text-primary"
												weight="fill"
											/>
										)}
									</button>
									{members.map((member) => (
										<button
											key={member._id}
											type="button"
											onClick={() => setTempMemberId(member._id)}
											className={cn(
												"flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm",
												tempMemberId === member._id
													? "bg-accent text-foreground"
													: "text-muted-foreground hover:bg-accent",
											)}
										>
											<span className="truncate">{member.name}</span>
											{tempMemberId === member._id && (
												<CheckCircle
													className="h-4 w-4 text-primary"
													weight="fill"
												/>
											)}
										</button>
									))}
								</div>
							</>
						)}
					</div>
				</div>
				<div className="flex items-center justify-between border-t border-border/40 p-3">
					<Button variant="ghost" size="sm" onClick={handleClear}>
						Clear
					</Button>
					<Button size="sm" onClick={handleApply}>
						Apply filters
					</Button>
				</div>
			</PopoverContent>
		</Popover>
	);
}

// ── Loading Skeleton ────────────────────────────────────────────────────────

function PerformanceSkeleton() {
	return (
		<div className="p-6 space-y-6">
			<div className="flex items-center gap-2">
				<Skeleton className="h-4 w-4" />
				<Skeleton className="h-4 w-48" />
			</div>
			<div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
				{[1, 2, 3, 4].map((i) => (
					<Card key={i} className="border-border/60 bg-card/70">
						<CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
							<Skeleton className="h-4 w-28" />
							<Skeleton className="h-8 w-8 rounded-full" />
						</CardHeader>
						<CardContent className="space-y-2">
							<Skeleton className="h-7 w-16" />
							<Skeleton className="h-3 w-32" />
						</CardContent>
					</Card>
				))}
			</div>
			<div className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
				<Card className="border-border/60 bg-card/70">
					<CardHeader className="space-y-0 pb-4">
						<Skeleton className="h-5 w-36" />
						<Skeleton className="mt-1 h-3 w-48" />
					</CardHeader>
					<CardContent>
						<Skeleton className="h-[180px] w-full" />
					</CardContent>
				</Card>
				<div className="space-y-4">
					<Card className="border-border/60 bg-card/70">
						<CardHeader className="space-y-0 pb-4">
							<Skeleton className="h-5 w-24" />
						</CardHeader>
						<CardContent>
							<Skeleton className="h-20 w-full" />
						</CardContent>
					</Card>
					<Card className="border-border/60 bg-card/70">
						<CardHeader className="space-y-0 pb-4">
							<Skeleton className="h-5 w-28" />
						</CardHeader>
						<CardContent>
							<Skeleton className="h-[140px] w-full" />
						</CardContent>
					</Card>
				</div>
			</div>
			<Card className="border-border/60 bg-card/70">
				<CardHeader className="space-y-0 pb-4">
					<Skeleton className="h-5 w-32" />
				</CardHeader>
				<CardContent>
					<Skeleton className="h-[200px] w-full" />
				</CardContent>
			</Card>
		</div>
	);
}

// ── Main Component ──────────────────────────────────────────────────────────

export function PerformanceContent() {
	const { workspaceId, workspaceSlug, workspaceName } = useWorkspace();

	// Fixed reference point for date range (set once on mount)
	const [now] = useState(() => {
		const d = new Date();
		d.setHours(23, 59, 59, 999);
		return d.getTime();
	});

	const [rangeId, setRangeId] = useState<RangeId>("30d");
	const [selectedProjectId, setSelectedProjectId] = useState("all");
	const [selectedMemberId, setSelectedMemberId] = useState("all");
	const [dateRange, setDateRange] = useState<{ start: string; end: string }>({
		start: "",
		end: "",
	});
	const [isCustomRangeOpen, setIsCustomRangeOpen] = useState(false);
	const [isExporting, setIsExporting] = useState(false);

	// Compute date range in milliseconds for query
	const rangeMs = useMemo(() => {
		if (rangeId === "custom" && dateRange.start && dateRange.end) {
			const parsedStart = new Date(`${dateRange.start}T00:00:00`).getTime();
			const parsedEnd = new Date(`${dateRange.end}T23:59:59`).getTime();
			const start = parsedStart <= parsedEnd ? parsedStart : parsedEnd;
			const end = parsedStart <= parsedEnd ? parsedEnd : parsedStart;
			return { start, end };
		}
		const range = RANGE_OPTIONS.find((r) => r.id === rangeId);
		const days = range && "days" in range ? range.days : 30;
		return {
			start: now - (days - 1) * MS_DAY,
			end: now,
		};
	}, [rangeId, dateRange.start, dateRange.end, now]);

	const rangeLabel = useMemo(
		() =>
			`${format(rangeMs.start, "MMM d")} - ${format(rangeMs.end, "MMM d, yyyy")}`,
		[rangeMs.start, rangeMs.end],
	);

	const data = useQuery(api.analytics.workspaceOverview, {
		workspaceId,
		rangeStartMs: rangeMs.start,
		rangeEndMs: rangeMs.end,
		projectId:
			selectedProjectId !== "all"
				? (selectedProjectId as Id<"projects">)
				: undefined,
		memberId:
			selectedMemberId !== "all"
				? (selectedMemberId as Id<"users">)
				: undefined,
	});

	const projectList = useWorkspaceProjects();
	const memberList = useWorkspaceMembers();

	const projectOptions: FilterProject[] = useMemo(
		() =>
			(projectList ?? []).map((project) => ({
				_id: project._id as string,
				name: project.name,
			})),
		[projectList],
	);

	const memberOptions: FilterMember[] = useMemo(
		() =>
			(memberList ?? [])
				.map((member) => ({
					_id: member.userId as string,
					name: member.user?.name ?? member.user?.email ?? "Unknown",
				}))
				.sort((a, b) => a.name.localeCompare(b.name)),
		[memberList],
	);

	useEffect(() => {
		if (selectedMemberId === "all") return;
		if (!memberOptions.find((member) => member._id === selectedMemberId)) {
			setSelectedMemberId("all");
		}
	}, [memberOptions, selectedMemberId]);

	const selectedProjectLabel =
		selectedProjectId === "all"
			? "All projects"
			: (projectOptions.find((project) => project._id === selectedProjectId)
					?.name ?? "Unknown project");
	const selectedMemberLabel =
		selectedMemberId === "all"
			? "All members"
			: (memberOptions.find((member) => member._id === selectedMemberId)
					?.name ?? "Unknown member");

	const filterChips = useMemo(() => {
		const chips: { key: string; value: string }[] = [];
		if (selectedProjectId !== "all") {
			const project = projectOptions.find(
				(item) => item._id === selectedProjectId,
			);
			if (project) chips.push({ key: "Project", value: project.name });
		}
		if (selectedMemberId !== "all") {
			const member = memberOptions.find(
				(item) => item._id === selectedMemberId,
			);
			if (member) chips.push({ key: "Member", value: member.name });
		}
		return chips;
	}, [selectedProjectId, selectedMemberId, projectOptions, memberOptions]);

	const handleRemoveChip = (key: string, _value: string) => {
		if (key.toLowerCase() === "project") setSelectedProjectId("all");
		if (key.toLowerCase() === "member") setSelectedMemberId("all");
	};

	const kpis = useMemo(() => {
		if (!data) return [];
		const scopeLabel =
			data.scopeDelta > 0 ? `+${data.scopeDelta}` : `${data.scopeDelta}`;
		return [
			{
				title: "On-track projects",
				value: `${data.onTrackCount}/${data.activeProjectCount}`,
				description: `${data.onTrackRate}% on schedule`,
				tooltip:
					"Active or planned projects that are on track/ahead over total active/planned projects.",
				icon: <CheckCircle className="h-4 w-4" weight="fill" />,
				tone:
					data.onTrackRate >= 70
						? "positive"
						: data.onTrackRate >= 50
							? "warning"
							: "danger",
			},
			{
				title: "Overdue open issues",
				value: String(data.overdueOpenCount),
				description: "Open issues past due date",
				tooltip:
					"Open issues with due date earlier than the selected end date.",
				icon: <Clock className="h-4 w-4" />,
				tone:
					data.overdueOpenCount > 8
						? "danger"
						: data.overdueOpenCount > 3
							? "warning"
							: "neutral",
			},
			{
				title: "Completed in range",
				value: String(data.completedInRangeCount),
				description: rangeLabel,
				tooltip: "Issues moved to Done in the selected range.",
				icon: <ChartBar className="h-4 w-4" />,
				tone: data.completedInRangeCount > 10 ? "positive" : "neutral",
			},
			{
				title: "Cycle time (P50)",
				value: `${data.cycleTimeP50Days}d`,
				description: "Median days from create to done",
				tooltip:
					"Median completion time for issues done during the selected range.",
				icon: <CalendarBlank className="h-4 w-4" />,
				tone:
					data.cycleTimeP50Days <= 3
						? "positive"
						: data.cycleTimeP50Days <= 7
							? "warning"
							: "danger",
			},
			{
				title: "Blocked open issues",
				value: String(data.blockedOpenCount),
				description: "Open issues with blockers",
				tooltip:
					"Open issues that currently have at least one blocked_by relation.",
				icon: <WarningOctagon className="h-4 w-4" weight="fill" />,
				tone:
					data.blockedOpenCount > 6
						? "danger"
						: data.blockedOpenCount > 2
							? "warning"
							: "neutral",
			},
			{
				title: "Scope delta",
				value: scopeLabel,
				description: `${data.scopeCreatedInRange} created vs ${data.completedInRangeCount} done`,
				tooltip:
					"Created in range minus completed in range. Positive means scope increased.",
				icon:
					data.scopeDelta >= 0 ? (
						<ArrowUp className="h-4 w-4" />
					) : (
						<ArrowDown className="h-4 w-4" />
					),
				tone:
					data.scopeDelta <= 0
						? "positive"
						: data.scopeDelta <= 3
							? "warning"
							: "danger",
			},
		] as const;
	}, [data, rangeLabel]);

	const healthRows = data?.healthRows ?? [];
	const riskProjects = data?.riskProjects ?? [];
	const workTypeMix =
		data?.workTypeMix ??
		({ bug: 0, improvement: 0, feature: 0, issue: 0 } as const);
	const workTypeMixTotal = data?.workTypeMixTotal ?? 0;
	const throughputSeries = data?.throughputSeries ?? [];
	const scopeSeries = data?.scopeSeries ?? [];
	const filteredProjectCount = data?.filteredProjectCount ?? 0;
	const filteredIssueCount = data?.filteredIssueCount ?? 0;
	const cancellationRate = data?.cancellationRate ?? 0;
	const wipCount = data?.wipCount ?? 0;
	const blockedOpenCount = data?.blockedOpenCount ?? 0;

	const workMixPercent = {
		bug: workTypeMixTotal ? (workTypeMix.bug / workTypeMixTotal) * 100 : 0,
		improvement: workTypeMixTotal
			? (workTypeMix.improvement / workTypeMixTotal) * 100
			: 0,
		feature: workTypeMixTotal
			? (workTypeMix.feature / workTypeMixTotal) * 100
			: 0,
		issue: workTypeMixTotal ? (workTypeMix.issue / workTypeMixTotal) * 100 : 0,
	};

	const totalThroughput = throughputSeries.reduce(
		(acc, point) => acc + point.count,
		0,
	);
	const totalScopeCreated = scopeSeries.reduce(
		(acc, point) => acc + point.created,
		0,
	);
	const totalScopeCompleted = scopeSeries.reduce(
		(acc, point) => acc + point.completed,
		0,
	);

	const handleExport = async () => {
		if (!data) return;
		setIsExporting(true);
		try {
			const [{ exportAnalyticsPdf }, { format: formatDateTime }] =
				await Promise.all([
					import("@/lib/analytics/export-pdf"),
					import("date-fns"),
				]);

			exportAnalyticsPdf({
				workspaceName,
				workspaceSlug,
				rangeLabel,
				projectFilter: selectedProjectLabel,
				memberFilter: selectedMemberLabel,
				generatedAt: formatDateTime(new Date(), "MMM d, yyyy h:mm a"),
				kpis: kpis.map((kpi) => ({
					label: kpi.title,
					value: `${kpi.value} (${kpi.description})`,
				})),
				throughputSeries,
				scopeSeries,
				workTypeMix: {
					...workTypeMix,
					total: workTypeMixTotal,
				},
				riskProjects: riskProjects.map((project) => ({
					name: project.name,
					status: project.status,
					healthLabel: project.health.label,
					variance: project.variance,
					dueLabel: getDueLabel(project.daysToDue),
				})),
				healthRows: healthRows.map((project) => ({
					name: project.name,
					status: project.status,
					progress: project.progress,
					schedule: project.schedule,
					variance: project.variance,
					issueCount: project.issueCount,
					dueLabel: getDueLabel(project.daysToDue),
					healthLabel: project.health.label,
				})),
			});
		} finally {
			setIsExporting(false);
		}
	};

	return (
		<div className="flex flex-1 flex-col bg-background mx-2 my-2 border border-border rounded-lg min-w-0 overflow-y-auto">
			<header className="sticky top-0 z-10 bg-background flex flex-col border-b border-border/40">
				<div className="flex items-center justify-between px-4 py-3 border-b border-border">
					<div className="flex items-center gap-3">
						<SidebarTrigger className="h-8 w-8 rounded-lg hover:bg-accent text-muted-foreground" />
						<p className="text-base font-medium text-foreground">Performance</p>
					</div>
					<div className="flex items-center gap-2">
						<Button
							variant="ghost"
							size="sm"
							className="h-8"
							onClick={handleExport}
							disabled={!data || isExporting}
						>
							{isExporting ? "Exporting..." : "Export PDF"}
						</Button>
					</div>
				</div>

				<div className="flex items-center justify-between px-4 pb-3 pt-3">
					<div className="flex items-center gap-2">
						<PerformanceFilterPopover
							projects={projectOptions}
							members={memberOptions}
							value={{
								projectId: selectedProjectId,
								memberId: selectedMemberId,
							}}
							onApply={({ projectId, memberId }) => {
								setSelectedProjectId(projectId);
								setSelectedMemberId(memberId);
							}}
							onClear={() => {
								setSelectedProjectId("all");
								setSelectedMemberId("all");
							}}
						/>
						<ChipOverflow
							chips={filterChips}
							onRemove={handleRemoveChip}
							maxVisible={6}
						/>
					</div>
					<div className="flex items-center gap-2">
						<Select
							value={rangeId}
							onValueChange={(value) => setRangeId(value as RangeId)}
						>
							<SelectTrigger className="h-8 w-[170px] rounded-lg border-border/60 bg-transparent px-3">
								<SelectValue placeholder="Select range" />
							</SelectTrigger>
							<SelectContent>
								{RANGE_OPTIONS.map((range) => (
									<SelectItem key={range.id} value={range.id}>
										{range.label}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
						{rangeId === "custom" && (
							<Popover
								open={isCustomRangeOpen}
								onOpenChange={setIsCustomRangeOpen}
							>
								<PopoverTrigger asChild>
									<Button
										variant="outline"
										size="sm"
										className="h-8 gap-2 rounded-lg border-border/60 bg-transparent px-3"
									>
										<CalendarBlank className="h-4 w-4" />
										{rangeLabel}
									</Button>
								</PopoverTrigger>
								<PopoverContent align="end" className="w-64 rounded-xl">
									<div className="space-y-3">
										<div className="space-y-1">
											<p className="text-[11px] font-medium text-muted-foreground">
												Start date
											</p>
											<Input
												type="date"
												value={dateRange.start}
												onChange={(event) =>
													setDateRange((prev) => ({
														...prev,
														start: event.target.value,
													}))
												}
												className="h-9"
											/>
										</div>
										<div className="space-y-1">
											<p className="text-[11px] font-medium text-muted-foreground">
												End date
											</p>
											<Input
												type="date"
												value={dateRange.end}
												onChange={(event) =>
													setDateRange((prev) => ({
														...prev,
														end: event.target.value,
													}))
												}
												className="h-9"
											/>
										</div>
									</div>
								</PopoverContent>
							</Popover>
						)}
					</div>
				</div>
			</header>

			{data === undefined ? (
				<PerformanceSkeleton />
			) : (
				<div className="p-6 space-y-6">
					<div className="flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
						<div className="flex items-center gap-2">
							<CalendarBlank className="h-4 w-4" />
							<span>Showing performance for: {rangeLabel}</span>
						</div>
						<span>
							{filteredProjectCount} projects | {filteredIssueCount} issues in
							scope
						</span>
					</div>

					<div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-6">
						{kpis.map((kpi) => (
							<MetricCard
								key={kpi.title}
								title={kpi.title}
								value={kpi.value}
								description={kpi.description}
								tooltip={kpi.tooltip}
								icon={kpi.icon}
								tone={kpi.tone}
							/>
						))}
					</div>

					<div className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
						<Card className="border-border/60 bg-card/70 flex flex-col">
							<CardHeader className="flex-row items-center justify-between space-y-0 pb-4">
								<div>
									<CardTitle className="text-base font-semibold">
										Throughput trend
									</CardTitle>
									<p className="text-xs text-muted-foreground">
										Issues moved to Done in range ({rangeLabel})
									</p>
								</div>
								<div className="flex items-center gap-2 text-xs text-muted-foreground">
									Total {totalThroughput} issues
								</div>
							</CardHeader>
							<CardContent className="flex-1 flex flex-col py-10">
								{totalThroughput === 0 ? (
									<div className="rounded-lg border border-dashed border-border p-4 text-xs text-muted-foreground">
										No completed issues available for the selected range.
									</div>
								) : (
									<div className="flex flex-col flex-1">
										<div
											className="grid gap-3 items-end flex-1 min-h-[140px]"
											style={{
												gridTemplateColumns: `repeat(${throughputSeries.length}, minmax(0, 1fr))`,
											}}
										>
											{throughputSeries.map((item) => (
												<Tooltip key={item.label}>
													<TooltipTrigger asChild>
														<div className="flex h-full w-full items-end rounded-md p-1 transition-colors hover:bg-muted">
															<div
																className={cn(
																	"w-full rounded-md bg-primary/15",
																	item.count > 0 && "bg-primary/30",
																)}
																style={{
																	height: `${Math.max(8, item.height)}%`,
																}}
															>
																<div className="h-full w-full rounded-md bg-primary/70" />
															</div>
														</div>
													</TooltipTrigger>
													<TooltipContent side="top" className="text-xs">
														{item.count} issues
													</TooltipContent>
												</Tooltip>
											))}
										</div>
										<div
											className="grid gap-3 mt-3"
											style={{
												gridTemplateColumns: `repeat(${throughputSeries.length}, minmax(0, 1fr))`,
											}}
										>
											{throughputSeries.map((item) => (
												<div
													key={item.label}
													className="flex flex-col items-center gap-1"
												>
													<span className="text-[10px] text-muted-foreground text-center leading-tight">
														{item.label}
													</span>
												</div>
											))}
										</div>
									</div>
								)}
							</CardContent>
						</Card>

						<div className="space-y-4">
							<Card className="border-border/60 bg-card/70">
								<CardHeader className="flex-row items-center justify-between space-y-0 pb-4">
									<div>
										<CardTitle className="text-base font-semibold">
											Work mix
										</CardTitle>
										<p className="text-xs text-muted-foreground">
											Distribution of issue types in range
										</p>
									</div>
									<div className="text-xs text-muted-foreground">
										{workTypeMixTotal} issues
									</div>
								</CardHeader>
								<CardContent>
									{workTypeMixTotal === 0 ? (
										<div className="rounded-lg border border-dashed border-border p-4 text-xs text-muted-foreground">
											No issues available for the selected filters.
										</div>
									) : (
										<>
											<div className="h-2 w-full overflow-hidden rounded-full bg-muted">
												<div className="flex h-full w-full">
													<div
														className="h-full bg-rose-500"
														style={{ width: `${workMixPercent.bug}%` }}
													/>
													<div
														className="h-full bg-amber-500"
														style={{ width: `${workMixPercent.improvement}%` }}
													/>
													<div
														className="h-full bg-blue-500"
														style={{ width: `${workMixPercent.feature}%` }}
													/>
													<div
														className="h-full bg-slate-500"
														style={{ width: `${workMixPercent.issue}%` }}
													/>
												</div>
											</div>
											<div className="mt-4 space-y-2 text-xs text-muted-foreground">
												<div className="flex items-center justify-between">
													<span className="flex items-center gap-2">
														<span className="h-2.5 w-2.5 rounded-full bg-rose-500" />
														Bug
													</span>
													<span className="text-foreground">
														{workTypeMix.bug}
													</span>
												</div>
												<div className="flex items-center justify-between">
													<span className="flex items-center gap-2">
														<span className="h-2.5 w-2.5 rounded-full bg-amber-500" />
														Improvement
													</span>
													<span className="text-foreground">
														{workTypeMix.improvement}
													</span>
												</div>
												<div className="flex items-center justify-between">
													<span className="flex items-center gap-2">
														<span className="h-2.5 w-2.5 rounded-full bg-blue-500" />
														Feature
													</span>
													<span className="text-foreground">
														{workTypeMix.feature}
													</span>
												</div>
												<div className="flex items-center justify-between">
													<span className="flex items-center gap-2">
														<span className="h-2.5 w-2.5 rounded-full bg-slate-500" />
														Issue
													</span>
													<span className="text-foreground">
														{workTypeMix.issue}
													</span>
												</div>
											</div>
										</>
									)}
								</CardContent>
							</Card>

							<Card className="border-border/60 bg-card/70">
								<CardHeader className="space-y-0 pb-4">
									<CardTitle className="text-base font-semibold">
										Flow signals
									</CardTitle>
								</CardHeader>
								<CardContent className="space-y-3 text-xs">
									<div className="flex items-center justify-between">
										<span className="text-muted-foreground">WIP issues</span>
										<span className="font-medium text-foreground">
											{wipCount}
										</span>
									</div>
									<div className="flex items-center justify-between">
										<span className="text-muted-foreground">
											Blocked open issues
										</span>
										<span className="font-medium text-foreground">
											{blockedOpenCount}
										</span>
									</div>
									<div className="flex items-center justify-between">
										<span className="text-muted-foreground">Scope created</span>
										<span className="font-medium text-foreground">
											{totalScopeCreated}
										</span>
									</div>
									<div className="flex items-center justify-between">
										<span className="text-muted-foreground">
											Scope completed
										</span>
										<span className="font-medium text-foreground">
											{totalScopeCompleted}
										</span>
									</div>
									<div className="flex items-center justify-between">
										<span className="text-muted-foreground">
											Cancellation rate
										</span>
										<span className="font-medium text-foreground">
											{cancellationRate}%
										</span>
									</div>
								</CardContent>
							</Card>
						</div>
					</div>

					<div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
						<Card className="border-border/60 bg-card/70">
							<CardHeader className="flex-row items-center justify-between space-y-0 pb-4">
								<div>
									<CardTitle className="text-base font-semibold">
										Delivery risk
									</CardTitle>
									<p className="text-xs text-muted-foreground">
										Projects falling behind schedule
									</p>
								</div>
								<WarningOctagon
									className="h-4 w-4 text-rose-500"
									weight="fill"
								/>
							</CardHeader>
							<CardContent className="space-y-4">
								{riskProjects.length === 0 && (
									<div className="rounded-lg border border-dashed border-border p-4 text-xs text-muted-foreground">
										No projects are currently flagged as at risk.
									</div>
								)}
								{riskProjects.map((project) => (
									<div
										key={project.id}
										className="rounded-xl border border-border/60 bg-muted/20 p-4"
									>
										<div className="flex items-start justify-between gap-3">
											<div>
												<p className="text-sm font-semibold text-foreground">
													{project.name}
												</p>
												<div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
													<Badge
														className={cn(
															"rounded-full px-2 py-0.5",
															getStatusBadgeClass(project.status),
														)}
													>
														{getStatusLabel(project.status)}
													</Badge>
													<span>{project.issueCount} issues</span>
												</div>
											</div>
											<Badge
												className={cn(
													"rounded-full px-2 py-0.5",
													getHealthBadgeClass(
														project.health.tone as HealthTone,
													),
												)}
											>
												{project.health.label}
											</Badge>
										</div>
										<div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
											<div className="flex items-center gap-1">
												{project.variance < 0 ? (
													<ArrowDown className="h-3 w-3 text-rose-500" />
												) : (
													<ArrowUp className="h-3 w-3 text-emerald-500" />
												)}
												{Math.abs(project.variance)}% vs schedule
											</div>
											<span>{getDueLabel(project.daysToDue)}</span>
										</div>
									</div>
								))}
							</CardContent>
						</Card>

						<Card className="border-border/60 bg-card/70 flex flex-col">
							<CardHeader className="flex-row items-center justify-between space-y-0 pb-4">
								<div>
									<CardTitle className="text-base font-semibold">
										Scope trend
									</CardTitle>
									<p className="text-xs text-muted-foreground">
										Created vs completed issues over time ({rangeLabel})
									</p>
								</div>
							</CardHeader>
							<CardContent className="flex-1 flex flex-col space-y-10">
								{scopeSeries.length === 0 ? (
									<div className="rounded-lg border border-dashed border-border p-4 text-xs text-muted-foreground">
										No scope movement data for selected range.
									</div>
								) : (
									<>
										<div className="flex flex-col flex-1">
											<div
												className="grid items-end gap-3 flex-1 min-h-[140px]"
												style={{
													gridTemplateColumns: `repeat(${scopeSeries.length}, minmax(0, 1fr))`,
												}}
											>
												{scopeSeries.map((item) => (
													<Tooltip key={item.label}>
														<TooltipTrigger asChild>
															<div className="flex h-full w-full items-end rounded-md p-1 transition-colors hover:bg-muted">
																<div
																	className="flex w-full items-end gap-1"
																	style={{
																		height: `${Math.max(12, item.height)}%`,
																	}}
																>
																	<div
																		className="w-1/2 rounded-sm bg-amber-500/85"
																		style={{
																			height: `${
																				Math.max(item.created, item.completed) >
																				0
																					? (
																							item.created /
																								Math.max(
																									item.created,
																									item.completed,
																								)
																						) * 100
																					: 6
																			}%`,
																		}}
																	/>
																	<div
																		className="w-1/2 rounded-sm bg-emerald-500/85"
																		style={{
																			height: `${
																				Math.max(item.created, item.completed) >
																				0
																					? (
																							item.completed /
																								Math.max(
																									item.created,
																									item.completed,
																								)
																						) * 100
																					: 6
																			}%`,
																		}}
																	/>
																</div>
															</div>
														</TooltipTrigger>
														<TooltipContent side="top" className="text-xs">
															Created {item.created} | Completed{" "}
															{item.completed} | Net {item.net}
														</TooltipContent>
													</Tooltip>
												))}
											</div>
											<div
												className="grid gap-3 mt-3"
												style={{
													gridTemplateColumns: `repeat(${scopeSeries.length}, minmax(0, 1fr))`,
												}}
											>
												{scopeSeries.map((item) => (
													<div
														key={item.label}
														className="flex flex-col items-center gap-1"
													>
														<span className="text-[10px] text-muted-foreground text-center leading-tight">
															{item.label}
														</span>
													</div>
												))}
											</div>
										</div>
										<div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
											<span className="flex items-center gap-2">
												<span className="h-2.5 w-2.5 rounded-full bg-amber-500" />
												Created
											</span>
											<span className="flex items-center gap-2">
												<span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
												Completed
											</span>
										</div>
									</>
								)}
							</CardContent>
						</Card>
					</div>

					<Card className="border-border/60 bg-card/70">
						<CardHeader className="flex-row items-center justify-between space-y-0 pb-4">
							<div>
								<CardTitle className="text-base font-semibold">
									Project health
								</CardTitle>
								<p className="text-xs text-muted-foreground">
									Actual progress vs schedule and delivery status
								</p>
							</div>
							<div className="text-xs text-muted-foreground">
								{filteredProjectCount} projects tracked
							</div>
						</CardHeader>
						<CardContent>
							<Table>
								<TableHeader>
									<TableRow>
										<TableHead>Project</TableHead>
										<TableHead>Progress</TableHead>
										<TableHead>Health</TableHead>
										<TableHead>Due</TableHead>
									</TableRow>
								</TableHeader>
								<TableBody>
									{healthRows.length === 0 ? (
										<TableRow>
											<TableCell colSpan={4}>
												<div className="rounded-lg border border-dashed border-border p-4 text-xs text-muted-foreground">
													No projects match the selected filters.
												</div>
											</TableCell>
										</TableRow>
									) : (
										healthRows.map((project) => (
											<TableRow key={project.id}>
												<TableCell>
													<div className="flex items-center gap-3">
														<ProgressCircle
															progress={project.progress}
															color={getProgressColor(project.progress)}
															size={20}
														/>
														<div>
															<p className="text-sm font-medium text-foreground">
																{project.name}
															</p>
															<div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
																<Badge
																	className={cn(
																		"rounded-full px-2 py-0.5",
																		getStatusBadgeClass(project.status),
																	)}
																>
																	{getStatusLabel(project.status)}
																</Badge>
																<span>{project.issueCount} issues</span>
															</div>
														</div>
													</div>
												</TableCell>
												<TableCell>
													<div className="min-w-[180px] space-y-2">
														<div className="flex items-center justify-between text-xs text-muted-foreground">
															<span>Actual</span>
															<span className="text-foreground font-medium">
																{project.progress}%
															</span>
														</div>
														<Progress
															value={project.progress}
															className="h-2 [&_[data-slot=progress-indicator]]:bg-emerald-500"
														/>
														<div className="flex items-center justify-between text-[11px] text-muted-foreground">
															<span>Schedule</span>
															<span>{project.schedule}%</span>
														</div>
													</div>
												</TableCell>
												<TableCell>
													<div className="space-y-2">
														<Badge
															className={cn(
																"rounded-full px-2 py-0.5",
																getHealthBadgeClass(
																	project.health.tone as HealthTone,
																),
															)}
														>
															{project.health.label}
														</Badge>
														<div className="flex items-center gap-1 text-xs text-muted-foreground">
															{project.variance < 0 ? (
																<ArrowDown className="h-3 w-3 text-rose-500" />
															) : (
																<ArrowUp className="h-3 w-3 text-emerald-500" />
															)}
															{Math.abs(project.variance)}% vs schedule
														</div>
													</div>
												</TableCell>
												<TableCell>
													<div className="space-y-1">
														<div className="text-sm text-foreground">
															{format(project.endDate, "MMM d")}
														</div>
														<div
															className={cn(
																"text-xs",
																project.daysToDue < 0
																	? "text-rose-600"
																	: "text-muted-foreground",
															)}
														>
															{getDueLabel(project.daysToDue)}
														</div>
													</div>
												</TableCell>
											</TableRow>
										))
									)}
								</TableBody>
							</Table>
						</CardContent>
					</Card>
				</div>
			)}
		</div>
	);
}
