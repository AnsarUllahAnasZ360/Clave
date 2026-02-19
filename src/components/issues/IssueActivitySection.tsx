"use client";

import { useMutation, useQuery } from "convex/react";
import { formatDistanceToNow } from "date-fns";
import {
	Activity,
	ArrowUpRight,
	BellOff,
	CalendarDays,
	ChevronDown,
	ChevronRight,
	Ellipsis,
	FileText,
	Flag,
	FolderOpen,
	Hash,
	MessageSquare,
	Pencil,
	Plus,
	Reply,
	SignalHigh,
	Tag,
	Trash2,
	Type,
	UserPlus,
} from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";

import {
	CommentContent,
	extractCommentText,
} from "@/components/comments/CommentContent";
import { CommentEditor } from "@/components/comments/CommentEditor";
import { useWorkspace } from "@/components/providers/workspace-context";
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
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useMentionSuggestion } from "@/hooks/use-mention-suggestion";
import { cn } from "@/lib/utils";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

// ── Types ───────────────────────────────────────────────────────────────────

type CommentAttachment = {
	_id: string;
	name: string;
	mimeType?: string | null;
	url: string | null;
};

type Comment = {
	_id: Id<"comments">;
	_creationTime: number;
	issueId?: Id<"issues">;
	parentId?: Id<"comments">;
	body: string;
	authorId: Id<"users">;
	updatedAt?: number;
	deletedAt?: number;
	author: { name: string; image?: string };
	attachments?: CommentAttachment[];
};

type ActivityEntry = {
	_id: Id<"activityLogs">;
	_creationTime: number;
	action: string;
	description?: string;
	actorName: string;
	actorImage?: string;
	field?: string;
	oldValue?: string;
	newValue?: string;
};

type FeedItem =
	| { type: "comment"; data: Comment }
	| { type: "activity"; data: ActivityEntry };

type ViewMode = "all" | "comments";

// ── Activity helpers ─────────────────────────────────────────────────────────

function getActivityIcon(action: string, field?: string) {
	if (action === "created") return Plus;
	if (action === "assigned") return UserPlus;
	if (action === "status_changed") return Activity;
	if (action === "updated" && field) {
		switch (field) {
			case "priority":
				return SignalHigh;
			case "labelIds":
				return Tag;
			case "milestoneId":
				return Flag;
			case "projectId":
				return FolderOpen;
			case "description":
				return FileText;
			case "title":
				return Type;
			case "type":
				return Hash;
			case "estimate":
				return Hash;
			case "dueDate":
			case "startDate":
				return CalendarDays;
			case "assigneeId":
				return UserPlus;
		}
	}
	return Activity;
}

function formatFieldValue(field: string, value: string): string {
	if (field === "status" || field === "priority" || field === "type") {
		return value.replace(/_/g, " ");
	}
	return value;
}

// ── Activity item ───────────────────────────────────────────────────────────

function ActivityItem({ entry }: { entry: ActivityEntry }) {
	const Icon = getActivityIcon(entry.action, entry.field);
	const showValues =
		entry.field &&
		entry.field !== "description" &&
		(entry.oldValue || entry.newValue);

	return (
		<div className="flex items-start gap-2 py-2 px-1">
			<div className="mt-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-muted">
				<Icon className="h-3 w-3 text-muted-foreground" />
			</div>
			<div className="flex-1 min-w-0">
				<p className="text-xs text-muted-foreground">
					<span className="font-medium text-foreground/80">
						{entry.actorName}
					</span>{" "}
					{entry.description ?? entry.action}
					{showValues && entry.field && entry.oldValue && entry.newValue && (
						<>
							{" "}
							<span className="line-through opacity-60">
								{formatFieldValue(entry.field, entry.oldValue)}
							</span>{" "}
							<span>{formatFieldValue(entry.field, entry.newValue)}</span>
						</>
					)}
					<span className="ml-2 text-muted-foreground/60">
						{formatDistanceToNow(entry._creationTime, { addSuffix: true })}
					</span>
				</p>
			</div>
		</div>
	);
}

