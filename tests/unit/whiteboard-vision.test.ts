import { describe, expect, it } from "vitest";
import {
	extractEmbeddedBoardImages,
	MAX_BOARD_VISION_IMAGES,
} from "../../convex/ai/whiteboardVision";

describe("extractEmbeddedBoardImages", () => {
	it("returns data:image payloads from Excalidraw files map", () => {
		const scene = JSON.stringify({
			type: "excalidraw",
			version: 2,
			elements: [{ id: "im1", type: "image", x: 0, y: 0 }],
			files: {
				a: { dataURL: "data:image/png;base64,AAAA" },
			},
		});
		const got = extractEmbeddedBoardImages(scene);
		expect(got).toHaveLength(1);
		expect(got[0]?.mediaType).toBe("image/png");
		expect(got[0]?.url.startsWith("data:image/png;")).toBe(true);
	});

	it("caps at MAX_BOARD_VISION_IMAGES", () => {
		const files: Record<string, { dataURL: string }> = {};
		for (let i = 0; i < MAX_BOARD_VISION_IMAGES + 3; i += 1) {
			files[`f${i}`] = {
				dataURL: `data:image/png;base64,AAAA${i}`,
			};
		}
		const scene = JSON.stringify({ files });
		expect(extractEmbeddedBoardImages(scene)).toHaveLength(
			MAX_BOARD_VISION_IMAGES,
		);
	});

	it("ignores non-image data URLs", () => {
		const scene = JSON.stringify({
			files: {
				x: { dataURL: "data:application/octet-stream;base64,QQ==" },
			},
		});
		expect(extractEmbeddedBoardImages(scene)).toHaveLength(0);
	});
});
