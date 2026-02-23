/**
 * Actions for the agent workflow system.
 * Kept separate from agentWorkflow.ts because Convex does not allow
 * non-action functions in Node.js runtime files ("use node").
 */

import { ConvexError, v } from "convex/values";
import { internal } from "../../_generated/api";
import type { Id } from "../../_generated/dataModel";
import { action, internalMutation } from "../../_generated/server";
import { requireWorkspaceMember } from "../../lib/auth";
import { workflow } from "../../workflow";
import { formatUserError } from "../errorHandling";
import { MAX_CONCURRENT_WORKFLOWS_PER_WORKSPACE } from "../rateLimiting";
import {
	parseHumanInputSignal,
	reportStepDone,
	reportStepFailed,
	reportStepStart,
	requestHumanInput,
} from "./helpers";
import { WORKFLOW_TIMEOUT_MS } from "./timeoutEnforcer";

const startAgentWorkflowArgs = {
	workspaceId: v.id("workspaces"),
	subAgentId: v.id("subAgents"),
	threadId: v.optional(v.string()),
	prompt: v.string(),
	taskDescription: v.string(),
	pageContext: v.optional(v.string()),
};

const initializeWorkflowRunArgs = {
	workspaceId: v.id("workspaces"),
	subAgentId: v.id("subAgents"),
	threadId: v.optional(v.string()),
	taskDescription: v.string(),
};

export const initializeWorkflowRun = internalMutation({
	args: initializeWorkflowRunArgs,
	returns: v.object({
		workflowRunId: v.id("workflowRuns"),
		userId: v.id("users"),
	}),
	handler: async (ctx, args) => {
		const { userId } = await requireWorkspaceMember(ctx, args.workspaceId);

		const activeRuns = await ctx.db
			.query("workflowRuns")
			.withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
			.collect();
		const activeCount = activeRuns.filter(
			(r) => r.status === "running" || r.status === "paused",
		).length;
		if (activeCount >= MAX_CONCURRENT_WORKFLOWS_PER_WORKSPACE) {
			throw new ConvexError(
				`Too many active workflows (${activeCount}/${MAX_CONCURRENT_WORKFLOWS_PER_WORKSPACE}). Please wait for some to complete before starting new ones.`,
			);
		}

		const workflowRunId = await ctx.db.insert("workflowRuns", {
			workspaceId: args.workspaceId,
			workflowId: "pending",
			threadId: args.threadId,
			subAgentId: args.subAgentId,
			userId,
			taskDescription: args.taskDescription,
			status: "running",
			progress: [
				{
					step: "Starting workflow",
					status: "running" as const,
					timestamp: Date.now(),
				},
			],
			startedAt: Date.now(),
		});

		return { workflowRunId, userId };
	},
});

export const updateWorkflowRunWorkflowId = internalMutation({
	args: {
		workflowRunId: v.id("workflowRuns"),
		workflowId: v.string(),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		await ctx.db.patch(args.workflowRunId, {
			workflowId: args.workflowId,
		});
		return null;
	},
});

/**
 * Durable step: Handle workflow completion.
 * Updates the workflowRuns record with the final threadId.
 */
export const stepHandleCompletion = internalMutation({
	args: {
		workflowRunId: v.id("workflowRuns"),
		threadId: v.string(),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const run = await ctx.db.get(args.workflowRunId);
		if (!run) {
			console.error(
				"[agentWorkflow] stepHandleCompletion: run not found:",
				args.workflowRunId,
			);
			return null;
		}

		if (!run.threadId) {
			await ctx.db.patch(args.workflowRunId, {
				threadId: args.threadId,
			});
		}

		return null;
	},
});

/**
 * Public action to start a workflow-backed sub-agent execution.
 * Creates a workflowRuns tracking record and kicks off the durable workflow.
 *
 * Called by invokeSubAgent when the complexity heuristic triggers.
 * Returns the workflowRunId for the client to subscribe to progress.
 */
