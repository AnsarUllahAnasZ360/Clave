"use client";

import { useQuery } from "convex/react";
import { format } from "date-fns";
import { Calendar, CircleCheck, TrendingUp, Zap } from "lucide-react";
import {
	Bar,
	BarChart,
	CartesianGrid,
	Cell,
	Line,
	LineChart,
	XAxis,
	YAxis,
} from "recharts";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import {
	type ChartConfig,
	ChartContainer,
	ChartTooltip,
	ChartTooltipContent,
} from "@/components/ui/chart";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

interface SprintReportsProps {
	sprintId: Id<"sprints">;
	projectId: Id<"projects">;
}

const burndownConfig = {
	remaining: { label: "Remaining", color: "var(--chart-1)" },
	ideal: { label: "Ideal", color: "var(--chart-3)" },
} satisfies ChartConfig;

const velocityConfig = {
	completedCount: { label: "Completed", color: "var(--chart-1)" },
	totalCount: { label: "Committed", color: "var(--muted)" },
} satisfies ChartConfig;

const priorityConfig = {
	count: { label: "Issues", color: "var(--chart-1)" },
} satisfies ChartConfig;

const workloadConfig = {
	open: { label: "Open", color: "var(--chart-1)" },
	completed: { label: "Completed", color: "var(--chart-3)" },
} satisfies ChartConfig;

// Status palette — matches the status swatches used elsewhere in the app.
const STATUS_META: Record<string, { label: string; hex: string }> = {
	backlog: { label: "Backlog", hex: "#94a3b8" },
	triage: { label: "Triage", hex: "#f97316" },
	todo: { label: "To do", hex: "#64748b" },
	in_progress: { label: "In progress", hex: "#eab308" },
	in_review: { label: "In review", hex: "#a855f7" },
	done: { label: "Done", hex: "#22c55e" },
	cancelled: { label: "Cancelled", hex: "#9ca3af" },
};

const PRIORITY_META: Record<
	string,
	{ label: string; hex: string; sort: number }
> = {
	urgent: { label: "Urgent", hex: "#ef4444", sort: 0 },
	high: { label: "High", hex: "#f97316", sort: 1 },
	medium: { label: "Medium", hex: "#eab308", sort: 2 },
	low: { label: "Low", hex: "#3b82f6", sort: 3 },
	no_priority: { label: "No priority", hex: "#94a3b8", sort: 4 },
};

function priorityHex(priority: string): string {
	return PRIORITY_META[priority]?.hex ?? "#94a3b8";
}

function sortedPriorityRows(
	rows: { priority: string; count: number }[],
): { priority: string; label: string; count: number }[] {
	return [...rows]
		.map((r) => ({
			priority: r.priority,
			label: PRIORITY_META[r.priority]?.label ?? r.priority,
			count: r.count,
			sort: PRIORITY_META[r.priority]?.sort ?? 99,
		}))
		.sort((a, b) => a.sort - b.sort)
		.map(({ priority, label, count }) => ({ priority, label, count }));
}

/**
 * Jira-style reports tab for a sprint:
 *   - Summary stats (committed, completed, open, progress%, on-track)
 *   - Burndown line chart (actual vs ideal) across the sprint window
 *   - Velocity bar chart across the last ~6 sprints in the project
 *
 * Backend math lives in `convex/sprints.ts` (`burndownData`,
 * `velocityByProject`) so this component stays presentational.
 */
