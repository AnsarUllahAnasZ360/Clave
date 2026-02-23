"use client";

import { useRouter } from "next/navigation";
import {
	createContext,
	type ReactNode,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { useWorkspaceOptional } from "@/components/providers/workspace-context";

// ── OS Detection ─────────────────────────────────────────────────────────

export type OperatingSystem = "mac" | "windows" | "linux";

export function detectOS(): OperatingSystem {
	if (typeof navigator === "undefined") return "mac";
	const ua = navigator.userAgent;
	if (/Macintosh|Mac OS X|iPhone|iPad|iPod/i.test(ua)) return "mac";
	if (/Windows/i.test(ua)) return "windows";
	return "linux";
}

// ── Shortcut definitions for the help overlay ─────────────────────────────

export type ShortcutCategory =
	| "global"
	| "navigation"
	| "issue"
	| "inbox"
	| "views"
	| "ai"
	| "ai_chat";

export interface ShortcutDefinition {
	key: string;
	label: string;
	category: ShortcutCategory;
	modifier?: "shift" | "alt" | "cmd" | "cmd+shift";
	popular?: boolean;
}

export const SHORTCUT_CATEGORIES: {
	id: ShortcutCategory;
	label: string;
}[] = [
	{ id: "global", label: "Global" },
	{ id: "navigation", label: "Navigation" },
	{ id: "issue", label: "Issue actions" },
	{ id: "inbox", label: "Inbox" },
	{ id: "views", label: "Views" },
	{ id: "ai", label: "AI" },
	{ id: "ai_chat", label: "AI Chat" },
];

export const ALL_SHORTCUTS: ShortcutDefinition[] = [
	// Global
	{
		key: "C",
		label: "Create issue",
		category: "global",
		popular: true,
	},
	{
		key: "V",
		label: "Full-screen issue create",
		category: "global",
		popular: true,
	},
	{
		key: "?",
		label: "Show keyboard shortcuts",
		category: "global",
		popular: true,
	},
	{ key: "/", label: "Search", category: "global", popular: true },
	{
		key: "K",
		label: "Command palette",
		category: "global",
		modifier: "cmd",
		popular: true,
	},
	{
		key: "B",
		label: "Toggle sidebar",
		category: "global",
		modifier: "cmd",
		popular: true,
	},

	// Navigation
	{ key: "J", label: "Move down", category: "navigation" },
	{ key: "K", label: "Move up", category: "navigation" },
	{ key: "G I", label: "Go to Inbox", category: "navigation" },
	{ key: "G T", label: "Go to Tasks", category: "navigation" },
	{ key: "G P", label: "Go to Projects", category: "navigation" },
	{ key: "G D", label: "Go to Docs", category: "navigation" },
	{ key: "G B", label: "Go to Boards", category: "navigation" },
	{ key: "G C", label: "Go to Clients", category: "navigation" },
	{ key: "G S", label: "Go to Settings", category: "navigation" },
	{
		key: "Enter",
		label: "Open selected issue",
		category: "navigation",
	},
	{
		key: "Space",
		label: "Peek issue preview",
		category: "navigation",
	},

	// Issue actions (require selected issue)
	{ key: "S", label: "Set status", category: "issue" },
	{ key: "A", label: "Set assignee", category: "issue" },
	{ key: "P", label: "Set priority", category: "issue" },
	{ key: "L", label: "Set labels", category: "issue" },
	{
		key: "M",
		label: "Set sprint",
		category: "issue",
		modifier: "shift",
	},
	{
		key: "P",
		label: "Set project",
		category: "issue",
		modifier: "shift",
	},

	// Inbox
	{ key: "U", label: "Toggle read/unread", category: "inbox" },
	{ key: "H", label: "Snooze", category: "inbox" },
	{ key: "E", label: "Archive notification", category: "inbox" },
	{ key: "\u232B", label: "Delete notification", category: "inbox" },
	{
		key: "U",
		label: "Mark all read",
		category: "inbox",
		modifier: "alt",
	},
	{
		key: "⌫",
		label: "Delete visible notifications",
		category: "inbox",
		modifier: "shift",
	},
	{
		key: "D",
		label: "Delete read notifications",
		category: "inbox",
		modifier: "cmd",
	},

	// Views
	{
		key: "V",
		label: "Display options",
		category: "views",
		modifier: "shift",
	},
	{ key: "F", label: "Open filter", category: "views" },

	// AI
	{
		key: "I",
		label: "Inline AI prompt",
		category: "ai",
		modifier: "cmd",
		popular: true,
	},
	{
		key: "A",
		label: "AI action menu",
		category: "ai",
		modifier: "cmd+shift",
		popular: true,
	},
	{
		key: "V",
		label: "Toggle dictation",
		category: "ai",
		modifier: "cmd+shift",
		popular: true,
	},

	// AI Chat
	{
		key: "J",
		label: "Toggle AI chat",
		category: "ai_chat",
		modifier: "cmd",
		popular: true,
	},
	{
		key: "N",
		label: "New thread",
		category: "ai_chat",
		modifier: "cmd",
	},
	{
		key: "/",
		label: "Focus chat input",
		category: "ai_chat",
		modifier: "cmd",
	},
	{
		key: "Escape",
		label: "Close / dismiss",
		category: "ai_chat",
	},
];

// ── Helpers ───────────────────────────────────────────────────────────────

/**
 * Returns true if the given element is a text input (input, textarea,
 * contenteditable, or role="textbox"). Used to suppress keyboard shortcuts
 * when the user is typing.
 */
export function isTextInput(target: EventTarget | null): boolean {
	if (!target || !(target instanceof HTMLElement)) return false;
	const tag = target.tagName;
	if (tag === "INPUT") {
		const inputType = (target as HTMLInputElement).type;
		const textTypes = [
			"text",
			"search",
			"url",
			"tel",
			"email",
			"password",
			"number",
		];
		return textTypes.includes(inputType);
	}
	if (tag === "TEXTAREA" || tag === "SELECT") return true;
	if (target.isContentEditable) return true;
	if (target.getAttribute("role") === "textbox") return true;
	return false;
}

/**
 * Returns true if any dialog or popover is currently open.
 */
export function hasOpenOverlay(): boolean {
	return !!(
		document.querySelector("[role='dialog']") ||
		document.querySelector(
			"[data-state='open'][data-radix-popper-content-wrapper]",
		)
	);
}

// ── Context ───────────────────────────────────────────────────────────────

export type PropertyPickerType =
	| "status"
	| "assignee"
	| "priority"
	| "labels"
	| "milestone"
	| "project"
	| null;

interface ShortcutContextValue {
	helpOpen: boolean;
	toggleHelp: () => void;
	closeHelp: () => void;
	activeIssueId: string | null;
	setActiveIssueId: (id: string | null) => void;
	propertyPicker: PropertyPickerType;
	openPropertyPicker: (type: PropertyPickerType) => void;
	closePropertyPicker: () => void;
}

const ShortcutCtx = createContext<ShortcutContextValue | null>(null);

export function useShortcuts(): ShortcutContextValue {
	const ctx = useContext(ShortcutCtx);
	if (!ctx) {
		throw new Error("useShortcuts must be used within a ShortcutProvider");
	}
	return ctx;
}

export function useShortcutsOptional(): ShortcutContextValue | null {
	return useContext(ShortcutCtx);
}

// ── Provider ──────────────────────────────────────────────────────────────

export function ShortcutProvider({ children }: { children: ReactNode }) {
	const router = useRouter();
	const workspace = useWorkspaceOptional();
	const workspaceSlug = workspace?.workspaceSlug;
	const orgSlug = workspace?.orgSlug;
	const hasWorkspaceContext = Boolean(workspace && workspaceSlug && orgSlug);
	const [helpOpen, setHelpOpen] = useState(false);
	const [activeIssueId, setActiveIssueId] = useState<string | null>(null);
	const [propertyPicker, setPropertyPicker] =
		useState<PropertyPickerType>(null);
	const pendingNavChordRef = useRef<"g" | null>(null);
	const chordTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	const toggleHelp = useCallback(() => setHelpOpen((prev) => !prev), []);
	const closeHelp = useCallback(() => setHelpOpen(false), []);

	const openPropertyPicker = useCallback(
		(type: PropertyPickerType) => {
			if (activeIssueId) {
				setPropertyPicker(type);
			}
		},
		[activeIssueId],
	);

	const closePropertyPicker = useCallback(() => setPropertyPicker(null), []);

	// Global keydown handler for shortcuts managed by the provider
	useEffect(() => {
		function handleKeyDown(e: KeyboardEvent) {
			// Cmd+Shift+V / Ctrl+Shift+V — global dictation toggle
			if (
				(e.metaKey || e.ctrlKey) &&
				e.shiftKey &&
				e.key.toLowerCase() === "v"
			) {
				e.preventDefault();
				window.dispatchEvent(
					new CustomEvent("clave:dictation-toggle", {
						detail: { source: "global-shortcut" },
					}),
				);
				return;
			}

			if (isTextInput(e.target)) return;

			// ? — toggle help overlay (works even with dialogs open)
			if (e.key === "?" && !e.metaKey && !e.ctrlKey && !e.altKey) {
				e.preventDefault();
				setHelpOpen((prev) => !prev);
				return;
			}

			// Skip further shortcuts if an overlay/dialog is open
			if (hasOpenOverlay()) return;

			// / — open search (trigger Cmd+K for command palette)
			if (
				e.key === "/" &&
				!e.metaKey &&
				!e.ctrlKey &&
				!e.altKey &&
				!e.shiftKey
			) {
				e.preventDefault();
				const cmdK = new KeyboardEvent("keydown", {
					key: "k",
					code: "KeyK",
					metaKey: true,
					bubbles: true,
				});
				document.dispatchEvent(cmdK);
				return;
			}

			// Chord navigation: G then key
			if (!e.metaKey && !e.ctrlKey && !e.altKey) {
				const key = e.key.toLowerCase();
				if (pendingNavChordRef.current === "g" && hasWorkspaceContext) {
					pendingNavChordRef.current = null;
					if (chordTimeoutRef.current) {
						clearTimeout(chordTimeoutRef.current);
						chordTimeoutRef.current = null;
					}

					const base = `/${orgSlug}/${workspaceSlug}`;
					let destination: string | null = null;
					if (key === "i") destination = `${base}/inbox`;
					else if (key === "t") destination = `${base}/tasks`;
					else if (key === "s") destination = `${base}/settings`;
					else if (key === "p") destination = `${base}/projects`;
					else if (key === "c") destination = `${base}/clients`;
					else if (key === "d") destination = `${base}/docs`;
					else if (key === "b") destination = `${base}/boards`;

					if (destination) {
						e.preventDefault();
						// biome-ignore lint/suspicious/noExplicitAny: dynamic workspace paths
						router.push(destination as any);
						return;
					}
				}

				if (key === "g") {
					if (!hasWorkspaceContext) return;
					e.preventDefault();
					pendingNavChordRef.current = "g";
					if (chordTimeoutRef.current) clearTimeout(chordTimeoutRef.current);
					chordTimeoutRef.current = setTimeout(() => {
						pendingNavChordRef.current = null;
						chordTimeoutRef.current = null;
					}, 1000);
					return;
				}
			}

			// Issue-context shortcuts (require active issue)
			if (activeIssueId && !e.metaKey && !e.ctrlKey) {
				// Shift+M — set milestone
				if (e.shiftKey && e.key === "M") {
					e.preventDefault();
					setPropertyPicker("milestone");
					return;
				}

				// Shift+P — set project
				if (e.shiftKey && e.key === "P") {
					e.preventDefault();
					setPropertyPicker("project");
					return;
				}

				// Single key shortcuts (no shift)
				if (!e.shiftKey && !e.altKey) {
					switch (e.key) {
						case "s": {
							e.preventDefault();
							setPropertyPicker("status");
							return;
						}
						case "a": {
							e.preventDefault();
							setPropertyPicker("assignee");
							return;
						}
						case "p": {
							e.preventDefault();
							setPropertyPicker("priority");
							return;
						}
						case "l": {
							e.preventDefault();
							setPropertyPicker("labels");
							return;
						}
					}
				}
			}
		}

		document.addEventListener("keydown", handleKeyDown);
		return () => {
			document.removeEventListener("keydown", handleKeyDown);
			if (chordTimeoutRef.current) {
				clearTimeout(chordTimeoutRef.current);
				chordTimeoutRef.current = null;
			}
		};
	}, [activeIssueId, router, orgSlug, workspaceSlug, hasWorkspaceContext]);

	const value = useMemo<ShortcutContextValue>(
		() => ({
			helpOpen,
			toggleHelp,
			closeHelp,
			activeIssueId,
			setActiveIssueId,
			propertyPicker,
			openPropertyPicker,
			closePropertyPicker,
		}),
		[
			helpOpen,
			toggleHelp,
			closeHelp,
			activeIssueId,
			openPropertyPicker,
			closePropertyPicker,
			propertyPicker,
		],
	);

	return <ShortcutCtx.Provider value={value}>{children}</ShortcutCtx.Provider>;
}
