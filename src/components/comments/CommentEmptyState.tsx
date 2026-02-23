"use client";

import { MessageCircle } from "lucide-react";

type CommentEmptyStateProps = {
	helpText?: string;
};

export function CommentEmptyState({
	helpText = "Add a comment to start a discussion",
}: CommentEmptyStateProps) {
	return (
		<div className="flex flex-col items-center justify-center h-full px-4 text-center">
			<MessageCircle className="h-8 w-8 text-muted-foreground/40 mb-2" />
			<p className="text-sm text-muted-foreground">No comments yet</p>
			<p className="text-xs text-muted-foreground/60 mt-1">{helpText}</p>
		</div>
	);
}
