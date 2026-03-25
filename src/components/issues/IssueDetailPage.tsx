"use client";

import { DotsThree } from "@phosphor-icons/react/dist/ssr";
import { useMutation, useQuery } from "convex/react";
import { format } from "date-fns";
import {
	Bell,
	BellOff,
	Calendar,
	Check,
	ChevronRight,
	CircleDashed,
	CircleDot,
	CircleX,
	Clock,
	Copy,
	Flag,
	FolderOpen,
	GitBranch,
	Link as LinkIcon,
	type LucideIcon,
	PanelRight,
	PanelRightClose,
	Paperclip,
	SignalHigh,
	Tag,
	User,
	X,
} from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { IssueDevelopmentSection } from "@/components/github/IssueDevelopmentSection";
import { EstimateInput } from "@/components/issues/EstimateInput";
import { formatEstimate } from "@/components/issues/IssueListRow";
import { useWorkspace } from "@/components/providers/workspace-context";
import {
	useWorkspaceLabels,
	useWorkspaceMembers,
	useWorkspaceProjects,
} from "@/components/providers/workspace-data-context";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { BackButton } from "@/components/ui/back-button";
import { Button } from "@/components/ui/button";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
	Command,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
} from "@/components/ui/command";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { FavoriteButton } from "@/components/ui/favorite-button";
import { DatePicker, GenericPicker } from "@/components/ui/pickers";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import {
	type IssueTypeKey,
	PRIORITY_ITEMS,
	type PriorityKey,
	STATUS_ITEMS,
	type StatusKey,
	TYPE_ITEMS,
} from "@/lib/issue-config";
import { cn } from "@/lib/utils";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { IssueActivitySection } from "./IssueActivitySection";
import { IssueAttachDialog } from "./IssueAttachDialog";
import { IssueDescriptionEditorDynamic } from "./IssueDescriptionEditorDynamic";
import { IssueRelationsSection } from "./IssueRelationsSection";
import { LinkedResources, useAttachmentCount } from "./LinkedResources";

const SubIssuesList = dynamic(
	() => import("./SubIssuesList").then((mod) => mod.SubIssuesList),
	{ ssr: false },
);

// ── Issue config (from centralized module) ────────────────────────────────

const STATUS_CONFIG = STATUS_ITEMS;
const PRIORITY_CONFIG = PRIORITY_ITEMS;
const TYPE_CONFIG = TYPE_ITEMS;

// ── Estimate options ──────────────────────────────────────────────────────

const ESTIMATE_OPTIONS = [
	{ id: "0", label: "No estimate" },
	{ id: "0.5", label: "0.5h" },
	{ id: "1", label: "1h" },
	{ id: "2", label: "2h" },
	{ id: "4", label: "4h" },
	{ id: "8", label: "1d" },
	{ id: "16", label: "2d" },
	{ id: "24", label: "3d" },
	{ id: "40", label: "5d" },
];

// ── Helper: Status icon ──────────────────────────────────────────────────

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

// ── Helper: Priority icon ────────────────────────────────────────────────

function PriorityIcon({
	priorityId,
	className,
}: {
	priorityId: string;
	className?: string;
}) {
	const config = PRIORITY_CONFIG.find((p) => p.id === priorityId);
	if (!config) return null;
	const Icon = config.icon;
	return <Icon className={cn("h-4 w-4", config.color, className)} />;
}

// ── Labels multi-select picker ───────────────────────────────────────────

function LabelsPicker({
	allLabels,
	selectedIds,
	onToggle,
}: {
	allLabels: { _id: Id<"labels">; name: string; color: string }[];
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
					className="flex items-center gap-1.5 px-2 py-1 rounded-md hover:bg-muted transition-colors text-sm min-h-[28px] text-left"
				>
					{selectedLabels.length > 0 ? (
						<span className="flex flex-wrap gap-1">
							{selectedLabels.map((label) => (
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
							))}
						</span>
					) : (
						<span className="text-muted-foreground">No labels</span>
					)}
				</button>
			</PopoverTrigger>
			<PopoverContent className="p-0 w-[240px]" align="start">
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
		<div className="flex items-center gap-3 min-h-[36px] py-1">
			<span className="flex items-center gap-2 text-[13px] text-muted-foreground w-[100px] shrink-0">
				<Icon className="h-3.5 w-3.5" />
				{label}
			</span>
			<div className="flex-1 min-w-0">{children}</div>
		</div>
	);
}

