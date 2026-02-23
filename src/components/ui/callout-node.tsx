"use client";

import { useCalloutEmojiPicker } from "@platejs/callout/react";
import { useEmojiDropdownMenuState } from "@platejs/emoji/react";
import {
	PlateElement,
	useEditorRef,
	useElement,
	useReadOnly,
} from "platejs/react";
import type * as React from "react";

import { Button } from "@/components/ui/button";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

import { EmojiPicker, EmojiPopover } from "./emoji-toolbar-button";

type CalloutVariant = "note" | "info" | "warning" | "error" | "success";

const CALLOUT_VARIANTS: Record<
	CalloutVariant,
	{ bg: string; dot: string; icon: string; label: string }
> = {
	note: {
		bg: "bg-muted",
		dot: "bg-muted-foreground/40",
		icon: "💡",
		label: "Note",
	},
	info: {
		bg: "bg-blue-500/10 dark:bg-blue-500/20",
		dot: "bg-blue-500",
		icon: "ℹ️",
		label: "Info",
	},
	warning: {
		bg: "bg-amber-500/10 dark:bg-amber-500/20",
		dot: "bg-amber-500",
		icon: "⚠️",
		label: "Warning",
	},
	error: {
		bg: "bg-red-500/10 dark:bg-red-500/20",
		dot: "bg-red-500",
		icon: "🚨",
		label: "Error",
	},
	success: {
		bg: "bg-green-500/10 dark:bg-green-500/20",
		dot: "bg-green-500",
		icon: "✅",
		label: "Success",
	},
};

const VARIANT_ORDER: CalloutVariant[] = [
	"note",
	"info",
	"warning",
	"error",
	"success",
];

function getVariantBg(element: Record<string, unknown>): string {
	const variant = element.variant as CalloutVariant | undefined;
	if (variant && variant in CALLOUT_VARIANTS) {
		return CALLOUT_VARIANTS[variant].bg;
	}
	return "bg-muted";
}

export function CalloutElement({
	attributes,
	children,
	className,
	...props
}: React.ComponentProps<typeof PlateElement>) {
	const editor = useEditorRef();
	const element = useElement();
	const readOnly = useReadOnly();
	const { emojiPickerState, isOpen, setIsOpen } = useEmojiDropdownMenuState({
		closeOnSelect: true,
	});

	const { emojiToolbarDropdownProps, props: calloutProps } =
		useCalloutEmojiPicker({
			isOpen,
			setIsOpen,
		});

	const currentVariant = (props.element.variant as CalloutVariant) || "note";
	const variantBg = getVariantBg(props.element as Record<string, unknown>);
	const hasCustomBg = !props.element.variant && props.element.backgroundColor;

	const setVariant = (variant: CalloutVariant) => {
		const config = CALLOUT_VARIANTS[variant];
		const path = editor.api.findPath(element);
		if (!path) return;
		editor.tf.setNodes(
			{
				variant,
				icon: config.icon,
				backgroundColor: undefined,
			},
			{ at: path },
		);
	};

	return (
		<PlateElement
			className={cn(
				"group/callout my-1 flex rounded-sm p-4 pl-3",
				variantBg,
				className,
			)}
			style={
				hasCustomBg
					? { backgroundColor: props.element.backgroundColor as string }
					: undefined
			}
			attributes={{
				...attributes,
				"data-plate-open-context-menu": true,
			}}
			{...props}
		>
			<div className="flex w-full gap-2 rounded-md">
				<EmojiPopover
					{...emojiToolbarDropdownProps}
					control={
						<Button
							variant="ghost"
							className="size-6 select-none p-1 text-[18px] hover:bg-muted-foreground/15"
							style={{
								fontFamily:
									'"Apple Color Emoji", "Segoe UI Emoji", NotoColorEmoji, "Noto Color Emoji", "Segoe UI Symbol", "Android Emoji", EmojiSymbols',
							}}
							contentEditable={false}
						>
							{(props.element.icon as any) || "💡"}
						</Button>
					}
				>
					<EmojiPicker {...emojiPickerState} {...calloutProps} />
				</EmojiPopover>
				<div className="w-full">{children}</div>
				{!readOnly && (
					<div
						className="flex shrink-0 items-start gap-0.5 opacity-0 transition-opacity group-hover/callout:opacity-100"
						contentEditable={false}
					>
						<TooltipProvider delayDuration={300}>
							{VARIANT_ORDER.map((v) => {
								const config = CALLOUT_VARIANTS[v];
								return (
									<Tooltip key={v}>
										<TooltipTrigger asChild>
											<button
												type="button"
												className={cn(
													"size-4 rounded-full border border-background/50 transition-transform hover:scale-125",
													config.dot,
													currentVariant === v &&
														"ring-2 ring-foreground/30 ring-offset-1 ring-offset-background",
												)}
												onClick={() => setVariant(v)}
											/>
										</TooltipTrigger>
										<TooltipContent side="top" className="text-xs">
											{config.label}
										</TooltipContent>
									</Tooltip>
								);
							})}
						</TooltipProvider>
					</div>
				)}
			</div>
		</PlateElement>
	);
}
