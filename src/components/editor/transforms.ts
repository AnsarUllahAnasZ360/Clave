"use client";

import { insertCallout } from "@platejs/callout";
import { insertCodeBlock, toggleCodeBlock } from "@platejs/code-block";
import { insertCodeDrawing } from "@platejs/code-drawing";
import { insertDate } from "@platejs/date";
import { insertExcalidraw } from "@platejs/excalidraw";
import { insertColumnGroup, toggleColumnGroup } from "@platejs/layout";
import { triggerFloatingLink } from "@platejs/link/react";
import { insertEquation, insertInlineEquation } from "@platejs/math";
import {
	insertAudioPlaceholder,
	insertFilePlaceholder,
	insertImagePlaceholder,
	insertVideoPlaceholder,
} from "@platejs/media";
import { SuggestionPlugin } from "@platejs/suggestion/react";
import { TablePlugin } from "@platejs/table/react";
import { insertToc } from "@platejs/toc";
import {
	KEYS,
	type NodeEntry,
	type Path,
	PathApi,
	type TElement,
} from "platejs";
import type { PlateEditor } from "platejs/react";

const ACTION_TWO_COLUMNS = "action_two_columns";
const ACTION_THREE_COLUMNS = "action_three_columns";

const insertList = (editor: PlateEditor, type: string) => {
	editor.tf.insertNodes(
		editor.api.create.block({
			indent: 1,
			listStyleType: type,
		}),
		{ select: true },
	);
};

const insertBlockMap: Record<
	string,
	(editor: PlateEditor, type: string) => void
> = {
	[KEYS.listTodo]: insertList,
	[KEYS.ol]: insertList,
	[KEYS.ul]: insertList,
	[ACTION_TWO_COLUMNS]: (editor) =>
		insertColumnGroup(editor, { columns: 2, select: true }),
	[ACTION_THREE_COLUMNS]: (editor) =>
		insertColumnGroup(editor, { columns: 3, select: true }),
	[KEYS.audio]: (editor) => insertAudioPlaceholder(editor, { select: true }),
	[KEYS.callout]: (editor) => insertCallout(editor, { select: true }),
	[KEYS.codeBlock]: (editor) => insertCodeBlock(editor, { select: true }),
	code_drawing: (editor) => insertCodeDrawing(editor, {}, { select: true }),
	[KEYS.equation]: (editor) => insertEquation(editor, { select: true }),
	[KEYS.excalidraw]: (editor) => insertExcalidraw(editor, {}, { select: true }),
	[KEYS.file]: (editor) => insertFilePlaceholder(editor, { select: true }),
	[KEYS.img]: (editor) => insertImagePlaceholder(editor, { select: true }),
	[KEYS.mediaEmbed]: () => {
		window.dispatchEvent(new CustomEvent("plate:open-embed-url-dialog"));
	},
	[KEYS.table]: (editor) =>
		editor.getTransforms(TablePlugin).insert.table({}, { select: true }),
	[KEYS.toc]: (editor) => insertToc(editor, { select: true }),
	[KEYS.toggle]: (editor) => {
		editor.tf.insertNodes(
			{
				type: KEYS.toggle,
				children: [{ type: "p", children: [{ text: "" }] }],
			},
			{ select: true },
		);
	},
	[KEYS.video]: (editor) => insertVideoPlaceholder(editor, { select: true }),
};

const insertInlineMap: Record<
	string,
	(editor: PlateEditor, type: string) => void
> = {
	[KEYS.date]: (editor) => insertDate(editor, { select: true }),
	[KEYS.inlineEquation]: (editor) =>
		insertInlineEquation(editor, "", { select: true }),
	[KEYS.link]: (editor) => triggerFloatingLink(editor, { focused: true }),
};

type InsertBlockOptions = {
	upsert?: boolean;
};

export const insertBlock = (
	editor: PlateEditor,
	type: string,
	options: InsertBlockOptions = {},
) => {
	const { upsert = false } = options;

	editor.tf.withoutNormalizing(() => {
		let block = editor.api.block();
		if (!block) {
			editor.tf.focus();
			block = editor.api.block();
		}

		if (!block) return;

		const [currentNode, path] = block;
		const isCurrentBlockEmpty = editor.api.isEmpty(currentNode);
		const currentBlockType = getBlockType(currentNode);

		const isSameBlockType = type === currentBlockType;

		if (upsert && isCurrentBlockEmpty && isSameBlockType) {
			return;
		}

		if (type in insertBlockMap) {
			insertBlockMap[type](editor, type);
		} else {
			editor.tf.insertNodes(editor.api.create.block({ type }), {
				at: PathApi.next(path),
				select: true,
			});
		}

		if (!isSameBlockType) {
			const suggestionApi = editor.getApi(SuggestionPlugin)?.suggestion;
			if (suggestionApi?.withoutSuggestions) {
				suggestionApi.withoutSuggestions(() => {
					editor.tf.removeNodes({ previousEmptyBlock: true });
				});
			} else {
				editor.tf.removeNodes({ previousEmptyBlock: true });
			}
		}
	});
};

export const insertInlineElement = (editor: PlateEditor, type: string) => {
	if (insertInlineMap[type]) {
		insertInlineMap[type](editor, type);
	}
};

const setList = (
	editor: PlateEditor,
	type: string,
	entry: NodeEntry<TElement>,
) => {
	editor.tf.setNodes(
		editor.api.create.block({
			indent: 1,
			listStyleType: type,
		}),
		{
			at: entry[1],
		},
	);
};

const setBlockMap: Record<
	string,
	(editor: PlateEditor, type: string, entry: NodeEntry<TElement>) => void
> = {
	[KEYS.listTodo]: setList,
	[KEYS.ol]: setList,
	[KEYS.ul]: setList,
	[ACTION_TWO_COLUMNS]: (editor) => toggleColumnGroup(editor, { columns: 2 }),
	[ACTION_THREE_COLUMNS]: (editor) => toggleColumnGroup(editor, { columns: 3 }),
	[KEYS.codeBlock]: (editor) => toggleCodeBlock(editor),
};

export const setBlockType = (
	editor: PlateEditor,
	type: string,
	{ at }: { at?: Path } = {},
) => {
	editor.tf.withoutNormalizing(() => {
		const setEntry = (entry: NodeEntry<TElement>) => {
			const [node, path] = entry;

			if (node[KEYS.listType]) {
				editor.tf.unsetNodes([KEYS.listType, "indent"], { at: path });
			}
			if (type in setBlockMap) {
				return setBlockMap[type](editor, type, entry);
			}
			if (node.type !== type) {
				editor.tf.setNodes({ type }, { at: path });
			}
		};

		if (at) {
			const entry = editor.api.node<TElement>(at);

			if (entry) {
				setEntry(entry);

				return;
			}
		}

		const entries = editor.selection
			? editor.api.blocks({ at: editor.selection, mode: "lowest" })
			: [];

		if (entries.length > 0) {
			entries.forEach((entry) => {
				setEntry(entry);
			});
			return;
		}

		// Selection can be lost while interacting with toolbar menus.
		// In that case, only mutate the currently resolved block.
		const currentBlock = editor.api.block();
		if (currentBlock) {
			setEntry(currentBlock as NodeEntry<TElement>);
		}
	});
};

export const getBlockType = (block: TElement) => {
	if (block[KEYS.listType]) {
		if (block[KEYS.listType] === KEYS.ol) {
			return KEYS.ol;
		}
		if (block[KEYS.listType] === KEYS.listTodo) {
			return KEYS.listTodo;
		}
		return KEYS.ul;
	}

	return block.type;
};
