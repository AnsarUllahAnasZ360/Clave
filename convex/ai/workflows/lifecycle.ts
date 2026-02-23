import {
	defineEvent,
	vWorkflowId,
	type WorkflowId,
} from "@convex-dev/workflow";
import { ConvexError, v } from "convex/values";
import { internal } from "../../_generated/api";
import type { Id } from "../../_generated/dataModel";
import { internalMutation, mutation, query } from "../../_generated/server";
import { requireWorkspaceMember } from "../../lib/auth";
import { workflow } from "../../workflow";

// ── Human Input Event ───────────────────────────────────────────────────

/**
 * Typed event definition for human-input pause/resume pattern.
 * Workflows call `ctx.awaitEvent(humanInputEvent)` to pause for user input.
 * The UI calls `submitHumanInput` which uses `workflow.sendEvent` to resume.
 */
export const humanInputEvent = defineEvent({
	name: "humanInput" as const,
	validator: v.object({ choice: v.string() }),
});

// ── Shared validators ────────────────────────────────────────────────────

const workflowRunStatusValidator = v.union(
	v.literal("running"),
	v.literal("paused"),
	v.literal("completed"),
	v.literal("failed"),
	v.literal("cancelled"),
);

const progressStepValidator = v.object({
	step: v.string(),
	status: v.union(v.literal("running"), v.literal("done"), v.literal("failed")),
	timestamp: v.number(),
});

const workflowRunDocValidator = v.object({
	_id: v.id("workflowRuns"),
	_creationTime: v.number(),
	workspaceId: v.id("workspaces"),
	workflowId: v.string(),
	threadId: v.optional(v.string()),
	subAgentId: v.optional(v.id("subAgents")),
	userId: v.id("users"),
	taskDescription: v.string(),
	status: workflowRunStatusValidator,
	progress: v.optional(v.array(progressStepValidator)),
	pausePrompt: v.optional(v.string()),
	pauseOptions: v.optional(v.array(v.string())),
	startedAt: v.number(),
	completedAt: v.optional(v.number()),
});

// ── Start Workflow ───────────────────────────────────────────────────────

/**
 * Start a tracked workflow. Creates a workflowRuns record and kicks off the
 * underlying @convex-dev/workflow execution.
 *
 * Currently starts the test workflow (STORY-001). STORY-018 will extend this
 * to support agent workflows and other workflow types.
 */
export const startWorkflow = mutation({
	args: {
		workspaceId: v.id("workspaces"),
		taskDescription: v.string(),
		threadId: v.optional(v.string()),
		subAgentId: v.optional(v.id("subAgents")),
	},
	returns: v.id("workflowRuns"),
	handler: async (ctx, args) => {
		const { userId } = await requireWorkspaceMember(ctx, args.workspaceId);

		// Create tracking record first (with placeholder workflowId)
		const workflowRunId = await ctx.db.insert("workflowRuns", {
			workspaceId: args.workspaceId,
			workflowId: "pending",
			threadId: args.threadId,
			subAgentId: args.subAgentId,
			userId,
			taskDescription: args.taskDescription,
			status: "running",
			progress: [],
			startedAt: Date.now(),
		});

		// Start the actual workflow with onComplete callback.
		// startAsync: true makes workflow.start() return immediately with the
		// workflowId; actual execution is deferred to the workpool.
		const workflowId = await workflow.start(
			ctx,
			internal.ai.workflows.testWorkflow.testWorkflow,
			{
				workspaceId: args.workspaceId,
				userId,
				taskDescription: args.taskDescription,
				workflowRunId,
			},
			{
				onComplete: internal.ai.workflows.lifecycle.handleWorkflowComplete,
				context: { workflowRunId },
				startAsync: true,
			},
		);

		// Patch with the real workflow ID (the mutation is atomic)
		await ctx.db.patch(workflowRunId, {
			workflowId: workflowId as string,
		});

		return workflowRunId;
	},
});

// ── Get Workflow Status ─────────────────────────────────────────────────

/**
 * Get the full tracking document for a workflow run.
 * Primary subscription target for the chat UI.
 */
export const getWorkflowStatus = query({
	args: { workflowRunId: v.id("workflowRuns") },
	returns: v.union(workflowRunDocValidator, v.null()),
	handler: async (ctx, args) => {
		const run = await ctx.db.get(args.workflowRunId);
		if (!run) return null;

		// Verify the requesting user is a workspace member
		await requireWorkspaceMember(ctx, run.workspaceId);

		return run;
	},
});

// ── Cancel Workflow ─────────────────────────────────────────────────────

/**
 * Cancel a running workflow. Only the workflow owner or a workspace admin
 * can cancel. Idempotent for already-cancelled workflows.
 */
