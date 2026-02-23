"use client";

import { useMutation, useQuery } from "convex/react";
import { useCallback, useEffect, useState } from "react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";

/**
 * Convenience hook wrapping the `getWorkflowProgress` reactive subscription.
 * Returns derived state booleans, an auto-updating elapsed time, the current step,
 * and a `cancel()` callback.
 *
 * @example
 * ```tsx
 * const wf = useWorkflowStatus(workflowRunId);
 * if (wf.isRunning) return <Spinner />;
 * if (wf.isComplete) return <p>Done in {wf.elapsedMs}ms</p>;
 * ```
 */
export function useWorkflowStatus(
	workflowRunId: Id<"workflowRuns"> | undefined,
) {
	const data = useQuery(
		api.ai.workflows.lifecycle.getWorkflowProgress,
		workflowRunId ? { workflowRunId } : "skip",
	);

	const cancelMutation = useMutation(api.ai.workflows.lifecycle.cancelWorkflow);

	// Derived status booleans
	const status = data?.status ?? null;
	const isRunning = status === "running";
	const isPaused = status === "paused";
	const isComplete = status === "completed";
	const isFailed = status === "failed";
	const isCancelled = status === "cancelled";
	const isTerminal = isComplete || isFailed || isCancelled;

	// Current step: last progress entry with status "running"
	const progress = data?.progress ?? [];
	const currentStep =
		[...progress].reverse().find((p) => p.status === "running") ?? null;

	// Auto-updating elapsed time (client-side timer)
	const [elapsedMs, setElapsedMs] = useState(0);

	useEffect(() => {
		if (!data?.startedAt) {
			setElapsedMs(0);
			return;
		}

		// If terminal, compute final elapsed and stop
		if (isTerminal) {
			const end = data.completedAt ?? Date.now();
			setElapsedMs(end - data.startedAt);
			return;
		}

		// Update immediately, then tick every second
		setElapsedMs(Date.now() - data.startedAt);
		const interval = setInterval(() => {
			setElapsedMs(Date.now() - data.startedAt);
		}, 1000);

		return () => clearInterval(interval);
	}, [data?.startedAt, data?.completedAt, isTerminal]);

	// Cancel callback
	const cancel = useCallback(async () => {
		if (!workflowRunId) return;
		await cancelMutation({ workflowRunId });
	}, [workflowRunId, cancelMutation]);

	return {
		/** Raw data from the query (null if loading or not found) */
		data,
		/** Current workflow status */
		status,
		/** Step progress array */
		progress,
		/** Derived booleans */
		isRunning,
		isPaused,
		isComplete,
		isFailed,
		isCancelled,
		isTerminal,
		/** Milliseconds since workflow started (auto-updates while running) */
		elapsedMs,
		/** The currently executing step (last step with status "running"), or null */
		currentStep,
		/** Cancel the running workflow */
		cancel,
		/** Task description */
		taskDescription: data?.taskDescription ?? null,
		/** Pause prompt (when workflow is paused for human input) */
		pausePrompt: data?.pausePrompt ?? null,
		/** Pause options (when workflow is paused for human input) */
		pauseOptions: data?.pauseOptions ?? null,
	};
}
