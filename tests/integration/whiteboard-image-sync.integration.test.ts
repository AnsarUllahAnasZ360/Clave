/**
 * @vitest-environment node
 *
 * Runs the whiteboard image-sync helpers under the real Node runtime
 * (not jsdom) to catch SubtleCrypto compatibility issues. CI failed
 * previously because `crypto.subtle.digest` rejected a bare ArrayBuffer
 * with ERR_INVALID_ARG_TYPE; this guards that the TypedArray path stays
 * intact end-to-end.
 */

import { describe, expect, it } from "vitest";
import { __test__ } from "../../convex/ai/whiteboardImageSync";

const { parseSceneImages, sha256Hex, base64ToBytes } = __test__;

function makeDataURL(mediaType: string, text: string): string {
	const base64 = Buffer.from(text, "utf-8").toString("base64");
	return `data:${mediaType};base64,${base64}`;
}

describe("whiteboard image sync (Node runtime)", () => {
	it("hashes a known input with Node SubtleCrypto", async () => {
		const hex = await sha256Hex(base64ToBytes("YWJj")); // "abc"
		expect(hex).toBe(
			"ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
		);
	});

	it("parses a scene with embedded images end-to-end under Node", async () => {
		const scene = JSON.stringify({
			files: {
				diagram: { dataURL: makeDataURL("image/png", "node-runtime-test") },
			},
		});
		const images = await parseSceneImages(scene);
		expect(images).toHaveLength(1);
		expect(images[0]?.mediaType).toBe("image/png");
		expect(images[0]?.sha256).toHaveLength(64);
	});
});
