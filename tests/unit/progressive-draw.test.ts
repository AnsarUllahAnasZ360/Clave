import { describe, expect, it } from "vitest";
import type { ExcalidrawElementLike } from "@/components/ai/whiteboard/excalidraw-ai-utils";
import { buildProgressiveInsertionBatches } from "@/components/ai/whiteboard/progressive-draw";

function el(id: string, type: string): ExcalidrawElementLike {
	return {
		id,
		type,
		isDeleted: false,
	} as ExcalidrawElementLike;
}

describe("buildProgressiveInsertionBatches", () => {
	it("keeps non-connectors before connectors while preserving order", () => {
		const elements = [
			el("shape-a", "rectangle"),
			el("text-a", "text"),
			el("arrow-a", "arrow"),
			el("shape-b", "ellipse"),
			el("arrow-b", "line"),
		];

		const batches = buildProgressiveInsertionBatches(elements, {
			shapeBatchSize: 2,
			connectorBatchSize: 1,
		});
		const flattened = batches.flat().map((item) => item.id);

		expect(flattened).toEqual([
			"shape-a",
			"text-a",
			"shape-b",
			"arrow-a",
			"arrow-b",
		]);

		const firstConnectorBatchIndex = batches.findIndex((batch) =>
			batch.some((item) => item.type === "arrow" || item.type === "line"),
		);
		expect(firstConnectorBatchIndex).toBeGreaterThan(0);
		expect(
			batches
				.slice(0, firstConnectorBatchIndex)
				.flat()
				.every((item) => item.type !== "arrow" && item.type !== "line"),
		).toBe(true);
	});
});
