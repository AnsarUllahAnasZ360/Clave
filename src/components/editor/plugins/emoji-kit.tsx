"use client";

import { EmojiInputPlugin, EmojiPlugin } from "@platejs/emoji/react";
import * as React from "react";

import { EmojiInputElement } from "@/components/ui/emoji-node";

// Emoji data (~800KB @emoji-mart/data) is loaded lazily on first editor mount
// via a useHooks extension rather than a static import at module level.
const EmojiPluginWithLazyData = EmojiPlugin.extend({
	useHooks: ({ editor }) => {
		React.useEffect(() => {
			import("@emoji-mart/data").then((m) => {
				editor.setOption(EmojiPlugin, "data", m.default as any);
			});
		}, [editor]);
	},
});

export const EmojiKit = [
	EmojiPluginWithLazyData,
	EmojiInputPlugin.withComponent(EmojiInputElement),
];
