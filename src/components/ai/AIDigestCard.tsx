"use client";

import {
	AlertCircle,
	CheckCircle2,
	ClipboardList,
	Loader2,
	MessageCircle,
	RefreshCw,
	SparklesIcon,
	X,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useWorkspace } from "@/components/providers/workspace-context";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useEmbeddedAI } from "@/hooks/use-embedded-ai";
import { cn } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────

interface DigestItem {
	text: string;
	entityType?: string | null;
	entityId?: string | null;
	issueIdentifier?: string | null;
}

interface DigestCategory {
	type: "urgent" | "needs_reply" | "good_news" | "review";
	label: string;
	items: DigestItem[];
}

interface DigestData {
	greeting?: string;
	categories?: DigestCategory[];
	isEmpty?: boolean;
}

// ── Category Config ───────────────────────────────────────────────────────

const CATEGORY_CONFIG: Record<
	string,
	{ icon: typeof AlertCircle; color: string; bgColor: string }
> = {
	urgent: {
		icon: AlertCircle,
		color: "text-red-500",
		bgColor: "bg-red-500/10",
	},
	needs_reply: {
		icon: MessageCircle,
		color: "text-amber-500",
		bgColor: "bg-amber-500/10",
	},
	good_news: {
		icon: CheckCircle2,
		color: "text-emerald-500",
		bgColor: "bg-emerald-500/10",
	},
	review: {
		icon: ClipboardList,
		color: "text-blue-500",
		bgColor: "bg-blue-500/10",
	},
};

const SESSION_KEY = "ai-digest-dismissed";

// ── Component ─────────────────────────────────────────────────────────────

