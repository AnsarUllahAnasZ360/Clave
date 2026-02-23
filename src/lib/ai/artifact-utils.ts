import type { ArtifactData, ArtifactType } from "@/types/artifacts";

// ── Artifact Extraction Heuristics ──────────────────────────────────────
// Client-side extraction: parse assistant message text for artifact-worthy
// content. @convex-dev/agent doesn't support custom data parts through its
// streamText API, so we extract artifacts from the rendered text instead.
//
// Thresholds:
//  - Code: fence with ≥30 lines
//  - Markdown: ≥2 headings AND ≥200 words
//  - Diagram: any Mermaid code fence
//  - Table: markdown table with ≥5 data rows

// ── Code fence regex ────────────────────────────────────────────────────
// Matches fenced code blocks: ```lang\n...content...\n```
const CODE_FENCE_RE = /```(\w+)?\n([\s\S]*?)```/g;

// ── Markdown heading regex ──────────────────────────────────────────────
const HEADING_RE = /^#{1,6}\s+.+$/gm;

// ── Markdown table regex ────────────────────────────────────────────────
// Matches a full markdown table (header + separator + rows)
const TABLE_RE = /(\|[^\n]+\|\n)(\|[\s:|-]+\|\n)((?:\|[^\n]+\|\n?)+)/g;

const CODE_LINE_THRESHOLD = 30;
const MARKDOWN_HEADING_THRESHOLD = 2;
const MARKDOWN_WORD_THRESHOLD = 200;
const TABLE_ROW_THRESHOLD = 5;

let artifactCounter = 0;

function generateArtifactId(): string {
	artifactCounter += 1;
	return `artifact-${Date.now()}-${artifactCounter}`;
}

/** Infer a title from a code fence's language and first meaningful line */
function inferCodeTitle(language: string | undefined, content: string): string {
	// Try to find a class, function, or export name
	const classMatch = content.match(/(?:class|interface|type|enum)\s+(\w+)/);
	if (classMatch) return classMatch[1];

	const fnMatch = content.match(
		/(?:function|const|let|var|export\s+(?:default\s+)?(?:function|const))\s+(\w+)/,
	);
	if (fnMatch) return fnMatch[1];

	// Fall back to language name
	return language
		? `${language.charAt(0).toUpperCase() + language.slice(1)} Code`
		: "Code";
}

/** Infer a title from the first heading in markdown content */
function inferMarkdownTitle(text: string): string {
	const match = text.match(/^#{1,6}\s+(.+)$/m);
	return match ? match[1].trim() : "Document";
}

/**
 * Extract artifact-worthy content from an assistant message's text.
 *
 * Returns an array of ArtifactData objects for content that exceeds
 * the extraction thresholds. The original text positions are tracked
 * so MessageItem can render ArtifactCards at the right place.
 */
export function extractArtifacts(
	text: string,
	messageStatus: "streaming" | "success" | string = "success",
): ArtifactData[] {
	// Don't extract from streaming messages — wait until complete
	if (messageStatus === "streaming") return [];
	if (!text) return [];

	const artifacts: ArtifactData[] = [];
	const seenContent = new Set<string>();

	// ── Scan code fences ──────────────────────────────────────────────
	let match: RegExpExecArray | null;
	CODE_FENCE_RE.lastIndex = 0;
	match = CODE_FENCE_RE.exec(text);
	while (match !== null) {
		const language = match[1]?.toLowerCase();
		const content = match[2];

		// Mermaid diagrams → diagram artifact (any size)
		if (language === "mermaid") {
			const key = `diagram:${content}`;
			if (!seenContent.has(key)) {
				seenContent.add(key);
				artifacts.push({
					id: generateArtifactId(),
					type: "diagram",
					title: "Mermaid Diagram",
					content,
					status: "complete",
				});
			}
		}
		// Code blocks ≥30 lines → code artifact
		else if (content) {
			const lineCount = content.split("\n").length;
			if (lineCount >= CODE_LINE_THRESHOLD) {
				const key = `code:${content}`;
				if (!seenContent.has(key)) {
					seenContent.add(key);
					artifacts.push({
						id: generateArtifactId(),
						type: "code",
						title: inferCodeTitle(language, content),
						content,
						status: "complete",
						language,
					});
				}
			}
		}
		match = CODE_FENCE_RE.exec(text);
	}

	// ── Scan for large tables ─────────────────────────────────────────
	TABLE_RE.lastIndex = 0;
	match = TABLE_RE.exec(text);
	while (match !== null) {
		const rowsBlock = match[3];
		const rows = rowsBlock.trim().split("\n").filter(Boolean);
		if (rows.length >= TABLE_ROW_THRESHOLD) {
			const fullTable = match[0];
			const key = `table:${fullTable}`;
			if (!seenContent.has(key)) {
				seenContent.add(key);
				// Use the header row for the title
				const headerCells = match[1]
					.split("|")
					.map((c) => c.trim())
					.filter(Boolean);
				const title =
					headerCells.length > 0
						? `Table: ${headerCells.slice(0, 3).join(", ")}${headerCells.length > 3 ? "..." : ""}`
						: "Data Table";
				artifacts.push({
					id: generateArtifactId(),
					type: "table",
					title,
					content: fullTable,
					status: "complete",
				});
			}
		}
		match = TABLE_RE.exec(text);
	}

	// ── Check if the full message qualifies as a markdown artifact ────
	// Strip code fences before evaluating headings and word count
	const textWithoutCode = text.replace(CODE_FENCE_RE, "");
	const headings = textWithoutCode.match(HEADING_RE);
	const wordCount = textWithoutCode
		.split(/\s+/)
		.filter((w) => w.length > 0).length;

	if (
		headings &&
		headings.length >= MARKDOWN_HEADING_THRESHOLD &&
		wordCount >= MARKDOWN_WORD_THRESHOLD
	) {
		const key = `markdown:${text.slice(0, 200)}`;
		if (!seenContent.has(key)) {
			seenContent.add(key);
			artifacts.push({
				id: generateArtifactId(),
				type: "markdown",
				title: inferMarkdownTitle(text),
				content: text,
				status: "complete",
			});
		}
	}

	return artifacts;
}

/** Icon name for each artifact type (maps to lucide-react icon names) */
export function getArtifactIcon(
	type: ArtifactType,
): "Code" | "FileText" | "GitBranch" | "Table" {
	switch (type) {
		case "code":
			return "Code";
		case "markdown":
			return "FileText";
		case "diagram":
			return "GitBranch";
		case "table":
			return "Table";
	}
}

/** Human-readable label for each artifact type */
export function getArtifactLabel(type: ArtifactType): string {
	switch (type) {
		case "code":
			return "Code";
		case "markdown":
			return "Document";
		case "diagram":
			return "Diagram";
		case "table":
			return "Table";
	}
}
