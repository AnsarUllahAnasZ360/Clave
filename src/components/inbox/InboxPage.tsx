"use client";

import { useMutation, useQuery } from "convex/react";
import { format, formatDistanceToNow } from "date-fns";
import {
	AlarmClock,
	Archive,
	Bell,
	Calendar,
	CheckCircle2,
	Circle,
	CircleHelp,
	Clock,
	FileText,
	FolderOpen,
	Inbox,
	ListFilter,
	type LucideIcon,
	MessageSquare,
	PenTool,
	SignalHigh,
	Tag,
	TicketCheck,
	Trash2,
	User,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { AIDigestCard } from "@/components/ai/AIDigestCard";
import {
	InboxFilterPopover,
	type InboxFilters,
} from "@/components/inbox/InboxFilterPopover";
import { useWorkspace } from "@/components/providers/workspace-context";
import {
	useWorkspaceLabels,
	useWorkspaceMembers,
	useWorkspaceProjects,
} from "@/components/providers/workspace-data-context";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
	HoverCard,
	HoverCardContent,
	HoverCardTrigger,
} from "@/components/ui/hover-card";
import { Input } from "@/components/ui/input";
import { GenericPicker } from "@/components/ui/pickers";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Skeleton } from "@/components/ui/skeleton";
import { useShortcutsOptional } from "@/hooks/use-shortcuts";
import { extractTextFromContent } from "@/lib/content-converters";
import {
	PRIORITY_ITEMS,
	STATUS_ITEMS,
	type StatusKey,
} from "@/lib/issue-config";
import { cn } from "@/lib/utils";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

// ── Status / Priority config (from centralized module) ───────────────────

const STATUS_CONFIG = STATUS_ITEMS;
const PRIORITY_CONFIG = PRIORITY_ITEMS;
const LOADING_SKELETON_ROWS = [
	"row-1",
	"row-2",
	"row-3",
	"row-4",
	"row-5",
	"row-6",
];

// ── Helpers ───────────────────────────────────────────────────────────────

function StatusIcon({
	statusId,
	className,
}: {
	statusId: string;
	className?: string;
}) {
	const config = STATUS_CONFIG.find((s) => s.id === statusId);
	if (!config) return null;
	const Icon = config.icon;
	return <Icon className={cn("h-4 w-4", config.color, className)} />;
}

function getActionDescription(type: string): string {
	switch (type) {
		case "issue_assigned":
		case "story_assigned":
		case "task_assigned":
			return "assigned you";
		case "issue_status_changed":
		case "story_status_changed":
		case "task_status_changed":
			return "changed status";
		case "issue_mentioned":
		case "story_mentioned":
			return "mentioned you";
		case "issue_due_soon":
			return "sent a due date reminder";
		case "issue_overdue":
			return "flagged as overdue";
		case "issue_stale":
			return "flagged as out of date";
		case "comment":
			return "commented";
		case "document_comment":
			return "commented on a document";
		case "project_update":
			return "posted an update";
		case "document_update":
			return "shared a document";
		case "whiteboard_update":
			return "updated a whiteboard";
		case "client_update":
			return "updated client";
		case "system":
			return "reminded you";
		default:
			return "notified you";
	}
}

// ── Snooze presets ────────────────────────────────────────────────────────

function getSnoozePresets(): { label: string; timestamp: number }[] {
	const now = new Date();
	const oneHour = new Date(now.getTime() + 60 * 60 * 1000);
	const threeHours = new Date(now.getTime() + 3 * 60 * 60 * 1000);

	const tomorrow = new Date(now);
	tomorrow.setDate(tomorrow.getDate() + 1);
	tomorrow.setHours(9, 0, 0, 0);

	const nextMonday = new Date(now);
	const daysUntilMonday = (1 + 7 - nextMonday.getDay()) % 7 || 7;
	nextMonday.setDate(nextMonday.getDate() + daysUntilMonday);
	nextMonday.setHours(9, 0, 0, 0);

	return [
		{ label: "1 hour", timestamp: oneHour.getTime() },
		{ label: "3 hours", timestamp: threeHours.getTime() },
		{
			label: `Tomorrow ${format(tomorrow, "h:mm a")}`,
			timestamp: tomorrow.getTime(),
		},
		{
			label: `Next Monday ${format(nextMonday, "h:mm a")}`,
			timestamp: nextMonday.getTime(),
		},
	];
}

// ── Types ─────────────────────────────────────────────────────────────────

type InboxTab = "inbox" | "snoozed";

type NotificationItem = {
	_id: Id<"notifications">;
	_creationTime: number;
	type: string;
	title: string;
	body?: string;
	preview?: string;
	isRead: boolean;
	snoozedUntil?: number;
	issueId?: Id<"issues">;
	projectId?: Id<"projects">;
	documentId?: Id<"documents">;
	whiteboardId?: Id<"whiteboards">;
	actorName: string | null;
	actorImage: string | null;
	displayType: string;
	projectName: string | null;
	projectSlug: string | null;
	issueIdentifier: string | null;
	issueTitle: string | null;
	issueStatus: string | null;
	issuePriority: string | null;
	issueAssigneeId: string | null;
	issueLabelIds: string[] | null;
	documentTitle?: string | null;
	whiteboardTitle?: string | null;
	commentBody?: string | null;
};

// ── Snooze popover ────────────────────────────────────────────────────────

function SnoozePopover({
	onSnooze,
	children,
}: {
	onSnooze: (timestamp: number) => void;
	children: React.ReactNode;
}) {
	const [open, setOpen] = useState(false);
	const presets = getSnoozePresets();

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>{children}</PopoverTrigger>
			<PopoverContent className="w-[220px] p-1" align="end" sideOffset={4}>
				<div className="flex flex-col">
					{presets.map((preset) => (
						<button
							key={preset.label}
							type="button"
							className="flex items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-muted transition-colors text-left"
							onClick={() => {
								onSnooze(preset.timestamp);
								setOpen(false);
							}}
						>
							<Clock className="h-3.5 w-3.5 text-muted-foreground" />
							{preset.label}
						</button>
					))}
					<Separator className="my-1" />
					<label className="flex items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-muted transition-colors cursor-pointer">
						<Calendar className="h-3.5 w-3.5 text-muted-foreground" />
						<span>Custom...</span>
						<input
							type="datetime-local"
							className="sr-only"
							onChange={(e) => {
								const date = new Date(e.target.value);
								if (!Number.isNaN(date.getTime())) {
									onSnooze(date.getTime());
									setOpen(false);
								}
							}}
						/>
					</label>
				</div>
			</PopoverContent>
		</Popover>
	);
}

