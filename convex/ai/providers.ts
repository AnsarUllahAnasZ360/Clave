/**
 * Azure OpenAI Provider Configuration
 *
 * Required env vars (set via `npx convex env set`):
 *   AZURE_RESOURCE_NAME          — Azure resource name
 *   AZURE_API_KEY                — Azure API key
 *   AZURE_CHAT_MODEL_KIMI_25     — Kimi K2.5 deployment name
 *   AZURE_CHAT_MODEL_GPT_5_2     — GPT 5.2 deployment name
 *   AZURE_EMBEDDING_DEPLOYMENT   — Embedding deployment (default: "text-embedding-3-large")
 *
 * Optional env vars:
 *   AZURE_BASE_URL               — Override provider base URL
 *   AZURE_CHAT_API_VERSION       — Override Azure chat API version
 *   AZURE_CHAT_MODEL_KIMI_25_API — "chat" | "responses" (default: "chat")
 *   AZURE_CHAT_MODEL_GPT_5_2_API — "chat" | "responses" (default: "chat")
 *
 * NOTE: This module uses process.env (Node.js only). Import it ONLY from
 * "use node" action files (chat.ts, titling.ts) or modules consumed by them.
 * For model-ID utilities safe in all runtimes, import from ./modelIds.ts.
 */
import { createAzure } from "@ai-sdk/azure";
import {
	type CallWarning,
	extractReasoningMiddleware,
	type LanguageModelMiddleware,
	wrapLanguageModel,
} from "ai";
import {
	type ChatModelId,
	DEFAULT_CHAT_MODEL_ID,
	normalizeChatModelId,
} from "./modelIds";

// Re-export model-ID utilities so existing action-context imports keep working
export {
	CHAT_MODEL_IDS as SUPPORTED_CHAT_MODEL_IDS,
	type ChatModelId,
	isSupportedChatModelId,
	normalizeChatModelId,
} from "./modelIds";

// ── Env var validation ───────────────────────────────────────────────────

function requireEnv(name: string): string {
	const value = process.env[name];
	if (!value) {
		throw new Error(
			`[providers] Missing required environment variable: ${name}. ` +
				`Set it with: npx convex env set ${name} <value>`,
		);
	}
	return value;
}

// ── Kimi chat reasoning compatibility ─────────────────────────────────────
//
// Kimi's chat-completions API can stream reasoning in `reasoning_content`
// instead of `content`. The OpenAI chat schema used by @ai-sdk/azure does not
// include that field, so we rewrite it into XML-tagged text and extract it as
// structured reasoning via `extractReasoningMiddleware`.

const THINK_OPEN_TAG = "<think>";
const THINK_CLOSE_TAG = "</think>";

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
	return value !== null && typeof value === "object";
}

function getRequestUrl(input: Parameters<typeof fetch>[0]): string {
	if (typeof input === "string") return input;
	if (input instanceof URL) return input.toString();
	return input.url;
}

function parseRequestBody(
	init: RequestInit | undefined,
): JsonRecord | undefined {
	const body = init?.body;
	if (!body) return undefined;
	try {
		if (typeof body === "string") {
			const parsed = JSON.parse(body) as unknown;
			return isRecord(parsed) ? parsed : undefined;
		}
		if (body instanceof ArrayBuffer || body instanceof Uint8Array) {
			const text = new TextDecoder().decode(body);
			const parsed = JSON.parse(text) as unknown;
			return isRecord(parsed) ? parsed : undefined;
		}
	} catch {
		// Ignore parse failures and pass through untouched.
	}
	return undefined;
}

function transformKimiChatResponseJson(
	payload: JsonRecord,
): JsonRecord | undefined {
	const choices = payload.choices;
	if (!Array.isArray(choices)) return undefined;

	for (const choice of choices) {
		if (!isRecord(choice)) continue;
		const message = isRecord(choice.message) ? choice.message : undefined;
		if (!message) continue;

		const reasoning =
			typeof message.reasoning_content === "string"
				? message.reasoning_content
				: undefined;
		if (!reasoning) continue;

		const content = typeof message.content === "string" ? message.content : "";
		message.content = `${THINK_OPEN_TAG}${reasoning}${THINK_CLOSE_TAG}${content ? `\n\n${content}` : ""}`;
		delete message.reasoning_content;
	}

	return payload;
}

type StreamingReasoningState = {
	isReasoningOpen: boolean;
};

