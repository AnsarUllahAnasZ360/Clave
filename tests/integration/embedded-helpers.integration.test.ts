/**
 * @vitest-environment node
 */

import { describe, expect, it } from "vitest";
import { extractPlainTextFromBody } from "../../convex/ai/embedded_helpers";
import {
	documentContinuePrompt,
	documentExpandPrompt,
	documentFixGrammarPrompt,
	documentRewritePrompt,
	documentSummarizePrompt,
	documentTranslatePrompt,
	documentWriteFromPromptFn,
} from "../../convex/ai/prompts/document_prompts";

describe("embedded helper text extraction (integration)", () => {
	it("normalizes mixed rich-text payloads into prompt-safe plain text", () => {
		const issueDescription = JSON.stringify([
			{
				type: "h2",
				children: [{ text: "Problem" }],
			},
			{
				type: "p",
				children: [{ text: "  Slash commands fail on issue descriptions.  " }],
			},
			{
				type: "p",
				children: [{ text: "Need immediate feedback." }],
			},
		]);

		expect(extractPlainTextFromBody(issueDescription)).toBe(
			"Problem Slash commands fail on issue descriptions. Need immediate feedback.",
		);
	});

	it("reads text from nested content and children arrays in one payload", () => {
		const mixedPayload = JSON.stringify({
			type: "doc",
			content: [
				{
					type: "paragraph",
					children: [{ text: "Project context" }],
				},
				{
					type: "paragraph",
					content: [{ type: "text", text: "and document context" }],
				},
			],
		});

		expect(extractPlainTextFromBody(mixedPayload)).toBe(
			"Project context and document context",
		);
	});
});

describe("document prompts (integration)", () => {
	it("documentContinuePrompt includes title and content before", () => {
		const prompt = documentContinuePrompt({
			title: "Sprint Planning Guide",
			contentBefore: "A sprint is a time-boxed iteration.",
			contentAfter: "Sprints typically last two weeks.",
			currentBlockType: "p",
		});

		expect(prompt).toContain("Sprint Planning Guide");
		expect(prompt).toContain("A sprint is a time-boxed iteration.");
	});

	it("documentContinuePrompt includes block type context when provided", () => {
		const prompt = documentContinuePrompt({
			title: "Tech Doc",
			contentBefore: "| Header | Value |",
			currentBlockType: "table",
		});

		expect(prompt).toContain("table");
	});

	it("documentSummarizePrompt includes document title and content", () => {
		const prompt = documentSummarizePrompt({
			title: "API Reference",
			content: "This document describes all available API endpoints.",
		});

		expect(prompt).toContain("API Reference");
		expect(prompt).toContain(
			"This document describes all available API endpoints.",
		);
	});

	it("documentRewritePrompt includes selected text", () => {
		const prompt = documentRewritePrompt({
			title: "Blog Post",
			selectedText: "The system is fast and efficient.",
		});

		expect(prompt).toContain("The system is fast and efficient.");
	});

	it("documentTranslatePrompt includes target language and selected text", () => {
		const prompt = documentTranslatePrompt({
			selectedText: "Hello world",
			targetLanguage: "Spanish",
		});

		expect(prompt).toContain("Spanish");
		expect(prompt).toContain("Hello world");
	});

	it("documentExpandPrompt includes selected text to expand", () => {
		const prompt = documentExpandPrompt({
			title: "Product Overview",
			selectedText: "Clave is a project management tool.",
		});

		expect(prompt).toContain("Clave is a project management tool.");
	});

	it("documentFixGrammarPrompt includes the text to fix", () => {
		const prompt = documentFixGrammarPrompt({
			selectedText: "Their going to the store yesterdey.",
		});

		expect(prompt).toContain("Their going to the store yesterdey.");
	});

	it("documentWriteFromPromptFn includes user prompt and title", () => {
		const prompt = documentWriteFromPromptFn({
			title: "Release Notes",
			prompt: "Write a summary of the v2.0 launch features.",
			contentBefore: "# Release Notes\n\n",
		});

		expect(prompt).toContain("Release Notes");
		expect(prompt).toContain("Write a summary of the v2.0 launch features.");
	});

	it("all document prompts return non-empty strings", () => {
		const prompts = [
			documentContinuePrompt({ title: "T", contentBefore: "content" }),
			documentSummarizePrompt({ title: "T", content: "content" }),
			documentRewritePrompt({ title: "T", selectedText: "text" }),
			documentTranslatePrompt({
				selectedText: "text",
				targetLanguage: "French",
			}),
			documentExpandPrompt({ title: "T", selectedText: "text" }),
			documentFixGrammarPrompt({ selectedText: "text" }),
			documentWriteFromPromptFn({ title: "T", prompt: "Write something." }),
		];

		for (const p of prompts) {
			expect(typeof p).toBe("string");
			expect(p.length).toBeGreaterThan(20);
		}
	});
});