// ── Notification item ─────────────────────────────────────────────────────

function NotificationListItem({
	item,
	isActive,
	onSelect,
}: {
	item: NotificationItem;
	isActive: boolean;
	onSelect: () => void;
}) {
	const action = getActionDescription(item.type);
	const typeIcon = getNotificationTypeIcon(item.type);
	const TypeIcon = typeIcon.icon;

	return (
		<button
			type="button"
			onClick={onSelect}
			data-notification-id={item._id}
			className={cn(
				"flex w-full items-start gap-3 rounded-md px-3 py-2.5 text-left transition-colors",
				isActive ? "bg-primary/10 ring-1 ring-primary/20" : "hover:bg-muted/70",
			)}
		>
			<div className="relative mt-0.5">
				<Avatar className="h-7 w-7">
					{item.actorImage && <AvatarImage src={item.actorImage} />}
					<AvatarFallback className="text-[10px]">
						{item.actorName?.[0]?.toUpperCase() ?? "N"}
					</AvatarFallback>
				</Avatar>
				<span className="absolute -bottom-0.5 -right-0.5 flex items-center justify-center h-3.5 w-3.5 rounded-full bg-background border border-border">
					<TypeIcon className={cn("h-2 w-2", typeIcon.color)} />
				</span>
				{!item.isRead && (
					<span className="absolute -left-1 top-1/2 -translate-y-1/2 h-2 w-2 rounded-full bg-primary" />
				)}
			</div>
			<div className="flex flex-1 flex-col gap-0.5 min-w-0">
				<div className="flex items-center gap-1.5 text-xs">
					<span className="font-medium text-foreground truncate">
						{item.actorName ?? "System"}
					</span>
					<span className="text-muted-foreground">{action}</span>
				</div>
				{(item.issueIdentifier || item.issueTitle) && (
					<p className="text-xs text-foreground truncate">
						{item.issueIdentifier && (
							<span className="font-mono text-muted-foreground mr-1">
								{item.issueIdentifier}
							</span>
						)}
						{item.issueTitle ?? item.title}
					</p>
				)}
				{!item.issueIdentifier && !item.issueTitle && (
					<p className="text-xs text-foreground truncate">{item.title}</p>
				)}
				{item.commentBody && (
					<p className="text-[11px] text-muted-foreground truncate italic">
						&ldquo;{item.commentBody}&rdquo;
					</p>
				)}
				<div className="flex items-center gap-2 mt-0.5">
					<span className="text-[10px] text-muted-foreground">
						{formatDistanceToNow(item._creationTime, { addSuffix: true })}
					</span>
					{item.snoozedUntil && (
						<span className="flex items-center gap-1 text-[10px] text-muted-foreground">
							<AlarmClock className="h-3 w-3" />
							{format(item.snoozedUntil, "MMM d, h:mm a")}
						</span>
					)}
				</div>
			</div>
		</button>
	);
}

// ── Inline issue preview panel ────────────────────────────────────────────