function transformKimiChatStreamChunk(
	payload: JsonRecord,
	state: StreamingReasoningState,
): JsonRecord | undefined {
	const choices = payload.choices;
	if (!Array.isArray(choices)) return undefined;

	for (const choice of choices) {
		if (!isRecord(choice)) continue;
		const delta = isRecord(choice.delta) ? choice.delta : undefined;
		if (!delta) continue;

		const reasoningDelta =
			typeof delta.reasoning_content === "string"
				? delta.reasoning_content
				: "";
		const textDelta = typeof delta.content === "string" ? delta.content : "";

		if (reasoningDelta && textDelta) {
			const open = state.isReasoningOpen ? "" : THINK_OPEN_TAG;
			delta.content = `${open}${reasoningDelta}${THINK_CLOSE_TAG}\n\n${textDelta}`;
			state.isReasoningOpen = false;
		} else if (reasoningDelta) {
			const open = state.isReasoningOpen ? "" : THINK_OPEN_TAG;
			delta.content = `${open}${reasoningDelta}`;
			state.isReasoningOpen = true;
		} else if (textDelta && state.isReasoningOpen) {
			delta.content = `${THINK_CLOSE_TAG}\n\n${textDelta}`;
			state.isReasoningOpen = false;
		} else if (
			state.isReasoningOpen &&
			typeof choice.finish_reason === "string" &&
			choice.finish_reason.length > 0
		) {
			delta.content = THINK_CLOSE_TAG;
			state.isReasoningOpen = false;
		}

		if ("reasoning_content" in delta) {
			delete delta.reasoning_content;
		}
	}

	return payload;
}

function createKimiReasoningAwareFetch(
	baseFetch: typeof fetch,
	kimiDeployment: string | null,
): typeof fetch {
	if (!kimiDeployment) return baseFetch;

	return async (input, init) => {
		const requestUrl = getRequestUrl(input);
		if (!requestUrl.includes("/chat/completions")) {
			return baseFetch(input, init);
		}

		const requestBody = parseRequestBody(init);
		const requestModel =
			requestBody && typeof requestBody.model === "string"
				? requestBody.model
				: undefined;
		if (requestModel !== kimiDeployment) {
			return baseFetch(input, init);
		}

		const response = await baseFetch(input, init);
		if (!response.ok) return response;

		const contentType = response.headers.get("content-type") ?? "";
		const isStreaming = requestBody?.stream === true;

		if (
			isStreaming &&
			response.body &&
			contentType.includes("text/event-stream")
		) {
			const headers = new Headers(response.headers);
			headers.delete("content-length");
			const state: StreamingReasoningState = { isReasoningOpen: false };
			const encoder = new TextEncoder();
			const decoder = new TextDecoder();

			let buffer = "";
			const sseTransform = new TransformStream<Uint8Array, Uint8Array>({
				transform(chunk, controller) {
					buffer += decoder.decode(chunk, { stream: true });
					let newlineIndex = buffer.indexOf("\n");
					while (newlineIndex !== -1) {
						const rawLine = buffer.slice(0, newlineIndex);
						buffer = buffer.slice(newlineIndex + 1);
						const line = rawLine.replace(/\r$/, "");

						if (!line.startsWith("data:")) {
							controller.enqueue(encoder.encode(`${line}\n`));
							newlineIndex = buffer.indexOf("\n");
							continue;
						}

						const rawPayload = line.slice(5).trimStart();
						if (!rawPayload || rawPayload === "[DONE]") {
							controller.enqueue(encoder.encode(`${line}\n`));
							newlineIndex = buffer.indexOf("\n");
							continue;
						}

						try {
							const parsed = JSON.parse(rawPayload) as unknown;
							if (!isRecord(parsed)) {
								controller.enqueue(encoder.encode(`${line}\n`));
							} else {
								const transformed = transformKimiChatStreamChunk(parsed, state);
								controller.enqueue(
									encoder.encode(
										`data: ${JSON.stringify(transformed ?? parsed)}\n`,
									),
								);
							}
						} catch {
							controller.enqueue(encoder.encode(`${line}\n`));
						}

						newlineIndex = buffer.indexOf("\n");
					}
				},
				flush(controller) {
					buffer += decoder.decode();
					if (!buffer) return;
					const line = buffer.replace(/\r$/, "");
					if (!line.startsWith("data:")) {
						controller.enqueue(encoder.encode(line));
						return;
					}

					const rawPayload = line.slice(5).trimStart();
					if (!rawPayload || rawPayload === "[DONE]") {
						controller.enqueue(encoder.encode(line));
						return;
					}

					try {
						const parsed = JSON.parse(rawPayload) as unknown;
						if (!isRecord(parsed)) {
							controller.enqueue(encoder.encode(line));
							return;
						}
						const transformed = transformKimiChatStreamChunk(parsed, state);
						controller.enqueue(
							encoder.encode(`data: ${JSON.stringify(transformed ?? parsed)}`),
						);
					} catch {
						controller.enqueue(encoder.encode(line));
					}
				},
			});

			return new Response(response.body.pipeThrough(sseTransform), {
				status: response.status,
				statusText: response.statusText,
				headers,
			});
		}

		if (!contentType.includes("application/json")) {
			return response;
		}

		try {
			const parsed = (await response.clone().json()) as unknown;
			if (!isRecord(parsed)) return response;
			const transformed = transformKimiChatResponseJson(parsed);
			if (!transformed) return response;
			const headers = new Headers(response.headers);
			headers.delete("content-length");
			return new Response(JSON.stringify(transformed), {
				status: response.status,
				statusText: response.statusText,
				headers,
			});
		} catch {
			return response;
		}
	};
}

