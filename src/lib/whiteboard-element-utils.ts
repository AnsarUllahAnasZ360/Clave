import type { OrderedExcalidrawElement } from "@excalidraw/excalidraw/element/types";

/** True if at least one element is not marked deleted (Excalidraw tombstones remain in the array). */
export function hasNonDeletedElements(
	elements: readonly OrderedExcalidrawElement[],
): boolean {
	return elements.some((el) => !el.isDeleted);
}
