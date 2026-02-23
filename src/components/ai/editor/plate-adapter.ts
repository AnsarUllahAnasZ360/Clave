/**
 * Plate.js adapter for the AIEditorAdapter interface.
 *
 * Wraps Plate editor APIs for content read/write, selection, streaming,
 * and slash menu integration. Used by DocumentEditor and IssueDescriptionEditor.
 */

import { NodeApi, nanoid, PathApi } from "platejs";
import type { PlateEditor } from "platejs/react";

import type {
	AIEditorAdapter,
	AISlashCommand,
	EditorType,
	Position,
	Selection,
	StreamHandle,
} from "./AIEditorAdapter";

export class PlateAdapter implements AIEditorAdapter {
	private editor: PlateEditor;

	constructor(editor: unknown) {
		this.editor = editor as PlateEditor;
	}

	getEditorType(): EditorType {
		return "plate";
	}

	// ── Content read ──────────────────────────────────────────────────────

	private static stripTrailingSlashCommand(content: string): string {
		return content
			.replace(/\s*\/[a-z0-9_-]*$/i, "")
			.replace(/[ \t]+\n/g, "\n")
			.trimEnd();
	}

	private insertMultilineText(text: string): void {
		const lines = text.replace(/\r\n?/g, "\n").split("\n");
		for (let i = 0; i < lines.length; i++) {
			if (i > 0) {
				this.editor.tf.insertBreak();
			}
			if (lines[i]) {
				this.editor.tf.insertText(lines[i]);
			}
		}
	}

	getSelectedText(): string | null {
		const { selection } = this.editor;
		if (!selection) return null;

		// Collapsed selection (cursor, no range) → no selected text.
		if (
			selection.anchor.path.join(",") === selection.focus.path.join(",") &&
			selection.anchor.offset === selection.focus.offset
		) {
			return null;
		}

		const text = this.editor.api.string(selection);
		return text || null;
	}

	getContentBefore(_cursor?: Position): string {
		const { selection } = this.editor;
		if (!selection) return "";

		const focusPath = selection.focus.path;
		if (!focusPath || focusPath.length === 0) return "";

		// Extract text from all blocks before the cursor's top-level block index,
		// then append text before the cursor within the current block.
		const blockIndex = focusPath[0];
		const texts: string[] = [];

		for (let i = 0; i < blockIndex; i++) {
			const child = this.editor.children[i];
			if (child) {
				texts.push(NodeApi.string(child));
			}
		}

		const currentBlock = this.editor.children[blockIndex];
		if (currentBlock) {
			const blockText = NodeApi.string(currentBlock);
			const clampedOffset = Math.max(
				0,
				Math.min(selection.focus.offset, blockText.length),
			);
			const beforeCursorInBlock = blockText.slice(0, clampedOffset);
			if (beforeCursorInBlock) {
				texts.push(beforeCursorInBlock);
			}
		}

		return PlateAdapter.stripTrailingSlashCommand(texts.join("\n"));
	}

	getFullContent(): string {
		return this.editor.children
			.map((child) => NodeApi.string(child))
			.join("\n");
	}

	// ── Content write ─────────────────────────────────────────────────────

	insertAtCursor(text: string): void {
		this.insertMultilineText(text);
	}

	replaceSelection(text: string): void {
		const { selection } = this.editor;
		if (!selection) return;

		// Delete the current selection, then insert replacement text as blocks.
		this.editor.tf.deleteFragment();
		this.insertMultilineText(text);
	}

	insertBlock(content: string, position: "before" | "after"): void {
		const block = this.editor.api.block({ highest: true });
		if (!block) return;

		const [, path] = block;
		const targetPath = position === "after" ? PathApi.next(path) : [...path];

		this.editor.tf.insertNodes(
			{ type: "p", children: [{ text: content }] },
			{ at: targetPath, select: true },
		);
	}

	// ── Streaming insertion ───────────────────────────────────────────────

