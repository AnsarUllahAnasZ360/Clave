"use client";

import {
	ArrowClockwise,
	CheckCircle,
	Circle,
	CircleNotch,
	Pause,
	Stop,
	Warning,
	XCircle,
} from "@phosphor-icons/react";
import { useCallback } from "react";
import { HumanInputPrompt } from "@/components/ai/HumanInputPrompt";
import { Button } from "@/components/ui/button";
import { useWorkflowStatus } from "@/hooks/use-workflow-status";
import { cn } from "@/lib/utils";
import type { Id } from "../../../convex/_generated/dataModel";

// ── Types ────────────────────────────────────────────────────────────────

interface WorkflowStatusCardProps {
	/** The workflowRuns document ID to subscribe to */
	workflowRunId: Id<"workflowRuns">;
	/** Optional callback when the user clicks "Retry" after a failure */
	onRetry?: () => void;
	/** Additional className for the card container */
	className?: string;
	/** Slot for children (e.g. HumanInputPrompt rendered when paused) */
	children?: React.ReactNode;
}

type StepStatus = "running" | "done" | "failed";

// ── Helpers ──────────────────────────────────────────────────────────────

function formatElapsed(ms: number): string {
	const totalSeconds = Math.floor(ms / 1000);
	if (totalSeconds < 60) return `${totalSeconds}s`;
	const minutes = Math.floor(totalSeconds / 60);
	const seconds = totalSeconds % 60;
	return `${minutes}m ${seconds}s`;
}

function StepIcon({ status }: { status: StepStatus }) {
	switch (status) {
		case "running":
			return (
				<CircleNotch
					weight="bold"
					className="size-4 shrink-0 animate-spin text-blue-500"
				/>
			);
		case "done":
			return (
				<CheckCircle
					weight="fill"
					className="size-4 shrink-0 text-emerald-500"
				/>
			);
		case "failed":
			return <XCircle weight="fill" className="size-4 shrink-0 text-red-500" />;
	}
}

function StatusHeader({
	status,
	taskDescription,
	hasPausePrompt,
}: {
	status: string | null;
	taskDescription: string | null;
	hasPausePrompt: boolean;
}) {
	const config = getStatusConfig(status);
	const label =
		status === "paused" && hasPausePrompt
			? "Waiting for your input"
			: config.label;
	return (
		<div className="flex items-center gap-2">
			{config.icon}
			<span className={cn("text-sm font-medium", config.textClass)}>
				{label}
			</span>
			{taskDescription && (
				<span className="truncate text-xs text-muted-foreground">
					— {taskDescription}
				</span>
			)}
		</div>
	);
}

function getStatusConfig(status: string | null) {
	switch (status) {
		case "running":
			return {
				label: "Workflow running...",
				icon: (
					<CircleNotch
						weight="bold"
						className="size-4 shrink-0 animate-spin text-blue-500"
					/>
				),
				textClass: "text-blue-600 dark:text-blue-400",
				borderClass: "border-blue-200 dark:border-blue-900/50",
				bgClass: "bg-blue-50/50 dark:bg-blue-950/20",
			};
		case "paused":
			return {
				label: "Workflow paused",
				icon: (
					<Pause weight="fill" className="size-4 shrink-0 text-amber-500" />
				),
				textClass: "text-amber-600 dark:text-amber-400",
				borderClass: "border-amber-200 dark:border-amber-900/50",
				bgClass: "bg-amber-50/50 dark:bg-amber-950/20",
			};
		case "completed":
			return {
				label: "Workflow completed",
				icon: (
					<CheckCircle
						weight="fill"
						className="size-4 shrink-0 text-emerald-500"
					/>
				),
				textClass: "text-emerald-600 dark:text-emerald-400",
				borderClass: "border-emerald-200 dark:border-emerald-900/50",
				bgClass: "bg-emerald-50/50 dark:bg-emerald-950/20",
			};
		case "failed":
			return {
				label: "Workflow failed",
				icon: (
					<XCircle weight="fill" className="size-4 shrink-0 text-red-500" />
				),
				textClass: "text-red-600 dark:text-red-400",
				borderClass: "border-red-200 dark:border-red-900/50",
				bgClass: "bg-red-50/50 dark:bg-red-950/20",
			};
		case "cancelled":
			return {
				label: "Workflow cancelled",
				icon: (
					<Stop
						weight="fill"
						className="size-4 shrink-0 text-muted-foreground"
					/>
				),
				textClass: "text-muted-foreground",
				borderClass: "border-border",
				bgClass: "bg-muted/30",
			};
		default:
			return {
				label: "Loading...",
				icon: <Circle className="size-4 shrink-0 text-muted-foreground" />,
				textClass: "text-muted-foreground",
				borderClass: "border-border",
				bgClass: "bg-muted/30",
			};
	}
}

