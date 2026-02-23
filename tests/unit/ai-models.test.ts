import { describe, expect, it } from "vitest";
import {
	AI_MODELS,
	type AIModel,
	DEFAULT_MODEL_ID,
} from "../../src/lib/ai-models";

describe("ai-models", () => {
	it("exports a non-empty array of AI models", () => {
		expect(AI_MODELS).toBeInstanceOf(Array);
		expect(AI_MODELS.length).toBeGreaterThan(0);
	});

	it("every model has required fields", () => {
		for (const model of AI_MODELS) {
			expect(model.id).toBeDefined();
			expect(typeof model.id).toBe("string");
			expect(model.id.length).toBeGreaterThan(0);

			expect(model.label).toBeDefined();
			expect(typeof model.label).toBe("string");
			expect(model.label.length).toBeGreaterThan(0);

			expect(model.description).toBeDefined();
			expect(typeof model.description).toBe("string");
		}
	});

	it("has no duplicate model IDs", () => {
		const ids = AI_MODELS.map((m) => m.id);
		expect(new Set(ids).size).toBe(ids.length);
	});

	it("DEFAULT_MODEL_ID is a valid model from the list", () => {
		expect(typeof DEFAULT_MODEL_ID).toBe("string");
		const found = AI_MODELS.find((m) => m.id === DEFAULT_MODEL_ID);
		expect(found).toBeDefined();
	});

	it("model type satisfies AIModel shape", () => {
		const model: AIModel = AI_MODELS[0];
		expect(model).toHaveProperty("id");
		expect(model).toHaveProperty("label");
		expect(model).toHaveProperty("description");
	});
});
