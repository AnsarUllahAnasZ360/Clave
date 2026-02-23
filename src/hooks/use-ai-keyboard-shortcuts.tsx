"use client";

import { usePathname } from "next/navigation";
import {
	createContext,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useState,
} from "react";
import { detectAIContext, QUICK_ACTIONS } from "@/components/ai/InlineAIPrompt";
import { hasOpenOverlay, isTextInput } from "@/hooks/use-shortcuts";
import type { AIContext } from "@/types/embedded-ai";

// ── Re-export for convenience ────────────────────────────────────────────
export { useInlineAIPrompt } from "@/components/ai/InlineAIPrompt";

// ── AI Action Menu Context ───────────────────────────────────────────────

interface AIActionMenuContextValue {
	isOpen: boolean;
	context: AIContext;
	open: () => void;
	close: () => void;
	toggle: () => void;
}

const AIActionMenuContext = createContext<AIActionMenuContextValue | null>(
	null,
);

export function useAIActionMenu(): AIActionMenuContextValue {
	const ctx = useContext(AIActionMenuContext);
	if (!ctx) {
		throw new Error("useAIActionMenu must be used within AIActionMenuProvider");
	}
	return ctx;
}

// ── Provider ─────────────────────────────────────────────────────────────

export function AIActionMenuProvider({
	children,
}: {
	children: React.ReactNode;
}) {
	const [isOpen, setIsOpen] = useState(false);
	const pathname = usePathname();
	const context = detectAIContext(pathname);

	const open = useCallback(() => setIsOpen(true), []);
	const close = useCallback(() => setIsOpen(false), []);
	const toggle = useCallback(() => setIsOpen((prev) => !prev), []);

	// Cmd+Shift+A / Ctrl+Shift+A keyboard shortcut
	useEffect(() => {
		function handleKeyDown(e: KeyboardEvent) {
			if (!(e.metaKey || e.ctrlKey) || !e.shiftKey || e.key !== "A") return;

			// Do not open when focus is in a text editor
			if (isTextInput(e.target)) return;

			// Do not open if another overlay is already showing
			if (hasOpenOverlay()) return;

			e.preventDefault();
			setIsOpen((prev) => !prev);
		}
		document.addEventListener("keydown", handleKeyDown);
		return () => document.removeEventListener("keydown", handleKeyDown);
	}, []);

	const value = useMemo(
		() => ({ isOpen, context, open, close, toggle }),
		[isOpen, context, open, close, toggle],
	);

	return (
		<AIActionMenuContext.Provider value={value}>
			{children}
		</AIActionMenuContext.Provider>
	);
}

export { detectAIContext, QUICK_ACTIONS };
