/**
 * Reusable workflow step helpers for progress reporting, human-input pause/resume,
 * complexity detection, and human input signal parsing.
 *
 * Usage in a workflow definition:
 * ```ts
 * export const myWorkflow = workflow.define({
 *   handler: async (ctx, args) => {
 *     await reportStepStart(ctx, workflowRunId, "Processing documents");
 *     await ctx.runAction(internal.ai.doSomething, { ... });
 *     await reportStepDone(ctx, workflowRunId, "Processing documents");
 *
 *     const { choice } = await requestHumanInput(
 *       ctx, workflowRunId, "Continue?", ["Yes", "No"]
 *     );
 *   },
 * });
 * ```
 */
import type { WorkflowCtx } from "@convex-dev/workflow";
import { internal } from "../../_generated/api";
import type { Id } from "../../_generated/dataModel";
import { humanInputEvent } from "./lifecycle";

// ── Complexity Detection ─────────────────────────────────────────────────

/** Keywords that indicate a long-running, multi-step AI task */
const COMPLEXITY_KEYWORDS = [
	"plan",
	"analyze",
	"review all",
	"comprehensive",
	"every",
	"summarize all",
	"audit",
	"compile a summary",
	"create a report",
	"evaluate all",
] as const;

/** Prompt length threshold (characters) above which tasks are considered complex */
const PROMPT_LENGTH_THRESHOLD = 2000;

/**
 * Minimal sub-agent config shape for complexity detection.
 * Uses optional `longRunning` flag for forward compatibility — the field
 * does not exist in the current subAgents schema but may be added later.
 * Index signature allows passing full sub-agent config objects.
 */
export interface SubAgentComplexityConfig {
	longRunning?: boolean;
	[key: string]: unknown;
}

/**
 * Determine whether a sub-agent task is likely to be long-running.
 *
 * The heuristic is intentionally conservative: it's better to run a short
 * task via workflow (minor overhead) than to miss a long task that times out.
 *
 * Triggers:
 * - Sub-agent config has `longRunning: true`
 * - Prompt length exceeds 2000 characters
 * - Prompt contains keywords indicating multi-step analysis
 */
export function detectComplexity(
	prompt: string,
	agentConfig?: SubAgentComplexityConfig,
): boolean {
	// Config flag takes priority
	if (agentConfig?.longRunning) return true;

	// Prompt length heuristic
	if (prompt.length > PROMPT_LENGTH_THRESHOLD) return true;

	// Keyword heuristic
	const lowerPrompt = prompt.toLowerCase();
	return COMPLEXITY_KEYWORDS.some((kw) => lowerPrompt.includes(kw));
}

// ── Human Input Signal Parsing ───────────────────────────────────────────

/** Structured signal extracted from an agent response requesting user input */
export interface HumanInputSignal {
	needsInput: true;
	prompt: string;
	options: string[];
}

/**
 * Parse an agent's response text for a structured human-input signal.
 *
 * The agent signals it needs user input by including a JSON block:
 * ```json
 * { "needsInput": true, "prompt": "How should I proceed?", "options": ["Option A", "Option B"] }
 * ```
 *
 * Returns the parsed signal if found, or `null` if the response does not
 * contain a valid input request.
 */
export function parseHumanInputSignal(
	response: string,
): HumanInputSignal | null {
	// Match a JSON code block containing needsInput
	const jsonBlockRegex =
		/```(?:json)?\s*\n?\s*(\{[\s\S]*?"needsInput"\s*:\s*true[\s\S]*?\})\s*\n?\s*```/;
	const match = response.match(jsonBlockRegex);
	if (!match?.[1]) return null;

	try {
		const parsed = JSON.parse(match[1]) as Record<string, unknown>;
		if (
			parsed.needsInput === true &&
			typeof parsed.prompt === "string" &&
			Array.isArray(parsed.options) &&
			parsed.options.length > 0 &&
			parsed.options.every((o: unknown) => typeof o === "string")
		) {
			return {
				needsInput: true,
				prompt: parsed.prompt,
				options: parsed.options as string[],
			};
		}
	} catch {
		// Invalid JSON — not a signal
	}

	return null;
}

// Type for the workflow step context (WorkflowCtx provides runMutation, awaitEvent, etc.)
type StepCtx = WorkflowCtx;

/**
 * Report that a workflow step has started.
 * Call at the beginning of each logical step in your workflow.
 */
export async function reportStepStart(
	ctx: StepCtx,
	workflowRunId: Id<"workflowRuns">,
	stepName: string,
): Promise<void> {
	await ctx.runMutation(
		internal.ai.workflows.lifecycle.updateWorkflowProgress,
		{
			workflowRunId,
			step: stepName,
			stepStatus: "running" as const,
		},
	);
}

/**
 * Report that a workflow step has completed successfully.
 * Call after the step's work finishes without error.
 */
export async function reportStepDone(
	ctx: StepCtx,
	workflowRunId: Id<"workflowRuns">,
	stepName: string,
): Promise<void> {
	await ctx.runMutation(
		internal.ai.workflows.lifecycle.updateWorkflowProgress,
		{
			workflowRunId,
			step: stepName,
			stepStatus: "done" as const,
		},
	);
}

/**
 * Report that a workflow step has failed.
 * Call when a step encounters an unrecoverable error.
 */
export async function reportStepFailed(
	ctx: StepCtx,
	workflowRunId: Id<"workflowRuns">,
	stepName: string,
): Promise<void> {
	await ctx.runMutation(
		internal.ai.workflows.lifecycle.updateWorkflowProgress,
		{
			workflowRunId,
			step: stepName,
			stepStatus: "failed" as const,
		},
	);
}

/**
 * Pause the workflow for human input and return the user's choice.
 *
 * 1. Updates the workflowRuns record to "paused" with the prompt and options
 * 2. Awaits the humanInput event (workflow suspends durably)
 * 3. Returns the user's choice string
 *
 * The UI calls `submitHumanInput` mutation to resume with the user's selection.
 */
export async function requestHumanInput(
	ctx: StepCtx,
	workflowRunId: Id<"workflowRuns">,
	prompt: string,
	options: string[],
): Promise<{ choice: string }> {
	// Mark the workflow as paused with the prompt and options for the UI
	await ctx.runMutation(internal.ai.workflows.lifecycle.pauseForHumanInput, {
		workflowRunId,
		prompt,
		options,
	});

	// Suspend the workflow until the user submits their choice
	const result = await ctx.awaitEvent(humanInputEvent);

	return { choice: result.choice };
}
