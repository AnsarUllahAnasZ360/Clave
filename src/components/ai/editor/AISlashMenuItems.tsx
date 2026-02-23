"use client";

/**
 * AI slash menu items for the Plate editor.
 *
 * Exports `getAISlashMenuGroup()` which returns a group compatible
 * with the `Group` type used in `slash-node.tsx`. STORY-007/008
 * will wire these items into the slash menu by importing this module.
 *
 * Each item triggers an embedded AI action via a callback prop —
 * slash menu items render inside a SuggestionMenuController context,
 * not a normal React component tree, so we pass an onAction callback
 * rather than using hooks directly.
 */

import {
	GlobeIcon,
	PenLineIcon,
	SparklesIcon,
	TextIcon,
	WandIcon,
} from "lucide-react";
import type { PlateEditor } from "platejs/react";
import type { EmbeddedAIActionType } from "@/types/embedded-ai";

// ── Types ───────────────────────────────────────────────────────────────────

export interface AISlashMenuItem {
	icon: React.ReactNode;
	value: string;
	label: string;
	keywords: string[];
	/** Short description (shown as subtext in some slash menu impls). */
	description: string;
	/** The AI action type to trigger. */
	actionType: EmbeddedAIActionType;
	/** Whether the item requires user text input before triggering. */
	requiresPrompt?: boolean;
	onSelect: (editor: PlateEditor, value: string) => void;
}

export interface AISlashMenuGroup {
	group: string;
	items: AISlashMenuItem[];
}

// ── AI Slash Command Definitions ────────────────────────────────────────────

const AI_GROUP = "AI";

/**
 * Returns the AI slash menu group with 5 AI commands.
 *
 * @param onAction — Callback invoked when an AI action is selected.
 *   The consuming component (STORY-007/008) provides this callback
 *   to bridge from the slash menu to the embedded AI system.
 */
export function getAISlashMenuGroup(
	onAction: (
		actionType: EmbeddedAIActionType,
		editor: PlateEditor,
		options?: { requiresPrompt?: boolean },
	) => void,
): AISlashMenuGroup {
	return {
		group: AI_GROUP,
		items: [
			{
				icon: <PenLineIcon className="size-4" />,
				value: "ai_continue",
				label: "AI: Continue writing",
				keywords: ["ai", "continue", "write", "generate"],
				description: "Continue writing from the current position",
				actionType: "document_continue",
				onSelect: (editor) => {
					onAction("document_continue", editor);
				},
			},
			{
				icon: <TextIcon className="size-4" />,
				value: "ai_summarize",
				label: "AI: Summarize above",
				keywords: ["ai", "summarize", "summary", "tldr"],
				description: "Summarize the content above the cursor",
				actionType: "document_summarize",
				onSelect: (editor) => {
					onAction("document_summarize", editor);
				},
			},
			{
				icon: <SparklesIcon className="size-4" />,
				value: "ai_write_prompt",
				label: "AI: Write from prompt...",
				keywords: ["ai", "write", "prompt", "generate", "create"],
				description: "Generate content from a text prompt",
				actionType: "document_write_from_prompt",
				requiresPrompt: true,
				onSelect: (editor) => {
					onAction("document_write_from_prompt", editor, {
						requiresPrompt: true,
					});
				},
			},
			{
				icon: <WandIcon className="size-4" />,
				value: "ai_improve",
				label: "AI: Improve writing",
				keywords: ["ai", "improve", "enhance", "better", "rewrite"],
				description: "Improve clarity and flow of selected text",
				actionType: "document_improve",
				onSelect: (editor) => {
					onAction("document_improve", editor);
				},
			},
			{
				icon: <GlobeIcon className="size-4" />,
				value: "ai_translate",
				label: "AI: Translate...",
				keywords: ["ai", "translate", "language", "convert"],
				description: "Translate content to another language",
				actionType: "document_translate",
				requiresPrompt: true,
				onSelect: (editor) => {
					onAction("document_translate", editor, {
						requiresPrompt: true,
					});
				},
			},
		],
	};
}

/**
 * Returns just the items array (without the group wrapper).
 * Useful when merging into an existing groups array.
 */
export function getAISlashMenuItems(
	onAction: (
		actionType: EmbeddedAIActionType,
		editor: PlateEditor,
		options?: { requiresPrompt?: boolean },
	) => void,
): AISlashMenuItem[] {
	return getAISlashMenuGroup(onAction).items;
}
