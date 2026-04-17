"use client";

import {
	AtSignIcon,
	CalendarIcon,
	ChevronRightIcon,
	ClipboardListIcon,
	Code2,
	Columns3Icon,
	Film,
	Heading1Icon,
	Heading2Icon,
	Heading3Icon,
	ImageIcon,
	LightbulbIcon,
	LinkIcon,
	ListIcon,
	ListOrdered,
	MicIcon,
	PenToolIcon,
	PilcrowIcon,
	Quote,
	RadicalIcon,
	Square,
	Table,
	TableOfContentsIcon,
} from "lucide-react";
import { KEYS, type TComboboxInputElement } from "platejs";
import type { PlateEditor, PlateElementProps } from "platejs/react";
import { PlateElement } from "platejs/react";
import type * as React from "react";

import {
	insertBlock,
	insertInlineElement,
} from "@/components/editor/transforms";

import {
	InlineCombobox,
	InlineComboboxContent,
	InlineComboboxEmpty,
	InlineComboboxGroup,
	InlineComboboxGroupLabel,
	InlineComboboxInput,
	InlineComboboxItem,
} from "./inline-combobox";

type Group = {
	group: string;
	items: {
		icon: React.ReactNode;
		value: string;
		onSelect: (editor: PlateEditor, value: string) => void;
		className?: string;
		focusEditor?: boolean;
		keywords?: string[];
		label?: string;
	}[];
};

function getEditorRuntimeId(editor: PlateEditor): string | undefined {
	if (editor.id === null || editor.id === undefined) return undefined;
	return String(editor.id);
}

const groups: Group[] = [
	{
		group: "AI",
		items: [
			{
				icon: <MicIcon />,
				keywords: ["dictate", "voice", "speech", "audio", "transcribe"],
				label: "AI: Dictate with voice",
				value: "ai_dictate",
				onSelect: (editor) => {
					// Keep dictation start/stop scoped to the invoking editor.
					requestAnimationFrame(() => {
						window.dispatchEvent(
							new CustomEvent("clave:dictation-toggle", {
								detail: {
									source: "slash-command",
									surface: "document",
									editorId: getEditorRuntimeId(editor),
								},
							}),
						);
					});
				},
			},
			{
				icon: <ClipboardListIcon />,
				keywords: ["clipboard", "dictation", "history", "recordings"],
				label: "AI: Dictation clipboard",
				value: "ai_clipboard",
				onSelect: () => {
					requestAnimationFrame(() => {
						window.dispatchEvent(
							new CustomEvent("clave:open-dictation-clipboard"),
						);
					});
				},
			},
		],
	},
	{
		group: "Basic blocks",
		items: [
			{
				icon: <PilcrowIcon />,
				keywords: ["paragraph"],
				label: "Text",
				value: KEYS.p,
			},
			{
				icon: <Heading1Icon />,
				keywords: ["title", "h1"],
				label: "Heading 1",
				value: KEYS.h1,
			},
			{
				icon: <Heading2Icon />,
				keywords: ["subtitle", "h2"],
				label: "Heading 2",
				value: KEYS.h2,
			},
			{
				icon: <Heading3Icon />,
				keywords: ["subtitle", "h3"],
				label: "Heading 3",
				value: KEYS.h3,
			},
			{
				icon: <ListIcon />,
				keywords: ["unordered", "ul", "-"],
				label: "Bulleted list",
				value: KEYS.ul,
			},
			{
				icon: <ListOrdered />,
				keywords: ["ordered", "ol", "1"],
				label: "Numbered list",
				value: KEYS.ol,
			},
			{
				icon: <Square />,
				keywords: ["checklist", "task", "checkbox", "[]"],
				label: "To-do list",
				value: KEYS.listTodo,
			},
			{
				icon: <ChevronRightIcon />,
				keywords: ["collapsible", "expandable"],
				label: "Toggle",
				value: KEYS.toggle,
			},
			{
				icon: <Code2 />,
				keywords: ["```"],
				label: "Code Block",
				value: KEYS.codeBlock,
			},
			{
				icon: <Table />,
				label: "Table",
				value: KEYS.table,
			},
			{
				icon: <Quote />,
				keywords: ["citation", "blockquote", "quote", ">"],
				label: "Blockquote",
				value: KEYS.blockquote,
			},
			{
				description: "Insert a highlighted block.",
				icon: <LightbulbIcon />,
				keywords: ["note"],
				label: "Callout",
				value: KEYS.callout,
			},
		].map((item) => ({
			...item,
			onSelect: (editor, value) => {
				insertBlock(editor, value, { upsert: true });
			},
		})),
	},
	{
		group: "Media",
		items: [
			{
				icon: <ImageIcon />,
				keywords: ["image", "photo", "picture", "upload"],
				label: "Image",
				value: KEYS.img,
				onSelect: (editor, value) => {
					editor.tf.focus();
					requestAnimationFrame(() => {
						insertBlock(editor, value);
					});
				},
			},
			{
				icon: <Film />,
				keywords: ["video", "mp4", "upload", "movie", "clip"],
				label: "Video",
				value: KEYS.video,
				onSelect: (editor, value) => {
					editor.tf.focus();
					requestAnimationFrame(() => {
						insertBlock(editor, value);
					});
				},
			},
			{
				icon: <LinkIcon />,
				keywords: ["embed", "youtube", "vimeo", "video embed", "url", "link"],
				label: "Video Embed",
				value: KEYS.mediaEmbed,
				onSelect: (editor, value) => {
					editor.tf.focus();
					requestAnimationFrame(() => {
						insertBlock(editor, value);
					});
				},
			},
			{
				icon: <ImageIcon />,
				keywords: ["gif", "giphy", "animated"],
				label: "GIF",
				value: "gif",
				onSelect: () => {
					window.dispatchEvent(new CustomEvent("plate:open-gif-picker"));
				},
			},
		],
	},
	{
		group: "Advanced blocks",
		items: [
			{
				icon: <TableOfContentsIcon />,
				keywords: ["toc"],
				label: "Table of contents",
				value: KEYS.toc,
			},
			{
				icon: <Columns3Icon />,
				keywords: ["columns", "two", "side by side"],
				label: "2 columns",
				value: "action_two_columns",
			},
			{
				icon: <Columns3Icon />,
				keywords: ["columns", "three"],
				label: "3 columns",
				value: "action_three_columns",
			},
			{
				focusEditor: false,
				icon: <RadicalIcon />,
				label: "Equation",
				value: KEYS.equation,
			},
			{
				icon: <PenToolIcon />,
				keywords: ["excalidraw"],
				label: "Excalidraw",
				value: KEYS.excalidraw,
			},
			{
				icon: <Code2 />,
				keywords: [
					"code-drawing",
					"diagram",
					"plantuml",
					"graphviz",
					"flowchart",
					"mermaid",
				],
				label: "Code Drawing",
				value: "code_drawing",
			},
		].map((item) => ({
			...item,
			onSelect: (editor, value) => {
				insertBlock(editor, value, { upsert: true });
			},
		})),
	},
	{
		group: "Inline",
		items: [
			{
				focusEditor: true,
				icon: <AtSignIcon />,
				keywords: ["mention", "user", "person", "member"],
				label: "Mention",
				value: KEYS.mention,
				onSelect: (editor) => {
					editor.tf.insertNodes({
						type: KEYS.mentionInput,
						trigger: "@",
						children: [{ text: "" }],
					});
				},
			},
			{
				focusEditor: true,
				icon: <CalendarIcon />,
				keywords: ["time"],
				label: "Date",
				value: KEYS.date,
				onSelect: (editor, value) => {
					insertInlineElement(editor, value);
				},
			},
			{
				focusEditor: false,
				icon: <RadicalIcon />,
				label: "Inline Equation",
				value: KEYS.inlineEquation,
				onSelect: (editor, value) => {
					insertInlineElement(editor, value);
				},
			},
		],
	},
];

