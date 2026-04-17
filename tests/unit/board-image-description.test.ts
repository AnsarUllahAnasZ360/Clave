import { describe, expect, it } from "vitest";
import {
	buildBoardImagesMarkdown,
	mergeDescriptionWithBoardImages,
} from "../../convex/ai/boardImageDescription";

describe("buildBoardImagesMarkdown", () => {
	it("returns an empty string when there are no attachments", () => {
		expect(buildBoardImagesMarkdown([])).toBe("");
	});

	it("emits a markdown heading and image tags", () => {
		const md = buildBoardImagesMarkdown([
			{ url: "/api/whiteboard-image/abc", caption: "Architecture" },
			{ url: "/api/whiteboard-image/def" },
		]);
		expect(md).toContain("## Attached from whiteboard");
		expect(md).toContain("![Architecture](/api/whiteboard-image/abc)");
		expect(md).toContain("![Whiteboard image](/api/whiteboard-image/def)");
	});

	it("strips square brackets from captions to keep markdown alt text valid", () => {
		const md = buildBoardImagesMarkdown([
			{ url: "/api/whiteboard-image/a", caption: "Diagram [v2]" },
		]);
		expect(md).toContain("![Diagram v2](/api/whiteboard-image/a)");
	});
});

describe("mergeDescriptionWithBoardImages", () => {
	it("returns undefined when both description and attachments are empty", () => {
		expect(mergeDescriptionWithBoardImages(undefined, [])).toBeUndefined();
		expect(mergeDescriptionWithBoardImages("   ", [])).toBeUndefined();
	});

	it("returns the description unchanged when there are no attachments", () => {
		expect(mergeDescriptionWithBoardImages("Hello", [])).toBe("Hello");
	});

	it("returns just the image block when description is empty", () => {
		const merged = mergeDescriptionWithBoardImages(undefined, [
			{ url: "/api/whiteboard-image/x", caption: "flow" },
		]);
		expect(merged).toContain("## Attached from whiteboard");
		expect(merged).toContain("![flow](/api/whiteboard-image/x)");
		expect(merged?.startsWith("## Attached")).toBe(true);
	});

	it("prepends the image block to an existing description", () => {
		const merged = mergeDescriptionWithBoardImages("Existing body text", [
			{ url: "/api/whiteboard-image/x", caption: "flow" },
		]);
		expect(merged).toBeDefined();
		expect(merged?.indexOf("Attached from whiteboard")).toBeGreaterThan(-1);
		expect(merged?.indexOf("Existing body text")).toBeGreaterThan(
			merged?.indexOf("Attached from whiteboard") ?? 0,
		);
	});
});