export function AIDigestCard() {
	const { workspaceId, workspaceSlug } = useWorkspace();
	const { callEmbeddedAI, isLoading } = useEmbeddedAI();
	const [digestData, setDigestData] = useState<DigestData | null>(null);
	const [dismissed, setDismissed] = useState(false);
	const [hasError, setHasError] = useState(false);
	const fetchedRef = useRef(false);

	// Check sessionStorage on mount
	useEffect(() => {
		try {
			if (sessionStorage.getItem(SESSION_KEY) === "true") {
				setDismissed(true);
			}
		} catch {
			// sessionStorage unavailable
		}
	}, []);

	const fetchDigest = useCallback(async () => {
		setHasError(false);
		try {
			const result = await callEmbeddedAI({
				type: "notification_digest",
				context: { workspaceId },
			});
			if (result?.error) {
				setHasError(true);
				return;
			}
			if (result?.data) {
				setDigestData(result.data as DigestData);
			}
		} catch {
			setHasError(true);
		}
	}, [callEmbeddedAI, workspaceId]);

	// Fetch on mount (once)
	useEffect(() => {
		if (fetchedRef.current || dismissed) return;
		fetchedRef.current = true;
		void fetchDigest();
	}, [fetchDigest, dismissed]);

	const handleDismiss = useCallback(() => {
		setDismissed(true);
		try {
			sessionStorage.setItem(SESSION_KEY, "true");
		} catch {
			// sessionStorage unavailable
		}
	}, []);

	const handleRefresh = useCallback(() => {
		fetchedRef.current = false;
		void fetchDigest();
	}, [fetchDigest]);

	// Graceful degradation: hide if dismissed, error, or no data
	if (dismissed || hasError) return null;

	// Loading skeleton
	if (isLoading && !digestData) {
		return (
			<div className="mx-2 mt-2 rounded-lg border border-sienna-200/40 bg-sienna-50/30 p-4 dark:border-sienna-800/40 dark:bg-sienna-950/20">
				<div className="flex items-center gap-2 mb-2">
					<Loader2 className="h-4 w-4 animate-spin text-sienna-500 dark:text-sienna-400" />
					<span className="text-sm font-medium text-foreground">
						Generating your AI digest...
					</span>
				</div>
				<p className="mb-3 text-xs text-muted-foreground">
					Reading recent notifications and overdue work.
				</p>
				<div className="flex items-center gap-2 mb-2">
					<Skeleton className="h-2 w-2 rounded-full" />
					<Skeleton className="h-3 w-40" />
				</div>
				<div className="space-y-2">
					<Skeleton className="h-3 w-full" />
					<Skeleton className="h-3 w-3/4" />
					<Skeleton className="h-3 w-5/6" />
				</div>
			</div>
		);
	}

	// No data yet (still waiting for first fetch)
	if (!digestData) return null;

	// Empty inbox state
	if (digestData.isEmpty) {
		return (
			<div className="mx-2 mt-2 rounded-lg border border-emerald-200/40 bg-emerald-50/30 p-4 dark:border-emerald-800/40 dark:bg-emerald-950/20">
				<div className="flex items-center justify-between">
					<div className="flex items-center gap-2">
						<SparklesIcon className="h-4 w-4 text-sienna-500 dark:text-sienna-400" />
						<span className="text-sm font-medium text-foreground">
							{digestData.greeting ??
								"All clear! Nothing needs your attention today."}
						</span>
					</div>
					<Button
						size="xs"
						variant="ghost"
						onClick={handleDismiss}
						className="h-6 w-6 min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0 p-0 text-muted-foreground hover:text-foreground touch-manipulation"
					>
						<X className="h-3.5 w-3.5" />
					</Button>
				</div>
			</div>
		);
	}

	const categories =
		digestData.categories?.filter((c) => c.items.length > 0) ?? [];
	if (categories.length === 0) return null;

	return (
		<div className="mx-2 mt-2 rounded-lg border border-sienna-200/40 bg-sienna-50/30 p-4 dark:border-sienna-800/40 dark:bg-sienna-950/20">
			{/* Header */}
			<div className="flex items-center justify-between mb-3">
				<div className="flex items-center gap-2">
					<SparklesIcon className="h-4 w-4 text-sienna-500 dark:text-sienna-400" />
					<span className="text-sm font-medium text-foreground">
						{digestData.greeting ?? "Here's what matters today"}
					</span>
					{isLoading && (
						<span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
							<Loader2 className="h-3 w-3 animate-spin" />
							Refreshing
						</span>
					)}
				</div>
				<div className="flex items-center gap-1">
					<Button
						size="xs"
						variant="ghost"
						onClick={handleRefresh}
						disabled={isLoading}
						className="h-6 w-6 min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0 p-0 text-muted-foreground hover:text-foreground touch-manipulation"
					>
						<RefreshCw
							className={cn("h-3.5 w-3.5", isLoading && "animate-spin")}
						/>
					</Button>
					<Button
						size="xs"
						variant="ghost"
						onClick={handleDismiss}
						className="h-6 w-6 min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0 p-0 text-muted-foreground hover:text-foreground touch-manipulation"
					>
						<X className="h-3.5 w-3.5" />
					</Button>
				</div>
			</div>

			{/* Categories */}
			<div className="space-y-2">
				{categories.map((category) => {
					const config =
						CATEGORY_CONFIG[category.type] ?? CATEGORY_CONFIG.review;
					const Icon = config.icon;

					return (
						<div key={category.type} className="flex items-start gap-2">
							<span
								className={cn(
									"mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded",
									config.bgColor,
								)}
							>
								<Icon className={cn("h-3 w-3", config.color)} />
							</span>
							<div className="flex-1 min-w-0">
								<span className={cn("text-xs font-semibold", config.color)}>
									{category.label}:
								</span>
								<ul className="mt-0.5 space-y-0.5">
									{category.items.map((item, idx) => (
										<li
											key={`${category.type}-${idx}`}
											className="text-xs text-muted-foreground break-words"
										>
											{item.issueIdentifier ? (
												<Link
													href={`/${workspaceSlug}/issues/${item.issueIdentifier}`}
													className="hover:text-foreground hover:underline transition-colors"
													prefetch={false}
												>
													<span className="font-mono text-muted-foreground/70 mr-1">
														{item.issueIdentifier}
													</span>
													{item.text}
												</Link>
											) : (
												item.text
											)}
										</li>
									))}
								</ul>
							</div>
						</div>
					);
				})}
			</div>
		</div>
	);
}
