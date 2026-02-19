"use client";

import type { SuggestionOptions } from "@tiptap/suggestion";
import { Check, ChevronLeft, Undo2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { CommentBubble } from "./CommentBubble";
import { CommentEditor } from "./CommentEditor";
import type { MentionItem } from "./MentionList";

export type CommentThread = {
	_id: string;
	resolved?: boolean;
	body: string;
	authorId: string;
	author: { name: string; image?: string };
	rootCommentId?: string;
	replies: Array<{
		_id: string;
		body: string;
		authorId: string;
		author: { name: string; image?: string };
		_creationTime: number;
	}>;
	_creationTime: number;
};

type CommentThreadDetailProps = {
	thread: CommentThread;
	currentUserId: string;
	workspaceSlug?: string;
	mentionSuggestion?: Omit<SuggestionOptions<MentionItem>, "editor">;
	onBack: () => void;
	onReply: (threadId: string, body: string) => Promise<void>;
	onResolve: (threadId: string) => Promise<void>;
	onUnresolve: (threadId: string) => Promise<void>;
	onEdit: (commentId: string, body: string) => Promise<void>;
	onDelete: (commentId: string) => Promise<void>;
};

export function CommentThreadDetail({
	thread,
	currentUserId,
	workspaceSlug,
	mentionSuggestion,
	onBack,
	onReply,
	onResolve,
	onUnresolve,
	onEdit,
	onDelete,
}: CommentThreadDetailProps) {
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

	// Use rootCommentId for document threads, thread._id for whiteboard threads
	const rootId = thread.rootCommentId ?? thread._id;

	return (
		<div className="flex flex-1 flex-col min-h-0">
			{/* Thread header */}
			<div className="flex items-center justify-between px-3 py-2 border-b border-border/60">
				<button
					type="button"
					onClick={() => {
						setEditingId(null);
						setReplying(false);
						onBack();
					}}
					className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
				>
					<ChevronLeft className="h-3.5 w-3.5" />
					Back to all
				</button>
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
				</div>
			</div>

			{/* Thread messages */}
			<div className="flex-1 overflow-y-auto">
				{/* Root comment */}
				<CommentBubble
					author={thread.author}
					body={thread.body}
					timestamp={thread._creationTime}
					isOwn={thread.authorId === currentUserId}
					isEditing={editingId === rootId}
					workspaceSlug={workspaceSlug}
					mentionSuggestion={mentionSuggestion}
					onStartEdit={() => setEditingId(rootId)}
					onCancelEdit={() => setEditingId(null)}
					onSaveEdit={(body) => handleEdit(rootId, body)}
					onDelete={() => handleDelete(rootId)}
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
			<div className="border-t border-border/60 p-2 shrink-0">
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
