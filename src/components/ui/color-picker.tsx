"use client";

import { Check } from "lucide-react";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { COLOR_PALETTE } from "@/lib/issue-config";
import { cn } from "@/lib/utils";

interface ColorPickerProps {
	color: string;
	onColorChange: (color: string) => void;
	disabled?: boolean;
}

const HEX_REGEX = /^#[0-9a-fA-F]{6}$/;

export function ColorPicker({
	color,
	onColorChange,
	disabled,
}: ColorPickerProps) {
	const [hexInput, setHexInput] = useState("");
	const [open, setOpen] = useState(false);

	const handleHexSubmit = () => {
		const value = hexInput.startsWith("#") ? hexInput : `#${hexInput}`;
		if (HEX_REGEX.test(value)) {
			onColorChange(value);
			setHexInput("");
		}
	};

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild disabled={disabled}>
				<button
					type="button"
					disabled={disabled}
					className="flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded-full border border-border/60 transition hover:scale-110 disabled:cursor-default disabled:opacity-50"
					style={{ backgroundColor: color }}
				/>
			</PopoverTrigger>
			<PopoverContent className="w-auto p-3" align="start" sideOffset={8}>
				<div className="grid grid-cols-4 gap-1.5">
					{COLOR_PALETTE.map((c) => (
						<button
							key={c}
							type="button"
							onClick={() => {
								onColorChange(c);
								setOpen(false);
							}}
							className={cn(
								"flex h-7 w-7 cursor-pointer items-center justify-center rounded-full border transition hover:scale-110",
								c === color ? "border-foreground" : "border-transparent",
							)}
							style={{ backgroundColor: c }}
						>
							{c === color && (
								<Check className="h-3.5 w-3.5 text-white drop-shadow-sm" />
							)}
						</button>
					))}
				</div>
				<div className="mt-3 flex items-center gap-2">
					<Input
						value={hexInput}
						onChange={(e) => setHexInput(e.target.value)}
						onKeyDown={(e) => {
							if (e.key === "Enter") handleHexSubmit();
						}}
						placeholder="#000000"
						className="h-7 flex-1 font-mono text-xs"
					/>
					<button
						type="button"
						onClick={handleHexSubmit}
						disabled={
							!HEX_REGEX.test(
								hexInput.startsWith("#") ? hexInput : `#${hexInput}`,
							)
						}
						className="flex h-7 shrink-0 cursor-pointer items-center justify-center rounded-md bg-primary px-2 text-xs text-primary-foreground transition hover:bg-primary/90 disabled:cursor-default disabled:opacity-50"
					>
						Apply
					</button>
				</div>
			</PopoverContent>
		</Popover>
	);
}
