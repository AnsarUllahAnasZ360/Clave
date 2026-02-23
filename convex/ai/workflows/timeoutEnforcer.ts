/**
 * Workflow timeout enforcement.
 *
 * Scheduled via ctx.scheduler.runAfter(30 minutes) when a workflow starts.
 * If the workflow is still running/paused when the timeout fires, it gets
 * cancelled with a clear timeout error message.
 *
 * Idempotent: if the workflow already completed or was cancelled, the
 * timeout check is a no-op.
 *
 * @see STORY-023 for design context
 */

import type { WorkflowId } from "@convex-dev/workflow";
import { v } from "convex/values";
import { internalMutation } from "../../_generated/server";
import { workflow } from "../../workflow";

/** Hard timeout for workflows: 30 minutes */
export const WORKFLOW_TIMEOUT_MS = 30 * 60 * 1000;

/**
 * Internal mutation scheduled at workflow start time.
 * Checks if the workflow is still active and cancels it with a timeout error.
 */
export const checkTimeout = internalMutation({
	args: {
		workflowRunId: v.id("workflowRuns"),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const run = await ctx.db.get(args.workflowRunId);
		if (!run) {
			// Workflow run record was deleted — nothing to do
			return null;
		}

		// Idempotent: only act on active workflows
		if (
			run.status === "completed" ||
			run.status === "failed" ||
			run.status === "cancelled"
		) {
			return null;
		}

		const elapsed = Date.now() - run.startedAt;

		// Cancel the underlying workflow engine
		try {
			await workflow.cancel(ctx, run.workflowId as WorkflowId);
		} catch (error) {
			// Workflow may have already completed between our check and cancel.
			// This is expected — log and continue to update our tracking record.
			console.warn(
				`[timeoutEnforcer] Could not cancel workflow ${run.workflowId}:`,
				error instanceof Error ? error.message : error,
			);
		}

		// Update tracking record with timeout status
		const progress = run.progress ?? [];
		progress.push({
			step: "Timed out",
			status: "failed" as const,
			timestamp: Date.now(),
		});

		await ctx.db.patch(args.workflowRunId, {
			status: "failed" as const,
			completedAt: Date.now(),
			progress,
		});

		console.warn(
			`[timeoutEnforcer] Workflow ${args.workflowRunId} timed out after ${Math.round(elapsed / 60000)} minutes`,
		);

		return null;
	},
});
