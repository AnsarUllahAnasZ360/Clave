"use client";

import { FontSizePlugin } from "@platejs/basic-styles/react";
import { TextCursorInput } from "lucide-react";
import { useEditorRef } from "platejs/react";
import type * as React from "react";

import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ToolbarButton } from "./toolbar";

const FONT_SIZES = ["12", "14", "16", "18", "20", "24", "28", "32", "40"];

export function FontSizeToolbarButton(
	props: React.ComponentProps<typeof ToolbarButton>,
) {
	const editor = useEditorRef();

	return (
		<DropdownMenu modal={false}>
			<DropdownMenuTrigger asChild>
				<ToolbarButton
					{...props}
					tooltip="Font size"
					isDropdown
					onMouseDown={(event) => event.preventDefault()}
				>
					<TextCursorInput />
				</ToolbarButton>
			</DropdownMenuTrigger>

			<DropdownMenuContent align="start" className="w-24">
				{FONT_SIZES.map((size) => (
					<DropdownMenuItem
						key={size}
						onSelect={() => {
							(editor.getApi(FontSizePlugin) as any).fontSize.addMark(size);
							editor.tf.focus();
						}}
					>
						{size}
					</DropdownMenuItem>
				))}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
