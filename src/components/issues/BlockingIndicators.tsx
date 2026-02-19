"use client";

import { useQuery } from "convex/react";
import { ShieldAlert, ShieldBan } from "lucide-react";

import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

// ── Types ────────────────────────────────────────────────────────────────

interface BlockingIndicatorsProps {
	issueId: Id<"issues">;
	className?: string;
}

// ── Component ────────────────────────────────────────────────────────────

/**
 * Displays blocking/blocked-by indicators for an issue.
 * Orange shield = blocked by another issue.
 * Red shield = blocks another issue.
 * Renders nothing if no blocking relations exist.
 */
export function BlockingIndicators({
	issueId,
	className,
}: BlockingIndicatorsProps) {
	const relations = useQuery(api.issueRelations.listByIssue, { issueId });

	if (!relations) return null;

	const blocksCount = relations.blocks.length;
	const blockedByCount = relations.blocked_by.length;

	if (blocksCount === 0 && blockedByCount === 0) return null;

	return (
		<TooltipProvider delayDuration={200}>
			<div className={cn("flex items-center gap-1", className)}>
				{blockedByCount > 0 && (
					<Tooltip>
						<TooltipTrigger asChild>
							<span className="flex items-center">
								<ShieldBan className="h-3.5 w-3.5 text-orange-500" />
							</span>
						</TooltipTrigger>
						<TooltipContent side="top" className="text-xs">
							Blocked by {blockedByCount}{" "}
							{blockedByCount === 1 ? "issue" : "issues"}
						</TooltipContent>
					</Tooltip>
				)}
				{blocksCount > 0 && (
					<Tooltip>
						<TooltipTrigger asChild>
							<span className="flex items-center">
								<ShieldAlert className="h-3.5 w-3.5 text-red-500" />
							</span>
						</TooltipTrigger>
						<TooltipContent side="top" className="text-xs">
							Blocks {blocksCount} {blocksCount === 1 ? "issue" : "issues"}
						</TooltipContent>
					</Tooltip>
				)}
			</div>
		</TooltipProvider>
	);
}
