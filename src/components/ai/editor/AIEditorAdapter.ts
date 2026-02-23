/**
 * Editor-agnostic AI adapter interface.
 *
 * The codebase uses Plate.js (documents, issues) and TipTap
 * (project descriptions). This adapter insulates all AI editor code
 * from direct editor API calls, enabling a future editor migration
 * with zero rework.
 */

import type { EmbeddedAIActionType } from "@/types/embedded-ai";

// ── Types ───────────────────────────────────────────────────────────────────

export type EditorType = "plate" | "tiptap" | "blocknote";

export interface Position {
	/** Block-level index (for block-based editors). */
	blockIndex?: number;
	/** Character offset within the block (for inline positioning). */
	offset?: number;
}

export interface Selection {
	text: string;
	from: number;
	to: number;
}

export interface StreamHandle {
	/** Unique identifier for this streaming session. */
	id: string;
	/** Editor-specific state for the streaming session. */
	_internal: unknown;
}

export interface AISlashCommand {
	/** Unique key for the command. */
	key: string;
	/** Display label (e.g., "AI: Continue writing"). */
	label: string;
	/** Group name for the slash menu (e.g., "AI"). */
	group: string;
	/** Short description shown below the label. */
	description: string;
	/** Optional icon element. */
	icon?: React.ReactNode;
	/** Search keywords for filtering. */
	keywords?: string[];
	/** The embedded AI action type to trigger. */
	actionType: EmbeddedAIActionType;
	/**
	 * Whether this command needs a user prompt (opens an input).
	 * For example, "Write from prompt..." requires user input.
	 */
	requiresPrompt?: boolean;
}

type Unsubscribe = () => void;

// ── Adapter Interface ───────────────────────────────────────────────────────

export interface AIEditorAdapter {
	/** Which editor runtime this adapter wraps. */
	getEditorType(): EditorType;

	// ── Content read operations ──────────────────────────────────────────

	/** Return selected text, or null if nothing is selected. */
	getSelectedText(): string | null;

	/** Return document text before the given cursor position. */
	getContentBefore(cursor?: Position): string;

	/** Return the full document as plain text. */
	getFullContent(): string;

	// ── Content write operations ─────────────────────────────────────────

	/** Insert plain text at the current cursor position. */
	insertAtCursor(text: string): void;

	/** Replace the current selection with the given text. */
	replaceSelection(text: string): void;

	/** Insert a block of content before or after the current block. */
	insertBlock(content: string, position: "before" | "after"): void;

	// ── Streaming insertion ──────────────────────────────────────────────

	/** Begin a streaming insertion at the given position. */
	startStreamingInsert(position?: Position): StreamHandle;

	/** Append a text chunk to an active streaming session. */
	appendToStream(handle: StreamHandle, chunk: string): void;

	/** Finalize a streaming session (removes placeholder cursor, etc.). */
	finalizeStream(handle: StreamHandle): void;

	/** Cancel and remove a streaming session's content. */
	cancelStream(handle: StreamHandle): void;

	// ── Slash menu integration ───────────────────────────────────────────

	/**
	 * Register AI commands in the editor's slash menu.
	 * For editors without a slash menu (e.g., TipTap), this is a no-op.
	 */
	registerSlashCommands(commands: AISlashCommand[]): void;

	// ── Selection observation ────────────────────────────────────────────

	/**
	 * Subscribe to selection changes. The callback receives the current
	 * selection or null when nothing is selected.
	 */
	onSelectionChange(
		callback: (selection: Selection | null) => void,
	): Unsubscribe;
}

// ── Type Guards ─────────────────────────────────────────────────────────────

/**
 * Detect a Plate editor instance.
 * Plate editors are objects with `tf`, `api`, `plugins`, and `children` properties.
 */
export function isPlateEditorInstance(editor: unknown): boolean {
	if (!editor || typeof editor !== "object") return false;
	const e = editor as Record<string, unknown>;
	return (
		typeof e.tf === "object" &&
		e.tf !== null &&
		typeof e.api === "object" &&
		e.api !== null &&
		typeof e.plugins === "object" &&
		Array.isArray(e.children)
	);
}

/**
 * Detect a TipTap editor instance.
 * TipTap editors have `state`, `chain`, `commands`, and `getText` properties.
 */
export function isTipTapEditorInstance(editor: unknown): boolean {
	if (!editor || typeof editor !== "object") return false;
	const e = editor as Record<string, unknown>;
	return (
		typeof e.state === "object" &&
		e.state !== null &&
		typeof e.chain === "function" &&
		typeof e.commands === "object" &&
		typeof e.getText === "function"
	);
}

// ── Factory ─────────────────────────────────────────────────────────────────

/**
 * Async factory — detects the editor type and dynamically loads
 * the appropriate adapter. Throws if the editor is unrecognised.
 */
export async function getEditorAdapter(
	editor: unknown,
): Promise<AIEditorAdapter> {
	if (isPlateEditorInstance(editor)) {
		const { PlateAdapter } = await import("./plate-adapter");
		return new PlateAdapter(editor);
	}
	if (isTipTapEditorInstance(editor)) {
		const { TipTapAdapter } = await import("./tiptap-adapter");
		return new TipTapAdapter(editor);
	}
	throw new Error(
		"getEditorAdapter: Unknown editor type. Expected a Plate or TipTap editor instance.",
	);
}
