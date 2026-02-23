import { describe, expect, it } from "vitest";
import {
	fallbackElementsForMode,
	sanitizeDrawableElements,
	selectOfficialExcalidrawTools,
	validateGeneratedElements,
} from "../../convex/ai/whiteboardMcp";

describe("whiteboard MCP helpers", () => {
	it("selects paired official read_me/create_view tools", () => {
		const selected = selectOfficialExcalidrawTools({
			mcp_other_read_me: {},
			mcp_other_create_view: {},
			mcp_excalidraw_read_me: {},
			mcp_excalidraw_create_view: {},
		});
		expect(selected).toEqual({
			readMeName: "mcp_excalidraw_read_me",
			createViewName: "mcp_excalidraw_create_view",
		});
	});

	it("sanitizes drawable elements and drops pseudo elements", () => {
		const sanitized = sanitizeDrawableElements([
			{ type: "cameraUpdate", x: 0, y: 0, width: 800, height: 600 },
			{
				type: "rectangle",
				id: "shape-1",
				x: 10,
				y: 20,
				width: 200,
				height: 80,
				label: { text: "Header", fontSize: 16 },
			},
			{ type: "delete", ids: "shape-1" },
		]);

		expect(sanitized).toHaveLength(1);
		expect(sanitized[0]).toMatchObject({
			type: "rectangle",
			id: "shape-1",
			x: 10,
			y: 20,
			width: 200,
			height: 80,
		});
	});

	it("keeps minimal wireframes valid but reports advisory issues", () => {
		const badWireframe = sanitizeDrawableElements([
			{ type: "rectangle", id: "single", x: 0, y: 0, width: 100, height: 50 },
		]);
		const invalid = validateGeneratedElements(badWireframe, "wireframe");
		expect(invalid.valid).toBe(true);
		expect(invalid.issues.length).toBeGreaterThan(0);

		const fallback = fallbackElementsForMode("wireframe");
		const valid = validateGeneratedElements(fallback, "wireframe");
		expect(valid.valid).toBe(true);
	});
});
