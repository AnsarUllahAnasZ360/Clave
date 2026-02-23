"use client";

/**
 * Bridge component that wires AI features into a Plate editor.
 *
 * Must be rendered inside a `<Plate>` context. Provides:
 * 1. AI selection toolbar (appears on text selection)
 * 2. Slash command event handler (dispatched by slash-node.tsx AI items)
 * 3. AI prompt dialog (replaces window.prompt for "Write from prompt" / "Translate")
 * 4. Dictation bridge (voice input for any AI-enabled editor)
 *
 * Reusable across DocumentEditor, IssueDescriptionEditor,
 * ProjectDescriptionEditor, and IssueFullCreateModal.
 */

import { Loader2Icon } from "lucide-react";
import { useEditorRef } from "platejs/react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { useAISelectionToolbar } from "@/hooks/use-ai-selection-toolbar";
import type { EmbeddedAIActionType } from "@/types/embedded-ai";
import type { EditorAIContext } from "./AIEditorActions";
import { useEditorAI } from "./AIEditorActions";
import type { AIEditorAdapter } from "./AIEditorAdapter";
import { AIPromptDialog, type AIPromptVariant } from "./AIPromptDialog";
import { AISelectionToolbar } from "./AISelectionToolbar";
import { DictationBridge } from "./DictationBridge";
import { PlateAdapter } from "./plate-adapter";

interface EditorAIBridgeProps {
	/** Context for AI actions (workspaceId, documentId, etc.). */
	context: EditorAIContext;
}

const SELECTION_REQUIRED_ACTIONS = new Set<EmbeddedAIActionType>([
	"document_improve",
	"document_rewrite",
	"document_translate",
	"document_expand",
	"document_fix_grammar",
]);

const ACTION_BUSY_LABELS: Partial<Record<EmbeddedAIActionType, string>> = {
	document_continue: "AI is continuing your writing...",
	document_summarize: "AI is summarizing...",
	document_write_from_prompt: "AI is drafting content...",
	document_improve: "AI is improving selected text...",
	document_translate: "AI is translating selected text...",
};

function getEditorRuntimeId(editor: { id?: unknown }): string | null {
	if (editor.id === null || editor.id === undefined) return null;
	return String(editor.id);
}

