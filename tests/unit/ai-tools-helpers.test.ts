import { describe, expect, it } from "vitest";
import {
	extractPlateMedia,
	MAX_CONTENT_LENGTH,
	plateJsonToMarkdown,
	plateJsonToPlainText,
	TOOL_TIMEOUT_MS,
	truncateAtBoundary,
	withTimeout,
} from "../../convex/ai/tools/helpers";

describe("ai/tools/helpers", () => {
	describe("constants", () => {
		it("exports expected timeout and content length values", () => {
			expect(TOOL_TIMEOUT_MS).toBe(30_000);
			expect(MAX_CONTENT_LENGTH).toBe(4000);
		});
	});

	describe("withTimeout", () => {
		it("resolves when promise completes before timeout", async () => {
			const result = await withTimeout(
				Promise.resolve("ok"),
				1000,
				"test-label",
			);
			expect(result).toBe("ok");
		});

		it("rejects when promise exceeds timeout", async () => {
			const slow = new Promise((resolve) => setTimeout(resolve, 5000));
			await expect(withTimeout(slow, 50, "slow-op")).rejects.toThrow(
				/Tool timeout.*"slow-op"/,
			);
		});

		it("preserves the original rejection if promise fails before timeout", async () => {
			const failing = Promise.reject(new Error("original error"));
			await expect(withTimeout(failing, 5000, "test")).rejects.toThrow(
				"original error",
			);
		});
	});

	describe("truncateAtBoundary", () => {
		it("returns text unchanged if within limit", () => {
			const text = "Short text.";
			expect(truncateAtBoundary(text, 100)).toBe(text);
		});

		it("breaks at paragraph boundary when available", () => {
			const text = "Paragraph one.\n\nParagraph two.\n\nParagraph three.";
			const result = truncateAtBoundary(text, 35);
			expect(result).toBe("Paragraph one.\n\nParagraph two.");
		});

		it("breaks at newline when no paragraph boundary", () => {
			const text = "Line one.\nLine two.\nLine three is longer than expected.";
			const result = truncateAtBoundary(text, 30);
			expect(result).toBe("Line one.\nLine two.");
		});

		it("breaks at sentence boundary when no newline", () => {
			const text =
				"First sentence. Second sentence. Third sentence is very long.";
			const result = truncateAtBoundary(text, 40);
			expect(result).toBe("First sentence. Second sentence.");
		});

		it("breaks at word boundary as fallback", () => {
			const text = "word1 word2 word3 word4 word5 word6 word7";
			const result = truncateAtBoundary(text, 25);
			expect(result).toBe("word1 word2 word3 word4");
		});

		it("hard cuts when no natural boundary exists", () => {
			const text = "a".repeat(100);
			const result = truncateAtBoundary(text, 50);
			expect(result.length).toBe(50);
		});
	});

	describe("plateJsonToPlainText", () => {
		it("returns empty string for undefined or empty input", () => {
			expect(plateJsonToPlainText(undefined)).toBe("");
			expect(plateJsonToPlainText("")).toBe("");
		});

		it("returns plain text as-is when input is not valid JSON", () => {
			expect(plateJsonToPlainText("Hello world")).toBe("Hello world");
		});

		it("extracts text from simple paragraph nodes", () => {
			const doc = {
				type: "doc",
				children: [
					{
						type: "paragraph",
						children: [{ text: "Hello world" }],
					},
				],
			};
			expect(plateJsonToPlainText(JSON.stringify(doc))).toBe("Hello world");
		});

		it("handles nested children with paragraph breaks", () => {
			const doc = {
				type: "doc",
				children: [
					{
						type: "paragraph",
						children: [{ text: "First paragraph" }],
					},
					{
						type: "paragraph",
						children: [{ text: "Second paragraph" }],
					},
				],
			};
			const result = plateJsonToPlainText(JSON.stringify(doc));
			expect(result).toContain("First paragraph");
			expect(result).toContain("Second paragraph");
		});

		it("handles hardBreak nodes", () => {
			const doc = {
				type: "doc",
				children: [
					{
						type: "paragraph",
						children: [
							{ text: "Line one" },
							{ type: "hardBreak" },
							{ text: "Line two" },
						],
					},
				],
			};
			const result = plateJsonToPlainText(JSON.stringify(doc));
			expect(result).toContain("Line one");
			expect(result).toContain("Line two");
		});

		it("handles hard_break (ProseMirror variant)", () => {
			const doc = {
				type: "doc",
				content: [
					{
						type: "paragraph",
						content: [
							{ text: "Line one" },
							{ type: "hard_break" },
							{ text: "Line two" },
						],
					},
				],
			};
			const result = plateJsonToPlainText(JSON.stringify(doc));
			expect(result).toContain("Line one");
			expect(result).toContain("Line two");
		});

		it("handles heading nodes", () => {
			const doc = {
				type: "doc",
				children: [
					{
						type: "heading",
						children: [{ text: "Title" }],
					},
					{
						type: "paragraph",
						children: [{ text: "Body" }],
					},
				],
			};
			const result = plateJsonToPlainText(JSON.stringify(doc));
			expect(result).toContain("Title");
			expect(result).toContain("Body");
		});

		it("handles blockquote nodes", () => {
			const doc = {
				type: "doc",
				children: [
					{
						type: "blockquote",
						children: [
							{
								type: "paragraph",
								children: [{ text: "Quoted text" }],
							},
						],
					},
				],
			};
			const result = plateJsonToPlainText(JSON.stringify(doc));
			expect(result).toContain("Quoted text");
		});

		it("collapses multiple newlines", () => {
			const doc = {
				type: "doc",
				children: [
					{ type: "paragraph", children: [{ text: "A" }] },
					{ type: "paragraph", children: [{ text: "" }] },
					{ type: "paragraph", children: [{ text: "" }] },
					{ type: "paragraph", children: [{ text: "B" }] },
				],
			};
			const result = plateJsonToPlainText(JSON.stringify(doc));
			expect(result).not.toContain("\n\n\n");
		});
	});

	describe("plateJsonToMarkdown", () => {
		it("returns empty string for undefined or empty input", () => {
			expect(plateJsonToMarkdown(undefined)).toBe("");
			expect(plateJsonToMarkdown("")).toBe("");
		});

		it("renders headings with the correct level", () => {
			const doc = {
				type: "doc",
				children: [
					{ type: "h1", children: [{ text: "Title" }] },
					{ type: "h3", children: [{ text: "Sub" }] },
				],
			};
			const md = plateJsonToMarkdown(JSON.stringify(doc));
			expect(md).toContain("# Title");
			expect(md).toContain("### Sub");
		});

		it("handles Slate/Yjs flat array format (no root wrapper)", () => {
			const nodes = [
				{ type: "h1", children: [{ text: "Sprint Plan" }] },
				{ type: "p", children: [{ text: "Details here." }] },
			];
			const md = plateJsonToMarkdown(JSON.stringify(nodes));
			expect(md).toContain("# Sprint Plan");
			expect(md).toContain("Details here.");
		});

		it("handles root with no type but with children (Yjs extraction)", () => {
			const doc = {
				children: [{ type: "p", children: [{ text: "From Yjs." }] }],
			};
			const md = plateJsonToMarkdown(JSON.stringify(doc));
			expect(md).toContain("From Yjs.");
		});

		it("preserves bold, italic, and inline code marks", () => {
			const doc = {
				type: "doc",
				children: [
					{
						type: "p",
						children: [
							{ text: "hello " },
							{ text: "world", bold: true },
							{ text: " " },
							{ text: "x", italic: true },
							{ text: " " },
							{ text: "y", code: true },
						],
					},
				],
			};
			const md = plateJsonToMarkdown(JSON.stringify(doc));
			expect(md).toContain("**world**");
			expect(md).toContain("*x*");
			expect(md).toContain("`y`");
		});

		it("renders images as markdown with url and alt", () => {
			const doc = {
				type: "doc",
				children: [
					{
						type: "img",
						url: "https://uploadthing.com/f/abc.png",
						alt: "Diagram",
						children: [{ text: "" }],
					},
				],
			};
			const md = plateJsonToMarkdown(JSON.stringify(doc));
			expect(md).toContain("![Diagram](https://uploadthing.com/f/abc.png)");
		});

		it("renders bullet and numbered lists", () => {
			const doc = {
				type: "doc",
				children: [
					{
						type: "ul",
						children: [
							{ type: "li", children: [{ text: "one" }] },
							{ type: "li", children: [{ text: "two" }] },
						],
					},
					{
						type: "ol",
						children: [
							{ type: "li", children: [{ text: "first" }] },
							{ type: "li", children: [{ text: "second" }] },
						],
					},
				],
			};
			const md = plateJsonToMarkdown(JSON.stringify(doc));
			expect(md).toContain("- one");
			expect(md).toContain("- two");
			expect(md).toContain("1. first");
			expect(md).toContain("2. second");
		});

		it("renders tables with header separator row", () => {
			const doc = {
				type: "doc",
				children: [
					{
						type: "table",
						children: [
							{
								type: "tr",
								children: [
									{ type: "td", children: [{ text: "Name" }] },
									{ type: "td", children: [{ text: "Owner" }] },
								],
							},
							{
								type: "tr",
								children: [
									{ type: "td", children: [{ text: "Auth" }] },
									{ type: "td", children: [{ text: "Alice" }] },
								],
							},
						],
					},
				],
			};
			const md = plateJsonToMarkdown(JSON.stringify(doc));
			expect(md).toContain("| Name | Owner |");
			expect(md).toContain("| --- | --- |");
			expect(md).toContain("| Auth | Alice |");
		});

		it("renders code blocks with language fence", () => {
			const doc = {
				type: "doc",
				children: [
					{
						type: "code_block",
						lang: "ts",
						children: [
							{ type: "code_line", children: [{ text: "const x = 1;" }] },
						],
					},
				],
			};
			const md = plateJsonToMarkdown(JSON.stringify(doc));
			expect(md).toContain("```ts");
			expect(md).toContain("const x = 1;");
			expect(md).toContain("```");
		});

		it("renders links inline", () => {
			const doc = {
				type: "doc",
				children: [
					{
						type: "p",
						children: [
							{ text: "see " },
							{
								type: "a",
								url: "https://clave.dev",
								children: [{ text: "docs" }],
							},
						],
					},
				],
			};
			const md = plateJsonToMarkdown(JSON.stringify(doc));
			expect(md).toContain("[docs](https://clave.dev)");
		});
	});

	describe("extractPlateMedia", () => {
		it("returns empty arrays for undefined input", () => {
			expect(extractPlateMedia(undefined)).toEqual({
				images: [],
				tables: [],
			});
		});

		it("collects all image URLs with alt text", () => {
			const doc = {
				type: "doc",
				children: [
					{
						type: "img",
						url: "https://x/1.png",
						alt: "one",
						children: [{ text: "" }],
					},
					{
						type: "p",
						children: [
							{
								type: "image",
								url: "https://x/2.png",
								caption: "two",
								children: [{ text: "" }],
							},
						],
					},
				],
			};
			const media = extractPlateMedia(JSON.stringify(doc));
			expect(media.images).toHaveLength(2);
			expect(media.images[0]).toEqual({ url: "https://x/1.png", alt: "one" });
			expect(media.images[1]).toEqual({ url: "https://x/2.png", alt: "two" });
		});

		it("summarizes tables by row and column count", () => {
			const doc = {
				type: "doc",
				children: [
					{
						type: "table",
						children: [
							{
								type: "tr",
								children: [
									{ type: "td", children: [{ text: "a" }] },
									{ type: "td", children: [{ text: "b" }] },
									{ type: "td", children: [{ text: "c" }] },
								],
							},
							{
								type: "tr",
								children: [
									{ type: "td", children: [{ text: "1" }] },
									{ type: "td", children: [{ text: "2" }] },
									{ type: "td", children: [{ text: "3" }] },
								],
							},
						],
					},
				],
			};
			const media = extractPlateMedia(JSON.stringify(doc));
			expect(media.tables).toEqual([{ rows: 2, cols: 3 }]);
		});
	});
});
