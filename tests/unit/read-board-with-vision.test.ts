import { describe, expect, it } from "vitest";
import {
	buildReadBoardWithVisionOutput,
	type ReadBoardWithVisionResult,
} from "../../convex/ai/tools/read";

function makeResult(
	overrides: Partial<ReadBoardWithVisionResult> = {},
): ReadBoardWithVisionResult {
	return {
		whiteboardId: "wb_1",
		title: "Sprint planning",
		projectId: null,
		projectName: null,
		elementCount: 5,
		totalTextItems: 3,
		totalChunks: 1,
		chunkIndex: 0,
		markdown: "- Task one\n- Task two",
		imageCount: 0,
		images: [],
		...overrides,
	};
}

describe("buildReadBoardWithVisionOutput", () => {
	it("returns error-text when the tool produced an error", () => {
		const out = buildReadBoardWithVisionOutput({ error: "not found" });
		expect(out.type).toBe("error-text");
		if (out.type === "error-text") expect(out.value).toBe("not found");
	});

	it("returns a single text part when there are no images", () => {
		const out = buildReadBoardWithVisionOutput(makeResult());
		expect(out.type).toBe("content");
		if (out.type !== "content") throw new Error("expected content output");
		expect(out.value).toHaveLength(1);
		expect(out.value[0]?.type).toBe("text");
		if (out.value[0]?.type === "text") {
			expect(out.value[0].text).toContain("Sprint planning");
			expect(out.value[0].text).toContain("- Task one");
			expect(out.value[0].text).toContain("No embedded images");
		}
	});

	it("appends image-data parts with base64 prefix stripped", () => {
		const out = buildReadBoardWithVisionOutput(
			makeResult({
				imageCount: 2,
				images: [
					{ dataUrl: "data:image/png;base64,AAAA", mediaType: "image/png" },
					{ dataUrl: "data:image/jpeg;base64,BBBB", mediaType: "image/jpeg" },
				],
			}),
		);
		if (out.type !== "content") throw new Error("expected content output");
		expect(out.value).toHaveLength(3);
		expect(out.value[1]).toEqual({
			type: "image-data",
			data: "AAAA",
			mediaType: "image/png",
		});
		expect(out.value[2]).toEqual({
			type: "image-data",
			data: "BBBB",
			mediaType: "image/jpeg",
		});
		if (out.value[0]?.type === "text") {
			expect(out.value[0].text).toContain("2 embedded image(s)");
		}
	});

	it("handles data URLs without a comma by passing through the raw value", () => {
		const out = buildReadBoardWithVisionOutput(
			makeResult({
				imageCount: 1,
				images: [{ dataUrl: "nocomma", mediaType: "image/png" }],
			}),
		);
		if (out.type !== "content") throw new Error("expected content output");
		expect(out.value[1]).toEqual({
			type: "image-data",
			data: "nocomma",
			mediaType: "image/png",
		});
	});

	it("reports chunk progress in the header for paginated boards", () => {
		const out = buildReadBoardWithVisionOutput(
			makeResult({ chunkIndex: 2, totalChunks: 5 }),
		);
		if (out.type !== "content") throw new Error("expected content output");
		if (out.value[0]?.type === "text") {
			expect(out.value[0].text).toContain("Chunk 3/5");
		}
	});
});