// ── Comment item ────────────────────────────────────────────────────────────

function CommentItem({
	comment,
	currentUserId,
	isEditing,
	onStartEdit,
	onSaveEdit,
	onCancelEdit,
	onStartReply,
	onDelete,
	onCreateSubIssue,
	submitting,
	isReply,
	mentionSuggestion,
	workspaceSlug,
}: {
	comment: Comment;
	currentUserId: Id<"users"> | undefined;
	isEditing: boolean;
	onStartEdit: (comment: Comment) => void;
	onSaveEdit: (commentId: Id<"comments">, body: string) => void;
	onCancelEdit: () => void;
	onStartReply: (commentId: Id<"comments">) => void;
	onDelete: (commentId: Id<"comments">) => void;
	onCreateSubIssue: (comment: Comment) => void;
	submitting: boolean;
	isReply?: boolean;
	mentionSuggestion?: ReturnType<typeof useMentionSuggestion>;
	workspaceSlug?: string;
}) {
	const isOwn = currentUserId === comment.authorId;
	const isDeleted = !!comment.deletedAt;

	if (isDeleted) {
		return (
			<div className="py-2 px-1">
				<p className="text-sm text-muted-foreground italic">
					[Comment deleted]
				</p>
			</div>
		);
	}

	return (
		<div className="py-2 px-1 group">
			<div className="flex items-start gap-2">
				<Avatar className="size-6 shrink-0 mt-0.5">
					{comment.author.image && (
						<AvatarImage src={comment.author.image} alt={comment.author.name} />
					)}
					<AvatarFallback className="text-[10px]">
						{comment.author.name.charAt(0).toUpperCase()}
					</AvatarFallback>
				</Avatar>
				<div className="flex-1 min-w-0">
					<div className="flex items-center gap-2">
						<span className="text-sm font-medium truncate">
							{comment.author.name}
						</span>
						<span className="text-[10px] text-muted-foreground shrink-0">
							{formatDistanceToNow(comment._creationTime, {
								addSuffix: true,
							})}
						</span>
						{comment.updatedAt && (
							<span className="text-[10px] text-muted-foreground shrink-0">
								(edited)
							</span>
						)}
						{/* Actions dropdown */}
						{!isEditing && (
							<div className="ml-auto opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-0.5">
								{!isReply && (
									<button
										type="button"
										onClick={() => onStartReply(comment._id)}
										className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
										title="Reply"
									>
										<Reply className="h-3.5 w-3.5" />
									</button>
								)}
								<DropdownMenu>
									<DropdownMenuTrigger asChild>
										<button
											type="button"
											className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
										>
											<Ellipsis className="h-3.5 w-3.5" />
										</button>
									</DropdownMenuTrigger>
									<DropdownMenuContent align="end" className="w-48">
										{isOwn && (
											<DropdownMenuItem onClick={() => onStartEdit(comment)}>
												<Pencil className="h-4 w-4 mr-2" />
												Edit
											</DropdownMenuItem>
										)}
										{isOwn && (
											<DropdownMenuItem
												onClick={() => onDelete(comment._id)}
												className="text-destructive focus:text-destructive"
											>
												<Trash2 className="h-4 w-4 mr-2" />
												Delete
											</DropdownMenuItem>
										)}
										<DropdownMenuItem onClick={() => onCreateSubIssue(comment)}>
											<ArrowUpRight className="h-4 w-4 mr-2" />
											Create sub-issue
										</DropdownMenuItem>
									</DropdownMenuContent>
								</DropdownMenu>
							</div>
						)}
					</div>

					{isEditing ? (
						<div className="mt-1">
							<CommentEditor
								initialContent={comment.body}
								onSubmit={(json) => onSaveEdit(comment._id, json)}
								onCancel={onCancelEdit}
								submitting={submitting}
								autoFocus
								placeholder="Edit comment..."
								mentionSuggestion={mentionSuggestion}
							/>
						</div>
					) : (
						<CommentContent
							body={comment.body}
							workspaceSlug={workspaceSlug}
							className="mt-0.5"
							attachments={comment.attachments}
						/>
					)}
				</div>
			</div>
		</div>
	);
}

