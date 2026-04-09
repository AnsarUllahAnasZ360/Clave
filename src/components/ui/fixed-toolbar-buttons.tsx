"use client";

import {
	BaselineIcon,
	BoldIcon,
	Code2Icon,
	HighlighterIcon,
	ItalicIcon,
	PaintBucketIcon,
	SparklesIcon,
	StrikethroughIcon,
	UnderlineIcon,
} from "lucide-react";
import { KEYS } from "platejs";
import { useEditorReadOnly, useEditorRef } from "platejs/react";

import { AlignToolbarButton } from "./align-toolbar-button";
import { CommentToolbarButton } from "./comment-toolbar-button";
import { EmojiToolbarButton } from "./emoji-toolbar-button";
import { ExportToolbarButton } from "./export-toolbar-button";
import { FontColorToolbarButton } from "./font-color-toolbar-button";
import { FontSizeToolbarButton } from "./font-size-toolbar-button";
import { RedoToolbarButton, UndoToolbarButton } from "./history-toolbar-button";
import { ImportToolbarButton } from "./import-toolbar-button";
import {
	IndentToolbarButton,
	OutdentToolbarButton,
} from "./indent-toolbar-button";
import { InsertToolbarButton } from "./insert-toolbar-button";
import { LineHeightToolbarButton } from "./line-height-toolbar-button";
import { LinkToolbarButton } from "./link-toolbar-button";
import {
	BulletedListToolbarButton,
	NumberedListToolbarButton,
	TodoListToolbarButton,
} from "./list-toolbar-button";
import { MarkToolbarButton } from "./mark-toolbar-button";
import { ModeToolbarButton } from "./mode-toolbar-button";
import { MoreToolbarButton } from "./more-toolbar-button";
import { TableToolbarButton } from "./table-toolbar-button";
import { ToolbarButton, ToolbarGroup } from "./toolbar";
import { TurnIntoToolbarButton } from "./turn-into-toolbar-button";

export function FixedToolbarButtons() {
	const readOnly = useEditorReadOnly();
	const editor = useEditorRef();

	return (
		<div className="flex w-full flex-nowrap">
			{!readOnly && (
				<>
					{/* Group 1 — History + Block */}
					<ToolbarGroup>
						<UndoToolbarButton />
						<RedoToolbarButton />
						<TurnIntoToolbarButton />
					</ToolbarGroup>

					{/* Group 2 — Text Marks */}
					<ToolbarGroup>
						<MarkToolbarButton nodeType={KEYS.bold} tooltip="Bold (⌘+B)">
							<BoldIcon />
						</MarkToolbarButton>

						<MarkToolbarButton nodeType={KEYS.italic} tooltip="Italic (⌘+I)">
							<ItalicIcon />
						</MarkToolbarButton>

						<MarkToolbarButton
							nodeType={KEYS.underline}
							tooltip="Underline (⌘+U)"
						>
							<UnderlineIcon />
						</MarkToolbarButton>

						<MarkToolbarButton
							nodeType={KEYS.strikethrough}
							tooltip="Strikethrough (⌘+⇧+M)"
						>
							<StrikethroughIcon />
						</MarkToolbarButton>

						<MarkToolbarButton nodeType={KEYS.code} tooltip="Code (⌘+E)">
							<Code2Icon />
						</MarkToolbarButton>
					</ToolbarGroup>

					{/* Group 3 — Color */}
					<ToolbarGroup>
						<FontColorToolbarButton nodeType={KEYS.color} tooltip="Text color">
							<BaselineIcon />
						</FontColorToolbarButton>

						<FontColorToolbarButton
							nodeType={KEYS.backgroundColor}
							tooltip="Background color"
						>
							<PaintBucketIcon />
						</FontColorToolbarButton>

						<MarkToolbarButton nodeType={KEYS.highlight} tooltip="Highlight">
							<HighlighterIcon />
						</MarkToolbarButton>

						<FontSizeToolbarButton />
					</ToolbarGroup>

					{/* Group 4 — Lists + Indent */}
					<ToolbarGroup>
						<BulletedListToolbarButton />
						<NumberedListToolbarButton />
						<TodoListToolbarButton />
						<OutdentToolbarButton />
						<IndentToolbarButton />
						<AlignToolbarButton />
						<LineHeightToolbarButton />
					</ToolbarGroup>

					{/* Group 5 — Insert */}
					<ToolbarGroup>
						<ToolbarButton
							tooltip="Commands (type /)"
							onClick={() => {
								editor.tf.focus();
								editor.tf.insertText("/");
							}}
						>
							<SparklesIcon />
						</ToolbarButton>
						<LinkToolbarButton />
						<TableToolbarButton />
						<EmojiToolbarButton />
						<InsertToolbarButton />
					</ToolbarGroup>

					{/* Group 6 — More */}
					<ToolbarGroup>
						<MoreToolbarButton />
					</ToolbarGroup>

					{/* Group 7 — Import / Export */}
					<ToolbarGroup>
						<ImportToolbarButton />
						<ExportToolbarButton />
					</ToolbarGroup>
				</>
			)}

			<div className="grow" />

			{/* Group 8 — Right */}
			<ToolbarGroup>
				<CommentToolbarButton />
				<ModeToolbarButton />
			</ToolbarGroup>
		</div>
	);
}
