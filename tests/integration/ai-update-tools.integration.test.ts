/**
 * @vitest-environment node
 */

import { describe, expect, it } from "vitest";
import { inferGenerationMode } from "../../convex/ai/whiteboardMcp";
import {
	markdownToSlate,
	parseAnyContentToSlate,
} from "../../src/lib/content-converters";

describe("updateDocument content pipeline (integration)", () => {
	describe("markdown content round-trip", () => {
		it("converts plain text to Slate nodes", () => {
			const content = "This is updated by talha to test the functionality";
			const nodes = markdownToSlate(content);
			expect(nodes.length).toBeGreaterThan(0);
			// Should produce at least one paragraph node
			const firstNode = nodes[0] as Record<string, unknown>;
			expect(firstNode).toHaveProperty("children");
		});

		it("converts markdown with headings and lists to Slate", () => {
			const content = `# Project Overview

This is the project description.

## Features

- Feature one
- Feature two
- Feature three

## Status

The project is **active** and in progress.`;

			const nodes = markdownToSlate(content);
			expect(nodes.length).toBeGreaterThan(3);
		});

		it("parseAnyContentToSlate handles plain text input", () => {
			const content = "Simple plain text content";
			const nodes = parseAnyContentToSlate(content);
			expect(nodes).toBeDefined();
			expect(nodes?.length).toBeGreaterThan(0);
		});

		it("parseAnyContentToSlate handles JSON Slate content", () => {
			const slateJson = JSON.stringify([
				{
					type: "p",
					children: [{ text: "Existing content" }],
				},
			]);
			const nodes = parseAnyContentToSlate(slateJson);
			expect(nodes).toBeDefined();
			expect(nodes?.length).toBeGreaterThan(0);
		});
	});
});

describe("updateProject tool validation (integration)", () => {
	it("inferGenerationMode detects architecture from prompt", () => {
		expect(inferGenerationMode("system design for microservices")).toBe(
			"architecture",
		);
	});

	it("inferGenerationMode detects wireframe from prompt", () => {
		expect(inferGenerationMode("wireframe for a dashboard page")).toBe(
			"wireframe",
		);
	});

	it("inferGenerationMode defaults to flowchart", () => {
		expect(inferGenerationMode("steps for user onboarding")).toBe("flowchart");
	});
});