// ── Main component ───────────────────────────────────────────────────────

// Detect if a string looks like a Convex document ID (not an identifier like CLV-42)
function isConvexId(value: string): boolean {
	return /^[a-z0-9]{20,}$/.test(value);
}

export function IssueDetailPage({ identifier }: { identifier: string }) {
	const router = useRouter();
	const { workspaceId, workspaceSlug } = useWorkspace();

	// ── Backward compatibility: detect old Convex ID URLs ─────────────
	const isLegacyId = isConvexId(identifier);
	const legacyIssue = useQuery(
		api.issues.getById,
		isLegacyId ? { issueId: identifier as Id<"issues"> } : "skip",
	);

	// Redirect legacy Convex ID URLs to identifier-based URLs
	useEffect(() => {
		if (isLegacyId && legacyIssue) {
			router.replace(`/${workspaceSlug}/issues/${legacyIssue.identifier}`);
		}
	}, [isLegacyId, legacyIssue, router, workspaceSlug]);

	// ── Data fetching ────────────────────────────────────────────────────
	const issue = useQuery(
		api.issues.getByIdentifier,
		!isLegacyId ? { workspaceId, identifier } : "skip",
	);
	// Derive Convex ID from loaded issue for mutations
	const issueId = issue?._id;
	const members = useWorkspaceMembers();
	const projects = useWorkspaceProjects();
	const labels = useWorkspaceLabels();
	const sprints = useQuery(
		api.sprints.listByProject,
		issue?.projectId ? { projectId: issue.projectId } : "skip",
	);

	const subscriptionStatus = useQuery(
		api.issues.getSubscriptionStatus,
		issueId ? { issueId } : "skip",
	);
	const isSubscribed = subscriptionStatus?.isSubscribed ?? false;

	// ── Mutations ────────────────────────────────────────────────────────
	const updateIssue = useMutation(api.issues.update);
	const updateStatus = useMutation(api.issues.updateStatus);
	const assignIssue = useMutation(api.issues.assign);
	const removeIssue = useMutation(api.issues.remove);
	const subscribeMutation = useMutation(api.issues.subscribe);
	const unsubscribeMutation = useMutation(api.issues.unsubscribe);

	// ── Editing state ────────────────────────────────────────────────────
	const [editingTitle, setEditingTitle] = useState(false);
	const [titleValue, setTitleValue] = useState("");
	const [isDeleteOpen, setIsDeleteOpen] = useState(false);
	const [showSidebar, setShowSidebar] = useState(true);
	const titleInputRef = useRef<HTMLInputElement>(null);

	// ── Sync local state with issue data ─────────────────────────────────
	useEffect(() => {
		if (issue) {
			setTitleValue(issue.title);
		}
	}, [issue]);

	useEffect(() => {
		if (editingTitle) titleInputRef.current?.focus();
	}, [editingTitle]);

	// ── Computed values ──────────────────────────────────────────────────
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
		return projects.map((p) => ({
			id: p._id as string,
			name: p.name,
		}));
	}, [projects]);

	const sprintOptions = useMemo(() => {
		if (!sprints) return [];
		return sprints.map((m) => ({
			id: m._id as string,
			name: m.name,
		}));
	}, [sprints]);

	const assignee = useMemo(() => {
		if (!issue?.assigneeId || !memberOptions.length) return undefined;
		return memberOptions.find((m) => m.id === issue.assigneeId);
	}, [issue?.assigneeId, memberOptions]);

	const project = useMemo(() => {
		if (!issue?.projectId || !projects) return undefined;
		return projects.find((p) => p._id === issue.projectId);
	}, [issue?.projectId, projects]);

	const sprint = useMemo(() => {
		const sprintId = issue?.sprintId ?? issue?.milestoneId;
		if (!sprintId || !sprints) return undefined;
		return sprints.find((m) => m._id === sprintId);
	}, [issue?.sprintId, issue?.milestoneId, sprints]);

	const currentStatus = STATUS_CONFIG.find((s) => s.id === issue?.status);
	const currentPriority = PRIORITY_CONFIG.find((p) => p.id === issue?.priority);
	const currentType = TYPE_CONFIG.find((t) => t.id === issue?.type);

	// ── Handlers ─────────────────────────────────────────────────────────
	const handleTitleSave = useCallback(async () => {
		if (!titleValue.trim()) return;
		setEditingTitle(false);
		try {
			await updateIssue({
				issueId: issueId as Id<"issues">,
				title: titleValue.trim(),
			});
		} catch {
			toast.error("Failed to update title");
		}
	}, [issueId, titleValue, updateIssue]);

	const handleStatusChange = useCallback(
		async (option: { id: string }) => {
			try {
				await updateStatus({
					issueId: issueId as Id<"issues">,
					status: option.id as StatusKey,
				});
			} catch {
				toast.error("Failed to update status");
			}
		},
		[issueId, updateStatus],
	);

	const handleAssigneeChange = useCallback(
		async (option: { id: string }) => {
			try {
				await assignIssue({
					issueId: issueId as Id<"issues">,
					assigneeId: option.id as Id<"users">,
				});
			} catch {
				toast.error("Failed to assign issue");
			}
		},
		[issueId, assignIssue],
	);

	const handleUnassign = useCallback(async () => {
		try {
			await assignIssue({
				issueId: issueId as Id<"issues">,
				assigneeId: undefined,
			});
		} catch {
			toast.error("Failed to unassign");
		}
	}, [issueId, assignIssue]);

	const handlePriorityChange = useCallback(
		async (option: { id: string }) => {
			try {
				await updateIssue({
					issueId: issueId as Id<"issues">,
					priority: option.id as PriorityKey,
				});
			} catch {
				toast.error("Failed to update priority");
			}
		},
		[issueId, updateIssue],
	);

	const handleTypeChange = useCallback(
		async (option: { id: string }) => {
			try {
				await updateIssue({
					issueId: issueId as Id<"issues">,
					type: option.id as IssueTypeKey,
				});
			} catch {
				toast.error("Failed to update type");
			}
		},
		[issueId, updateIssue],
	);

	const handleProjectChange = useCallback(
		async (option: { id: string }) => {
			try {
				await updateIssue({
					issueId: issueId as Id<"issues">,
					projectId: option.id as Id<"projects">,
				});
			} catch {
				toast.error("Failed to update project");
			}
		},
		[issueId, updateIssue],
	);

	const handleSprintChange = useCallback(
		async (option: { id: string }) => {
			try {
				await updateIssue({
					issueId: issueId as Id<"issues">,
					sprintId: option.id as Id<"sprints">,
					milestoneId: undefined,
				});
			} catch {
				toast.error("Failed to update sprint");
			}
		},
		[issueId, updateIssue],
	);

	const handleLabelToggle = useCallback(
		async (labelId: Id<"labels">) => {
			if (!issue) return;
			const currentLabels = issue.labelIds ?? [];
			const newLabels = currentLabels.includes(labelId)
				? currentLabels.filter((id) => id !== labelId)
				: [...currentLabels, labelId];
			try {
				await updateIssue({
					issueId: issueId as Id<"issues">,
					labelIds: newLabels,
				});
			} catch {
				toast.error("Failed to update labels");
			}
		},
		[issueId, issue, updateIssue],
	);

	const handleEstimateChange = useCallback(
		async (option: { id: string }) => {
			try {
				const value = Number.parseFloat(option.id);
				await updateIssue({
					issueId: issueId as Id<"issues">,
					estimate: value === 0 ? undefined : value,
				});
			} catch {
				toast.error("Failed to update estimate");
			}
		},
		[issueId, updateIssue],
	);

	const handleDueDateChange = useCallback(
		async (date: Date | undefined) => {
			try {
				await updateIssue({
					issueId: issueId as Id<"issues">,
					dueDate: date?.getTime(),
				});
			} catch {
				toast.error("Failed to update due date");
			}
		},
		[issueId, updateIssue],
	);

	const handleCopyLink = useCallback(async () => {
		try {
			await navigator.clipboard.writeText(window.location.href);
			toast.success("Link copied to clipboard");
		} catch {
			toast.error("Failed to copy link");
		}
	}, []);

	const handleCopyIdentifier = useCallback(async () => {
		if (!issue) return;
		try {
			await navigator.clipboard.writeText(issue.identifier);
			toast.success(`Copied "${issue.identifier}"`);
		} catch {
			toast.error("Failed to copy identifier");
		}
	}, [issue]);

	const handleDelete = useCallback(async () => {
		if (!issueId) return;
		try {
			await removeIssue({ issueId: issueId as Id<"issues"> });
			toast.success("Issue deleted");
			router.push(`/${workspaceSlug}/tasks`);
		} catch {
			toast.error("Failed to delete issue");
		}
	}, [issueId, removeIssue, router, workspaceSlug]);

	const handleToggleSubscription = useCallback(async () => {
		if (!issueId) return;
		try {
			if (isSubscribed) {
				await unsubscribeMutation({ issueId: issueId as Id<"issues"> });
				toast.success("Unsubscribed from issue");
			} else {
				await subscribeMutation({ issueId: issueId as Id<"issues"> });
				toast.success("Subscribed to issue");
			}
		} catch {
			toast.error("Failed to update subscription");
		}
	}, [issueId, isSubscribed, subscribeMutation, unsubscribeMutation]);

	// ── Loading state ────────────────────────────────────────────────────
	if (issue === undefined) {
		return (
			<div className="flex items-center justify-center min-h-[60vh]">
				<div className="animate-pulse text-muted-foreground">
					Loading issue...
				</div>
			</div>
		);
	}

	// ── 404 state ────────────────────────────────────────────────────────
	if (issue === null) {
		return (
			<div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
				<div className="rounded-full bg-muted p-4">
					<CircleX className="h-8 w-8 text-muted-foreground" />
				</div>
				<h1 className="text-xl font-semibold">Issue not found</h1>
				<p className="text-sm text-muted-foreground">
					This issue doesn't exist or has been deleted.
				</p>
				<Button variant="outline" onClick={() => router.back()}>
					Go back
				</Button>
			</div>
		);
	}

	// ── Render ────────────────────────────────────────────────────────────
	return (
		<div className="flex flex-col h-full">
			{/* Top bar: back, breadcrumbs, actions */}
			<div className="flex items-center justify-between gap-2 px-4 py-2.5 text-[13px] text-muted-foreground border-b border-border/60">
				<div className="flex items-center gap-2 min-w-0">
					<BackButton fallbackHref={`/${workspaceSlug}/tasks`} />
					<Separator orientation="vertical" className="h-4" />
					<nav className="flex items-center gap-1.5 min-w-0">
						<Link
							href={`/${workspaceSlug}/projects`}
							className="hover:text-foreground transition-colors truncate"
							prefetch={false}
						>
							{workspaceSlug}
						</Link>
						{project && (
							<>
								<ChevronRight className="h-3 w-3 text-muted-foreground/50 shrink-0" />
								<Link
									href={`/${workspaceSlug}/projects/${project.slug}`}
									className="hover:text-foreground transition-colors truncate"
									prefetch={false}
								>
									{project.name}
								</Link>
							</>
						)}
						{issue.parent && (
							<>
								<ChevronRight className="h-3 w-3 text-muted-foreground/50 shrink-0" />
								<Link
									href={`/${workspaceSlug}/issues/${issue.parent.identifier}`}
									className="hover:text-foreground transition-colors"
									prefetch={false}
								>
									{issue.parent.identifier}
								</Link>
							</>
						)}
						<ChevronRight className="h-3 w-3 text-muted-foreground/50 shrink-0" />
						<span className="text-foreground font-medium">
							{issue.identifier}
						</span>
					</nav>
				</div>

				{/* Action buttons */}
				<div className="flex items-center gap-1 shrink-0">
					<FavoriteButton entityType="issue" entityId={issue._id} />

					<TooltipProvider>
						<Tooltip>
							<TooltipTrigger asChild>
								<Button
									variant="ghost"
									size="icon-sm"
									onClick={handleToggleSubscription}
									aria-label={isSubscribed ? "Unsubscribe" : "Subscribe"}
								>
									{isSubscribed ? (
										<BellOff className="h-4 w-4" />
									) : (
										<Bell className="h-4 w-4" />
									)}
								</Button>
							</TooltipTrigger>
							<TooltipContent side="bottom">
								{isSubscribed ? "Unsubscribe" : "Subscribe"}
							</TooltipContent>
						</Tooltip>
					</TooltipProvider>

					<TooltipProvider>
						<Tooltip>
							<TooltipTrigger asChild>
								<Button
									variant="ghost"
									size="icon-sm"
									onClick={handleCopyLink}
									aria-label="Copy link"
								>
									<LinkIcon className="h-4 w-4" />
								</Button>
							</TooltipTrigger>
							<TooltipContent side="bottom">Copy link</TooltipContent>
						</Tooltip>
					</TooltipProvider>

					<TooltipProvider>
						<Tooltip>
							<TooltipTrigger asChild>
								<Button
									variant="ghost"
									size="icon-sm"
									onClick={handleCopyIdentifier}
									aria-label="Copy identifier"
								>
									<Copy className="h-4 w-4" />
								</Button>
							</TooltipTrigger>
							<TooltipContent side="bottom">Copy identifier</TooltipContent>
						</Tooltip>
					</TooltipProvider>

					<TooltipProvider>
						<Tooltip>
							<TooltipTrigger asChild>
								<Button
									variant="ghost"
									size="icon-sm"
									onClick={() => setShowSidebar(!showSidebar)}
									aria-label={
										showSidebar ? "Hide properties" : "Show properties"
									}
								>
									{showSidebar ? (
										<PanelRightClose className="h-4 w-4" />
									) : (
										<PanelRight className="h-4 w-4" />
									)}
								</Button>
							</TooltipTrigger>
							<TooltipContent side="bottom">
								{showSidebar ? "Hide properties" : "Show properties"}
							</TooltipContent>
						</Tooltip>
					</TooltipProvider>

					<DropdownMenu>
						<DropdownMenuTrigger asChild>
							<Button variant="ghost" size="icon-sm" aria-label="Options">
								<DotsThree className="h-4 w-4" weight="bold" />
							</Button>
						</DropdownMenuTrigger>
						<DropdownMenuContent align="end">
							<DropdownMenuItem onClick={handleCopyLink}>
								<LinkIcon className="mr-2 h-4 w-4" />
								Copy link
							</DropdownMenuItem>
							<DropdownMenuItem onClick={handleCopyIdentifier}>
								<Copy className="mr-2 h-4 w-4" />
								Copy identifier
							</DropdownMenuItem>
							<DropdownMenuItem
								onClick={() => setIsDeleteOpen(true)}
								className="text-destructive focus:text-destructive"
							>
								Delete issue
							</DropdownMenuItem>
						</DropdownMenuContent>
					</DropdownMenu>
				</div>
			</div>

			{/* Two-column layout */}
			<div className="flex flex-col lg:flex-row flex-1 min-h-0">
				{/* Main content (left) */}
				<div className="flex-1 overflow-y-auto">
					<div className="max-w-[680px] mx-auto px-6 py-8 space-y-8">
						{/* Identifier badge */}
						<div className="flex items-center gap-2.5">
							<StatusIcon statusId={issue.status} />
							<span className="text-[13px] font-mono text-muted-foreground">
								{issue.identifier}
							</span>
						</div>

						{/* Title */}
						{editingTitle ? (
							<input
								ref={titleInputRef}
								value={titleValue}
								onChange={(e) => setTitleValue(e.target.value)}
								onBlur={handleTitleSave}
								onKeyDown={(e) => {
									if (e.key === "Enter") handleTitleSave();
									if (e.key === "Escape") {
										setEditingTitle(false);
										setTitleValue(issue.title);
									}
								}}
								className="text-[28px] leading-tight font-bold bg-transparent border-b-2 border-primary outline-none w-full pb-1 -mt-2"
							/>
						) : (
							<button
								type="button"
								className="text-[28px] leading-tight font-bold cursor-pointer hover:text-foreground/80 transition-colors text-left w-full -mt-2"
								onClick={() => setEditingTitle(true)}
							>
								{issue.title}
							</button>
						)}

						{/* Description */}
						<div className="-mt-2">
							<IssueDescriptionEditorDynamic
								issueId={issue._id}
								initialContent={issue.description}
								issueTitle={issue.title}
							/>
						</div>

						{/* Sub-issues */}
						<SubIssuesList parentId={issue._id} />

						{/* Relations */}
						<IssueRelationsSection issueId={issue._id} />

						{/* Development — linked PRs, commits, branches */}
						{issue.projectId && (
							<IssueDevelopmentSection
								issueId={issue._id}
								projectId={issue.projectId}
								gitBranchName={issue.gitBranchName}
								identifier={issue.identifier}
								title={issue.title}
							/>
						)}

						{/* Attachments & linked resources */}
						<IssueAttachmentsSection
							issueId={issue._id}
							linkedDocumentIds={issue.linkedDocumentIds}
							linkedWhiteboardIds={issue.linkedWhiteboardIds}
						/>

						<Separator className="bg-border/60" />

						{/* Activity / Comments */}
						<IssueActivitySection issueId={issue._id} />
					</div>
				</div>

				{/* Properties sidebar (right) */}
				{showSidebar && (
					<div className="w-full lg:w-[300px] lg:shrink-0 border-t lg:border-t-0 lg:border-l border-border/60 overflow-y-auto">
						<div className="p-5 space-y-0.5">
							<h3 className="text-[11px] font-medium text-muted-foreground/70 mb-3">
								Properties
							</h3>

							{/* Status */}
							<PropertyRow icon={CircleDashed} label="Status">
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

							{/* Assignee */}
							<PropertyRow icon={User} label="Assignee">
								<div className="flex items-center gap-1">
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
															{assignee.image && (
																<AvatarImage
																	src={assignee.image}
																	alt={assignee.name}
																/>
															)}
															<AvatarFallback className="text-[10px]">
																{assignee.name.charAt(0).toUpperCase()}
															</AvatarFallback>
														</Avatar>
														<span>{assignee.name}</span>
													</>
												) : (
													<span className="text-muted-foreground">
														Unassigned
													</span>
												)}
											</button>
										}
									/>
									{issue.assigneeId && (
										<button
											type="button"
											onClick={handleUnassign}
											className="text-muted-foreground hover:text-foreground p-1 rounded-md hover:bg-muted transition-colors"
										>
											<X className="h-3 w-3" />
										</button>
									)}
								</div>
							</PropertyRow>

							{/* Priority */}
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
											<PriorityIcon priorityId={issue.priority} />
											<span>{currentPriority?.label ?? "No priority"}</span>
										</button>
									}
								/>
							</PropertyRow>

							{/* Labels */}
							<PropertyRow icon={Tag} label="Labels">
								{labels && (
									<LabelsPicker
										allLabels={labels}
										selectedIds={(issue.labelIds as Id<"labels">[]) ?? []}
										onToggle={handleLabelToggle}
									/>
								)}
							</PropertyRow>

							<Separator className="my-2.5 bg-border/60" />

							{/* Project */}
							<PropertyRow icon={FolderOpen} label="Project">
								<GenericPicker
									items={projectOptions}
									onSelect={handleProjectChange}
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
											className="flex items-center gap-2 px-2 py-1 rounded-md hover:bg-muted transition-colors text-sm"
										>
											<span>
												{project?.name ?? (
													<span className="text-muted-foreground">
														No project
													</span>
												)}
											</span>
										</button>
									}
								/>
							</PropertyRow>

							{/* Milestone */}
							{issue.projectId && (
								<PropertyRow icon={Flag} label="Sprint">
									<GenericPicker
										items={sprintOptions}
										onSelect={handleSprintChange}
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
												<span className="flex-1">{item.name}</span>
											</div>
										)}
										trigger={
											<button
												type="button"
												className="flex items-center gap-2 px-2 py-1 rounded-md hover:bg-muted transition-colors text-sm"
											>
												<span>
													{sprint?.name ?? (
														<span className="text-muted-foreground">
															No sprint
														</span>
													)}
												</span>
											</button>
										}
									/>
								</PropertyRow>
							)}

							<Separator className="my-2.5 bg-border/60" />

							{/* Type */}
							<PropertyRow icon={CircleDot} label="Type">
								<GenericPicker
									items={TYPE_CONFIG}
									onSelect={handleTypeChange}
									selectedId={issue.type}
									placeholder="Set type..."
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
											{currentType && (
												<currentType.icon
													className={cn("h-4 w-4", currentType.color)}
												/>
											)}
											<span>{currentType?.label ?? "Issue"}</span>
										</button>
									}
								/>
							</PropertyRow>

							{/* Estimate */}
							<PropertyRow icon={Clock} label="Estimate">
								<EstimateInput
									value={issue.estimate ?? undefined}
									onChange={async (hours) => {
										try {
											await updateIssue({
												issueId: issueId as Id<"issues">,
												estimate: hours === 0 ? undefined : hours,
											});
										} catch {
											toast.error("Failed to update estimate");
										}
									}}
									compact
								/>
							</PropertyRow>

							{/* Due date */}
							<PropertyRow icon={Calendar} label="Due date">
								<DatePicker
									date={issue.dueDate ? new Date(issue.dueDate) : undefined}
									onSelect={handleDueDateChange}
									trigger={
										<button
											type="button"
											className="flex items-center gap-2 px-2 py-1 rounded-md hover:bg-muted transition-colors text-sm"
										>
											<span>
												{issue.dueDate ? (
													format(new Date(issue.dueDate), "MMM d, yyyy")
												) : (
													<span className="text-muted-foreground">
														No due date
													</span>
												)}
											</span>
										</button>
									}
								/>
							</PropertyRow>

							{/* Git branch */}
							{issue.gitBranchName && (
								<PropertyRow icon={GitBranch} label="Branch">
									<span className="text-sm font-mono text-muted-foreground px-2 py-1">
										{issue.gitBranchName}
									</span>
								</PropertyRow>
							)}

							<Separator className="my-2.5 bg-border/60" />

							{/* Timestamps */}
							<div className="space-y-1 pt-1 text-[11px] text-muted-foreground/60">
								<p>
									Created{" "}
									{format(
										new Date(issue._creationTime),
										"MMM d, yyyy 'at' h:mm a",
									)}
								</p>
								{issue.updatedAt && (
									<p>
										Updated{" "}
										{format(
											new Date(issue.updatedAt),
											"MMM d, yyyy 'at' h:mm a",
										)}
									</p>
								)}
								{issue.completedAt && (
									<p>
										Completed{" "}
										{format(
											new Date(issue.completedAt),
											"MMM d, yyyy 'at' h:mm a",
										)}
									</p>
								)}
							</div>
						</div>
					</div>
				)}
			</div>

			{/* Delete confirmation */}
			<AlertDialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Delete issue</AlertDialogTitle>
						<AlertDialogDescription>
							Are you sure you want to delete "{issue.identifier}: {issue.title}
							"? This action cannot be undone.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>Cancel</AlertDialogCancel>
						<AlertDialogAction
							onClick={handleDelete}
							className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
						>
							Delete
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</div>
	);
}

