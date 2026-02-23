import { describe, expect, it } from "vitest";
import {
	composeSystemPrompt,
	estimateTokens,
} from "../../convex/ai/promptComposer";
import type { ParsedSkill } from "../../convex/ai/skillParser";

function makeParsedSkill(overrides: Partial<ParsedSkill> = {}): ParsedSkill {
	return {
		instructions: "",
		constraints: "",
		examples: "",
		context: "",
		raw: "",
		...overrides,
	};
}

describe("estimateTokens", () => {
	it("estimates tokens at ~4 chars per token", () => {
		expect(estimateTokens("")).toBe(0);
		expect(estimateTokens("abcd")).toBe(1);
		expect(estimateTokens("abcde")).toBe(2);
		expect(estimateTokens("a".repeat(100))).toBe(25);
		expect(estimateTokens("a".repeat(101))).toBe(26);
	});
});

describe("composeSystemPrompt", () => {
	it("returns base instructions only when no skills", () => {
		const result = composeSystemPrompt({
			baseInstructions: "You are a helpful assistant.",
			skills: [],
		});

		expect(result).toBe("You are a helpful assistant.");
	});

	it("renders one skill fully", () => {
		const result = composeSystemPrompt({
			baseInstructions: "Base instructions here.",
			skills: [
				{
					name: "AP Style",
					parsed: makeParsedSkill({
						instructions: "Write in AP Style.",
						constraints: "No passive voice.",
						examples: 'Good: "The team shipped."',
					}),
					updatedAt: 1000,
				},
			],
		});

		expect(result).toContain("Base instructions here.");
		expect(result).toContain("## Active Skills");
		expect(result).toContain("### AP Style");
		expect(result).toContain("**Instructions:** Write in AP Style.");
		expect(result).toContain("**Constraints:** No passive voice.");
		expect(result).toContain('**Examples:** Good: "The team shipped."');
		// No context section since it's empty
		expect(result).not.toContain("**Context:**");
	});

	it("renders multiple skills within budget", () => {
		const result = composeSystemPrompt({
			baseInstructions: "Base.",
			skills: [
				{
					name: "Skill A",
					parsed: makeParsedSkill({ instructions: "Do A." }),
					updatedAt: 1000,
				},
				{
					name: "Skill B",
					parsed: makeParsedSkill({ instructions: "Do B." }),
					updatedAt: 2000,
				},
			],
		});

		expect(result).toContain("### Skill A");
		expect(result).toContain("### Skill B");
		expect(result).not.toContain("omitted due to token budget");
	});

	it("truncates least recently updated skills when over budget", () => {
		// Create skills that exceed a small token budget
		const longInstructions = "a".repeat(200); // ~50 tokens each skill block

		const result = composeSystemPrompt({
			baseInstructions: "Base.",
			skills: [
				{
					name: "Old Skill",
					parsed: makeParsedSkill({ instructions: longInstructions }),
					updatedAt: 1000, // Oldest — should be removed
				},
				{
					name: "New Skill",
					parsed: makeParsedSkill({ instructions: longInstructions }),
					updatedAt: 3000, // Newest — should be kept
				},
				{
					name: "Mid Skill",
					parsed: makeParsedSkill({ instructions: longInstructions }),
					updatedAt: 2000, // Middle — kept if budget allows
				},
			],
			tokenBudget: 100, // Very small budget — won't fit all 3
		});

		// New Skill should be kept (most recently updated)
		expect(result).toContain("### New Skill");
		// Truncation warning should appear
		expect(result).toContain("Some skills were omitted due to token budget");
	});

	it("includes page context section when provided", () => {
		const result = composeSystemPrompt({
			baseInstructions: "Base.",
			skills: [],
			pageContext: "User is on the Issues board, viewing sprint backlog.",
		});

		expect(result).toContain("## Current Context");
		expect(result).toContain(
			"User is on the Issues board, viewing sprint backlog.",
		);
	});

	it("includes RAG prefix section when provided", () => {
		const result = composeSystemPrompt({
			baseInstructions: "Base.",
			skills: [],
			ragPrefix: "Search only documents and issues.",
		});

		expect(result).toContain("## Search Instructions");
		expect(result).toContain("Search only documents and issues.");
	});

	it("composes all sections in correct order", () => {
		const result = composeSystemPrompt({
			baseInstructions: "BASE_INSTRUCTIONS",
			skills: [
				{
					name: "Test Skill",
					parsed: makeParsedSkill({ instructions: "SKILL_CONTENT" }),
					updatedAt: 1000,
				},
			],
			pageContext: "PAGE_CONTEXT",
			ragPrefix: "RAG_PREFIX",
		});

		const baseIdx = result.indexOf("BASE_INSTRUCTIONS");
		const skillIdx = result.indexOf("## Active Skills");
		const contextIdx = result.indexOf("## Current Context");
		const ragIdx = result.indexOf("## Search Instructions");

		expect(baseIdx).toBeLessThan(skillIdx);
		expect(skillIdx).toBeLessThan(contextIdx);
		expect(contextIdx).toBeLessThan(ragIdx);
	});

	it("skips empty skill sections in rendered output", () => {
		const result = composeSystemPrompt({
			baseInstructions: "Base.",
			skills: [
				{
					name: "Minimal Skill",
					parsed: makeParsedSkill({
						instructions: "Just instructions.",
						// constraints, examples, context are all empty
					}),
					updatedAt: 1000,
				},
			],
		});

		expect(result).toContain("### Minimal Skill");
		expect(result).toContain("**Instructions:** Just instructions.");
		expect(result).not.toContain("**Constraints:**");
		expect(result).not.toContain("**Examples:**");
		expect(result).not.toContain("**Context:**");
	});

	it("handles all skills truncated due to tiny budget", () => {
		const result = composeSystemPrompt({
			baseInstructions: "Base.",
			skills: [
				{
					name: "Big Skill",
					parsed: makeParsedSkill({
						instructions: "a".repeat(1000),
					}),
					updatedAt: 1000,
				},
			],
			tokenBudget: 1, // Impossibly small
		});

		expect(result).toContain("Base.");
		expect(result).toContain("All skills were omitted due to token budget");
		expect(result).not.toContain("### Big Skill");
	});

	it("preserves original skill order in output when no truncation", () => {
		const result = composeSystemPrompt({
			baseInstructions: "Base.",
			skills: [
				{
					name: "Alpha",
					parsed: makeParsedSkill({ instructions: "A content." }),
					updatedAt: 3000, // Newest
				},
				{
					name: "Beta",
					parsed: makeParsedSkill({ instructions: "B content." }),
					updatedAt: 1000, // Oldest
				},
				{
					name: "Gamma",
					parsed: makeParsedSkill({ instructions: "G content." }),
					updatedAt: 2000,
				},
			],
		});

		const alphaIdx = result.indexOf("### Alpha");
		const betaIdx = result.indexOf("### Beta");
		const gammaIdx = result.indexOf("### Gamma");

		// Original order preserved (not sorted by updatedAt)
		expect(alphaIdx).toBeLessThan(betaIdx);
		expect(betaIdx).toBeLessThan(gammaIdx);
	});

	it("does not truncate base instructions regardless of length", () => {
		const longBase = "B".repeat(100_000);
		const result = composeSystemPrompt({
			baseInstructions: longBase,
			skills: [
				{
					name: "Small Skill",
					parsed: makeParsedSkill({ instructions: "Short." }),
					updatedAt: 1000,
				},
			],
		});

		expect(result).toContain(longBase);
		expect(result).toContain("### Small Skill");
	});
});