export const cancelWorkflow = mutation({
	args: { workflowRunId: v.id("workflowRuns") },
	returns: v.null(),
	handler: async (ctx, args) => {
		const run = await ctx.db.get(args.workflowRunId);
		if (!run) throw new ConvexError("Workflow run not found");

		// Auth: verify the user is the workflow owner or a workspace admin
		const { userId, member } = await requireWorkspaceMember(
			ctx,
			run.workspaceId,
		);
		if (run.userId !== userId && member.role !== "admin") {
			throw new ConvexError(
				"Only the workflow owner or workspace admin can cancel",
			);
		}

		// Idempotent: already cancelled — no-op
		if (run.status === "cancelled") {
			return null;
		}

		// Reject cancellation of other terminal states
		if (run.status === "completed" || run.status === "failed") {
			throw new ConvexError(
				`Cannot cancel a workflow with status "${run.status}"`,
			);
		}

		// Cancel the underlying @convex-dev/workflow execution
		await workflow.cancel(ctx, run.workflowId as WorkflowId);

		// Update tracking record
		await ctx.db.patch(args.workflowRunId, {
			status: "cancelled" as const,
			completedAt: Date.now(),
		});

		// Audit log: workflow cancel
		await ctx.runMutation(internal.ai.auditLog.logAction, {
			workspaceId: run.workspaceId,
			userId,
			action: "workflow_cancel",
			details: `Cancelled workflow: ${run.taskDescription.slice(0, 200)}`,
			workflowId: run.workflowId,
		});

		return null;
	},
});

// ── Handle Workflow Complete (internal callback) ────────────────────────

/**
 * Completion callback registered via onComplete when starting workflows.
 * Maps @convex-dev/workflow terminal states to our workflowRuns status:
 *   "success"  → "completed"
 *   "failed"   → "failed"
 *   "canceled" → "cancelled" (note double-L in our schema)
 */
export const handleWorkflowComplete = internalMutation({
	args: {
		workflowId: vWorkflowId,
		result: v.any(),
		context: v.any(),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const workflowRunId = args.context?.workflowRunId as
			| Id<"workflowRuns">
			| undefined;
		if (!workflowRunId) {
			console.error(
				"[lifecycle] handleWorkflowComplete: no workflowRunId in context",
			);
			return null;
		}

		const run = await ctx.db.get(workflowRunId);
		if (!run) {
			console.error(
				"[lifecycle] handleWorkflowComplete: run not found:",
				workflowRunId,
			);
			return null;
		}

		// Don't overwrite if already in a terminal state (e.g., user cancelled)
		if (
			run.status === "completed" ||
			run.status === "failed" ||
			run.status === "cancelled"
		) {
			return null;
		}

		// Map @convex-dev/workflow result kind to our status
		let status: "completed" | "failed" | "cancelled";
		if (args.result?.kind === "success") {
			status = "completed";
		} else if (
			args.result?.kind === "error" ||
			args.result?.kind === "failed"
		) {
			status = "failed";
		} else {
			// "canceled" (one L) → "cancelled" (double L)
			status = "cancelled";
		}

		await ctx.db.patch(workflowRunId, {
			status,
			completedAt: Date.now(),
		});

		return null;
	},
});

// ── Update Workflow Progress ────────────────────────────────────────────

/**
 * Internal mutation for workflows to report step-by-step progress.
 * Upserts a progress entry: updates an existing step by name, or appends a new one.
 * Called by workflow step handlers via helpers in `helpers.ts`.
 */
export const updateWorkflowProgress = internalMutation({
	args: {
		workflowRunId: v.id("workflowRuns"),
		step: v.string(),
		stepStatus: v.union(
			v.literal("running"),
			v.literal("done"),
			v.literal("failed"),
		),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const run = await ctx.db.get(args.workflowRunId);
		if (!run) {
			console.error(
				"[lifecycle] updateWorkflowProgress: run not found:",
				args.workflowRunId,
			);
			return null;
		}

		const progress = run.progress ?? [];
		const existingIndex = progress.findIndex((p) => p.step === args.step);
		const entry = {
			step: args.step,
			status: args.stepStatus,
			timestamp: Date.now(),
		};

		if (existingIndex >= 0) {
			progress[existingIndex] = entry;
		} else {
			progress.push(entry);
		}

		await ctx.db.patch(args.workflowRunId, { progress });
		return null;
	},
});

// ── Get Workflow Progress ───────────────────────────────────────────────

/**
 * Lightweight query for the progress card UI. Returns only
 * progress-relevant fields, avoiding the full workflowRuns document.
 */
