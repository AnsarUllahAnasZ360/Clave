"use client";

import { useMutation, useQuery } from "convex/react";
import { format } from "date-fns";
import { Circle, Send } from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";
import { useWorkspace } from "@/components/providers/workspace-context";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
	type EffectivePickerItem,
	useEffectiveIssueConfig,
} from "@/hooks/use-effective-issue-config";
import { cn } from "@/lib/utils";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

// ── Types ──────────────────────────────────────────────────────────────────

type ProjectDashboardProps = {
	projectId: Id<"projects">;
};

type HealthValue = "on_track" | "at_risk" | "off_track";

// ── Status config (from centralized module) ──────────────────────────────

const HEALTH_CONFIG: Record<
	HealthValue,
	{ label: string; color: string; bgColor: string; dotColor: string }
> = {
	on_track: {
		label: "On track",
		color: "text-emerald-600",
		bgColor: "bg-emerald-500/10 border-emerald-500/20",
		dotColor: "bg-emerald-500",
	},
	at_risk: {
		label: "At risk",
		color: "text-yellow-600",
		bgColor: "bg-yellow-500/10 border-yellow-500/20",
		dotColor: "bg-yellow-500",
	},
	off_track: {
		label: "Off track",
		color: "text-rose-600",
		bgColor: "bg-rose-500/10 border-rose-500/20",
		dotColor: "bg-rose-500",
	},
};

// ── Main Component ─────────────────────────────────────────────────────────

export function ProjectDashboard({ projectId }: ProjectDashboardProps) {
	const { workspaceId } = useWorkspace();
	const dashboardData = useQuery(api.analytics.projectDashboard, { projectId });
	const updates = useQuery(api.projectUpdates.listByProject, { projectId });
	const project = useQuery(api.projects.getById, { projectId });
	const effective = useEffectiveIssueConfig(workspaceId, project ?? undefined);

	if (dashboardData === undefined) {
		return <DashboardSkeleton />;
	}

	if (dashboardData === null) {
		return (
			<div className="py-8 text-center text-sm text-muted-foreground">
				Project not found.
			</div>
		);
	}

	return (
		<div className="space-y-8 py-4">
			<div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
				<KpiTile
					label="Overdue open"
					value={String(dashboardData.kpis.overdueOpenCount)}
					helper="Issues past due date"
				/>
				<KpiTile
					label="Blocked open"
					value={String(dashboardData.kpis.blockedOpenCount)}
					helper="Open issues with blockers"
				/>
				<KpiTile
					label="Cycle time P50"
					value={`${dashboardData.kpis.cycleTimeP50Days}d`}
					helper={dashboardData.kpis.rangeLabel}
				/>
				<KpiTile
					label="Scope delta"
					value={
						dashboardData.kpis.scopeDelta > 0
							? `+${dashboardData.kpis.scopeDelta}`
							: `${dashboardData.kpis.scopeDelta}`
					}
					helper="Created minus done (last 30d)"
				/>
				<KpiTile
					label="Cancellation rate"
					value={`${dashboardData.kpis.cancellationRate}%`}
					helper="Cancelled among closed (last 30d)"
				/>
			</div>

			{/* Top row: Completion donut + Status breakdown */}
			<div className="grid grid-cols-1 gap-6 md:grid-cols-[240px_minmax(0,1fr)]">
				<CompletionDonut
					completed={dashboardData.done}
					total={dashboardData.total}
					percent={dashboardData.completionPercent}
				/>
				<StatusBreakdown
					breakdown={dashboardData.statusBreakdown}
					total={dashboardData.total}
					statusItems={effective.statusItems}
				/>
			</div>

			<Separator />

			{/* Assignee breakdown */}
			<AssigneeBreakdown assignees={dashboardData.assigneeBreakdown} />

			<Separator />

			{/* Updates */}
			<section>
				<h3 className="text-sm font-medium text-muted-foreground mb-4">
					Project updates
				</h3>
				<CreateUpdateForm projectId={projectId} />
				<ProjectUpdatesFeed updates={(updates ?? []) as UpdateData[]} />
			</section>
		</div>
	);
}

