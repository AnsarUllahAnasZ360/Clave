import { describe, expect, it } from "vitest";
import {
	CHAT_MODEL_IDS,
	DEFAULT_CHAT_MODEL_ID,
	isSupportedChatModelId,
	normalizeChatModelId,
} from "../../convex/ai/modelIds";

describe("modelIds", () => {
	describe("CHAT_MODEL_IDS", () => {
		it("contains the expected models", () => {
			expect(CHAT_MODEL_IDS).toContain("kimi-k2.5");
			expect(CHAT_MODEL_IDS).toContain("gpt-5.2");
		});
	});

	describe("DEFAULT_CHAT_MODEL_ID", () => {
		it("is kimi-k2.5", () => {
			expect(DEFAULT_CHAT_MODEL_ID).toBe("kimi-k2.5");
		});
	});

	describe("isSupportedChatModelId", () => {
		it("returns true for supported model IDs", () => {
			expect(isSupportedChatModelId("kimi-k2.5")).toBe(true);
			expect(isSupportedChatModelId("gpt-5.2")).toBe(true);
		});

		it("returns false for unsupported model IDs", () => {
			expect(isSupportedChatModelId("gpt-4")).toBe(false);
			expect(isSupportedChatModelId("unknown")).toBe(false);
			expect(isSupportedChatModelId("")).toBe(false);
		});
	});

	describe("normalizeChatModelId", () => {
		it("returns default for undefined or empty input", () => {
			expect(normalizeChatModelId()).toBe("kimi-k2.5");
			expect(normalizeChatModelId("")).toBe("kimi-k2.5");
		});

		it('returns default for "default" string', () => {
			expect(normalizeChatModelId("default")).toBe("kimi-k2.5");
		});

		it("preserves supported model IDs", () => {
			expect(normalizeChatModelId("gpt-5.2")).toBe("gpt-5.2");
			expect(normalizeChatModelId("kimi-k2.5")).toBe("kimi-k2.5");
		});

		it("resolves known aliases", () => {
			expect(normalizeChatModelId("kimmy-2.5")).toBe("kimi-k2.5");
			expect(normalizeChatModelId("kimi-2.5")).toBe("kimi-k2.5");
			expect(normalizeChatModelId("kimmy k2.5")).toBe("kimi-k2.5");
			expect(normalizeChatModelId("kimi k2.5")).toBe("kimi-k2.5");
			expect(normalizeChatModelId("codex-5.2")).toBe("gpt-5.2");
			expect(normalizeChatModelId("gpt-5.0")).toBe("gpt-5.2");
			expect(normalizeChatModelId("gpt-5")).toBe("gpt-5.2");
		});

		it("returns default for unknown model IDs", () => {
			expect(normalizeChatModelId("claude-3")).toBe("kimi-k2.5");
			expect(normalizeChatModelId("totally-fake-model")).toBe("kimi-k2.5");
		});
	});
});
