import { describe, expect, it } from "vitest";
import {
	DEFAULT_CHAT_MODEL_ID,
	normalizeChatModelId,
} from "../../convex/ai/modelIds";
import { DEFAULT_MODEL_ID } from "../../src/lib/ai-models";

describe("AI model defaults", () => {
	it("uses Kimi K2.5 as the default model across frontend and backend", () => {
		expect(DEFAULT_MODEL_ID).toBe("kimi-k2.5");
		expect(DEFAULT_CHAT_MODEL_ID).toBe("kimi-k2.5");
	});

	it("normalizes missing and unknown model ids to Kimi K2.5", () => {
		expect(normalizeChatModelId()).toBe("kimi-k2.5");
		expect(normalizeChatModelId("unknown-model")).toBe("kimi-k2.5");
	});

	it("preserves supported model ids and known aliases", () => {
		expect(normalizeChatModelId("gpt-5.2")).toBe("gpt-5.2");
		expect(normalizeChatModelId("kimi-k2.5")).toBe("kimi-k2.5");
		expect(normalizeChatModelId("gpt-5")).toBe("gpt-5.2");
	});
});
