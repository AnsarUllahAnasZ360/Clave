"use client";

import type { SuggestionOptions } from "@tiptap/suggestion";
import { Check, MapPin, MessageCircle, X } from "lucide-react";
import { forwardRef, useEffect, useRef } from "react";
import { toast } from "sonner";
import { extractCommentText } from "@/components/comments/CommentContent";
import { CommentEditor } from "@/components/comments/CommentEditor";
import { CommentEmptyState } from "@/components/comments/CommentEmptyState";
import { CommentThreadDetail } from "@/components/comments/CommentThreadDetail";
import type { MentionItem } from "@/components/comments/MentionList";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { useRegisterRightPanel } from "@/hooks/use-right-panel";
import { formatCommentTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { WhiteboardThread } from "./CommentPinsOverlay";

type WhiteboardCommentsSidebarProps = {
	threads: WhiteboardThread[];
	activeThreadId: string | null;
	pendingPin: { canvasX: number; canvasY: number } | null;
	currentUserId?: string;
	workspaceSlug?: string;
	mentionSuggestion?: Omit<SuggestionOptions<MentionItem>, "editor">;
	placingPin: boolean;
	onThreadSelect: (threadId: string | null) => void;
	onStartPlacePin: () => void;
	onCancelPlacePin: () => void;
	onCreateThread: (body: string) => Promise<void>;
	onReply: (parentId: string, body: string) => Promise<void>;
	onResolve: (commentId: string) => Promise<void>;
	onUnresolve: (commentId: string) => Promise<void>;
	onEdit: (commentId: string, body: string) => Promise<void>;
	onDelete: (commentId: string) => Promise<void>;
	/** AI context for "Reply with AI" on comments. */
	aiContext?: {
		workspaceId: string;
		whiteboardId?: string;
	};
};

export function WhiteboardCommentsSidebar({
	threads,
	activeThreadId,
	pendingPin,
	currentUserId,
	workspaceSlug,
	mentionSuggestion,
	placingPin,
	onThreadSelect,
	onStartPlacePin,
	onCancelPlacePin,
	onCreateThread,
	onReply,
	onResolve,
	onUnresolve,
	onEdit,
	onDelete,
	aiContext,
}: WhiteboardCommentsSidebarProps) {
	useRegisterRightPanel();
	const activeThread = activeThreadId
		? (threads.find((t) => t._id === activeThreadId) ?? null)
		: null;

	const threadRefs = useRef<Map<string, HTMLDivElement>>(new Map());

	// Scroll to active thread when it changes
	useEffect(() => {
		if (activeThreadId) {
			const el = threadRefs.current.get(activeThreadId);
			if (el) {
				el.scrollIntoView({ behavior: "smooth", block: "nearest" });
			}
		}
	}, [activeThreadId]);

	return (
		<div className="flex h-full w-[320px] shrink-0 flex-col border-l border-border bg-background">
			{/* Header */}
			<div className="flex items-center justify-between px-3 py-2.5 border-b border-border">
				<div className="flex items-center gap-1.5">
					<MessageCircle className="h-4 w-4 text-muted-foreground" />
					<span className="text-sm font-medium text-foreground">Comments</span>
					{threads.length > 0 && (
						<span className="text-xs text-muted-foreground">
							({threads.length})
						</span>
					)}
				</div>
				{placingPin ? (
					<Button
						variant="ghost"
						size="sm"
						onClick={onCancelPlacePin}
						className="h-7 gap-1 text-xs"
					>
						<X className="h-3.5 w-3.5" />
						Cancel
					</Button>
				) : (
					<Button
						variant="ghost"
						size="sm"
						onClick={onStartPlacePin}
						className="h-7 gap-1 text-xs"
					>
						<MapPin className="h-3.5 w-3.5" />
						Add comment
					</Button>
				)}
			</div>

			{/* Placing pin prompt */}
			{placingPin && !pendingPin && (
				<div className="px-3 py-3 border-b border-border bg-sienna-9/10">
					<p className="text-xs text-sienna-9 font-medium">
						Click on the canvas to place a comment pin
					</p>
				</div>
			)}

			{/* New comment editor (when pin is placed) */}
			{pendingPin && (
				<div className="border-b border-border p-3">
					<p className="text-xs text-muted-foreground mb-2">New comment</p>
					<CommentEditor
						placeholder="Add a comment..."
						onSubmit={async (body) => {
							try {
								await onCreateThread(body);
							} catch {
								toast.error("Failed to create comment");
							}
						}}
						onCancel={onCancelPlacePin}
						autoFocus
						mentionSuggestion={mentionSuggestion}
					/>
				</div>
			)}

			{/* Thread detail view */}
			{activeThread && currentUserId && (
				<CommentThreadDetail
					thread={activeThread}
					currentUserId={currentUserId}
					workspaceSlug={workspaceSlug}
					mentionSuggestion={mentionSuggestion}
					onBack={() => onThreadSelect(null)}
					onReply={onReply}
					onResolve={onResolve}
					onUnresolve={onUnresolve}
					onEdit={onEdit}
					onDelete={onDelete}
					aiContext={aiContext}
				/>
			)}

			{/* Thread list (hidden when viewing a thread detail) */}
			{!activeThread && (
				<div className="flex-1 overflow-y-auto">
					{threads.length === 0 && !pendingPin && !placingPin && (
						<CommentEmptyState helpText='Click "Add comment" to start a discussion' />
					)}
					{threads.map((thread, index) => (
						<ThreadListItem
							key={thread._id}
							ref={(el) => {
								if (el) {
									threadRefs.current.set(thread._id, el);
								} else {
									threadRefs.current.delete(thread._id);
								}
							}}
							thread={thread}
							index={index}
							isActive={activeThreadId === thread._id}
							onClick={() => onThreadSelect(thread._id)}
						/>
					))}
				</div>
			)}
		</div>
	);
}

// ── Thread List Item (whiteboard-specific with pin number badge) ────────────

type ThreadListItemProps = {
	thread: WhiteboardThread;
	index: number;
	isActive: boolean;
	onClick: () => void;
};

const ThreadListItem = forwardRef<HTMLDivElement, ThreadListItemProps>(
	function ThreadListItem({ thread, index, isActive, onClick }, ref) {
		const preview = extractCommentText(thread.body, 80);
		const replyCount = thread.replies.length;

		return (
			<div
				ref={ref}
				// biome-ignore lint/a11y/useSemanticElements: list row keeps div semantics for nested comment actions and layout.
				role="button"
				tabIndex={0}
				className={cn(
					"flex gap-2.5 px-3 py-2.5 cursor-pointer transition-colors border-b border-border/40",
					isActive ? "bg-sienna-9/10" : "hover:bg-muted/50",
					thread.resolved && "opacity-60",
				)}
				onClick={onClick}
				onKeyDown={(e) => {
					if (e.key === "Enter" || e.key === " ") {
						e.preventDefault();
						onClick();
					}
				}}
			>
				{/* Pin number badge */}
				<div
					className={cn(
						"flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-mono font-semibold mt-0.5",
						thread.resolved
							? "bg-muted text-muted-foreground"
							: "bg-sienna-9/90 text-white",
					)}
				>
					{index + 1}
				</div>

				<div className="flex-1 min-w-0">
					<div className="flex items-center gap-1.5">
						<Avatar className="h-4 w-4 shrink-0">
							<AvatarImage src={thread.author.image} alt={thread.author.name} />
							<AvatarFallback className="text-[8px]">
								{thread.author.name.charAt(0).toUpperCase()}
							</AvatarFallback>
						</Avatar>
						<span className="text-xs font-medium text-foreground truncate">
							{thread.author.name}
						</span>
						<span className="text-[10px] text-muted-foreground shrink-0">
							{formatCommentTime(thread._creationTime)}
						</span>
						{thread.resolved && (
							<Check className="h-3 w-3 text-emerald-500 shrink-0 ml-auto" />
						)}
					</div>
					<p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
						{preview}
					</p>
					{replyCount > 0 && (
						<span className="text-[10px] text-muted-foreground/70 mt-0.5 block">
							{replyCount} {replyCount === 1 ? "reply" : "replies"}
						</span>
					)}
				</div>
			</div>
		);
	},
);