// ── Azure provider (lazy — created on first use to avoid top-level env checks) ─

let _azure: ReturnType<typeof createAzure> | null = null;

function getAzure() {
	if (!_azure) {
		_azure = createAzure({
			...(process.env.AZURE_BASE_URL
				? { baseURL: process.env.AZURE_BASE_URL }
				: { resourceName: requireEnv("AZURE_RESOURCE_NAME") }),
			apiKey: requireEnv("AZURE_API_KEY"),
			fetch: createKimiReasoningAwareFetch(
				(input, init) => fetch(input, init),
				process.env.AZURE_CHAT_MODEL_KIMI_25 ?? null,
			),
			...(process.env.AZURE_CHAT_API_VERSION
				? { apiVersion: process.env.AZURE_CHAT_API_VERSION }
				: {}),
		});
	}
	return _azure;
}

// ── Deployment name mapping (env → Azure deployment IDs) ─────────────────

/** Env var names for each model's deployment */
const DEPLOYMENT_ENV_VARS: Record<ChatModelId, string[]> = {
	"kimi-k2.5": ["AZURE_CHAT_MODEL_KIMI_25"],
	"gpt-5.2": ["AZURE_CHAT_MODEL_GPT_5_2", "AZURE_CHAT_MODEL_GPT_5_0"],
};

type ModelApiVariant = "chat" | "responses";

const MODEL_API_ENV_VARS: Record<ChatModelId, string> = {
	"kimi-k2.5": "AZURE_CHAT_MODEL_KIMI_25_API",
	"gpt-5.2": "AZURE_CHAT_MODEL_GPT_5_2_API",
};

const DEFAULT_MODEL_API_VARIANTS: Record<ChatModelId, ModelApiVariant> = {
	"kimi-k2.5": "chat",
	"gpt-5.2": "responses",
};
const SUPPORTS_TEMPERATURE_BY_MODEL: Record<ChatModelId, boolean> = {
	"kimi-k2.5": true,
	"gpt-5.2": false,
};

function getModelApiVariant(modelId: ChatModelId): ModelApiVariant {
	const override = process.env[MODEL_API_ENV_VARS[modelId]]
		?.trim()
		.toLowerCase();
	if (override === "chat" || override === "responses") {
		return override;
	}
	return DEFAULT_MODEL_API_VARIANTS[modelId];
}

/**
 * Get the Azure deployment name for a model.
 * Returns the deployment name from env vars, or null if not configured.
 */
function getDeploymentName(modelId: ChatModelId): string | null {
	const envVarNames = DEPLOYMENT_ENV_VARS[modelId];
	for (const envVar of envVarNames) {
		const value = process.env[envVar];
		if (value) return value;
	}
	return null;
}

function normalizeWarningType(warning: CallWarning): CallWarning {
	// @convex-dev/agent warning validators can reject v3 warning variants.
	// Coerce unsupported/compatibility warnings into a stable "other" shape.
	if (warning.type === "unsupported") {
		return {
			type: "other",
			message: `${warning.feature} is not supported${warning.details ? `: ${warning.details}` : ""}`,
		};
	}

	if (warning.type === "compatibility") {
		return {
			type: "other",
			message: `${warning.feature} uses compatibility mode${warning.details ? `: ${warning.details}` : ""}`,
		};
	}

	return warning;
}

