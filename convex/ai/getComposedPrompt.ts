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

// ── Skills cache (module-level, persists across calls in the same process) ───

type ParsedSkillEntry = {
	name: string;
	parsed: ReturnType<typeof parseSkillMarkdown>;
	updatedAt: number;
};

type SkillsCacheValue = {
	data: ParsedSkillEntry[];
	timestamp: number;
};

const SKILLS_CACHE_TTL = 60_000; // 60 seconds
const skillsCache = new Map<string, SkillsCacheValue>();

// ── Types ───────────────────────────────────────────────────────────────────

export interface GetComposedPromptArgs {
	/** Workspace to load skills from */
	workspaceId: Id<"workspaces">;
	/** If provided, load skills attached to this sub-agent only */
	subAgentId?: Id<"subAgents">;
	/** Explicit skill IDs to load. If empty/undefined, no skills are loaded. */
	selectedSkillIds?: Id<"skills">[];
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
 * Loading priority:
 * 1. `subAgentId` — loads only skills attached to that sub-agent
 * 2. `selectedSkillIds` — loads only the specified skills (on-demand)
 * 3. Neither — loads zero skills (on-demand model: user must select)
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
		selectedSkillIds,
		baseInstructions,
		pageContext,
		ragPrefix,
		tokenBudget,
	} = args;

	// ── Load + parse skills (with TTL cache) ────────────────────────────────

	const sortedIds = selectedSkillIds
		? [...selectedSkillIds].sort().join(",")
		: "";
	const cacheKey = subAgentId
		? `agent:${subAgentId}`
		: `ws:${workspaceId}:skills:${sortedIds}`;
	const cached = skillsCache.get(cacheKey);
	let parsedSkills: ParsedSkillEntry[];

	if (cached && Date.now() - cached.timestamp < SKILLS_CACHE_TTL) {
		parsedSkills = cached.data;
	} else {
		let rawSkills: Array<{
			name: string;
			markdownContent: string;
			isEnabled: boolean;
			updatedAt: number;
		}>;

		if (subAgentId) {
			// Sub-agent path: load skills attached to the sub-agent
			rawSkills = await ctx.runQuery(internal.ai.skills.listByAgentInternal, {
				subAgentId,
			});
		} else if (selectedSkillIds && selectedSkillIds.length > 0) {
			// On-demand path: load only the explicitly selected skills
			rawSkills = await ctx.runQuery(internal.ai.skills.listByIds, {
				skillIds: selectedSkillIds,
			});
		} else {
			// No skills selected — return empty
			rawSkills = [];
		}

		const enabledSkills = rawSkills.filter((s) => s.isEnabled);

		parsedSkills = enabledSkills.map((skill) => ({
			name: skill.name,
			parsed: parseSkillMarkdown(skill.markdownContent),
			updatedAt: skill.updatedAt,
		}));

		skillsCache.set(cacheKey, { data: parsedSkills, timestamp: Date.now() });
	}

	// If no skills, return base instructions with optional context sections
	if (parsedSkills.length === 0) {
		return composeSystemPrompt({
			baseInstructions,
			skills: [],
			pageContext,
			ragPrefix,
			tokenBudget,
		});
	}

	// ── Compose final prompt ──────────────────────────────────────────────

	return composeSystemPrompt({
		baseInstructions,
		skills: parsedSkills,
		pageContext,
		ragPrefix,
		tokenBudget,
	});
}
