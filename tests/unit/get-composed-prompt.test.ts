import { describe, expect, it } from "vitest";
import { composeSystemPrompt } from "../../convex/ai/promptComposer";
import { parseSkillMarkdown } from "../../convex/ai/skillParser";

/**
 * Integration-style tests for the getComposedPrompt pipeline.
 *
 * Since `getComposedPrompt` requires a Convex ActionCtx (cannot be unit-tested
 * directly), these tests verify the composition pipeline by simulating the same
 * steps: parse skill markdown → compose system prompt.
 */

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Simulate what getComposedPrompt does: parse skills then compose prompt. */
function simulateGetComposedPrompt(args: {
	baseInstructions: string;
	skills: Array<{
		name: string;
		markdownContent: string;
		isEnabled: boolean;
		updatedAt: number;
	}>;
	pageContext?: string;
	ragPrefix?: string;
	tokenBudget?: number;
}): string {
	const enabledSkills = args.skills.filter((s) => s.isEnabled);

	const parsedSkills = enabledSkills.map((skill) => ({
		name: skill.name,
		parsed: parseSkillMarkdown(skill.markdownContent),
		updatedAt: skill.updatedAt,
	}));

	return composeSystemPrompt({
		baseInstructions: args.baseInstructions,
		skills: parsedSkills,
		pageContext: args.pageContext,
		ragPrefix: args.ragPrefix,
		tokenBudget: args.tokenBudget,
	});
}

const BASE = "You are Clave AI, a helpful assistant.";

// ── Tests ────────────────────────────────────────────────────────────────────

