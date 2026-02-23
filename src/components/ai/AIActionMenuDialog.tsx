"use client";

import { SparklesIcon } from "lucide-react";
import { useCallback } from "react";
import { QUICK_ACTIONS } from "@/components/ai/InlineAIPrompt";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { useAIActionMenu } from "@/hooks/use-ai-keyboard-shortcuts";
import type { AIContextPage, EmbeddedAIActionType } from "@/types/embedded-ai";

// ── Context labels ───────────────────────────────────────────────────────

const CONTEXT_LABELS: Record<AIContextPage, string> = {
	issue: "Issue actions",
	document: "Document actions",
	whiteboard: "Whiteboard actions",
	project: "Project actions",
	global: "AI actions",
};

// ── Component ────────────────────────────────────────────────────────────

export function AIActionMenuDialog() {
	const { isOpen, context, close } = useAIActionMenu();
	const actions = QUICK_ACTIONS[context.page];
	const label = CONTEXT_LABELS[context.page];

	const handleAction = useCallback(
		(actionType: EmbeddedAIActionType) => {
			// Log action — AI dispatcher handles execution via existing hooks
			console.log("[AIActionMenu] action:", { actionType, context });
			close();
		},
		[context, close],
	);

	return (
		<Dialog open={isOpen} onOpenChange={(open) => !open && close()}>
			<DialogContent
				showCloseButton={false}
				className="sm:max-w-xs max-h-[80vh]"
			>
				<DialogHeader>
					<DialogTitle className="flex items-center gap-2 text-base">
						<SparklesIcon className="size-4 text-sienna-500 dark:text-sienna-400" />
						{label}
					</DialogTitle>
					<DialogDescription className="sr-only">
						Select an AI action for the current context.
					</DialogDescription>
				</DialogHeader>

				<div className="flex flex-col gap-1">
					{actions.map((action) => (
						<button
							key={action.actionType}
							type="button"
							onClick={() => handleAction(action.actionType)}
							className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-left transition-colors hover:bg-sienna-50 dark:hover:bg-sienna-950 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-sienna-400/50 min-h-[44px] sm:min-h-0 touch-manipulation"
						>
							<SparklesIcon className="size-3.5 shrink-0 text-sienna-500 dark:text-sienna-400" />
							<span>{action.label}</span>
						</button>
					))}
				</div>
			</DialogContent>
		</Dialog>
	);
}
