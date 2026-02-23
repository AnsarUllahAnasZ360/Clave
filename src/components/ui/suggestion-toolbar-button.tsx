"use client";

import { SuggestionPlugin } from "@platejs/suggestion/react";
import { Lightbulb } from "lucide-react";
import { useEditorPlugin } from "platejs/react";
import type * as React from "react";

import { ToolbarButton } from "./toolbar";

export function SuggestionToolbarButton(
	props: React.ComponentProps<typeof ToolbarButton>,
) {
	const { getOption, setOption } = useEditorPlugin(SuggestionPlugin);
	const isSuggesting = Boolean(getOption("isSuggesting"));

	return (
		<ToolbarButton
			{...props}
			pressed={isSuggesting}
			onClick={() => {
				setOption("isSuggesting", !isSuggesting);
			}}
			onMouseDown={(event) => event.preventDefault()}
			tooltip="Suggestion mode"
		>
			<Lightbulb />
		</ToolbarButton>
	);
}