// ── Component ────────────────────────────────────────────────────────────

/**
 * Displays real-time workflow progress inline in a chat thread.
 * Subscribes to the `workflowRuns` table via Convex reactive query,
 * showing step-by-step progress, elapsed time, and a cancel button.
 *
 * Accepts children for rendering nested UI (e.g. `HumanInputPrompt` from STORY-020).
 *
 * @example
 * ```tsx
 * // Inside a chat message list:
 * {message.workflowRunId && (
 *   <WorkflowStatusCard workflowRunId={message.workflowRunId} />
 * )}
 * ```
 */
export function WorkflowStatusCard({
	workflowRunId,
	onRetry,
	className,
	children,
}: WorkflowStatusCardProps) {
	const wf = useWorkflowStatus(workflowRunId);
	const config = getStatusConfig(wf.status);

	const handleCancel = useCallback(() => {
		wf.cancel();
	}, [wf.cancel]);

	// Loading state
	if (!wf.data) {
		return (
			<div
				className={cn(
					"w-full max-w-xs animate-pulse rounded-lg border p-3",
					className,
				)}
			>
				<div className="flex items-center gap-2">
					<CircleNotch className="size-4 animate-spin text-muted-foreground" />
					<span className="text-sm text-muted-foreground">
						Loading workflow...
					</span>
				</div>
			</div>
		);
	}

	return (
		<div
			className={cn(
				"w-full max-w-xs rounded-lg border p-3 transition-all duration-300",
				config.borderClass,
				config.bgClass,
				className,
			)}
		>
			{/* Header */}
			<StatusHeader
				status={wf.status}
				taskDescription={wf.taskDescription}
				hasPausePrompt={!!wf.pausePrompt}
			/>

			{/* Progress steps */}
			{wf.progress.length > 0 && (
				<div className="mt-2.5 space-y-1.5">
					{wf.progress.map(
						(step: { step: string; status: StepStatus; timestamp: number }) => (
							<div
								key={step.step}
								className={cn(
									"flex items-center gap-2 rounded-md px-2 py-1 text-xs transition-colors duration-200",
									step.status === "running" &&
										"bg-blue-100/60 text-blue-700 dark:bg-blue-900/20 dark:text-blue-300",
									step.status === "done" && "text-muted-foreground",
									step.status === "failed" && "text-red-600 dark:text-red-400",
								)}
							>
								<StepIcon status={step.status} />
								<span className="truncate">{step.step}</span>
							</div>
						),
					)}
				</div>
			)}

			{/* Human input prompt when paused, or children slot */}
			{wf.isPaused && wf.pausePrompt ? (
				<HumanInputPrompt
					workflowRunId={workflowRunId}
					pausePrompt={wf.pausePrompt}
					pauseOptions={wf.pauseOptions ?? undefined}
				/>
			) : (
				children
			)}

			{/* Footer: elapsed time + actions */}
			<div className="mt-2.5 flex items-center justify-between">
				<span className="text-[11px] tabular-nums text-muted-foreground">
					{formatElapsed(wf.elapsedMs)}
				</span>

				<div className="flex items-center gap-1.5">
					{/* Cancel button — only when running */}
					{wf.isRunning && (
						<Button
							variant="ghost"
							size="xs"
							onClick={handleCancel}
							className="text-destructive hover:bg-destructive/10 hover:text-destructive"
						>
							<Stop weight="bold" className="size-3" />
							Cancel
						</Button>
					)}

					{/* Retry button — only on failure */}
					{wf.isFailed && onRetry && (
						<Button
							variant="ghost"
							size="xs"
							onClick={onRetry}
							className="text-blue-600 hover:bg-blue-100/60 dark:text-blue-400 dark:hover:bg-blue-900/20"
						>
							<ArrowClockwise weight="bold" className="size-3" />
							Retry
						</Button>
					)}
				</div>
			</div>

			{/* Failure message */}
			{wf.isFailed && (
				<div className="mt-2 flex items-start gap-1.5 rounded-md bg-red-100/60 px-2 py-1.5 text-xs text-red-700 dark:bg-red-900/20 dark:text-red-300">
					<Warning weight="bold" className="mt-0.5 size-3 shrink-0" />
					<span>
						The workflow encountered an error.
						{onRetry ? " You can retry the task." : ""}
					</span>
				</div>
			)}

			{/* Cancelled message */}
			{wf.isCancelled && (
				<div className="mt-2 rounded-md bg-muted/50 px-2 py-1.5 text-xs text-muted-foreground">
					This workflow was cancelled.
				</div>
			)}
		</div>
	);
}
