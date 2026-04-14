import type { OrderedExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import { describe, expect, it } from "vitest";
import { hasNonDeletedElements } from "../../src/lib/whiteboard-element-utils";

describe("hasNonDeletedElements", () => {
	it("returns false for empty array", () => {
		expect(hasNonDeletedElements([])).toBe(false);
	});

	it("returns false when every element is deleted", () => {
		expect(
			hasNonDeletedElements([
				{ isDeleted: true } as unknown as OrderedExcalidrawElement,
			]),
		).toBe(false);
	});

	it("returns true when at least one element is not deleted", () => {
		expect(
			hasNonDeletedElements([
				{ isDeleted: true } as unknown as OrderedExcalidrawElement,
				{ isDeleted: false } as unknown as OrderedExcalidrawElement,
			]),
		).toBe(true);
	});
});
