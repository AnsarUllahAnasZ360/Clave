"use client";

import { TrailingBlockPlugin } from "platejs";

import { AlignKit } from "./plugins/align-kit";
import { AutoformatKit } from "./plugins/autoformat-kit";
import { BasicBlocksKit } from "./plugins/basic-blocks-kit";
import { BasicMarksKit } from "./plugins/basic-marks-kit";
import { BlockMenuKit } from "./plugins/block-menu-kit";
import { BlockPlaceholderKit } from "./plugins/block-placeholder-kit";
import { BlockSelectionKit } from "./plugins/block-selection-kit";
import { CalloutKit } from "./plugins/callout-kit";
import { CodeBlockKit } from "./plugins/code-block-kit";
import { CodeDrawingKit } from "./plugins/code-drawing-kit";
import { ColumnKit } from "./plugins/column-kit";
import { CommentKit } from "./plugins/comment-kit";
import { CursorOverlayKit } from "./plugins/cursor-overlay-kit";
import { DateKit } from "./plugins/date-kit";
import { DiscussionKit } from "./plugins/discussion-kit";
import { DndKit } from "./plugins/dnd-kit";
import { DocxKit } from "./plugins/docx-kit";
import { EmojiKit } from "./plugins/emoji-kit";
import { ExcalidrawKit } from "./plugins/excalidraw-kit";
import { ExitBreakKit } from "./plugins/exit-break-kit";
import { FloatingToolbarKit } from "./plugins/floating-toolbar-kit";
import { FontKit } from "./plugins/font-kit";
import { LineHeightKit } from "./plugins/line-height-kit";
import { LinkKit } from "./plugins/link-kit";
import { ListKit } from "./plugins/list-kit";
import { MarkdownKit } from "./plugins/markdown-kit";
import { MathKit } from "./plugins/math-kit";
import { MediaKit } from "./plugins/media-kit";
import { MentionKit } from "./plugins/mention-kit";
import { SimpleFloatingToolbarKit } from "./plugins/simple-floating-toolbar-kit";
import { SlashKit } from "./plugins/slash-kit";
import { SuggestionKit } from "./plugins/suggestion-kit";
import { TableKit } from "./plugins/table-kit";
import { TocKit } from "./plugins/toc-kit";
import { ToggleKit } from "./plugins/toggle-kit";

/**
 * Full plugin set for the collaborative document editor.
 * Includes all block/mark plugins, toolbars, DnD, autoformat,
 * block-menu, block-selection, collaboration, and media.
 */
export function createBasePlugins() {
	return [
		// Block menu (must be early for context menu registration)
		...BlockMenuKit,

		// Elements
		...BasicBlocksKit,
		...CodeBlockKit,
		...CodeDrawingKit,
		...TableKit,
		...ToggleKit,
		...TocKit,
		...MediaKit,
		...CalloutKit,
		...ColumnKit,
		...MathKit,
		...ExcalidrawKit,
		...DateKit,
		...LinkKit,
		...MentionKit,

		// Marks
		...BasicMarksKit,
		...FontKit,

		// Block Style
		...ListKit,
		...AlignKit,
		...LineHeightKit,

		// Collaboration
		...DiscussionKit,
		...CommentKit,
		...SuggestionKit,

		// Editing
		...SlashKit,
		...AutoformatKit,
		...CursorOverlayKit,
		...DndKit,
		...EmojiKit,
		...ExitBreakKit,
		TrailingBlockPlugin,

		// Parsers
		...DocxKit,
		...MarkdownKit,

		// UI
		...BlockPlaceholderKit,
		...BlockSelectionKit,
		...FloatingToolbarKit,
	];
}

/**
 * Lightweight plugin set for simple standalone editors (issues, projects).
 * No toolbars, DnD, block-menu, block-selection, or collaboration features.
 */
export function createSimplePlugins() {
	return [
		// Elements
		...BasicBlocksKit,
		...CodeBlockKit,
		...TableKit,
		...MediaKit,
		...LinkKit,
		...CalloutKit,
		...MentionKit,

		// Marks
		...BasicMarksKit,

		// Block Style
		...ListKit,

		// Editing
		...SlashKit,
		...AutoformatKit,
		...EmojiKit,
		...ExitBreakKit,
		TrailingBlockPlugin,

		// Parsers
		...MarkdownKit,

		// UI
		...BlockPlaceholderKit,
		...SimpleFloatingToolbarKit,
	];
}
