"use client";

import { useQuery } from "convex/react";
import { CheckCircle2 } from "lucide-react";

import { cn } from "@/lib/utils";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

/**
 * Reusable badge showing sub-issue completion count (e.g., "3/5").
 * Renders nothing if the issue has no sub-issues.
 */
export function SubIssueCountBadge({
	issueId,
	className,
}: {
	issueId: Id<"issues">;
	className?: string;
}) {
	const progress = useQuery(api.issues.getProgress, { issueId });

	if (!progress) return null;

	const allDone = progress.completedCount === progress.subIssueCount;

	return (
		<span
			className={cn(
				"inline-flex items-center gap-1 text-xs text-muted-foreground",
				allDone && "text-emerald-500",
				className,
			)}
		>
			<CheckCircle2 className="h-3 w-3" />
			{progress.completedCount}/{progress.subIssueCount}
		</span>
	);
}
