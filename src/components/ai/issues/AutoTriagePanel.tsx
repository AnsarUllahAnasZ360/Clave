"use client";

import { SparklesIcon, X } from "lucide-react";
import { useWorkspace } from "@/components/providers/workspace-context";
import { Button } from "@/components/ui/button";
import type { TriageSuggestions } from "@/hooks/use-auto-triage";
import { useEffectiveIssueConfig } from "@/hooks/use-effective-issue-config";
import {
	getPriorityConfig,
	getTypeConfig,
	type IssueTypeKey,
	type PriorityKey,
} from "@/lib/issue-config";
import { cn } from "@/lib/utils";

// ── Type normalisation ──────────────────────────────────────────────────
// The AI may return type values that don't match our exact keys.
const TYPE_MAP: Record<string, IssueTypeKey> = {
	bug: "bug",
	feature: "feature",
	improvement: "improvement",
	issue: "issue",
	task: "issue",
	chore: "issue",
};

function normalizePriority(raw: string): PriorityKey {
	const valid: PriorityKey[] = [
		"urgent",
		"high",
		"medium",
		"low",
		"no_priority",
	];
	return valid.includes(raw as PriorityKey)
		? (raw as PriorityKey)
		: "no_priority";
}

function normalizeType(raw: string): IssueTypeKey {
	return TYPE_MAP[raw.toLowerCase()] ?? "issue";
}

// ── Props ────────────────────────────────────────────────────────────────

interface AutoTriagePanelProps {
	suggestions: TriageSuggestions;
	loading: boolean;
	onApply: (values: {
		priority: PriorityKey;
		issueType: IssueTypeKey;
		labelNames: string[];
	}) => void;
	onDismiss: () => void;
	compact?: boolean;
}

// ── Component ────────────────────────────────────────────────────────────

export function AutoTriagePanel({
	suggestions,
	loading,
	onApply,
	onDismiss,
	compact = false,
}: AutoTriagePanelProps) {
	const { workspaceId } = useWorkspace();
	const effective = useEffectiveIssueConfig(workspaceId);

	const priority = normalizePriority(suggestions.priority);
	const issueType = normalizeType(suggestions.type);
	const priorityCfg = getPriorityConfig(priority);
	const typeFromHook = effective.typeItems.find((t) => t.id === issueType);
	const typeFallback = getTypeConfig(issueType);
	const TypeIcon = typeFromHook?.icon ?? typeFallback.icon;
	const typeLabel = typeFromHook?.label ?? typeFallback.name;
	const typeColorHex = typeFromHook?.colorHex;
	const PriorityIcon = priorityCfg.icon;

	return (
		<div
			className={cn(
				"rounded-lg border border-sienna-500/20 bg-sienna-500/5 dark:bg-sienna-400/5",
				compact ? "px-3 py-2" : "px-4 py-3",
			)}
		>
			{/* Header */}
			<div className="flex items-center justify-between mb-2">
				<div className="flex items-center gap-1.5">
					<SparklesIcon className="h-3.5 w-3.5 text-sienna-500 dark:text-sienna-400" />
					<span className="text-xs font-medium text-sienna-600 dark:text-sienna-400">
						AI Suggestions
					</span>
				</div>
				<button
					type="button"
					onClick={onDismiss}
					className="h-5 w-5 min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0 rounded-sm flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors touch-manipulation"
					aria-label="Dismiss suggestions"
				>
					<X className="h-3 w-3" />
				</button>
			</div>

			{/* Suggestion chips */}
			<div
				className={cn("flex flex-wrap gap-2", compact ? "gap-1.5" : "gap-2")}
			>
				{/* Priority */}
				<div className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-background border border-border text-xs">
					<PriorityIcon className={cn("h-3 w-3", priorityCfg.color)} />
					<span>{priorityCfg.name}</span>
				</div>

				{/* Type */}
				<div className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-background border border-border text-xs">
					<TypeIcon
						className={cn("h-3 w-3", !typeColorHex && typeFallback.color)}
						style={typeColorHex ? { color: typeColorHex } : undefined}
					/>
					<span>{typeLabel}</span>
				</div>

				{/* Labels */}
				{suggestions.labels.map((label) => (
					<div
						key={label}
						className="px-2 py-0.5 rounded-md bg-background border border-border text-xs text-muted-foreground"
					>
						{label}
					</div>
				))}
			</div>

			{/* Reasoning */}
			{suggestions.reasoning && !compact && (
				<p className="mt-2 text-xs text-muted-foreground leading-relaxed break-words">
					{suggestions.reasoning}
				</p>
			)}

			{/* Actions */}
			<div className={cn("flex items-center gap-2", compact ? "mt-2" : "mt-3")}>
				<Button
					type="button"
					size="xs"
					variant="default"
					onClick={() =>
						onApply({
							priority,
							issueType,
							labelNames: suggestions.labels,
						})
					}
					disabled={loading}
					className="h-6 min-h-[44px] sm:min-h-0 px-2.5 text-xs touch-manipulation"
				>
					Apply Suggestions
				</Button>
				<Button
					type="button"
					size="xs"
					variant="ghost"
					onClick={onDismiss}
					className="h-6 min-h-[44px] sm:min-h-0 px-2.5 text-xs text-muted-foreground touch-manipulation"
				>
					Dismiss
				</Button>
			</div>
		</div>
	);
}

// ── Loading skeleton ─────────────────────────────────────────────────────

export function AutoTriagePanelSkeleton({
	compact = false,
}: {
	compact?: boolean;
}) {
	return (
		<div
			className={cn(
				"rounded-lg border border-sienna-500/20 bg-sienna-500/5 dark:bg-sienna-400/5 animate-pulse",
				compact ? "px-3 py-2" : "px-4 py-3",
			)}
		>
			<div className="flex items-center gap-1.5 mb-2">
				<SparklesIcon className="h-3.5 w-3.5 text-sienna-500/40 dark:text-sienna-400/40" />
				<span className="text-xs text-sienna-500/40 dark:text-sienna-400/40">
					AI is analyzing...
				</span>
			</div>
			<div className="flex gap-2">
				<div className="h-5 w-16 rounded-md bg-muted" />
				<div className="h-5 w-14 rounded-md bg-muted" />
				<div className="h-5 w-20 rounded-md bg-muted" />
			</div>
		</div>
	);
}