export function EditorAIBridge({ context }: EditorAIBridgeProps) {
	const editor = useEditorRef();
	const [adapter, setAdapter] = useState<AIEditorAdapter | null>(null);
	const { triggerAction } = useEditorAI(context);
	const [slashBusyLabel, setSlashBusyLabel] = useState<string | null>(null);

	// Pending prompt state for dialog
	const [pendingAction, setPendingAction] = useState<{
		actionType: EmbeddedAIActionType;
		variant: AIPromptVariant;
	} | null>(null);

	// Create the adapter once the editor is available.
	useEffect(() => {
		if (editor) {
			setAdapter(new PlateAdapter(editor));
		}
	}, [editor]);

	// Selection toolbar hook
	const selectionToolbar = useAISelectionToolbar({
		adapter,
		disabled: false,
	});

	// Handle AI selection toolbar actions
	const handleSelectionAction = useCallback(
		async (
			actionType: EmbeddedAIActionType,
			selectedText: string,
			targetLanguage?: string,
		) => {
			const result = await triggerAction(
				{
					type: actionType,
					selectedText,
					targetLanguage,
				},
				adapter ?? undefined,
			);
			return result?.text ?? null;
		},
		[triggerAction, adapter],
	);

	const runSlashAction = useCallback(
		async (
			actionType: EmbeddedAIActionType,
			options?: { prompt?: string; targetLanguage?: string },
		) => {
			if (slashBusyLabel) {
				toast.info("AI is already working on a command.");
				return;
			}
			if (!adapter) {
				toast.error("Editor AI is initializing. Try again in a moment.");
				return;
			}

			const selectedText = adapter.getSelectedText()?.trim() ?? "";
			if (SELECTION_REQUIRED_ACTIONS.has(actionType) && !selectedText) {
				toast.error("Select text first, then run this command.");
				return;
			}

			let prompt = options?.prompt;
			if (
				actionType === "document_continue" ||
				actionType === "document_summarize"
			) {
				const contentBefore = adapter.getContentBefore().trim();
				const fullContent = adapter.getFullContent().trim();
				const fallbackContent = contentBefore || fullContent;

				if (!fallbackContent) {
					if (actionType === "document_continue") {
						setPendingAction({
							actionType: "document_write_from_prompt",
							variant: "prompt",
						});
						toast.info("Tell AI what to write, then generate.");
					} else {
						toast.info("Nothing above the cursor to summarize yet.");
					}
					return;
				}

				if (!prompt) {
					prompt = fallbackContent;
				}
			}

			setSlashBusyLabel(
				ACTION_BUSY_LABELS[actionType] ?? "AI is working on your request...",
			);

			try {
				const result = await triggerAction(
					{
						type: actionType,
						...(prompt ? { prompt } : {}),
						...(options?.targetLanguage
							? { targetLanguage: options.targetLanguage }
							: {}),
					},
					adapter,
				);

				if (!result) {
					toast.error("AI request failed. Please try again.");
					return;
				}
				if (result.error) {
					toast.error(result.error);
					return;
				}
				if (!result.text?.trim()) {
					toast.error("AI returned no content.");
					return;
				}

				adapter.insertAtCursor(result.text);
			} catch (error) {
				const message =
					error instanceof Error ? error.message : "AI request failed.";
				toast.error(message);
			} finally {
				setSlashBusyLabel(null);
			}
		},
		[adapter, triggerAction, slashBusyLabel],
	);

	// Handle dialog submission
	const handlePromptSubmit = useCallback(
		async (value: string) => {
			if (!pendingAction) return;
			const { actionType, variant } = pendingAction;
			setPendingAction(null);

			await runSlashAction(
				actionType,
				variant === "translate" ? { targetLanguage: value } : { prompt: value },
			);
		},
		[pendingAction, runSlashAction],
	);

	const handlePromptCancel = useCallback(() => {
		setPendingAction(null);
	}, []);

	// Listen for AI slash command events from slash-node.tsx
	useEffect(() => {
		const handler = (e: Event) => {
			const detail = (e as CustomEvent).detail as {
				actionType: EmbeddedAIActionType;
				requiresPrompt?: boolean;
				editorId?: string;
			};
			const currentEditorId = getEditorRuntimeId(editor);
			if (
				detail.editorId &&
				currentEditorId &&
				detail.editorId !== currentEditorId
			) {
				return;
			}

			if (detail.requiresPrompt) {
				// Determine dialog variant based on action type
				const variant: AIPromptVariant =
					detail.actionType === "document_translate" ? "translate" : "prompt";
				setPendingAction({ actionType: detail.actionType, variant });
			} else {
				// Run after slash input cleanup settles selection/cursor.
				requestAnimationFrame(() => {
					void runSlashAction(detail.actionType);
				});
			}
		};

		window.addEventListener("plate:ai-slash-action", handler);
		return () => window.removeEventListener("plate:ai-slash-action", handler);
	}, [editor, runSlashAction]);

	return (
		<>
			<AISelectionToolbar
				visible={selectionToolbar.visible}
				position={selectionToolbar.position}
				selectedText={selectionToolbar.selectedText}
				adapter={adapter}
				context={context}
				onDismiss={selectionToolbar.dismiss}
				onAction={handleSelectionAction}
			/>
			<AIPromptDialog
				open={pendingAction !== null}
				variant={pendingAction?.variant ?? "prompt"}
				onSubmit={handlePromptSubmit}
				onCancel={handlePromptCancel}
			/>
			{slashBusyLabel && (
				<div className="pointer-events-none fixed bottom-6 right-6 z-[70] animate-in fade-in slide-in-from-bottom-2 duration-200">
					<div className="flex items-center gap-2 rounded-full border bg-popover px-3 py-1.5 text-xs text-muted-foreground shadow-lg">
						<Loader2Icon className="size-3.5 animate-spin" />
						<span>{slashBusyLabel}</span>
					</div>
				</div>
			)}
			<DictationBridge workspaceId={context.workspaceId} />
		</>
	);
}
