"use client";

import {
	ArrowBendUpLeft,
	PaperPlaneTilt,
	PencilSimple,
	Trash,
} from "@phosphor-icons/react/dist/ssr";
import { useMutation, useQuery } from "convex/react";
import { formatDistanceToNow } from "date-fns";
import { useCallback, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
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
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

type TaskCommentSectionProps = {
	taskId: Id<"tasks">;
	currentUserId: Id<"users"> | undefined;
};

type Comment = {
	_id: Id<"comments">;
	_creationTime: number;
	taskId?: Id<"tasks">;
	storyId?: Id<"stories">;
	parentId?: Id<"comments">;
	body: string;
	authorId: Id<"users">;
	updatedAt?: number;
	deletedAt?: number;
	author: { name: string; image?: string };
};

export function TaskCommentSection({
	taskId,
	currentUserId,
}: TaskCommentSectionProps) {
	const comments = useQuery(api.comments.listByTask, { taskId });
	const createComment = useMutation(api.comments.create);
	const updateComment = useMutation(api.comments.update);
	const removeComment = useMutation(api.comments.remove);

	const [newComment, setNewComment] = useState("");
	const [replyingTo, setReplyingTo] = useState<Id<"comments"> | null>(null);
	const [replyText, setReplyText] = useState("");
	const [editingId, setEditingId] = useState<Id<"comments"> | null>(null);
	const [editText, setEditText] = useState("");
	const [deleteConfirmId, setDeleteConfirmId] = useState<Id<"comments"> | null>(
		null,
	);
	const [submitting, setSubmitting] = useState(false);
	const textareaRef = useRef<HTMLTextAreaElement>(null);
	const replyRef = useRef<HTMLTextAreaElement>(null);

	// Organize comments into threads: top-level + replies grouped by parentId
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

	const handleSubmitComment = useCallback(async () => {
		if (!newComment.trim() || submitting) return;
		setSubmitting(true);
		try {
			await createComment({ taskId, body: newComment.trim() });
			setNewComment("");
		} catch {
			toast.error("Failed to post comment");
		} finally {
			setSubmitting(false);
		}
	}, [newComment, submitting, createComment, taskId]);

	const handleSubmitReply = useCallback(
		async (parentId: Id<"comments">) => {
			if (!replyText.trim() || submitting) return;
			setSubmitting(true);
			try {
				await createComment({
					taskId,
					parentId,
					body: replyText.trim(),
				});
				setReplyText("");
				setReplyingTo(null);
			} catch {
				toast.error("Failed to post reply");
			} finally {
				setSubmitting(false);
			}
		},
		[replyText, submitting, createComment, taskId],
	);

	const handleSaveEdit = useCallback(
		async (commentId: Id<"comments">) => {
			if (!editText.trim() || submitting) return;
			setSubmitting(true);
			try {
				await updateComment({ commentId, body: editText.trim() });
				setEditingId(null);
				setEditText("");
			} catch {
				toast.error("Failed to update comment");
			} finally {
				setSubmitting(false);
			}
		},
		[editText, submitting, updateComment],
	);

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

	const startEdit = useCallback((comment: Comment) => {
		setEditingId(comment._id);
		setEditText(comment.body);
		setReplyingTo(null);
	}, []);

	const startReply = useCallback((commentId: Id<"comments">) => {
		setReplyingTo(commentId);
		setReplyText("");
		setEditingId(null);
		setTimeout(() => replyRef.current?.focus(), 50);
	}, []);

	if (comments === undefined) {
		return (
			<div className="space-y-2">
				<h3 className="text-sm font-medium text-muted-foreground">Comments</h3>
				<div className="text-sm text-muted-foreground animate-pulse">
					Loading comments...
				</div>
			</div>
		);
	}

	return (
		<div className="space-y-3">
			<h3 className="text-sm font-medium text-muted-foreground">
				Comments{" "}
				{topLevel.length > 0 && (
					<span className="text-xs">({comments.length})</span>
				)}
			</h3>

			{/* Comment list */}
			{topLevel.length === 0 ? (
				<p className="text-sm text-muted-foreground py-4 text-center">
					No comments yet. Start a conversation.
				</p>
			) : (
				<div className="space-y-0">
					{topLevel.map((comment) => (
						<div key={comment._id}>
							<CommentItem
								comment={comment}
								currentUserId={currentUserId}
								isEditing={editingId === comment._id}
								editText={editText}
								onEditTextChange={setEditText}
								onStartEdit={startEdit}
								onSaveEdit={handleSaveEdit}
								onCancelEdit={() => {
									setEditingId(null);
									setEditText("");
								}}
								onStartReply={startReply}
								onDelete={setDeleteConfirmId}
								submitting={submitting}
							/>

							{/* Replies */}
							{repliesByParent.get(comment._id)?.map((reply: Comment) => (
								<div key={reply._id} className="ml-8">
									<CommentItem
										comment={reply}
										currentUserId={currentUserId}
										isEditing={editingId === reply._id}
										editText={editText}
										onEditTextChange={setEditText}
										onStartEdit={startEdit}
										onSaveEdit={handleSaveEdit}
										onCancelEdit={() => {
											setEditingId(null);
											setEditText("");
										}}
										onStartReply={() => startReply(comment._id)}
										onDelete={setDeleteConfirmId}
										submitting={submitting}
										isReply
									/>
								</div>
							))}

							{/* Reply input */}
							{replyingTo === comment._id && (
								<div className="ml-8 mt-2 flex gap-2">
									<Textarea
										ref={replyRef}
										value={replyText}
										onChange={(e) => setReplyText(e.target.value)}
										placeholder="Write a reply..."
										className="min-h-[60px] text-sm resize-none"
										onKeyDown={(e) => {
											if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
												e.preventDefault();
												handleSubmitReply(comment._id);
											}
											if (e.key === "Escape") {
												setReplyingTo(null);
												setReplyText("");
											}
										}}
									/>
									<div className="flex flex-col gap-1">
										<Button
											size="sm"
											variant="ghost"
											onClick={() => handleSubmitReply(comment._id)}
											disabled={!replyText.trim() || submitting}
											className="h-8 w-8 p-0"
										>
											<PaperPlaneTilt className="h-4 w-4" />
										</Button>
										<Button
											size="sm"
											variant="ghost"
											onClick={() => {
												setReplyingTo(null);
												setReplyText("");
											}}
											className="h-8 w-8 p-0 text-muted-foreground"
										>
											&times;
										</Button>
									</div>
								</div>
							)}

							<Separator className="my-2" />
						</div>
					))}
				</div>
			)}

			{/* New comment input */}
			<div className="flex gap-2">
				<Textarea
					ref={textareaRef}
					value={newComment}
					onChange={(e) => setNewComment(e.target.value)}
					placeholder="Write a comment..."
					className="min-h-[60px] text-sm resize-none"
					onKeyDown={(e) => {
						if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
							e.preventDefault();
							handleSubmitComment();
						}
					}}
				/>
				<Button
					size="sm"
					variant="ghost"
					onClick={handleSubmitComment}
					disabled={!newComment.trim() || submitting}
					className="h-8 w-8 p-0 mt-1"
				>
					<PaperPlaneTilt className="h-4 w-4" />
				</Button>
			</div>
			<p className="text-[10px] text-muted-foreground">
				Press Cmd+Enter to submit
			</p>

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

// ── Comment Item ───────────────────────────────────────────────────────────

type CommentItemProps = {
	comment: Comment;
	currentUserId: Id<"users"> | undefined;
	isEditing: boolean;
	editText: string;
	onEditTextChange: (text: string) => void;
	onStartEdit: (comment: Comment) => void;
	onSaveEdit: (commentId: Id<"comments">) => void;
	onCancelEdit: () => void;
	onStartReply: (commentId: Id<"comments">) => void;
	onDelete: (commentId: Id<"comments">) => void;
	submitting: boolean;
	isReply?: boolean;
};

function CommentItem({
	comment,
	currentUserId,
	isEditing,
	editText,
	onEditTextChange,
	onStartEdit,
	onSaveEdit,
	onCancelEdit,
	onStartReply,
	onDelete,
	submitting,
	isReply,
}: CommentItemProps) {
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
					</div>

					{isEditing ? (
						<div className="mt-1 space-y-1">
							<Textarea
								value={editText}
								onChange={(e) => onEditTextChange(e.target.value)}
								className="min-h-[60px] text-sm resize-none"
								onKeyDown={(e) => {
									if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
										e.preventDefault();
										onSaveEdit(comment._id);
									}
									if (e.key === "Escape") onCancelEdit();
								}}
								autoFocus
							/>
							<div className="flex gap-1">
								<Button
									size="sm"
									variant="default"
									onClick={() => onSaveEdit(comment._id)}
									disabled={!editText.trim() || submitting}
									className="h-6 text-xs px-2"
								>
									Save
								</Button>
								<Button
									size="sm"
									variant="ghost"
									onClick={onCancelEdit}
									className="h-6 text-xs px-2"
								>
									Cancel
								</Button>
							</div>
						</div>
					) : (
						<p className="text-sm text-foreground/80 whitespace-pre-wrap break-words mt-0.5">
							{comment.body}
						</p>
					)}

					{/* Actions */}
					{!isEditing && (
						<div className="flex items-center gap-1 mt-1 opacity-0 group-hover:opacity-100 transition-opacity">
							{!isReply && (
								<button
									type="button"
									onClick={() => onStartReply(comment._id)}
									className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors px-1 py-0.5 rounded"
								>
									<ArrowBendUpLeft className="h-3 w-3" />
									Reply
								</button>
							)}
							{isOwn && (
								<>
									<button
										type="button"
										onClick={() => onStartEdit(comment)}
										className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors px-1 py-0.5 rounded"
									>
										<PencilSimple className="h-3 w-3" />
										Edit
									</button>
									<button
										type="button"
										onClick={() => onDelete(comment._id)}
										className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-destructive transition-colors px-1 py-0.5 rounded"
									>
										<Trash className="h-3 w-3" />
										Delete
									</button>
								</>
							)}
						</div>
					)}
				</div>
			</div>
		</div>
	);
}
