"use client";

import { LineHeightPlugin } from "@platejs/basic-styles/react";
import { ArrowDownToLine, ArrowUpFromLine } from "lucide-react";
import { useEditorRef } from "platejs/react";
import type * as React from "react";

import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

import { ToolbarButton } from "./toolbar";

const LINE_HEIGHTS = [1, 1.2, 1.5, 2, 3];

export function LineHeightToolbarButton(
	props: React.ComponentProps<typeof ToolbarButton>,
) {
	const editor = useEditorRef();

	return (
		<DropdownMenu modal={false}>
			<DropdownMenuTrigger asChild>
				<ToolbarButton
					{...props}
					tooltip="Line height"
					isDropdown
					onMouseDown={(event) => event.preventDefault()}
				>
					<ArrowDownToLine />
					<span className={cn("text-[11px] leading-none")}>1.5</span>
				</ToolbarButton>
			</DropdownMenuTrigger>

			<DropdownMenuContent
				align="start"
				className="w-24"
				onCloseAutoFocus={(event) => {
					event.preventDefault();
				}}
			>
				{LINE_HEIGHTS.map((height) => (
					<DropdownMenuItem
						key={height}
						onSelect={() => {
							(editor.getApi(LineHeightPlugin) as any).lineHeight.setNodes(
								height,
							);
							editor.tf.focus();
						}}
					>
						<ArrowUpFromLine className="size-3.5 text-muted-foreground" />
						{height}
					</DropdownMenuItem>
				))}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
