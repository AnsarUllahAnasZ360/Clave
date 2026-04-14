import { describe, expect, it } from "vitest";
import {
	BOARD_EXPORT_CHUNK_CHARS,
	chunkString,
	extractBoardTextItems,
	getSceneElementsArray,
	itemsToMarkdown,
} from "../../convex/ai/whiteboardSceneExport";
import {
	MAX_INLINE_WHITEBOARD_SCENE_UTF8_BYTES,
	utf8ByteLength,
} from "../../src/lib/whiteboard-bytes";

describe("whiteboardSceneExport", () => {
	it("getSceneElementsArray parses legacy array and serializeAsJSON object", () => {
		const legacy = JSON.stringify([{ id: "a", type: "text", text: "x" }]);
		expect(getSceneElementsArray(legacy)).toHaveLength(1);

		const wrapped = JSON.stringify({
			type: "excalidraw",
			version: 2,
			source: "serializeAsJSON",
			elements: [{ id: "b", type: "text", text: "y" }],
		});
		expect(getSceneElementsArray(wrapped)).toHaveLength(1);

		expect(getSceneElementsArray(undefined)).toEqual([]);
		expect(getSceneElementsArray("{")).toEqual([]);
	});

	it("extractBoardTextItems collects labels and skips bound text duplicates", () => {
		const elements = [
			{
				id: "r1",
				type: "rectangle",
				x: 0,
				y: 0,
				width: 100,
				height: 60,
				label: { text: "Sprint goal", fontSize: 20 },
			},
			{
				id: "t1",
				type: "text",
				x: 10,
				y: 10,
				width: 50,
				height: 20,
				text: "ignored bound",
				containerId: "r1",
			},
			{
				id: "t2",
				type: "text",
				x: 0,
				y: 200,
				width: 80,
				height: 24,
				text: "Standalone note",
			},
		];
		const items = extractBoardTextItems(elements);
		const texts = items.map((i) => i.text).sort();
		expect(texts).toContain("Sprint goal");
		expect(texts).toContain("Standalone note");
		expect(texts).not.toContain("ignored bound");
	});

	it("itemsToMarkdown numbers lines", () => {
		const md = itemsToMarkdown([
			{ id: "1", kind: "rectangle", text: "A" },
			{ id: "2", kind: "text", text: "B" },
		]);
		expect(md).toBe("1. [rectangle] A\n2. [text] B");
	});

	it("utf8ByteLength matches TextEncoder for unicode", () => {
		expect(utf8ByteLength("a")).toBe(1);
		expect(utf8ByteLength("é")).toBe(2);
		expect(utf8ByteLength("a".repeat(1000))).toBe(1000);
		expect(MAX_INLINE_WHITEBOARD_SCENE_UTF8_BYTES).toBe(900_000);
	});

	it("chunkString splits long strings", () => {
		const s = "a".repeat(BOARD_EXPORT_CHUNK_CHARS + 10);
		const chunks = chunkString(s, BOARD_EXPORT_CHUNK_CHARS);
		expect(chunks).toHaveLength(2);
		expect(chunks[0]?.length).toBe(BOARD_EXPORT_CHUNK_CHARS);
		expect(chunks[1]?.length).toBe(10);
	});
});
