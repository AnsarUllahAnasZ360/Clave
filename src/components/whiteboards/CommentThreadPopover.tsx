"use client";

import type { SuggestionOptions } from "@tiptap/suggestion";
import { Check, Undo2, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { CommentBubble } from "@/components/comments/CommentBubble";
import { CommentEditor } from "@/components/comments/CommentEditor";
import type { MentionItem } from "@/components/comments/MentionList";
import { Button } from "@/components/ui/button";
import type { WhiteboardThread } from "./CommentPinsOverlay";

type CommentThreadPopoverProps = {
	thread: WhiteboardThread;
	currentUserId: string;
	workspaceSlug?: string;
	position: { x: number; y: number };
	mentionSuggestion?: Omit<SuggestionOptions<MentionItem>, "editor">;
	onReply: (parentId: string, body: string) => Promise<void>;
	onResolve: (commentId: string) => Promise<void>;
	onUnresolve: (commentId: string) => Promise<void>;
	onEdit: (commentId: string, body: string) => Promise<void>;
	onDelete: (commentId: string) => Promise<void>;
	onClose: () => void;
};

export function CommentThreadPopover({
	thread,
	currentUserId,
	workspaceSlug,
	position,
	mentionSuggestion,
	onReply,
	onResolve,
	onUnresolve,
	onEdit,
	onDelete,
	onClose,
}: CommentThreadPopoverProps) {
	const [replying, setReplying] = useState(false);
	const [editingId, setEditingId] = useState<string | null>(null);

	// Reset editing and replying state when thread changes
	useEffect(() => {
		setEditingId(null);
		setReplying(false);
	}, [thread._id]);

	const handleReply = useCallback(
		async (body: string) => {
			try {
				await onReply(thread._id, body);
				setReplying(false);
			} catch {
				toast.error("Failed to add reply");
			}
		},
		[thread._id, onReply],
	);

	const handleEdit = useCallback(
		async (commentId: string, body: string) => {
			try {
				await onEdit(commentId, body);
				setEditingId(null);
			} catch {
				toast.error("Failed to update comment");
			}
		},
		[onEdit],
	);

	const handleDelete = useCallback(
		async (commentId: string) => {
			try {
				await onDelete(commentId);
			} catch {
				toast.error("Failed to delete comment");
			}
		},
		[onDelete],
	);

	const handleResolve = useCallback(async () => {
		try {
			if (thread.resolved) {
				await onUnresolve(thread._id);
			} else {
				await onResolve(thread._id);
			}
		} catch {
			toast.error("Failed to update thread");
		}
	}, [thread._id, thread.resolved, onResolve, onUnresolve]);

	// Position the popover to the right of the pin
	const style: React.CSSProperties = {
		position: "absolute",
		left: `${position.x + 16}px`,
		top: `${position.y - 8}px`,
		zIndex: 30,
	};

	return (
		<div
			style={style}
			className="w-[340px] rounded-lg border border-border bg-popover shadow-lg pointer-events-auto"
			onClick={(e) => e.stopPropagation()}
		>
			{/* Header */}
			<div className="flex items-center justify-between px-3 py-2 border-b border-border/60">
				<span className="text-xs font-medium text-muted-foreground">
					Thread
				</span>
				<div className="flex items-center gap-1">
					<Button
						variant="ghost"
						size="icon-sm"
						className="h-6 w-6"
						onClick={handleResolve}
						title={thread.resolved ? "Reopen" : "Resolve"}
					>
						{thread.resolved ? (
							<Undo2 className="h-3.5 w-3.5" />
						) : (
							<Check className="h-3.5 w-3.5" />
						)}
					</Button>
					<Button
						variant="ghost"
						size="icon-sm"
						className="h-6 w-6"
						onClick={onClose}
					>
						<X className="h-3.5 w-3.5" />
					</Button>
				</div>
			</div>

			{/* Comments */}
			<div className="max-h-[320px] overflow-y-auto">
				{/* Root comment */}
				<CommentBubble
					author={thread.author}
					body={thread.body}
					timestamp={thread._creationTime}
					isOwn={thread.authorId === currentUserId}
					isEditing={editingId === thread._id}
					workspaceSlug={workspaceSlug}
					mentionSuggestion={mentionSuggestion}
					onStartEdit={() => setEditingId(thread._id)}
					onCancelEdit={() => setEditingId(null)}
					onSaveEdit={(body) => handleEdit(thread._id, body)}
					onDelete={() => handleDelete(thread._id)}
				/>

				{/* Replies */}
				{thread.replies.map((reply) => (
					<CommentBubble
						key={reply._id}
						author={reply.author}
						body={reply.body}
						timestamp={reply._creationTime}
						isOwn={reply.authorId === currentUserId}
						isEditing={editingId === reply._id}
						workspaceSlug={workspaceSlug}
						mentionSuggestion={mentionSuggestion}
						onStartEdit={() => setEditingId(reply._id)}
						onCancelEdit={() => setEditingId(null)}
						onSaveEdit={(body) => handleEdit(reply._id, body)}
						onDelete={() => handleDelete(reply._id)}
					/>
				))}
			</div>

			{/* Reply composer */}
			<div className="border-t border-border/60 p-2">
				{replying ? (
					<CommentEditor
						placeholder="Reply..."
						onSubmit={handleReply}
						onCancel={() => setReplying(false)}
						autoFocus
						mentionSuggestion={mentionSuggestion}
					/>
				) : (
					<button
						type="button"
						className="w-full text-left text-sm text-muted-foreground px-3 py-2 rounded-md hover:bg-muted/50 transition-colors"
						onClick={() => setReplying(true)}
					>
						Reply...
					</button>
				)}
			</div>
		</div>
	);
}