export const getWorkflowProgress = query({
	args: { workflowRunId: v.id("workflowRuns") },
	returns: v.union(
		v.object({
			_id: v.id("workflowRuns"),
			status: workflowRunStatusValidator,
			progress: v.optional(v.array(progressStepValidator)),
			pausePrompt: v.optional(v.string()),
			pauseOptions: v.optional(v.array(v.string())),
			taskDescription: v.string(),
			startedAt: v.number(),
			completedAt: v.optional(v.number()),
		}),
		v.null(),
	),
	handler: async (ctx, args) => {
		const run = await ctx.db.get(args.workflowRunId);
		if (!run) return null;

		// Verify requesting user is a workspace member
		await requireWorkspaceMember(ctx, run.workspaceId);

		return {
			_id: run._id,
			status: run.status,
			progress: run.progress,
			pausePrompt: run.pausePrompt,
			pauseOptions: run.pauseOptions,
			taskDescription: run.taskDescription,
			startedAt: run.startedAt,
			completedAt: run.completedAt,
		};
	},
});

// ── Pause For Human Input ───────────────────────────────────────────────

/**
 * Internal mutation called by a workflow step right before `ctx.awaitEvent()`.
 * Sets the workflowRuns record to paused with the prompt and options for the UI.
 */
export const pauseForHumanInput = internalMutation({
	args: {
		workflowRunId: v.id("workflowRuns"),
		prompt: v.string(),
		options: v.array(v.string()),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const run = await ctx.db.get(args.workflowRunId);
		if (!run) {
			console.error(
				"[lifecycle] pauseForHumanInput: run not found:",
				args.workflowRunId,
			);
			return null;
		}

		await ctx.db.patch(args.workflowRunId, {
			status: "paused" as const,
			pausePrompt: args.prompt,
			pauseOptions: args.options,
		});
		return null;
	},
});

// ── Submit Human Input ──────────────────────────────────────────────────

/**
 * Public mutation for the UI to resume a paused workflow.
 * Validates auth, checks paused status, sends the event to resume the workflow,
 * and clears the pause fields.
 */
export const submitHumanInput = mutation({
	args: {
		workflowRunId: v.id("workflowRuns"),
		choice: v.string(),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const run = await ctx.db.get(args.workflowRunId);
		if (!run) throw new ConvexError("Workflow run not found");

		// Auth: verify the user is a workspace member
		const { userId } = await requireWorkspaceMember(ctx, run.workspaceId);

		// Guard: only paused workflows can receive human input
		if (run.status !== "paused") {
			throw new ConvexError(
				`Cannot submit input to a workflow with status "${run.status}"`,
			);
		}

		// Resume the workflow by sending the humanInput event
		await workflow.sendEvent(ctx, {
			...humanInputEvent,
			workflowId: run.workflowId as WorkflowId,
			value: { choice: args.choice },
		});

		// Update tracking record: back to running, clear pause fields
		const progress = run.progress ?? [];
		progress.push({
			step: `Human input: ${run.pausePrompt ?? "decision"}`,
			status: "done" as const,
			timestamp: Date.now(),
		});

		await ctx.db.patch(args.workflowRunId, {
			status: "running" as const,
			pausePrompt: undefined,
			pauseOptions: undefined,
			progress,
		});

		// Audit log: human input submission
		await ctx.runMutation(internal.ai.auditLog.logAction, {
			workspaceId: run.workspaceId,
			userId,
			action: "human_input_submit",
			details: `Choice: ${args.choice.slice(0, 200)}`,
			workflowId: run.workflowId,
		});

		return null;
	},
});

// ── List Workflow Runs ──────────────────────────────────────────────────

/**
 * List workflow runs for a workspace, ordered by most recent first.
 * Supports optional userId and status filters. Limited to 50 runs.
 */
export const listWorkflowRuns = query({
	args: {
		workspaceId: v.id("workspaces"),
		userId: v.optional(v.id("users")),
		status: v.optional(workflowRunStatusValidator),
	},
	returns: v.array(workflowRunDocValidator),
	handler: async (ctx, args) => {
		await requireWorkspaceMember(ctx, args.workspaceId);

		const runs = await ctx.db
			.query("workflowRuns")
			.withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
			.order("desc")
			.collect();

		// Apply optional filters in-memory
		let filtered = runs;
		if (args.userId) {
			filtered = filtered.filter((r) => r.userId === args.userId);
		}
		if (args.status) {
			filtered = filtered.filter((r) => r.status === args.status);
		}

		// Limit to 50 most recent runs
		return filtered.slice(0, 50);
	},
});

// ── Get Active Workflows ────────────────────────────────────────────────

/**
 * Get currently running or paused workflows for a workspace.
 * Used by the UI to show active workflow indicators.
 */
export const getActiveWorkflows = query({
	args: { workspaceId: v.id("workspaces") },
	returns: v.array(workflowRunDocValidator),
	handler: async (ctx, args) => {
		await requireWorkspaceMember(ctx, args.workspaceId);

		const runs = await ctx.db
			.query("workflowRuns")
			.withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
			.order("desc")
			.collect();

		return runs.filter((r) => r.status === "running" || r.status === "paused");
	},
});
