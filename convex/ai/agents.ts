import { Agent } from "@convex-dev/agent";
import type { ModelMessage } from "ai";
import { stepCountIs } from "ai";
import { components } from "../_generated/api";
import { chatModel, embeddingModel } from "./providers";
import { subAgentTools } from "./subAgentTool";
import { allTools } from "./tools";

// Enable verbose AI SDK/agent tracing by setting this env var to true.
const ENABLE_AGENT_TRACE = process.env.AI_CHAT_DEBUG_TIMING === "true";

function clipText(input: string, maxChars: number): string {
	return input.length <= maxChars
		? input
		: `${input.slice(0, maxChars - 3)}...`;
}

// ── Context trimming ──────────────────────────────────────────────────────

/** Max characters for an assistant message before truncation in older context. */
const TRIM_THRESHOLD_CHARS = 1500;
/** Number of most-recent messages to keep untouched. */
const PROTECTED_RECENT_COUNT = 4;

/**
 * Sanitize historical messages for the Azure Responses API.
 *
 * The Responses API pairs reasoning items with message/function_call items
 * by ID. When the agent library stores messages with these IDs, follow-up
 * requests that include history will fail if reasoning items are missing.
 *
 * Fix: convert assistant messages that contained reasoning or tool calls
 * into plain text summaries. This avoids sending any item IDs that the
 * API would try to pair with missing reasoning items. Tool call/result
 * pairs in history are collapsed into text descriptions.
 */
function sanitizeForResponsesApi(messages: ModelMessage[]): ModelMessage[] {
	const result: ModelMessage[] = [];

	for (let i = 0; i < messages.length; i++) {
		const msg = messages[i];

		// Strip providerMetadata from all messages
		const base = { ...msg, providerMetadata: undefined };

		if (msg.role === "assistant" && Array.isArray(msg.content)) {
			const hasReasoning = msg.content.some((p) => p.type === "reasoning");
			const hasToolCalls = msg.content.some((p) => p.type === "tool-call");

			if (hasReasoning || hasToolCalls) {
				// Extract text parts and summarize tool calls as plain text
				const textParts: string[] = [];

				for (const part of msg.content) {
					if (
						part.type === "text" &&
						typeof part.text === "string" &&
						part.text.trim()
					) {
						textParts.push(part.text.trim());
					} else if (part.type === "tool-call") {
						// biome-ignore lint/suspicious/noExplicitAny: tool-call content shape is provider-specific
						const tc = part as any;
						textParts.push(`[Used tool: ${tc.toolName ?? "unknown"}]`);
					}
					// Skip reasoning parts entirely
				}

				const summaryText =
					textParts.length > 0
						? textParts.join("\n")
						: "[assistant processed request]";

				result.push({
					role: "assistant",
					content: summaryText,
				} as ModelMessage);

				// Skip any immediately following tool-result messages
				// since the tool calls are now summarized as text
				while (i + 1 < messages.length && messages[i + 1].role === "tool") {
					i++;
				}
				continue;
			}

			// No reasoning or tool calls — keep text parts only, strip metadata
			const textOnly = msg.content
				.filter((p) => p.type === "text")
				.map((p) => {
					const {
						// provider-specific metadata fields are dropped to avoid Responses API item-ID coupling
						providerMetadata: _pm,
						experimental_providerMetadata: _epm,
						...rest
					} = p as unknown as {
						providerMetadata?: unknown;
						experimental_providerMetadata?: unknown;
						[key: string]: unknown;
					};
					return rest;
				});

			result.push({
				...base,
				content:
					textOnly.length > 0
						? textOnly
						: [{ type: "text" as const, text: "[response]" }],
			} as unknown as ModelMessage);
			continue;
		}

		// Skip standalone tool-result messages (already handled above)
		if (msg.role === "tool") {
			result.push(base as ModelMessage);
			continue;
		}

		result.push(base as ModelMessage);
	}

	return result;
}

/**
 * Truncate long assistant messages in older conversation history.
 * Keeps the last `PROTECTED_RECENT_COUNT` messages intact and trims
 * older assistant messages that exceed `TRIM_THRESHOLD_CHARS`.
 */
function trimOlderMessages(messages: ModelMessage[]): ModelMessage[] {
	if (messages.length <= PROTECTED_RECENT_COUNT) return messages;

	const cutoff = messages.length - PROTECTED_RECENT_COUNT;
	return messages.map((msg, i) => {
		if (i >= cutoff) return msg;
		if (msg.role !== "assistant") return msg;
		if (typeof msg.content !== "string") return msg;
		if (msg.content.length <= TRIM_THRESHOLD_CHARS) return msg;

		return {
			...msg,
			content: `${msg.content.slice(0, TRIM_THRESHOLD_CHARS)}… [trimmed]`,
		};
	});
}

