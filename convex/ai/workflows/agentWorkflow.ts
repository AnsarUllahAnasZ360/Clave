"use node";

/**
 * Durable agent workflow for long-running sub-agent tasks.
 *
 * Wraps sub-agent execution in a Convex Workflow so that tasks >5 minutes
 * survive restarts, get automatic retry on transient failures, support
 * progress streaming, and can pause for human input.
 *
 * @see STORY-018 for design context
 * @see convex/ai/workflows/lifecycle.ts for workflow management (start, cancel, status)
 * @see convex/ai/workflows/helpers.ts for step reporting and complexity detection
 */

import { Agent } from "@convex-dev/agent";
import { stepCountIs } from "ai";
import { v } from "convex/values";
import { components, internal } from "../../_generated/api";
import { internalAction } from "../../_generated/server";
import { getComposedPrompt } from "../getComposedPrompt";
import { DEFAULT_CHAT_MODEL_ID } from "../modelIds";
import { resolveChatModel } from "../providers";
import { createFilteredRagTool, type RagContentType } from "../ragFilter";

// ── Agent Construction (mirrors subAgentExecution.ts) ────────────────────

function resolveTools(
	_enabledTools?: string[],
	ragContentTypes?: RagContentType[],
): Record<string, ReturnType<typeof createFilteredRagTool>> {
	const filteredRagTool = createFilteredRagTool(ragContentTypes);
	return { searchProjectKnowledge: filteredRagTool };
}

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

// ── Step Functions ───────────────────────────────────────────────────────

/**
 * Durable step: Create or reuse a thread for the sub-agent conversation.
 * Runs as an internalAction so it can use the Agent API.
 */
export const stepCreateThread = internalAction({
	args: {
		subAgentId: v.id("subAgents"),
		workspaceId: v.id("workspaces"),
		userId: v.id("users"),
		existingThreadId: v.optional(v.string()),
	},
	returns: v.object({ threadId: v.string() }),
	handler: async (ctx, args) => {
		// If an existing thread was provided, reuse it
		if (args.existingThreadId) {
			return { threadId: args.existingThreadId };
		}

		// Load sub-agent config via internal query (no auth needed)
		const config = await ctx.runQuery(internal.ai.subAgents.getInternal, {
			id: args.subAgentId,
		});
		if (!config) {
			throw new Error(`Sub-agent ${args.subAgentId} not found`);
		}

		// Construct agent and create a new thread
		const agent = constructAgent(config);
		const { threadId } = await agent.createThread(ctx, {
			userId: args.userId,
		});

		return { threadId };
	},
});

/**
 * Durable step: Save the user's prompt message to the thread.
 * Uses the Agent API to save a user message before generation.
 */
export const stepSaveMessage = internalAction({
	args: {
		subAgentId: v.id("subAgents"),
		threadId: v.string(),
		userId: v.id("users"),
		prompt: v.string(),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const config = await ctx.runQuery(internal.ai.subAgents.getInternal, {
			id: args.subAgentId,
		});
		if (!config) {
			throw new Error(`Sub-agent ${args.subAgentId} not found`);
		}

		const agent = constructAgent(config);
		await agent.saveMessages(ctx, {
			threadId: args.threadId,
			userId: args.userId,
			messages: [{ role: "user", content: args.prompt }],
		});

		return null;
	},
});

/**
 * Durable step: Generate the agent's response.
 * This is the most expensive step — has automatic retry from the WorkflowManager.
 * Loads sub-agent config, composes prompt with skills, and generates text.
 */
export const stepGenerateResponse = internalAction({
	args: {
		subAgentId: v.id("subAgents"),
		workspaceId: v.id("workspaces"),
		userId: v.id("users"),
		threadId: v.string(),
		prompt: v.string(),
		pageContext: v.optional(v.string()),
	},
	returns: v.object({ text: v.string() }),
	handler: async (ctx, args) => {
		// Load sub-agent config
		const config = await ctx.runQuery(internal.ai.subAgents.getInternal, {
			id: args.subAgentId,
		});
		if (!config) {
			throw new Error(`Sub-agent ${args.subAgentId} not found`);
		}

		// Compose system prompt with attached skills
		const composedInstructions = await getComposedPrompt(ctx, {
			workspaceId: args.workspaceId,
			subAgentId: args.subAgentId,
			baseInstructions: config.instructions,
			pageContext: args.pageContext,
		});

		// Construct agent with composed instructions
		const agent = constructAgent({
			...config,
			instructions: composedInstructions,
		});

		// Generate response (non-streaming for workflow durability)
		const result = await agent.generateText(
			ctx,
			{ threadId: args.threadId, userId: args.userId },
			{ prompt: args.prompt },
			{ contextOptions: { recentMessages: 20 } },
		);

		return { text: result.text };
	},
});
