import type { ReactNode } from "react";

export type WhiteboardGenerationMode =
	| "wireframe"
	| "flowchart"
	| "architecture";

export interface WhiteboardGenerationOptions {
	mode: WhiteboardGenerationMode;
	appType?: string;
	coreSections?: string;
	keyActions?: string;
	density?: "compact" | "balanced" | "detailed";
}

export interface WhiteboardExplainOptions {
	scope?: "selection" | "canvas";
}

export interface WhiteboardAIOptions {
	generation?: WhiteboardGenerationOptions;
	explain?: WhiteboardExplainOptions;
}

// ── Action Types ─────────────────────────────────────────────────────────
// Union of all embedded AI action types. Must match the Convex dispatcher
// in convex/ai/embedded.ts (STORY-004).

export type EmbeddedAIActionType =
	// Document AI
	| "document_continue"
	| "document_improve"
	| "document_summarize"
	| "document_rewrite"
	| "document_translate"
	| "document_expand"
	| "document_fix_grammar"
	| "document_write_from_prompt"
	// Issue AI
	| "issue_auto_triage"
	| "issue_draft_description"
	| "issue_detect_duplicates"
	| "issue_summarize_activity"
	| "issue_reply_comment"
	| "issue_ai_mention"
	// Whiteboard AI
	| "whiteboard_generate_diagram"
	| "whiteboard_explain_diagram"
	| "whiteboard_cleanup_layout"
	// Project AI
	| "project_status_summary"
	| "project_status_report"
	| "project_plan_sprint"
	// Search
	| "semantic_search"
	// Notifications
	| "notification_digest";

// ── AIAction ─────────────────────────────────────────────────────────────
// Describes a single action item in an AIActionMenu.

export interface AIAction {
	type: EmbeddedAIActionType;
	label: string;
	icon?: ReactNode;
	shortcut?: string;
	/** When true, a separator is rendered before this action. */
	separator?: boolean;
}

// ── AIContext ─────────────────────────────────────────────────────────────
// Describes the current page context for context-aware AI features.

export type AIContextPage =
	| "issue"
	| "document"
	| "whiteboard"
	| "project"
	| "global";

export interface AIContext {
	page: AIContextPage;
	entityId?: string;
}

// ── AIActionResult ───────────────────────────────────────────────────────
// The result returned by an embedded AI action.

export interface AIActionResult {
	type: EmbeddedAIActionType;
	text?: string;
	data?: unknown;
	error?: string;
}
