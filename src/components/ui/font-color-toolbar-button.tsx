"use client";

import {
	FontBackgroundColorPlugin,
	FontColorPlugin,
} from "@platejs/basic-styles/react";
import { Check, Paintbrush } from "lucide-react";
import { KEYS } from "platejs";
import { useEditorRef } from "platejs/react";
import * as React from "react";

import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

import { ToolbarButton } from "./toolbar";

export const DEFAULT_COLORS = [
	"#000000",
	"#8A8A8A",
	"#B91C1C",
	"#0EA5E9",
	"#14B8A6",
	"#22C55E",
	"#F59E0B",
	"#F97316",
	"#EC4899",
	"#6366F1",
	"#A855F7",
	"#00000000",
];

type FontColorToolbarButtonProps = {
	nodeType: (typeof KEYS)["color"] | (typeof KEYS)["backgroundColor"];
	children?: React.ReactNode;
	tooltip?: string;
} & React.ComponentProps<typeof ToolbarButton>;

export function FontColorToolbarButton({
	nodeType,
	children,
	tooltip,
	...props
}: FontColorToolbarButtonProps) {
	const editor = useEditorRef();
	const [open, setOpen] = React.useState(false);

	const applyColor = (color: string) => {
		setOpen(false);
		const value = color === "#00000000" ? "" : color;
		if (nodeType === KEYS.backgroundColor) {
			(editor.getApi(FontBackgroundColorPlugin) as any).backgroundColor.addMark(
				value,
			);
		} else {
			(editor.getApi(FontColorPlugin) as any).color.addMark(value);
		}
		editor.tf.focus();
	};

	return (
		<DropdownMenu open={open} onOpenChange={setOpen} modal={false}>
			<DropdownMenuTrigger asChild>
				<ToolbarButton
					{...props}
					onMouseDown={(event) => event.preventDefault()}
					pressed={open}
					tooltip={tooltip ?? "Font color"}
					isDropdown
				>
					{children ?? <Paintbrush />}
				</ToolbarButton>
			</DropdownMenuTrigger>

			<DropdownMenuContent align="start">
				<ColorDropdownMenuItems
					className="px-2 py-2"
					colors={DEFAULT_COLORS}
					updateColor={applyColor}
				/>
				<DropdownMenuItem onSelect={() => applyColor("#00000000")}>
					Clear
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}

export function ColorDropdownMenuItems({
	className,
	colors,
	updateColor,
}: {
	className?: string;
	colors: readonly string[];
	updateColor: (color: string) => void;
}) {
	return (
		<div className={cn("grid grid-cols-4 gap-1", className)}>
			{colors.map((color) => {
				const isClear = color === "#00000000";

				return (
					<button
						key={color}
						type="button"
						className={cn(
							"relative flex h-7 w-7 items-center justify-center rounded-full border border-border/60",
							"hover:border-foreground transition",
						)}
						style={{ backgroundColor: isClear ? "transparent" : color }}
						onMouseDown={(event) => event.preventDefault()}
						onClick={() => updateColor(color)}
					>
						{isClear ? <span className="sr-only">Clear</span> : null}
						{isClear && <span className="size-2 rounded-full bg-muted" />}
						{color === "#000000" ? (
							<Check className="size-3 text-white/80" />
						) : null}
					</button>
				);
			})}

			<div className="col-span-full mt-1"></div>
		</div>
	);
}
