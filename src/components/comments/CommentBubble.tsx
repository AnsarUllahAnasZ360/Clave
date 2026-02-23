"use client";

import type { SuggestionOptions } from "@tiptap/suggestion";
import { Pencil, Sparkles, Trash2 } from "lucide-react";
import { AICommentReply } from "@/components/ai/comments/AICommentReply";
import { extractCommentText } from "@/components/comments/CommentContent";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { formatCommentTime } from "@/lib/format";
import { CommentContent } from "./CommentContent";
import { CommentEditor } from "./CommentEditor";
import type { MentionItem } from "./MentionList";

export type CommentBubbleProps = {
	author: { name: string; image?: string };
	body: string;
	timestamp: number;
	isOwn: boolean;
	isEditing: boolean;
	workspaceSlug?: string;
	mentionSuggestion?: Omit<SuggestionOptions<MentionItem>, "editor">;
	onStartEdit: () => void;
	onCancelEdit: () => void;
	onSaveEdit: (body: string) => void;
	onDelete: () => void;
	/** Optional: callback when AI generates a reply for this comment. */
	onAIReply?: (text: string) => void;
	/** Context for AI reply generation. */
	aiContext?: {
		workspaceId: string;
		issueId?: string;
		whiteboardId?: string;
		documentId?: string;
	};
};

export function CommentBubble({
	author,
	body,
	timestamp,
	isOwn,
	isEditing,
	workspaceSlug,
	mentionSuggestion,
	onStartEdit,
	onCancelEdit,
	onSaveEdit,
	onDelete,
	onAIReply,
	aiContext,
}: CommentBubbleProps) {
	const isAI = author.name === "Clave AI";

	return (
		<div
			className={`group px-3 py-2 transition-colors ${isAI ? "bg-[oklch(0.65_0.14_45/0.06)] hover:bg-[oklch(0.65_0.14_45/0.1)]" : "hover:bg-muted/30"}`}
		>
			<div className="flex items-start gap-2">
				{isAI ? (
					<div className="h-6 w-6 mt-0.5 shrink-0 rounded-full bg-[oklch(0.65_0.14_45/0.15)] flex items-center justify-center">
						<Sparkles className="h-3.5 w-3.5 text-[oklch(0.55_0.14_45)]" />
					</div>
				) : (
					<Avatar className="h-6 w-6 mt-0.5 shrink-0">
						<AvatarImage src={author.image} alt={author.name} />
						<AvatarFallback className="text-[9px]">
							{author.name.charAt(0).toUpperCase()}
						</AvatarFallback>
					</Avatar>
				)}
				<div className="flex-1 min-w-0">
					<div className="flex items-center gap-2">
						<span
							className={`text-xs font-medium truncate ${isAI ? "text-[oklch(0.55_0.14_45)]" : "text-foreground"}`}
						>
							{author.name}
						</span>
						<span className="text-[10px] text-muted-foreground shrink-0">
							{formatCommentTime(timestamp)}
						</span>
						{!isEditing && (
							<div className="ml-auto flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
								{!isAI && onAIReply && aiContext && (
									<AICommentReply
										workspaceId={aiContext.workspaceId}
										issueId={aiContext.issueId}
										whiteboardId={aiContext.whiteboardId}
										documentId={aiContext.documentId}
										commentBody={extractCommentText(body, 500)}
										commentAuthor={author.name}
										onReplyGenerated={onAIReply}
										className="h-5 w-5 flex items-center justify-center"
									/>
								)}
								{isOwn && (
									<>
										<button
											type="button"
											className="h-5 w-5 flex items-center justify-center rounded hover:bg-muted text-muted-foreground"
											onClick={onStartEdit}
											title="Edit"
										>
											<Pencil className="h-3 w-3" />
										</button>
										<button
											type="button"
											className="h-5 w-5 flex items-center justify-center rounded hover:bg-muted text-muted-foreground hover:text-destructive"
											onClick={onDelete}
											title="Delete"
										>
											<Trash2 className="h-3 w-3" />
										</button>
									</>
								)}
							</div>
						)}
					</div>
					{isEditing ? (
						<div className="mt-1">
							<CommentEditor
								initialContent={body}
								onSubmit={onSaveEdit}
								onCancel={onCancelEdit}
								autoFocus
								mentionSuggestion={mentionSuggestion}
							/>
						</div>
					) : (
						<CommentContent
							body={body}
							workspaceSlug={workspaceSlug}
							className="mt-0.5"
						/>
					)}
				</div>
			</div>
		</div>
	);
}
