/**
 * Shared helper utilities for AI tools.
 *
 * Provides workspace resolution, timeout wrappers, and content
 * truncation used across both read and write tool sets.
 */
import { internal } from "../../_generated/api";
import type { Id } from "../../_generated/dataModel";
import type { ToolContext } from "./types";

// ── Constants ─────────────────────────────────────────────────────────────

export const TOOL_TIMEOUT_MS = 30_000; // 30 seconds per tool operation
const WORKSPACE_RESOLVE_TIMEOUT_MS = 10_000; // 10 seconds for workspace lookup
export const MAX_CONTENT_LENGTH = 4000;

// ── Timeout wrapper ───────────────────────────────────────────────────────

/**
 * Race a promise against a timeout. Throws a clear error on timeout.
 */
export function withTimeout<T>(
	promise: Promise<T>,
	ms: number,
	label: string,
): Promise<T> {
	return Promise.race([
		promise,
		new Promise<never>((_, reject) =>
			setTimeout(
				() =>
					reject(
						new Error(
							`Tool timeout: "${label}" did not complete within ${Math.round(ms / 1000)}s. The workspace operation may be overloaded — please try again.`,
						),
					),
				ms,
			),
		),
	]);
}

// ── Workspace resolution ──────────────────────────────────────────────────

/**
 * Resolve the workspaceId from the current thread context.
 * Tools call this to scope queries to the correct workspace.
 */
export async function resolveWorkspaceId(
	ctx: ToolContext,
): Promise<Id<"workspaces">> {
	if (!ctx.threadId) {
		throw new Error("No thread context available — cannot resolve workspace.");
	}
	try {
		const workspaceId = await withTimeout(
			ctx.runQuery(internal.ai.chatQueries.getWorkspaceForThread, {
				threadId: ctx.threadId,
			}),
			WORKSPACE_RESOLVE_TIMEOUT_MS,
			"resolveWorkspaceId",
		);
		if (!workspaceId) {
			throw new Error(
				"Could not resolve workspace for this thread. The thread may not be associated with a workspace.",
			);
		}
		return workspaceId;
	} catch (error) {
		if (error instanceof Error && error.message.includes("Tool timeout")) {
			throw error; // Re-throw timeout errors as-is
		}
		throw new Error(
			`Failed to resolve workspace: ${error instanceof Error ? error.message : "unknown error"}. Please try again.`,
		);
	}
}

// ── Content truncation ────────────────────────────────────────────────────

/**
 * Truncate text at a natural boundary (paragraph, sentence, or word).
 * Avoids cutting in the middle of words or sentences.
 */
export function truncateAtBoundary(text: string, maxLength: number): string {
	if (text.length <= maxLength) return text;

	const slice = text.slice(0, maxLength);

	// Try to break at a paragraph boundary (double newline)
	const lastParagraph = slice.lastIndexOf("\n\n");
	if (lastParagraph > maxLength * 0.6) {
		return slice.slice(0, lastParagraph);
	}

	// Try to break at a single newline
	const lastNewline = slice.lastIndexOf("\n");
	if (lastNewline > maxLength * 0.6) {
		return slice.slice(0, lastNewline);
	}

	// Try to break at a sentence boundary (. ! ?)
	const lastSentence = Math.max(
		slice.lastIndexOf(". "),
		slice.lastIndexOf("! "),
		slice.lastIndexOf("? "),
	);
	if (lastSentence > maxLength * 0.6) {
		return slice.slice(0, lastSentence + 1);
	}

	// Fall back to word boundary
	const lastSpace = slice.lastIndexOf(" ");
	if (lastSpace > maxLength * 0.6) {
		return slice.slice(0, lastSpace);
	}

	// Last resort: hard cut
	return slice;
}

// ── Plate/ProseMirror JSON → plain text ──────────────────────────────────

interface PlateNode {
	type?: string;
	text?: string;
	content?: PlateNode[];
	children?: PlateNode[];
}

/**
 * Convert Plate/ProseMirror JSON content to plain text.
 * Recursively walks the document AST and concatenates text nodes,
 * preserving paragraph breaks. Returns empty string for invalid input.
 */
export function plateJsonToPlainText(json: string | undefined): string {
	if (!json) return "";

	let doc: PlateNode;
	try {
		doc = JSON.parse(json) as PlateNode;
	} catch {
		// Not valid JSON — return as-is (might be plain text)
		return json;
	}

	const parts: string[] = [];

	function walk(node: PlateNode): void {
		// Text leaf node
		if (node.text !== undefined) {
			parts.push(node.text);
			return;
		}

		// Handle hardBreak as newline
		if (node.type === "hardBreak" || node.type === "hard_break") {
			parts.push("\n");
			return;
		}

		// Recurse into children (Plate uses `children`, ProseMirror uses `content`)
		const children = node.children ?? node.content;
		if (Array.isArray(children)) {
			for (const child of children) {
				walk(child);
			}
		}

		// Add paragraph break after block-level nodes
		if (
			node.type === "paragraph" ||
			node.type === "p" ||
			node.type === "heading" ||
			node.type === "h1" ||
			node.type === "h2" ||
			node.type === "h3" ||
			node.type === "h4" ||
			node.type === "h5" ||
			node.type === "h6" ||
			node.type === "blockquote" ||
			node.type === "code_block" ||
			node.type === "list_item" ||
			node.type === "li"
		) {
			parts.push("\n");
		}
	}

	walk(doc);

	// Clean up: collapse multiple newlines and trim
	return parts
		.join("")
		.replace(/\n{3,}/g, "\n\n")
		.trim();
}

// ── Name resolution helpers ──────────────────────────────────────────────

/**
 * Resolve the userId from the tool context.
 * Tools running from external contexts (Google Chat webhook) have
 * ctx.userId set by the agent framework.
 */
export function resolveToolUserId(ctx: ToolContext): Id<"users"> {
	if (!ctx.userId) {
		throw new Error("No user context available — cannot resolve userId.");
	}
	return ctx.userId as Id<"users">;
}

/**
 * Build a userId → name lookup map for all members in the workspace.
 * Uses internal query to bypass auth for external contexts.
 */
export async function buildUserNameMap(
	ctx: ToolContext,
	workspaceId: Id<"workspaces">,
): Promise<Map<string, string>> {
	const members = await ctx.runQuery(internal.ai.toolQueries.listMembers, {
		workspaceId,
	});
	const map = new Map<string, string>();
	for (const m of members) {
		if (m.user?.name) map.set(m.userId, m.user.name);
	}
	return map;
}

/**
 * Build a projectId → name lookup map for all accessible projects.
 * Uses internal query to bypass auth for external contexts.
 */
export async function buildProjectNameMap(
	ctx: ToolContext,
	workspaceId: Id<"workspaces">,
): Promise<Map<string, string>> {
	const userId = resolveToolUserId(ctx);
	const projects = await ctx.runQuery(internal.ai.toolQueries.listProjects, {
		workspaceId,
		userId,
	});
	const map = new Map<string, string>();
	for (const p of projects) {
		map.set(p._id, p.name);
	}
	return map;
}
