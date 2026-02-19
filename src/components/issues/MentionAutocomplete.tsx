"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

export type MentionUser = {
	id: string;
	name: string;
	image?: string;
};

type MentionAutocompleteProps = {
	users: MentionUser[];
	triggerChar?: string;
	onSelect: (user: MentionUser) => void;
	onDismiss: () => void;
	query: string;
	anchorRect: { top: number; left: number } | null;
};

export function MentionAutocomplete({
	users,
	triggerChar = "@",
	onSelect,
	onDismiss,
	query,
	anchorRect,
}: MentionAutocompleteProps) {
	const [selectedIndex, setSelectedIndex] = useState(0);
	const listRef = useRef<HTMLDivElement>(null);

	const filtered = users.filter((u) =>
		u.name.toLowerCase().includes(query.toLowerCase()),
	);

	// biome-ignore lint/correctness/useExhaustiveDependencies: reset index when query changes
	useEffect(() => {
		setSelectedIndex(0);
	}, [query]);

	const handleKeyDown = useCallback(
		(e: KeyboardEvent) => {
			if (!anchorRect || filtered.length === 0) return;

			if (e.key === "ArrowDown") {
				e.preventDefault();
				setSelectedIndex((i) => (i + 1) % filtered.length);
			} else if (e.key === "ArrowUp") {
				e.preventDefault();
				setSelectedIndex((i) => (i - 1 + filtered.length) % filtered.length);
			} else if (e.key === "Enter" || e.key === "Tab") {
				e.preventDefault();
				onSelect(filtered[selectedIndex]);
			} else if (e.key === "Escape") {
				e.preventDefault();
				onDismiss();
			}
		},
		[anchorRect, filtered, selectedIndex, onSelect, onDismiss],
	);

	useEffect(() => {
		document.addEventListener("keydown", handleKeyDown, true);
		return () => document.removeEventListener("keydown", handleKeyDown, true);
	}, [handleKeyDown]);

	if (!anchorRect || filtered.length === 0) return null;

	return (
		<div
			ref={listRef}
			className="fixed z-50 min-w-[200px] max-w-[280px] max-h-[200px] overflow-y-auto rounded-lg border border-border bg-popover p-1 shadow-md"
			style={{
				top: anchorRect.top,
				left: anchorRect.left,
			}}
		>
			{filtered.map((user, index) => (
				<button
					key={user.id}
					type="button"
					className={cn(
						"flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors",
						index === selectedIndex
							? "bg-accent text-accent-foreground"
							: "hover:bg-muted",
					)}
					onMouseEnter={() => setSelectedIndex(index)}
					onMouseDown={(e) => {
						e.preventDefault();
						onSelect(user);
					}}
				>
					<Avatar className="size-5">
						{user.image && <AvatarImage src={user.image} alt={user.name} />}
						<AvatarFallback className="text-[10px]">
							{user.name.charAt(0).toUpperCase()}
						</AvatarFallback>
					</Avatar>
					<span className="truncate">{user.name}</span>
				</button>
			))}
		</div>
	);
}

/**
 * Hook to manage mention state for a textarea.
 * Returns state and handlers for integrating MentionAutocomplete with a textarea.
 */
export function useMentionAutocomplete(
	textareaRef: React.RefObject<HTMLTextAreaElement | null>,
) {
	const [mentionState, setMentionState] = useState<{
		active: boolean;
		query: string;
		startPos: number;
		anchorRect: { top: number; left: number } | null;
	}>({
		active: false,
		query: "",
		startPos: 0,
		anchorRect: null,
	});

	const getCaretCoordinates = useCallback(() => {
		const textarea = textareaRef.current;
		if (!textarea) return null;

		const rect = textarea.getBoundingClientRect();
		// Create a mirror span to measure caret position
		const mirror = document.createElement("span");
		const style = window.getComputedStyle(textarea);
		mirror.style.position = "absolute";
		mirror.style.visibility = "hidden";
		mirror.style.whiteSpace = "pre-wrap";
		mirror.style.wordWrap = "break-word";
		mirror.style.font = style.font;
		mirror.style.padding = style.padding;
		mirror.style.border = style.border;
		mirror.style.width = `${textarea.clientWidth}px`;
		mirror.style.lineHeight = style.lineHeight;

		const text = textarea.value.substring(0, textarea.selectionStart);
		mirror.textContent = text;

		const marker = document.createElement("span");
		marker.textContent = "|";
		mirror.appendChild(marker);

		document.body.appendChild(mirror);
		const markerRect = marker.getBoundingClientRect();
		const mirrorRect = mirror.getBoundingClientRect();
		document.body.removeChild(mirror);

		return {
			top: rect.top + (markerRect.top - mirrorRect.top) + 20,
			left: rect.left + (markerRect.left - mirrorRect.left),
		};
	}, [textareaRef]);

	const handleInputChange = useCallback(
		(value: string, selectionStart: number) => {
			// Check if we're in a mention context
			const textBeforeCursor = value.substring(0, selectionStart);
			const atIndex = textBeforeCursor.lastIndexOf("@");

			if (atIndex === -1) {
				if (mentionState.active) {
					setMentionState((s) => ({ ...s, active: false }));
				}
				return;
			}

			// Check that @ is at start or preceded by whitespace
			const charBefore = atIndex > 0 ? textBeforeCursor[atIndex - 1] : " ";
			if (charBefore !== " " && charBefore !== "\n" && atIndex !== 0) {
				if (mentionState.active) {
					setMentionState((s) => ({ ...s, active: false }));
				}
				return;
			}

			const queryText = textBeforeCursor.substring(atIndex + 1);
			// Stop mention if query has whitespace (user moved on)
			if (queryText.includes(" ") || queryText.includes("\n")) {
				if (mentionState.active) {
					setMentionState((s) => ({ ...s, active: false }));
				}
				return;
			}

			const coords = getCaretCoordinates();
			setMentionState({
				active: true,
				query: queryText,
				startPos: atIndex,
				anchorRect: coords,
			});
		},
		[mentionState.active, getCaretCoordinates],
	);

	const insertMention = useCallback(
		(user: MentionUser, value: string): string => {
			const before = value.substring(0, mentionState.startPos);
			const after = value.substring(
				mentionState.startPos + 1 + mentionState.query.length,
			);
			const mention = `@[${user.name}](${user.id})`;
			const newValue = `${before}${mention}${after ? after : " "}`;

			setMentionState({
				active: false,
				query: "",
				startPos: 0,
				anchorRect: null,
			});

			// Set cursor position after mention
			requestAnimationFrame(() => {
				const textarea = textareaRef.current;
				if (textarea) {
					const cursorPos = before.length + mention.length + 1;
					textarea.selectionStart = cursorPos;
					textarea.selectionEnd = cursorPos;
					textarea.focus();
				}
			});

			return newValue;
		},
		[mentionState.startPos, mentionState.query, textareaRef],
	);

	const dismissMention = useCallback(() => {
		setMentionState({
			active: false,
			query: "",
			startPos: 0,
			anchorRect: null,
		});
	}, []);

	return {
		mentionState,
		handleInputChange,
		insertMention,
		dismissMention,
	};
}