	startStreamingInsert(_position?: Position): StreamHandle {
		const id = nanoid();

		// Insert a placeholder paragraph after the current block.
		const block = this.editor.api.block({ highest: true });
		const targetPath = block
			? PathApi.next(block[1])
			: [this.editor.children.length];

		this.editor.tf.insertNodes(
			{
				type: "p",
				id,
				children: [{ text: "" }],
			},
			{ at: targetPath, select: true },
		);

		return {
			id,
			_internal: { path: targetPath },
		};
	}

	appendToStream(handle: StreamHandle, chunk: string): void {
		// Find the streaming block by ID and append text.
		const entries = Array.from(
			this.editor.api.nodes({
				at: [],
				match: (n) => (n as { id?: string }).id === handle.id,
			}),
		);
		const entry = entries[0];
		if (!entry) return;

		const [, path] = entry;

		// Append to the last text node in the block.
		const textPath = [...path, 0];
		const textNode = this.editor.api.node(textPath);

		if (textNode) {
			const [node] = textNode;
			const currentText =
				typeof (node as { text?: string }).text === "string"
					? (node as { text: string }).text
					: "";
			this.editor.tf.setNodes({ text: currentText + chunk }, { at: textPath });
		}
	}

	finalizeStream(handle: StreamHandle): void {
		// Remove the temporary `id` property from the streaming block
		// so it becomes a normal paragraph.
		const entries = Array.from(
			this.editor.api.nodes({
				at: [],
				match: (n) => (n as { id?: string }).id === handle.id,
			}),
		);
		const entry = entries[0];
		if (!entry) return;

		this.editor.tf.unsetNodes(["id"], { at: entry[1] });
	}

	cancelStream(handle: StreamHandle): void {
		// Remove the streaming block entirely.
		const entries = Array.from(
			this.editor.api.nodes({
				at: [],
				match: (n) => (n as { id?: string }).id === handle.id,
			}),
		);
		const entry = entries[0];
		if (!entry) return;

		this.editor.tf.removeNodes({ at: entry[1] });
	}

	// ── Slash menu ────────────────────────────────────────────────────────

	registerSlashCommands(_commands: AISlashCommand[]): void {
		// Plate's slash menu items are defined in slash-node.tsx as a static
		// array. AI items are injected by AISlashMenuItems.tsx and wired in
		// STORY-007/008 by modifying the SlashInputElement groups.
		// This method is intentionally a no-op — the integration happens
		// at the component level, not imperatively.
	}

	// ── Selection observation ─────────────────────────────────────────────

	onSelectionChange(
		callback: (selection: Selection | null) => void,
	): () => void {
		// Plate uses onChange callbacks. We listen to editor changes and
		// extract the current selection state.
		let prevSelectionKey = "";

		const handler = () => {
			const { selection } = this.editor;

			if (!selection) {
				callback(null);
				return;
			}

			const isCollapsed =
				selection.anchor.path.join(",") === selection.focus.path.join(",") &&
				selection.anchor.offset === selection.focus.offset;

			if (isCollapsed) {
				if (prevSelectionKey !== "") {
					prevSelectionKey = "";
					callback(null);
				}
				return;
			}

			const text = this.editor.api.string(selection);
			const selectionKey = `${selection.anchor.path.join(",")}-${selection.anchor.offset}-${selection.focus.path.join(",")}-${selection.focus.offset}`;

			if (selectionKey !== prevSelectionKey && text) {
				prevSelectionKey = selectionKey;
				callback({
					text,
					from: selection.anchor.offset,
					to: selection.focus.offset,
				});
			}
		};

		// Use DOM events on the editor container as Plate fires
		// 'mouseup' and 'keyup' when selections change.
		const onMouseUp = () => setTimeout(handler, 0);
		const onKeyUp = (e: KeyboardEvent) => {
			if (e.shiftKey) setTimeout(handler, 0);
		};

		document.addEventListener("mouseup", onMouseUp);
		document.addEventListener("keyup", onKeyUp);

		return () => {
			document.removeEventListener("mouseup", onMouseUp);
			document.removeEventListener("keyup", onKeyUp);
		};
	}
}
