/**
 * @vitest-environment node
 *
 * Extended tests for extractPlainTextFromBody and validation of
 * embedded_helpers.ts Convex function exports.
 */

import { describe, expect, it } from "vitest";
import { extractPlainTextFromBody } from "../../convex/ai/embedded_helpers";

// ── extractPlainTextFromBody — Extended tests ────────────────────────────

describe("extractPlainTextFromBody — extended", () => {
	// Basic plain text
	it("returns empty string for empty input", () => {
		expect(extractPlainTextFromBody("")).toBe("");
	});

	it("returns empty string for whitespace-only input", () => {
		expect(extractPlainTextFromBody("   ")).toBe("");
	});

	it("preserves plain text without JSON markers", () => {
		expect(extractPlainTextFromBody("Hello world")).toBe("Hello world");
	});

	it("preserves text that does not start with { or [", () => {
		expect(extractPlainTextFromBody("Some plain text content")).toBe(
			"Some plain text content",
		);
	});

	// Slate/Plate JSON array format
	it("extracts text from Slate array format", () => {
		const body = JSON.stringify([
			{ type: "p", children: [{ text: "Paragraph one" }] },
			{ type: "p", children: [{ text: "Paragraph two" }] },
		]);
		expect(extractPlainTextFromBody(body)).toBe("Paragraph one Paragraph two");
	});

	it("handles nested children in Plate format", () => {
		const body = JSON.stringify([
			{
				type: "p",
				children: [{ text: "Bold " }, { text: "and italic" }],
			},
		]);
		expect(extractPlainTextFromBody(body)).toBe("Bold and italic");
	});

	// ProseMirror/TipTap JSON object format
	it("extracts text from ProseMirror doc format", () => {
		const body = JSON.stringify({
			type: "doc",
			content: [
				{
					type: "paragraph",
					content: [{ type: "text", text: "First" }],
				},
				{
					type: "paragraph",
					content: [{ type: "text", text: "Second" }],
				},
			],
		});
		expect(extractPlainTextFromBody(body)).toBe("First Second");
	});

	it("handles deeply nested content", () => {
		const body = JSON.stringify({
			type: "doc",
			content: [
				{
					type: "blockquote",
					content: [
						{
							type: "paragraph",
							content: [{ type: "text", text: "Quoted text" }],
						},
					],
				},
			],
		});
		expect(extractPlainTextFromBody(body)).toBe("Quoted text");
	});

	// Edge cases
	it("falls back to original body for malformed JSON", () => {
		const malformed = '[{"type":"p"';
		expect(extractPlainTextFromBody(malformed)).toBe(malformed);
	});

	it("falls back when JSON has no text nodes", () => {
		const body = JSON.stringify({ type: "doc", content: [] });
		expect(extractPlainTextFromBody(body)).toBe(body);
	});

	it("skips whitespace-only text nodes", () => {
		const body = JSON.stringify([
			{ type: "p", children: [{ text: "   " }] },
			{ type: "p", children: [{ text: "Actual content" }] },
		]);
		expect(extractPlainTextFromBody(body)).toBe("Actual content");
	});

	it("collapses multiple whitespace in result", () => {
		const body = JSON.stringify([
			{ type: "p", children: [{ text: "Word  one" }] },
			{ type: "p", children: [{ text: "Word   two" }] },
		]);
		const result = extractPlainTextFromBody(body);
		expect(result).not.toContain("  "); // no double spaces
	});

	it("handles mixed content and children keys", () => {
		const body = JSON.stringify({
			type: "doc",
			content: [
				{
					type: "paragraph",
					children: [{ text: "Via children" }],
				},
			],
		});
		expect(extractPlainTextFromBody(body)).toBe("Via children");
	});

	it("handles JSON array of primitives gracefully", () => {
		const body = JSON.stringify([1, 2, 3]);
		// No text nodes found — falls back to original
		expect(extractPlainTextFromBody(body)).toBe(body);
	});

	it("handles JSON object without content or children", () => {
		const body = JSON.stringify({ key: "value" });
		expect(extractPlainTextFromBody(body)).toBe(body);
	});
});

// ── Convex function export validation ────────────────────────────────────
// These functions are internalQuery/internalMutation so we can't call them
// directly, but we verify they're properly exported.

describe("embedded_helpers Convex exports", () => {
	it("exports all expected internal query/mutation names", async () => {
		const mod = await import("../../convex/ai/embedded_helpers");

		// Internal queries
		expect(mod.loadDocumentContext).toBeDefined();
		expect(mod.loadIssueContext).toBeDefined();
		expect(mod.loadWhiteboardContext).toBeDefined();
		expect(mod.loadProjectContext).toBeDefined();
		expect(mod.loadProjectIssueStats).toBeDefined();
		expect(mod.loadWorkspaceLabels).toBeDefined();
		expect(mod.loadIssueComments).toBeDefined();
		expect(mod.loadProjectMilestones).toBeDefined();
		expect(mod.loadSprintVelocity).toBeDefined();
		expect(mod.loadBacklogIssues).toBeDefined();
		expect(mod.loadWorkspaceProjectIds).toBeDefined();
		expect(mod.loadRecentNotifications).toBeDefined();
		expect(mod.loadUserOverdueIssues).toBeDefined();
		expect(mod.loadCommentThread).toBeDefined();
		expect(mod.loadDocumentThreadComments).toBeDefined();

		// Internal mutations
		expect(mod.getOrCreateAIUser).toBeDefined();
		expect(mod.createAIReplyComment).toBeDefined();
		expect(mod.createAIDocumentComment).toBeDefined();

		// Pure function
		expect(mod.extractPlainTextFromBody).toBeDefined();
		expect(typeof mod.extractPlainTextFromBody).toBe("function");
	});
});
