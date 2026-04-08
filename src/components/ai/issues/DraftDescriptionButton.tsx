"use client";

import { useCallback, useState } from "react";
import { toast } from "sonner";
import { AIAssistButton } from "@/components/ai/AIAssistButton";
import { useDraftDescription } from "@/hooks/use-draft-description";

interface DraftDescriptionButtonProps {
	/** Issue title — button is disabled when empty. */
	title: string;
	/** Workspace ID for the AI action context. */
	workspaceId: string;
	/** Current issue type (e.g. "bug", "feature"). */
	issueType?: string;
	/** Current priority. */
	priority?: string;
	/** Issue ID (only for detail page, not create modal). */
	issueId?: string;
	/** Whether description already has content (shows overwrite confirm). */
	hasExistingContent?: boolean;
	/** Generate plain text without markdown formatting (e.g., for doc context). */
	plainText?: boolean;
	/** Called with the generated description text. */
	onDraft: (text: string) => void;
}

export function DraftDescriptionButton({
	title,
	workspaceId,
	issueType,
	priority,
	issueId,
	hasExistingContent = false,
	plainText,
	onDraft,
}: DraftDescriptionButtonProps) {
	const { loading, generateDraft } = useDraftDescription();
	const [confirmOverwrite, setConfirmOverwrite] = useState(false);

	const handleDraft = useCallback(async () => {
		if (hasExistingContent && !confirmOverwrite) {
			setConfirmOverwrite(true);
			return;
		}
		setConfirmOverwrite(false);

		const text = await generateDraft({
			title,
			workspaceId,
			issueType,
			priority,
			issueId,
			plainText,
		});

		if (text) {
			onDraft(text);
		} else {
			toast.error("Failed to generate description");
		}
	}, [
		title,
		workspaceId,
		issueType,
		priority,
		issueId,
		hasExistingContent,
		confirmOverwrite,
		plainText,
		generateDraft,
		onDraft,
	]);

	const handleCancel = useCallback(() => {
		setConfirmOverwrite(false);
	}, []);

	if (confirmOverwrite) {
		return (
			<div className="flex items-center gap-1.5">
				<span className="text-xs text-muted-foreground">Overwrite?</span>
				<button
					type="button"
					onClick={handleDraft}
					className="text-xs font-medium text-sienna-600 hover:text-sienna-700 dark:text-sienna-400 dark:hover:text-sienna-300 min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0 inline-flex items-center justify-center touch-manipulation"
				>
					Yes
				</button>
				<button
					type="button"
					onClick={handleCancel}
					className="text-xs text-muted-foreground hover:text-foreground min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0 inline-flex items-center justify-center touch-manipulation"
				>
					No
				</button>
			</div>
		);
	}

	return (
		<AIAssistButton
			variant="inline"
			label="Draft with AI"
			loading={loading}
			disabled={!title.trim()}
			onClick={handleDraft}
			title={
				!title.trim()
					? "Enter a title first"
					: "Generate a description from the title"
			}
		/>
	);
}