// ── Comment thread ──────────────────────────────────────────────────────────

function CommentThread({
	comment,
	replies,
	currentUserId,
	editingId,
	onStartEdit,
	onSaveEdit,
	onCancelEdit,
	replyingTo,
	onStartReply,
	onSubmitReply,
	onCancelReply,
	onDelete,
	onCreateSubIssue,
	submitting,
	mentionSuggestion,
	workspaceSlug,
}: {
	comment: Comment;
	replies: Comment[];
	currentUserId: Id<"users"> | undefined;
	editingId: Id<"comments"> | null;
	onStartEdit: (comment: Comment) => void;
	onSaveEdit: (commentId: Id<"comments">, body: string) => void;
	onCancelEdit: () => void;
	replyingTo: Id<"comments"> | null;
	onStartReply: (commentId: Id<"comments">) => void;
	onSubmitReply: (parentId: Id<"comments">, body: string) => void;
	onCancelReply: () => void;
	onDelete: (commentId: Id<"comments">) => void;
	onCreateSubIssue: (comment: Comment) => void;
	submitting: boolean;
	mentionSuggestion?: ReturnType<typeof useMentionSuggestion>;
	workspaceSlug?: string;
}) {
	const [collapsed, setCollapsed] = useState(false);

	return (
		<div>
			<CommentItem
				comment={comment}
				currentUserId={currentUserId}
				isEditing={editingId === comment._id}
				onStartEdit={onStartEdit}
				onSaveEdit={onSaveEdit}
				onCancelEdit={onCancelEdit}
				onStartReply={onStartReply}
				onDelete={onDelete}
				onCreateSubIssue={onCreateSubIssue}
				submitting={submitting}
				mentionSuggestion={mentionSuggestion}
				workspaceSlug={workspaceSlug}
			/>

			{/* Replies */}
			{replies.length > 0 && (
				<div className="ml-6 border-l border-border pl-2">
					<button
						type="button"
						onClick={() => setCollapsed(!collapsed)}
						className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors py-0.5 px-1"
					>
						{collapsed ? (
							<ChevronRight className="h-3 w-3" />
						) : (
							<ChevronDown className="h-3 w-3" />
						)}
						{replies.length} {replies.length === 1 ? "reply" : "replies"}
					</button>
					{!collapsed &&
						replies.map((reply) => (
							<CommentItem
								key={reply._id}
								comment={reply}
								currentUserId={currentUserId}
								isEditing={editingId === reply._id}
								onStartEdit={onStartEdit}
								onSaveEdit={onSaveEdit}
								onCancelEdit={onCancelEdit}
								onStartReply={() => onStartReply(comment._id)}
								onDelete={onDelete}
								onCreateSubIssue={onCreateSubIssue}
								submitting={submitting}
								isReply
								mentionSuggestion={mentionSuggestion}
								workspaceSlug={workspaceSlug}
							/>
						))}
				</div>
			)}

			{/* Reply input */}
			{replyingTo === comment._id && (
				<div className="ml-6 mt-1 pl-2">
					<CommentEditor
						onSubmit={(json) => onSubmitReply(comment._id, json)}
						onCancel={onCancelReply}
						submitting={submitting}
						autoFocus
						placeholder="Write a reply..."
						mentionSuggestion={mentionSuggestion}
					/>
				</div>
			)}
		</div>
	);
}

// ── Comment input ───────────────────────────────────────────────────────────

type PendingFile = {
	id: string;
	name: string;
	uploading: boolean;
	fileId?: Id<"files">;
};

