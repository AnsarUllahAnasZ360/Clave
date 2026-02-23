/**
 * System Prompt Composer — assembles base instructions, parsed skills,
 * page context, and RAG prefixes into a complete agent system prompt.
 *
 * Pure function with no Convex runtime dependencies.
 */

import type { ParsedSkill } from "./skillParser";

// ── Types ───────────────────────────────────────────────────────────────────

export interface ComposePromptInput {
	/** Base agent instructions (always included first, never truncated) */
	baseInstructions: string;
	/** Skills to inject into the prompt */
	skills: Array<{
		name: string;
		parsed: ParsedSkill;
		/** Used for LRU truncation — more recent = higher priority */
		updatedAt: number;
	}>;
	/** Page/entity context from Sprint 1 context awareness */
	pageContext?: string;
	/** Search instructions based on content type filters */
	ragPrefix?: string;
	/** Max tokens for the skill section (default: 4000) */
	tokenBudget?: number;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

const DEFAULT_TOKEN_BUDGET = 4000;

/** Estimate token count using ~4 characters per token heuristic. */
export function estimateTokens(text: string): number {
	return Math.ceil(text.length / 4);
}

/**
 * Render a single skill as a markdown sub-section.
 * Only includes non-empty sections.
 */
function renderSkillBlock(name: string, parsed: ParsedSkill): string {
	const parts: string[] = [`### ${name}`];

	if (parsed.instructions) {
		parts.push(`**Instructions:** ${parsed.instructions}`);
	}
	if (parsed.constraints) {
		parts.push(`**Constraints:** ${parsed.constraints}`);
	}
	if (parsed.examples) {
		parts.push(`**Examples:** ${parsed.examples}`);
	}
	if (parsed.context) {
		parts.push(`**Context:** ${parsed.context}`);
	}

	return parts.join("\n\n");
}

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Compose a complete system prompt from base instructions, skills, page
 * context, and RAG prefix.
 *
 * Composition order:
 * 1. Base instructions (always first, never truncated)
 * 2. Active Skills section (token-budgeted)
 * 3. Current Context section (page context)
 * 4. Search Instructions section (RAG prefix)
 */
export function composeSystemPrompt(input: ComposePromptInput): string {
	const {
		baseInstructions,
		skills,
		pageContext,
		ragPrefix,
		tokenBudget = DEFAULT_TOKEN_BUDGET,
	} = input;

	const sections: string[] = [baseInstructions];

	// ── Skills Section ────────────────────────────────────────────────────
	if (skills.length > 0) {
		// Pre-render all skill blocks with their token costs
		const rendered = skills.map((skill) => ({
			name: skill.name,
			block: renderSkillBlock(skill.name, skill.parsed),
			updatedAt: skill.updatedAt,
		}));

		// Calculate total token cost
		const totalTokens = rendered.reduce(
			(sum, s) => sum + estimateTokens(s.block),
			0,
		);

		let skillBlocks: string[];
		let wasTruncated = false;

		if (totalTokens > tokenBudget) {
			// Sort by updatedAt ascending — least recently updated first (remove these)
			const sorted = [...rendered].sort((a, b) => a.updatedAt - b.updatedAt);

			let remaining = totalTokens;
			let removeCount = 0;

			// Remove from the front (least recently updated) until under budget
			while (remaining > tokenBudget && removeCount < sorted.length) {
				remaining -= estimateTokens(sorted[removeCount].block);
				removeCount++;
			}

			const kept = new Set(sorted.slice(removeCount).map((s) => s.name));
			skillBlocks = rendered
				.filter((s) => kept.has(s.name))
				.map((s) => s.block);
			wasTruncated = removeCount > 0;
		} else {
			skillBlocks = rendered.map((s) => s.block);
		}

		if (skillBlocks.length > 0) {
			let skillSection = `## Active Skills\n\n${skillBlocks.join("\n\n")}`;
			if (wasTruncated) {
				skillSection +=
					"\n\n(Note: Some skills were omitted due to token budget. Consider detaching unused skills.)";
			}
			sections.push(skillSection);
		} else if (wasTruncated) {
			// All skills were truncated
			sections.push(
				"## Active Skills\n\n(Note: All skills were omitted due to token budget. Consider detaching unused skills.)",
			);
		}
	}

	// ── Page Context Section ──────────────────────────────────────────────
	if (pageContext) {
		sections.push(`## Current Context\n\n${pageContext}`);
	}

	// ── RAG Prefix Section ────────────────────────────────────────────────
	if (ragPrefix) {
		sections.push(`## Search Instructions\n\n${ragPrefix}`);
	}

	return sections.join("\n\n");
}
