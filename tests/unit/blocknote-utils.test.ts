import { describe, expect, it } from "vitest";
import { extractTextFromContent } from "../../src/lib/content-converters";

describe("extractTextFromContent", () => {
	it("returns empty string for empty input", () => {
		expect(extractTextFromContent("")).toBe("");
	});

	it("returns plain text as-is", () => {
		expect(extractTextFromContent("Hello world")).toBe("Hello world");
	});

	it("extracts text from BlockNote JSON", () => {
		const content = JSON.stringify([
			{
				type: "paragraph",
				props: { textColor: "default" },
				content: [{ type: "text", text: "Hello from BlockNote" }],
				children: [],
			},
		]);
		expect(extractTextFromContent(content)).toBe("Hello from BlockNote");
	});

	it("extracts text from Slate JSON", () => {
		const content = JSON.stringify([
			{ type: "p", children: [{ text: "Hello from Slate" }] },
		]);
		expect(extractTextFromContent(content)).toBe("Hello from Slate");
	});

	it("extracts text from Slate JSON with headings and formatted text", () => {
		const content = JSON.stringify([
			{ type: "h1", children: [{ text: "Title" }] },
			{
				type: "p",
				children: [{ text: "Normal " }, { text: "bold", bold: true }],
			},
		]);
		expect(extractTextFromContent(content)).toBe("Title Normal bold");
	});

	it("extracts text from Slate JSON with mentions", () => {
		const content = JSON.stringify([
			{
				type: "p",
				children: [
					{ text: "Hello " },
					{ type: "mention", value: "Alice", children: [{ text: "" }] },
				],
			},
		]);
		expect(extractTextFromContent(content)).toBe("Hello @Alice");
	});

	it("extracts text from ProseMirror/TipTap JSON", () => {
		const content = JSON.stringify({
			type: "doc",
			content: [
				{
					type: "paragraph",
					content: [{ type: "text", text: "Hello from TipTap" }],
				},
			],
		});
		expect(extractTextFromContent(content)).toBe("Hello from TipTap");
	});

	it("returns raw string for invalid JSON", () => {
		expect(extractTextFromContent("{not valid")).toBe("{not valid");
	});
});
