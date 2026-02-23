"use client";

import { CheckIcon, SparklesIcon, XIcon } from "lucide-react";
import { useCallback, useEffect } from "react";
import { AIStreamingBlock } from "@/components/ai/AIStreamingBlock";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface AIResponseInlineProps {
	/** The AI-generated text (may be partial during streaming). */
	text: string;
	/** True while the text is being streamed. */
	isStreaming: boolean;
	/** Callback when the user accepts the AI text. */
	onAccept: () => void;
	/** Callback when the user rejects/dismisses the AI text. */
	onReject: () => void;
	/** Label shown in the header (default: "AI is writing..."). */
	label?: string;
	className?: string;
}

function AIResponseInline({
	text,
	isStreaming,
	onAccept,
	onReject,
	label,
	className,
}: AIResponseInlineProps) {
	const displayLabel =
		label ?? (isStreaming ? "AI is writing..." : "AI suggestion");

	// Dismiss on Escape key
	const handleKeyDown = useCallback(
		(e: KeyboardEvent) => {
			if (e.key === "Escape") {
				e.preventDefault();
				onReject();
			}
		},
		[onReject],
	);

	useEffect(() => {
		document.addEventListener("keydown", handleKeyDown);
		return () => document.removeEventListener("keydown", handleKeyDown);
	}, [handleKeyDown]);

	return (
		<div
			className={cn(
				"rounded-lg border border-sienna-200 bg-sienna-50/50 dark:border-sienna-800 dark:bg-sienna-950/30",
				"animate-in fade-in slide-in-from-bottom-2 duration-200",
				className,
			)}
		>
			{/* Header bar */}
			<div className="flex items-center gap-1.5 px-3 py-1.5 border-b border-sienna-200/60 dark:border-sienna-800/60">
				<SparklesIcon className="size-3.5 text-sienna-500 dark:text-sienna-400 shrink-0" />
				<span className="text-xs font-medium text-sienna-600 dark:text-sienna-400 truncate">
					{displayLabel}
				</span>
				<button
					type="button"
					onClick={onReject}
					className="ml-auto min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0 p-0.5 rounded flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors touch-manipulation"
					aria-label="Dismiss"
				>
					<XIcon className="size-3" />
				</button>
			</div>

			{/* Streaming content */}
			<div className="px-3 py-2 min-h-[2rem]">
				{text ? (
					<AIStreamingBlock
						text={text}
						isStreaming={isStreaming}
						className="text-foreground"
					/>
				) : isStreaming ? (
					<div className="flex items-center gap-2 text-xs text-muted-foreground">
						<span
							className="inline-block size-1.5 rounded-full bg-sienna-400"
							style={{ animation: "cursor-blink 1s step-end infinite" }}
						/>
						<span>Thinking...</span>
					</div>
				) : null}
			</div>

			{/* Action bar */}
			<div className="flex items-center justify-end gap-1.5 px-3 py-1.5 border-t border-sienna-200/60 dark:border-sienna-800/60">
				<Button
					variant="ghost"
					size="xs"
					onClick={onReject}
					disabled={isStreaming}
					className={cn(
						"min-h-[44px] sm:min-h-0 touch-manipulation",
						isStreaming && "opacity-50",
					)}
				>
					<XIcon />
					Reject
				</Button>
				<Button
					variant="default"
					size="xs"
					onClick={onAccept}
					disabled={isStreaming}
					className={cn(
						"min-h-[44px] sm:min-h-0 touch-manipulation bg-sienna-500 text-white hover:bg-sienna-600 dark:bg-sienna-600 dark:hover:bg-sienna-500",
						isStreaming && "opacity-50",
					)}
				>
					<CheckIcon />
					Accept
				</Button>
			</div>
		</div>
	);
}

export { AIResponseInline };
export type { AIResponseInlineProps };
