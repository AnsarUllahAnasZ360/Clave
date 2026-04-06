"use client";

import { TabbablePlugin } from "@platejs/tabbable/react";
import { KEYS } from "platejs";

export const TabbableKit = TabbablePlugin.configure(({ editor }) => ({
	node: {
		isElement: true,
	},
	options: {
		query: () => {
			if (editor.api.isAt({ start: true }) || editor.api.isAt({ end: true }))
				return false;

			const tabbableTypes = [
				KEYS.codeBlock,
				KEYS.li,
				KEYS.listTodoClassic,
				KEYS.table,
			] as const;

			return !editor.api.some({
				match: (n) =>
					!!(
						(n.type &&
							tabbableTypes.includes(
								n.type as (typeof tabbableTypes)[number],
							)) ||
						n.listStyleType
					),
			});
		},
	},
	override: {
		enabled: {
			indent: false,
		},
	},
}));
