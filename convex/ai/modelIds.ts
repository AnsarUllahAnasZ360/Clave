/**
 * Model ID definitions — safe to import from queries, mutations, AND actions.
 *
 * This module contains ONLY pure model-ID logic with zero process.env or
 * provider-SDK usage, making it safe for Convex's V8 sandbox runtime.
 *
 * For Azure provider initialization, see ./providers.ts ("use node" only).
 */

export const CHAT_MODEL_IDS = ["kimi-k2.5", "gpt-5.2"] as const;
export type ChatModelId = (typeof CHAT_MODEL_IDS)[number];

export const DEFAULT_CHAT_MODEL_ID: ChatModelId = "kimi-k2.5";

const CHAT_MODEL_ID_SET = new Set<string>(CHAT_MODEL_IDS);

export const isSupportedChatModelId = (id: string): id is ChatModelId =>
	CHAT_MODEL_ID_SET.has(id);

/** Backward-compatible aliases mapping old IDs → canonical IDs */
const MODEL_ALIASES: Record<string, ChatModelId> = {
	"kimmy-2.5": "kimi-k2.5",
	"kimi-2.5": "kimi-k2.5",
	"kimmy k2.5": "kimi-k2.5",
	"kimi k2.5": "kimi-k2.5",
	"codex-5.2": "gpt-5.2",
	"gpt-5.0": "gpt-5.2",
	"gpt-5": "gpt-5.2",
};

/**
 * Normalize a user-supplied model ID to a canonical ChatModelId.
 * Returns DEFAULT_CHAT_MODEL_ID for unknown/empty values.
 */
export const normalizeChatModelId = (deploymentId?: string): ChatModelId => {
	if (!deploymentId || deploymentId === "default") return DEFAULT_CHAT_MODEL_ID;
	if (isSupportedChatModelId(deploymentId)) return deploymentId;
	const alias = MODEL_ALIASES[deploymentId];
	if (alias) return alias;
	return DEFAULT_CHAT_MODEL_ID;
};
