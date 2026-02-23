"use client";

import { EyeOff } from "lucide-react";
import { memo, useCallback } from "react";
import { PixelClaveIcon } from "@/components/ui/pixel-clave-icon";

// ── Suggestion chips ──────────────────────────────────────────────────────

export function SuggestionChip({
	text,
	onClick,
}: {
	text: string;
	onClick: (text: string) => void;
}) {
	const handleClick = useCallback(() => onClick(text), [text, onClick]);
	return (
		<button
			type="button"
			onClick={handleClick}
			className="rounded-full border border-border/50 bg-background px-4 py-2 text-sm text-muted-foreground transition-all hover:border-border hover:bg-secondary hover:text-foreground"
		>
			{text}
		</button>
	);
}

// ── Suggestion set ────────────────────────────────────────────────────────

export const SUGGESTION_CHIPS = [
	"What issues are in my project?",
	"Summarize recent activity",
	"Create a bug report template",
	"Help me plan a sprint",
] as const;

// ── ChatWelcomeScreen ─────────────────────────────────────────────────────

export const ChatWelcomeScreen = memo(function ChatWelcomeScreen() {
	return (
		<div className="flex flex-col items-center gap-4 text-center">
			<PixelClaveIcon
				height={52}
				color="var(--color-sienna-500)"
				className="opacity-90"
			/>
			<div className="space-y-2">
				<h1 className="text-2xl font-semibold tracking-tight">
					How can I help?
				</h1>
				<p className="max-w-sm text-sm text-muted-foreground">
					Ask questions about your projects, create issues, search documents,
					and more.
				</p>
			</div>
		</div>
	);
});

// ── IncognitoWelcomeScreen ────────────────────────────────────────────────

export const IncognitoWelcomeScreen = memo(function IncognitoWelcomeScreen() {
	return (
		<div className="flex flex-col items-center gap-5 text-center">
			<div className="flex size-14 items-center justify-center rounded-full border border-border/60 bg-muted/40">
				<EyeOff className="size-6 text-muted-foreground" />
			</div>
			<div className="space-y-2">
				<h1 className="text-2xl font-semibold tracking-tight">
					Temporary Chat
				</h1>
				<p className="max-w-md text-sm leading-relaxed text-muted-foreground">
					This conversation won't appear in your chat history and will be
					automatically deleted.
				</p>
			</div>
		</div>
	);
});