const normalizeUnsupportedWarningsMiddleware: LanguageModelMiddleware = {
	specificationVersion: "v3",
	wrapGenerate: async ({ doGenerate }) => {
		const result = await doGenerate();
		if (result.warnings.length === 0) return result;
		return {
			...result,
			warnings: result.warnings.map((warning) => normalizeWarningType(warning)),
		};
	},
	wrapStream: async ({ doStream }) => {
		const { stream, ...rest } = await doStream();
		const restWithWarnings = rest as typeof rest & {
			warnings?: CallWarning[];
		};
		const normalizedWarnings = Array.isArray(restWithWarnings.warnings)
			? restWithWarnings.warnings.map((warning: CallWarning) =>
					normalizeWarningType(warning),
				)
			: restWithWarnings.warnings;
		return {
			...restWithWarnings,
			warnings: normalizedWarnings,
			stream: stream.pipeThrough(
				new TransformStream({
					transform(chunk, controller) {
						if ("warnings" in chunk && Array.isArray(chunk.warnings)) {
							controller.enqueue({
								...chunk,
								warnings: chunk.warnings.map((warning) =>
									normalizeWarningType(warning),
								),
							});
							return;
						}
						controller.enqueue(chunk);
					},
				}),
			),
		};
	},
};

// ── Cross-model message sanitization ─────────────────────────────────────
//
// When switching models mid-conversation, the message history may contain
// reasoning parts from a previous model. These are incompatible across API
// types (Responses API vs Chat Completions):
//   - Chat Completions silently drops reasoning parts (no handler)
//   - Responses API rejects reasoning parts without providerOptions.openai.itemId
//
// Rather than trying to convert between formats, we strip ALL reasoning parts
// from older messages in the prompt. The current model will generate its own
// reasoning if it supports it; old reasoning just wastes tokens and breaks
// cross-model requests.

const stripReasoningFromHistoryMiddleware: LanguageModelMiddleware = {
	specificationVersion: "v3",
	transformParams: async ({ params }) => {
		const prompt = params.prompt;
		if (!prompt || prompt.length === 0) return params;

		// Only strip from messages before the last user message (historical context).
		// The very last assistant message (if any) is the current generation target.
		let lastUserIdx = -1;
		for (let i = prompt.length - 1; i >= 0; i--) {
			if (prompt[i].role === "user") {
				lastUserIdx = i;
				break;
			}
		}

		const sanitized = prompt.map((msg, idx) => {
			// Only sanitize assistant messages in history (before the last user message)
			if (msg.role !== "assistant" || idx >= lastUserIdx) return msg;
			if (!Array.isArray(msg.content)) return msg;

			const filtered = msg.content.filter((part) => part.type !== "reasoning");

			// If all content was reasoning, replace with a placeholder text part
			// to avoid sending an empty assistant message
			if (filtered.length === 0) {
				return {
					...msg,
					content: [{ type: "text" as const, text: "[reasoning omitted]" }],
				};
			}

			// Only create a new object if we actually filtered something
			if (filtered.length === msg.content.length) return msg;
			return { ...msg, content: filtered };
		});

		return { ...params, prompt: sanitized };
	},
};

function createLanguageModel(modelId: ChatModelId, deployment: string) {
	const apiVariant = getModelApiVariant(modelId);
	const baseModel =
		apiVariant === "responses"
			? getAzure()(deployment)
			: getAzure().chat(deployment);

	const middlewares: LanguageModelMiddleware[] = [
		normalizeUnsupportedWarningsMiddleware,
		// Strip reasoning parts from history to prevent cross-model API errors
		stripReasoningFromHistoryMiddleware,
	];

	// Kimi chat models emit thinking in `<think>...</think>` after fetch rewrite.
	// Extract it into structured reasoning parts for UI rendering + persistence.
	if (modelId === "kimi-k2.5" && apiVariant === "chat") {
		middlewares.push(
			extractReasoningMiddleware({
				tagName: "think",
			}),
		);
	}

	return wrapLanguageModel({
		model: baseModel,
		middleware: middlewares,
	});
}

// Lazy initialization to avoid top-level env checks during Convex module analysis.
// Preview deployments run module analysis before env vars are available.

