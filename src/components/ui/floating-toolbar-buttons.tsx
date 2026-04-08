"use client";

import {
	BoldIcon,
	Code2Icon,
	ItalicIcon,
	SquareCheckBigIcon,
	StrikethroughIcon,
	UnderlineIcon,
} from "lucide-react";
import { KEYS } from "platejs";
import { useEditorReadOnly, useEditorRef } from "platejs/react";

import { useIssueCreateOptional } from "@/components/issues/IssueCreateContext";
import { CommentToolbarButton } from "./comment-toolbar-button";
import { InlineEquationToolbarButton } from "./equation-toolbar-button";
import { LinkToolbarButton } from "./link-toolbar-button";
import { MarkToolbarButton } from "./mark-toolbar-button";
import { MoreToolbarButton } from "./more-toolbar-button";
import { SuggestionToolbarButton } from "./suggestion-toolbar-button";
import { ToolbarButton, ToolbarGroup } from "./toolbar";
import { TurnIntoToolbarButton } from "./turn-into-toolbar-button";

export function FloatingToolbarButtons() {
	const readOnly = useEditorReadOnly();
	const editor = useEditorRef();
	const ctx = useIssueCreateOptional();

	return (
		<>
			{!readOnly && (
				<>
					{/* Block type conversion */}
					<ToolbarGroup>
						<TurnIntoToolbarButton />
					</ToolbarGroup>

					{/* Text formatting marks */}
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

					{/* Inline insertions */}
					<ToolbarGroup>
						<InlineEquationToolbarButton />
						<LinkToolbarButton />
					</ToolbarGroup>

					{/* Quick task creation */}
					{ctx && (
						<ToolbarGroup>
							<ToolbarButton
								tooltip="Create task from selection"
								onClick={() => {
									const text = editor.api.string(editor.selection);
									if (!text?.trim()) return;
									ctx.openFullCreate({ source: "document" });
									ctx.updateForm({ title: text.trim() });
								}}
							>
								<SquareCheckBigIcon />
							</ToolbarButton>
						</ToolbarGroup>
					)}
				</>
			)}

			{/* Collaboration */}
			<ToolbarGroup>
				<CommentToolbarButton />
				<SuggestionToolbarButton />
			</ToolbarGroup>

			{/* Additional options */}
			{!readOnly && (
				<ToolbarGroup>
					<MoreToolbarButton />
				</ToolbarGroup>
			)}
		</>
	);
}
