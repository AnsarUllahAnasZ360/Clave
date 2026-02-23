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

import { useEditorRef } from "platejs/react";
import { useCallback, useEffect, useState } from "react";

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

export function EditorAIBridge({ context }: EditorAIBridgeProps) {
	const editor = useEditorRef();
	const [adapter, setAdapter] = useState<AIEditorAdapter | null>(null);
	const { triggerAction } = useEditorAI(context);

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

	// Handle dialog submission
	const handlePromptSubmit = useCallback(
		(value: string) => {
			if (!pendingAction) return;
			const { actionType, variant } = pendingAction;
			setPendingAction(null);

			const params =
				variant === "translate"
					? { type: actionType, targetLanguage: value }
					: { type: actionType, prompt: value };

			triggerAction(params, adapter ?? undefined).then((result) => {
				if (result?.text && adapter) {
					adapter.insertAtCursor(result.text);
				}
			});
		},
		[pendingAction, triggerAction, adapter],
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
			};

			if (detail.requiresPrompt) {
				// Determine dialog variant based on action type
				const variant: AIPromptVariant =
					detail.actionType === "document_translate" ? "translate" : "prompt";
				setPendingAction({ actionType: detail.actionType, variant });
			} else {
				triggerAction({ type: detail.actionType }, adapter ?? undefined).then(
					(result) => {
						if (result?.text && adapter) {
							adapter.insertAtCursor(result.text);
						}
					},
				);
			}
		};

		window.addEventListener("plate:ai-slash-action", handler);
		return () => window.removeEventListener("plate:ai-slash-action", handler);
	}, [triggerAction, adapter]);

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
			<DictationBridge workspaceId={context.workspaceId} />
		</>
	);
}
