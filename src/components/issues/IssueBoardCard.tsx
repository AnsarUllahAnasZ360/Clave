"use client";

import { format } from "date-fns";
import {
	Calendar,
	Copy,
	ExternalLink,
	Link,
	type LucideIcon,
	MoreHorizontal,
	Timer,
	Trash2,
} from "lucide-react";
import { memo } from "react";
import { toast } from "sonner";

import { BlockingIndicators } from "@/components/issues/BlockingIndicators";
import { formatEstimate } from "@/components/issues/IssueListRow";
import { SubIssueCountBadge } from "@/components/issues/SubIssueCountBadge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
	assigneeIds?: Id<"users">[];
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
	/** Used for "Copy link" in the quick menu */
	issueUrl?: string;
	onDelete?: () => void;
	/** Resolved assignee data */
	assignee?: { name: string; avatarUrl?: string } | null;
	/** Resolved multiple assignees */
	assignees?: { name: string; avatarUrl?: string }[];
	/** Resolved labels */
	labels?: { _id: Id<"labels">; name: string; color: string }[];
	onClick?: () => void;
};

// ── Priority helpers (from centralized module) ───────────────────────────

// ── Component ─────────────────────────────────────────────────────────────

export const IssueBoardCard = memo(function IssueBoardCard({
	issue,
	displayProperties = DEFAULT_DISPLAY,
	issueUrl,
	onDelete,
	assignee,
	assignees,
	labels,
	onClick,
}: IssueBoardCardProps) {
	const display = { ...DEFAULT_DISPLAY, ...displayProperties };
	const priorityEntry = PRIORITY_RECORD[issue.priority];

	const copyLink = async () => {
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
	};

	const copyIdentifier = async () => {
		try {
			await navigator.clipboard.writeText(issue.identifier);
			toast.success(`Copied "${issue.identifier}"`);
		} catch {
			toast.error("Failed to copy identifier");
		}
	};

	// Root is a div+role="button" (not a <button>) because this card contains
	// an interactive DropdownMenuTrigger, and HTML forbids a button inside a
	// button. A role-augmented div preserves keyboard/click semantics without
	// the hydration error.
	return (
		<div
			role="button"
			tabIndex={0}
			className={cn(
				"group border border-border bg-card rounded-lg p-3 cursor-pointer transition-shadow hover:shadow-md w-full text-left",
				issue.status === "done" && "opacity-70",
				issue.status === "cancelled" && "opacity-50",
			)}
			onClick={onClick}
			onKeyDown={(e) => {
				if (e.key === "Enter" || e.key === " ") {
					e.preventDefault();
					onClick?.();
				}
			}}
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
				<div className="flex items-center gap-1 shrink-0">
					{display.assignee &&
						(assignees && assignees.length > 0 ? (
							<div className="flex items-center gap-1">
								{assignees.slice(0, 2).map((assigneeData) => (
									<Avatar key={assigneeData.name} className="size-5 shrink-0">
										{assigneeData.avatarUrl ? (
											<AvatarImage
												src={assigneeData.avatarUrl}
												alt={assigneeData.name}
											/>
										) : (
											<AvatarFallback className="text-[10px]">
												{assigneeData.name.charAt(0).toUpperCase()}
											</AvatarFallback>
										)}
									</Avatar>
								))}
								{assignees.length > 2 && (
									<span className="text-[10px] text-muted-foreground">
										+{assignees.length - 2}
									</span>
								)}
							</div>
						) : assignee ? (
							<Avatar className="size-5 shrink-0">
								{assignee.avatarUrl ? (
									<AvatarImage src={assignee.avatarUrl} alt={assignee.name} />
								) : (
									<AvatarFallback className="text-[10px]">
										{assignee.name.charAt(0).toUpperCase()}
									</AvatarFallback>
								)}
							</Avatar>
						) : null)}

					<DropdownMenu>
						<DropdownMenuTrigger asChild>
							<button
								type="button"
								aria-label="Issue options"
								className="h-7 w-7 inline-flex items-center justify-center rounded hover:bg-muted/60 text-muted-foreground hover:text-foreground transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100"
								onPointerDown={(e) => e.stopPropagation()}
								onClick={(e) => e.stopPropagation()}
							>
								<MoreHorizontal className="h-4 w-4" />
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
									void copyLink();
								}}
								className="gap-2"
							>
								<Link className="h-4 w-4" />
								Copy link
							</DropdownMenuItem>
							<DropdownMenuItem
								onClick={(e) => {
									e.stopPropagation();
									void copyIdentifier();
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
											onDelete();
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
						{formatEstimate(issue.estimate)}
					</span>
				)}

				{display.subIssueCount && <SubIssueCountBadge issueId={issue._id} />}

				{display.blockingStatus && <BlockingIndicators issueId={issue._id} />}
			</div>
		</div>
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
