"use client";

import {
	ArrowSquareOut,
	CaretDown,
	CaretUp,
	CheckCircle,
	Robot,
} from "@phosphor-icons/react";
import { useCallback, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

// ── Types ────────────────────────────────────────────────────────────────

export interface SubAgentResultCardProps {
	agentName: string;
	agentAvatar?: string;
	result: string;
	completedAt: number;
	threadId?: string;
	className?: string;
}

// ── Helpers ──────────────────────────────────────────────────────────────

const TRUNCATE_LENGTH = 500;

function formatRelativeTime(timestamp: number): string {
	const diffMs = Date.now() - timestamp;
	const diffSeconds = Math.floor(diffMs / 1000);
	if (diffSeconds < 60) return "just now";
	const diffMinutes = Math.floor(diffSeconds / 60);
	if (diffMinutes < 60) {
		return `${diffMinutes} minute${diffMinutes !== 1 ? "s" : ""} ago`;
	}
	const diffHours = Math.floor(diffMinutes / 60);
	return `${diffHours} hour${diffHours !== 1 ? "s" : ""} ago`;
}

function AgentIcon({ avatar }: { avatar?: string }) {
	if (avatar) {
		return <span className="text-base leading-none">{avatar}</span>;
	}
	return <Robot weight="duotone" className="size-4 text-emerald-500" />;
}

// ── Component ────────────────────────────────────────────────────────────

/**
 * Displays the result of a completed sub-agent invocation.
 *
 * Shows agent identity, a "Completed" badge, the result text (with
 * expand/collapse for long responses), an optional "View thread" link,
 * and a relative completion timestamp.
 */
export function SubAgentResultCard({
	agentName,
	agentAvatar,
	result,
	completedAt,
	threadId,
	className,
}: SubAgentResultCardProps) {
	const isLongResult = result.length > TRUNCATE_LENGTH;
	const [isExpanded, setIsExpanded] = useState(false);
	const toggleExpand = useCallback(() => setIsExpanded((prev) => !prev), []);

	const displayText =
		isLongResult && !isExpanded
			? `${result.slice(0, TRUNCATE_LENGTH)}...`
			: result;

	return (
		<div
			className={cn(
				"w-full max-w-sm rounded-lg border border-l-2 border-emerald-200 border-l-emerald-500 bg-emerald-50/50 p-3 transition-opacity duration-300 dark:border-emerald-900/50 dark:border-l-emerald-400 dark:bg-emerald-950/20",
				className,
			)}
		>
			{/* Header: agent identity + badge */}
			<div className="flex items-center justify-between">
				<div className="flex items-center gap-2">
					<div className="flex size-6 shrink-0 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/40">
						<AgentIcon avatar={agentAvatar} />
					</div>
					<span className="text-sm font-medium text-emerald-700 dark:text-emerald-300">
						{agentName}
					</span>
				</div>
				<Badge
					variant="secondary"
					className="gap-1 bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
				>
					<CheckCircle weight="fill" className="size-3" />
					Completed
				</Badge>
			</div>

			{/* Result body */}
			<div className="mt-2.5">
				<p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">
					{displayText}
				</p>

				{/* Show more/less toggle */}
				{isLongResult && (
					<button
						type="button"
						onClick={toggleExpand}
						className="mt-1.5 flex items-center gap-1 text-xs text-emerald-600 transition-colors hover:text-emerald-700 dark:text-emerald-400 dark:hover:text-emerald-300"
					>
						{isExpanded ? (
							<>
								<CaretUp weight="bold" className="size-3" />
								Show less
							</>
						) : (
							<>
								<CaretDown weight="bold" className="size-3" />
								Show more
							</>
						)}
					</button>
				)}
			</div>

			{/* Footer: thread link + timestamp */}
			<div className="mt-2.5 flex items-center justify-between">
				{threadId ? (
					<button
						type="button"
						onClick={() => {
							// TODO: Navigate to child thread view (out of scope for Sprint 4)
							console.log("[SubAgentResultCard] View thread:", threadId);
						}}
						className="flex items-center gap-1 text-xs text-emerald-600 transition-colors hover:text-emerald-700 dark:text-emerald-400 dark:hover:text-emerald-300"
					>
						<ArrowSquareOut weight="bold" className="size-3" />
						View thread
					</button>
				) : (
					<span />
				)}
				<span className="text-[11px] tabular-nums text-muted-foreground">
					{formatRelativeTime(completedAt)}
				</span>
			</div>
		</div>
	);
}