function KpiTile({
	label,
	value,
	helper,
}: {
	label: string;
	value: string;
	helper: string;
}) {
	return (
		<div className="rounded-lg border border-border/70 bg-muted/20 px-3 py-3">
			<p className="text-[11px] font-medium text-muted-foreground">{label}</p>
			<p className="mt-1 text-xl font-semibold text-foreground tabular-nums">
				{value}
			</p>
			<p className="mt-1 text-[10px] text-muted-foreground">{helper}</p>
		</div>
	);
}

// ── Completion Donut ───────────────────────────────────────────────────────

function CompletionDonut({
	completed,
	total,
	percent,
}: {
	completed: number;
	total: number;
	percent: number;
}) {
	const size = 160;
	const strokeWidth = 14;
	const radius = (size - strokeWidth) / 2;
	const circumference = 2 * Math.PI * radius;
	const strokeDashoffset = circumference - (percent / 100) * circumference;

	return (
		<div className="flex flex-col items-center gap-3">
			<div className="relative" style={{ width: size, height: size }}>
				<svg
					width={size}
					height={size}
					viewBox={`0 0 ${size} ${size}`}
					className="-rotate-90"
					role="img"
					aria-label="Completion progress"
				>
					<title>Completion progress</title>
					<circle
						cx={size / 2}
						cy={size / 2}
						r={radius}
						fill="none"
						stroke="currentColor"
						strokeWidth={strokeWidth}
						className="text-muted/40"
					/>
					<circle
						cx={size / 2}
						cy={size / 2}
						r={radius}
						fill="none"
						stroke="currentColor"
						strokeWidth={strokeWidth}
						strokeDasharray={circumference}
						strokeDashoffset={strokeDashoffset}
						strokeLinecap="round"
						className="text-emerald-500 transition-all duration-500"
					/>
				</svg>
				<div className="absolute inset-0 flex flex-col items-center justify-center">
					<span className="text-3xl font-semibold text-foreground tabular-nums">
						{percent}%
					</span>
					<span className="text-xs text-muted-foreground">complete</span>
				</div>
			</div>
			<p className="text-xs text-muted-foreground">
				{completed} of {total} issues done
			</p>
		</div>
	);
}

// ── Status Breakdown ───────────────────────────────────────────────────────

function StatusBreakdown({
	breakdown,
	total,
	statusItems,
}: {
	breakdown: { status: string; count: number; percent: number }[];
	total: number;
	statusItems: EffectivePickerItem[];
}) {
	const statusOrder = statusItems.map((s) => s.id);
	const sorted = [...breakdown].sort((a, b) => {
		const ai = statusOrder.indexOf(a.status);
		const bi = statusOrder.indexOf(b.status);
		return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
	});

	if (total === 0) {
		return (
			<div className="flex items-center justify-center rounded-lg border border-dashed border-border/70 bg-muted/30 p-6 text-sm text-muted-foreground">
				No issues in this project yet.
			</div>
		);
	}

	return (
		<div className="space-y-3">
			<h3 className="text-sm font-medium text-muted-foreground">
				Issues by status
			</h3>
			<div className="space-y-2">
				{sorted.map((item) => {
					const config = statusItems.find((s) => s.id === item.status);
					const Icon = config?.icon ?? Circle;
					const colorHex = config?.colorHex ?? "#6b7280";

					return (
						<div key={item.status} className="flex items-center gap-3">
							<div className="flex items-center gap-2 w-28 shrink-0">
								<Icon className="h-3.5 w-3.5" style={{ color: colorHex }} />
								<span className="text-xs text-foreground truncate">
									{config?.label ?? item.status}
								</span>
							</div>
							<div className="flex-1 h-2 rounded-full bg-muted/40 overflow-hidden">
								<div
									className="h-full rounded-full transition-all"
									style={{
										width: `${item.percent}%`,
										backgroundColor: colorHex,
									}}
								/>
							</div>
							<span className="text-xs text-muted-foreground tabular-nums w-8 text-right">
								{item.count}
							</span>
						</div>
					);
				})}
			</div>
		</div>
	);
}

