"use node";

/**
 * Central utility for composing agent system prompts with skills.
 *
 * This is the single entry point for all prompt composition in the codebase.
 * Any code that invokes an agent should call `getComposedPrompt` rather than
 * building prompts manually.
 *
 * Runs inside Convex actions — uses `ctx.runQuery` to load skills from DB.
 */

import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import type { ActionCtx } from "../_generated/server";
import { composeSystemPrompt } from "./promptComposer";
import { parseSkillMarkdown } from "./skillParser";

// ── Types ───────────────────────────────────────────────────────────────────

export interface GetComposedPromptArgs {
	/** Workspace to load skills from */
	workspaceId: Id<"workspaces">;
	/** If provided, load skills attached to this sub-agent only */
	subAgentId?: Id<"subAgents">;
	/** Base agent instructions (always included first, never truncated) */
	baseInstructions: string;
	/** Page/entity context from the client */
	pageContext?: string;
	/** RAG search instructions based on content type filters */
	ragPrefix?: string;
	/** Max tokens for the skill section (default: 4000) */
	tokenBudget?: number;
}

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Load skills from the database, parse their markdown, and compose a full
 * system prompt ready for agent invocation.
 *
 * - When `subAgentId` is provided: loads only skills attached to that sub-agent
 *   via the `agentSkills` bridge table. If the sub-agent has zero attached skills,
 *   returns just the base instructions (no workspace-level fallback).
 * - When `subAgentId` is omitted: loads all enabled workspace skills.
 *   This is the path used by the main Clave AI agent.
 *
 * @param ctx - Convex action context (provides `ctx.runQuery`)
 * @param args - Composition arguments
 * @returns The fully composed system prompt string
 */
export async function getComposedPrompt(
	ctx: ActionCtx,
	args: GetComposedPromptArgs,
): Promise<string> {
	const {
		workspaceId,
		subAgentId,
		baseInstructions,
		pageContext,
		ragPrefix,
		tokenBudget,
	} = args;

	// ── Load skills from DB ───────────────────────────────────────────────

	let rawSkills: Array<{
		name: string;
		markdownContent: string;
		isEnabled: boolean;
		updatedAt: number;
	}>;

	if (subAgentId) {
		// Sub-agent path: load only attached skills via bridge table
		rawSkills = await ctx.runQuery(internal.ai.skills.listByAgentInternal, {
			subAgentId,
		});
	} else {
		// Main agent path: load all enabled workspace skills
		rawSkills = await ctx.runQuery(internal.ai.skills.listEnabled, {
			workspaceId,
		});
	}

	// Filter to only enabled skills (listEnabled already filters, but
	// listByAgentInternal returns all attached skills regardless of status)
	const enabledSkills = rawSkills.filter((s) => s.isEnabled);

	// If no skills, return base instructions with optional context sections
	if (enabledSkills.length === 0) {
		return composeSystemPrompt({
			baseInstructions,
			skills: [],
			pageContext,
			ragPrefix,
			tokenBudget,
		});
	}

	// ── Parse skills ──────────────────────────────────────────────────────

	const parsedSkills = enabledSkills.map((skill) => ({
		name: skill.name,
		parsed: parseSkillMarkdown(skill.markdownContent),
		updatedAt: skill.updatedAt,
	}));

	// ── Compose final prompt ──────────────────────────────────────────────

	return composeSystemPrompt({
		baseInstructions,
		skills: parsedSkills,
		pageContext,
		ragPrefix,
		tokenBudget,
	});
}
