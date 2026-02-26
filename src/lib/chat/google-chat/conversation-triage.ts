export type ConversationTranscriptEntry = {
	role: "user" | "assistant";
	text: string;
};

export type IssueTriagePriority =
	| "urgent"
	| "high"
	| "medium"
	| "low"
	| "no_priority";

export type IssueTriageType = "issue" | "bug" | "improvement" | "feature";

export type NormalizedIssueTriageMetadata = {
	priority: IssueTriagePriority;
	type: IssueTriageType;
	labels: string[];
	reasoning: string;
};

export type DuplicateCandidate = {
	identifier: string;
	title: string;
	status: string;
	priority: string;
	similarity?: number;
	reason?: string;
};

export type DuplicateHint = {
	identifier: string;
	similarity?: number;
	reason?: string;
};

const MAX_DEFAULT_TRANSCRIPT_CHARS = 3200;
const MAX_DEFAULT_DUPLICATE_COUNT = 5;

function clamp(value: number, min: number, max: number): number {
	return Math.min(max, Math.max(min, value));
}

function normalizeWhitespace(text: string): string {
	return text.replace(/\s+/g, " ").trim();
}

function normalizeIdentifier(identifier: string): string {
	return identifier.trim().toUpperCase();
}

function normalizeLabelName(label: string): string | null {
	const normalized = normalizeWhitespace(label).replace(/[^\w\s:/-]/g, "");
	if (!normalized) return null;
	return normalized.slice(0, 32);
}

function tokenizeForSimilarity(text: string): Set<string> {
	return new Set(
		normalizeWhitespace(text)
			.toLowerCase()
			.replace(/[^a-z0-9\s-]/g, " ")
			.split(/\s+/)
			.filter((token) => token.length > 2),
	);
}

function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
	if (a.size === 0 || b.size === 0) return 0;
	let intersection = 0;
	for (const token of a) {
		if (b.has(token)) intersection += 1;
	}
	const union = a.size + b.size - intersection;
	if (union <= 0) return 0;
	return intersection / union;
}

export function formatConversationTranscript(
	entries: ConversationTranscriptEntry[],
	maxChars = MAX_DEFAULT_TRANSCRIPT_CHARS,
): string {
	const cleaned = entries
		.map((entry) => ({
			role: entry.role,
			text: normalizeWhitespace(entry.text),
		}))
		.filter((entry) => entry.text.length > 0);

	if (cleaned.length === 0) return "";

	const lines = cleaned.map(
		(entry) => `${entry.role === "user" ? "User" : "Assistant"}: ${entry.text}`,
	);

	const full = lines.join("\n");
	if (full.length <= maxChars) return full;

	const recentLines: string[] = [];
	let used = 0;
	for (let index = lines.length - 1; index >= 0; index -= 1) {
		const line = lines[index];
		const lineCost = line.length + 1;
		if (used + lineCost > maxChars) break;
		recentLines.unshift(line);
		used += lineCost;
	}

	const truncatedPrefix = "Earlier transcript omitted for brevity.\n";
	const remaining = Math.max(0, maxChars - truncatedPrefix.length);
	const recent = recentLines.join("\n");
	if (recent.length <= remaining) {
		return `${truncatedPrefix}${recent}`.trim();
	}
	return `${truncatedPrefix}${recent.slice(recent.length - remaining)}`.trim();
}

export function buildFallbackIssueDraftFromTranscript(
	transcriptEntries: ConversationTranscriptEntry[],
): { title: string; description: string } {
	const normalized = transcriptEntries
		.map((entry) => ({
			role: entry.role,
			text: normalizeWhitespace(entry.text),
		}))
		.filter((entry) => entry.text.length > 0);

	const firstUserLine =
		normalized.find((entry) => entry.role === "user")?.text ??
		normalized[0]?.text ??
		"Investigate issue reported in Google Chat";
	const titleSeed = firstUserLine
		.replace(/^@clave\b[:\s-]*/i, "")
		.replace(/^create\s+issue\s+(for|about)\s+/i, "")
		.trim();
	const title =
		titleSeed.length > 0
			? titleSeed.slice(0, 120)
			: "Investigate issue reported in Google Chat";

	const recentContext = normalized
		.slice(-6)
		.map(
			(entry) =>
				`- ${entry.role === "user" ? "User" : "Assistant"}: ${entry.text}`,
		)
		.join("\n");

	const description = [
		"## Summary",
		`Created from Google Chat conversation. Draft generated from recent context around "${title}".`,
		"",
		"## Conversation highlights",
		recentContext || "- No transcript details were captured.",
		"",
		"## Next steps",
		"- Validate scope and reproduction details.",
		"- Confirm owner, priority, and timeline.",
	].join("\n");

	return {
		title,
		description: description.slice(0, 3000),
	};
}

export function parseLooseJsonObject(
	text: string,
): Record<string, unknown> | null {
	const cleaned = text
		.replace(/^```(?:json)?\s*/i, "")
		.replace(/\s*```$/i, "")
		.trim();
	if (!cleaned) return null;

	try {
		const direct = JSON.parse(cleaned) as unknown;
		if (direct && typeof direct === "object" && !Array.isArray(direct)) {
			return direct as Record<string, unknown>;
		}
	} catch {
		// Fall through to tolerant parser.
	}

	const start = cleaned.search(/{/);
	if (start === -1) return null;
	let depth = 0;
	let inString = false;
	let escaping = false;
	for (let index = start; index < cleaned.length; index += 1) {
		const char = cleaned[index];
		if (inString) {
			if (escaping) {
				escaping = false;
				continue;
			}
			if (char === "\\") {
				escaping = true;
				continue;
			}
			if (char === '"') inString = false;
			continue;
		}
		if (char === '"') {
			inString = true;
			continue;
		}
		if (char === "{") {
			depth += 1;
			continue;
		}
		if (char === "}") {
			depth -= 1;
			if (depth === 0) {
				const candidate = cleaned.slice(start, index + 1);
				try {
					const parsed = JSON.parse(candidate) as unknown;
					if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
						return parsed as Record<string, unknown>;
					}
				} catch {
					return null;
				}
			}
		}
	}

	return null;
}

