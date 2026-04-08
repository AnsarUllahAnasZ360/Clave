import { describe, expect, it } from "vitest";
import { issueDraftDescriptionPrompt } from "../../../convex/ai/prompts/issue_prompts";

describe("issueDraftDescriptionPrompt", () => {
	it("emits plain-text instruction when plainText is true", () => {
		const prompt = issueDraftDescriptionPrompt({
			title: "Fix sidebar crash",
			plainText: true,
		});
		expect(prompt).toContain("Do not use markdown formatting");
		expect(prompt).not.toContain("Write in markdown.");
	});

	it("defaults to markdown instruction when plainText is not set", () => {
		const prompt = issueDraftDescriptionPrompt({
			title: "Fix sidebar crash",
		});
		expect(prompt).toContain("Write in markdown.");
	});
});

