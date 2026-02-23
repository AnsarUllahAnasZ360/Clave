"use client";

import type { SuggestionOptions } from "@tiptap/suggestion";
import { useCallback, useState } from "react";
import { toast } from "sonner";
import { CommentEditor } from "../comments/CommentEditor";
import type { MentionItem } from "../comments/MentionList";

type NewCommentPopoverProps = {
	position: { viewportX: number; viewportY: number };
	mentionSuggestion?: Omit<SuggestionOptions<MentionItem>, "editor">;
	onSubmit: (body: string) => Promise<void>;
	onCancel: () => void;
};

export function NewCommentPopover({
	position,
	mentionSuggestion,
	onSubmit,
	onCancel,
}: NewCommentPopoverProps) {
	const [submitting, setSubmitting] = useState(false);

	const handleSubmit = useCallback(
		async (body: string) => {
			setSubmitting(true);
			try {
				await onSubmit(body);
			} catch {
				toast.error("Failed to create comment");
			} finally {
				setSubmitting(false);
			}
		},
		[onSubmit],
	);

	return (
		<div
			className="absolute z-30 w-[300px] rounded-lg border border-border bg-popover shadow-lg pointer-events-auto"
			style={{
				left: `${position.viewportX + 16}px`,
				top: `${position.viewportY - 8}px`,
			}}
			onClick={(e) => e.stopPropagation()}
		>
			<div className="p-2">
				<CommentEditor
					placeholder="Add a comment..."
					onSubmit={handleSubmit}
					onCancel={onCancel}
					submitting={submitting}
					autoFocus
					mentionSuggestion={mentionSuggestion}
				/>
			</div>
		</div>
	);
}
