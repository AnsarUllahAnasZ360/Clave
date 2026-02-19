"use client";

import type { SuggestionOptions } from "@tiptap/suggestion";
import { Pencil, Trash2 } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { formatCommentTime } from "@/lib/format";
import { cn } from "@/lib/utils";
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
}: CommentBubbleProps) {
	return (
		<div className="group px-3 py-2 hover:bg-muted/30 transition-colors">
			<div className="flex items-start gap-2">
				<Avatar className="h-6 w-6 mt-0.5 shrink-0">
					<AvatarImage src={author.image} alt={author.name} />
					<AvatarFallback className="text-[9px]">
						{author.name.charAt(0).toUpperCase()}
					</AvatarFallback>
				</Avatar>
				<div className="flex-1 min-w-0">
					<div className="flex items-center gap-2">
						<span className="text-xs font-medium text-foreground truncate">
							{author.name}
						</span>
						<span className="text-[10px] text-muted-foreground shrink-0">
							{formatCommentTime(timestamp)}
						</span>
						{isOwn && !isEditing && (
							<div className="ml-auto flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
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
