import { describe, expect, it } from "vitest";
import { __test__ } from "../../convex/ai/whiteboardImageSync";

const { parseSceneImages, sha256Hex, base64ToBytes } = __test__;

function makeDataURL(mediaType: string, text: string): string {
	const base64 = Buffer.from(text, "utf-8").toString("base64");
	return `data:${mediaType};base64,${base64}`;
}

describe("parseSceneImages", () => {
	it("returns empty array for invalid JSON", async () => {
		expect(await parseSceneImages("not json")).toEqual([]);
	});

	it("returns empty array when files map is missing", async () => {
		expect(await parseSceneImages(JSON.stringify({ elements: [] }))).toEqual(
			[],
		);
	});

	it("extracts image entries with media type and bytes", async () => {
		const scene = JSON.stringify({
			files: {
				img1: { dataURL: makeDataURL("image/png", "hello") },
				img2: { dataURL: makeDataURL("image/jpeg", "world!!") },
			},
		});
		const got = await parseSceneImages(scene);
		expect(got).toHaveLength(2);
		const byKey = Object.fromEntries(got.map((g) => [g.fileKey, g]));
		expect(byKey.img1?.mediaType).toBe("image/png");
		expect(byKey.img2?.mediaType).toBe("image/jpeg");
		expect(Buffer.from(byKey.img1?.bytes ?? []).toString("utf-8")).toBe(
			"hello",
		);
		expect(Buffer.from(byKey.img2?.bytes ?? []).toString("utf-8")).toBe(
			"world!!",
		);
	});

	it("produces stable sha256 hashes keyed on content", async () => {
		const scene = JSON.stringify({
			files: { a: { dataURL: makeDataURL("image/png", "stable") } },
		});
		const first = await parseSceneImages(scene);
		const second = await parseSceneImages(scene);
		expect(first[0]?.sha256).toBe(second[0]?.sha256);
		expect(first[0]?.sha256).toHaveLength(64);

		const other = await parseSceneImages(
			JSON.stringify({
				files: { a: { dataURL: makeDataURL("image/png", "different") } },
			}),
		);
		expect(other[0]?.sha256).not.toBe(first[0]?.sha256);
	});

	it("ignores non-image data URLs", async () => {
		const scene = JSON.stringify({
			files: {
				txt: { dataURL: "data:text/plain;base64,QUFBQQ==" },
			},
		});
		expect(await parseSceneImages(scene)).toEqual([]);
	});

	it("ignores entries without a data URL", async () => {
		const scene = JSON.stringify({
			files: { a: { notDataURL: "x" }, b: { dataURL: "" } },
		});
		expect(await parseSceneImages(scene)).toEqual([]);
	});
});

describe("sha256Hex / base64ToBytes", () => {
	it("round-trips base64 → bytes", () => {
		const bytes = base64ToBytes("aGVsbG8="); // "hello"
		expect(Buffer.from(bytes).toString("utf-8")).toBe("hello");
	});

	it("produces the expected sha256 for a known input", async () => {
		const bytes = base64ToBytes("YWJj"); // "abc"
		const hex = await sha256Hex(bytes);
		expect(hex).toBe(
			"ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
		);
	});

	it("handles empty input without throwing on Node SubtleCrypto", async () => {
		// Regression: Node's SubtleCrypto (used in CI) rejects bare ArrayBuffer
		// inputs with ERR_INVALID_ARG_TYPE. sha256Hex must always hand it a
		// TypedArray view. An empty input is a cheap smoke test for that path.
		const hex = await sha256Hex(new Uint8Array(0));
		expect(hex).toBe(
			"e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
		);
	});
});
