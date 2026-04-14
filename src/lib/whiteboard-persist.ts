import type { Id } from "../../convex/_generated/dataModel";
import {
	MAX_INLINE_WHITEBOARD_SCENE_UTF8_BYTES,
	utf8ByteLength,
} from "./whiteboard-bytes";

export type UpdateSceneArgs = {
	whiteboardId: Id<"whiteboards">;
	mode: "inline" | "full_in_storage";
	sceneData: string;
	appState: string;
	sceneDataStorageId?: Id<"_storage">;
};

const STORAGE_UPLOAD_MAX_ATTEMPTS = 4;
const STORAGE_UPLOAD_BASE_DELAY_MS = 400;

function delay(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableUploadFailure(status: number, error: unknown): boolean {
	if (status >= 500) return true;
	if (status === 408 || status === 429) return true;
	if (status === 0) return true;
	// Browser `fetch` rejects with TypeError on net::ERR_* (connection reset, refused, etc.)
	if (error instanceof TypeError) return true;
	return false;
}

/**
 * POST full scene JSON to a Convex-generated upload URL. Retries with backoff on
 * transient failures (`net::ERR_CONNECTION_RESET`, 5xx). Each attempt uses a new
 * upload URL — tokens are not safe to reuse after a failed POST.
 */
async function postSceneToUploadUrl(
	getUploadUrl: () => Promise<string>,
	body: Blob,
): Promise<Response> {
	let lastError: unknown;
	let lastStatus = 0;

	for (let attempt = 0; attempt < STORAGE_UPLOAD_MAX_ATTEMPTS; attempt += 1) {
		if (attempt > 0) {
			const backoff = Math.min(
				8000,
				STORAGE_UPLOAD_BASE_DELAY_MS * 2 ** (attempt - 1),
			);
			await delay(backoff);
		}
		const uploadUrl = await getUploadUrl();
		try {
			const result = await fetch(uploadUrl, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body,
			});
			lastStatus = result.status;
			if (result.ok) return result;
			lastError = new Error(`Scene upload failed: ${result.statusText}`);
			if (
				!isRetryableUploadFailure(result.status, lastError) ||
				attempt === STORAGE_UPLOAD_MAX_ATTEMPTS - 1
			) {
				throw lastError;
			}
		} catch (e) {
			lastError = e;
			lastStatus = 0;
			if (
				!isRetryableUploadFailure(0, e) ||
				attempt === STORAGE_UPLOAD_MAX_ATTEMPTS - 1
			) {
				throw e instanceof Error
					? e
					: new Error(
							"Scene upload failed: network error (connection reset or offline). Try again.",
						);
			}
		}
	}

	throw lastError instanceof Error
		? lastError
		: new Error(`Scene upload failed after ${lastStatus || "network"} errors.`);
}

/**
 * Persists the Excalidraw scene: inline JSON when under the Convex document limit,
 * otherwise uploads the full JSON to Convex file storage and saves a lean "database"
 * serialization in `sceneData` on the whiteboard document.
 */
export async function saveWhiteboardSceneToConvex(options: {
	fullLocalJson: string;
	leanDbJson: string;
	appStateJson: string;
	whiteboardId: Id<"whiteboards">;
	getUploadUrl: () => Promise<string>;
	updateScene: (args: UpdateSceneArgs) => Promise<unknown>;
}): Promise<void> {
	const {
		fullLocalJson,
		leanDbJson,
		appStateJson,
		whiteboardId,
		getUploadUrl,
		updateScene,
	} = options;

	if (utf8ByteLength(fullLocalJson) <= MAX_INLINE_WHITEBOARD_SCENE_UTF8_BYTES) {
		await updateScene({
			whiteboardId,
			mode: "inline",
			sceneData: fullLocalJson,
			appState: appStateJson,
		});
		return;
	}

	const body = new Blob([fullLocalJson], { type: "application/json" });
	const result = await postSceneToUploadUrl(getUploadUrl, body);

	const { storageId } = (await result.json()) as { storageId: string };

	await updateScene({
		whiteboardId,
		mode: "full_in_storage",
		sceneData: leanDbJson,
		appState: appStateJson,
		sceneDataStorageId: storageId as Id<"_storage">,
	});
}