function IssuePreviewPanel({
	notification,
	workspaceId,
	workspaceSlug,
	orgSlug,
}: {
	notification: NotificationItem;
	workspaceId: Id<"workspaces">;
	workspaceSlug: string;
	orgSlug: string;
}) {
	const issue = useQuery(
		api.issues.getById,
		notification.issueId ? { issueId: notification.issueId } : "skip",
	);
	const members = useWorkspaceMembers();
	const labels = useWorkspaceLabels();
	const projects = useWorkspaceProjects();

	const updateMut = useMutation(api.issues.update);
	const updateStatusMut = useMutation(api.issues.updateStatus);
	const assignMut = useMutation(api.issues.assign);

	const memberOptions = useMemo(() => {
		if (!members) return [];
		return members.map((m) => ({
			id: m.userId as string,
			name: m.user?.name ?? m.user?.email ?? "Unknown",
			image: m.user?.avatarUrl ?? m.user?.image ?? undefined,
		}));
	}, [members]);

	const projectOptions = useMemo(() => {
		if (!projects) return [];
		return projects.map((p) => ({ id: p._id as string, label: p.name }));
	}, [projects]);

	if (!notification.issueId || !issue) {
		// Fallback for non-issue notifications
		return (
			<div className="flex flex-col gap-4 px-6 py-5">
				<div className="flex items-start gap-3">
					<Avatar className="h-9 w-9">
						{notification.actorImage && (
							<AvatarImage src={notification.actorImage} />
						)}
						<AvatarFallback className="text-xs">
							{notification.actorName?.[0]?.toUpperCase() ?? "N"}
						</AvatarFallback>
					</Avatar>
					<div className="flex flex-col gap-1 min-w-0">
						<p className="text-sm font-medium">{notification.title}</p>
						<p className="text-xs text-muted-foreground">
							{notification.actorName ?? "System"} &middot;{" "}
							{formatDistanceToNow(notification._creationTime, {
								addSuffix: true,
							})}
						</p>
					</div>
				</div>
				{(notification.body || notification.preview) && (
					<div className="rounded-lg border border-border bg-card/50 px-4 py-3">
						<p className="text-sm text-muted-foreground">
							{notification.body ?? notification.preview}
						</p>
					</div>
				)}
			</div>
		);
	}

	const handleStatusChange = (option: { id: string }) => {
		if (issue && option.id !== issue.status) {
			updateStatusMut({
				issueId: issue._id,
				status: option.id as StatusKey,
			});
		}
	};

	const handlePriorityChange = (option: { id: string }) => {
		if (issue && option.id !== issue.priority) {
			updateMut({
				issueId: issue._id,
				priority: option.id as
					| "urgent"
					| "high"
					| "medium"
					| "low"
					| "no_priority",
			});
		}
	};

	const handleAssigneeChange = (option: { id: string }) => {
		if (issue) {
			assignMut({
				issueId: issue._id,
				assigneeId: option.id as Id<"users">,
			});
		}
	};

	const handleProjectChange = (option: { id: string }) => {
		if (issue) {
			updateMut({
				issueId: issue._id,
				projectId: option.id as Id<"projects">,
			});
		}
	};

	const assignee = memberOptions.find((m) => m.id === issue.assigneeId);
	const currentStatus = STATUS_CONFIG.find((s) => s.id === issue.status);
	const currentPriority = PRIORITY_CONFIG.find((p) => p.id === issue.priority);
	const currentProject = projects?.find((p) => p._id === issue.projectId);

	return (
		<div className="flex flex-col h-full">
			{/* Header */}
			<div className="flex items-center justify-between px-6 py-3 border-b border-border/40">
				<div className="flex items-center gap-2">
					<StatusIcon statusId={issue.status} />
					<span className="font-mono text-xs text-muted-foreground">
						{issue.identifier}
					</span>
				</div>
				<Link
					href={`/${orgSlug}/${workspaceSlug}/issues/${issue.identifier}`}
					className="text-xs text-primary hover:underline"
				>
					Open full view
				</Link>
			</div>

			{/* Content */}
			<div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
				{/* Title */}
				<h2 className="text-base font-medium text-foreground leading-tight">
					{issue.title}
				</h2>

				{/* Comment preview — shown for mentions and comments */}
				{notification.commentBody && (
					<div className="rounded-md border-l-2 border-primary/40 bg-muted/50 px-3 py-2.5">
						<div className="flex items-center gap-1.5 mb-1.5">
							<MessageSquare className="h-3 w-3 text-muted-foreground" />
							<span className="text-[11px] font-medium text-muted-foreground">
								{notification.actorName ?? "Someone"} commented
							</span>
						</div>
						<p className="text-sm text-foreground/80 whitespace-pre-wrap line-clamp-6">
							{notification.commentBody}
						</p>
					</div>
				)}

				{/* Notification body — shown for status changes, assignments, etc. */}
				{!notification.commentBody && notification.body && (
					<div className="rounded-md border border-border/60 bg-muted/30 px-3 py-2.5">
						<p className="text-sm text-muted-foreground whitespace-pre-wrap line-clamp-4">
							{notification.body}
						</p>
					</div>
				)}

				{/* Description excerpt (fallback when no comment/body) */}
				{!notification.commentBody &&
					!notification.body &&
					issue.description && (
						<p className="text-sm text-muted-foreground line-clamp-3">
							{extractTextFromContent(issue.description)}
						</p>
					)}

				<Separator />

				{/* Editable properties */}
				<div className="space-y-2">
					<PropertyRow icon={Circle} label="Status">
						<GenericPicker
							items={STATUS_CONFIG}
							onSelect={handleStatusChange}
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
									className="flex items-center gap-2 px-2 py-1 rounded-md hover:bg-muted transition-colors text-sm"
								>
									<StatusIcon statusId={issue.status} />
									<span>{currentStatus?.label ?? "No status"}</span>
								</button>
							}
						/>
					</PropertyRow>

					<PropertyRow icon={SignalHigh} label="Priority">
						<GenericPicker
							items={PRIORITY_CONFIG}
							onSelect={handlePriorityChange}
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
									className="flex items-center gap-2 px-2 py-1 rounded-md hover:bg-muted transition-colors text-sm"
								>
									{currentPriority &&
										(() => {
											const Icon = currentPriority.icon;
											return (
												<Icon
													className={cn("h-4 w-4", currentPriority.color)}
												/>
											);
										})()}
									<span>{currentPriority?.label ?? "No priority"}</span>
								</button>
							}
						/>
					</PropertyRow>

					<PropertyRow icon={User} label="Assignee">
						<GenericPicker
							items={memberOptions}
							onSelect={handleAssigneeChange}
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
									className="flex items-center gap-2 px-2 py-1 rounded-md hover:bg-muted transition-colors text-sm"
								>
									{assignee ? (
										<>
											<Avatar className="size-5">
												{assignee.image && <AvatarImage src={assignee.image} />}
												<AvatarFallback className="text-[10px]">
													{assignee.name.charAt(0)}
												</AvatarFallback>
											</Avatar>
											<span>{assignee.name}</span>
										</>
									) : (
										<span className="text-muted-foreground">Unassigned</span>
									)}
								</button>
							}
						/>
					</PropertyRow>

					<PropertyRow icon={FolderOpen} label="Project">
						<GenericPicker
							items={projectOptions}
							onSelect={handleProjectChange}
							selectedId={issue.projectId ?? undefined}
							placeholder="Set project..."
							renderItem={(item) => (
								<div className="flex items-center gap-2 w-full">
									<FolderOpen className="h-4 w-4 text-muted-foreground" />
									<span className="flex-1">{item.label}</span>
								</div>
							)}
							trigger={
								<button
									type="button"
									className="flex items-center gap-2 px-2 py-1 rounded-md hover:bg-muted transition-colors text-sm"
								>
									<FolderOpen className="h-4 w-4 text-muted-foreground" />
									<span>{currentProject?.name ?? "No project"}</span>
								</button>
							}
						/>
					</PropertyRow>

					{labels && issue.labelIds && issue.labelIds.length > 0 && (
						<PropertyRow icon={Tag} label="Labels">
							<div className="flex flex-wrap gap-1">
								{issue.labelIds.map((labelId) => {
									const label = labels.find((l) => l._id === labelId);
									if (!label) return null;
									return (
										<span
											key={label._id}
											className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs"
											style={{
												backgroundColor: `${label.color}20`,
												color: label.color,
											}}
										>
											<span
												className="h-2 w-2 rounded-full"
												style={{ backgroundColor: label.color }}
											/>
											{label.name}
										</span>
									);
								})}
							</div>
						</PropertyRow>
					)}
				</div>

				<Separator />

				{/* Notification context */}
				<div className="flex items-center gap-2 text-xs text-muted-foreground">
					<Avatar className="h-5 w-5">
						{notification.actorImage && (
							<AvatarImage src={notification.actorImage} />
						)}
						<AvatarFallback className="text-[8px]">
							{notification.actorName?.[0]?.toUpperCase() ?? "N"}
						</AvatarFallback>
					</Avatar>
					<span>
						{notification.actorName ?? "System"}{" "}
						{getActionDescription(notification.type)}{" "}
						{formatDistanceToNow(notification._creationTime, {
							addSuffix: true,
						})}
					</span>
				</div>
			</div>
		</div>
	);
}

