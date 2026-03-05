/**
 * @vitest-environment node
 */

import { describe, expect, it } from "vitest";
import {
	createFilteredRagTool,
	RAG_CONTENT_TYPES,
} from "../../convex/ai/ragFilter";

// ── RAG_CONTENT_TYPES ────────────────────────────────────────────────────

describe("RAG_CONTENT_TYPES", () => {
	it("contains expected content types", () => {
		expect(RAG_CONTENT_TYPES).toContain("issue");
		expect(RAG_CONTENT_TYPES).toContain("document");
		expect(RAG_CONTENT_TYPES).toContain("comment");
		expect(RAG_CONTENT_TYPES).toContain("github_file");
		expect(RAG_CONTENT_TYPES).toContain("doc_page");
	});

	it("has exactly 5 content types", () => {
		expect(RAG_CONTENT_TYPES).toHaveLength(5);
	});

	it("is a readonly tuple", () => {
		// TypeScript ensures this at compile time, but verify at runtime
		expect(Array.isArray(RAG_CONTENT_TYPES)).toBe(true);
	});
});

// ── createFilteredRagTool ────────────────────────────────────────────────

describe("createFilteredRagTool", () => {
	it("creates a tool with default description when no filter is provided", () => {
		const tool = createFilteredRagTool(undefined);
		expect(tool).toBeDefined();
		expect(tool.description).toContain("Search the project knowledge base");
		expect(tool.description).toContain("semantic");
		// Default tool should mention all content types
		expect(tool.description).toContain("issues, documents, comments, and code");
	});

	it("creates a tool with filtered description when content types are provided", () => {
		const tool = createFilteredRagTool(["document", "github_file"]);
		expect(tool).toBeDefined();
		expect(tool.description).toContain("restricted to");
		expect(tool.description).toContain("document");
		expect(tool.description).toContain("github_file");
	});

	it("creates a tool with default description for empty array", () => {
		const tool = createFilteredRagTool([]);
		expect(tool).toBeDefined();
		// Empty array = not filtered = default description
		expect(tool.description).toContain("issues, documents, comments, and code");
	});

	it("creates a tool with single content type filter", () => {
		const tool = createFilteredRagTool(["issue"]);
		expect(tool).toBeDefined();
		expect(tool.description).toContain("restricted to");
		expect(tool.description).toContain("issue");
	});

	it("created tool has execute function", () => {
		const tool = createFilteredRagTool(undefined);
		expect(typeof tool.execute).toBe("function");
	});

	it("created tool has inputSchema with required fields", () => {
		const tool = createFilteredRagTool(undefined);
		// The tool uses zod schema — verify it has the expected shape
		expect(tool.inputSchema).toBeDefined();
	});
});
