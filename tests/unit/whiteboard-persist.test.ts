import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MAX_INLINE_WHITEBOARD_SCENE_UTF8_BYTES } from "../../src/lib/whiteboard-bytes";
import { saveWhiteboardSceneToConvex } from "../../src/lib/whiteboard-persist";

describe("saveWhiteboardSceneToConvex", () => {
	const getUploadUrl = vi.fn();
	const updateScene = vi.fn();

	beforeEach(() => {
		getUploadUrl.mockReset();
		updateScene.mockReset();
		updateScene.mockResolvedValue(undefined);
		vi.stubGlobal(
			"fetch",
			vi
				.fn()
				.mockResolvedValue(
					new Response(JSON.stringify({ storageId: "s1" }), { status: 200 }),
				),
		);
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it("retries storage upload with a fresh URL after fetch rejects, then succeeds", async () => {
		const fullLocalJson = "x".repeat(
			MAX_INLINE_WHITEBOARD_SCENE_UTF8_BYTES + 1,
		);
		const leanDbJson = "{}";
		const appStateJson = "{}";

		const fetchMock = vi.mocked(globalThis.fetch);
		fetchMock
			.mockRejectedValueOnce(new TypeError("Failed to fetch"))
			.mockRejectedValueOnce(new TypeError("Failed to fetch"))
			.mockResolvedValueOnce(
				new Response(JSON.stringify({ storageId: "stor_ok" }), { status: 200 }),
			);

		await saveWhiteboardSceneToConvex({
			fullLocalJson,
			leanDbJson,
			appStateJson,
			whiteboardId:
				"wb123" as import("../../convex/_generated/dataModel").Id<"whiteboards">,
			getUploadUrl,
			updateScene,
		});

		expect(getUploadUrl).toHaveBeenCalledTimes(3);
		expect(fetchMock).toHaveBeenCalledTimes(3);
		expect(updateScene).toHaveBeenCalledWith(
			expect.objectContaining({
				mode: "full_in_storage",
				sceneDataStorageId: "stor_ok",
			}),
		);
	});

	it("stops after max attempts when fetch keeps failing", async () => {
		const fullLocalJson = "x".repeat(
			MAX_INLINE_WHITEBOARD_SCENE_UTF8_BYTES + 1,
		);
		const fetchMock = vi.mocked(globalThis.fetch);
		fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));

		await expect(
			saveWhiteboardSceneToConvex({
				fullLocalJson,
				leanDbJson: "{}",
				appStateJson: "{}",
				whiteboardId:
					"wb123" as import("../../convex/_generated/dataModel").Id<"whiteboards">,
				getUploadUrl,
				updateScene,
			}),
		).rejects.toThrow();

		expect(getUploadUrl).toHaveBeenCalledTimes(4);
		expect(updateScene).not.toHaveBeenCalled();
	});
});
