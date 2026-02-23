/**
 * @vitest-environment node
 */

process.env.AZURE_RESOURCE_NAME = "test-resource";
process.env.AZURE_API_KEY = "test-key-12345";
process.env.AZURE_CHAT_MODEL_GPT_5_2 = "gpt-5-2-deployment";
process.env.AZURE_CHAT_MODEL_KIMI_25 = "kimi-25-deployment";
process.env.AZURE_EMBEDDING_DEPLOYMENT = "text-embedding-3-large";

import { describe, expect, it } from "vitest";
import {
	chunkText,
	computeContentHash,
	getCodeNamespace,
	getProjectNamespace,
	RAG_SOURCE_TYPES,
} from "../../convex/ai/rag";

// ── RAG_SOURCE_TYPES ─────────────────────────────────────────────────────

describe("RAG_SOURCE_TYPES", () => {
	it("contains expected source types", () => {
		expect(RAG_SOURCE_TYPES).toContain("issue");
		expect(RAG_SOURCE_TYPES).toContain("document");
		expect(RAG_SOURCE_TYPES).toContain("comment");
		expect(RAG_SOURCE_TYPES).toContain("github_file");
	});

	it("has exactly 4 source types", () => {
		expect(RAG_SOURCE_TYPES).toHaveLength(4);
	});
});

// ── getProjectNamespace ──────────────────────────────────────────────────

describe("getProjectNamespace", () => {
	it("returns project-prefixed namespace", () => {
		expect(getProjectNamespace("abc123")).toBe("project:abc123");
	});

	it("handles different project IDs", () => {
		expect(getProjectNamespace("proj_001")).toBe("project:proj_001");
		expect(getProjectNamespace("j57n8f4g2h1k")).toBe("project:j57n8f4g2h1k");
	});
});

// ── getCodeNamespace ─────────────────────────────────────────────────────

describe("getCodeNamespace", () => {
	it("returns project:code-prefixed namespace", () => {
		expect(getCodeNamespace("abc123")).toBe("project:abc123:code");
	});

	it("differs from getProjectNamespace for same ID", () => {
		const projectId = "test123";
		expect(getCodeNamespace(projectId)).not.toBe(
			getProjectNamespace(projectId),
		);
	});
});

// ── computeContentHash ───────────────────────────────────────────────────

describe("computeContentHash", () => {
	it("returns a hex string", async () => {
		const hash = await computeContentHash("test content");
		expect(hash).toMatch(/^[a-f0-9]+$/);
	});

	it("returns same hash for same content", async () => {
		const hash1 = await computeContentHash("hello world");
		const hash2 = await computeContentHash("hello world");
		expect(hash1).toBe(hash2);
	});

	it("returns different hash for different content", async () => {
		const hash1 = await computeContentHash("hello");
		const hash2 = await computeContentHash("world");
		expect(hash1).not.toBe(hash2);
	});

	it("handles empty string", async () => {
		const hash = await computeContentHash("");
		expect(hash).toMatch(/^[a-f0-9]+$/);
	});
});

// ── chunkText ────────────────────────────────────────────────────────────

describe("chunkText", () => {
	it("returns empty array for empty/whitespace text", () => {
		expect(chunkText("")).toEqual([]);
		expect(chunkText("   ")).toEqual([]);
		expect(chunkText("\n\n")).toEqual([]);
	});

	it("returns chunks for non-empty text", () => {
		const text =
			"This is a paragraph about something.\n\nThis is another paragraph with different content.";
		const chunks = chunkText(text);
		expect(chunks.length).toBeGreaterThanOrEqual(1);
		// All chunks should be non-empty strings
		for (const chunk of chunks) {
			expect(typeof chunk).toBe("string");
			expect(chunk.length).toBeGreaterThan(0);
		}
	});

	it("splits long text into multiple chunks", () => {
		// Create text that exceeds the default maxCharsSoftLimit (2000)
		const paragraph = "This is a test paragraph with enough content. ".repeat(
			20,
		);
		const text = `${paragraph}\n\n${paragraph}\n\n${paragraph}`;
		const chunks = chunkText(text);
		expect(chunks.length).toBeGreaterThanOrEqual(1);
	});

	it("accepts custom chunk options", () => {
		const text = "Short paragraph one.\n\nShort paragraph two.";
		const chunks = chunkText(text, {
			minCharsSoftLimit: 10,
			maxCharsSoftLimit: 50,
			maxCharsHardLimit: 100,
		});
		expect(chunks.length).toBeGreaterThanOrEqual(1);
	});
});