// ── Property row helper ──────────────────────────────────────────────────

function PropertyRow({
	icon: Icon,
	label,
	children,
}: {
	icon: LucideIcon;
	label: string;
	children: React.ReactNode;
}) {
	return (
		<div className="flex items-center gap-3 min-h-[32px]">
			<span className="flex items-center gap-2 text-sm text-muted-foreground w-24 shrink-0">
				<Icon className="h-3.5 w-3.5" />
				{label}
			</span>
			<div className="flex-1 min-w-0">{children}</div>
		</div>
	);
}

// ── Notification type icon helper ──────────────────────────────────────

function getNotificationTypeIcon(type: string): {
	icon: LucideIcon;
	color: string;
} {
	switch (type) {
		case "issue_due_soon":
			return { icon: AlarmClock, color: "text-amber-400" };
		case "issue_overdue":
			return { icon: AlarmClock, color: "text-red-400" };
		case "issue_stale":
			return { icon: AlarmClock, color: "text-orange-400" };
		case "issue_assigned":
		case "issue_status_changed":
		case "issue_mentioned":
		case "story_assigned":
		case "story_status_changed":
		case "story_mentioned":
		case "task_assigned":
		case "task_status_changed":
			return { icon: TicketCheck, color: "text-blue-400" };
		case "comment":
		case "document_comment":
			return { icon: MessageSquare, color: "text-amber-400" };
		case "project_update":
			return { icon: FolderOpen, color: "text-violet-400" };
		case "document_update":
			return { icon: FileText, color: "text-emerald-400" };
		case "whiteboard_update":
			return { icon: PenTool, color: "text-pink-400" };
		case "client_update":
			return { icon: User, color: "text-orange-400" };
		default:
			return { icon: Bell, color: "text-muted-foreground" };
	}
}

// ── Project update preview panel ──────────────────────────────────────

function ProjectUpdatePreviewPanel({
	notification,
	workspaceSlug,
	orgSlug,
}: {
	notification: NotificationItem;
	workspaceSlug: string;
	orgSlug: string;
}) {
	const hasLink = notification.projectSlug != null;

	return (
		<div className="flex flex-col h-full">
			<div className="flex items-center justify-between px-6 py-3 border-b border-border/40">
				<div className="flex items-center gap-2">
					<FolderOpen className="h-4 w-4 text-violet-400" />
					<span className="text-xs text-muted-foreground truncate">
						{notification.projectName ?? "Project"}
					</span>
				</div>
				{hasLink && (
					<Link
						href={`/${orgSlug}/${workspaceSlug}/projects/${notification.projectSlug}`}
						className="text-xs text-primary hover:underline"
					>
						Open project
					</Link>
				)}
			</div>
			<div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
				<h2 className="text-base font-medium text-foreground leading-tight">
					{notification.title}
				</h2>
				{(notification.body || notification.preview) && (
					<div className="rounded-lg border border-border bg-card/50 px-4 py-3">
						<p className="text-sm text-muted-foreground whitespace-pre-wrap">
							{notification.body ?? notification.preview}
						</p>
					</div>
				)}
				<Separator />
				<div className="flex items-center gap-2 text-xs text-muted-foreground">
					<Avatar className="h-5 w-5">
						{notification.actorImage && (
							<AvatarImage src={notification.actorImage} />
						)}
						<AvatarFallback className="text-[8px]">
							{notification.actorName?.[0]?.toUpperCase() ?? "N"}
						</AvatarFallback>
					</Avatar>
					<span>
						{notification.actorName ?? "System"}{" "}
						{getActionDescription(notification.type)}{" "}
						{formatDistanceToNow(notification._creationTime, {
							addSuffix: true,
						})}
					</span>
				</div>
			</div>
		</div>
	);
}

// ── Document preview panel ────────────────────────────────────────────

function DocumentPreviewPanel({
	notification,
	workspaceSlug,
	orgSlug,
}: {
	notification: NotificationItem;
	workspaceSlug: string;
	orgSlug: string;
}) {
	return (
		<div className="flex flex-col h-full">
			<div className="flex items-center justify-between px-6 py-3 border-b border-border/40">
				<div className="flex items-center gap-2">
					<FileText className="h-4 w-4 text-emerald-400" />
					<span className="text-xs text-muted-foreground truncate">
						{notification.documentTitle ?? "Document"}
					</span>
				</div>
				{notification.documentId && (
					<Link
						href={`/${orgSlug}/${workspaceSlug}/docs/${notification.documentId}`}
						className="text-xs text-primary hover:underline"
					>
						Open document
					</Link>
				)}
			</div>
			<div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
				<h2 className="text-base font-medium text-foreground leading-tight">
					{notification.title}
				</h2>
				{(notification.body || notification.preview) && (
					<div className="rounded-lg border border-border bg-card/50 px-4 py-3">
						<p className="text-sm text-muted-foreground whitespace-pre-wrap">
							{notification.body ?? notification.preview}
						</p>
					</div>
				)}
				<Separator />
				<div className="flex items-center gap-2 text-xs text-muted-foreground">
					<Avatar className="h-5 w-5">
						{notification.actorImage && (
							<AvatarImage src={notification.actorImage} />
						)}
						<AvatarFallback className="text-[8px]">
							{notification.actorName?.[0]?.toUpperCase() ?? "N"}
						</AvatarFallback>
					</Avatar>
					<span>
						{notification.actorName ?? "System"}{" "}
						{getActionDescription(notification.type)}{" "}
						{formatDistanceToNow(notification._creationTime, {
							addSuffix: true,
						})}
					</span>
				</div>
			</div>
		</div>
	);
}