export function SprintReports({ sprintId, projectId }: SprintReportsProps) {
	const burndown = useQuery(api.sprints.burndownData, { sprintId });
	const velocity = useQuery(api.sprints.velocityByProject, {
		projectId,
		limit: 6,
	});

	if (burndown === undefined) {
		return (
			<div className="p-6 space-y-4">
				<Skeleton className="h-24 w-full" />
				<Skeleton className="h-72 w-full" />
				<Skeleton className="h-72 w-full" />
			</div>
		);
	}

	const hasSchedule =
		burndown.startDate !== undefined && burndown.endDate !== undefined;
	const progress =
		burndown.totalIssues > 0
			? Math.round((burndown.completedIssues / burndown.totalIssues) * 100)
			: 0;

	// "On track" = actual remaining at the most recent sampled day is at
	// or below the ideal line for that day. We compare the latest filled
	// (non-null) remaining against its paired ideal.
	const latest = [...burndown.points]
		.reverse()
		.find((p) => p.remaining !== null);
	const onTrack =
		latest !== undefined && (latest.remaining as number) <= latest.ideal;

	return (
		<div className="p-6 space-y-6">
			{/* Summary */}
			<div className="grid grid-cols-2 md:grid-cols-4 gap-3">
				<SummaryTile
					icon={<Zap className="h-4 w-4" />}
					label="Committed"
					value={String(burndown.totalIssues)}
				/>
				<SummaryTile
					icon={<CircleCheck className="h-4 w-4 text-emerald-500" />}
					label="Completed"
					value={String(burndown.completedIssues)}
					hint={`${progress}%`}
				/>
				<SummaryTile
					icon={<TrendingUp className="h-4 w-4 text-sienna-500" />}
					label="Open"
					value={String(burndown.openIssues)}
				/>
				<SummaryTile
					icon={<Calendar className="h-4 w-4 text-muted-foreground" />}
					label="Schedule"
					value={
						hasSchedule && burndown.startDate && burndown.endDate
							? `${format(burndown.startDate, "MMM d")} – ${format(burndown.endDate, "MMM d")}`
							: "Not set"
					}
					hint={hasSchedule ? (onTrack ? "On track" : "Behind") : undefined}
					hintTone={hasSchedule ? (onTrack ? "good" : "warn") : undefined}
				/>
			</div>

			{/* Burndown */}
			<Card>
				<CardHeader>
					<CardTitle className="text-base">Burndown</CardTitle>
					<CardDescription>
						Issues remaining each day vs a linear ideal trend.
					</CardDescription>
				</CardHeader>
				<CardContent>
					{!hasSchedule ? (
						<EmptyState message="Set a start and end date on this sprint to see its burndown." />
					) : burndown.points.length === 0 ? (
						<EmptyState message="No burndown data yet." />
					) : (
						<ChartContainer
							config={burndownConfig}
							className="h-[280px] w-full"
						>
							<LineChart data={burndown.points}>
								<CartesianGrid vertical={false} strokeOpacity={0.2} />
								<XAxis
									dataKey="day"
									tickFormatter={(value: number) => format(value, "MMM d")}
									tickLine={false}
									axisLine={false}
									tickMargin={8}
								/>
								<YAxis
									tickLine={false}
									axisLine={false}
									tickMargin={8}
									allowDecimals={false}
								/>
								<ChartTooltip
									content={
										<ChartTooltipContent
											labelFormatter={(value) => {
												// Recharts can pass the label through in states
												// where no point is hovered yet (axis hover /
												// initial mount). Guard so an invalid Date
												// doesn't crash the tooltip with `RangeError:
												// Invalid time value`.
												const n = Number(value);
												if (!Number.isFinite(n)) return String(value ?? "");
												return format(n, "MMM d, yyyy");
											}}
										/>
									}
								/>
								<Line
									type="monotone"
									dataKey="ideal"
									stroke="var(--color-ideal)"
									strokeDasharray="4 4"
									strokeWidth={1.5}
									dot={false}
									isAnimationActive={false}
								/>
								<Line
									type="monotone"
									dataKey="remaining"
									stroke="var(--color-remaining)"
									strokeWidth={2}
									dot={{ r: 2 }}
									connectNulls={false}
									isAnimationActive={false}
								/>
							</LineChart>
						</ChartContainer>
					)}
				</CardContent>
			</Card>

			{/* Status + Priority side by side */}
			<div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
				<Card>
					<CardHeader>
						<CardTitle className="text-base">Status breakdown</CardTitle>
						<CardDescription>
							How the sprint's work is distributed across statuses right now.
						</CardDescription>
					</CardHeader>
					<CardContent>
						{burndown.statusBreakdown.length === 0 ? (
							<EmptyState message="No issues in this sprint yet." />
						) : (
							<StatusBar
								breakdown={burndown.statusBreakdown}
								total={burndown.totalIssues}
							/>
						)}
					</CardContent>
				</Card>

				<Card>
					<CardHeader>
						<CardTitle className="text-base">Priority distribution</CardTitle>
						<CardDescription>
							Count of issues at each priority level.
						</CardDescription>
					</CardHeader>
					<CardContent>
						{burndown.priorityBreakdown.length === 0 ? (
							<EmptyState message="No issues in this sprint yet." />
						) : (
							<ChartContainer
								config={priorityConfig}
								className="h-[200px] w-full"
							>
								<BarChart data={sortedPriorityRows(burndown.priorityBreakdown)}>
									<CartesianGrid vertical={false} strokeOpacity={0.2} />
									<XAxis
										dataKey="label"
										tickLine={false}
										axisLine={false}
										tickMargin={8}
									/>
									<YAxis
										tickLine={false}
										axisLine={false}
										tickMargin={8}
										allowDecimals={false}
									/>
									<ChartTooltip content={<ChartTooltipContent />} />
									<Bar dataKey="count" radius={[4, 4, 0, 0]}>
										{sortedPriorityRows(burndown.priorityBreakdown).map((p) => (
											<Cell key={p.priority} fill={priorityHex(p.priority)} />
										))}
									</Bar>
								</BarChart>
							</ChartContainer>
						)}
					</CardContent>
				</Card>
			</div>

			{/* Assignee workload + Velocity side by side on wide screens */}
			<div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
				<Card>
					<CardHeader>
						<CardTitle className="text-base">Assignee workload</CardTitle>
						<CardDescription>
							Open vs completed issues in this sprint, per assignee.
						</CardDescription>
					</CardHeader>
					<CardContent>
						{burndown.assigneeWorkload.length === 0 ? (
							<EmptyState message="No assignees to show." />
						) : (
							<ChartContainer
								config={workloadConfig}
								className="h-[260px] w-full"
							>
								<BarChart
									data={burndown.assigneeWorkload}
									layout="vertical"
									margin={{ left: 16, right: 16 }}
								>
									<CartesianGrid horizontal={false} strokeOpacity={0.2} />
									<XAxis
										type="number"
										tickLine={false}
										axisLine={false}
										allowDecimals={false}
									/>
									<YAxis
										type="category"
										dataKey="name"
										tickLine={false}
										axisLine={false}
										tickMargin={8}
										width={100}
									/>
									<ChartTooltip content={<ChartTooltipContent />} />
									<Bar
										dataKey="completed"
										stackId="a"
										fill="var(--color-completed)"
										radius={[0, 0, 0, 0]}
									/>
									<Bar
										dataKey="open"
										stackId="a"
										fill="var(--color-open)"
										radius={[0, 4, 4, 0]}
									/>
								</BarChart>
							</ChartContainer>
						)}
					</CardContent>
				</Card>

				{/* Velocity */}
				<Card>
					<CardHeader>
						<CardTitle className="text-base">Velocity</CardTitle>
						<CardDescription>
							Completed vs committed work across the last sprints in this
							project.
						</CardDescription>
					</CardHeader>
					<CardContent>
						{velocity === undefined ? (
							<Skeleton className="h-[240px] w-full" />
						) : velocity.length === 0 ? (
							<EmptyState message="No sprint history yet." />
						) : (
							<ChartContainer
								config={velocityConfig}
								className="h-[240px] w-full"
							>
								<BarChart data={velocity}>
									<CartesianGrid vertical={false} strokeOpacity={0.2} />
									<XAxis
										dataKey="name"
										tickLine={false}
										axisLine={false}
										tickMargin={8}
									/>
									<YAxis
										tickLine={false}
										axisLine={false}
										tickMargin={8}
										allowDecimals={false}
									/>
									<ChartTooltip content={<ChartTooltipContent />} />
									<Bar
										dataKey="totalCount"
										fill="var(--color-totalCount)"
										radius={[4, 4, 0, 0]}
									/>
									<Bar
										dataKey="completedCount"
										fill="var(--color-completedCount)"
										radius={[4, 4, 0, 0]}
									/>
								</BarChart>
							</ChartContainer>
						)}
					</CardContent>
				</Card>
			</div>
		</div>
	);
}

