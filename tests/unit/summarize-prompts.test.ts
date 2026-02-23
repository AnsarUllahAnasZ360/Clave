import { describe, expect, it } from "vitest";
import {
	buildSummarizePrompt,
	buildSummarizeSystemSuffix,
} from "../../src/lib/ai/summarize-prompts";

describe("summarize prompts", () => {
	it("prefers explicit args when provided", () => {
		expect(buildSummarizePrompt(undefined, "  this text  ")).toBe(
			"Summarize the following: this text",
		);
	});

	it("builds project summarize guidance with entity context", () => {
		const prompt = buildSummarizePrompt({
			workspaceId: "ws_123",
			pageType: "project",
			entityId: "proj_123",
			entityName: "Platform Revamp",
		});

		expect(prompt).toContain('current project "Platform Revamp"');
		expect(prompt).toContain('projectId "proj_123"');
		expect(prompt).toContain("## Project Summary");
	});

	it("builds workspace digest guidance by default", () => {
		const prompt = buildSummarizePrompt();
		expect(prompt).toContain("workspace activity digest");
		expect(prompt).toContain("## Workspace Overview");
	});

	it("builds summarize system suffix with context line", () => {
		const suffix = buildSummarizeSystemSuffix({
			workspaceId: "ws_123",
			pageType: "issue",
			entityName: "CLV-101",
		});
		expect(suffix).toContain("--- [SUMMARIZE COMMAND] ---");
		expect(suffix).toContain('Current page context: issue — "CLV-101".');
	});
});
