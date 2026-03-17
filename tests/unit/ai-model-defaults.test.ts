import { describe, expect, it } from "vitest";
import {
	DEFAULT_CHAT_MODEL_ID,
	normalizeChatModelId,
} from "../../convex/ai/modelIds";
import { DEFAULT_MODEL_ID } from "../../src/lib/ai-models";

describe("AI model defaults", () => {
	it("uses GPT 5.4 as the default model across frontend and backend", () => {
		expect(DEFAULT_MODEL_ID).toBe("gpt-5.4");
		expect(DEFAULT_CHAT_MODEL_ID).toBe("gpt-5.4");
	});

	it("normalizes missing and unknown model ids to GPT 5.4", () => {
		expect(normalizeChatModelId()).toBe("gpt-5.4");
		expect(normalizeChatModelId("unknown-model")).toBe("gpt-5.4");
	});

	it("preserves supported model ids and known aliases", () => {
		expect(normalizeChatModelId("gpt-5.4")).toBe("gpt-5.4");
		expect(normalizeChatModelId("kimi-k2.5")).toBe("kimi-k2.5");
		expect(normalizeChatModelId("gpt-5")).toBe("gpt-5.4");
		expect(normalizeChatModelId("gpt-5.2")).toBe("gpt-5.4");
	});
});
