import { v } from "convex/values";
import { api } from "../../_generated/api";
import type { Id } from "../../_generated/dataModel";
import { action } from "../../_generated/server";
import { workflow } from "../../workflow";
import {
	reportStepDone,
	reportStepFailed,
	reportStepStart,
	requestHumanInput,
} from "./helpers";

/**
 * Smoke-test workflow: verifies @convex-dev/workflow with progress streaming
 * and human-input pause/resume. Demonstrates:
 * - Step-by-step progress reporting via helpers
 * - Human-input pause point with `requestHumanInput`
 */
export const testWorkflow = workflow.define({
	args: {
		workspaceId: v.id("workspaces"),
		userId: v.id("users"),
		taskDescription: v.string(),
		workflowRunId: v.id("workflowRuns"),
	},
	returns: v.string(),
	handler: async (ctx, args): Promise<string> => {
		// Step 1: Initializing
		await reportStepStart(ctx, args.workflowRunId, "Initializing");
		console.log("[testWorkflow] Step 1: Initializing");
		await reportStepDone(ctx, args.workflowRunId, "Initializing");

		// Step 2: Processing
		await reportStepStart(ctx, args.workflowRunId, "Processing");
		console.log("[testWorkflow] Step 2: Processing");
		await reportStepDone(ctx, args.workflowRunId, "Processing");

		// Human-input pause point: ask user how to proceed
		const { choice } = await requestHumanInput(
			ctx,
			args.workflowRunId,
			"Continue with processing?",
			["Continue", "Skip", "Cancel"],
		);

		if (choice === "Cancel") {
			await reportStepFailed(ctx, args.workflowRunId, "Finalizing");
			return "Workflow cancelled by user";
		}

		// Step 3: Finalizing
		await reportStepStart(ctx, args.workflowRunId, "Finalizing");
		if (choice === "Skip") {
			console.log("[testWorkflow] Step 3: Skipped by user");
		} else {
			console.log("[testWorkflow] Step 3: Finalizing");
		}
		await reportStepDone(ctx, args.workflowRunId, "Finalizing");

		return `Smoke test workflow completed (user chose: ${choice})`;
	},
});

/**
 * Public action to start the test workflow via the lifecycle manager.
 * Uses startWorkflow mutation which creates a tracked workflowRuns record
 * and wires up the handleWorkflowComplete callback automatically.
 */
export const startTestWorkflow = action({
	args: {
		workspaceId: v.id("workspaces"),
	},
	returns: v.id("workflowRuns"),
	handler: async (ctx, args): Promise<Id<"workflowRuns">> => {
		const workflowRunId: Id<"workflowRuns"> = await ctx.runMutation(
			api.ai.workflows.lifecycle.startWorkflow,
			{
				workspaceId: args.workspaceId,
				taskDescription: "Smoke test workflow",
			},
		);
		return workflowRunId;
	},
});