/** Filter slash menu groups to only show items whose required plugins are registered. */
function getFilteredGroups(editor: PlateEditor): Group[] {
	const has = (key: string) => key in editor.plugins;
	return groups
		.map((group) => ({
			...group,
			items: group.items.filter((item) => {
				switch (item.value) {
					case "ai_dictate":
					case "ai_clipboard":
						return has("ai-editor");
					case KEYS.toc:
						return has("toc");
					case KEYS.toggle:
						return has("toggle");
					case KEYS.excalidraw:
						return has("excalidraw");
					case "code_drawing":
						return has("code_drawing");
					case KEYS.equation:
					case KEYS.inlineEquation:
						return has("equation");
					case KEYS.date:
						return has("date");
					case "action_two_columns":
					case "action_three_columns":
						return has("column");
					case "gif":
						return has("yjs");
					default:
						return true;
				}
			}),
		}))
		.filter((group) => group.items.length > 0);
}

export function SlashInputElement(
	props: PlateElementProps<TComboboxInputElement>,
) {
	const { editor, element } = props;
	const filteredGroups = getFilteredGroups(editor);

	return (
		<PlateElement {...props} as="span">
			<InlineCombobox element={element} trigger="/">
				<InlineComboboxInput />

				<InlineComboboxContent>
					<InlineComboboxEmpty>No results</InlineComboboxEmpty>

					{filteredGroups.map(({ group, items }) => (
						<InlineComboboxGroup key={group}>
							<InlineComboboxGroupLabel>{group}</InlineComboboxGroupLabel>

							{items.map(
								({ focusEditor, icon, keywords, label, value, onSelect }) => (
									<InlineComboboxItem
										key={value}
										value={value}
										onClick={() => onSelect(editor, value)}
										label={label}
										focusEditor={focusEditor}
										group={group}
										keywords={keywords}
									>
										<div className="mr-2 text-muted-foreground">{icon}</div>
										{label ?? value}
									</InlineComboboxItem>
								),
							)}
						</InlineComboboxGroup>
					))}
				</InlineComboboxContent>
			</InlineCombobox>

			{props.children}
		</PlateElement>
	);
}
