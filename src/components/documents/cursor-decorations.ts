import { Extension } from "@tiptap/core";
import type { Node as PmNode } from "@tiptap/pm/model";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import type { ActiveUser } from "@/hooks/use-document-presence";

export const cursorPluginKey = new PluginKey("collaborationCursors");

function buildDecorations(doc: PmNode, cursors: ActiveUser[]): DecorationSet {
	const decorations: Decoration[] = [];
	const maxPos = doc.content.size;

	for (const cursor of cursors) {
		const { cursorFrom, cursorTo, name, color } = cursor;

		// Clamp positions to valid document range
		const from = Math.min(Math.max(0, cursorFrom), maxPos);
		const to = Math.min(Math.max(0, cursorTo), maxPos);

		// Cursor caret widget at the from position
		decorations.push(
			Decoration.widget(
				from,
				() => {
					const wrapper = document.createElement("span");
					wrapper.className = "collab-cursor";
					wrapper.style.setProperty("--cursor-color", color);

					const label = document.createElement("span");
					label.className = "collab-cursor-label";
					label.style.backgroundColor = color;
					label.textContent = name;
					wrapper.appendChild(label);

					return wrapper;
				},
				{
					side: 1,
					key: `cursor-${cursor.userId}`,
				},
			),
		);

		// Selection highlight when text is selected (from !== to)
		if (from !== to) {
			const selFrom = Math.min(from, to);
			const selTo = Math.max(from, to);
			decorations.push(
				Decoration.inline(
					selFrom,
					selTo,
					{
						class: "collab-selection",
						style: `background-color: ${color}33;`,
					},
					{ key: `selection-${cursor.userId}` },
				),
			);
		}
	}

	return DecorationSet.create(doc, decorations);
}

export const CollaborationCursors = Extension.create({
	name: "collaborationCursors",

	addProseMirrorPlugins() {
		return [
			new Plugin({
				key: cursorPluginKey,
				state: {
					init() {
						return DecorationSet.empty;
					},
					apply(tr, oldDecorations) {
						const cursors = tr.getMeta(cursorPluginKey);
						if (cursors !== undefined) {
							return buildDecorations(tr.doc, cursors);
						}
						// Map existing decorations through document changes
						return oldDecorations.map(tr.mapping, tr.doc);
					},
				},
				props: {
					decorations(state) {
						return cursorPluginKey.getState(state);
					},
				},
			}),
		];
	},
});