// ── Whiteboard preview panel ──────────────────────────────────────────

function WhiteboardPreviewPanel({
	notification,
	workspaceSlug,
	orgSlug,
}: {
	notification: NotificationItem;
	workspaceSlug: string;
	orgSlug: string;
}) {
	return (
		<div className="flex flex-col h-full">
			<div className="flex items-center justify-between px-6 py-3 border-b border-border/40">
				<div className="flex items-center gap-2">
					<PenTool className="h-4 w-4 text-pink-400" />
					<span className="text-xs text-muted-foreground truncate">
						{notification.whiteboardTitle ?? "Whiteboard"}
					</span>
				</div>
				{notification.whiteboardId && (
					<Link
						href={`/${orgSlug}/${workspaceSlug}/boards/${notification.whiteboardId}`}
						className="text-xs text-primary hover:underline"
					>
						Open whiteboard
					</Link>
				)}
			</div>
			<div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
				<h2 className="text-base font-medium text-foreground leading-tight">
					{notification.title}
				</h2>
				{(notification.body || notification.preview) && (
					<div className="rounded-lg border border-border bg-card/50 px-4 py-3">
						<p className="text-sm text-muted-foreground whitespace-pre-wrap">
							{notification.body ?? notification.preview}
						</p>
					</div>
				)}
				<Separator />
				<div className="flex items-center gap-2 text-xs text-muted-foreground">
					<Avatar className="h-5 w-5">
						{notification.actorImage && (
							<AvatarImage src={notification.actorImage} />
						)}
						<AvatarFallback className="text-[8px]">
							{notification.actorName?.[0]?.toUpperCase() ?? "N"}
						</AvatarFallback>
					</Avatar>
					<span>
						{notification.actorName ?? "System"}{" "}
						{getActionDescription(notification.type)}{" "}
						{formatDistanceToNow(notification._creationTime, {
							addSuffix: true,
						})}
					</span>
				</div>
			</div>
		</div>
	);
}

// ── Main component ───────────────────────────────────────────────────────

