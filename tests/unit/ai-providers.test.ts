/**
 * Tests for convex/ai/providers.ts
 *
 * providers.ts requires Azure env vars at module load time. We set process.env
 * directly before the static import is resolved by Vitest's module transform.
 */

// Set env vars before any imports that depend on them
const originalEnv = {
	resourceName: process.env.AZURE_RESOURCE_NAME,
	apiKey: process.env.AZURE_API_KEY,
	gpt5_2: process.env.AZURE_CHAT_MODEL_GPT_5_2,
	kimi: process.env.AZURE_CHAT_MODEL_KIMI_25,
	embeddingDeployment: process.env.AZURE_EMBEDDING_DEPLOYMENT,
};

process.env.AZURE_RESOURCE_NAME = "test-resource";
process.env.AZURE_API_KEY = "test-key-12345";
process.env.AZURE_CHAT_MODEL_GPT_5_2 = "gpt-5-2-deployment";
process.env.AZURE_CHAT_MODEL_KIMI_25 = "kimi-25-deployment";
process.env.AZURE_EMBEDDING_DEPLOYMENT = "text-embedding-3-large";

import { afterAll, describe, expect, it } from "vitest";
import {
	chatModel,
	embeddingModel,
	getChatModel,
	getReasoningProviderOptions,
	isSupportedChatModelId,
	normalizeChatModelId,
	resolveChatModel,
	SUPPORTED_CHAT_MODEL_IDS,
	supportsTemperatureSetting,
	usesResponsesApi,
} from "../../convex/ai/providers";

// Clean up env vars after tests
afterAll(() => {
	const restoreEnvVar = (key: string, value: string | undefined) => {
		if (value === undefined) delete process.env[key];
		else process.env[key] = value;
	};

	restoreEnvVar("AZURE_RESOURCE_NAME", originalEnv.resourceName);
	restoreEnvVar("AZURE_API_KEY", originalEnv.apiKey);
	restoreEnvVar("AZURE_CHAT_MODEL_GPT_5_2", originalEnv.gpt5_2);
	restoreEnvVar("AZURE_CHAT_MODEL_KIMI_25", originalEnv.kimi);
	restoreEnvVar("AZURE_EMBEDDING_DEPLOYMENT", originalEnv.embeddingDeployment);
});

describe("ai/providers", () => {
	describe("resolveChatModel", () => {
		it("resolves default model when no modelId is provided", () => {
			const result = resolveChatModel();
			expect(result.resolvedModelId).toBe("gpt-5.2");
			expect(result.model).toBeDefined();
			expect(result.fallbackReason).toBeUndefined();
		});

		it("resolves a valid model ID directly", () => {
			const result = resolveChatModel("gpt-5.2");
			expect(result.resolvedModelId).toBe("gpt-5.2");
			expect(result.requestedModelId).toBe("gpt-5.2");
			expect(result.fallbackReason).toBeUndefined();
		});

		it("resolves kimi model when configured", () => {
			const result = resolveChatModel("kimi-k2.5");
			expect(result.resolvedModelId).toBe("kimi-k2.5");
			expect(result.requestedModelId).toBe("kimi-k2.5");
			expect(result.fallbackReason).toBeUndefined();
		});

		it("normalizes aliases before resolving", () => {
			const result = resolveChatModel("gpt-5");
			expect(result.requestedModelId).toBe("gpt-5.2");
			expect(result.resolvedModelId).toBe("gpt-5.2");
		});

		it("trims whitespace from model ID", () => {
			const result = resolveChatModel("  gpt-5.2  ");
			expect(result.resolvedModelId).toBe("gpt-5.2");
		});
	});

	describe("getReasoningProviderOptions", () => {
		it("returns undefined for kimi model (chat API, not responses)", () => {
			const result = getReasoningProviderOptions("kimi-k2.5");
			expect(result).toBeUndefined();
		});

		it("returns undefined for gpt-5.2 (chat API by default, reasoning only on responses API)", () => {
			const result = getReasoningProviderOptions("gpt-5.2");
			expect(result).toBeUndefined();
		});
	});

	describe("supportsTemperatureSetting", () => {
		it("returns true for kimi model", () => {
			expect(supportsTemperatureSetting("kimi-k2.5")).toBe(true);
		});

		it("returns false for gpt-5.2", () => {
			expect(supportsTemperatureSetting("gpt-5.2")).toBe(false);
		});
	});

	describe("usesResponsesApi", () => {
		it("returns false for kimi (chat API by default)", () => {
			expect(usesResponsesApi("kimi-k2.5")).toBe(false);
		});

		it("returns false for gpt-5.2 (chat API by default)", () => {
			expect(usesResponsesApi("gpt-5.2")).toBe(false);
		});
	});

	describe("chatModel", () => {
		it("is defined and has a model ID", () => {
			expect(chatModel).toBeDefined();
			expect(chatModel.modelId).toBeDefined();
		});
	});

	describe("embeddingModel", () => {
		it("is defined", () => {
			expect(embeddingModel).toBeDefined();
		});
	});

	describe("getChatModel", () => {
		it("returns a model for configured model IDs", () => {
			expect(getChatModel("gpt-5.2")).toBeDefined();
			expect(getChatModel("kimi-k2.5")).toBeDefined();
		});
	});

	describe("re-exported model-ID utilities", () => {
		it("exports SUPPORTED_CHAT_MODEL_IDS", () => {
			expect(SUPPORTED_CHAT_MODEL_IDS).toContain("gpt-5.2");
			expect(SUPPORTED_CHAT_MODEL_IDS).toContain("kimi-k2.5");
		});

		it("exports isSupportedChatModelId", () => {
			expect(isSupportedChatModelId("gpt-5.2")).toBe(true);
			expect(isSupportedChatModelId("nope")).toBe(false);
		});

		it("exports normalizeChatModelId", () => {
			expect(normalizeChatModelId("gpt-5")).toBe("gpt-5.2");
		});
	});
});
