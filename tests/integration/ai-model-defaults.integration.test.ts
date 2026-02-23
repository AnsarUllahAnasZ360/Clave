/**
 * @vitest-environment node
 */

import { describe, expect, it } from "vitest";
import { DEFAULT_CHAT_MODEL_ID } from "../../convex/ai/modelIds";
import { AI_MODELS, DEFAULT_MODEL_ID } from "../../src/lib/ai-models";

describe("AI model configuration alignment", () => {
	it("keeps frontend and backend default model ids aligned", () => {
		expect(DEFAULT_MODEL_ID).toBe(DEFAULT_CHAT_MODEL_ID);
		expect(DEFAULT_MODEL_ID).toBe("gpt-5.2");
	});

	it("surfaces the default model first in the model picker list", () => {
		expect(AI_MODELS[0]?.id).toBe(DEFAULT_MODEL_ID);
	});
});