let _chatModel: ReturnType<typeof createLanguageModel> | null = null;
let _embeddingModel: ReturnType<
	ReturnType<typeof createAzure>["embeddingModel"]
> | null = null;

/** Default chat model instance (lazy-initialized) */
export function chatModel() {
	if (!_chatModel) {
		const defaultDeployment = getDeploymentName(DEFAULT_CHAT_MODEL_ID);
		if (!defaultDeployment) {
			throw new Error(
				`[providers] Default model "${DEFAULT_CHAT_MODEL_ID}" is not configured. ` +
					`Set env var: npx convex env set ${DEPLOYMENT_ENV_VARS[DEFAULT_CHAT_MODEL_ID][0]} <deployment-name>`,
			);
		}
		_chatModel = createLanguageModel(DEFAULT_CHAT_MODEL_ID, defaultDeployment);
	}
	return _chatModel;
}

/** Embedding model instance (lazy-initialized) */
export function embeddingModel() {
	if (!_embeddingModel) {
		_embeddingModel = getAzure().embeddingModel(
			process.env.AZURE_EMBEDDING_DEPLOYMENT ?? "text-embedding-3-large",
		);
	}
	return _embeddingModel;
}

// ── Model resolution (action-context only) ───────────────────────────────

/** Get a chat model for a specific model ID, or null if not configured */
export const getChatModel = (modelId: ChatModelId) => {
	const deployment = getDeploymentName(modelId);
	if (!deployment) return null;
	return createLanguageModel(modelId, deployment);
};

export type ChatModelResolution = {
	requestedModelId: ChatModelId;
	resolvedModelId: ChatModelId;
	model: NonNullable<ReturnType<typeof getChatModel>>;
	fallbackReason?: string;
};

export const resolveChatModel = (
	deploymentId?: string,
): ChatModelResolution => {
	const requestedModelId = normalizeChatModelId(deploymentId?.trim());

	// Try the requested model first
	const requestedModel = getChatModel(requestedModelId);
	if (requestedModel) {
		return {
			requestedModelId,
			resolvedModelId: requestedModelId,
			model: requestedModel,
		};
	}

	// Requested model not configured — fall back to default
	const defaultModel = getChatModel(DEFAULT_CHAT_MODEL_ID);
	if (!defaultModel) {
		// This shouldn't happen since we validate at startup, but be safe
		throw new Error(
			`[providers] No models are configured. Set deployment env vars.`,
		);
	}

	const envVars = DEPLOYMENT_ENV_VARS[requestedModelId];
	console.warn(
		`[providers] Model "${requestedModelId}" is not configured (missing env: ${envVars.join(" or ")}). Falling back to "${DEFAULT_CHAT_MODEL_ID}".`,
	);

	return {
		requestedModelId,
		resolvedModelId: DEFAULT_CHAT_MODEL_ID,
		model: defaultModel,
		fallbackReason: `${requestedModelId} is not available — using ${DEFAULT_CHAT_MODEL_ID} instead. Ask your admin to configure the ${envVars[0]} environment variable.`,
	};
};

// ── Reasoning configuration per model ─────────────────────────────────────

const REASONING_EFFORT_BY_MODEL: Partial<
	Record<ChatModelId, "low" | "medium" | "high">
> = {
	// Azure GPT-5.2 in our environment only accepts "medium" for responses API.
	"gpt-5.2": "medium",
	"kimi-k2.5": "low",
};

/**
 * Get providerOptions for reasoning if the model supports it.
 * Returns undefined for models that don't support reasoning.
 */
export function getReasoningProviderOptions(
	modelId: ChatModelId,
): Record<string, Record<string, string>> | undefined {
	// Chat Completions deployments can emit unsupported warnings for reasoning
	// options. Only send reasoning options on the Responses API variant.
	if (getModelApiVariant(modelId) !== "responses") return undefined;

	const reasoningEffort = REASONING_EFFORT_BY_MODEL[modelId];
	if (!reasoningEffort) return undefined;
	const providerKey = "azure";

	return {
		[providerKey]: { reasoningEffort },
	};
}

export function usesResponsesApi(modelId: ChatModelId): boolean {
	return getModelApiVariant(modelId) === "responses";
}

export function supportsTemperatureSetting(modelId: ChatModelId): boolean {
	return SUPPORTS_TEMPERATURE_BY_MODEL[modelId];
}
