"use client";

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

export function getAISlashMenuGroup(
	_onAction: (
		actionType: EmbeddedAIActionType,
		editor: PlateEditor,
		options?: { requiresPrompt?: boolean },
	) => void,
): AISlashMenuGroup {
	return { group: AI_GROUP, items: [] };
}

export function getAISlashMenuItems(
	_onAction: (
		actionType: EmbeddedAIActionType,
		editor: PlateEditor,
		options?: { requiresPrompt?: boolean },
	) => void,
): AISlashMenuItem[] {
	return [];
}