function CommentInput({
	issueId,
	mentionSuggestion,
	currentUser,
}: {
	issueId: Id<"issues">;
	mentionSuggestion?: ReturnType<typeof useMentionSuggestion>;
	currentUser?: { name?: string; image?: string; avatarUrl?: string } | null;
}) {
	const { workspaceId } = useWorkspace();
	const [submitting, setSubmitting] = useState(false);
	const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([]);
	const createComment = useMutation(api.comments.create);
	const generateUploadUrl = useMutation(api.files.generateUploadUrl);
	const createFile = useMutation(api.files.create);

	const handleAttach = useCallback(
		async (file: File) => {
			const tempId = crypto.randomUUID();
			setPendingFiles((prev) => [
				...prev,
				{ id: tempId, name: file.name, uploading: true },
			]);

			try {
				const uploadUrl = await generateUploadUrl();
				const result = await fetch(uploadUrl, {
					method: "POST",
					headers: { "Content-Type": file.type || "application/octet-stream" },
					body: file,
				});
				const { storageId } = await result.json();

				const fileId = await createFile({
					workspaceId,
					name: file.name,
					storageId,
					mimeType: file.type || undefined,
					size: file.size,
				});

				setPendingFiles((prev) =>
					prev.map((f) =>
						f.id === tempId ? { ...f, uploading: false, fileId } : f,
					),
				);
			} catch {
				toast.error("Failed to upload file");
				setPendingFiles((prev) => prev.filter((f) => f.id !== tempId));
			}
		},
		[generateUploadUrl, createFile, workspaceId],
	);

	const handleRemoveAttachment = useCallback((id: string) => {
		setPendingFiles((prev) => prev.filter((f) => f.id !== id));
	}, []);

	const handleSubmit = useCallback(
		async (body: string) => {
			if (submitting) return;
			// Wait for all uploads to finish
			if (pendingFiles.some((f) => f.uploading)) return;

			setSubmitting(true);
			try {
				const attachmentIds = pendingFiles
					.map((f) => f.fileId)
					.filter((id): id is Id<"files"> => id !== undefined);

				await createComment({
					issueId,
					body,
					attachmentIds: attachmentIds.length > 0 ? attachmentIds : undefined,
				});
				setPendingFiles([]);
			} catch {
				toast.error("Failed to post comment");
			} finally {
				setSubmitting(false);
			}
		},
		[submitting, createComment, issueId, pendingFiles],
	);

	const pendingAttachments = pendingFiles.map((f) => ({
		id: f.id,
		name: f.name,
		uploading: f.uploading,
	}));

	const avatarSrc = currentUser?.avatarUrl ?? currentUser?.image;
	const initials = currentUser?.name?.charAt(0).toUpperCase() ?? "?";

	return (
		<div className="flex items-start gap-2.5 pt-3 border-t border-border/40">
			<Avatar className="size-6 shrink-0 mt-1">
				{avatarSrc && (
					<AvatarImage src={avatarSrc} alt={currentUser?.name ?? "You"} />
				)}
				<AvatarFallback className="text-[10px]">{initials}</AvatarFallback>
			</Avatar>
			<div className="flex-1 min-w-0 space-y-1.5">
				<CommentEditor
					onSubmit={handleSubmit}
					onAttach={handleAttach}
					onRemoveAttachment={handleRemoveAttachment}
					pendingAttachments={pendingAttachments}
					submitting={submitting}
					placeholder="Leave a comment..."
					mentionSuggestion={mentionSuggestion}
				/>
				<p className="text-[10px] text-muted-foreground/50">
					Cmd+Enter to submit
				</p>
			</div>
		</div>
	);
}

// ── Main component ──────────────────────────────────────────────────────────