export function normalizeIssueTriageMetadata(
	raw: Record<string, unknown> | null | undefined,
): NormalizedIssueTriageMetadata {
	const priorityRaw =
		typeof raw?.priority === "string" ? raw.priority.trim().toLowerCase() : "";
	const typeRaw =
		typeof raw?.type === "string" ? raw.type.trim().toLowerCase() : "";
	const reasoningRaw =
		typeof raw?.reasoning === "string"
			? normalizeWhitespace(raw.reasoning)
			: "";

	const priority: IssueTriagePriority =
		priorityRaw === "urgent" ||
		priorityRaw === "high" ||
		priorityRaw === "medium" ||
		priorityRaw === "low" ||
		priorityRaw === "no_priority"
			? priorityRaw
			: "medium";

	let type: IssueTriageType = "issue";
	if (
		typeRaw === "issue" ||
		typeRaw === "bug" ||
		typeRaw === "improvement" ||
		typeRaw === "feature"
	) {
		type = typeRaw;
	} else if (typeRaw === "task" || typeRaw === "chore") {
		type = "issue";
	}

	const labelsInput = Array.isArray(raw?.labels) ? raw.labels : [];
	const seen = new Set<string>();
	const labels: string[] = [];
	for (const candidate of labelsInput) {
		if (typeof candidate !== "string") continue;
		const normalized = normalizeLabelName(candidate);
		if (!normalized) continue;
		const key = normalized.toLowerCase();
		if (seen.has(key)) continue;
		seen.add(key);
		labels.push(normalized);
		if (labels.length >= 4) break;
	}

	return {
		priority,
		type,
		labels,
		reasoning: reasoningRaw,
	};
}

export function normalizeDuplicateHints(
	raw: Record<string, unknown> | null | undefined,
): DuplicateHint[] {
	const duplicates = Array.isArray(raw?.duplicates) ? raw.duplicates : [];
	const hints: DuplicateHint[] = [];
	for (const entry of duplicates) {
		if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
		const record = entry as Record<string, unknown>;
		const identifier =
			typeof record.identifier === "string"
				? normalizeIdentifier(record.identifier)
				: "";
		if (!identifier) continue;
		const similarity =
			typeof record.similarity === "number"
				? clamp(record.similarity, 0, 1)
				: undefined;
		const reason =
			typeof record.reason === "string"
				? normalizeWhitespace(record.reason).slice(0, 240)
				: undefined;
		hints.push({ identifier, similarity, reason });
	}
	return hints;
}

export function rankDuplicateCandidates(args: {
	searchTerm: string;
	candidates: DuplicateCandidate[];
	aiHints?: DuplicateHint[];
	limit?: number;
}): DuplicateCandidate[] {
	const normalizedSearchTerm = normalizeWhitespace(args.searchTerm);
	if (!normalizedSearchTerm) {
		return args.candidates.slice(0, args.limit ?? MAX_DEFAULT_DUPLICATE_COUNT);
	}

	const hintByIdentifier = new Map<string, DuplicateHint>();
	for (const hint of args.aiHints ?? []) {
		hintByIdentifier.set(normalizeIdentifier(hint.identifier), hint);
	}

	const searchTokens = tokenizeForSimilarity(normalizedSearchTerm);
	const ranked = args.candidates.map((candidate) => {
		const identifier = normalizeIdentifier(candidate.identifier);
		const hint = hintByIdentifier.get(identifier);
		const lexicalScore = jaccardSimilarity(
			searchTokens,
			tokenizeForSimilarity(candidate.title),
		);
		const aiScore =
			typeof hint?.similarity === "number"
				? clamp(hint.similarity, 0, 1)
				: null;
		const score = aiScore !== null ? aiScore : lexicalScore;
		return {
			...candidate,
			identifier,
			similarity: score,
			reason: hint?.reason ?? candidate.reason,
		};
	});

	ranked.sort((a, b) => {
		const scoreDiff = (b.similarity ?? 0) - (a.similarity ?? 0);
		if (scoreDiff !== 0) return scoreDiff;
		return a.identifier.localeCompare(b.identifier);
	});

	return ranked.slice(0, args.limit ?? MAX_DEFAULT_DUPLICATE_COUNT);
}

export function isExplicitCreateConfirmation(
	value: string | null | undefined,
): boolean {
	if (!value) return false;
	const normalized = value.trim().toLowerCase();
	return (
		normalized === "true" ||
		normalized === "1" ||
		normalized === "yes" ||
		normalized === "confirm"
	);
}

export function buildConversationTraceNote(args: {
	conversationKey: string;
	spaceName?: string;
	threadName?: string;
}): string {
	const lines = [
		"---",
		"_Created from Google Chat conversation._",
		`- Conversation key: \`${args.conversationKey}\``,
		args.spaceName ? `- Space: \`${args.spaceName}\`` : null,
		args.threadName ? `- Thread: \`${args.threadName}\`` : null,
	]
		.filter(Boolean)
		.join("\n");
	return lines;
}
