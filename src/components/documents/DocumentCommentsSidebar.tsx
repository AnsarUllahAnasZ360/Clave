"use client";

import type { SuggestionOptions } from "@tiptap/suggestion";
import { Check, MessageCircle } from "lucide-react";
import { forwardRef, useEffect, useRef, useState } from "react";
import { CommentEmptyState } from "@/components/comments/CommentEmptyState";
import {
	CommentThreadDetail,
	type CommentThread,
} from "@/components/comments/CommentThreadDetail";
import { extractCommentText } from "@/components/comments/CommentContent";
import type { MentionItem } from "@/components/comments/MentionList";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { formatCommentTime } from "@/lib/format";
import { cn } from "@/lib/utils";

// ── Types ──────────────────────────────────────────────────────────────────

export type DocumentThread = CommentThread;

type DocumentCommentsSidebarProps = {
	threads: DocumentThread[];
	currentUserId?: string;
	workspaceSlug?: string;
	mentionSuggestion?: Omit<SuggestionOptions<MentionItem>, "editor">;
	onReply: (threadId: string, body: string) => Promise<void>;
	onResolve: (threadId: string) => Promise<void>;
	onUnresolve: (threadId: string) => Promise<void>;
	onEdit: (commentId: string, body: string) => Promise<void>;
	onDelete: (commentId: string) => Promise<void>;
};

// ── Main Component ─────────────────────────────────────────────────────────

export function DocumentCommentsSidebar({
	threads,
	currentUserId,
	workspaceSlug,
	mentionSuggestion,
	onReply,
	onResolve,
	onUnresolve,
	onEdit,
	onDelete,
}: DocumentCommentsSidebarProps) {
	const [activeThreadId, setActiveThreadId] = useState<string | null>(null);

	const activeThread = activeThreadId
		? (threads.find((t) => t._id === activeThreadId) ?? null)
		: null;

	const threadRefs = useRef<Map<string, HTMLButtonElement>>(new Map());

	// Scroll to active thread when it changes
	useEffect(() => {
		if (activeThreadId) {
			const el = threadRefs.current.get(activeThreadId);
			if (el) {
				el.scrollIntoView({ behavior: "smooth", block: "nearest" });
			}
		}
	}, [activeThreadId]);

	// Sort threads: unresolved first, then by creation time descending
	const sortedThreads = [...threads].sort((a, b) => {
		if (a.resolved !== b.resolved) return a.resolved ? 1 : -1;
		return b._creationTime - a._creationTime;
	});

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
			</div>

			{/* Thread detail view */}
			{activeThread && currentUserId && (
				<CommentThreadDetail
					thread={activeThread}
					currentUserId={currentUserId}
					workspaceSlug={workspaceSlug}
					mentionSuggestion={mentionSuggestion}
					onBack={() => setActiveThreadId(null)}
					onReply={onReply}
					onResolve={onResolve}
					onUnresolve={onUnresolve}
					onEdit={onEdit}
					onDelete={onDelete}
				/>
			)}

			{/* Thread list (hidden when viewing a thread detail) */}
			{!activeThread && (
				<div className="flex-1 overflow-y-auto">
					{sortedThreads.length === 0 && (
						<CommentEmptyState helpText="Select text in the document to add a comment" />
					)}
					{sortedThreads.map((thread) => (
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
							isActive={activeThreadId === thread._id}
							onClick={() => setActiveThreadId(thread._id)}
						/>
					))}
				</div>
			)}
		</div>
	);
}

// ── Thread List Item (document-specific with avatar leading) ────────────────

type ThreadListItemProps = {
	thread: DocumentThread;
	isActive: boolean;
	onClick: () => void;
};

const ThreadListItem = forwardRef<HTMLButtonElement, ThreadListItemProps>(
	function ThreadListItem({ thread, isActive, onClick }, ref) {
		const preview = extractCommentText(thread.body, 80);
		const replyCount = thread.replies.length;

		return (
			<button
				ref={ref}
				type="button"
				className={cn(
					"flex w-full gap-2.5 px-3 py-2.5 cursor-pointer transition-colors border-b border-border/40 text-left",
					isActive ? "bg-sienna-9/10" : "hover:bg-muted/50",
					thread.resolved && "opacity-60",
				)}
				onClick={onClick}
			>
				<Avatar className="h-6 w-6 mt-0.5 shrink-0">
					<AvatarImage src={thread.author.image} alt={thread.author.name} />
					<AvatarFallback className="text-[9px]">
						{thread.author.name.charAt(0).toUpperCase()}
					</AvatarFallback>
				</Avatar>

				<div className="flex-1 min-w-0">
					<div className="flex items-center gap-1.5">
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
			</button>
		);
	},
);
