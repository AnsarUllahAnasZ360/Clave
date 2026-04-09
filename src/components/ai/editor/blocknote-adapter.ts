/**
 * BlockNote adapter stub.
 *
 * BlockNote is not used in the current codebase (all editors have
 * migrated to Plate.js). This stub exists for forward-compatibility
 * if BlockNote is ever reintroduced.
 */

import type {
	AIEditorAdapter,
	AISlashCommand,
	EditorType,
	Position,
	Selection,
	StreamHandle,
} from "./AIEditorAdapter";

const NOT_IMPLEMENTED =
	"BlockNoteAdapter: BlockNote is not used in the current codebase. Use PlateAdapter or TipTapAdapter instead.";

export class BlockNoteAdapter implements AIEditorAdapter {
	constructor(_editor: unknown) {
		throw new Error(NOT_IMPLEMENTED);
	}

	getEditorType(): EditorType {
		throw new Error(NOT_IMPLEMENTED);
	}

	getSelectedText(): string | null {
		throw new Error(NOT_IMPLEMENTED);
	}

	getContentBefore(_cursor?: Position): string {
		throw new Error(NOT_IMPLEMENTED);
	}

	getFullContent(): string {
		throw new Error(NOT_IMPLEMENTED);
	}

	getCurrentBlockType(): string | null {
		throw new Error(NOT_IMPLEMENTED);
	}

	getSurroundingContext(): {
		before: string;
		after: string;
		blockType: string | null;
	} {
		throw new Error(NOT_IMPLEMENTED);
	}

	insertAtCursor(_text: string): void {
		throw new Error(NOT_IMPLEMENTED);
	}

	replaceSelection(_text: string): void {
		throw new Error(NOT_IMPLEMENTED);
	}

	insertBlock(_content: string, _position: "before" | "after"): void {
		throw new Error(NOT_IMPLEMENTED);
	}

	startStreamingInsert(_position?: Position): StreamHandle {
		throw new Error(NOT_IMPLEMENTED);
	}

	appendToStream(_handle: StreamHandle, _chunk: string): void {
		throw new Error(NOT_IMPLEMENTED);
	}

	finalizeStream(_handle: StreamHandle): void {
		throw new Error(NOT_IMPLEMENTED);
	}

	cancelStream(_handle: StreamHandle): void {
		throw new Error(NOT_IMPLEMENTED);
	}

	registerSlashCommands(_commands: AISlashCommand[]): void {
		throw new Error(NOT_IMPLEMENTED);
	}

	onSelectionChange(
		_callback: (selection: Selection | null) => void,
	): () => void {
		throw new Error(NOT_IMPLEMENTED);
	}
}
