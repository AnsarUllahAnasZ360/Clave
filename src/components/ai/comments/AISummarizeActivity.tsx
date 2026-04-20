"use client";

import { Loader2Icon, SparklesIcon, XIcon } from "lucide-react";
import {
	createContext,
	type ReactNode,
	useCallback,
	useContext,
	useMemo,
	useState,
} from "react";
import { toast } from "sonner";
import { useEmbeddedAI } from "@/hooks/use-embedded-ai";
import { cn } from "@/lib/utils";

// State for the summary is shared between the trigger button (which lives in
// the header's flex row, next to the All/Comments toggle) and the panel
// (which needs to render full-width below the header — a flex row child
// would be clamped to a sliver of width and the summary text would wrap one
// word per line, per prior bug report). Splitting into a provider + two
// sibling components lets the caller place each piece independently while
// still sharing one piece of state.

interface SummarizeState {
	summary: string | null;
	loading: boolean;
	canStart: boolean;
	start: () => void;
	dismiss: () => void;
}

const SummarizeContext = createContext<SummarizeState | null>(null);

function useSummarizeContext(): SummarizeState {
	const ctx = useContext(SummarizeContext);
	if (!ctx) {
		throw new Error(
			"AISummarize components must be rendered inside AISummarizeProvider",
		);
	}
	return ctx;
}

export interface AISummarizeProviderProps {
	workspaceId: string;
	issueId: string;
	/** Number of comments — trigger is disabled when 0. */
	commentCount: number;
	children: ReactNode;
}

export function AISummarizeProvider({
	workspaceId,
	issueId,
	commentCount,
	children,
}: AISummarizeProviderProps) {
	const { callEmbeddedAI } = useEmbeddedAI();
	const [loading, setLoading] = useState(false);
	const [summary, setSummary] = useState<string | null>(null);

	const start = useCallback(async () => {
		if (loading) return;
		setLoading(true);
		try {
			const result = await callEmbeddedAI({
				type: "issue_summarize_activity",
				context: { workspaceId, issueId },
			});
			if (result?.error) {
				toast.error("Failed to summarize activity");
				return;
			}
			if (result?.text) {
				setSummary(result.text);
			}
		} catch {
			toast.error("Failed to summarize activity");
		} finally {
			setLoading(false);
		}
	}, [loading, callEmbeddedAI, workspaceId, issueId]);

	const dismiss = useCallback(() => {
		setSummary(null);
	}, []);

	const value = useMemo<SummarizeState>(
		() => ({
			summary,
			loading,
			canStart: commentCount > 0,
			start,
			dismiss,
		}),
		[summary, loading, commentCount, start, dismiss],
	);

	return (
		<SummarizeContext.Provider value={value}>
			{children}
		</SummarizeContext.Provider>
	);
}

export function AISummarizeButton({ className }: { className?: string }) {
	const { loading, canStart, start } = useSummarizeContext();
	return (
		<button
			type="button"
			onClick={start}
			disabled={loading || !canStart}
			className={cn(
				"inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium transition-colors min-h-[44px] sm:min-h-0 touch-manipulation",
				"text-sienna-600 hover:bg-sienna-500/10 dark:text-sienna-400 dark:hover:bg-sienna-400/10",
				"disabled:opacity-40 disabled:pointer-events-none",
				className,
			)}
			title={
				canStart ? "Summarize activity with AI" : "No activity to summarize"
			}
		>
			{loading ? (
				<Loader2Icon className="h-3 w-3 animate-spin" />
			) : (
				<SparklesIcon className="h-3 w-3" />
			)}
			Summarize
		</button>
	);
}

export function AISummarizePanel({ className }: { className?: string }) {
	const { summary, loading, dismiss } = useSummarizeContext();
	if (!summary && !loading) return null;

	return (
		<div className={cn("w-full", className)}>
			{summary && (
				<div className="rounded-lg border border-sienna-200 bg-sienna-50/50 dark:border-sienna-800 dark:bg-sienna-950/30 animate-in fade-in slide-in-from-top-2 duration-200">
					<div className="flex items-center gap-1.5 px-3 py-1.5 border-b border-sienna-200/60 dark:border-sienna-800/60">
						<SparklesIcon className="size-3.5 text-sienna-500 dark:text-sienna-400 shrink-0" />
						<span className="text-xs font-medium text-sienna-600 dark:text-sienna-400">
							Activity Summary
						</span>
						<button
							type="button"
							onClick={dismiss}
							className="ml-auto p-0.5 rounded min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors touch-manipulation"
							aria-label="Dismiss summary"
						>
							<XIcon className="size-3" />
						</button>
					</div>
					<div className="px-3 py-2.5 text-sm text-foreground leading-relaxed whitespace-pre-wrap break-words">
						{summary}
					</div>
				</div>
			)}
			{loading && !summary && (
				<div className="rounded-lg border border-sienna-200/60 bg-sienna-50/30 dark:border-sienna-800/60 dark:bg-sienna-950/20 p-3 space-y-2 animate-pulse">
					<div className="h-3 w-3/4 rounded bg-sienna-200/50 dark:bg-sienna-800/50" />
					<div className="h-3 w-full rounded bg-sienna-200/40 dark:bg-sienna-800/40" />
					<div className="h-3 w-5/6 rounded bg-sienna-200/30 dark:bg-sienna-800/30" />
					<div className="h-3 w-2/3 rounded bg-sienna-200/20 dark:bg-sienna-800/20" />
				</div>
			)}
		</div>
	);
}
