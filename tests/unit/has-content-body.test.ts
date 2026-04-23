import { describe, expect, it } from "vitest";
import {
	detectContentFormat,
	hasContentBody,
	parseAnyContentToSlate,
} from "../../src/lib/content-converters";

describe("hasContentBody", () => {
	it("returns false for null/undefined/empty strings", () => {
		expect(hasContentBody(null)).toBe(false);
		expect(hasContentBody(undefined)).toBe(false);
		expect(hasContentBody("")).toBe(false);
	});

	it("returns false for whitespace-only plain text", () => {
		expect(hasContentBody("   ")).toBe(false);
		expect(hasContentBody("\n\n  \t")).toBe(false);
	});

	it("returns true for plain text with any non-whitespace character", () => {
		expect(hasContentBody("hi")).toBe(true);
	});

	it("returns false for an empty Plate paragraph (baseline editor state)", () => {
		const empty = JSON.stringify([{ type: "p", children: [{ text: "" }] }]);
		expect(hasContentBody(empty)).toBe(false);
	});

	it("returns true when the description contains only an image (the bug case)", () => {
		const imageOnly = JSON.stringify([
			{
				type: "img",
				url: "https://uploadthing.example/abc",
				children: [{ text: "" }],
			},
		]);
		expect(hasContentBody(imageOnly)).toBe(true);
	});

	it("returns true for standalone image markdown `![alt](url)` (quick modal save path)", () => {
		expect(hasContentBody("![image.png](https://example.com/x.png)")).toBe(
			true,
		);
	});

	it("returns true for text + image markdown on separate lines", () => {
		expect(
			hasContentBody(
				"some notes\n\n![image.png](https://example.com/x.png)",
			),
		).toBe(true);
	});

	it("returns true for media wrapped in a paragraph", () => {
		const wrapped = JSON.stringify([
			{
				type: "p",
				children: [
					{ text: "" },
					{ type: "img", url: "x", children: [{ text: "" }] },
					{ text: "" },
				],
			},
		]);
		expect(hasContentBody(wrapped)).toBe(true);
	});

	it("returns true for a code block with no text (block is the content)", () => {
		const codeBlock = JSON.stringify([
			{ type: "code_block", children: [{ text: "" }] },
		]);
		expect(hasContentBody(codeBlock)).toBe(true);
	});

	it("returns true for text inside a nested list", () => {
		const list = JSON.stringify([
			{
				type: "ul",
				children: [
					{
						type: "li",
						children: [{ type: "lic", children: [{ text: "item" }] }],
					},
				],
			},
		]);
		expect(hasContentBody(list)).toBe(true);
	});

	it("returns false for an empty list whose leaves have no text", () => {
		const emptyList = JSON.stringify([
			{
				type: "ul",
				children: [
					{
						type: "li",
						children: [{ type: "lic", children: [{ text: "" }] }],
					},
				],
			},
		]);
		expect(hasContentBody(emptyList)).toBe(false);
	});
});

describe("render pipeline for image-only quick-modal descriptions", () => {
	const URL = "https://precise-schnauzer.convex.cloud/api/storage/abc";

	it("classifies standalone image markdown as markdown format", () => {
		expect(detectContentFormat(`![img.png](${URL})`)).toBe("markdown");
	});

	it("parses standalone image markdown into a top-level img Slate node", () => {
		const nodes = parseAnyContentToSlate(`![img.png](${URL})`);
		expect(nodes).toBeDefined();
		expect(nodes?.length).toBe(1);
		expect(nodes?.[0]).toMatchObject({ type: "img", url: URL });
	});

	it("parses text + image on separate lines into p then img", () => {
		const nodes = parseAnyContentToSlate(`some notes\n\n![img.png](${URL})`);
		expect(nodes).toBeDefined();
		expect(nodes?.length).toBe(2);
		expect((nodes?.[0] as { type: string }).type).toBe("p");
		expect(nodes?.[1]).toMatchObject({ type: "img", url: URL });
	});
});
