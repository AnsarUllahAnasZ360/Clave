import { describe, expect, it } from "vitest";

import { computeAISelectionToolbarPosition } from "../../src/hooks/use-ai-selection-toolbar";

describe("computeAISelectionToolbarPosition", () => {
	it("places the AI toolbar below selection with an offset by default", () => {
		const position = computeAISelectionToolbarPosition(
			{
				bottom: 340,
				left: 400,
				top: 300,
				width: 100,
			},
			{ height: 900, width: 1200 },
		);

		expect(position).toEqual({ x: 450, y: 400 });
	});

	it("falls back above selection when there is not enough room below", () => {
		const position = computeAISelectionToolbarPosition(
			{
				bottom: 870,
				left: 400,
				top: 840,
				width: 100,
			},
			{ height: 900, width: 1200 },
		);

		expect(position).toEqual({ x: 450, y: 732 });
	});

	it("clamps vertically when neither above nor below has enough room", () => {
		const position = computeAISelectionToolbarPosition(
			{
				bottom: 40,
				left: 80,
				top: 20,
				width: 20,
			},
			{ height: 90, width: 1200 },
		);

		expect(position.y).toBe(34);
	});

	it("centers horizontally when viewport is narrower than toolbar width estimate", () => {
		const position = computeAISelectionToolbarPosition(
			{
				bottom: 340,
				left: 0,
				top: 300,
				width: 10,
			},
			{ height: 900, width: 280 },
		);

		expect(position.x).toBe(140);
	});

	it("clamps horizontal position near the right edge on normal viewports", () => {
		const position = computeAISelectionToolbarPosition(
			{
				bottom: 340,
				left: 850,
				top: 300,
				width: 100,
			},
			{ height: 900, width: 900 },
		);

		expect(position.x).toBe(732);
	});
});