function SummaryTile({
	icon,
	label,
	value,
	hint,
	hintTone,
}: {
	icon: React.ReactNode;
	label: string;
	value: string;
	hint?: string;
	hintTone?: "good" | "warn";
}) {
	return (
		<Card>
			<CardContent className="p-4">
				<div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
					{icon}
					{label}
				</div>
				<div className="text-2xl font-semibold tabular-nums">{value}</div>
				{hint ? (
					<div
						className={cn(
							"text-xs mt-0.5",
							hintTone === "good" && "text-emerald-500",
							hintTone === "warn" && "text-red-500",
							!hintTone && "text-muted-foreground",
						)}
					>
						{hint}
					</div>
				) : null}
			</CardContent>
		</Card>
	);
}

function StatusBar({
	breakdown,
	total,
}: {
	breakdown: { status: string; count: number }[];
	total: number;
}) {
	// Preserve the app's status order when rendering the stacked bar.
	const order = [
		"backlog",
		"triage",
		"todo",
		"in_progress",
		"in_review",
		"done",
		"cancelled",
	];
	const sorted = [...breakdown].sort(
		(a, b) => order.indexOf(a.status) - order.indexOf(b.status),
	);
	return (
		<div className="space-y-3">
			<div className="flex h-4 w-full overflow-hidden rounded-md bg-muted">
				{sorted.map((row) => {
					const pct = total > 0 ? (row.count / total) * 100 : 0;
					const meta = STATUS_META[row.status] ?? {
						label: row.status,
						hex: "#94a3b8",
					};
					return (
						<div
							key={row.status}
							title={`${meta.label}: ${row.count}`}
							className="h-full"
							style={{ width: `${pct}%`, backgroundColor: meta.hex }}
						/>
					);
				})}
			</div>
			<div className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs">
				{sorted.map((row) => {
					const meta = STATUS_META[row.status] ?? {
						label: row.status,
						hex: "#94a3b8",
					};
					return (
						<div key={row.status} className="flex items-center gap-1.5">
							<span
								className="h-2 w-2 rounded-full"
								style={{ backgroundColor: meta.hex }}
							/>
							<span className="text-muted-foreground">{meta.label}</span>
							<span className="font-medium tabular-nums">{row.count}</span>
						</div>
					);
				})}
			</div>
		</div>
	);
}

function EmptyState({ message }: { message: string }) {
	return (
		<div className="h-[200px] flex items-center justify-center text-sm text-muted-foreground">
			{message}
		</div>
	);
}
