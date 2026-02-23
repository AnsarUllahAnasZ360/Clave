"use client";

import {
	AlertTriangleIcon,
	CheckCircle2Icon,
	ChevronDownIcon,
	ChevronUpIcon,
	ClockIcon,
	Loader2Icon,
	SparklesIcon,
	XIcon,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { AIAssistButton } from "@/components/ai/AIAssistButton";
import { Button } from "@/components/ui/button";
import { useEmbeddedAI } from "@/hooks/use-embedded-ai";

// ── Types ──────────────────────────────────────────────────────────────────

type ProjectSummaryData = {
	status: "on_track" | "at_risk" | "behind";
	summary: string;
	highlights: string[];
	risks: string[];
	recommendation: string;
};

interface ProjectAISummaryProps {
	projectId: string;
	workspaceId: string;
}

// ── Cache helpers ──────────────────────────────────────────────────────────

const CACHE_PREFIX = "clave_ai_project_summary_";
const DISMISS_PREFIX = "clave_ai_project_summary_dismissed_";
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

function getCachedSummary(projectId: string): ProjectSummaryData | null {
	try {
		const raw = sessionStorage.getItem(`${CACHE_PREFIX}${projectId}`);
		if (!raw) return null;
		const parsed = JSON.parse(raw) as {
			data: ProjectSummaryData;
			ts: number;
		};
		if (Date.now() - parsed.ts > CACHE_TTL_MS) {
			sessionStorage.removeItem(`${CACHE_PREFIX}${projectId}`);
			return null;
		}
		return parsed.data;
	} catch {
		return null;
	}
}

function setCachedSummary(projectId: string, data: ProjectSummaryData): void {
	try {
		sessionStorage.setItem(
			`${CACHE_PREFIX}${projectId}`,
			JSON.stringify({ data, ts: Date.now() }),
		);
	} catch {
		// Storage full — ignore
	}
}

function isDismissed(projectId: string): boolean {
	try {
		return localStorage.getItem(`${DISMISS_PREFIX}${projectId}`) === "true";
	} catch {
		return false;
	}
}

function setDismissed(projectId: string, dismissed: boolean): void {
	try {
		if (dismissed) {
			localStorage.setItem(`${DISMISS_PREFIX}${projectId}`, "true");
		} else {
			localStorage.removeItem(`${DISMISS_PREFIX}${projectId}`);
		}
	} catch {
		// Storage unavailable — ignore
	}
}

// ── Status Config ──────────────────────────────────────────────────────────

const STATUS_CONFIG = {
	on_track: {
		label: "On Track",
		icon: CheckCircle2Icon,
		className:
			"bg-emerald-500/10 text-emerald-600 dark:bg-emerald-400/10 dark:text-emerald-400",
	},
	at_risk: {
		label: "At Risk",
		icon: AlertTriangleIcon,
		className:
			"bg-amber-500/10 text-amber-600 dark:bg-amber-400/10 dark:text-amber-400",
	},
	behind: {
		label: "Behind",
		icon: ClockIcon,
		className:
			"bg-red-500/10 text-red-600 dark:bg-red-400/10 dark:text-red-400",
	},
} as const;

// ── Component ──────────────────────────────────────────────────────────────

export function ProjectAISummary({
	projectId,
	workspaceId,
}: ProjectAISummaryProps) {
	const { callEmbeddedAI, isLoading } = useEmbeddedAI();
	const [summary, setSummary] = useState<ProjectSummaryData | null>(null);
	const [dismissed, setDismissedState] = useState(false);
	const [collapsed, setCollapsed] = useState(false);
	const [hasGenerated, setHasGenerated] = useState(false);

	// Load cached summary and dismiss preference on mount
	useEffect(() => {
		const cached = getCachedSummary(projectId);
		if (cached) {
			setSummary(cached);
			setHasGenerated(true);
		}
		setDismissedState(isDismissed(projectId));
	}, [projectId]);

	const handleGenerate = useCallback(async () => {
		try {
			const result = await callEmbeddedAI({
				type: "project_status_summary",
				context: { workspaceId, projectId },
			});

			if (!result || result.error) {
				toast.error(result?.error ?? "Failed to generate summary");
				return;
			}

			// Parse structured response
			let data: ProjectSummaryData;
			if (result.data && typeof result.data === "object") {
				data = result.data as ProjectSummaryData;
			} else {
				// Fallback: use text as summary
				data = {
					status: "on_track",
					summary: result.text ?? "No summary available.",
					highlights: [],
					risks: [],
					recommendation: "",
				};
			}

			setSummary(data);
			setHasGenerated(true);
			setCachedSummary(projectId, data);
		} catch {
			toast.error("Failed to generate project summary");
		}
	}, [callEmbeddedAI, workspaceId, projectId]);

	const handleDismiss = useCallback(() => {
		setDismissedState(true);
		setDismissed(projectId, true);
	}, [projectId]);

	const handleShow = useCallback(() => {
		setDismissedState(false);
		setDismissed(projectId, false);
	}, [projectId]);

	// Don't render if dismissed
	if (dismissed) {
		return (
			<button
				type="button"
				onClick={handleShow}
				className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors mb-2"
			>
				<SparklesIcon className="h-3 w-3 text-sienna-500 dark:text-sienna-400" />
				Show AI Summary
			</button>
		);
	}

	// CTA state: never generated before
	if (!hasGenerated && !isLoading) {
		return (
			<div className="rounded-lg border border-border bg-muted/30 p-4 mb-4">
				<div className="flex items-center justify-between">
					<div className="flex items-center gap-2">
						<SparklesIcon className="h-4 w-4 text-sienna-500 dark:text-sienna-400" />
						<span className="text-sm font-medium text-foreground">
							AI Project Summary
						</span>
					</div>
					<button
						type="button"
						onClick={handleDismiss}
						className="h-6 w-6 min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0 rounded-md flex items-center justify-center text-muted-foreground hover:bg-muted transition-colors touch-manipulation"
						aria-label="Dismiss"
					>
						<XIcon className="h-3.5 w-3.5" />
					</button>
				</div>
				<p className="text-sm text-muted-foreground mt-2 mb-3">
					Generate an AI-powered analysis of this project&apos;s health,
					progress, and risks.
				</p>
				<Button
					size="sm"
					onClick={handleGenerate}
					className="gap-1.5 bg-sienna-500 text-white hover:bg-sienna-600 dark:bg-sienna-600 dark:hover:bg-sienna-500"
				>
					<SparklesIcon className="h-3.5 w-3.5" />
					Generate Summary
				</Button>
			</div>
		);
	}

	// Loading skeleton
	if (isLoading) {
		return (
			<div className="rounded-lg border border-border bg-muted/30 p-4 mb-4 animate-pulse">
				<div className="flex items-center gap-2 mb-3">
					<Loader2Icon className="h-4 w-4 animate-spin text-sienna-500 dark:text-sienna-400" />
					<span className="text-sm font-medium text-foreground">
						Generating summary with GPT 5.2...
					</span>
				</div>
				<p className="mb-3 text-xs text-muted-foreground">
					Reviewing issue health, progress, and current risks.
				</p>
				<div className="space-y-2">
					<div className="h-3 w-3/4 rounded bg-muted" />
					<div className="h-3 w-1/2 rounded bg-muted" />
					<div className="h-3 w-2/3 rounded bg-muted" />
				</div>
			</div>
		);
	}

	// Summary card
	if (!summary) return null;

	const statusConfig = STATUS_CONFIG[summary.status] ?? STATUS_CONFIG.on_track;
	const StatusIcon = statusConfig.icon;

	return (
		<div className="rounded-lg border border-border bg-muted/30 p-4 mb-4">
			{/* Header */}
			<div className="flex items-center justify-between mb-3">
				<div className="flex items-center gap-2">
					<SparklesIcon className="h-4 w-4 text-sienna-500 dark:text-sienna-400" />
					<span className="text-sm font-medium text-foreground">
						AI Project Summary
					</span>
					<span
						className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${statusConfig.className}`}
					>
						<StatusIcon className="h-3 w-3" />
						{statusConfig.label}
					</span>
				</div>
				<div className="flex items-center gap-1">
					<AIAssistButton
						variant="icon"
						loading={isLoading}
						onClick={handleGenerate}
						aria-label="Refresh summary"
						className="h-6 w-6 min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0 touch-manipulation"
					/>
					<button
						type="button"
						onClick={() => setCollapsed((c) => !c)}
						className="h-6 w-6 min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0 rounded-md flex items-center justify-center text-muted-foreground hover:bg-muted transition-colors touch-manipulation"
						aria-label={collapsed ? "Expand" : "Collapse"}
					>
						{collapsed ? (
							<ChevronDownIcon className="h-3.5 w-3.5" />
						) : (
							<ChevronUpIcon className="h-3.5 w-3.5" />
						)}
					</button>
					<button
						type="button"
						onClick={handleDismiss}
						className="h-6 w-6 min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0 rounded-md flex items-center justify-center text-muted-foreground hover:bg-muted transition-colors touch-manipulation"
						aria-label="Dismiss"
					>
						<XIcon className="h-3.5 w-3.5" />
					</button>
				</div>
			</div>

			{/* Content — collapsible */}
			{!collapsed && (
				<div className="space-y-3">
					{/* Summary text */}
					<p className="text-sm text-foreground leading-relaxed break-words">
						{summary.summary}
					</p>

					{/* Highlights */}
					{summary.highlights.length > 0 && (
						<div>
							<h4 className="text-xs font-medium text-muted-foreground mb-1">
								Highlights
							</h4>
							<ul className="space-y-0.5">
								{summary.highlights.map((h) => (
									<li
										key={h}
										className="text-sm text-foreground flex items-start gap-1.5"
									>
										<span className="text-emerald-500 mt-0.5">•</span>
										{h}
									</li>
								))}
							</ul>
						</div>
					)}

					{/* Risks */}
					{summary.risks.length > 0 && (
						<div>
							<h4 className="text-xs font-medium text-muted-foreground mb-1">
								Risks
							</h4>
							<ul className="space-y-0.5">
								{summary.risks.map((r) => (
									<li
										key={r}
										className="text-sm text-foreground flex items-start gap-1.5"
									>
										<span className="text-amber-500 mt-0.5">•</span>
										{r}
									</li>
								))}
							</ul>
						</div>
					)}

					{/* Recommendation */}
					{summary.recommendation && (
						<div className="rounded-md bg-sienna-500/5 dark:bg-sienna-400/5 px-3 py-2">
							<h4 className="text-xs font-medium text-sienna-600 dark:text-sienna-400 mb-0.5">
								Recommendation
							</h4>
							<p className="text-sm text-foreground">
								{summary.recommendation}
							</p>
						</div>
					)}
				</div>
			)}
		</div>
	);
}
