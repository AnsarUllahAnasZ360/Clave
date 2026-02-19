"use client";

import EmojiPickerReact, { Theme } from "emoji-picker-react";
import { Smile, X } from "lucide-react";
import { useTheme } from "next-themes";
import { useCallback } from "react";
import { Button } from "@/components/ui/button";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";

type EmojiPickerProps = {
	value?: string;
	onChange: (emoji: string | undefined) => void;
	trigger?: React.ReactNode;
};

export function EmojiPicker({ value, onChange, trigger }: EmojiPickerProps) {
	const { resolvedTheme } = useTheme();

	const handleSelect = useCallback(
		(emojiData: { emoji: string }) => {
			onChange(emojiData.emoji);
		},
		[onChange],
	);

	const handleRemove = useCallback(() => {
		onChange(undefined);
	}, [onChange]);

	return (
		<Popover>
			<PopoverTrigger asChild>
				{trigger ?? (
					<button
						type="button"
						className="flex items-center justify-center rounded-md p-1 hover:bg-muted transition-colors cursor-pointer"
					>
						{value ? (
							<span className="text-xl leading-none">{value}</span>
						) : (
							<Smile className="h-5 w-5 text-muted-foreground" />
						)}
					</button>
				)}
			</PopoverTrigger>
			<PopoverContent
				className="w-auto p-0 border-none shadow-xl"
				align="start"
				sideOffset={8}
			>
				<div className="relative">
					{value && (
						<div className="flex items-center justify-end px-3 pt-2">
							<Button
								type="button"
								variant="ghost"
								size="sm"
								className="h-7 gap-1 text-xs text-muted-foreground hover:text-foreground"
								onClick={handleRemove}
							>
								<X className="h-3 w-3" />
								Remove
							</Button>
						</div>
					)}
					<EmojiPickerReact
						theme={resolvedTheme === "dark" ? Theme.DARK : Theme.LIGHT}
						onEmojiClick={handleSelect}
						autoFocusSearch
						lazyLoadEmojis
						width={350}
						height={400}
					/>
				</div>
			</PopoverContent>
		</Popover>
	);
}
