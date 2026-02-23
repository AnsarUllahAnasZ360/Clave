"use client";

/**
 * Editor-specific AI action hooks.
 *
 * Wraps the generic `useEmbeddedAI` hook with editor context,
 * providing a convenient API for triggering AI actions from
 * editor components (slash menu items, selection toolbar, etc.).
 */

import { useCallback } from "react";
import { useEmbeddedAI } from "@/hooks/use-embedded-ai";
import type { EmbeddedAIActionType } from "@/types/embedded-ai";
import type { AIEditorAdapter } from "./AIEditorAdapter";

// ── Types ───────────────────────────────────────────────────────────────────

export interface EditorAIContext {
	workspaceId: string;
	projectId?: string;
	documentId?: string;
	issueId?: string;
	whiteboardId?: string;
}

export interface EditorAIAction {
	type: EmbeddedAIActionType;
	prompt?: string;
	selectedText?: string;
	targetLanguage?: string;
}

// ── Hook ────────────────────────────────────────────────────────────────────

/**
 * Hook that wraps `useEmbeddedAI` with editor-specific context.
 * Returns a `triggerAction` function that automatically includes
 * the adapter's selected text and the provided context.
 */
export function useEditorAI(context: EditorAIContext) {
	const embeddedAI = useEmbeddedAI();

	const triggerAction = useCallback(
		async (action: EditorAIAction, adapter?: AIEditorAdapter) => {
			// If no explicit selectedText, try to get it from the adapter.
			const selectedText =
				action.selectedText ?? adapter?.getSelectedText() ?? undefined;

			return embeddedAI.callEmbeddedAI({
				type: action.type,
				context,
				prompt: action.prompt,
				selectedText,
				targetLanguage: action.targetLanguage,
			});
		},
		[context, embeddedAI],
	);

	return {
		...embeddedAI,
		triggerAction,
	};
}

// ── Standalone function ─────────────────────────────────────────────────────

/**
 * Trigger an editor AI action and handle the result via the adapter.
 *
 * This is a convenience function for one-shot calls from slash menu
 * items and toolbar buttons. For streaming or multi-step flows, use
 * the `useEditorAI` hook directly.
 */
export async function triggerEditorAI(
	action: EditorAIAction,
	context: EditorAIContext,
	adapter: AIEditorAdapter,
	callFn: ReturnType<typeof useEmbeddedAI>["callEmbeddedAI"],
) {
	const selectedText =
		action.selectedText ?? adapter.getSelectedText() ?? undefined;

	const result = await callFn({
		type: action.type,
		context,
		prompt: action.prompt,
		selectedText,
		targetLanguage: action.targetLanguage,
	});

	return result;
}
