/**
 * Plate.js adapter for the AIEditorAdapter interface.
 *
 * Wraps Plate editor APIs for content read/write, selection, streaming,
 * and slash menu integration. Used by DocumentEditor and IssueDescriptionEditor.
 */

import { NodeApi, nanoid, PathApi } from "platejs";
import type { PlateEditor } from "platejs/react";

import { markdownToSlate } from "@/lib/content-converters";
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

	private insertMarkdown(text: string): boolean {
		try {
			const nodes = markdownToSlate(text);
			if (!nodes || nodes.length === 0) return false;
			// Insert parsed blocks/inline nodes at the current selection.
			// Plate will normalize placement depending on selection context.
			// biome-ignore lint/suspicious/noExplicitAny: Slate node shapes are flexible
			this.editor.tf.insertNodes(nodes as any, { select: true });
			return true;
		} catch (error) {
			// Log parsing errors but don't completely fail
			console.warn(
				"Markdown parsing failed, falling back to plain text:",
				error,
			);
			return false;
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

	getCurrentBlockType(): string | null {
		const { selection } = this.editor;
		if (!selection) return null;

		const blockPath = selection.focus.path[0];
		if (typeof blockPath !== "number") return null;

		const block = this.editor.children[blockPath];
		if (!block || typeof block !== "object" || !("type" in block)) return null;

		return (block.type as string) || "paragraph";
	}

	getSurroundingContext(
		beforeChars: number = 3000,
		afterChars: number = 500,
	): { before: string; after: string; blockType: string | null } {
		const { selection } = this.editor;
		if (!selection) {
			return {
				before: "",
				after: "",
				blockType: null,
			};
		}

		const blockIndex = selection.focus.path[0];
		if (typeof blockIndex !== "number") {
			return {
				before: "",
				after: "",
				blockType: null,
			};
		}

		// Get content before cursor
		const before = this.getContentBefore();
		const clampedBefore =
			before.length > beforeChars ? before.slice(-beforeChars) : before;

		// Get content after cursor
		const afterTexts: string[] = [];
		let charCount = 0;

		for (let i = blockIndex + 1; i < this.editor.children.length; i++) {
			const child = this.editor.children[i];
			if (!child) continue;

			const childText = NodeApi.string(child);
			if (charCount + childText.length > afterChars) {
				afterTexts.push(childText.slice(0, afterChars - charCount));
				break;
			}

			afterTexts.push(childText);
			charCount += childText.length;
		}

		const after = afterTexts.join("\n");
		const blockType = this.getCurrentBlockType();

		return {
			before: clampedBefore,
			after,
			blockType,
		};
	}

	// ── Content write ─────────────────────────────────────────────────────

	insertAtCursor(text: string): void {
		if (this.insertMarkdown(text)) return;
		this.insertMultilineText(text);
	}

	replaceSelection(text: string): void {
		const { selection } = this.editor;
		if (!selection) return;

		this.editor.tf.deleteFragment();
		if (this.insertMarkdown(text)) return;
		this.insertMultilineText(text);
	}

	insertBlock(content: string, position: "before" | "after"): void {
		const block = this.editor.api.block({ highest: true });

		// Determine target path: after current block, or at end of document
		// biome-ignore lint/suspicious/noExplicitAny: Slate path types are flexible
		let targetPath: any;
		if (block) {
			const [, path] = block;
			targetPath = position === "after" ? PathApi.next(path) : [...path];
		} else {
			// Fallback: insert at end of document
			console.warn(
				"[insertBlock] No current block found, inserting at end of document",
			);
			targetPath = [this.editor.children.length];
		}

		// Validate and fix malformed numbered list syntax before processing
		// This catches issues like "all1" instead of "1. "
		let correctedContent = content;
		const malformedListMatch = content.match(/^(all|text)(\d+)/gm);
		if (malformedListMatch) {
			console.warn(
				"[insertBlock] Detected malformed list syntax, attempting correction:",
				malformedListMatch,
			);
			// Try to fix "all1" → "1. ", "text2" → "2. ", etc.
			correctedContent = content
				.split("\n")
				.map((line) => {
					// Match patterns like "all1", "all2", "text1", etc.
					const match = line.match(/^(all|text|list)(\d+)\s*(.*)/i);
					if (match) {
						const [, , num, rest] = match;
						console.log(
							`[insertBlock] Fixing malformed list: "${line}" → "${num}. ${rest}"`,
						);
						return `${num}. ${rest}`;
					}
					return line;
				})
				.join("\n");
		}

		// ALWAYS try to parse markdown first for rich formatting (tables, code, lists, etc.)
		// Even if content looks like plain text, it might contain markdown
		try {
			const nodes = markdownToSlate(correctedContent);
			if (nodes && nodes.length > 0) {
				console.debug(
					`[insertBlock] Successfully parsed markdown (${nodes.length} nodes):`,
					nodes.map((n) =>
						typeof n === "object" && "type" in n ? (n as any).type : typeof n,
					),
				);
				try {
					// biome-ignore lint/suspicious/noExplicitAny: Slate node shapes are flexible
					this.editor.tf.insertNodes(nodes as any, {
						at: targetPath,
						select: true,
					});
					console.log("[insertBlock] Markdown nodes inserted successfully");
					return;
				} catch (insertErr) {
					console.warn(
						"[insertBlock] Failed to insert markdown at targetPath, trying at document end:",
						insertErr instanceof Error ? insertErr.message : insertErr,
					);
					try {
						// biome-ignore lint/suspicious/noExplicitAny: Slate node shapes are flexible
						this.editor.tf.insertNodes(nodes as any, {
							at: [this.editor.children.length],
							select: true,
						});
						console.log("[insertBlock] Markdown inserted at document end");
						return;
					} catch (endErr) {
						console.error(
							"[insertBlock] Failed to insert markdown at document end:",
							endErr,
						);
					}
				}
			} else {
				console.warn(
					"[insertBlock] Markdown parsing returned empty nodes, using plain text fallback",
				);
			}
		} catch (error) {
			console.error(
				"[insertBlock] Markdown parsing failed, falling back to plain text:",
				error instanceof Error ? error.message : error,
			);
		}

		// Fallback: insert as plain text
		// Split into paragraphs if content has line breaks
		const lines = correctedContent
			.split("\n")
			.filter((line) => line.trim().length > 0);

		if (lines.length === 0) {
			console.warn(
				"[insertBlock] No content to insert (empty after filtering)",
			);
			return;
		}

		const nodes = lines.map((line) => ({
			type: "p",
			children: [{ text: line }],
		}));

		console.debug(
			`[insertBlock] Inserting ${lines.length} paragraphs as plain text fallback`,
		);
		try {
			// biome-ignore lint/suspicious/noExplicitAny: Slate node shapes are flexible
			this.editor.tf.insertNodes(nodes as any, {
				at: targetPath,
				select: true,
			});
			console.log(
				"[insertBlock] Plain text inserted successfully at targetPath",
			);
		} catch (insertErr) {
			console.warn(
				"[insertBlock] Failed to insert plain text at targetPath, trying at document end:",
				insertErr instanceof Error ? insertErr.message : insertErr,
			);
			try {
				// biome-ignore lint/suspicious/noExplicitAny: Slate node shapes are flexible
				this.editor.tf.insertNodes(nodes as any, {
					at: [this.editor.children.length],
					select: true,
				});
				console.log("[insertBlock] Plain text inserted at document end");
			} catch (endErr) {
				console.error(
					"[insertBlock] Failed to insert plain text at document end:",
					endErr instanceof Error ? endErr.message : endErr,
				);
			}
		}
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
