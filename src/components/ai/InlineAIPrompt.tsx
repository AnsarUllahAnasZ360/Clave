"use client";

import { SparklesIcon } from "lucide-react";
import { usePathname } from "next/navigation";
import {
	createContext,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { hasOpenOverlay, isTextInput } from "@/hooks/use-shortcuts";
import type {
	AIContext,
	AIContextPage,
	EmbeddedAIActionType,
} from "@/types/embedded-ai";

// ── Context Detection ────────────────────────────────────────────────────

export function detectAIContext(pathname: string | null): AIContext {
	if (!pathname) return { page: "global" };

	// Match /{orgSlug}/{workspaceSlug}/{section}/{id?}
	const segments = pathname.split("/").filter(Boolean);
	// segments: [orgSlug, workspaceSlug, section, id?]
	if (segments.length < 3) return { page: "global" };

	const section = segments[2];
	const entityId = segments[3];

	const sectionToPage: Record<string, AIContextPage> = {
		issues: "issue",
		docs: "document",
		boards: "whiteboard",
		projects: "project",
	};

	const page = sectionToPage[section];
	if (!page) return { page: "global" };

	return { page, entityId };
}

// ── Quick-Action Chips ───────────────────────────────────────────────────

export interface QuickAction {
	label: string;
	actionType: EmbeddedAIActionType;
}

export const QUICK_ACTIONS: Record<AIContextPage, QuickAction[]> = {
	issue: [
		{ label: "Summarize", actionType: "issue_summarize_activity" },
		{ label: "Draft reply", actionType: "issue_reply_comment" },
		{ label: "Find related", actionType: "issue_detect_duplicates" },
		{ label: "Triage", actionType: "issue_auto_triage" },
	],
	document: [
		{ label: "Summarize", actionType: "document_summarize" },
		{ label: "Continue writing", actionType: "document_continue" },
		{ label: "Improve", actionType: "document_improve" },
		{ label: "Translate", actionType: "document_translate" },
	],
	whiteboard: [
		{ label: "Explain this board", actionType: "whiteboard_explain_diagram" },
		{ label: "Generate diagram", actionType: "whiteboard_generate_diagram" },
		{ label: "Clean up", actionType: "whiteboard_cleanup_layout" },
	],
	project: [
		{ label: "Status summary", actionType: "project_status_summary" },
		{ label: "Plan sprint", actionType: "project_plan_sprint" },
	],
	global: [
		{ label: "Summarize", actionType: "document_summarize" },
		{ label: "Draft", actionType: "document_write_from_prompt" },
		{ label: "Search", actionType: "semantic_search" },
	],
};

function getContextHeaderText(context: AIContext): string {
	if (context.entityId) {
		const labels: Record<AIContextPage, string> = {
			issue: "Ask AI about this issue...",
			document: "Ask AI about this document...",
			whiteboard: "Ask AI about this board...",
			project: "Ask AI about this project...",
			global: "Ask AI anything...",
		};
		return labels[context.page];
	}

	const labels: Record<AIContextPage, string> = {
		issue: "Ask AI about issues...",
		document: "Ask AI about documents...",
		whiteboard: "Ask AI about boards...",
		project: "Ask AI about projects...",
		global: "Ask AI anything...",
	};
	return labels[context.page];
}

// ── Provider ─────────────────────────────────────────────────────────────

type InlineAIPromptContextValue = {
	isOpen: boolean;
	open: () => void;
	close: () => void;
	toggle: () => void;
};

const InlineAIPromptContext = createContext<InlineAIPromptContextValue | null>(
	null,
);

export function InlineAIPromptProvider({
	children,
}: {
	children: React.ReactNode;
}) {
	const [isOpen, setIsOpen] = useState(false);

	const open = useCallback(() => setIsOpen(true), []);
	const close = useCallback(() => setIsOpen(false), []);
	const toggle = useCallback(() => setIsOpen((prev) => !prev), []);

	// Cmd+I / Ctrl+I keyboard shortcut
	useEffect(() => {
		function handleKeyDown(e: KeyboardEvent) {
			if (!(e.metaKey || e.ctrlKey) || e.key !== "i") return;

			// Do not open when focus is in a text editor (preserves italic shortcut)
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
		() => ({ isOpen, open, close, toggle }),
		[isOpen, open, close, toggle],
	);

	return (
		<InlineAIPromptContext.Provider value={value}>
			{children}
		</InlineAIPromptContext.Provider>
	);
}

export function useInlineAIPrompt(): InlineAIPromptContextValue {
	const ctx = useContext(InlineAIPromptContext);
	if (!ctx) {
		throw new Error(
			"useInlineAIPrompt must be used within InlineAIPromptProvider",
		);
	}
	return ctx;
}

// ── Modal Component ──────────────────────────────────────────────────────

export function InlineAIPrompt() {
	const { isOpen, close } = useInlineAIPrompt();
	const pathname = usePathname();
	const context = detectAIContext(pathname);
	const quickActions = QUICK_ACTIONS[context.page];
	const headerText = getContextHeaderText(context);

	const [prompt, setPrompt] = useState("");
	const textareaRef = useRef<HTMLTextAreaElement>(null);

	// Auto-focus the textarea when the dialog opens
	useEffect(() => {
		if (isOpen) {
			setPrompt("");
			// Small delay to ensure the dialog DOM is ready
			const raf = requestAnimationFrame(() => {
				textareaRef.current?.focus();
			});
			return () => cancelAnimationFrame(raf);
		}
	}, [isOpen]);

	const handleSubmit = useCallback(
		(actionType?: EmbeddedAIActionType) => {
			const input = actionType ? "" : prompt.trim();
			if (!actionType && !input) return;

			// For now, log the action — STORY-025 will wire this to the AI dispatcher
			console.log("[InlineAIPrompt] submit:", {
				prompt: input || undefined,
				actionType,
				context,
			});

			close();
		},
		[prompt, context, close],
	);

	const handleKeyDown = useCallback(
		(e: React.KeyboardEvent<HTMLTextAreaElement>) => {
			if (e.key === "Enter" && !e.shiftKey) {
				e.preventDefault();
				handleSubmit();
			}
		},
		[handleSubmit],
	);

	return (
		<Dialog open={isOpen} onOpenChange={(open) => !open && close()}>
			<DialogContent
				showCloseButton={false}
				className="max-w-[calc(100vw-2rem)] sm:max-w-md max-h-[80vh]"
			>
				<DialogHeader>
					<DialogTitle className="flex items-center gap-2 text-base">
						<SparklesIcon className="size-4 text-sienna-500 dark:text-sienna-400" />
						{headerText}
					</DialogTitle>
					<DialogDescription className="sr-only">
						Type a prompt or select a quick action to ask AI for help.
					</DialogDescription>
				</DialogHeader>

				<div className="flex flex-col gap-3">
					<textarea
						ref={textareaRef}
						value={prompt}
						onChange={(e) => setPrompt(e.target.value)}
						onKeyDown={handleKeyDown}
						placeholder="Ask AI anything..."
						rows={3}
						className="w-full resize-none rounded-md border bg-transparent px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-sienna-400/50"
					/>

					{/* Quick-action chips */}
					<div className="flex flex-wrap gap-1.5">
						{quickActions.map((action) => (
							<button
								key={action.actionType}
								type="button"
								onClick={() => handleSubmit(action.actionType)}
								className="inline-flex items-center rounded-full border border-sienna-200 bg-sienna-50 px-2.5 py-1 text-xs font-medium text-sienna-700 transition-colors hover:bg-sienna-100 hover:border-sienna-300 dark:border-sienna-800 dark:bg-sienna-950 dark:text-sienna-300 dark:hover:bg-sienna-900 dark:hover:border-sienna-700 min-h-[44px] sm:min-h-0 touch-manipulation"
							>
								{action.label}
							</button>
						))}
					</div>

					{/* Submit */}
					<div className="flex justify-end">
						<Button
							size="sm"
							disabled={!prompt.trim()}
							onClick={() => handleSubmit()}
							className="bg-sienna-500 text-white hover:bg-sienna-600 dark:bg-sienna-600 dark:hover:bg-sienna-500"
						>
							<SparklesIcon className="size-3.5" />
							Ask AI
						</Button>
					</div>
				</div>
			</DialogContent>
		</Dialog>
	);
}