// ── Attachments Section (Collapsible) ─────────────────────────────────────────

function IssueAttachmentsSection({
	issueId,
	linkedDocumentIds,
	linkedWhiteboardIds,
}: {
	issueId: Id<"issues">;
	linkedDocumentIds?: Id<"documents">[];
	linkedWhiteboardIds?: Id<"whiteboards">[];
}) {
	const attachmentCount = useAttachmentCount(
		issueId,
		linkedDocumentIds,
		linkedWhiteboardIds,
	);

	return (
		<Collapsible defaultOpen={attachmentCount > 0}>
			<div className="space-y-2.5">
				<div className="flex items-center justify-between">
					<CollapsibleTrigger className="flex items-center gap-1.5 group cursor-pointer">
						<ChevronRight className="h-3.5 w-3.5 text-muted-foreground transition-transform group-data-[state=open]:rotate-90" />
						<h3 className="text-[13px] font-medium text-foreground/80 flex items-center gap-1.5">
							<Paperclip className="h-3.5 w-3.5 text-muted-foreground" />
							Attachments
							{attachmentCount > 0 && (
								<span className="text-xs text-muted-foreground/70">
									({attachmentCount})
								</span>
							)}
						</h3>
					</CollapsibleTrigger>
					<IssueAttachDialog
						issueId={issueId}
						existingDocIds={linkedDocumentIds}
						existingBoardIds={linkedWhiteboardIds}
					/>
				</div>

				<CollapsibleContent>
					<LinkedResources
						issueId={issueId}
						linkedDocumentIds={linkedDocumentIds}
						linkedWhiteboardIds={linkedWhiteboardIds}
					/>
					{attachmentCount === 0 && (
						<p className="text-[13px] text-muted-foreground/50 py-3 text-center">
							No attachments
						</p>
					)}
				</CollapsibleContent>
			</div>
		</Collapsible>
	);
}