// ── System Prompt ─────────────────────────────────────────────────────────
const CLAVE_SYSTEM_PROMPT = `You are Clave AI, a helpful workspace assistant embedded in a collaborative project management platform. You help teams manage issues, plan projects, write documents, and stay organized. Be concise, direct, and practical.

## Tool usage
- For questions about project data, issues, or documents, use the search tools. For general knowledge, answer directly.
- Use globalSearch for broad workspace searches spanning multiple entity types.
- Use searchProjectKnowledge for deep project-scoped searches (semantic + keyword).
- Use searchCode only when the user asks about code in a connected GitHub repo.
- Prefer the fewest tool calls needed — batch related lookups when possible.

## Markdown artifacts
- Always emit valid markdown with balanced code fences.
- For code samples, use triple-backtick fences with an explicit language tag and a closing fence.
- For Mermaid diagrams, use a single \`\`\`mermaid fenced block, start with a valid diagram declaration (e.g. flowchart/graph/sequenceDiagram/classDiagram), and keep all Mermaid syntax inside that fence.
- For markdown tables, include a header row, separator row, and consistent column counts.
`;

// ── Default Clave AI Agent ────────────────────────────────────────────────
// The primary agent used for all chat interactions.
// Lazy-initialized to avoid top-level env var reads during Convex module analysis.

// biome-ignore lint/suspicious/noExplicitAny: Agent generic types are complex
let _claveAgent: any = null;

export function getClaveAgent() {
	if (!_claveAgent) {
		_claveAgent = new Agent(components.agent, {
			name: "Clave AI",
			languageModel: chatModel(),
			embeddingModel: embeddingModel(),
			instructions: CLAVE_SYSTEM_PROMPT,
			tools: { ...allTools, ...subAgentTools },
			rawRequestResponseHandler: async (_ctx, { request, response }) => {
				if (!ENABLE_AGENT_TRACE) return;

				console.info(
					"[claveAgent:rawRequestResponse]",
					clipText(JSON.stringify(request), 600),
					clipText(JSON.stringify(response), 1200),
				);
			},
			contextHandler: async (_ctx, args) => {
				const {
					search,
					recent,
					inputMessages,
					inputPrompt,
					existingResponses,
				} = args;

				const trimmedRecent = trimOlderMessages(recent);

				// Sanitize historical messages to strip reasoning parts and
				// provider-specific item IDs that break the Responses API.
				const sanitizedRecent = sanitizeForResponsesApi(trimmedRecent);

				const context = [
					...search,
					...sanitizedRecent,
					...inputMessages,
					...inputPrompt,
					...existingResponses,
				];

				if (ENABLE_AGENT_TRACE) {
					console.info(
						"[claveAgent:context]",
						JSON.stringify({
							searchCount: search.length,
							recentCount: recent.length,
							trimmedCount: trimmedRecent.filter(
								(m, i) =>
									i < recent.length - PROTECTED_RECENT_COUNT &&
									m.role === "assistant" &&
									typeof m.content === "string" &&
									m.content.endsWith("… [trimmed]"),
							).length,
							inputCount: inputMessages.length,
							promptCount: inputPrompt.length,
							existingCount: existingResponses.length,
							totalMessages: context.length,
						}),
					);
				}

				return context;
			},
			usageHandler: async (_ctx, args) => {
				const { userId, threadId, agentName, model, provider, usage } = args;
				const normalizedModel = String(model ?? "").toLowerCase();
				const normalizedProvider = String(provider ?? "").toLowerCase();
				const usageType =
					normalizedModel.includes("embedding") ||
					normalizedProvider.includes("embedding")
						? "embedding"
						: "generation";
				const logLabel =
					usageType === "embedding"
						? "[chat-tokens:embedding]"
						: "[chat-tokens:generation]";
				console.info(
					logLabel,
					JSON.stringify({
						userId,
						threadId,
						agentName,
						model,
						provider,
						usageType,
						inputTokens: usage.inputTokens,
						outputTokens: usage.outputTokens,
						totalTokens: (usage.inputTokens ?? 0) + (usage.outputTokens ?? 0),
					}),
				);
			},
			stopWhen: stepCountIs(15),
			callSettings: {
				maxRetries: 1,
			},
		});
	}
	return _claveAgent;
}

// Export for testing
export { trimOlderMessages, TRIM_THRESHOLD_CHARS, PROTECTED_RECENT_COUNT };
