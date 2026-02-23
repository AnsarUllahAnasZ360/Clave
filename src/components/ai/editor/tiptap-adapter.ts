/**
 * TipTap adapter for the AIEditorAdapter interface.
 *
 * Used by TipTapEditor (project descriptions). TipTap does not have
 * a native slash menu, so AI is triggered via toolbar buttons or
 * the global Cmd+I prompt instead.
 */

import type { Editor as TipTapEditor } from "@tiptap/react";

import type {
	AIEditorAdapter,
	AISlashCommand,
	EditorType,
	Position,
	Selection,
	StreamHandle,
} from "./AIEditorAdapter";

let streamCounter = 0;

export class TipTapAdapter implements AIEditorAdapter {
	private editor: TipTapEditor;

	constructor(editor: unknown) {
		this.editor = editor as TipTapEditor;
	}

	getEditorType(): EditorType {
		return "tiptap";
	}

	// ── Content read ──────────────────────────────────────────────────────

	getSelectedText(): string | null {
		const { state } = this.editor;
		const { from, to } = state.selection;

		if (from === to) return null;

		const text = state.doc.textBetween(from, to, " ");
		return text || null;
	}

	getContentBefore(_cursor?: Position): string {
		const { state } = this.editor;
		const { from } = state.selection;

		if (from <= 0) return "";

		return state.doc.textBetween(0, from, "\n");
	}

	getFullContent(): string {
		return this.editor.getText();
	}

	// ── Content write ─────────────────────────────────────────────────────

	insertAtCursor(text: string): void {
		this.editor.chain().focus().insertContent(text).run();
	}

	replaceSelection(text: string): void {
		const { from, to } = this.editor.state.selection;

		if (from === to) {
			this.insertAtCursor(text);
			return;
		}

		this.editor
			.chain()
			.focus()
			.deleteRange({ from, to })
			.insertContent(text)
			.run();
	}

	insertBlock(content: string, position: "before" | "after"): void {
		const { state } = this.editor;
		const { $from } = state.selection;

		// Resolve the position of the current block's start or end.
		const blockStart = $from.start($from.depth);
		const blockEnd = $from.end($from.depth);

		const insertPos = position === "before" ? blockStart : blockEnd + 1;

		this.editor
			.chain()
			.focus()
			.insertContentAt(insertPos, {
				type: "paragraph",
				content: [{ type: "text", text: content }],
			})
			.run();
	}

	// ── Streaming insertion ───────────────────────────────────────────────

	startStreamingInsert(_position?: Position): StreamHandle {
		const id = `tiptap-stream-${++streamCounter}`;
		const { state } = this.editor;
		const insertPos = state.selection.to;

		// Insert a new empty paragraph after the cursor.
		this.editor
			.chain()
			.focus()
			.insertContentAt(insertPos, {
				type: "paragraph",
				content: [{ type: "text", text: "" }],
			})
			.run();

		return {
			id,
			_internal: { insertPos },
		};
	}

	appendToStream(_handle: StreamHandle, chunk: string): void {
		// Append text at the current cursor position.
		this.editor.chain().focus().insertContent(chunk).run();
	}

	finalizeStream(_handle: StreamHandle): void {
		// Nothing to clean up — the content is already in the document.
	}

	cancelStream(_handle: StreamHandle): void {
		// Undo all changes from the streaming session.
		this.editor.chain().focus().undo().run();
	}

	// ── Slash menu ────────────────────────────────────────────────────────

	registerSlashCommands(_commands: AISlashCommand[]): void {
		// TipTap does not have a native slash menu. AI is triggered via
		// toolbar buttons or the global Cmd+I inline prompt.
		if (process.env.NODE_ENV === "development") {
			console.warn(
				"TipTapAdapter.registerSlashCommands: TipTap does not support slash menus. Use toolbar buttons or Cmd+I instead.",
			);
		}
	}

	// ── Selection observation ─────────────────────────────────────────────

	onSelectionChange(
		callback: (selection: Selection | null) => void,
	): () => void {
		const handler = () => {
			const { state } = this.editor;
			const { from, to } = state.selection;

			if (from === to) {
				callback(null);
				return;
			}

			const text = state.doc.textBetween(from, to, " ");
			if (text) {
				callback({ text, from, to });
			} else {
				callback(null);
			}
		};

		this.editor.on("selectionUpdate", handler);
		this.editor.on("transaction", handler);

		return () => {
			this.editor.off("selectionUpdate", handler);
			this.editor.off("transaction", handler);
		};
	}
}
