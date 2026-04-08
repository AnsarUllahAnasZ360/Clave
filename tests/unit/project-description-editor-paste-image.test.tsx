import { describe, expect, it } from "vitest";
import {
	extractImageFilesFromClipboardData,
	extractImageFilesFromDataTransfer,
} from "@/components/project-wizard/ProjectDescriptionEditor";

describe("ProjectDescriptionEditor (create project) image file extraction", () => {
	it("extracts image files from clipboardData.items", () => {
		const image = new File(["img"], "pasted.png", { type: "image/png" });
		const text = new File(["txt"], "note.txt", { type: "text/plain" });

		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const files = extractImageFilesFromClipboardData({
			items: [
				{ kind: "file", type: "image/png", getAsFile: () => image },
				{ kind: "file", type: "text/plain", getAsFile: () => text },
			] as unknown as DataTransferItemList,
			files: [] as unknown as FileList,
		} as unknown as DataTransfer);

		expect(files).toEqual([image]);
	});

	it("falls back to clipboardData.files when items are unavailable", () => {
		const image = new File(["img"], "pasted.png", { type: "image/png" });
		const text = new File(["txt"], "note.txt", { type: "text/plain" });

		const files = extractImageFilesFromClipboardData({
			// biome-ignore lint/suspicious/noExplicitAny: test-only shape
			items: undefined as any,
			files: [image, text],
		} as unknown as DataTransfer);

		expect(files).toEqual([image]);
	});

	it("extracts image files from dataTransfer on drop", () => {
		const image = new File(["img"], "dropped.png", { type: "image/png" });
		const text = new File(["txt"], "note.txt", { type: "text/plain" });

		const files = extractImageFilesFromDataTransfer({
			files: [image, text],
		} as unknown as DataTransfer);

		expect(files).toEqual([image]);
	});
});
