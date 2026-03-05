/**
 * @vitest-environment node
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
	chunkCodeFile,
	decryptToken,
	detectLanguage,
	INDEXABLE_EXTENSIONS,
	shouldIndexFile,
} from "../../convex/ai/indexing/githubUtils";

// ── INDEXABLE_EXTENSIONS ─────────────────────────────────────────────────

describe("INDEXABLE_EXTENSIONS", () => {
	it("includes common web extensions", () => {
		for (const ext of [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"]) {
			expect(INDEXABLE_EXTENSIONS.has(ext)).toBe(true);
		}
	});

	it("includes backend/systems extensions", () => {
		for (const ext of [".py", ".go", ".rs", ".java", ".rb", ".php"]) {
			expect(INDEXABLE_EXTENSIONS.has(ext)).toBe(true);
		}
	});

	it("includes mobile/native extensions", () => {
		for (const ext of [".swift", ".kt", ".cs", ".cpp", ".c", ".h"]) {
			expect(INDEXABLE_EXTENSIONS.has(ext)).toBe(true);
		}
	});

	it("excludes non-code extensions", () => {
		for (const ext of [".md", ".json", ".yaml", ".css", ".html", ".svg"]) {
			expect(INDEXABLE_EXTENSIONS.has(ext)).toBe(false);
		}
	});
});

// ── shouldIndexFile ──────────────────────────────────────────────────────

describe("shouldIndexFile", () => {
	it("accepts standard code files", () => {
		expect(shouldIndexFile("src/utils/helper.ts")).toBe(true);
		expect(shouldIndexFile("components/App.tsx")).toBe(true);
		expect(shouldIndexFile("server.py")).toBe(true);
		expect(shouldIndexFile("main.go")).toBe(true);
	});

	it("rejects files without extensions", () => {
		expect(shouldIndexFile("Makefile")).toBe(false);
		expect(shouldIndexFile("Dockerfile")).toBe(false);
	});

	it("rejects files with non-indexable extensions", () => {
		expect(shouldIndexFile("README.md")).toBe(false);
		expect(shouldIndexFile("package.json")).toBe(false);
		expect(shouldIndexFile("styles.css")).toBe(false);
	});

	it("rejects files in skip directories", () => {
		expect(shouldIndexFile("node_modules/react/index.js")).toBe(false);
		expect(shouldIndexFile(".git/hooks/pre-commit")).toBe(false);
		expect(shouldIndexFile("dist/bundle.js")).toBe(false);
		expect(shouldIndexFile("build/output.js")).toBe(false);
		expect(shouldIndexFile(".next/server/page.js")).toBe(false);
		expect(shouldIndexFile("coverage/lcov.js")).toBe(false);
		expect(shouldIndexFile("vendor/lib.rb")).toBe(false);
		expect(shouldIndexFile("__pycache__/module.py")).toBe(false);
		expect(shouldIndexFile(".turbo/cache.js")).toBe(false);
		expect(shouldIndexFile(".vercel/output.js")).toBe(false);
	});

	it("rejects minified and bundled files", () => {
		expect(shouldIndexFile("app.min.js")).toBe(false);
		expect(shouldIndexFile("vendor.bundle.js")).toBe(false);
		expect(shouldIndexFile("styles.min.css")).toBe(false);
		expect(shouldIndexFile("source.map")).toBe(false);
	});

	it("rejects files over 100KB", () => {
		expect(shouldIndexFile("big-file.ts", 100 * 1024 + 1)).toBe(false);
	});

	it("accepts files at exactly 100KB", () => {
		expect(shouldIndexFile("exact.ts", 100 * 1024)).toBe(true);
	});

	it("accepts files when no size is provided", () => {
		expect(shouldIndexFile("code.ts")).toBe(true);
	});

	it("handles case-insensitive extensions", () => {
		expect(shouldIndexFile("Module.TS")).toBe(true);
		expect(shouldIndexFile("Component.TSX")).toBe(true);
	});
});

// ── detectLanguage ───────────────────────────────────────────────────────

describe("detectLanguage", () => {
	it("detects TypeScript", () => {
		expect(detectLanguage("file.ts")).toBe("typescript");
		expect(detectLanguage("file.tsx")).toBe("typescript");
	});

	it("detects JavaScript variants", () => {
		expect(detectLanguage("file.js")).toBe("javascript");
		expect(detectLanguage("file.jsx")).toBe("javascript");
		expect(detectLanguage("file.mjs")).toBe("javascript");
		expect(detectLanguage("file.cjs")).toBe("javascript");
	});

	it("detects other languages", () => {
		expect(detectLanguage("file.py")).toBe("python");
		expect(detectLanguage("file.go")).toBe("go");
		expect(detectLanguage("file.rs")).toBe("rust");
		expect(detectLanguage("file.java")).toBe("java");
		expect(detectLanguage("file.rb")).toBe("ruby");
		expect(detectLanguage("file.php")).toBe("php");
		expect(detectLanguage("file.swift")).toBe("swift");
		expect(detectLanguage("file.kt")).toBe("kotlin");
		expect(detectLanguage("file.cs")).toBe("csharp");
		expect(detectLanguage("file.cpp")).toBe("cpp");
		expect(detectLanguage("file.c")).toBe("c");
		expect(detectLanguage("file.h")).toBe("c");
	});

	it("returns unknown for unrecognized extensions", () => {
		expect(detectLanguage("file.md")).toBe("unknown");
		expect(detectLanguage("file.json")).toBe("unknown");
	});

	it("returns unknown for files without extensions", () => {
		expect(detectLanguage("Makefile")).toBe("unknown");
	});
});

// ── chunkCodeFile ────────────────────────────────────────────────────────

describe("chunkCodeFile", () => {
	it("returns empty array for empty content", () => {
		expect(chunkCodeFile("", "typescript")).toEqual([]);
	});

	it("chunks TS/JS by top-level declarations", () => {
		const content = [
			"import { foo } from 'bar';",
			"",
			"export function greet(name: string) {",
			`  return \`Hello \${name}\`;`,
			"}",
			"",
			"export const PI = 3.14;",
		].join("\n");

		const chunks = chunkCodeFile(content, "typescript");

		// Should have preamble (import) + function + const
		expect(chunks.length).toBeGreaterThanOrEqual(2);

		// First declaration should be the function
		const funcChunk = chunks.find((c) => c.chunkType === "function");
		expect(funcChunk).toBeDefined();
		expect(funcChunk?.symbolName).toBe("greet");

		// Should have the const
		const varChunk = chunks.find((c) => c.chunkType === "variable");
		expect(varChunk).toBeDefined();
		expect(varChunk?.symbolName).toBe("PI");
	});

	it("detects class declarations", () => {
		const content = [
			"export class MyService {",
			"  constructor() {}",
			"  run() {}",
			"}",
		].join("\n");

		const chunks = chunkCodeFile(content, "typescript");
		const classChunk = chunks.find((c) => c.chunkType === "class");
		expect(classChunk).toBeDefined();
		expect(classChunk?.symbolName).toBe("MyService");
	});

	it("detects interface and type declarations", () => {
		const content = [
			"export interface Config {",
			"  name: string;",
			"}",
			"",
			"export type Status = 'active' | 'inactive';",
		].join("\n");

		const chunks = chunkCodeFile(content, "typescript");
		const interfaceChunk = chunks.find((c) => c.chunkType === "interface");
		expect(interfaceChunk).toBeDefined();
		expect(interfaceChunk?.symbolName).toBe("Config");

		const typeChunk = chunks.find((c) => c.chunkType === "type");
		expect(typeChunk).toBeDefined();
		expect(typeChunk?.symbolName).toBe("Status");
	});

	it("returns whole file as one chunk when no declarations found", () => {
		const content = "// Just a comment file\n// with no declarations";
		const chunks = chunkCodeFile(content, "typescript");

		expect(chunks).toHaveLength(1);
		expect(chunks[0].chunkType).toBe("module");
		expect(chunks[0].symbolName).toBeNull();
	});

	it("chunks non-TS/JS by line count (~100 lines)", () => {
		// Create a file with 250 lines
		const lines = Array.from({ length: 250 }, (_, i) => `line ${i + 1}`);
		const content = lines.join("\n");

		const chunks = chunkCodeFile(content, "python");

		// Should be split into ~3 chunks of 100 lines each
		expect(chunks.length).toBe(3);

		expect(chunks[0].startLine).toBe(1);
		expect(chunks[0].endLine).toBe(100);
		expect(chunks[0].chunkType).toBe("block");

		expect(chunks[1].startLine).toBe(101);
		expect(chunks[1].endLine).toBe(200);

		expect(chunks[2].startLine).toBe(201);
		expect(chunks[2].endLine).toBe(250);
	});

	it("sets correct line numbers for TS declarations", () => {
		const content = [
			"export function a() {}", // line 1
			"export function b() {}", // line 2
		].join("\n");

		const chunks = chunkCodeFile(content, "javascript");
		// Both are top-level, should be separate chunks
		expect(chunks.length).toBe(2);
		expect(chunks[0].startLine).toBe(1);
		expect(chunks[1].startLine).toBe(2);
	});

	it("creates preamble chunk for imports before first declaration", () => {
		const content = [
			"import { a } from 'a';",
			"import { b } from 'b';",
			"",
			"export function main() {}",
		].join("\n");

		const chunks = chunkCodeFile(content, "typescript");
		const preamble = chunks.find((c) => c.chunkType === "preamble");
		expect(preamble).toBeDefined();
		expect(preamble?.content).toContain("import");
	});
});

// ── decryptToken ─────────────────────────────────────────────────────────

describe("decryptToken", () => {
	const originalEnv = process.env;

	beforeEach(() => {
		process.env = { ...originalEnv };
	});

	afterEach(() => {
		process.env = originalEnv;
	});

	it("throws when GITHUB_TOKEN_ENCRYPTION_KEY is not set", async () => {
		delete process.env.GITHUB_TOKEN_ENCRYPTION_KEY;
		await expect(decryptToken("dummy")).rejects.toThrow(
			"GITHUB_TOKEN_ENCRYPTION_KEY environment variable is required",
		);
	});

	it("throws when key has wrong length", async () => {
		process.env.GITHUB_TOKEN_ENCRYPTION_KEY = "abcdef"; // too short
		await expect(decryptToken("dummy")).rejects.toThrow(
			"must be a 64-character hex string",
		);
	});

	it("successfully decrypts a properly encrypted token", async () => {
		// Generate a test key and encrypt a token using the same algorithm
		const keyBytes = new Uint8Array(32);
		crypto.getRandomValues(keyBytes);
		const hexKey = Array.from(keyBytes)
			.map((b) => b.toString(16).padStart(2, "0"))
			.join("");

		process.env.GITHUB_TOKEN_ENCRYPTION_KEY = hexKey;

		// Encrypt a test token
		const testToken = "ghp_test123456789";
		const key = await crypto.subtle.importKey(
			"raw",
			keyBytes,
			{ name: "AES-GCM" },
			false,
			["encrypt"],
		);
		const iv = new Uint8Array(12);
		crypto.getRandomValues(iv);
		const encrypted = await crypto.subtle.encrypt(
			{ name: "AES-GCM", iv },
			key,
			new TextEncoder().encode(testToken),
		);

		// Combine iv + ciphertext and base64 encode
		const combined = new Uint8Array(
			iv.length + new Uint8Array(encrypted).length,
		);
		combined.set(iv);
		combined.set(new Uint8Array(encrypted), iv.length);
		const base64 = btoa(String.fromCharCode(...combined));

		// Decrypt
		const result = await decryptToken(base64);
		expect(result).toBe(testToken);
	});
});