// ── Assignee Breakdown ─────────────────────────────────────────────────────

function AssigneeBreakdown({
	assignees,
}: {
	assignees: {
		userId: string;
		name: string;
		image?: string;
		total: number;
		completed: number;
		completionRate: number;
	}[];
}) {
	if (assignees.length === 0) {
		return (
			<section>
				<h3 className="text-sm font-medium text-muted-foreground mb-3">
					Issues by assignee
				</h3>
				<div className="rounded-lg border border-dashed border-border/70 bg-muted/30 px-4 py-6 text-center text-sm text-muted-foreground">
					No assignees yet.
				</div>
			</section>
		);
	}

	const maxTotal = Math.max(...assignees.map((a) => a.total), 1);

	return (
		<section>
			<h3 className="text-sm font-medium text-muted-foreground mb-3">
				Issues by assignee
			</h3>
			<div className="space-y-3">
				{assignees.map((assignee) => {
					const barWidth = Math.round((assignee.total / maxTotal) * 100);

					return (
						<div key={assignee.userId} className="flex items-center gap-3">
							<div className="flex items-center gap-2 w-36 shrink-0">
								<Avatar className="h-5 w-5">
									<AvatarImage src={assignee.image} alt={assignee.name} />
									<AvatarFallback className="text-[10px]">
										{assignee.name.charAt(0).toUpperCase()}
									</AvatarFallback>
								</Avatar>
								<span className="text-xs text-foreground truncate">
									{assignee.name}
								</span>
							</div>
							<div className="flex-1 h-2 rounded-full bg-muted/40 overflow-hidden">
								<div
									className="h-full rounded-full bg-primary/70 transition-all"
									style={{ width: `${barWidth}%` }}
								/>
							</div>
							<div className="flex items-center gap-2 shrink-0">
								<span className="text-xs text-muted-foreground tabular-nums">
									{assignee.completed}/{assignee.total}
								</span>
								<span className="text-[10px] text-muted-foreground tabular-nums w-8 text-right">
									{assignee.completionRate}%
								</span>
							</div>
						</div>
					);
				})}
			</div>
		</section>
	);
}

// ── Create Update Form ─────────────────────────────────────────────────────

function CreateUpdateForm({ projectId }: { projectId: Id<"projects"> }) {
	const createUpdate = useMutation(api.projectUpdates.create);
	const [health, setHealth] = useState<HealthValue>("on_track");
	const [body, setBody] = useState("");
	const [isSubmitting, setIsSubmitting] = useState(false);
	const textareaRef = useRef<HTMLTextAreaElement>(null);

	const handleSubmit = useCallback(async () => {
		if (!body.trim()) {
			toast.error("Update body is required");
			return;
		}
		setIsSubmitting(true);
		try {
			await createUpdate({ projectId, health, body: body.trim() });
			setBody("");
			setHealth("on_track");
			toast.success("Update posted");
		} catch {
			toast.error("Failed to post update");
		} finally {
			setIsSubmitting(false);
		}
	}, [body, health, projectId, createUpdate]);

	const handleKeyDown = useCallback(
		(e: React.KeyboardEvent) => {
			if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
				e.preventDefault();
				handleSubmit();
			}
		},
		[handleSubmit],
	);

	return (
		<div className="rounded-lg border border-border p-3 mb-4 space-y-3">
			<div className="flex items-center gap-2">
				{(Object.keys(HEALTH_CONFIG) as HealthValue[]).map((key) => {
					const cfg = HEALTH_CONFIG[key];
					const isSelected = health === key;

					return (
						<button
							key={key}
							type="button"
							onClick={() => setHealth(key)}
							className={cn(
								"flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium border transition-colors cursor-pointer",
								isSelected
									? cfg.bgColor
									: "border-border bg-transparent text-muted-foreground hover:bg-muted",
							)}
						>
							<span
								className={cn(
									"h-2 w-2 rounded-full",
									isSelected ? cfg.dotColor : "bg-muted-foreground/40",
								)}
							/>
							{cfg.label}
						</button>
					);
				})}
			</div>
			<textarea
				ref={textareaRef}
				value={body}
				onChange={(e) => setBody(e.target.value)}
				onKeyDown={handleKeyDown}
				placeholder="Post a status update for your team..."
				rows={2}
				className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring resize-none"
			/>
			<div className="flex items-center justify-between">
				<span className="text-[10px] text-muted-foreground">
					Cmd+Enter to post
				</span>
				<Button
					size="sm"
					className="h-7 gap-1.5 text-xs"
					onClick={handleSubmit}
					disabled={isSubmitting || !body.trim()}
				>
					<Send className="h-3 w-3" />
					Post update
				</Button>
			</div>
		</div>
	);
}

