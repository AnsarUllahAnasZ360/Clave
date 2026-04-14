import {
	hashElementsVersion,
	restore,
	restoreElements,
} from "@excalidraw/excalidraw";
import type { OrderedExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import type { AppState, BinaryFiles } from "@excalidraw/excalidraw/types";

const RESTORE_SCENE_OPTIONS = {
	repairBindings: true,
	refreshDimensions: true,
} as const;

export {
	MAX_INLINE_WHITEBOARD_SCENE_UTF8_BYTES,
	utf8ByteLength,
} from "./whiteboard-bytes";

export type ParsedWhiteboardScene = {
	elements: OrderedExcalidrawElement[];
	files: BinaryFiles | undefined;
	appState: Partial<AppState>;
};

/**
 * Image shapes reference `fileId` in `files`. Older saves omitted `files`, so
 * those images cannot be rendered. This counts how many non-deleted image
 * elements have no usable file payload (nothing to "restore" server-side).
 */
export { hasNonDeletedElements } from "./whiteboard-element-utils";

export function countImageElementsMissingFiles(
	elements: readonly OrderedExcalidrawElement[],
	files: BinaryFiles | undefined,
): number {
	const map = files ?? {};
	let n = 0;
	for (const el of elements) {
		if (el.isDeleted) continue;
		if (el.type !== "image") continue;
		const fileId = (el as { fileId?: string | null }).fileId;
		if (!fileId) continue;
		const file = map[fileId as keyof BinaryFiles];
		if (!file?.dataURL) n++;
	}
	return n;
}

/**
 * Excalidraw can update embedded image bytes in `files` after the image element
 * already exists, without bumping `hashElementsVersion(elements)`. Combine both
 * so we do not skip persisting the final blob.
 */
export function sceneSaveSignature(
	elements: readonly OrderedExcalidrawElement[],
	files: BinaryFiles,
): string {
	const ev = hashElementsVersion(elements);
	const ids = Object.keys(files).sort();
	let dataLen = 0;
	for (const f of Object.values(files)) {
		if (f?.dataURL) dataLen += f.dataURL.length;
	}
	return `${ev}|${ids.join(",")}|${dataLen}`;
}

/**
 * Parse persisted `sceneData`: legacy format is a JSON array of elements only;
 * current format is Excalidraw `serializeAsJSON(..., "local")` output (elements + files + appState).
 * Note: `"database"` mode strips `files` from JSON — use `"local"` to persist embedded images.
 */
export function parseStoredWhiteboardScene(
	sceneData: string | undefined,
	fallbackAppStateJson: string | undefined,
): ParsedWhiteboardScene {
	let fallbackAppState: Partial<AppState> = {};
	try {
		if (fallbackAppStateJson) {
			fallbackAppState = JSON.parse(fallbackAppStateJson) as Partial<AppState>;
		}
	} catch {
		// ignore
	}

	if (!sceneData) {
		return { elements: [], files: undefined, appState: fallbackAppState };
	}

	let raw: unknown;
	try {
		raw = JSON.parse(sceneData);
	} catch {
		return { elements: [], files: undefined, appState: fallbackAppState };
	}

	if (Array.isArray(raw)) {
		return {
			elements: restoreElements(raw, null, RESTORE_SCENE_OPTIONS),
			files: undefined,
			appState: fallbackAppState,
		};
	}

	if (raw && typeof raw === "object" && "elements" in raw) {
		const data = raw as {
			elements?: unknown;
			appState?: Partial<AppState>;
			files?: BinaryFiles;
		};
		const restored = restore(
			{
				elements: (data.elements ?? []) as never,
				appState: data.appState ?? null,
				files: data.files,
			},
			null,
			null,
			RESTORE_SCENE_OPTIONS,
		);
		const files =
			restored.files && Object.keys(restored.files).length > 0
				? restored.files
				: undefined;
		return {
			elements: restored.elements,
			files,
			appState: { ...restored.appState, ...fallbackAppState },
		};
	}

	return { elements: [], files: undefined, appState: fallbackAppState };
}

/** Parse `sceneData` JSON for realtime sync (remote update from Convex). */
export function elementsAndFilesFromSceneJson(raw: unknown): {
	elements: OrderedExcalidrawElement[];
	files: BinaryFiles;
} {
	if (Array.isArray(raw)) {
		return {
			elements: restoreElements(raw, null, RESTORE_SCENE_OPTIONS),
			files: {},
		};
	}
	if (raw && typeof raw === "object" && "elements" in raw) {
		const data = raw as {
			elements?: unknown;
			appState?: unknown;
			files?: BinaryFiles;
		};
		const restored = restore(
			{
				elements: (data.elements ?? []) as never,
				appState: data.appState as never,
				files: data.files,
			},
			null,
			null,
			RESTORE_SCENE_OPTIONS,
		);
		return {
			elements: restored.elements,
			files: restored.files ?? {},
		};
	}
	return { elements: [], files: {} };
}