export function IssueActivitySection({ issueId }: { issueId: Id<"issues"> }) {
	const { workspaceId, workspaceSlug } = useWorkspace();
	const mentionSuggestion = useMentionSuggestion(workspaceId);
	const [viewMode, setViewMode] = useState<ViewMode>("all");
	const [editingId, setEditingId] = useState<Id<"comments"> | null>(null);
	const [replyingTo, setReplyingTo] = useState<Id<"comments"> | null>(null);
	const [deleteConfirmId, setDeleteConfirmId] = useState<Id<"comments"> | null>(
		null,
	);
	const [submitting, setSubmitting] = useState(false);

	// ── Data fetching ────────────────────────────────────────────────────
	const comments = useQuery(api.comments.listByIssue, { issueId });
	const activityLogs = useQuery(api.activityLogs.listByIssue, { issueId });
	const currentUser = useQuery(api.users.current);
	const subscriptionStatus = useQuery(api.issues.getSubscriptionStatus, {
		issueId,
	});
	const isSubscribed = subscriptionStatus?.isSubscribed ?? false;

	// ── Mutations ────────────────────────────────────────────────────────
	const updateComment = useMutation(api.comments.update);
	const removeComment = useMutation(api.comments.remove);
	const createSubIssue = useMutation(api.issues.createSubIssue);
	const unsubscribeMutation = useMutation(api.issues.unsubscribe);

	// ── Computed values ──────────────────────────────────────────────────
	const currentUserId = currentUser?._id;

	// Organize comments into threads
	const { topLevel, repliesByParent } = useMemo(() => {
		if (!comments) return { topLevel: [], repliesByParent: new Map() };
		const top: Comment[] = [];
		const replies = new Map<string, Comment[]>();
		for (const c of comments) {
			if (c.parentId) {
				const existing = replies.get(c.parentId) ?? [];
				existing.push(c);
				replies.set(c.parentId, existing);
			} else {
				top.push(c);
			}
		}
		return { topLevel: top, repliesByParent: replies };
	}, [comments]);

	// Build chronological feed
	const feedItems: FeedItem[] = useMemo(() => {
		const items: FeedItem[] = [];

		// Add top-level comments (not replies)
		for (const c of topLevel) {
			items.push({ type: "comment", data: c });
		}

		// Add activity entries (when in "all" mode)
		if (viewMode === "all" && activityLogs) {
			for (const entry of activityLogs) {
				// Skip comment-created activity entries since we show comments directly
				if (entry.entityType === "comment" && entry.action === "created") {
					continue;
				}
				items.push({ type: "activity", data: entry });
			}
		}

		// Sort by creation time
		items.sort((a, b) => {
			const timeA =
				a.type === "comment" ? a.data._creationTime : a.data._creationTime;
			const timeB =
				b.type === "comment" ? b.data._creationTime : b.data._creationTime;
			return timeA - timeB;
		});

		return items;
	}, [topLevel, activityLogs, viewMode]);

	// ── Handlers ─────────────────────────────────────────────────────────
	const handleStartEdit = useCallback((comment: Comment) => {
		setEditingId(comment._id);
		setReplyingTo(null);
	}, []);

	const handleSaveEdit = useCallback(
		async (commentId: Id<"comments">, body: string) => {
			if (submitting) return;
			setSubmitting(true);
			try {
				await updateComment({ commentId, body });
				setEditingId(null);
			} catch {
				toast.error("Failed to update comment");
			} finally {
				setSubmitting(false);
			}
		},
		[submitting, updateComment],
	);

	const handleCancelEdit = useCallback(() => {
		setEditingId(null);
	}, []);

	const handleStartReply = useCallback((commentId: Id<"comments">) => {
		setReplyingTo(commentId);
		setEditingId(null);
	}, []);

	const handleDelete = useCallback(
		async (commentId: Id<"comments">) => {
			try {
				await removeComment({ commentId });
				setDeleteConfirmId(null);
			} catch {
				toast.error("Failed to delete comment");
			}
		},
		[removeComment],
	);

	const handleCreateSubIssue = useCallback(
		async (comment: Comment) => {
			try {
				const title =
					extractCommentText(comment.body, 100) || "Sub-issue from comment";
				const cleanTitle = title.replace(/@\[([^\]]+)\]\([^)]+\)/g, "@$1");
				await createSubIssue({
					parentId: issueId,
					title: cleanTitle,
					description: comment.body,
				});
				toast.success("Sub-issue created from comment");
			} catch {
				toast.error("Failed to create sub-issue");
			}
		},
		[createSubIssue, issueId],
	);

	// ── Reply mutation (needs to be at component level) ──────────────────
	const createCommentMutation = useMutation(api.comments.create);

	const handleSubmitReplyActual = useCallback(
		async (parentId: Id<"comments">, body: string) => {
			if (submitting) return;
			setSubmitting(true);
			try {
				await createCommentMutation({
					issueId,
					parentId,
					body,
				});
				setReplyingTo(null);
			} catch {
				toast.error("Failed to post reply");
			} finally {
				setSubmitting(false);
			}
		},
		[submitting, createCommentMutation, issueId],
	);

	// ── Loading state ────────────────────────────────────────────────────
	if (comments === undefined || activityLogs === undefined) {
		return (
			<div className="space-y-2.5 pb-8">
				<h3 className="text-[13px] font-medium text-foreground/80">Activity</h3>
				<div className="text-[13px] text-muted-foreground/50 animate-pulse py-4 text-center">
					Loading activity...
				</div>
			</div>
		);
	}

	return (
		<div className="space-y-4 pb-8">
			{/* Header with toggle */}
			<div className="flex items-center justify-between">
				<h3 className="text-[13px] font-medium text-foreground/80 flex items-center gap-2">
					<MessageSquare className="h-3.5 w-3.5 text-muted-foreground" />
					Activity
					{comments.length > 0 && (
						<span className="text-xs text-muted-foreground/70">
							({comments.length})
						</span>
					)}
				</h3>
				<div className="flex items-center rounded-md border border-border/60 text-[11px]">
					<button
						type="button"
						onClick={() => setViewMode("all")}
						className={cn(
							"px-2.5 py-1 rounded-l-md transition-colors",
							viewMode === "all"
								? "bg-muted text-foreground"
								: "text-muted-foreground hover:text-foreground",
						)}
					>
						All
					</button>
					<button
						type="button"
						onClick={() => setViewMode("comments")}
						className={cn(
							"px-2.5 py-1 rounded-r-md transition-colors",
							viewMode === "comments"
								? "bg-muted text-foreground"
								: "text-muted-foreground hover:text-foreground",
						)}
					>
						Comments
					</button>
				</div>
			</div>

			{/* Feed */}
			{feedItems.length === 0 ? (
				<p className="text-[13px] text-muted-foreground/50 py-6 text-center">
					No activity yet. Start the discussion below.
				</p>
			) : (
				<div className="divide-y divide-border/30">
					{feedItems.map((item) => {
						if (item.type === "activity") {
							return <ActivityItem key={item.data._id} entry={item.data} />;
						}
						return (
							<CommentThread
								key={item.data._id}
								comment={item.data}
								replies={repliesByParent.get(item.data._id) ?? []}
								currentUserId={currentUserId}
								editingId={editingId}
								onStartEdit={handleStartEdit}
								onSaveEdit={handleSaveEdit}
								onCancelEdit={handleCancelEdit}
								replyingTo={replyingTo}
								onStartReply={handleStartReply}
								onSubmitReply={handleSubmitReplyActual}
								onCancelReply={() => setReplyingTo(null)}
								onDelete={setDeleteConfirmId}
								onCreateSubIssue={handleCreateSubIssue}
								submitting={submitting}
								mentionSuggestion={mentionSuggestion}
								workspaceSlug={workspaceSlug}
							/>
						);
					})}
				</div>
			)}

			{/* Comment input */}
			<CommentInput
				issueId={issueId}
				mentionSuggestion={mentionSuggestion}
				currentUser={currentUser}
			/>

			{/* Unsubscribe link */}
			{isSubscribed && (
				<button
					type="button"
					className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors mt-2"
					onClick={async () => {
						try {
							await unsubscribeMutation({ issueId });
							toast.success("Unsubscribed from issue");
						} catch {
							toast.error("Failed to unsubscribe");
						}
					}}
				>
					<BellOff className="h-3 w-3" />
					Unsubscribe from this issue
				</button>
			)}

			{/* Delete confirmation dialog */}
			<AlertDialog
				open={deleteConfirmId !== null}
				onOpenChange={(open) => !open && setDeleteConfirmId(null)}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Delete comment</AlertDialogTitle>
						<AlertDialogDescription>
							Are you sure you want to delete this comment? This action cannot
							be undone.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>Cancel</AlertDialogCancel>
						<AlertDialogAction
							onClick={() => deleteConfirmId && handleDelete(deleteConfirmId)}
						>
							Delete
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</div>
	);
}
