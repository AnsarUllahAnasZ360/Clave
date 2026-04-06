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
- For markdown tables, include a header row, separator row, and consistent column counts.

## Diagrams, flowcharts, wireframes, and visual content
- When the user asks for a diagram, flowchart, wireframe, or architecture diagram, ALWAYS create it on a whiteboard — never render it as Mermaid in chat.
- Workflow:
  1. Call the MCP tool \`read_me\` to learn the Excalidraw element format (colors, shapes, arrows, bindings). If read_me is unavailable, use the rules below.
  2. Find or create a board: use \`listWhiteboards\` to find an existing board, or \`createWhiteboard\` to create a new one.
  3. Generate the Excalidraw elements JSON array yourself.
  4. Call \`addElementsToWhiteboard\` with the board ID and the elements JSON string to persist them.
- If you are already on a board page (whiteboard ID in context), skip step 2 and use that board ID.
- Only use Mermaid (\`\`\`mermaid code blocks) when the user explicitly asks for inline/text diagrams, or when generating content inside a document.
- For board CRUD: use createWhiteboard, updateWhiteboard, listWhiteboards, getWhiteboard as needed.

### Excalidraw element format rules
When generating elements JSON for addElementsToWhiteboard:
- Return a JSON array of element objects. Valid types: rectangle, ellipse, diamond, text, arrow, line.
- Required fields per element: \`type\`, \`id\` (unique string), \`x\`, \`y\`, \`width\`, \`height\`.
- Every shape MUST have a \`label\` with \`text\` and \`fontSize\` (min 16 for body, 20 for titles). Unlabeled shapes are useless.
- Use \`backgroundColor\` + \`fillStyle: "solid"\` for colored shapes. Use \`roundness: { type: 3 }\` for rounded rectangles.
- Arrows: use \`points: [[0,0],[dx,dy]]\`, \`endArrowhead: "arrow"\`, \`startBinding: { elementId: "id", fixedPoint: [x,y] }\`, \`endBinding: { elementId: "id", fixedPoint: [x,y] }\`. fixedPoint: top=[0.5,0], bottom=[0.5,1], left=[0,0.5], right=[1,0.5].
- Arrow labels for decisions: \`label: { text: "Yes" }\`.

### Flowchart rules
- Use ellipses for Start/End (green \`#b2f2bb\`), rectangles for process steps (blue \`#a5d8ff\`), diamonds for decisions (yellow \`#fff3bf\`), red \`#ffc9c9\` for errors.
- Flow top-to-bottom. Space nodes 200px vertically, 300px horizontally for branches.
- Decision diamonds MUST have labeled arrows: "Yes"/"No".
- Every single node must be labeled with clear, descriptive text.

### Wireframe rules
- Use a page frame rectangle (900-1200 x 700-900, background \`#f5f5f5\`).
- Header bar at top (full width x 60-80, dark \`#1e1e1e\`). Sidebar (220-260 wide, \`#e8e8e8\`). Content area for cards/forms.
- Cards: 280-350 x 180-220, white \`#ffffff\`. Buttons: 120-160 x 44, blue \`#a5d8ff\`. Input fields: 300-400 x 44.
- Use realistic labels: "Dashboard", "Search...", "Create New", not "Label 1".

### Architecture diagram rules
- Layered: UI top, API/Logic middle, Data bottom. Zone rectangles for layers (500-800 x 200-300, opacity: 30).
- Services: 180-250 x 80-100. Databases (ellipse): 140 x 100. Use labeled arrows for data flow ("REST API", "SQL", etc.).
- Colors: Frontend zone \`#dbe4ff\`, Logic zone \`#e5dbff\`, Data zone \`#d3f9d8\`. Services \`#a5d8ff\`, DBs \`#c3fae8\`, External \`#ffd8a8\`.

## Project association
- Do NOT assign a projectId to boards or documents unless the user explicitly asks to link it to a specific project.
- projectId is optional — leave it out by default.

## Document creation
- When creating documents with the createDocument tool, always use proper markdown formatting in the content field.
- Use # headings for structure, **bold** and *italic* for emphasis, - bullet lists and 1. numbered lists for enumerations.
- For tables, always use proper markdown table syntax with | pipes |, a header row, and a |---|---| separator row. Never use plain text or tab-separated columns.
- Use \`\`\` fenced code blocks for code snippets and > for blockquotes.
- The document editor converts markdown to rich text automatically — raw markdown will render as formatted content.
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
