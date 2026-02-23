/**
 * GitHub Indexing Utilities
 *
 * Helpers for filtering, detecting languages, chunking code files,
 * and decrypting GitHub access tokens for the repository indexing pipeline.
 *
 * NOTE: This module uses process.env for token decryption.
 * Only import from "use node" action files.
 */

// ── Indexable file extensions ────────────────────────────────────────────

export const INDEXABLE_EXTENSIONS = new Set([
	".ts",
	".tsx",
	".js",
	".jsx",
	".mjs",
	".cjs",
	".py",
	".go",
	".rs",
	".java",
	".rb",
	".php",
	".swift",
	".kt",
	".cs",
	".cpp",
	".c",
	".h",
]);

// ── Skip patterns ────────────────────────────────────────────────────────

const SKIP_PATTERNS = [
	"node_modules/",
	".git/",
	"dist/",
	"build/",
	".next/",
	"coverage/",
	"vendor/",
	"__pycache__/",
	".turbo/",
	".vercel/",
];

const SKIP_SUFFIXES = [".min.js", ".bundle.js", ".min.css", ".map"];

/** Maximum file size to index (100KB). */
const MAX_FILE_SIZE = 100 * 1024;

// ── File filtering ───────────────────────────────────────────────────────

/**
 * Determine if a file should be indexed based on extension, path, and size.
 */
export function shouldIndexFile(path: string, sizeBytes?: number): boolean {
	// Check size limit
	if (sizeBytes !== undefined && sizeBytes > MAX_FILE_SIZE) {
		return false;
	}

	// Check skip patterns (directory prefixes)
	for (const pattern of SKIP_PATTERNS) {
		if (path.includes(pattern)) {
			return false;
		}
	}

	// Check skip suffixes
	for (const suffix of SKIP_SUFFIXES) {
		if (path.endsWith(suffix)) {
			return false;
		}
	}

	// Check extension
	const dotIndex = path.lastIndexOf(".");
	if (dotIndex === -1) return false;
	const ext = path.slice(dotIndex).toLowerCase();
	return INDEXABLE_EXTENSIONS.has(ext);
}

// ── Language detection ───────────────────────────────────────────────────

const EXTENSION_TO_LANGUAGE: Record<string, string> = {
	".ts": "typescript",
	".tsx": "typescript",
	".js": "javascript",
	".jsx": "javascript",
	".mjs": "javascript",
	".cjs": "javascript",
	".py": "python",
	".go": "go",
	".rs": "rust",
	".java": "java",
	".rb": "ruby",
	".php": "php",
	".swift": "swift",
	".kt": "kotlin",
	".cs": "csharp",
	".cpp": "cpp",
	".c": "c",
	".h": "c",
};

/**
 * Detect the programming language from a file path's extension.
 */
export function detectLanguage(path: string): string {
	const dotIndex = path.lastIndexOf(".");
	if (dotIndex === -1) return "unknown";
	const ext = path.slice(dotIndex).toLowerCase();
	return EXTENSION_TO_LANGUAGE[ext] ?? "unknown";
}

// ── Code chunk type ──────────────────────────────────────────────────────

export interface CodeChunk {
	content: string;
	startLine: number;
	endLine: number;
	symbolName: string | null;
	chunkType: string;
}

// ── Code-aware chunking ──────────────────────────────────────────────────

/**
 * Regex patterns for TS/JS top-level declarations.
 * Matches lines starting with export/function/class/const/interface/type/enum.
 */
const TS_JS_BOUNDARY_RE =
	/^(?:export\s+(?:default\s+)?)?(?:(?:async\s+)?function\s+(\w+)|class\s+(\w+)|(?:const|let|var)\s+(\w+)|interface\s+(\w+)|type\s+(\w+)|enum\s+(\w+))/;

/** Lines per chunk for non-TS/JS languages. */
const DEFAULT_CHUNK_LINES = 100;

/**
 * Split a code file into semantically meaningful chunks.
 *
 * For TypeScript/JavaScript: splits by top-level declarations
 * (function, class, const, interface, type, enum).
 *
 * For other languages: splits by fixed line count (~100 lines).
 */
export function chunkCodeFile(content: string, language: string): CodeChunk[] {
	if (!content.trim()) return [];

	const lines = content.split("\n");
	if (lines.length === 0) return [];

	const isTypeScriptOrJS =
		language === "typescript" || language === "javascript";

	if (isTypeScriptOrJS) {
		return chunkByDeclarations(lines);
	}
	return chunkByLineCount(lines, DEFAULT_CHUNK_LINES);
}

/**
 * Chunk TS/JS files by top-level declarations.
 */
