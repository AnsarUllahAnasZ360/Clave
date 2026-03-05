"use client";

import { AlertTriangle, ExternalLink } from "lucide-react";
import type { DuplicateIssue } from "@/hooks/use-duplicate-detection";
import { getStatusConfig } from "@/lib/issue-config";
import { cn } from "@/lib/utils";

// ── Props ────────────────────────────────────────────────────────────────

interface DuplicateDetectionProps {
	duplicates: DuplicateIssue[];
	loading: boolean;
	/** Compact layout for quick create modal */
	compact?: boolean;
	/** Workspace slug for building issue links */
	workspaceSlug?: string;
}

// ── Component ────────────────────────────────────────────────────────────

export function DuplicateDetection({
	duplicates,
	loading,
	compact = false,
	workspaceSlug,
}: DuplicateDetectionProps) {
	if (loading) {
		return <DuplicateDetectionSkeleton compact={compact} />;
	}

	if (duplicates.length === 0) return null;

	const maxShow = compact ? 3 : 5;
	const shown = duplicates.slice(0, maxShow);

	return (
		<div
			className={cn(
				"rounded-lg border border-amber-500/20 bg-amber-500/5 dark:bg-amber-400/5",
				compact ? "px-3 py-2" : "px-4 py-3",
			)}
		>
			{/* Header */}
			<div className="flex items-center gap-1.5 mb-2">
				<AlertTriangle className="h-3.5 w-3.5 text-amber-500 dark:text-amber-400" />
				<span className="text-xs font-medium text-amber-600 dark:text-amber-400">
					Similar issues found
				</span>
				<span className="text-[10px] text-muted-foreground">
					({duplicates.length})
				</span>
			</div>

			{/* Issue list */}
			<div className="space-y-1">
				{shown.map((issue) => {
					const statusCfg = getStatusConfig(issue.status);
					const StatusIcon = statusCfg.icon;
					const issueUrl = workspaceSlug
						? `/${workspaceSlug}/issues/${issue._id}`
						: undefined;

					return (
						<div
							key={issue._id}
							className="flex items-center gap-2 group rounded-md px-2 py-1 hover:bg-background/80 transition-colors"
						>
							<StatusIcon
								className={cn("h-3.5 w-3.5 shrink-0", statusCfg.color)}
							/>
							<span className="text-[11px] font-mono text-muted-foreground shrink-0">
								{issue.identifier}
							</span>
							<span className="text-xs text-foreground truncate flex-1">
								{issue.title}
							</span>
							{issueUrl ? (
								<a
									href={issueUrl}
									target="_blank"
									rel="noopener noreferrer"
									className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
									title="View issue"
								>
									<ExternalLink className="h-3 w-3 text-muted-foreground hover:text-foreground" />
								</a>
							) : null}
						</div>
					);
				})}
			</div>
		</div>
	);
}

// ── Loading skeleton ─────────────────────────────────────────────────────

function DuplicateDetectionSkeleton({
	compact = false,
}: {
	compact?: boolean;
}) {
	return (
		<div
			className={cn(
				"rounded-lg border border-amber-500/20 bg-amber-500/5 dark:bg-amber-400/5 animate-pulse",
				compact ? "px-3 py-2" : "px-4 py-3",
			)}
		>
			<div className="flex items-center gap-1.5 mb-2">
				<AlertTriangle className="h-3.5 w-3.5 text-amber-500/40 dark:text-amber-400/40" />
				<span className="text-xs text-amber-500/40 dark:text-amber-400/40">
					Searching for similar issues...
				</span>
			</div>
			<div className="space-y-1.5">
				<div className="h-4 w-3/4 rounded bg-muted" />
				<div className="h-4 w-1/2 rounded bg-muted" />
			</div>
		</div>
	);
}
