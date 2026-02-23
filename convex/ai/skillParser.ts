/**
 * SkillsMD Parser — extracts structured instruction blocks from skill markdown.
 *
 * Pure function with no Convex runtime dependencies.
 */

export interface ParsedSkill {
	/** Skill name from frontmatter or first H1 */
	name?: string;
	/** Skill version from frontmatter */
	version?: string;
	/** Skill author from frontmatter */
	author?: string;
	/** Content under ## Instructions */
	instructions: string;
	/** Content under ## Constraints */
	constraints: string;
	/** Content under ## Examples */
	examples: string;
	/** Content under ## Context */
	context: string;
	/** Original markdown (fallback) */
	raw: string;
}

// ── Frontmatter ─────────────────────────────────────────────────────────────

interface Frontmatter {
	name?: string;
	version?: string;
	author?: string;
}

/**
 * Extract YAML-style frontmatter between `---` delimiters.
 * Returns the parsed fields and the remaining content after frontmatter.
 */
function extractFrontmatter(markdown: string): {
	frontmatter: Frontmatter;
	body: string;
} {
	const trimmed = markdown.trimStart();

	// Must start with `---` followed by a newline
	if (!trimmed.startsWith("---")) {
		return { frontmatter: {}, body: markdown };
	}

	// Find the closing `---` delimiter (after the opening one)
	const afterOpening = trimmed.indexOf("\n");
	if (afterOpening === -1) {
		return { frontmatter: {}, body: markdown };
	}

	const rest = trimmed.slice(afterOpening + 1);
	const closingIndex = rest.indexOf("\n---");
	if (closingIndex === -1) {
		// No closing delimiter — treat as no frontmatter
		return { frontmatter: {}, body: markdown };
	}

	const frontmatterBlock = rest.slice(0, closingIndex);
	const body = rest.slice(closingIndex + 4).trimStart(); // skip "\n---"

	const frontmatter: Frontmatter = {};
	for (const line of frontmatterBlock.split("\n")) {
		const colonIndex = line.indexOf(":");
		if (colonIndex === -1) continue;
		const key = line.slice(0, colonIndex).trim().toLowerCase();
		const value = line.slice(colonIndex + 1).trim();
		if (key === "name") frontmatter.name = value;
		else if (key === "version") frontmatter.version = value;
		else if (key === "author") frontmatter.author = value;
	}

	return { frontmatter, body };
}

// ── Section Extraction ──────────────────────────────────────────────────────

/** Known section names (lowercase) */
const KNOWN_SECTIONS = new Set([
	"instructions",
	"constraints",
	"examples",
	"context",
]);

/**
 * Split markdown body by `## ` headings into a map of section name → content.
 * Heading matching is case-insensitive.
 */
function extractSections(body: string): Map<string, string> {
	const sections = new Map<string, string>();

	// Split on lines that start with `## ` (level-2 headings)
	const headingRegex = /^##\s+(.+)$/gm;
	const matches: Array<{ name: string; index: number }> = [];

	let match: RegExpExecArray | null = headingRegex.exec(body);
	while (match !== null) {
		matches.push({ name: match[1].trim(), index: match.index });
		match = headingRegex.exec(body);
	}

	if (matches.length === 0) {
		return sections;
	}

	for (let i = 0; i < matches.length; i++) {
		const heading = matches[i];
		const contentStart = body.indexOf("\n", heading.index);
		if (contentStart === -1) {
			sections.set(heading.name.toLowerCase(), "");
			continue;
		}
		const contentEnd =
			i + 1 < matches.length ? matches[i + 1].index : body.length;
		const content = body.slice(contentStart + 1, contentEnd).trim();
		sections.set(heading.name.toLowerCase(), content);
	}

	return sections;
}

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Parse a raw SkillsMD markdown string into a structured `ParsedSkill`.
 *
 * Strategy:
 * 1. Extract YAML frontmatter (name, version, author) if present.
 * 2. Split remaining body by `## ` headings.
 * 3. Map known sections (instructions, constraints, examples, context).
 * 4. If no known sections are found, treat the entire content as instructions.
 */
export function parseSkillMarkdown(markdown: string): ParsedSkill {
	if (!markdown || markdown.trim().length === 0) {
		return {
			instructions: "",
			constraints: "",
			examples: "",
			context: "",
			raw: markdown,
		};
	}

	const { frontmatter, body } = extractFrontmatter(markdown);
	const sections = extractSections(body);

	// Check if any known section was found
	const hasKnownSection = Array.from(sections.keys()).some((key) =>
		KNOWN_SECTIONS.has(key),
	);

	const instructions = hasKnownSection
		? (sections.get("instructions") ?? "")
		: body.trim();

	return {
		name: frontmatter.name,
		version: frontmatter.version,
		author: frontmatter.author,
		instructions,
		constraints: sections.get("constraints") ?? "",
		examples: sections.get("examples") ?? "",
		context: sections.get("context") ?? "",
		raw: markdown,
	};
}
