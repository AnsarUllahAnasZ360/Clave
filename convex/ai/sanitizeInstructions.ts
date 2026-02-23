/**
 * Basic prompt injection sanitization for user-written sub-agent instructions.
 *
 * This is heuristic defense-in-depth — not a security boundary against
 * sophisticated attacks. The LLM already has its own safety filters.
 * Our sanitization catches the most common patterns that could cause
 * the agent to ignore its configured instructions.
 *
 * @see STORY-024 for design context
 */

/** Maximum allowed length for sub-agent instructions */
const MAX_INSTRUCTIONS_LENGTH = 10_000;

/** Known prompt injection override patterns (case-insensitive) */
const INJECTION_PATTERNS = [
	"ignore previous instructions",
	"ignore all previous",
	"disregard previous",
	"disregard all previous",
	"you are now",
	"new instructions:",
	"system:",
	"system prompt:",
	"[inst]",
	"<<sys>>",
	"</s>",
	"<|im_start|>",
	"<|im_end|>",
] as const;

/**
 * Sanitize user-written sub-agent instructions.
 * Returns validation result with warnings for flagged content.
 */
export function sanitizeInstructions(instructions: string): {
	valid: boolean;
	sanitized: string;
	warnings: string[];
} {
	const warnings: string[] = [];

	// Check max length
	if (instructions.length > MAX_INSTRUCTIONS_LENGTH) {
		return {
			valid: false,
			sanitized: instructions.slice(0, MAX_INSTRUCTIONS_LENGTH),
			warnings: [
				`Instructions exceed maximum length of ${MAX_INSTRUCTIONS_LENGTH} characters`,
			],
		};
	}

	// Check for empty instructions
	if (instructions.trim().length === 0) {
		return {
			valid: false,
			sanitized: "",
			warnings: ["Instructions cannot be empty"],
		};
	}

	// Check for prompt injection override patterns (case-insensitive)
	const lowerInstructions = instructions.toLowerCase();
	for (const pattern of INJECTION_PATTERNS) {
		if (lowerInstructions.includes(pattern)) {
			warnings.push(`Blocked pattern detected: "${pattern}"`);
		}
	}

	// Reject if critical injection patterns found
	if (warnings.length > 0) {
		return {
			valid: false,
			sanitized: instructions,
			warnings,
		};
	}

	// Check for suspicious encoded content
	// Base64 blocks longer than 100 characters
	const base64Regex = /[A-Za-z0-9+/=]{100,}/;
	if (base64Regex.test(instructions)) {
		warnings.push("Suspicious encoded content detected (long Base64 block)");
	}

	// Excessive unicode escape sequences (\uXXXX)
	const unicodeEscapes = instructions.match(/\\u[0-9a-fA-F]{4}/g);
	if (unicodeEscapes && unicodeEscapes.length > 10) {
		warnings.push(
			`Excessive unicode escape sequences (${unicodeEscapes.length} found)`,
		);
	}

	if (warnings.length > 0) {
		return {
			valid: false,
			sanitized: instructions,
			warnings,
		};
	}

	return {
		valid: true,
		sanitized: instructions,
		warnings: [],
	};
}
