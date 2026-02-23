"use client";

import { CircleNotch, Robot } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { WorkflowStatusCard } from "@/components/ai/WorkflowStatusCard";
import { cn } from "@/lib/utils";
import type { Id } from "../../../convex/_generated/dataModel";

// ── Types ────────────────────────────────────────────────────────────────

export interface SubAgentProgressCardProps {
	agentName: string;
	agentAvatar?: string;
	executionType: "direct" | "workflow";
	workflowRunId?: Id<"workflowRuns">;
	startedAt: number;
	className?: string;
}

// ── Helpers ──────────────────────────────────────────────────────────────

function formatElapsed(ms: number): string {
	const totalSeconds = Math.floor(ms / 1000);
	if (totalSeconds < 60) return `< 1 min`;
	if (totalSeconds < 120) return "1 min";
	return `${Math.floor(totalSeconds / 60)} mins`;
}

function AgentIcon({ avatar }: { avatar?: string }) {
	if (avatar) {
		return <span className="text-base leading-none">{avatar}</span>;
	}
	return <Robot weight="duotone" className="size-4 text-blue-500" />;
}

// ── Component ────────────────────────────────────────────────────────────

/**
 * Displays inline progress while a sub-agent is processing a request.
 *
 * - **Direct execution**: shows "Thinking..." with a pulsing animation and elapsed time.
 * - **Workflow execution**: embeds `WorkflowStatusCard` to show step-by-step progress.
 */
export function SubAgentProgressCard({
	agentName,
	agentAvatar,
	executionType,
	workflowRunId,
	startedAt,
	className,
}: SubAgentProgressCardProps) {
	// Auto-updating elapsed time
	const [elapsedMs, setElapsedMs] = useState(() => Date.now() - startedAt);

	useEffect(() => {
		setElapsedMs(Date.now() - startedAt);
		const interval = setInterval(() => {
			setElapsedMs(Date.now() - startedAt);
		}, 1000);
		return () => clearInterval(interval);
	}, [startedAt]);

	return (
		<div
			className={cn(
				"w-full max-w-sm rounded-lg border border-blue-200 bg-blue-50/50 p-3 transition-opacity duration-300 dark:border-blue-900/50 dark:bg-blue-950/20",
				className,
			)}
		>
			{/* Agent header */}
			<div className="flex items-center gap-2">
				<div className="flex size-6 shrink-0 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-900/40">
					<AgentIcon avatar={agentAvatar} />
				</div>
				<span className="text-sm font-medium text-blue-700 dark:text-blue-300">
					{agentName}
				</span>
			</div>

			{executionType === "direct" ? (
				/* Direct execution: "Thinking..." with pulsing dots */
				<div className="mt-2.5">
					<div className="flex items-center gap-2">
						<CircleNotch
							weight="bold"
							className="size-4 shrink-0 animate-spin text-blue-500"
						/>
						<span className="text-sm text-blue-600 dark:text-blue-400">
							Thinking...
						</span>
					</div>
					<div className="mt-2 flex items-center gap-1.5">
						<span className="size-1.5 animate-pulse rounded-full bg-blue-400/60 [animation-delay:0ms]" />
						<span className="size-1.5 animate-pulse rounded-full bg-blue-400/60 [animation-delay:150ms]" />
						<span className="size-1.5 animate-pulse rounded-full bg-blue-400/60 [animation-delay:300ms]" />
					</div>
				</div>
			) : (
				/* Workflow execution: embed WorkflowStatusCard */
				workflowRunId && (
					<div className="mt-2.5">
						<WorkflowStatusCard workflowRunId={workflowRunId} />
					</div>
				)
			)}

			{/* Elapsed time footer */}
			<div className="mt-2 flex items-center justify-end">
				<span className="text-[11px] tabular-nums text-muted-foreground">
					{formatElapsed(elapsedMs)}
				</span>
			</div>
		</div>
	);
}
