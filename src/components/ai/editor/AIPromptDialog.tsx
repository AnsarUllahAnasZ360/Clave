"use client";

/**
 * Dialog for AI slash commands that require user input.
 *
 * Two variants:
 * - "prompt": textarea for "Write from prompt" action
 * - "translate": language picker for "Translate" action
 */

import { GlobeIcon, SparklesIcon } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { LANGUAGES } from "./languages";

// ── Types ───────────────────────────────────────────────────────────────────

export type AIPromptVariant = "prompt" | "translate";

interface AIPromptDialogProps {
	open: boolean;
	variant: AIPromptVariant;
	onSubmit: (value: string) => void;
	onCancel: () => void;
}

// ── Component ───────────────────────────────────────────────────────────────

export function AIPromptDialog({
	open,
	variant,
	onSubmit,
	onCancel,
}: AIPromptDialogProps) {
	const [promptText, setPromptText] = useState("");
	const textareaRef = useRef<HTMLTextAreaElement>(null);

	// Reset state when dialog opens
	useEffect(() => {
		if (open) {
			setPromptText("");
		}
	}, [open]);

	// Auto-focus textarea for prompt variant
	useEffect(() => {
		if (open && variant === "prompt") {
			requestAnimationFrame(() => {
				textareaRef.current?.focus();
			});
		}
	}, [open, variant]);

	const handlePromptSubmit = useCallback(() => {
		const trimmed = promptText.trim();
		if (!trimmed) return;
		onSubmit(trimmed);
	}, [promptText, onSubmit]);

	const handleKeyDown = useCallback(
		(e: React.KeyboardEvent) => {
			if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
				e.preventDefault();
				handlePromptSubmit();
			}
		},
		[handlePromptSubmit],
	);

	if (variant === "translate") {
		return (
			<Dialog open={open} onOpenChange={(v) => !v && onCancel()}>
				<DialogContent className="sm:max-w-[360px]">
					<DialogHeader>
						<DialogTitle className="flex items-center gap-2">
							<GlobeIcon className="size-4" />
							Translate
						</DialogTitle>
						<DialogDescription>
							Choose a target language for translation.
						</DialogDescription>
					</DialogHeader>
					<div className="grid grid-cols-2 gap-2">
						{LANGUAGES.map((lang) => (
							<Button
								key={lang.code}
								variant="outline"
								className="justify-start"
								onClick={() => onSubmit(lang.label)}
							>
								{lang.label}
							</Button>
						))}
					</div>
				</DialogContent>
			</Dialog>
		);
	}

	return (
		<Dialog open={open} onOpenChange={(v) => !v && onCancel()}>
			<DialogContent className="sm:max-w-[480px]">
				<DialogHeader>
					<DialogTitle className="flex items-center gap-2">
						<SparklesIcon className="size-4" />
						Write from prompt
					</DialogTitle>
					<DialogDescription>
						Describe what you want AI to write.
					</DialogDescription>
				</DialogHeader>
				<textarea
					ref={textareaRef}
					value={promptText}
					onChange={(e) => setPromptText(e.target.value)}
					onKeyDown={handleKeyDown}
					placeholder="e.g. Write a project overview covering goals, timeline, and key milestones..."
					className="min-h-[120px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none"
				/>
				<DialogFooter>
					<Button variant="outline" onClick={onCancel}>
						Cancel
					</Button>
					<Button onClick={handlePromptSubmit} disabled={!promptText.trim()}>
						Generate
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
