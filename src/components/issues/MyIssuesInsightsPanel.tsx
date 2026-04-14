"use client";

import { X } from "lucide-react";
import { useMemo } from "react";

import { useWorkspace } from "@/components/providers/workspace-context";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { useEffectiveIssueConfig } from "@/hooks/use-effective-issue-config";
import { DEFAULT_PRIORITIES, PRIORITY_LABELS } from "@/lib/issue-config";

// ── Types ──────────────────────────────────────────────────────────────────

type InsightIssue = {
	status: string;
	priority: string;
};

type MyIssuesInsightsPanelProps = {
	issues: InsightIssue[];
	onClose: () => void;
};

// ── Priority config (derived from centralized module) ────────────────────

const PRIORITY_ORDER = ["urgent", "high", "medium", "low", "no_priority"];

const PRIORITY_ICONS: Record<string, React.ReactNode> = Object.fromEntries(
	DEFAULT_PRIORITIES.map((p) => {
		const Icon = p.icon;
		return [p.key, <Icon key={p.key} className={`h-3.5 w-3.5 ${p.color}`} />];
	}),
);

// ── Component ──────────────────────────────────────────────────────────────

export function MyIssuesInsightsPanel({
	issues,
	onClose,
}: MyIssuesInsightsPanelProps) {
	const { workspaceId } = useWorkspace();
	const effective = useEffectiveIssueConfig(workspaceId);
	const statusItems = effective.statusItems;
	const STATUS_ORDER = useMemo(
		() => statusItems.map((s) => s.id),
		[statusItems],
	);
	const STATUS_LABELS = useMemo<Record<string, string>>(
		() => Object.fromEntries(statusItems.map((s) => [s.id, s.label])),
		[statusItems],
	);
	const STATUS_ICONS = useMemo<Record<string, React.ReactNode>>(
		() =>
			Object.fromEntries(
				statusItems.map((s) => [
					s.id,
					<s.icon
						key={s.id}
						className="h-3.5 w-3.5"
						style={{ color: s.colorHex }}
					/>,
				]),
			),
		[statusItems],
	);
	const STATUS_COLOR_HEX = useMemo<Record<string, string>>(
		() => Object.fromEntries(statusItems.map((s) => [s.id, s.colorHex])),
		[statusItems],
	);

	const total = issues.length;

	// Compute status breakdown
	const statusBreakdown = useMemo(() => {
		const counts = new Map<string, number>();
		for (const issue of issues) {
			counts.set(issue.status, (counts.get(issue.status) ?? 0) + 1);
		}
		return STATUS_ORDER.map((status) => ({
			status,
			count: counts.get(status) ?? 0,
		})).filter((s) => s.count > 0);
	}, [issues, STATUS_ORDER]);

	// Compute priority breakdown
	const priorityBreakdown = useMemo(() => {
		const counts = new Map<string, number>();
		for (const issue of issues) {
			counts.set(issue.priority, (counts.get(issue.priority) ?? 0) + 1);
		}
		return PRIORITY_ORDER.map((priority) => ({
			priority,
			count: counts.get(priority) ?? 0,
		})).filter((p) => p.count > 0);
	}, [issues]);

	return (
		<div className="w-[280px] shrink-0 border-l border-border bg-background overflow-y-auto">
			{/* Header */}
			<div className="flex items-center justify-between px-4 py-2.5 border-b border-border/70">
				<h2 className="text-xs font-medium text-foreground">Insights</h2>
				<Button
					variant="ghost"
					size="sm"
					onClick={onClose}
					className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground"
				>
					<X className="h-3.5 w-3.5" />
				</Button>
			</div>

			<div className="px-4 py-4 space-y-5">
				{/* Total count */}
				<div>
					<span className="text-2xl font-semibold text-foreground tabular-nums">
						{total}
					</span>
					<span className="text-sm text-muted-foreground ml-1.5">
						issue{total !== 1 ? "s" : ""}
					</span>
				</div>

				{/* Status stacked bar */}
				{total > 0 && (
					<div className="space-y-2">
						<h3 className="text-xs font-medium text-muted-foreground">
							Status distribution
						</h3>
						<div className="flex h-2.5 rounded-full overflow-hidden bg-muted/40">
							{statusBreakdown.map((item) => {
								const pct = (item.count / total) * 100;
								return (
									<div
										key={item.status}
										className="h-full transition-all"
										style={{
											width: `${pct}%`,
											backgroundColor:
												STATUS_COLOR_HEX[item.status] ?? "#6b7280",
										}}
										title={`${STATUS_LABELS[item.status]}: ${item.count}`}
									/>
								);
							})}
						</div>
					</div>
				)}

				<Separator />

				{/* Status breakdown table */}
				<div className="space-y-2">
					<h3 className="text-xs font-medium text-muted-foreground">
						By status
					</h3>
					<div className="space-y-1">
						{statusBreakdown.map((item) => {
							const pct =
								total > 0 ? Math.round((item.count / total) * 100) : 0;
							return (
								<div key={item.status} className="flex items-center gap-2 py-1">
									<span className="shrink-0">{STATUS_ICONS[item.status]}</span>
									<span className="text-xs text-foreground flex-1 truncate">
										{STATUS_LABELS[item.status] ?? item.status}
									</span>
									<span className="text-xs text-muted-foreground tabular-nums shrink-0">
										{item.count}
									</span>
									<span className="text-[10px] text-muted-foreground/70 tabular-nums w-8 text-right shrink-0">
										{pct}%
									</span>
								</div>
							);
						})}
					</div>
				</div>

				<Separator />

				{/* Priority breakdown table */}
				<div className="space-y-2">
					<h3 className="text-xs font-medium text-muted-foreground">
						By priority
					</h3>
					<div className="space-y-1">
						{priorityBreakdown.map((item) => {
							const pct =
								total > 0 ? Math.round((item.count / total) * 100) : 0;
							return (
								<div
									key={item.priority}
									className="flex items-center gap-2 py-1"
								>
									<span className="shrink-0">
										{PRIORITY_ICONS[item.priority]}
									</span>
									<span className="text-xs text-foreground flex-1 truncate">
										{PRIORITY_LABELS[item.priority] ?? item.priority}
									</span>
									<span className="text-xs text-muted-foreground tabular-nums shrink-0">
										{item.count}
									</span>
									<span className="text-[10px] text-muted-foreground/70 tabular-nums w-8 text-right shrink-0">
										{pct}%
									</span>
								</div>
							);
						})}
					</div>
				</div>

				{/* Completion rate */}
				{total > 0 && (
					<>
						<Separator />
						<CompletionSummary issues={issues} />
					</>
				)}
			</div>
		</div>
	);
}

// ── Completion Summary ─────────────────────────────────────────────────────

function CompletionSummary({ issues }: { issues: InsightIssue[] }) {
	const stats = useMemo(() => {
		const done = issues.filter((i) => i.status === "done").length;
		const cancelled = issues.filter((i) => i.status === "cancelled").length;
		const active = issues.length - done - cancelled;
		const completionRate =
			issues.length > 0 ? Math.round((done / issues.length) * 100) : 0;
		return { done, cancelled, active, completionRate };
	}, [issues]);

	return (
		<div className="space-y-2">
			<h3 className="text-xs font-medium text-muted-foreground">Completion</h3>
			<div className="grid grid-cols-2 gap-3">
				<div className="rounded-md border border-border/50 px-3 py-2">
					<div className="text-lg font-semibold text-emerald-500 tabular-nums">
						{stats.completionRate}%
					</div>
					<div className="text-[10px] text-muted-foreground">Done</div>
				</div>
				<div className="rounded-md border border-border/50 px-3 py-2">
					<div className="text-lg font-semibold text-foreground tabular-nums">
						{stats.active}
					</div>
					<div className="text-[10px] text-muted-foreground">Active</div>
				</div>
			</div>
		</div>
	);
}