export function InboxPage() {
	const { workspaceId, workspaceSlug, orgSlug } = useWorkspace();
	const [tab, setTab] = useState<InboxTab>("inbox");
	const [inboxFilters, setInboxFilters] = useState<InboxFilters>({
		types: [],
		readStatus: "all",
	});
	const [searchQuery, setSearchQuery] = useState("");
	const [selectedIndex, setSelectedIndex] = useState(0);
	const listContainerRef = useRef<HTMLDivElement>(null);
	const searchInputRef = useRef<HTMLInputElement>(null);
	const shortcuts = useShortcutsOptional();

	// Mutations
	const markAsReadMut = useMutation(api.notifications.markAsRead);
	const markAllReadMut = useMutation(api.notifications.markAllRead);
	const toggleReadMut = useMutation(api.notifications.toggleRead);
	const snoozeMut = useMutation(api.notifications.snooze);
	const unsnoozeMut = useMutation(api.notifications.unsnooze);
	const archiveMut = useMutation(api.notifications.archive);
	const deleteMut = useMutation(api.notifications.deleteNotification);
	const deleteAllReadMut = useMutation(api.notifications.deleteAllRead);

	// Map UI filter types to backend display categories and client-side narrowing
	type BackendNotificationType =
		| "system"
		| "task"
		| "comment"
		| "project"
		| "client";
	const typesArg = useMemo((): BackendNotificationType[] | undefined => {
		if (inboxFilters.types.length === 0) return undefined;
		const set = new Set<BackendNotificationType>();
		for (const t of inboxFilters.types) {
			if (t === "issue" || t === "mention") set.add("task");
			if (t === "comment") set.add("comment");
			if (t === "project" || t === "document" || t === "whiteboard")
				set.add("project");
			if (t === "reminder") {
				set.add("task");
				set.add("system");
			}
		}
		return set.size > 0 ? [...set] : undefined;
	}, [inboxFilters.types]);

	// Queries
	const readFilterArg =
		inboxFilters.readStatus !== "all" ? inboxFilters.readStatus : undefined;
	const inboxResult = useQuery(api.notifications.list, {
		workspaceId,
		types: typesArg,
		filter: readFilterArg,
		limit: 100,
	});
	const snoozedResult = useQuery(api.notifications.listSnoozed, {
		workspaceId,
	});

	// Client-side narrowing for filters that share a backend category
	const notifications = useMemo(() => {
		if (tab === "snoozed") {
			const items = (snoozedResult?.notifications ?? []) as NotificationItem[];
			const q = searchQuery.trim().toLowerCase();
			if (!q) return items;
			return items.filter((n) => {
				const haystack = [
					n.title,
					n.body,
					n.preview,
					n.commentBody,
					n.issueIdentifier,
					n.issueTitle,
					n.actorName,
				]
					.filter(Boolean)
					.join(" ")
					.toLowerCase();
				return haystack.includes(q);
			});
		}
		let items = (inboxResult?.notifications ?? []) as NotificationItem[];

		if (inboxFilters.types.length > 0) {
			// Build a set of allowed notification.type values from the selected filters
			const allowed = new Set<string>();
			for (const f of inboxFilters.types) {
				if (f === "issue") {
					allowed.add("issue_assigned");
					allowed.add("issue_status_changed");
					allowed.add("issue_due_soon");
					allowed.add("issue_overdue");
					allowed.add("issue_stale");
					allowed.add("story_assigned");
					allowed.add("story_status_changed");
					allowed.add("task_assigned");
					allowed.add("task_status_changed");
				}
				if (f === "mention") {
					allowed.add("issue_mentioned");
					allowed.add("story_mentioned");
				}
				if (f === "comment") {
					allowed.add("comment");
					allowed.add("document_comment");
				}
				if (f === "project") {
					allowed.add("project_update");
				}
				if (f === "document") {
					allowed.add("document_update");
					allowed.add("document_comment");
				}
				if (f === "whiteboard") {
					allowed.add("whiteboard_update");
				}
				if (f === "reminder") {
					allowed.add("issue_due_soon");
					allowed.add("issue_overdue");
					allowed.add("issue_stale");
					allowed.add("system");
				}
			}

			items = items.filter((n) => allowed.has(n.type));
		}

		const q = searchQuery.trim().toLowerCase();
		if (q.length > 0) {
			items = items.filter((n) => {
				const haystack = [
					n.title,
					n.body,
					n.preview,
					n.commentBody,
					n.issueIdentifier,
					n.issueTitle,
					n.actorName,
				]
					.filter(Boolean)
					.join(" ")
					.toLowerCase();
				return haystack.includes(q);
			});
		}

		return items;
	}, [tab, inboxResult, snoozedResult, inboxFilters.types, searchQuery]);

	// Clamp selected index when notifications change
	useEffect(() => {
		if (notifications.length === 0) {
			setSelectedIndex(0);
		} else if (selectedIndex >= notifications.length) {
			setSelectedIndex(Math.max(0, notifications.length - 1));
		}
	}, [notifications.length, selectedIndex]);

	const selectedNotification = notifications[selectedIndex] ?? null;
	const selectedNotificationId = selectedNotification?._id ?? null;
	const selectedNotificationIsRead = selectedNotification?.isRead ?? true;
	const selectedIssueId = selectedNotification?.issueId ?? null;

	// Sync active issue with shortcut provider for S/A/P/L shortcuts
	useEffect(() => {
		shortcuts?.setActiveIssueId(
			selectedIssueId ? (selectedIssueId as string) : null,
		);
		return () => shortcuts?.setActiveIssueId(null);
	}, [selectedIssueId, shortcuts]);

	// Auto-mark as read when selecting
	useEffect(() => {
		if (
			selectedNotificationId &&
			!selectedNotificationIsRead &&
			tab === "inbox"
		) {
			markAsReadMut({ notificationId: selectedNotificationId });
		}
	}, [selectedNotificationId, selectedNotificationIsRead, tab, markAsReadMut]);

	// Scroll selected item into view
	useEffect(() => {
		if (!listContainerRef.current) return;
		const container = listContainerRef.current;
		const items = container.querySelectorAll("[data-notification-id]");
		const activeItem = items[selectedIndex];
		if (activeItem) {
			activeItem.scrollIntoView({ block: "nearest", behavior: "smooth" });
		}
	}, [selectedIndex]);

	// ── Keyboard navigation ──────────────────────────────────────────────

	useEffect(() => {
		function handleKeyDown(e: KeyboardEvent) {
			const target = e.target as HTMLElement;
			const isInput =
				target.tagName === "INPUT" ||
				target.tagName === "TEXTAREA" ||
				target.isContentEditable;

			// Quick-find in inbox list
			if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "f") {
				e.preventDefault();
				searchInputRef.current?.focus();
				searchInputRef.current?.select();
				return;
			}

			if (isInput) return;

			// Check if a dialog/popover is open
			const hasOpenDialog = document.querySelector("[role='dialog']");
			const hasOpenPopover = document.querySelector(
				"[data-state='open'][data-radix-popper-content-wrapper]",
			);
			if (hasOpenDialog || hasOpenPopover) return;

			switch (e.key) {
				case "j":
				case "ArrowDown": {
					e.preventDefault();
					setSelectedIndex((prev) =>
						Math.min(prev + 1, notifications.length - 1),
					);
					break;
				}
				case "k":
				case "ArrowUp": {
					e.preventDefault();
					setSelectedIndex((prev) => Math.max(prev - 1, 0));
					break;
				}
				case "u": {
					e.preventDefault();
					if (e.altKey) {
						markAllReadMut({ workspaceId });
						toast.success("All notifications marked as read");
					} else if (selectedNotification) {
						toggleReadMut({ notificationId: selectedNotification._id });
					}
					break;
				}
				case "e": {
					if (selectedNotification) {
						e.preventDefault();
						archiveMut({ notificationId: selectedNotification._id });
						toast.success("Notification archived");
					}
					break;
				}
				case "h": {
					if (selectedNotification && tab === "inbox") {
						e.preventDefault();
						const oneHour = Date.now() + 60 * 60 * 1000;
						snoozeMut({
							notificationId: selectedNotification._id,
							snoozedUntil: oneHour,
						});
						toast.success("Notification snoozed for 1 hour");
					}
					break;
				}
				case "d": {
					if ((e.metaKey || e.ctrlKey) && tab === "inbox") {
						e.preventDefault();
						deleteAllReadMut({ workspaceId });
						toast.success("Deleted all read notifications");
					}
					break;
				}
				case "Backspace":
				case "Delete": {
					if (e.shiftKey) {
						e.preventDefault();
						if (notifications.length > 0) {
							for (const notification of notifications) {
								void deleteMut({ notificationId: notification._id });
							}
							toast.success("Deleted visible notifications");
						}
					} else if (selectedNotification) {
						e.preventDefault();
						deleteMut({ notificationId: selectedNotification._id });
						toast.success("Notification deleted");
					}
					break;
				}
				default:
					break;
			}
		}

		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, [
		notifications.length,
		selectedNotification,
		toggleReadMut,
		archiveMut,
		deleteMut,
		markAllReadMut,
		deleteAllReadMut,
		snoozeMut,
		tab,
		workspaceId,
		notifications,
	]);

	// ── Handlers ─────────────────────────────────────────────────────────

	const handleSnooze = useCallback(
		(notificationId: Id<"notifications">, timestamp: number) => {
			snoozeMut({ notificationId, snoozedUntil: timestamp });
			toast.success("Notification snoozed");
		},
		[snoozeMut],
	);

	const handleUnsnooze = useCallback(
		(notificationId: Id<"notifications">) => {
			unsnoozeMut({ notificationId });
			toast.success("Notification unsnoozed");
		},
		[unsnoozeMut],
	);

	const handleArchive = useCallback(
		(notificationId: Id<"notifications">) => {
			archiveMut({ notificationId });
			toast.success("Notification archived");
		},
		[archiveMut],
	);

	const handleDelete = useCallback(
		(notificationId: Id<"notifications">) => {
			deleteMut({ notificationId });
			toast.success("Notification deleted");
		},
		[deleteMut],
	);

	const handleMarkAllRead = useCallback(() => {
		markAllReadMut({ workspaceId });
		toast.success("All notifications marked as read");
	}, [markAllReadMut, workspaceId]);

	// ── Loading state ────────────────────────────────────────────────────

	if (inboxResult === undefined) {
		return (
			<div className="flex flex-1 flex-col min-h-0 bg-background mx-2 my-2 border border-border rounded-lg min-w-0 overflow-y-auto">
				<header className="sticky top-0 z-10 bg-background flex items-center justify-between px-4 py-3 border-b border-border/40">
					<div className="flex items-center gap-3">
						<SidebarTrigger className="h-8 w-8 rounded-lg hover:bg-accent text-muted-foreground" />
						<p className="text-base font-medium text-foreground">Inbox</p>
					</div>
				</header>
				<div className="flex-1 min-h-0 flex flex-col md:flex-row">
					<div className="md:w-[360px] lg:w-[400px] border-r border-border/40 px-2 py-2 space-y-1">
						{LOADING_SKELETON_ROWS.map((rowKey) => (
							<div key={rowKey} className="flex items-start gap-3 px-3 py-2.5">
								<Skeleton className="h-7 w-7 rounded-full shrink-0" />
								<div className="flex-1 space-y-2">
									<Skeleton className="h-3 w-3/4" />
									<Skeleton className="h-3 w-full" />
									<Skeleton className="h-3 w-16" />
								</div>
							</div>
						))}
					</div>
					<div className="flex-1 flex items-center justify-center">
						<Skeleton className="h-40 w-3/4 max-w-md" />
					</div>
				</div>
			</div>
		);
	}

	// ── Render ────────────────────────────────────────────────────────────

	return (
		<div className="flex flex-1 flex-col min-h-0 bg-background mx-2 my-2 border border-border rounded-lg min-w-0 overflow-y-auto">
			{/* Header */}
			<header className="sticky top-0 z-10 bg-background flex items-center justify-between px-4 py-3 border-b border-border/40">
				<div className="flex items-center gap-3">
					<SidebarTrigger className="h-8 w-8 rounded-lg hover:bg-accent text-muted-foreground" />
					<p className="text-base font-medium text-foreground">Inbox</p>
				</div>
				<div className="flex items-center gap-2">
					<Button
						size="sm"
						variant="ghost"
						className="text-xs"
						onClick={handleMarkAllRead}
					>
						Mark all read
					</Button>
				</div>
			</header>

			{/* Tabs and filters */}
			<div className="flex items-center justify-between gap-3 px-4 py-2 border-b border-border/40">
				<div className="flex items-center gap-2 min-w-0">
					<div className="flex items-center gap-1">
						<button
							type="button"
							onClick={() => {
								setTab("inbox");
								setSelectedIndex(0);
							}}
							className={cn(
								"px-3 py-1.5 rounded-md text-xs font-medium transition-colors",
								tab === "inbox"
									? "bg-muted text-foreground"
									: "text-muted-foreground hover:text-foreground hover:bg-muted/50",
							)}
						>
							Inbox
						</button>
						<button
							type="button"
							onClick={() => {
								setTab("snoozed");
								setSelectedIndex(0);
							}}
							className={cn(
								"px-3 py-1.5 rounded-md text-xs font-medium transition-colors",
								tab === "snoozed"
									? "bg-muted text-foreground"
									: "text-muted-foreground hover:text-foreground hover:bg-muted/50",
							)}
						>
							Snoozed
							{snoozedResult && snoozedResult.notifications.length > 0 && (
								<span className="ml-1.5 text-[10px] text-muted-foreground">
									{snoozedResult.notifications.length}
								</span>
							)}
						</button>
					</div>

					{tab === "inbox" && (
						<InboxFilterPopover
							filters={inboxFilters}
							onChange={(next) => {
								setInboxFilters(next);
								setSelectedIndex(0);
							}}
						/>
					)}
				</div>
				<div className="w-full max-w-[260px]">
					<Input
						ref={searchInputRef}
						value={searchQuery}
						onChange={(e) => {
							setSearchQuery(e.target.value);
							setSelectedIndex(0);
						}}
						placeholder="Search inbox..."
						className="h-8 text-xs"
					/>
				</div>
			</div>

			{/* Main content */}
			<div className="flex-1 min-h-0 flex flex-col md:flex-row">
				{/* Notification list */}
				<div className="border-b border-border/40 md:border-b-0 md:border-r md:w-[360px] lg:w-[400px] flex flex-col min-h-0">
					{/* AI Digest Card */}
					{tab === "inbox" && <AIDigestCard />}
					<div
						ref={listContainerRef}
						className="flex-1 min-h-0 overflow-y-auto px-2 py-1"
					>
						{notifications.length === 0 ? (
							<div className="flex flex-col items-center justify-center py-16 px-4 text-center">
								{tab === "snoozed" ? (
									<>
										<AlarmClock className="h-10 w-10 text-muted-foreground/30 mb-3" />
										<p className="text-sm font-medium text-muted-foreground">
											No snoozed notifications
										</p>
										<p className="text-xs text-muted-foreground/60 mt-1 max-w-[200px]">
											Snooze notifications to revisit them later
										</p>
									</>
								) : inboxFilters.types.length > 0 ||
									inboxFilters.readStatus !== "all" ||
									searchQuery.trim().length > 0 ? (
									<>
										<ListFilter className="h-10 w-10 text-muted-foreground/30 mb-3" />
										<p className="text-sm font-medium text-muted-foreground">
											No matching notifications
										</p>
										<p className="text-xs text-muted-foreground/60 mt-1 max-w-[200px]">
											Try adjusting your filters to see more results
										</p>
									</>
								) : (
									<>
										<CheckCircle2 className="h-10 w-10 text-emerald-500/70 mb-3" />
										<p className="text-sm font-semibold text-foreground">
											All caught up!
										</p>
										<p className="text-xs text-muted-foreground/60 mt-1 max-w-[200px]">
											You have no new notifications. Take a break or get back to
											work.
										</p>
									</>
								)}
							</div>
						) : (
							<div className="space-y-0.5">
								{notifications.map((item, index) => (
									<div key={item._id} className="group relative">
										<NotificationListItem
											item={item}
											isActive={index === selectedIndex}
											onSelect={() => setSelectedIndex(index)}
										/>
										{/* Inline action buttons (visible on hover) */}
										<div className="absolute right-2 top-2 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
											{tab === "inbox" ? (
												<SnoozePopover
													onSnooze={(ts) => handleSnooze(item._id, ts)}
												>
													<button
														type="button"
														className="p-1 rounded hover:bg-muted transition-colors"
														title="Snooze"
													>
														<AlarmClock className="h-3.5 w-3.5 text-muted-foreground" />
													</button>
												</SnoozePopover>
											) : (
												<button
													type="button"
													className="p-1 rounded hover:bg-muted transition-colors"
													title="Unsnooze"
													onClick={(e) => {
														e.stopPropagation();
														handleUnsnooze(item._id);
													}}
												>
													<AlarmClock className="h-3.5 w-3.5 text-muted-foreground" />
												</button>
											)}
											<button
												type="button"
												className="p-1 rounded hover:bg-muted transition-colors"
												title="Archive"
												onClick={(e) => {
													e.stopPropagation();
													handleArchive(item._id);
												}}
											>
												<Archive className="h-3.5 w-3.5 text-muted-foreground" />
											</button>
											<button
												type="button"
												className="p-1 rounded hover:bg-muted transition-colors"
												title="Delete"
												onClick={(e) => {
													e.stopPropagation();
													handleDelete(item._id);
												}}
											>
												<Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
											</button>
										</div>
									</div>
								))}
							</div>
						)}
					</div>

					{/* Keyboard hints */}
					{notifications.length > 0 && (
						<div className="flex items-center justify-end px-3 py-2 border-t border-border/40">
							<HoverCard openDelay={120} closeDelay={120}>
								<HoverCardTrigger asChild>
									<button
										type="button"
										className="inline-flex items-center gap-1.5 rounded-md border border-border/60 bg-muted/40 px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
										aria-label="Show keyboard shortcuts"
									>
										<CircleHelp className="h-3.5 w-3.5" />
										<span>Shortcuts</span>
									</button>
								</HoverCardTrigger>
								<HoverCardContent
									side="top"
									align="end"
									className="w-[280px] p-3.5"
								>
									<div className="space-y-3">
										<div className="flex items-center justify-between">
											<p className="text-xs font-medium text-foreground">
												Inbox shortcuts
											</p>
											<kbd className="rounded border bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
												?
											</kbd>
										</div>
										<div className="space-y-1.5 text-[11px] text-muted-foreground">
											<div className="flex items-center justify-between gap-3">
												<span>Move selection</span>
												<div className="inline-flex items-center gap-1">
													<kbd className="rounded border bg-muted px-1.5 py-0.5 font-mono text-[10px]">
														J
													</kbd>
													<kbd className="rounded border bg-muted px-1.5 py-0.5 font-mono text-[10px]">
														K
													</kbd>
												</div>
											</div>
											<div className="flex items-center justify-between gap-3">
												<span>Toggle read</span>
												<kbd className="rounded border bg-muted px-1.5 py-0.5 font-mono text-[10px]">
													U
												</kbd>
											</div>
											<div className="flex items-center justify-between gap-3">
												<span>Snooze 1 hour</span>
												<kbd className="rounded border bg-muted px-1.5 py-0.5 font-mono text-[10px]">
													H
												</kbd>
											</div>
											<div className="flex items-center justify-between gap-3">
												<span>Archive</span>
												<kbd className="rounded border bg-muted px-1.5 py-0.5 font-mono text-[10px]">
													E
												</kbd>
											</div>
											<div className="flex items-center justify-between gap-3">
												<span>Delete selected</span>
												<kbd className="rounded border bg-muted px-1.5 py-0.5 font-mono text-[10px]">
													&#x232B;
												</kbd>
											</div>
											<div className="flex items-center justify-between gap-3">
												<span>Delete visible</span>
												<kbd className="rounded border bg-muted px-1.5 py-0.5 font-mono text-[10px]">
													&#8679;&#x232B;
												</kbd>
											</div>
											<div className="flex items-center justify-between gap-3">
												<span>Delete all read</span>
												<kbd className="rounded border bg-muted px-1.5 py-0.5 font-mono text-[10px]">
													&#8984;/Ctrl+D
												</kbd>
											</div>
										</div>
										<p className="text-[10px] text-muted-foreground/80">
											Press <span className="font-mono">?</span> for the full
											shortcuts overlay.
										</p>
									</div>
								</HoverCardContent>
							</HoverCard>
						</div>
					)}
				</div>

				{/* Preview panel */}
				<div className="flex-1 min-h-0 flex flex-col">
					{selectedNotification ? (
						(() => {
							const t = selectedNotification.type;
							if (t === "project_update") {
								return (
									<ProjectUpdatePreviewPanel
										notification={selectedNotification}
										workspaceSlug={workspaceSlug}
										orgSlug={orgSlug}
									/>
								);
							}
							if (t === "document_update" || t === "document_comment") {
								return (
									<DocumentPreviewPanel
										notification={selectedNotification}
										workspaceSlug={workspaceSlug}
										orgSlug={orgSlug}
									/>
								);
							}
							if (t === "whiteboard_update") {
								return (
									<WhiteboardPreviewPanel
										notification={selectedNotification}
										workspaceSlug={workspaceSlug}
										orgSlug={orgSlug}
									/>
								);
							}
							return (
								<IssuePreviewPanel
									notification={selectedNotification}
									workspaceId={workspaceId}
									workspaceSlug={workspaceSlug}
									orgSlug={orgSlug}
								/>
							);
						})()
					) : (
						<div className="flex-1 flex items-center justify-center">
							<div className="text-center">
								<Inbox className="h-10 w-10 text-muted-foreground/20 mx-auto mb-3" />
								<p className="text-sm font-medium text-muted-foreground">
									No notification selected
								</p>
								<p className="text-xs text-muted-foreground/60 mt-1">
									Select a notification to see details
								</p>
							</div>
						</div>
					)}
				</div>
			</div>
		</div>
	);
}
