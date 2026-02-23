"use client";

import { Loader2Icon, SparklesIcon } from "lucide-react";
import { useCallback, useState } from "react";
import { toast } from "sonner";
import { useEmbeddedAI } from "@/hooks/use-embedded-ai";
import { cn } from "@/lib/utils";

interface AICommentReplyProps {
	/** The workspace ID for the AI context. */
	workspaceId: string;
	/** The issue ID (for issue comments). */
	issueId?: string;
	/** The whiteboard ID (for whiteboard comments). */
	whiteboardId?: string;
	/** The document ID (for document comments). */
	documentId?: string;
	/** The body of the comment being replied to. */
	commentBody: string;
	/** The author name of the comment being replied to. */
	commentAuthor: string;
	/** Called with the AI-generated reply text. Consumer pre-fills the reply editor. */
	onReplyGenerated: (text: string) => void;
	className?: string;
}

export function AICommentReply({
	workspaceId,
	issueId,
	whiteboardId,
	documentId,
	commentBody,
	commentAuthor,
	onReplyGenerated,
	className,
}: AICommentReplyProps) {
	const { callEmbeddedAI } = useEmbeddedAI();
	const [loading, setLoading] = useState(false);

	const handleClick = useCallback(async () => {
		if (loading) return;
		setLoading(true);
		try {
			const result = await callEmbeddedAI({
				type: "issue_reply_comment",
				context: {
					workspaceId,
					issueId,
					whiteboardId,
					documentId,
				},
				selectedText: commentBody,
				prompt: `Reply to comment by ${commentAuthor}: ${commentBody}`,
			});
			if (result?.error) {
				toast.error("Failed to generate AI reply");
				return;
			}
			if (result?.text) {
				onReplyGenerated(result.text);
			}
		} catch {
			toast.error("Failed to generate AI reply");
		} finally {
			setLoading(false);
		}
	}, [
		loading,
		callEmbeddedAI,
		workspaceId,
		issueId,
		whiteboardId,
		documentId,
		commentBody,
		commentAuthor,
		onReplyGenerated,
	]);

	return (
		<button
			type="button"
			onClick={handleClick}
			disabled={loading}
			className={cn(
				"p-1 rounded min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0 flex items-center justify-center hover:bg-sienna-500/10 text-muted-foreground hover:text-sienna-600 dark:hover:text-sienna-400 transition-colors touch-manipulation",
				loading && "pointer-events-none",
				className,
			)}
			title="Reply with AI"
		>
			{loading ? (
				<Loader2Icon className="h-3.5 w-3.5 animate-spin text-sienna-500" />
			) : (
				<SparklesIcon className="h-3.5 w-3.5" />
			)}
		</button>
	);
}
