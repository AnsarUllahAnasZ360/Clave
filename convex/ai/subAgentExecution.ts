"use node";

import { Agent } from "@convex-dev/agent";
import { stepCountIs } from "ai";
import { makeFunctionReference } from "convex/server";
import { v } from "convex/values";
import { api, components, internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import type { ActionCtx } from "../_generated/server";
import { action } from "../_generated/server";
import { classifyError } from "./errorHandling";
import { getComposedPrompt } from "./getComposedPrompt";
import { DEFAULT_CHAT_MODEL_ID, isSupportedChatModelId } from "./modelIds";
import { resolveChatModel } from "./providers";
import { createFilteredRagTool, type RagContentType } from "./ragFilter";
import { MAX_INVOCATIONS_PER_USER_PER_HOUR } from "./rateLimiting";
import { detectComplexity } from "./workflows/helpers";

// ── Types (explicit for circular reference workaround) ───────────────────

/** Return shape for invokeSubAgent and invokeSubAgentSync */
type InvokeResult = {
	text?: string;
	threadId: string;
	error?: string;
	workflowRunId?: Id<"workflowRuns">;
};

/** Sub-agent config shape from api.ai.subAgents.get */
type SubAgentConfig = {
	_id: Id<"subAgents">;
	_creationTime: number;
	workspaceId: Id<"workspaces">;
	name: string;
	description: string;
	avatar?: string;
	instructions: string;
	model?: string;
	enabledTools?: string[];
	ragContentTypes?: RagContentType[];
	isShared: boolean;
	isPreset: boolean;
	createdBy: Id<"users">;
	updatedAt: number;
};

// ── Audit Logging Helper ──────────────────────────────────────────────────

/** Reference to logAction internal mutation — uses makeFunctionReference to avoid codegen dependency */
const logActionRef = makeFunctionReference<
	"mutation",
	{
		workspaceId: Id<"workspaces">;
		userId: Id<"users">;
		subAgentId?: Id<"subAgents">;
		action: string;
		details?: string;
		threadId?: string;
		workflowId?: string;
	},
	null
>("ai/auditLog:logAction");

/** Non-blocking audit log call — never blocks the primary operation */
async function tryAuditLog(
	ctx: ActionCtx,
	args: {
		workspaceId: Id<"workspaces">;
		userId: Id<"users">;
		subAgentId?: Id<"subAgents">;
		action: string;
		details?: string;
		threadId?: string;
		workflowId?: string;
	},
) {
	try {
		await ctx.runMutation(logActionRef, args);
	} catch (error) {
		console.warn(
			"[subAgentExecution] audit log failed:",
			error instanceof Error ? error.message : error,
		);
	}
}

// ── Helpers ──────────────────────────────────────────────────────────────

/**
 * Resolve tools for a sub-agent based on its enabledTools and ragContentTypes config.
 *
 * Includes the RAG search tool (filtered by ragContentTypes when configured).
 * When ragContentTypes is undefined, the unfiltered default search tool is used.
 */
function resolveTools(
	_enabledTools?: string[],
	ragContentTypes?: RagContentType[],
): Record<string, ReturnType<typeof createFilteredRagTool>> {
	const filteredRagTool = createFilteredRagTool(ragContentTypes);
	return {
		searchProjectKnowledge: filteredRagTool,
	};
}

/**
 * Dynamically construct an Agent instance from a sub-agent's DB config.
 * Each invocation creates a fresh Agent — this is intentional since Agent
 * construction is lightweight; the expensive operation is the LLM call.
 *
 * The ragContentTypes field controls which content types the sub-agent's
 * RAG search tool can access. When undefined, all types are searchable.
 */
function constructAgent(config: {
	name: string;
	instructions: string;
	model?: string;
	enabledTools?: string[];
	ragContentTypes?: RagContentType[];
}) {
	const { model: modelInstance } = resolveChatModel(
		config.model ?? DEFAULT_CHAT_MODEL_ID,
	);
	const tools = resolveTools(config.enabledTools, config.ragContentTypes);

	return new Agent(components.agent, {
		name: config.name,
		languageModel: modelInstance,
		instructions: config.instructions,
		tools,
		stopWhen: stepCountIs(10),
	});
}

// ── Config Validation ─────────────────────────────────────────────────────

/**
 * Validate a sub-agent's configuration before execution.
 * Lenient: skips invalid items with warnings rather than failing.
 * Only throws ConfigValidationError if the agent is completely non-functional.
 */
function validateSubAgentConfig(config: SubAgentConfig): string[] {
	const warnings: string[] = [];

	// Validate model — resolveChatModel handles fallback, but log a warning
	if (config.model && !isSupportedChatModelId(config.model)) {
		warnings.push(
			`Model "${config.model}" is not available. Using default model instead.`,
		);
	}

	// Validate instructions are not empty
	if (!config.instructions || config.instructions.trim().length === 0) {
		warnings.push("Agent has empty instructions. Responses may be generic.");
	}

	if (warnings.length > 0) {
		console.warn(
			`[subAgentExecution] Config warnings for agent "${config.name}":`,
			warnings.join("; "),
		);
	}

	return warnings;
}

// ── Actions ──────────────────────────────────────────────────────────────

/**
 * Invoke a sub-agent with streaming response.
 * Loads the sub-agent config from DB, constructs a dynamic Agent,
 * creates or reuses a thread, and streams the response with
 * saveStreamDeltas for real-time frontend subscriptions.
 *
 * For complex/long-running tasks, routes execution through the durable
 * agent workflow (STORY-018) instead of direct execution. Returns
 * `workflowRunId` when the task is workflow-backed.
 */
export const invokeSubAgent = action({
	args: {
		subAgentId: v.id("subAgents"),
		threadId: v.optional(v.string()),
		prompt: v.string(),
		workspaceId: v.id("workspaces"),
		pageContext: v.optional(v.string()),
	},
	returns: v.object({
		text: v.optional(v.string()),
		threadId: v.string(),
		error: v.optional(v.string()),
		workflowRunId: v.optional(v.id("workflowRuns")),
	}),
	handler: async (ctx, args): Promise<InvokeResult> => {
		// Auth: verify workspace membership and get userId
		let userId: Id<"users">;
		try {
			userId = await ctx.runQuery(internal.ai.chatQueries.validateAuth, {
				workspaceId: args.workspaceId,
			});
		} catch {
			return {
				threadId: args.threadId ?? "",
				error: "Not authenticated or not a workspace member",
			};
		}

		// Rate limit: max invocations per user per hour
		// Uses makeFunctionReference to avoid depending on codegen for the new rateLimiting module
		const countRecentRef = makeFunctionReference<
			"query",
			{ userId: Id<"users"> },
			number
		>("ai/rateLimiting:countRecentUserInvocations");
		const recentCount: number = await ctx.runQuery(countRecentRef, { userId });
		if (recentCount >= MAX_INVOCATIONS_PER_USER_PER_HOUR) {
			return {
				threadId: args.threadId ?? "",
				error: `Rate limited: you've made ${recentCount} requests in the last hour (max ${MAX_INVOCATIONS_PER_USER_PER_HOUR}). Please wait before trying again.`,
			};
		}

		// Load sub-agent config (the get query also checks membership)
		const config: SubAgentConfig = await ctx.runQuery(api.ai.subAgents.get, {
			id: args.subAgentId,
		});
		if (!config) {
			return {
				threadId: args.threadId ?? "",
				error: "Sub-agent not found or access denied",
			};
		}

		// Verify workspace match
		if (config.workspaceId !== args.workspaceId) {
			return {
				threadId: args.threadId ?? "",
				error: "Sub-agent does not belong to this workspace",
			};
		}

		// Validate sub-agent config (lenient — logs warnings, continues)
		validateSubAgentConfig(config);

		// Audit log: record sub-agent invocation
		await tryAuditLog(ctx, {
			workspaceId: args.workspaceId,
			userId,
			subAgentId: args.subAgentId,
			action: "sub_agent_invoke",
			details: args.prompt.slice(0, 200),
			threadId: args.threadId,
		});

		// ── Complexity check: route long-running tasks through workflow ──
		if (detectComplexity(args.prompt, config)) {
			try {
				const workflowRunId: Id<"workflowRuns"> = await ctx.runAction(
					api.ai.workflows.agentWorkflow_mutations.startAgentWorkflow,
					{
						workspaceId: args.workspaceId,
						subAgentId: args.subAgentId,
						threadId: args.threadId,
						prompt: args.prompt,
						taskDescription: `${config.name}: ${args.prompt.slice(0, 200)}`,
						pageContext: args.pageContext,
					},
				);
				return {
					threadId: args.threadId ?? "",
					workflowRunId,
				};
			} catch (error) {
				console.error(
					"[subAgentExecution:invokeSubAgent] workflow start error:",
					error instanceof Error ? error.message : error,
				);
				// Fall through to direct execution on workflow start failure
			}
		}

		// ── Direct execution path (simple/short tasks) ──

		// Compose system prompt with attached skills
		const composedInstructions = await getComposedPrompt(ctx, {
			workspaceId: args.workspaceId,
			subAgentId: args.subAgentId,
			baseInstructions: config.instructions,
			pageContext: args.pageContext,
		});

		// Construct dynamic agent from DB config with composed instructions
		const agent = constructAgent({
			...config,
			instructions: composedInstructions,
		});

		// Create or reuse thread
		let threadId: string;
		if (args.threadId) {
			threadId = args.threadId;
		} else {
			const created = await agent.createThread(ctx, { userId });
			threadId = created.threadId;
		}

		// Stream response with delta persistence
		try {
			const result = await agent.streamText(
				ctx,
				{ threadId, userId },
				{
					prompt: args.prompt,
				},
				{
					saveStreamDeltas: { chunking: "word", throttleMs: 16 },
					contextOptions: { recentMessages: 20 },
				},
			);
			await result.consumeStream();
			return { text: await result.text, threadId };
		} catch (error) {
			const classified = classifyError(error);
			console.error(
				"[subAgentExecution:invokeSubAgent] streamText error:",
				error instanceof Error ? error.message : error,
				`| severity: ${classified.severity}, retryable: ${classified.retryable}`,
			);
			return {
				threadId,
				error: classified.userMessage,
			};
		}
	},
});

/**
 * Invoke a sub-agent with non-streaming response.
 * Same auth and config loading as invokeSubAgent, but uses generateText
 * instead of streamText. Useful for tool-call contexts (STORY-006)
 * where streaming is not needed.
 */
export const invokeSubAgentSync = action({
	args: {
		subAgentId: v.id("subAgents"),
		threadId: v.optional(v.string()),
		prompt: v.string(),
		workspaceId: v.id("workspaces"),
		pageContext: v.optional(v.string()),
	},
	returns: v.object({
		text: v.optional(v.string()),
		threadId: v.string(),
		error: v.optional(v.string()),
	}),
	handler: async (ctx, args) => {
		// Auth: verify workspace membership and get userId
		let userId: Id<"users">;
		try {
			userId = await ctx.runQuery(internal.ai.chatQueries.validateAuth, {
				workspaceId: args.workspaceId,
			});
		} catch {
			return {
				threadId: args.threadId ?? "",
				error: "Not authenticated or not a workspace member",
			};
		}

		// Load sub-agent config
		const config = await ctx.runQuery(api.ai.subAgents.get, {
			id: args.subAgentId,
		});
		if (!config) {
			return {
				threadId: args.threadId ?? "",
				error: "Sub-agent not found or access denied",
			};
		}

		// Verify workspace match
		if (config.workspaceId !== args.workspaceId) {
			return {
				threadId: args.threadId ?? "",
				error: "Sub-agent does not belong to this workspace",
			};
		}

		// Validate sub-agent config (lenient — logs warnings, continues)
		validateSubAgentConfig(config);

		// Compose system prompt with attached skills
		const composedInstructions = await getComposedPrompt(ctx, {
			workspaceId: args.workspaceId,
			subAgentId: args.subAgentId,
			baseInstructions: config.instructions,
			pageContext: args.pageContext,
		});

		// Construct dynamic agent from DB config with composed instructions
		const agent = constructAgent({
			...config,
			instructions: composedInstructions,
		});

		// Create or reuse thread
		let threadId: string;
		if (args.threadId) {
			threadId = args.threadId;
		} else {
			const created = await agent.createThread(ctx, { userId });
			threadId = created.threadId;
		}

		// Generate response (non-streaming)
		try {
			const result = await agent.generateText(
				ctx,
				{ threadId, userId },
				{
					prompt: args.prompt,
				},
				{
					contextOptions: { recentMessages: 20 },
				},
			);
			return { text: result.text, threadId };
		} catch (error) {
			const classified = classifyError(error);
			console.error(
				"[subAgentExecution:invokeSubAgentSync] generateText error:",
				error instanceof Error ? error.message : error,
				`| severity: ${classified.severity}, retryable: ${classified.retryable}`,
			);
			return {
				threadId,
				error: classified.userMessage,
			};
		}
	},
});
