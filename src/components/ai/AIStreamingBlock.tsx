"use client";

import { cn } from "@/lib/utils";

interface AIStreamingBlockProps {
	/** The current accumulated text to display. */
	text: string;
	/** Whether the text is still being streamed — shows blinking cursor when true. */
	isStreaming: boolean;
	className?: string;
}

function AIStreamingBlock({
	text,
	isStreaming,
	className,
}: AIStreamingBlockProps) {
	return (
		<div
			className={cn(
				"text-sm leading-relaxed whitespace-pre-wrap break-words",
				className,
			)}
		>
			{text}
			{isStreaming && (
				<span
					className="inline-block w-0.5 h-[1.1em] align-text-bottom ml-px bg-sienna-500 dark:bg-sienna-400"
					style={{ animation: "cursor-blink 1s step-end infinite" }}
					aria-hidden="true"
				/>
			)}
		</div>
	);
}

export { AIStreamingBlock };
export type { AIStreamingBlockProps };
