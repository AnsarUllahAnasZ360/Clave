"use client";

import { format } from "date-fns";
import { Calendar, type LucideIcon, Timer } from "lucide-react";
import { memo } from "react";

import { BlockingIndicators } from "@/components/issues/BlockingIndicators";
import { SubIssueCountBadge } from "@/components/issues/SubIssueCountBadge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { PRIORITY_RECORD } from "@/lib/issue-config";
import { cn } from "@/lib/utils";
import type { Id } from "../../../convex/_generated/dataModel";

// ── Types ──────────────────────────────────────────────────────────────────

export type IssueCardData = {
	_id: Id<"issues">;
	identifier: string;
	title: string;
	status: string;
	priority: string;
	assigneeId?: Id<"users">;
	labelIds?: Id<"labels">[];
	dueDate?: number;
	estimate?: number;
	sortOrder: number;
	projectId?: Id<"projects">;
	sprintId?: Id<"sprints">;
	milestoneId?: Id<"milestones">;
};

export type DisplayProperties = {
	identifier?: boolean;
	priority?: boolean;
	assignee?: boolean;
	labels?: boolean;
	dueDate?: boolean;
	estimate?: boolean;
	subIssueCount?: boolean;
	blockingStatus?: boolean;
};

const DEFAULT_DISPLAY: DisplayProperties = {
	identifier: true,
	priority: true,
	assignee: true,
	dueDate: true,
	subIssueCount: true,
	blockingStatus: true,
};

export type IssueBoardCardProps = {
	issue: IssueCardData;
	displayProperties?: DisplayProperties;
	/** Resolved assignee data */
	assignee?: { name: string; avatarUrl?: string } | null;
	/** Resolved labels */
	labels?: { _id: Id<"labels">; name: string; color: string }[];
	onClick?: () => void;
};

// ── Priority helpers (from centralized module) ───────────────────────────

// ── Component ─────────────────────────────────────────────────────────────

export const IssueBoardCard = memo(function IssueBoardCard({
	issue,
	displayProperties = DEFAULT_DISPLAY,
	assignee,
	labels,
	onClick,
}: IssueBoardCardProps) {
	const display = { ...DEFAULT_DISPLAY, ...displayProperties };
	const priorityEntry = PRIORITY_RECORD[issue.priority];

	return (
		<button
			type="button"
			className={cn(
				"border border-border bg-card rounded-lg p-3 cursor-pointer transition-shadow hover:shadow-md w-full text-left",
				issue.status === "done" && "opacity-70",
				issue.status === "cancelled" && "opacity-50",
			)}
			onClick={onClick}
			aria-label={`Open issue ${issue.identifier}`}
		>
			{/* Top row: identifier + assignee avatar */}
			<div className="flex items-center justify-between mb-1.5">
				<div className="flex items-center gap-1.5 min-w-0">
					{display.priority && priorityEntry && (
						<PriorityIcon entry={priorityEntry} />
					)}
					{display.identifier && (
						<span className="text-xs text-muted-foreground font-mono shrink-0">
							{issue.identifier}
						</span>
					)}
				</div>
				{display.assignee && assignee && (
					<Avatar className="size-5 shrink-0">
						{assignee.avatarUrl ? (
							<AvatarImage src={assignee.avatarUrl} alt={assignee.name} />
						) : (
							<AvatarFallback className="text-[10px]">
								{assignee.name.charAt(0).toUpperCase()}
							</AvatarFallback>
						)}
					</Avatar>
				)}
			</div>

			{/* Title */}
			<p
				className={cn(
					"text-sm font-medium leading-snug line-clamp-2",
					issue.status === "done" && "line-through text-muted-foreground",
				)}
			>
				{issue.title}
			</p>

			{/* Bottom row: badges */}
			<div className="flex items-center gap-1.5 mt-2 flex-wrap empty:hidden">
				{display.labels && labels && labels.length > 0 && (
					<>
						{labels.slice(0, 2).map((label) => (
							<span
								key={label._id}
								className="inline-flex items-center gap-1 text-xs text-muted-foreground"
							>
								<span
									className="h-2 w-2 rounded-full shrink-0"
									style={{ backgroundColor: label.color }}
								/>
								<span className="truncate max-w-[60px]">{label.name}</span>
							</span>
						))}
						{labels.length > 2 && (
							<span className="text-xs text-muted-foreground">
								+{labels.length - 2}
							</span>
						)}
					</>
				)}

				{display.dueDate && issue.dueDate && (
					<span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
						<Calendar className="h-3 w-3" />
						{format(issue.dueDate, "MMM d")}
					</span>
				)}

				{display.estimate !== false && issue.estimate !== undefined && (
					<span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
						<Timer className="h-3 w-3" />
						{issue.estimate}h
					</span>
				)}

				{display.subIssueCount && <SubIssueCountBadge issueId={issue._id} />}

				{display.blockingStatus && <BlockingIndicators issueId={issue._id} />}
			</div>
		</button>
	);
});

function PriorityIcon({
	entry,
}: {
	entry: { icon: LucideIcon; color: string };
}) {
	const Icon = entry.icon;
	return <Icon className={cn("h-3.5 w-3.5 shrink-0", entry.color)} />;
}