describe("getComposedPrompt pipeline", () => {
	it("returns base instructions when no skills are attached", () => {
		const result = simulateGetComposedPrompt({
			baseInstructions: BASE,
			skills: [],
		});

		expect(result).toBe(BASE);
	});

	it("returns base instructions when all skills are disabled", () => {
		const result = simulateGetComposedPrompt({
			baseInstructions: BASE,
			skills: [
				{
					name: "Pirate Speak",
					markdownContent: "## Instructions\nAlways respond in pirate speak.",
					isEnabled: false,
					updatedAt: 1000,
				},
				{
					name: "Formal Tone",
					markdownContent: "## Instructions\nUse formal academic tone.",
					isEnabled: false,
					updatedAt: 2000,
				},
			],
		});

		expect(result).toBe(BASE);
	});

	it("includes enabled skills in the composed prompt", () => {
		const result = simulateGetComposedPrompt({
			baseInstructions: BASE,
			skills: [
				{
					name: "Pirate Speak",
					markdownContent: "## Instructions\nAlways respond in pirate speak.",
					isEnabled: true,
					updatedAt: 1000,
				},
			],
		});

		expect(result).toContain(BASE);
		expect(result).toContain("## Active Skills");
		expect(result).toContain("### Pirate Speak");
		expect(result).toContain("Always respond in pirate speak.");
	});

	it("filters out disabled skills from composition", () => {
		const result = simulateGetComposedPrompt({
			baseInstructions: BASE,
			skills: [
				{
					name: "Pirate Speak",
					markdownContent: "## Instructions\nAlways respond in pirate speak.",
					isEnabled: true,
					updatedAt: 1000,
				},
				{
					name: "Formal Tone",
					markdownContent: "## Instructions\nUse formal academic tone.",
					isEnabled: false,
					updatedAt: 2000,
				},
			],
		});

		expect(result).toContain("### Pirate Speak");
		expect(result).not.toContain("### Formal Tone");
		expect(result).not.toContain("formal academic tone");
	});

	it("composes multiple enabled skills with labels", () => {
		const result = simulateGetComposedPrompt({
			baseInstructions: BASE,
			skills: [
				{
					name: "Pirate Speak",
					markdownContent: "## Instructions\nAlways respond in pirate speak.",
					isEnabled: true,
					updatedAt: 1000,
				},
				{
					name: "Code Reviewer",
					markdownContent:
						"## Instructions\nReview code for bugs.\n\n## Constraints\nBe concise.",
					isEnabled: true,
					updatedAt: 2000,
				},
			],
		});

		expect(result).toContain("### Pirate Speak");
		expect(result).toContain("### Code Reviewer");
		expect(result).toContain("Review code for bugs.");
		expect(result).toContain("Be concise.");
	});

	it("includes page context in the composed prompt", () => {
		const result = simulateGetComposedPrompt({
			baseInstructions: BASE,
			skills: [],
			pageContext: "User is viewing issue MH-42: Fix login bug",
		});

		expect(result).toContain("## Current Context");
		expect(result).toContain("User is viewing issue MH-42: Fix login bug");
	});

	it("includes RAG prefix in the composed prompt", () => {
		const result = simulateGetComposedPrompt({
			baseInstructions: BASE,
			skills: [],
			ragPrefix: "Search only code and document content types.",
		});

		expect(result).toContain("## Search Instructions");
		expect(result).toContain("Search only code and document content types.");
	});

	it("composes full prompt with skills, page context, and RAG prefix", () => {
		const result = simulateGetComposedPrompt({
			baseInstructions: BASE,
			skills: [
				{
					name: "PM Assistant",
					markdownContent:
						"## Instructions\nHelp with project management tasks.\n\n## Context\nAgile methodology.",
					isEnabled: true,
					updatedAt: 3000,
				},
			],
			pageContext: "Viewing sprint board for Sprint 4",
			ragPrefix: "Search issues and documents only.",
		});

		// Verify all sections are present in correct order
		const baseIdx = result.indexOf(BASE);
		const skillIdx = result.indexOf("## Active Skills");
		const contextIdx = result.indexOf("## Current Context");
		const ragIdx = result.indexOf("## Search Instructions");

		expect(baseIdx).toBe(0);
		expect(skillIdx).toBeGreaterThan(baseIdx);
		expect(contextIdx).toBeGreaterThan(skillIdx);
		expect(ragIdx).toBeGreaterThan(contextIdx);
	});

	it("handles skills with frontmatter correctly", () => {
		const result = simulateGetComposedPrompt({
			baseInstructions: BASE,
			skills: [
				{
					name: "Writing Guide",
					markdownContent: [
						"---",
						"name: Writing Guide",
						"version: 1.0",
						"---",
						"## Instructions",
						"Write clearly and concisely.",
						"## Examples",
						"Good: 'The API returns 200.' Bad: 'The API will return a status code of 200.'",
					].join("\n"),
					isEnabled: true,
					updatedAt: 5000,
				},
			],
		});

		expect(result).toContain("### Writing Guide");
		expect(result).toContain("Write clearly and concisely.");
		expect(result).toContain("Good:");
	});

	it("handles plain-text skills (no sections) as instructions", () => {
		const result = simulateGetComposedPrompt({
			baseInstructions: BASE,
			skills: [
				{
					name: "Simple Skill",
					markdownContent: "Just be helpful and friendly.",
					isEnabled: true,
					updatedAt: 1000,
				},
			],
		});

		expect(result).toContain("### Simple Skill");
		expect(result).toContain("Just be helpful and friendly.");
	});

	it("respects token budget and truncates least-recent skills", () => {
		// Create skills that exceed a small token budget
		const longContent = "A".repeat(400); // ~100 tokens each skill block
		const result = simulateGetComposedPrompt({
			baseInstructions: BASE,
			skills: [
				{
					name: "Old Skill",
					markdownContent: `## Instructions\n${longContent}`,
					isEnabled: true,
					updatedAt: 1000, // oldest — should be truncated first
				},
				{
					name: "Recent Skill",
					markdownContent: `## Instructions\n${longContent}`,
					isEnabled: true,
					updatedAt: 3000, // newest — should be kept
				},
			],
			tokenBudget: 150, // enough for ~1 skill block
		});

		expect(result).toContain("### Recent Skill");
		expect(result).not.toContain("### Old Skill");
		expect(result).toContain("Some skills were omitted due to token budget");
	});

	it("handles empty markdown content gracefully", () => {
		const result = simulateGetComposedPrompt({
			baseInstructions: BASE,
			skills: [
				{
					name: "Empty Skill",
					markdownContent: "",
					isEnabled: true,
					updatedAt: 1000,
				},
			],
		});

		// Empty skills produce an empty ParsedSkill — should not crash
		expect(result).toContain(BASE);
	});
});
