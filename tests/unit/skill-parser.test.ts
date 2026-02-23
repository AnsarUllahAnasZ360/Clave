import { describe, expect, it } from "vitest";
import { parseSkillMarkdown } from "../../convex/ai/skillParser";

describe("parseSkillMarkdown", () => {
	it("parses full skill with frontmatter and all 4 sections", () => {
		const md = `---
name: AP Style Guide
version: 1.0
author: John Doe
---

## Instructions

Always write in AP Style. Use active voice.

## Constraints

Never use passive voice. Max 3 sentences per paragraph.

## Examples

Good: "The team released the update."
Bad: "The update was released by the team."

## Context

This skill applies to all documentation and blog writing tasks.`;

		const result = parseSkillMarkdown(md);

		expect(result.name).toBe("AP Style Guide");
		expect(result.version).toBe("1.0");
		expect(result.author).toBe("John Doe");
		expect(result.instructions).toBe(
			"Always write in AP Style. Use active voice.",
		);
		expect(result.constraints).toBe(
			"Never use passive voice. Max 3 sentences per paragraph.",
		);
		expect(result.examples).toContain('Good: "The team released the update."');
		expect(result.context).toBe(
			"This skill applies to all documentation and blog writing tasks.",
		);
		expect(result.raw).toBe(md);
	});

	it("parses skill with no frontmatter", () => {
		const md = `## Instructions

Write concisely.

## Constraints

Keep it under 100 words.`;

		const result = parseSkillMarkdown(md);

		expect(result.name).toBeUndefined();
		expect(result.version).toBeUndefined();
		expect(result.author).toBeUndefined();
		expect(result.instructions).toBe("Write concisely.");
		expect(result.constraints).toBe("Keep it under 100 words.");
		expect(result.examples).toBe("");
		expect(result.context).toBe("");
	});

	it("parses skill with only instructions section", () => {
		const md = `## Instructions

Be helpful and thorough. Always provide code examples.`;

		const result = parseSkillMarkdown(md);

		expect(result.instructions).toBe(
			"Be helpful and thorough. Always provide code examples.",
		);
		expect(result.constraints).toBe("");
		expect(result.examples).toBe("");
		expect(result.context).toBe("");
	});

	it("treats plain text with no sections as instructions (fallback)", () => {
		const md = "Just be nice and write clean code. Follow best practices.";

		const result = parseSkillMarkdown(md);

		expect(result.instructions).toBe(md);
		expect(result.constraints).toBe("");
		expect(result.examples).toBe("");
		expect(result.context).toBe("");
		expect(result.raw).toBe(md);
	});

	it("ignores unknown sections but preserves them in raw", () => {
		const md = `## Instructions

Write well.

## Tone

Use a professional tone.

## Guidelines

Follow the style guide.`;

		const result = parseSkillMarkdown(md);

		expect(result.instructions).toBe("Write well.");
		expect(result.constraints).toBe("");
		// Unknown sections are in raw
		expect(result.raw).toContain("## Tone");
		expect(result.raw).toContain("## Guidelines");
	});

	it("handles empty string input", () => {
		const result = parseSkillMarkdown("");

		expect(result.instructions).toBe("");
		expect(result.constraints).toBe("");
		expect(result.examples).toBe("");
		expect(result.context).toBe("");
		expect(result.raw).toBe("");
		expect(result.name).toBeUndefined();
	});

	it("handles whitespace-only input", () => {
		const result = parseSkillMarkdown("   \n\n  ");

		expect(result.instructions).toBe("");
		expect(result.raw).toBe("   \n\n  ");
	});

	it("handles case-insensitive heading matching", () => {
		const md = `## INSTRUCTIONS

Write in uppercase style.

## constraints

Be brief.

## Examples

Example here.`;

		const result = parseSkillMarkdown(md);

		expect(result.instructions).toBe("Write in uppercase style.");
		expect(result.constraints).toBe("Be brief.");
		expect(result.examples).toBe("Example here.");
	});

	it("handles frontmatter with extra unknown fields", () => {
		const md = `---
name: My Skill
version: 2.0
author: Jane
category: writing
tags: docs, blog
---

## Instructions

Do the thing.`;

		const result = parseSkillMarkdown(md);

		expect(result.name).toBe("My Skill");
		expect(result.version).toBe("2.0");
		expect(result.author).toBe("Jane");
		expect(result.instructions).toBe("Do the thing.");
	});

	it("handles frontmatter without closing delimiter (no frontmatter)", () => {
		const md = `---
name: Broken
This has no closing delimiter

## Instructions

Still works as plain content.`;

		const result = parseSkillMarkdown(md);

		// No frontmatter extracted since no closing ---
		expect(result.name).toBeUndefined();
		// The whole content is parsed for sections
		expect(result.instructions).toBe("Still works as plain content.");
	});

	it("handles multi-line section content", () => {
		const md = `## Instructions

Line one of instructions.

Line two of instructions.

- Bullet point one
- Bullet point two

## Constraints

Single constraint line.`;

		const result = parseSkillMarkdown(md);

		expect(result.instructions).toContain("Line one of instructions.");
		expect(result.instructions).toContain("Line two of instructions.");
		expect(result.instructions).toContain("- Bullet point one");
		expect(result.constraints).toBe("Single constraint line.");
	});

	it("does not confuse ### sub-headings with ## sections", () => {
		const md = `## Instructions

Main instructions here.

### Sub-heading

Sub-content under instructions.

## Constraints

A constraint.`;

		const result = parseSkillMarkdown(md);

		// Sub-heading content should be part of the instructions section
		expect(result.instructions).toContain("Main instructions here.");
		expect(result.instructions).toContain("### Sub-heading");
		expect(result.instructions).toContain("Sub-content under instructions.");
		expect(result.constraints).toBe("A constraint.");
	});
});
