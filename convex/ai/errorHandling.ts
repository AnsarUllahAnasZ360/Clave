/**
 * Centralized error handling for the sub-agent and workflow system.
 *
 * Provides custom error types with severity classification, user-friendly
 * message formatting, and error classification for UI-driven retry logic.
 *
 * @see STORY-023 for design context
 */

// ── Error Types ───────────────────────────────────────────────────────────

export type ErrorSeverity = "recoverable" | "fatal";

export class SubAgentError extends Error {
	readonly severity: ErrorSeverity;
	readonly retryAfterMs?: number;

	constructor(message: string, severity: ErrorSeverity, retryAfterMs?: number) {
		super(message);
		this.name = "SubAgentError";
		this.severity = severity;
		this.retryAfterMs = retryAfterMs;
	}
}

export class WorkflowTimeoutError extends Error {
	readonly workflowRunId: string;
	readonly durationMs: number;

	constructor(workflowRunId: string, durationMs: number) {
		super(
			`Workflow ${workflowRunId} timed out after ${Math.round(durationMs / 60000)} minutes`,
		);
		this.name = "WorkflowTimeoutError";
		this.workflowRunId = workflowRunId;
		this.durationMs = durationMs;
	}
}

export class RateLimitError extends Error {
	readonly retryAfterMs: number;

	constructor(message: string, retryAfterMs: number) {
		super(message);
		this.name = "RateLimitError";
		this.retryAfterMs = retryAfterMs;
	}
}

export class ConfigValidationError extends Error {
	readonly warnings: string[];

	constructor(message: string, warnings: string[] = []) {
		super(message);
		this.name = "ConfigValidationError";
		this.warnings = warnings;
	}
}

// ── Error Classification ──────────────────────────────────────────────────

export interface ClassifiedError {
	severity: ErrorSeverity;
	userMessage: string;
	retryable: boolean;
	retryAfterMs?: number;
}

/**
 * Classify an unknown error into a structured error with severity,
 * user-friendly message, and retryability.
 */
export function classifyError(error: unknown): ClassifiedError {
	if (error instanceof RateLimitError) {
		return {
			severity: "recoverable",
			userMessage: `Rate limited. Please try again in ${Math.ceil(error.retryAfterMs / 1000)} seconds.`,
			retryable: true,
			retryAfterMs: error.retryAfterMs,
		};
	}

	if (error instanceof WorkflowTimeoutError) {
		return {
			severity: "fatal",
			userMessage:
				"This task took too long and was automatically cancelled. Try breaking it into smaller steps.",
			retryable: false,
		};
	}

	if (error instanceof ConfigValidationError) {
		return {
			severity: "fatal",
			userMessage: error.message,
			retryable: false,
		};
	}

	if (error instanceof SubAgentError) {
		return {
			severity: error.severity,
			userMessage: error.message,
			retryable: error.severity === "recoverable",
			retryAfterMs: error.retryAfterMs,
		};
	}

	// Classify unknown errors by message patterns
	const message = error instanceof Error ? error.message : String(error);
	return classifyByMessage(message);
}

/**
 * Classify an error by its message string, detecting common LLM API error patterns.
 */
function classifyByMessage(message: string): ClassifiedError {
	const lower = message.toLowerCase();

	// Rate limit errors (429)
	if (
		lower.includes("429") ||
		lower.includes("rate_limit") ||
		lower.includes("rate limit") ||
		lower.includes("too many requests")
	) {
		return {
			severity: "recoverable",
			userMessage: "The AI service is busy. Please try again in a moment.",
			retryable: true,
			retryAfterMs: 30_000,
		};
	}

	// Context window / token limit errors
	if (
		lower.includes("context") &&
		(lower.includes("length") ||
			lower.includes("window") ||
			lower.includes("exceeded"))
	) {
		return {
			severity: "fatal",
			userMessage:
				"Your message is too long for the AI to process. Please shorten your prompt.",
			retryable: false,
		};
	}
	if (lower.includes("max_tokens") || lower.includes("maximum context")) {
		return {
			severity: "fatal",
			userMessage:
				"Your message is too long for the AI to process. Please shorten your prompt.",
			retryable: false,
		};
	}

	// Network / connection errors
	if (
		lower.includes("econnrefused") ||
		lower.includes("econnreset") ||
		lower.includes("etimedout") ||
		lower.includes("network") ||
		lower.includes("fetch failed")
	) {
		return {
			severity: "recoverable",
			userMessage: "Connection error. Please check your network and try again.",
			retryable: true,
			retryAfterMs: 5_000,
		};
	}

	// Timeout errors
	if (lower.includes("timeout") || lower.includes("timed out")) {
		return {
			severity: "recoverable",
			userMessage: "The request timed out. Please try again.",
			retryable: true,
			retryAfterMs: 5_000,
		};
	}

	// Authentication / authorization errors
	if (
		lower.includes("unauthorized") ||
		lower.includes("401") ||
		lower.includes("403") ||
		lower.includes("forbidden")
	) {
		return {
			severity: "fatal",
			userMessage:
				"Authentication error. Please sign in again or contact your admin.",
			retryable: false,
		};
	}

	// Default: unknown error
	return {
		severity: "fatal",
		userMessage: "Something went wrong. Please try again or contact support.",
		retryable: false,
	};
}

// ── User-Friendly Formatting ──────────────────────────────────────────────

/**
 * Convert any error into a user-friendly message string.
 * Strips technical details, stack traces, and internal identifiers.
 */
export function formatUserError(error: unknown): string {
	return classifyError(error).userMessage;
}
