import { describe, expect, it } from "vitest";
import { buildWhiteboardIndexText } from "../../convex/ai/indexing/whiteboardIndexText";

const sceneWithText = JSON.stringify({
	type: "excalidraw",
	elements: [
		{
			id: "t1",
			type: "text",
			text: "Sprint goal: ship v2",
			isDeleted: false,
		},
		{
			id: "t2",
			type: "text",
			text: "Blocker: auth refactor",
			isDeleted: false,
		},
	],
});

describe("buildWhiteboardIndexText", () => {
	it("includes the title as the top-level header", () => {
		const out = buildWhiteboardIndexText("Roadmap", sceneWithText, []);
		expect(out.startsWith("# Roadmap")).toBe(true);
	});

	it("extracts shape/text elements from the scene", () => {
		const out = buildWhiteboardIndexText("Roadmap", sceneWithText, []);
		expect(out).toContain("Sprint goal: ship v2");
		expect(out).toContain("Blocker: auth refactor");
	});

	it("appends image captions and OCR text when provided", () => {
		const out = buildWhiteboardIndexText("Roadmap", sceneWithText, [
			{
				fileKey: "img1",
				caption: "Architecture diagram",
				ocrText: "Frontend → API → Postgres",
			},
			{ fileKey: "img2", caption: "", ocrText: "" },
		]);
		expect(out).toContain("Image img1");
		expect(out).toContain("Architecture diagram");
		expect(out).toContain("Frontend → API → Postgres");
		expect(out).not.toContain("Image img2");
	});

	it("returns empty string when nothing meaningful is present", () => {
		// Title-only boards still return the title header, so we need an
		// empty-title empty-scene case to get an empty result.
		const out = buildWhiteboardIndexText("", "[]", []);
		expect(out).toBe("");
	});

	it("handles invalid scene JSON gracefully", () => {
		const out = buildWhiteboardIndexText("Board", "not json", []);
		expect(out).toBe("# Board");
	});

	it("trims deleted elements via extractBoardTextItems", () => {
		const scene = JSON.stringify({
			elements: [
				{ id: "a", type: "text", text: "keep me", isDeleted: false },
				{ id: "b", type: "text", text: "delete me", isDeleted: true },
			],
		});
		const out = buildWhiteboardIndexText("B", scene, []);
		expect(out).toContain("keep me");
		expect(out).not.toContain("delete me");
	});
});