export const startAgentWorkflow: ReturnType<typeof action> = action({
	args: startAgentWorkflowArgs,
	returns: v.id("workflowRuns"),
	handler: async (ctx, args): Promise<Id<"workflowRuns">> => {
		const { workflowRunId, userId } = await ctx.runMutation(
			internal.ai.workflows.agentWorkflow_mutations.initializeWorkflowRun,
			{
				workspaceId: args.workspaceId,
				subAgentId: args.subAgentId,
				threadId: args.threadId,
				taskDescription: args.taskDescription,
			},
		);

		const workflowId = await workflow.start(
			ctx,
			internal.ai.workflows.agentWorkflow_mutations.agentWorkflow,
			{
				workflowRunId,
				workspaceId: args.workspaceId,
				userId,
				subAgentId: args.subAgentId,
				threadId: args.threadId,
				prompt: args.prompt,
				taskDescription: args.taskDescription,
				pageContext: args.pageContext,
			},
			{
				onComplete: internal.ai.workflows.lifecycle.handleWorkflowComplete,
				context: { workflowRunId },
				startAsync: true,
			},
		);
		const workflowIdString = workflowId as string;

		await ctx.runMutation(
			internal.ai.workflows.agentWorkflow_mutations.updateWorkflowRunWorkflowId,
			{
				workflowRunId,
				workflowId: workflowIdString,
			},
		);

		await ctx.scheduler.runAfter(
			WORKFLOW_TIMEOUT_MS,
			internal.ai.workflows.timeoutEnforcer.checkTimeout,
			{ workflowRunId },
		);

		await ctx.runMutation(internal.ai.auditLog.logAction, {
			workspaceId: args.workspaceId,
			userId,
			subAgentId: args.subAgentId,
			action: "workflow_start",
			details: args.taskDescription.slice(0, 200),
			workflowId: workflowIdString,
		});

		return workflowRunId;
	},
});

// ── Workflow Definition ──────────────────────────────────────────────────

/**
 * Durable agent workflow: orchestrates sub-agent execution as a series of
 * retryable, durable steps with progress reporting and optional human input.
 *
 * Steps:
 * 1. Create/reuse thread (durable)
 * 2. Save user message (durable)
 * 3. Generate response (durable, with retry)
 * 4. Optional: pause for human input if agent signals it
 * 5. Handle completion (durable)
 */
export const agentWorkflow = workflow.define({
	args: {
		workflowRunId: v.id("workflowRuns"),
		workspaceId: v.id("workspaces"),
		userId: v.id("users"),
		subAgentId: v.id("subAgents"),
		threadId: v.optional(v.string()),
		prompt: v.string(),
		taskDescription: v.string(),
		pageContext: v.optional(v.string()),
	},
	returns: v.string(),
	handler: async (ctx, args): Promise<string> => {
		// Step 1: Create or reuse thread
		await reportStepStart(ctx, args.workflowRunId, "Creating thread");
		const { threadId } = await ctx.runAction(
			internal.ai.workflows.agentWorkflow.stepCreateThread,
			{
				subAgentId: args.subAgentId,
				workspaceId: args.workspaceId,
				userId: args.userId,
				existingThreadId: args.threadId,
			},
		);
		await reportStepDone(ctx, args.workflowRunId, "Creating thread");

		// Step 2: Save user message
		await reportStepStart(ctx, args.workflowRunId, "Saving message");
		await ctx.runAction(internal.ai.workflows.agentWorkflow.stepSaveMessage, {
			subAgentId: args.subAgentId,
			threadId,
			userId: args.userId,
			prompt: args.prompt,
		});
		await reportStepDone(ctx, args.workflowRunId, "Saving message");

		// Step 3: Generate response with explicit retry configuration
		await reportStepStart(ctx, args.workflowRunId, "Generating response");
		let text: string;
		try {
			const result = await ctx.runAction(
				internal.ai.workflows.agentWorkflow.stepGenerateResponse,
				{
					subAgentId: args.subAgentId,
					workspaceId: args.workspaceId,
					userId: args.userId,
					threadId,
					prompt: args.prompt,
					pageContext: args.pageContext,
				},
				{
					retry: {
						maxAttempts: 3,
						initialBackoffMs: 1000,
						base: 2,
					},
				},
			);
			text = result.text;
			await reportStepDone(ctx, args.workflowRunId, "Generating response");
		} catch (error) {
			await reportStepFailed(ctx, args.workflowRunId, "Generating response");
			const userMessage = formatUserError(error);
			await ctx.runMutation(
				internal.ai.workflows.lifecycle.updateWorkflowProgress,
				{
					workflowRunId: args.workflowRunId,
					step: `Error: ${userMessage}`,
					stepStatus: "failed" as const,
				},
			);
			throw error;
		}

		// Step 4 (optional): Check for human input signal in the agent's response
		const inputSignal = parseHumanInputSignal(text);
		if (
			inputSignal?.needsInput &&
			inputSignal.prompt &&
			inputSignal.options.length > 0
		) {
			await reportStepStart(ctx, args.workflowRunId, "Waiting for input");
			const { choice } = await requestHumanInput(
				ctx,
				args.workflowRunId,
				inputSignal.prompt,
				inputSignal.options,
			);
			await reportStepDone(ctx, args.workflowRunId, "Waiting for input");
			text += `\n\n[User selected: ${choice}]`;
		}

		// Step 5: Handle completion
		await reportStepStart(ctx, args.workflowRunId, "Completing");
		await ctx.runMutation(
			internal.ai.workflows.agentWorkflow_mutations.stepHandleCompletion,
			{
				workflowRunId: args.workflowRunId,
				threadId,
			},
		);
		await reportStepDone(ctx, args.workflowRunId, "Completing");

		return text;
	},
});