function chunkByDeclarations(lines: string[]): CodeChunk[] {
	const chunks: CodeChunk[] = [];
	const boundaries: Array<{
		lineIndex: number;
		symbolName: string | null;
		chunkType: string;
	}> = [];

	// Find all declaration boundaries
	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		// Skip lines inside block comments or that are indented (not top-level)
		if (line.startsWith(" ") || line.startsWith("\t")) continue;

		const match = TS_JS_BOUNDARY_RE.exec(line);
		if (match) {
			const symbolName =
				match[1] ?? match[2] ?? match[3] ?? match[4] ?? match[5] ?? match[6];
			let chunkType = "declaration";
			if (match[1]) chunkType = "function";
			else if (match[2]) chunkType = "class";
			else if (match[3]) chunkType = "variable";
			else if (match[4]) chunkType = "interface";
			else if (match[5]) chunkType = "type";
			else if (match[6]) chunkType = "enum";

			boundaries.push({
				lineIndex: i,
				symbolName: symbolName ?? null,
				chunkType,
			});
		}
	}

	// If no declarations found, return the whole file as one chunk
	if (boundaries.length === 0) {
		return [
			{
				content: lines.join("\n"),
				startLine: 1,
				endLine: lines.length,
				symbolName: null,
				chunkType: "module",
			},
		];
	}

	// Handle preamble (imports, comments before first declaration)
	if (boundaries[0].lineIndex > 0) {
		const preambleLines = lines.slice(0, boundaries[0].lineIndex);
		const preambleContent = preambleLines.join("\n").trim();
		if (preambleContent.length > 0) {
			chunks.push({
				content: preambleContent,
				startLine: 1,
				endLine: boundaries[0].lineIndex,
				symbolName: null,
				chunkType: "preamble",
			});
		}
	}

	// Create chunks between boundaries
	for (let i = 0; i < boundaries.length; i++) {
		const start = boundaries[i].lineIndex;
		const end =
			i < boundaries.length - 1 ? boundaries[i + 1].lineIndex : lines.length;

		const chunkLines = lines.slice(start, end);
		const chunkContent = chunkLines.join("\n").trimEnd();

		if (chunkContent.length > 0) {
			chunks.push({
				content: chunkContent,
				startLine: start + 1,
				endLine: end,
				symbolName: boundaries[i].symbolName,
				chunkType: boundaries[i].chunkType,
			});
		}
	}

	return chunks;
}

/**
 * Chunk files by fixed line count for non-TS/JS languages.
 */
function chunkByLineCount(lines: string[], chunkSize: number): CodeChunk[] {
	const chunks: CodeChunk[] = [];
	for (let i = 0; i < lines.length; i += chunkSize) {
		const end = Math.min(i + chunkSize, lines.length);
		const chunkLines = lines.slice(i, end);
		const content = chunkLines.join("\n").trimEnd();

		if (content.length > 0) {
			chunks.push({
				content,
				startLine: i + 1,
				endLine: end,
				symbolName: null,
				chunkType: "block",
			});
		}
	}
	return chunks;
}

// ── Token decryption ─────────────────────────────────────────────────────

const ALGORITHM = "AES-GCM";
const IV_LENGTH = 12; // 96-bit IV for AES-GCM
const KEY_LENGTH = 32; // 256-bit key

/**
 * Decrypt an AES-256-GCM encrypted GitHub access token.
 * Uses GITHUB_TOKEN_ENCRYPTION_KEY from process.env.
 */
export async function decryptToken(encrypted: string): Promise<string> {
	const hexKey = process.env.GITHUB_TOKEN_ENCRYPTION_KEY;
	if (!hexKey) {
		throw new Error(
			"GITHUB_TOKEN_ENCRYPTION_KEY environment variable is required",
		);
	}
	if (hexKey.length !== KEY_LENGTH * 2) {
		throw new Error(
			`GITHUB_TOKEN_ENCRYPTION_KEY must be a ${KEY_LENGTH * 2}-character hex string`,
		);
	}

	const matches = hexKey.match(/.{1,2}/g);
	if (!matches) throw new Error("Invalid hex key format");
	const keyBytes = new Uint8Array(
		matches.map((byte) => Number.parseInt(byte, 16)),
	);

	const key = await crypto.subtle.importKey(
		"raw",
		keyBytes,
		{ name: ALGORITHM },
		false,
		["decrypt"],
	);

	const combined = Uint8Array.from(atob(encrypted), (c) => c.charCodeAt(0));
	const iv = combined.slice(0, IV_LENGTH);
	const ciphertext = combined.slice(IV_LENGTH);

	const decrypted = await crypto.subtle.decrypt(
		{ name: ALGORITHM, iv },
		key,
		ciphertext,
	);

	return new TextDecoder().decode(decrypted);
}
