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

const STORAGE_KEY = "clave:ai-sidebar-open";

type AIChatPanelContextValue = {
	isOpen: boolean;
	toggle: () => void;
	open: () => void;
	close: () => void;
};

const AIChatPanelContext = createContext<AIChatPanelContextValue | null>(null);

function getStoredState(): boolean {
	if (typeof window === "undefined") return false;
	try {
		return localStorage.getItem(STORAGE_KEY) === "true";
	} catch {
		return false;
	}
}

function persistState(value: boolean) {
	try {
		localStorage.setItem(STORAGE_KEY, String(value));
	} catch {
		// localStorage unavailable
	}
}

export function AIChatPanelProvider({
	children,
}: {
	children: React.ReactNode;
}) {
	const [isOpen, setIsOpen] = useState(false);
	const pathname = usePathname();
	const isChatRoute = pathname?.includes("/chat") ?? false;

	// Restore persisted state on mount
	useEffect(() => {
		setIsOpen(getStoredState());
	}, []);

	const open = useCallback(() => {
		setIsOpen(true);
		persistState(true);
	}, []);

	const close = useCallback(() => {
		setIsOpen(false);
		persistState(false);
	}, []);

	const toggle = useCallback(() => {
		setIsOpen((prev) => {
			const next = !prev;
			persistState(next);
			return next;
		});
	}, []);

	// Cmd+J / Ctrl+J keyboard shortcut
	useEffect(() => {
		function handleKeyDown(e: KeyboardEvent) {
			if ((e.metaKey || e.ctrlKey) && e.key === "j") {
				e.preventDefault();
				toggle();
			}
		}
		document.addEventListener("keydown", handleKeyDown);
		return () => document.removeEventListener("keydown", handleKeyDown);
	}, [toggle]);

	// Suppress sidebar on /chat routes to prevent duplicate chat UI
	const effectiveIsOpen = isOpen && !isChatRoute;

	const value = useMemo(
		() => ({ isOpen: effectiveIsOpen, toggle, open, close }),
		[effectiveIsOpen, toggle, open, close],
	);

	return (
		<AIChatPanelContext.Provider value={value}>
			{children}
		</AIChatPanelContext.Provider>
	);
}

export function useAIChatPanel() {
	const ctx = useContext(AIChatPanelContext);
	if (!ctx) {
		throw new Error("useAIChatPanel must be used within AIChatPanelProvider");
	}
	return ctx;
}
