/**
 * Sub-agent delegation tools for the main Clave AI agent.
 *
 * Provides two tools:
 * - `listAvailableSubAgents`: Discover available sub-agents in the workspace
 * - `delegateToSubAgent`: Delegate a task to a specialized sub-agent
 *
 * These tools enable the main agent to autonomously discover and delegate
 * work to specialized sub-agents during conversation.
 *
 * Uses makeFunctionReference instead of generated `api` imports to avoid
 * circular type dependencies (subAgentTool → api → agents → subAgentTool).
 *
 * @see STORY-006 for design context
 */
import { createTool } from "@convex-dev/agent";
import { makeFunctionReference } from "convex/server";
import { z } from "zod";
import type { Id } from "../_generated/dataModel";
import { resolveWorkspaceId } from "./tools/helpers";
import type { ToolContext } from "./tools/types";

// ── Function references ─────────────────────────────────────────────────
// Manual references avoid circular type deps through the generated API.

/** Reference to subAgents.list query (STORY-004: convex/ai/subAgents.ts) */
const listSubAgentsRef = makeFunctionReference<
	"query",
	{ workspaceId: Id<"workspaces"> },
	Array<{
		_id: Id<"subAgents">;
		_creationTime: number;
		workspaceId: Id<"workspaces">;
		name: string;
		description: string;
		avatar?: string;
		instructions: string;
		model?: string;
		enabledTools?: string[];
		ragContentTypes?: Array<"issue" | "document" | "comment" | "github_file">;
		isShared: boolean;
		isPreset: boolean;
		createdBy: Id<"users">;
		updatedAt: number;
	}>
>("ai/subAgents:list");

/** Reference to invokeSubAgentSync action (STORY-005: convex/ai/subAgentExecution.ts) */
const invokeSubAgentSyncRef = makeFunctionReference<
	"action",
	{
		subAgentId: Id<"subAgents">;
		threadId?: string;
		prompt: string;
		workspaceId: Id<"workspaces">;
	},
	{
		text?: string;
		threadId: string;
		error?: string;
	}
>("ai/subAgentExecution:invokeSubAgentSync");

// ── Tool 1: listAvailableSubAgents ──────────────────────────────────────

export const listAvailableSubAgents = createTool({
	description:
		"List all available sub-agents in the current workspace that can be delegated tasks to. Returns agent names, descriptions, and IDs. Call this before delegateToSubAgent to discover what specialists are available.",
	inputSchema: z.object({}),
	execute: async (ctx: ToolContext) => {
		const workspaceId = await resolveWorkspaceId(ctx);
		const agents = await ctx.runQuery(listSubAgentsRef, { workspaceId });
		return agents.map((a) => ({
			id: a._id,
			name: a.name,
			description: a.description,
		}));
	},
});

// ── Tool 2: delegateToSubAgent ──────────────────────────────────────────

export const delegateToSubAgent = createTool({
	description:
		"Delegate a task to a specialized sub-agent. The sub-agent will process the message using its specialized instructions and tools, then return a response. Use listAvailableSubAgents first to discover available agents and their IDs.",
	inputSchema: z.object({
		subAgentId: z.string().describe("The ID of the sub-agent to delegate to"),
		message: z
			.string()
			.describe("The task or question to send to the sub-agent"),
	}),
	execute: async (ctx: ToolContext, args) => {
		const workspaceId = await resolveWorkspaceId(ctx);
		try {
			const result = await ctx.runAction(invokeSubAgentSyncRef, {
				subAgentId: args.subAgentId as Id<"subAgents">,
				prompt: args.message,
				workspaceId,
			});
			if (result.error) {
				return `Sub-agent delegation failed: ${result.error}. Try a different sub-agent or rephrase your request.`;
			}
			return result.text ?? "Sub-agent returned no response.";
		} catch (error) {
			const message = error instanceof Error ? error.message : "Unknown error";
			return `Sub-agent delegation failed: ${message}. Try a different sub-agent or rephrase your request.`;
		}
	},
});

// ── Exports ─────────────────────────────────────────────────────────────

/** Combined sub-agent toolset for spreading into the agent's tools. */
export const subAgentTools = {
	listAvailableSubAgents,
	delegateToSubAgent,
};

/**
 * Get sub-agent tools for inclusion in an agent's tool set.
 * Tools resolve workspaceId from the thread context at call time,
 * so no workspace parameter is needed.
 */
export function getSubAgentTools() {
	return subAgentTools;
}
