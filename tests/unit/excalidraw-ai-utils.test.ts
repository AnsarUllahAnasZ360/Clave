import { describe, expect, it } from "vitest";
import {
	createTextElement,
	parseAIElementsToExcalidraw,
} from "@/components/ai/whiteboard/excalidraw-ai-utils";

describe("excalidraw-ai-utils", () => {
	it("expands multiline text height even when a small fixed height is provided", () => {
		const textEl = createTextElement(
			{
				x: 0,
				y: 0,
				text: "Sidebar\n• Dashboard\n• Projects\n• Settings",
				fontSize: 18,
				height: 20,
			},
			"a00001",
		);

		expect(textEl.height).toBeGreaterThan(20);
	});

	it("keeps multiline bound text from collapsing to a single line height", () => {
		const elements = parseAIElementsToExcalidraw({
			elements: [
				{
					id: "sidebar",
					type: "rectangle",
					x: 100,
					y: 100,
					width: 280,
					height: 260,
					label: {
						text: "Sidebar\n• Dashboard\n• Projects\n• Settings",
						fontSize: 18,
					},
				},
			],
		});

		const boundText = elements.find(
			(el) => el.type === "text" && typeof el.containerId === "string",
		);
		expect(boundText).toBeDefined();
		expect(boundText?.height ?? 0).toBeGreaterThan(20);
	});
});