// ── Project Updates Feed ───────────────────────────────────────────────────

type UpdateData = {
	_id: string;
	_creationTime: number;
	health: HealthValue;
	body: string;
	authorName: string;
	authorImage?: string;
};

function ProjectUpdatesFeed({ updates }: { updates: UpdateData[] }) {
	if (updates.length === 0) {
		return (
			<div className="rounded-lg border border-dashed border-border/70 bg-muted/30 px-4 py-6 text-center text-sm text-muted-foreground">
				No updates yet. Post the first status update above.
			</div>
		);
	}

	return (
		<div className="space-y-3">
			{updates.map((update) => {
				const cfg = HEALTH_CONFIG[update.health];

				return (
					<div
						key={update._id}
						className={cn("rounded-lg border px-4 py-3", cfg.bgColor)}
					>
						<div className="flex items-center gap-2 mb-2">
							<span
								className={cn("h-2 w-2 rounded-full shrink-0", cfg.dotColor)}
							/>
							<span className={cn("text-xs font-medium", cfg.color)}>
								{cfg.label}
							</span>
							<span className="text-xs text-muted-foreground">
								{format(
									new Date(update._creationTime),
									"MMM d, yyyy 'at' h:mm a",
								)}
							</span>
						</div>
						<p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">
							{update.body}
						</p>
						<div className="flex items-center gap-1.5 mt-2">
							<Avatar className="h-4 w-4">
								<AvatarImage src={update.authorImage} alt={update.authorName} />
								<AvatarFallback className="text-[8px]">
									{update.authorName.charAt(0).toUpperCase()}
								</AvatarFallback>
							</Avatar>
							<span className="text-[11px] text-muted-foreground">
								{update.authorName}
							</span>
						</div>
					</div>
				);
			})}
		</div>
	);
}

// ── Skeleton ───────────────────────────────────────────────────────────────

function DashboardSkeleton() {
	return (
		<div className="space-y-8 py-4">
			<div className="grid grid-cols-1 gap-6 md:grid-cols-[240px_minmax(0,1fr)]">
				<div className="flex flex-col items-center gap-3">
					<Skeleton className="h-40 w-40 rounded-full" />
					<Skeleton className="h-3 w-24" />
				</div>
				<div className="space-y-3">
					<Skeleton className="h-4 w-28" />
					<Skeleton className="h-6 w-full" />
					<Skeleton className="h-6 w-full" />
					<Skeleton className="h-6 w-full" />
					<Skeleton className="h-6 w-3/4" />
				</div>
			</div>
			<Skeleton className="h-px w-full" />
			<div className="space-y-3">
				<Skeleton className="h-4 w-28" />
				<Skeleton className="h-6 w-full" />
				<Skeleton className="h-6 w-full" />
			</div>
			<Skeleton className="h-px w-full" />
			<div className="space-y-3">
				<Skeleton className="h-4 w-28" />
				<Skeleton className="h-16 w-full" />
			</div>
		</div>
	);
}
