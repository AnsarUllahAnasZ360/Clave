import { describe, expect, it } from "vitest";
import {
	blockNoteToSlate,
	detectContentFormat,
	extractTextFromSlate,
	looksLikeMarkdown,
	markdownToSlate,
	parseAnyContentToSlate,
	plainTextToSlate,
	prosemirrorToSlate,
} from "../../src/lib/content-converters";

// ---------------------------------------------------------------------------
// Helper to build a BlockNote-style PM doc
// ---------------------------------------------------------------------------

function pmDoc(...children: unknown[]) {
	return { type: "doc", content: children };
}

function blockGroup(...children: unknown[]) {
	return { type: "blockGroup", content: children };
}

function blockContainer(
	attrs: Record<string, unknown>,
	...children: unknown[]
) {
	return { type: "blockContainer", attrs, content: children };
}

function paragraph(...content: unknown[]) {
	return { type: "paragraph", content };
}

function heading(level: number, ...content: unknown[]) {
	return { type: "heading", attrs: { level }, content };
}

function text(value: string, marks?: unknown[]) {
	return { type: "text", text: value, marks };
}

// ---------------------------------------------------------------------------
// prosemirrorToSlate
// ---------------------------------------------------------------------------

describe("prosemirrorToSlate", () => {
	// ── Basic structure ──────────────────────────────────────────────────

	it("returns empty paragraph for null/undefined input", () => {
		expect(prosemirrorToSlate(null as never)).toEqual([
			{ type: "p", children: [{ text: "" }] },
		]);
		expect(prosemirrorToSlate(undefined as never)).toEqual([
			{ type: "p", children: [{ text: "" }] },
		]);
	});

	it("returns empty paragraph for non-doc object", () => {
		expect(prosemirrorToSlate({ type: "invalid" })).toEqual([
			{ type: "p", children: [{ text: "" }] },
		]);
	});

	it("returns empty paragraph for doc with no content", () => {
		expect(prosemirrorToSlate({ type: "doc" })).toEqual([
			{ type: "p", children: [{ text: "" }] },
		]);
	});

	it("returns empty paragraph for doc with empty content array", () => {
		expect(prosemirrorToSlate({ type: "doc", content: [] })).toEqual([
			{ type: "p", children: [{ text: "" }] },
		]);
	});

	// ── Paragraphs ───────────────────────────────────────────────────────

	it("converts a simple paragraph", () => {
		const doc = pmDoc(
			blockGroup(blockContainer({ id: "1" }, paragraph(text("Hello world")))),
		);
		expect(prosemirrorToSlate(doc as never)).toEqual([
			{
				type: "p",
				id: "1",
				children: [{ text: "Hello world" }],
			},
		]);
	});

	it("converts paragraph with formatted text", () => {
		const doc = pmDoc(
			blockGroup(
				blockContainer(
					{ id: "1" },
					paragraph(
						text("bold", [{ type: "bold" }]),
						text(" and "),
						text("italic", [{ type: "italic" }]),
					),
				),
			),
		);
		const result = prosemirrorToSlate(doc as never);
		expect(result).toEqual([
			{
				type: "p",
				id: "1",
				children: [
					{ text: "bold", bold: true },
					{ text: " and " },
					{ text: "italic", italic: true },
				],
			},
		]);
	});

	it("converts paragraph with all mark types", () => {
		const doc = pmDoc(
			blockGroup(
				blockContainer(
					{ id: "1" },
					paragraph(
						text("text", [
							{ type: "bold" },
							{ type: "italic" },
							{ type: "underline" },
							{ type: "strike" },
							{ type: "code" },
							{ type: "highlight" },
							{ type: "superscript" },
							{ type: "subscript" },
							{ type: "kbd" },
						]),
					),
				),
			),
		);
		const result = prosemirrorToSlate(doc as never);
		expect(result[0].children[0]).toEqual({
			text: "text",
			bold: true,
			italic: true,
			underline: true,
			strikethrough: true,
			code: true,
			highlight: true,
			superscript: true,
			subscript: true,
			kbd: true,
		});
	});

	// ── Headings ─────────────────────────────────────────────────────────

	it("converts headings at all levels", () => {
		const doc = pmDoc(
			blockGroup(
				blockContainer({ id: "1" }, heading(1, text("H1"))),
				blockContainer({ id: "2" }, heading(2, text("H2"))),
				blockContainer({ id: "3" }, heading(3, text("H3"))),
				blockContainer({ id: "4" }, heading(4, text("H4"))),
				blockContainer({ id: "5" }, heading(5, text("H5"))),
				blockContainer({ id: "6" }, heading(6, text("H6"))),
			),
		);
		const result = prosemirrorToSlate(doc as never);
		expect(result).toHaveLength(6);
		expect(result[0]).toEqual({
			type: "h1",
			id: "1",
			children: [{ text: "H1" }],
		});
		expect(result[1]).toEqual({
			type: "h2",
			id: "2",
			children: [{ text: "H2" }],
		});
		expect(result[2]).toEqual({
			type: "h3",
			id: "3",
			children: [{ text: "H3" }],
		});
		expect(result[3]).toEqual({
			type: "h4",
			id: "4",
			children: [{ text: "H4" }],
		});
		expect(result[4]).toEqual({
			type: "h5",
			id: "5",
			children: [{ text: "H5" }],
		});
		expect(result[5]).toEqual({
			type: "h6",
			id: "6",
			children: [{ text: "H6" }],
		});
	});

	it("clamps heading level to 1-6", () => {
		const doc = pmDoc(
			blockGroup(
				blockContainer({ id: "1" }, heading(0, text("Low"))),
				blockContainer({ id: "2" }, heading(99, text("High"))),
			),
		);
		const result = prosemirrorToSlate(doc as never);
		expect(result[0].type).toBe("h1");
		expect(result[1].type).toBe("h6");
	});

	// ── Lists ────────────────────────────────────────────────────────────

	it("converts bullet list items", () => {
		const doc = pmDoc(
			blockGroup(
				blockContainer(
					{ id: "1" },
					{ type: "bulletListItem", content: [text("Item 1")] },
				),
				blockContainer(
					{ id: "2" },
					{ type: "bulletListItem", content: [text("Item 2")] },
				),
			),
		);
		const result = prosemirrorToSlate(doc as never);
		expect(result).toEqual([
			{
				type: "p",
				id: "1",
				indent: 1,
				listStyleType: "disc",
				children: [{ text: "Item 1" }],
			},
			{
				type: "p",
				id: "2",
				indent: 1,
				listStyleType: "disc",
				children: [{ text: "Item 2" }],
			},
		]);
	});

	it("converts numbered list items", () => {
		const doc = pmDoc(
			blockGroup(
				blockContainer(
					{ id: "1" },
					{ type: "numberedListItem", content: [text("First")] },
				),
			),
		);
		const result = prosemirrorToSlate(doc as never);
		expect(result[0]).toMatchObject({
			type: "p",
			indent: 1,
			listStyleType: "decimal",
		});
	});

	it("converts check list items", () => {
		const doc = pmDoc(
			blockGroup(
				blockContainer(
					{ id: "1" },
					{
						type: "checkListItem",
						attrs: { checked: true },
						content: [text("Done")],
					},
				),
				blockContainer(
					{ id: "2" },
					{
						type: "checkListItem",
						attrs: { checked: false },
						content: [text("Todo")],
					},
				),
			),
		);
		const result = prosemirrorToSlate(doc as never);
		expect(result[0]).toMatchObject({
			listStyleType: "todo",
			checked: true,
		});
		expect(result[1]).toMatchObject({
			listStyleType: "todo",
			checked: false,
		});
	});

	it("handles nested list items with increased indent", () => {
		const doc = pmDoc(
			blockGroup(
				blockContainer(
					{ id: "1" },
					{ type: "bulletListItem", content: [text("Parent")] },
					blockGroup(
						blockContainer(
							{ id: "2" },
							{ type: "bulletListItem", content: [text("Child")] },
							blockGroup(
								blockContainer(
									{ id: "3" },
									{
										type: "bulletListItem",
										content: [text("Grandchild")],
									},
								),
							),
						),
					),
				),
			),
		);
		const result = prosemirrorToSlate(doc as never);
		expect(result).toHaveLength(3);
		// depth 0 → indent 1 (minimum)
		expect(result[0].indent).toBe(1);
		// depth 1 → indent 1
		expect(result[1].indent).toBe(1);
		// depth 2 → indent 2
		expect(result[2].indent).toBe(2);
	});

	// ── Code blocks ──────────────────────────────────────────────────────

	it("converts code block with language", () => {
		const doc = pmDoc(
			blockGroup(
				blockContainer(
					{ id: "1" },
					{
						type: "codeBlock",
						attrs: { language: "typescript" },
						content: [text("const x = 1;\nconst y = 2;")],
					},
				),
			),
		);
		const result = prosemirrorToSlate(doc as never);
		expect(result[0]).toEqual({
			type: "code_block",
			id: "1",
			lang: "typescript",
			children: [
				{ type: "code_line", children: [{ text: "const x = 1;" }] },
				{ type: "code_line", children: [{ text: "const y = 2;" }] },
			],
		});
	});

	it("converts empty code block", () => {
		const doc = pmDoc(
			blockGroup(blockContainer({ id: "1" }, { type: "codeBlock", attrs: {} })),
		);
		const result = prosemirrorToSlate(doc as never);
		expect(result[0].type).toBe("code_block");
		expect(result[0].children).toEqual([
			{ type: "code_line", children: [{ text: "" }] },
		]);
	});

	// ── Images ───────────────────────────────────────────────────────────

	it("converts image with URL", () => {
		const doc = pmDoc(
			blockGroup(
				blockContainer(
					{ id: "1" },
					{
						type: "image",
						attrs: {
							url: "https://example.com/img.png",
							caption: "My image",
							width: 400,
						},
					},
				),
			),
		);
		const result = prosemirrorToSlate(doc as never);
		expect(result[0]).toEqual({
			type: "img",
			id: "1",
			url: "https://example.com/img.png",
			caption: "My image",
			width: 400,
			children: [{ text: "" }],
		});
	});

	it("converts image with src attr (fallback)", () => {
		const doc = pmDoc(
			blockGroup(
				blockContainer(
					{ id: "1" },
					{ type: "image", attrs: { src: "https://example.com/img.png" } },
				),
			),
		);
		const result = prosemirrorToSlate(doc as never);
		expect(result[0].url).toBe("https://example.com/img.png");
	});

	// ── Videos ───────────────────────────────────────────────────────────

	it("converts video with URL", () => {
		const doc = pmDoc(
			blockGroup(
				blockContainer(
					{ id: "1" },
					{
						type: "video",
						attrs: { url: "https://example.com/video.mp4" },
					},
				),
			),
		);
		const result = prosemirrorToSlate(doc as never);
		expect(result[0]).toMatchObject({
			type: "video",
			url: "https://example.com/video.mp4",
		});
	});

	// ── Blockquotes ──────────────────────────────────────────────────────

	it("converts blockquote with inline content", () => {
		const doc = pmDoc(
			blockGroup(
				blockContainer(
					{ id: "1" },
					{ type: "blockquote", content: [text("Quote text")] },
				),
			),
		);
		const result = prosemirrorToSlate(doc as never);
		expect(result[0]).toEqual({
			type: "blockquote",
			id: "1",
			children: [{ type: "p", children: [{ text: "Quote text" }] }],
		});
	});

	// ── Horizontal rules ─────────────────────────────────────────────────

	it("converts horizontal rule", () => {
		const doc = pmDoc(
			blockGroup(blockContainer({ id: "1" }, { type: "horizontalRule" })),
		);
		const result = prosemirrorToSlate(doc as never);
		expect(result[0]).toEqual({
			type: "hr",
			children: [{ text: "" }],
		});
	});

	// ── Tables ───────────────────────────────────────────────────────────

	it("converts table with headers and cells", () => {
		const doc = pmDoc(
			blockGroup(
				blockContainer(
					{ id: "t1" },
					{
						type: "table",
						content: [
							{
								type: "tableRow",
								content: [
									{
										type: "tableHeader",
										content: [paragraph(text("Name"))],
									},
									{
										type: "tableHeader",
										content: [paragraph(text("Age"))],
									},
								],
							},
							{
								type: "tableRow",
								content: [
									{
										type: "tableCell",
										content: [paragraph(text("Alice"))],
									},
									{
										type: "tableCell",
										content: [paragraph(text("30"))],
									},
								],
							},
						],
					},
				),
			),
		);
		const result = prosemirrorToSlate(doc as never);
		expect(result[0]).toEqual({
			type: "table",
			id: "t1",
			children: [
				{
					type: "tr",
					children: [
						{
							type: "th",
							children: [{ type: "p", children: [{ text: "Name" }] }],
						},
						{
							type: "th",
							children: [{ type: "p", children: [{ text: "Age" }] }],
						},
					],
				},
				{
					type: "tr",
					children: [
						{
							type: "td",
							children: [{ type: "p", children: [{ text: "Alice" }] }],
						},
						{
							type: "td",
							children: [{ type: "p", children: [{ text: "30" }] }],
						},
					],
				},
			],
		});
	});

	it("preserves colspan and rowspan on table cells", () => {
		const doc = pmDoc(
			blockGroup(
				blockContainer(
					{ id: "t1" },
					{
						type: "table",
						content: [
							{
								type: "tableRow",
								content: [
									{
										type: "tableCell",
										attrs: { colspan: 2, rowspan: 1 },
										content: [paragraph(text("Wide cell"))],
									},
								],
							},
						],
					},
				),
			),
		);
		const result = prosemirrorToSlate(doc as never);
		expect(result[0].children[0].children[0].colSpan).toBe(2);
		// rowspan=1 is default, should not be added
		expect(result[0].children[0].children[0].rowSpan).toBeUndefined();
	});

	// ── Links ────────────────────────────────────────────────────────────

	it("converts links with href", () => {
		const doc = pmDoc(
			blockGroup(
				blockContainer(
					{ id: "1" },
					paragraph(
						text("Click "),
						text("here", [
							{ type: "link", attrs: { href: "https://example.com" } },
						]),
					),
				),
			),
		);
		const result = prosemirrorToSlate(doc as never);
		expect(result[0].children).toEqual([
			{ text: "Click " },
			{
				type: "a",
				url: "https://example.com",
				children: [{ text: "here" }],
			},
		]);
	});

	it("preserves formatting marks on linked text", () => {
		const doc = pmDoc(
			blockGroup(
				blockContainer(
					{ id: "1" },
					paragraph(
						text("link", [
							{ type: "bold" },
							{ type: "link", attrs: { href: "https://example.com" } },
						]),
					),
				),
			),
		);
		const result = prosemirrorToSlate(doc as never);
		// Link wraps the formatted text
		expect(result[0].children[0]).toMatchObject({
			type: "a",
			url: "https://example.com",
		});
		expect(result[0].children[0].children[0]).toMatchObject({
			text: "link",
			bold: true,
		});
	});

	// ── Comment marks ────────────────────────────────────────────────────

	it("converts comment marks to Plate comment_id format", () => {
		const doc = pmDoc(
			blockGroup(
				blockContainer(
					{ id: "1" },
					paragraph(
						text("commented", [
							{ type: "comment", attrs: { id: "thread-123" } },
						]),
					),
				),
			),
		);
		const result = prosemirrorToSlate(doc as never);
		expect(result[0].children[0]).toEqual({
			text: "commented",
			"comment_thread-123": true,
		});
	});

	it("handles comment marks with threadId attr", () => {
		const doc = pmDoc(
			blockGroup(
				blockContainer(
					{ id: "1" },
					paragraph(
						text("text", [{ type: "comment", attrs: { threadId: "abc-456" } }]),
					),
				),
			),
		);
		const result = prosemirrorToSlate(doc as never);
		expect(result[0].children[0]["comment_abc-456"]).toBe(true);
	});

	// ── Text colors ──────────────────────────────────────────────────────

	it("converts text color marks", () => {
		const doc = pmDoc(
			blockGroup(
				blockContainer(
					{ id: "1" },
					paragraph(
						text("red", [{ type: "textColor", attrs: { color: "red" } }]),
					),
				),
			),
		);
		const result = prosemirrorToSlate(doc as never);
		expect(result[0].children[0]).toEqual({
			text: "red",
			color: "red",
		});
	});

	it("converts background color marks", () => {
		const doc = pmDoc(
			blockGroup(
				blockContainer(
					{ id: "1" },
					paragraph(
						text("highlighted", [
							{
								type: "backgroundColor",
								attrs: { color: "yellow" },
							},
						]),
					),
				),
			),
		);
		const result = prosemirrorToSlate(doc as never);
		expect(result[0].children[0]).toEqual({
			text: "highlighted",
			backgroundColor: "yellow",
		});
	});

	it("ignores default text color values", () => {
		const doc = pmDoc(
			blockGroup(
				blockContainer(
					{ id: "1" },
					paragraph(
						text("default", [
							{ type: "textColor", attrs: { color: "default" } },
						]),
					),
				),
			),
		);
		const result = prosemirrorToSlate(doc as never);
		expect(result[0].children[0]).toEqual({ text: "default" });
	});

	// ── Text alignment ───────────────────────────────────────────────────

	it("converts text alignment", () => {
		const doc = pmDoc(
			blockGroup(
				blockContainer(
					{ id: "1", textAlignment: "center" },
					paragraph(text("Centered")),
				),
			),
		);
		const result = prosemirrorToSlate(doc as never);
		expect(result[0].textAlign).toBe("center");
	});

	it("ignores left alignment (default)", () => {
		const doc = pmDoc(
			blockGroup(
				blockContainer(
					{ id: "1", textAlignment: "left" },
					paragraph(text("Left")),
				),
			),
		);
		const result = prosemirrorToSlate(doc as never);
		expect(result[0].textAlign).toBeUndefined();
	});

	// ── Block colors ─────────────────────────────────────────────────────

	it("applies block-level text and background colors from container", () => {
		const doc = pmDoc(
			blockGroup(
				blockContainer(
					{ id: "1", textColor: "blue", backgroundColor: "yellow" },
					paragraph(text("Colored")),
				),
			),
		);
		const result = prosemirrorToSlate(doc as never);
		expect(result[0].color).toBe("blue");
		expect(result[0].backgroundColor).toBe("yellow");
	});

	it("ignores default block colors", () => {
		const doc = pmDoc(
			blockGroup(
				blockContainer(
					{ id: "1", textColor: "default", backgroundColor: "default" },
					paragraph(text("Default")),
				),
			),
		);
		const result = prosemirrorToSlate(doc as never);
		expect(result[0].color).toBeUndefined();
		expect(result[0].backgroundColor).toBeUndefined();
	});

	// ── Hard breaks ──────────────────────────────────────────────────────

	it("converts hard breaks to newline text", () => {
		const doc = pmDoc(
			blockGroup(
				blockContainer(
					{ id: "1" },
					paragraph(text("Line 1"), { type: "hardBreak" }, text("Line 2")),
				),
			),
		);
		const result = prosemirrorToSlate(doc as never);
		expect(result[0].children).toEqual([
			{ text: "Line 1" },
			{ text: "\n" },
			{ text: "Line 2" },
		]);
	});

	// ── Inline mentions ──────────────────────────────────────────────────

	it("converts inline mention nodes", () => {
		const doc = pmDoc(
			blockGroup(
				blockContainer(
					{ id: "1" },
					paragraph(text("Hello "), {
						type: "mention",
						attrs: { name: "Alice", userId: "user-123" },
					}),
				),
			),
		);
		const result = prosemirrorToSlate(doc as never);
		expect(result[0].children[1]).toEqual({
			type: "mention",
			value: "Alice",
			userId: "user-123",
			children: [{ text: "" }],
		});
	});

	// ── Unknown node types ───────────────────────────────────────────────

	it("converts unknown block types as paragraphs", () => {
		const doc = pmDoc(
			blockGroup(
				blockContainer(
					{ id: "1" },
					{ type: "customWidget", content: [text("Widget text")] },
				),
			),
		);
		const result = prosemirrorToSlate(doc as never);
		expect(result[0]).toEqual({
			type: "p",
			children: [{ text: "Widget text" }],
		});
	});

	it("handles unknown nodes with no content gracefully", () => {
		const doc = pmDoc(
			blockGroup(blockContainer({ id: "1" }, { type: "unknownVoid" })),
		);
		const result = prosemirrorToSlate(doc as never);
		expect(result[0]).toEqual({
			type: "p",
			children: [{ text: "" }],
		});
	});

	// ── Mixed content document ───────────────────────────────────────────

	it("converts a mixed content document", () => {
		const doc = pmDoc(
			blockGroup(
				blockContainer({ id: "1" }, heading(1, text("Title"))),
				blockContainer(
					{ id: "2" },
					paragraph(text("Hello "), text("world", [{ type: "bold" }])),
				),
				blockContainer(
					{ id: "3" },
					{ type: "bulletListItem", content: [text("Item A")] },
				),
				blockContainer(
					{ id: "4" },
					{
						type: "image",
						attrs: { url: "https://example.com/img.png" },
					},
				),
				blockContainer({ id: "5" }, { type: "horizontalRule" }),
				blockContainer(
					{ id: "6" },
					{
						type: "codeBlock",
						attrs: { language: "js" },
						content: [text("console.log('hi')")],
					},
				),
			),
		);
		const result = prosemirrorToSlate(doc as never);
		expect(result).toHaveLength(6);
		expect(result[0].type).toBe("h1");
		expect(result[1].type).toBe("p");
		expect(result[2].listStyleType).toBe("disc");
		expect(result[3].type).toBe("img");
		expect(result[4].type).toBe("hr");
		expect(result[5].type).toBe("code_block");
	});

	// ── Direct PM doc (non-BlockNote) ────────────────────────────────────

	it("handles direct PM doc without BlockNote wrappers", () => {
		const doc = {
			type: "doc",
			content: [
				{ type: "paragraph", content: [text("Direct paragraph")] },
				{ type: "heading", attrs: { level: 2 }, content: [text("H2")] },
			],
		};
		const result = prosemirrorToSlate(doc as never);
		expect(result).toHaveLength(2);
		expect(result[0]).toEqual({
			type: "p",
			children: [{ text: "Direct paragraph" }],
		});
		expect(result[1]).toEqual({
			type: "h2",
			children: [{ text: "H2" }],
		});
	});
});

// ---------------------------------------------------------------------------
// detectContentFormat
// ---------------------------------------------------------------------------

describe("detectContentFormat", () => {
	it("detects Slate JSON", () => {
		const content = JSON.stringify([
			{ type: "p", children: [{ text: "Hello" }] },
		]);
		expect(detectContentFormat(content)).toBe("slate");
	});

	it("detects ProseMirror JSON", () => {
		const content = JSON.stringify({
			type: "doc",
			content: [{ type: "paragraph", content: [] }],
		});
		expect(detectContentFormat(content)).toBe("prosemirror");
	});

	it("detects BlockNote JSON", () => {
		const content = JSON.stringify([
			{
				type: "paragraph",
				props: { textColor: "default" },
				content: [{ type: "text", text: "Hello" }],
				children: [],
			},
		]);
		expect(detectContentFormat(content)).toBe("blocknote");
	});

	it("detects plain text", () => {
		expect(detectContentFormat("Just some text")).toBe("plain");
	});

	it("detects plain text for invalid JSON", () => {
		expect(detectContentFormat("{invalid json")).toBe("plain");
	});

	it("detects markdown with headings and lists", () => {
		const md = "# Title\n\n- Item 1\n- Item 2\n\nSome text";
		expect(detectContentFormat(md)).toBe("markdown");
	});

	it("detects markdown with tables", () => {
		const md =
			"# Report\n\n| Name | Value |\n| --- | --- |\n| A | 1 |\n| B | 2 |";
		expect(detectContentFormat(md)).toBe("markdown");
	});

	it("does not detect single-signal text as markdown", () => {
		// Only one heading, not enough signals
		expect(detectContentFormat("# Just a heading")).toBe("plain");
	});
});

// ---------------------------------------------------------------------------
// blockNoteToSlate
// ---------------------------------------------------------------------------

describe("blockNoteToSlate", () => {
	// ── Basic structure ──────────────────────────────────────────────────

	it("returns empty paragraph for null/undefined input", () => {
		const empty = [{ type: "p", children: [{ text: "" }] }];
		expect(blockNoteToSlate(null as never)).toEqual(empty);
		expect(blockNoteToSlate(undefined as never)).toEqual(empty);
		expect(blockNoteToSlate([])).toEqual(empty);
	});

	// ── Paragraphs ───────────────────────────────────────────────────────

	it("converts a simple paragraph", () => {
		const blocks = [
			{
				type: "paragraph",
				props: {},
				content: [{ type: "text", text: "Hello world" }],
				children: [],
			},
		];
		expect(blockNoteToSlate(blocks)).toEqual([
			{ type: "p", children: [{ text: "Hello world" }] },
		]);
	});

	it("converts paragraph with text alignment", () => {
		const blocks = [
			{
				type: "paragraph",
				props: { textAlignment: "center" },
				content: [{ type: "text", text: "Centered" }],
				children: [],
			},
		];
		const result = blockNoteToSlate(blocks);
		expect(result[0].textAlign).toBe("center");
	});

	it("converts paragraph with block colors", () => {
		const blocks = [
			{
				type: "paragraph",
				props: { textColor: "red", backgroundColor: "yellow" },
				content: [{ type: "text", text: "Colored" }],
				children: [],
			},
		];
		const result = blockNoteToSlate(blocks);
		expect(result[0].color).toBe("red");
		expect(result[0].backgroundColor).toBe("yellow");
	});

	it("ignores default block colors", () => {
		const blocks = [
			{
				type: "paragraph",
				props: { textColor: "default", backgroundColor: "default" },
				content: [{ type: "text", text: "Default" }],
				children: [],
			},
		];
		const result = blockNoteToSlate(blocks);
		expect(result[0].color).toBeUndefined();
		expect(result[0].backgroundColor).toBeUndefined();
	});

	// ── Headings ─────────────────────────────────────────────────────────

	it("converts headings at all levels", () => {
		const blocks = [
			{
				type: "heading",
				props: { level: 1 },
				content: [{ type: "text", text: "H1" }],
				children: [],
			},
			{
				type: "heading",
				props: { level: 2 },
				content: [{ type: "text", text: "H2" }],
				children: [],
			},
			{
				type: "heading",
				props: { level: 3 },
				content: [{ type: "text", text: "H3" }],
				children: [],
			},
		];
		const result = blockNoteToSlate(blocks);
		expect(result[0].type).toBe("h1");
		expect(result[1].type).toBe("h2");
		expect(result[2].type).toBe("h3");
	});

	it("clamps heading level to 1-6", () => {
		const blocks = [
			{
				type: "heading",
				props: { level: 0 },
				content: [{ type: "text", text: "Low" }],
				children: [],
			},
			{
				type: "heading",
				props: { level: 99 },
				content: [{ type: "text", text: "High" }],
				children: [],
			},
		];
		const result = blockNoteToSlate(blocks);
		expect(result[0].type).toBe("h1");
		expect(result[1].type).toBe("h6");
	});

	// ── Lists ────────────────────────────────────────────────────────────

	it("converts bullet list items with indent", () => {
		const blocks = [
			{
				type: "bulletListItem",
				props: {},
				content: [{ type: "text", text: "Item 1" }],
				children: [],
			},
			{
				type: "bulletListItem",
				props: {},
				content: [{ type: "text", text: "Item 2" }],
				children: [],
			},
		];
		const result = blockNoteToSlate(blocks);
		expect(result).toEqual([
			{
				type: "p",
				indent: 1,
				listStyleType: "disc",
				children: [{ text: "Item 1" }],
			},
			{
				type: "p",
				indent: 1,
				listStyleType: "disc",
				children: [{ text: "Item 2" }],
			},
		]);
	});

	it("converts numbered list items", () => {
		const blocks = [
			{
				type: "numberedListItem",
				props: {},
				content: [{ type: "text", text: "First" }],
				children: [],
			},
		];
		const result = blockNoteToSlate(blocks);
		expect(result[0]).toMatchObject({
			type: "p",
			indent: 1,
			listStyleType: "decimal",
		});
	});

	it("converts check list items with checked state", () => {
		const blocks = [
			{
				type: "checkListItem",
				props: { checked: true },
				content: [{ type: "text", text: "Done" }],
				children: [],
			},
			{
				type: "checkListItem",
				props: { checked: false },
				content: [{ type: "text", text: "Todo" }],
				children: [],
			},
		];
		const result = blockNoteToSlate(blocks);
		expect(result[0]).toMatchObject({
			listStyleType: "todo",
			checked: true,
		});
		expect(result[1]).toMatchObject({
			listStyleType: "todo",
			checked: false,
		});
	});

	it("handles nested children with increased indent", () => {
		const blocks = [
			{
				type: "bulletListItem",
				props: {},
				content: [{ type: "text", text: "Parent" }],
				children: [
					{
						type: "bulletListItem",
						props: {},
						content: [{ type: "text", text: "Child" }],
						children: [
							{
								type: "bulletListItem",
								props: {},
								content: [{ type: "text", text: "Grandchild" }],
								children: [],
							},
						],
					},
				],
			},
		];
		const result = blockNoteToSlate(blocks);
		expect(result).toHaveLength(3);
		expect(result[0].indent).toBe(1); // depth 0 → indent 1
		expect(result[1].indent).toBe(2); // depth 1 → indent 2
		expect(result[2].indent).toBe(3); // depth 2 → indent 3
	});

	// ── Code blocks ──────────────────────────────────────────────────────

	it("converts code block with language", () => {
		const blocks = [
			{
				type: "codeBlock",
				props: { language: "typescript" },
				content: [
					{ type: "text", text: "const x = 1;" },
					{ type: "text", text: "\nconst y = 2;" },
				],
				children: [],
			},
		];
		const result = blockNoteToSlate(blocks);
		expect(result[0]).toEqual({
			type: "code_block",
			lang: "typescript",
			children: [
				{ type: "code_line", children: [{ text: "const x = 1;" }] },
				{ type: "code_line", children: [{ text: "const y = 2;" }] },
			],
		});
	});

	it("converts code block with string content", () => {
		const blocks = [
			{
				type: "codeBlock",
				props: { language: "js" },
				content: "console.log('hi')",
				children: [],
			},
		];
		const result = blockNoteToSlate(blocks);
		expect(result[0].type).toBe("code_block");
		expect(result[0].children).toEqual([
			{ type: "code_line", children: [{ text: "console.log('hi')" }] },
		]);
	});

	// ── Images ───────────────────────────────────────────────────────────

	it("converts image with URL, caption, and width", () => {
		const blocks = [
			{
				type: "image",
				props: {
					url: "https://example.com/img.png",
					caption: "My image",
					width: 400,
				},
				content: [],
				children: [],
			},
		];
		const result = blockNoteToSlate(blocks);
		expect(result[0]).toEqual({
			type: "img",
			url: "https://example.com/img.png",
			caption: "My image",
			width: 400,
			children: [{ text: "" }],
		});
	});

	// ── Videos ───────────────────────────────────────────────────────────

	it("converts video with URL", () => {
		const blocks = [
			{
				type: "video",
				props: { url: "https://example.com/video.mp4" },
				content: [],
				children: [],
			},
		];
		const result = blockNoteToSlate(blocks);
		expect(result[0]).toMatchObject({
			type: "video",
			url: "https://example.com/video.mp4",
		});
	});

	// ── Tables ───────────────────────────────────────────────────────────

	it("converts table with rows and cells", () => {
		const blocks = [
			{
				type: "table",
				props: {},
				content: [],
				children: [
					{
						type: "tableRow",
						props: {},
						content: [],
						children: [
							{
								type: "tableCell",
								props: {},
								content: [{ type: "text", text: "A" }],
								children: [],
							},
							{
								type: "tableCell",
								props: {},
								content: [{ type: "text", text: "B" }],
								children: [],
							},
						],
					},
					{
						type: "tableRow",
						props: {},
						content: [],
						children: [
							{
								type: "tableCell",
								props: {},
								content: [{ type: "text", text: "C" }],
								children: [],
							},
							{
								type: "tableCell",
								props: {},
								content: [{ type: "text", text: "D" }],
								children: [],
							},
						],
					},
				],
			},
		];
		const result = blockNoteToSlate(blocks);
		expect(result[0]).toEqual({
			type: "table",
			children: [
				{
					type: "tr",
					children: [
						{
							type: "td",
							children: [{ type: "p", children: [{ text: "A" }] }],
						},
						{
							type: "td",
							children: [{ type: "p", children: [{ text: "B" }] }],
						},
					],
				},
				{
					type: "tr",
					children: [
						{
							type: "td",
							children: [{ type: "p", children: [{ text: "C" }] }],
						},
						{
							type: "td",
							children: [{ type: "p", children: [{ text: "D" }] }],
						},
					],
				},
			],
		});
	});

	// ── Inline content ───────────────────────────────────────────────────

	it("converts text with all mark styles", () => {
		const blocks = [
			{
				type: "paragraph",
				props: {},
				content: [
					{
						type: "text",
						text: "styled",
						styles: {
							bold: true,
							italic: true,
							underline: true,
							strikethrough: true,
							code: true,
							highlight: true,
							superscript: true,
							subscript: true,
							kbd: true,
						},
					},
				],
				children: [],
			},
		];
		const result = blockNoteToSlate(blocks);
		expect(result[0].children[0]).toEqual({
			text: "styled",
			bold: true,
			italic: true,
			underline: true,
			strikethrough: true,
			code: true,
			highlight: true,
			superscript: true,
			subscript: true,
			kbd: true,
		});
	});

	it("converts text with color styles", () => {
		const blocks = [
			{
				type: "paragraph",
				props: {},
				content: [
					{
						type: "text",
						text: "colored",
						styles: { textColor: "red", backgroundColor: "yellow" },
					},
				],
				children: [],
			},
		];
		const result = blockNoteToSlate(blocks);
		expect(result[0].children[0]).toEqual({
			text: "colored",
			color: "red",
			backgroundColor: "yellow",
		});
	});

	it("ignores default text color values", () => {
		const blocks = [
			{
				type: "paragraph",
				props: {},
				content: [
					{
						type: "text",
						text: "default",
						styles: { textColor: "default", backgroundColor: "default" },
					},
				],
				children: [],
			},
		];
		const result = blockNoteToSlate(blocks);
		expect(result[0].children[0]).toEqual({ text: "default" });
	});

	// ── Links ────────────────────────────────────────────────────────────

	it("converts links with href and nested content", () => {
		const blocks = [
			{
				type: "paragraph",
				props: {},
				content: [
					{ type: "text", text: "Click " },
					{
						type: "link",
						href: "https://example.com",
						content: [{ type: "text", text: "here", styles: { bold: true } }],
					},
				],
				children: [],
			},
		];
		const result = blockNoteToSlate(blocks);
		expect(result[0].children).toEqual([
			{ text: "Click " },
			{
				type: "a",
				url: "https://example.com",
				children: [{ text: "here", bold: true }],
			},
		]);
	});

	// ── Mentions ─────────────────────────────────────────────────────────

	it("converts mention with userId and label", () => {
		const blocks = [
			{
				type: "paragraph",
				props: {},
				content: [
					{ type: "text", text: "Hello " },
					{
						type: "mention",
						props: { label: "Alice", userId: "user-123" },
					},
				],
				children: [],
			},
		];
		const result = blockNoteToSlate(blocks);
		expect(result[0].children[1]).toEqual({
			type: "mention",
			value: "Alice",
			userId: "user-123",
			children: [{ text: "" }],
		});
	});

	// ── Unknown block types ──────────────────────────────────────────────

	it("converts unknown block types as paragraphs", () => {
		const blocks = [
			{
				type: "customWidget",
				props: {},
				content: [{ type: "text", text: "Widget text" }],
				children: [],
			},
		];
		const result = blockNoteToSlate(blocks);
		expect(result[0]).toEqual({
			type: "p",
			children: [{ text: "Widget text" }],
		});
	});

	// ── Mixed document ───────────────────────────────────────────────────

	it("converts a mixed content document", () => {
		const blocks = [
			{
				type: "heading",
				props: { level: 1 },
				content: [{ type: "text", text: "Title" }],
				children: [],
			},
			{
				type: "paragraph",
				props: {},
				content: [
					{ type: "text", text: "Hello " },
					{ type: "text", text: "world", styles: { bold: true } },
				],
				children: [],
			},
			{
				type: "bulletListItem",
				props: {},
				content: [{ type: "text", text: "Item A" }],
				children: [],
			},
			{
				type: "image",
				props: { url: "https://example.com/img.png" },
				content: [],
				children: [],
			},
			{
				type: "codeBlock",
				props: { language: "js" },
				content: [{ type: "text", text: "console.log('hi')" }],
				children: [],
			},
		];
		const result = blockNoteToSlate(blocks);
		expect(result).toHaveLength(5);
		expect(result[0].type).toBe("h1");
		expect(result[1].type).toBe("p");
		expect(result[2].listStyleType).toBe("disc");
		expect(result[3].type).toBe("img");
		expect(result[4].type).toBe("code_block");
	});
});

// ---------------------------------------------------------------------------
// plainTextToSlate
// ---------------------------------------------------------------------------

describe("plainTextToSlate", () => {
	it("returns null for empty string", () => {
		expect(plainTextToSlate("")).toBeNull();
	});

	it("returns null for whitespace-only string", () => {
		expect(plainTextToSlate("   \n  ")).toBeNull();
	});

	it("converts single line text", () => {
		expect(plainTextToSlate("Hello")).toEqual([
			{ type: "p", children: [{ text: "Hello" }] },
		]);
	});

	it("converts multi-line text", () => {
		expect(plainTextToSlate("Line 1\nLine 2\nLine 3")).toEqual([
			{ type: "p", children: [{ text: "Line 1" }] },
			{ type: "p", children: [{ text: "Line 2" }] },
			{ type: "p", children: [{ text: "Line 3" }] },
		]);
	});
});

// ---------------------------------------------------------------------------
// parseAnyContentToSlate
// ---------------------------------------------------------------------------

describe("parseAnyContentToSlate", () => {
	it("returns undefined for empty/undefined input", () => {
		expect(parseAnyContentToSlate(undefined)).toBeUndefined();
		expect(parseAnyContentToSlate("")).toBeUndefined();
	});

	it("parses Slate JSON (passthrough)", () => {
		const slateJson = JSON.stringify([
			{ type: "p", children: [{ text: "Hello" }] },
		]);
		const result = parseAnyContentToSlate(slateJson);
		expect(result).toEqual([{ type: "p", children: [{ text: "Hello" }] }]);
	});

	it("parses BlockNote JSON and converts to Slate", () => {
		const bnJson = JSON.stringify([
			{
				type: "paragraph",
				props: { textColor: "default" },
				content: [{ type: "text", text: "Hello" }],
				children: [],
			},
		]);
		const result = parseAnyContentToSlate(bnJson);
		expect(result).toEqual([{ type: "p", children: [{ text: "Hello" }] }]);
	});

	it("parses ProseMirror JSON and converts to Slate", () => {
		const pmJson = JSON.stringify({
			type: "doc",
			content: [
				{
					type: "paragraph",
					content: [{ type: "text", text: "From PM" }],
				},
			],
		});
		const result = parseAnyContentToSlate(pmJson);
		expect(result).toEqual([{ type: "p", children: [{ text: "From PM" }] }]);
	});

	it("parses plain text", () => {
		const result = parseAnyContentToSlate("Just some text");
		expect(result).toEqual([
			{ type: "p", children: [{ text: "Just some text" }] },
		]);
	});

	it("returns undefined for whitespace-only plain text", () => {
		expect(parseAnyContentToSlate("   ")).toBeUndefined();
	});

	it("parses markdown and converts to Slate", () => {
		const md = "# Title\n\n- Item 1\n- Item 2";
		const result = parseAnyContentToSlate(md);
		expect(result).toBeDefined();
		expect(result?.[0]).toEqual({
			type: "h1",
			children: [{ text: "Title" }],
		});
		expect(result?.[1]).toMatchObject({
			type: "p",
			indent: 1,
			listStyleType: "disc",
		});
	});
});

// ---------------------------------------------------------------------------
// extractTextFromSlate
// ---------------------------------------------------------------------------

describe("extractTextFromSlate", () => {
	it("returns empty string for empty array", () => {
		expect(extractTextFromSlate([])).toBe("");
	});

	it("returns empty string for null/undefined input", () => {
		expect(extractTextFromSlate(null as never)).toBe("");
		expect(extractTextFromSlate(undefined as never)).toBe("");
	});

	it("extracts text from a simple paragraph", () => {
		const nodes = [{ type: "p", children: [{ text: "Hello world" }] }];
		expect(extractTextFromSlate(nodes)).toBe("Hello world");
	});

	it("extracts text from multiple paragraphs", () => {
		const nodes = [
			{ type: "p", children: [{ text: "First" }] },
			{ type: "p", children: [{ text: "Second" }] },
		];
		expect(extractTextFromSlate(nodes)).toBe("First Second");
	});

	it("extracts text from headings", () => {
		const nodes = [
			{ type: "h1", children: [{ text: "Title" }] },
			{ type: "h2", children: [{ text: "Subtitle" }] },
		];
		expect(extractTextFromSlate(nodes)).toBe("Title Subtitle");
	});

	it("extracts text from formatted content (ignores marks)", () => {
		const nodes = [
			{
				type: "p",
				children: [
					{ text: "bold", bold: true },
					{ text: " and " },
					{ text: "italic", italic: true },
				],
			},
		];
		expect(extractTextFromSlate(nodes)).toBe("bold and italic");
	});

	it("extracts text from nested list items", () => {
		const nodes = [
			{
				type: "p",
				indent: 1,
				listStyleType: "disc",
				children: [{ text: "Item 1" }],
			},
			{
				type: "p",
				indent: 2,
				listStyleType: "disc",
				children: [{ text: "Nested item" }],
			},
		];
		expect(extractTextFromSlate(nodes)).toBe("Item 1 Nested item");
	});

	it("extracts text from code blocks", () => {
		const nodes = [
			{
				type: "code_block",
				children: [
					{ type: "code_line", children: [{ text: "const x = 1;" }] },
					{ type: "code_line", children: [{ text: "return x;" }] },
				],
			},
		];
		expect(extractTextFromSlate(nodes)).toBe("const x = 1;return x;");
	});

	it("extracts text from links", () => {
		const nodes = [
			{
				type: "p",
				children: [
					{ text: "Click " },
					{
						type: "a",
						url: "https://example.com",
						children: [{ text: "here" }],
					},
				],
			},
		];
		expect(extractTextFromSlate(nodes)).toBe("Click here");
	});

	it("extracts mention values", () => {
		const nodes = [
			{
				type: "p",
				children: [
					{ text: "Hello " },
					{
						type: "mention",
						value: "Alice",
						children: [{ text: "" }],
					},
				],
			},
		];
		expect(extractTextFromSlate(nodes)).toBe("Hello @Alice");
	});

	it("extracts text from tables", () => {
		const nodes = [
			{
				type: "table",
				children: [
					{
						type: "tr",
						children: [
							{
								type: "td",
								children: [{ type: "p", children: [{ text: "Cell A" }] }],
							},
							{
								type: "td",
								children: [{ type: "p", children: [{ text: "Cell B" }] }],
							},
						],
					},
				],
			},
		];
		// Table cells are inline-collected within the same top-level block
		expect(extractTextFromSlate(nodes)).toBe("Cell ACell B");
	});

	it("extracts text from blockquotes", () => {
		const nodes = [
			{
				type: "blockquote",
				children: [{ type: "p", children: [{ text: "Quoted text" }] }],
			},
		];
		expect(extractTextFromSlate(nodes)).toBe("Quoted text");
	});

	it("truncates with maxLength", () => {
		const nodes = [{ type: "p", children: [{ text: "This is a long text" }] }];
		expect(extractTextFromSlate(nodes, 10)).toBe("This is a ...");
	});

	it("does not truncate when under maxLength", () => {
		const nodes = [{ type: "p", children: [{ text: "Short" }] }];
		expect(extractTextFromSlate(nodes, 100)).toBe("Short");
	});

	it("handles mixed content document", () => {
		const nodes = [
			{ type: "h1", children: [{ text: "Title" }] },
			{
				type: "p",
				children: [{ text: "Hello " }, { text: "world", bold: true }],
			},
			{
				type: "p",
				indent: 1,
				listStyleType: "disc",
				children: [{ text: "Item" }],
			},
		];
		expect(extractTextFromSlate(nodes)).toBe("Title Hello world Item");
	});

	it("skips empty text nodes", () => {
		const nodes = [
			{
				type: "p",
				children: [{ text: "" }, { text: "Hello" }, { text: "" }],
			},
		];
		expect(extractTextFromSlate(nodes)).toBe("Hello");
	});

	it("handles void elements gracefully", () => {
		const nodes = [
			{ type: "hr", children: [{ text: "" }] },
			{ type: "img", url: "test.png", children: [{ text: "" }] },
			{ type: "p", children: [{ text: "After" }] },
		];
		expect(extractTextFromSlate(nodes)).toBe("After");
	});
});

// ---------------------------------------------------------------------------
// looksLikeMarkdown
// ---------------------------------------------------------------------------

describe("looksLikeMarkdown", () => {
	it("detects headings + lists", () => {
		expect(looksLikeMarkdown("# Title\n- item")).toBe(true);
	});

	it("detects tables", () => {
		expect(looksLikeMarkdown("| A | B |\n| --- | --- |\n| 1 | 2 |")).toBe(true);
	});

	it("detects code fences + bold", () => {
		expect(looksLikeMarkdown("```js\ncode\n```\n**bold**")).toBe(true);
	});

	it("rejects plain text with only one signal", () => {
		expect(looksLikeMarkdown("# Just a heading")).toBe(false);
	});

	it("rejects plain text with no signals", () => {
		expect(looksLikeMarkdown("Hello world, nothing special")).toBe(false);
	});
});

// ---------------------------------------------------------------------------
// markdownToSlate
// ---------------------------------------------------------------------------

describe("markdownToSlate", () => {
	it("returns empty paragraph for empty input", () => {
		expect(markdownToSlate("")).toEqual([
			{ type: "p", children: [{ text: "" }] },
		]);
	});

	// ── Headings ─────────────────────────────────────────────────────────

	it("converts headings h1 through h6", () => {
		const result = markdownToSlate(
			"# H1\n## H2\n### H3\n#### H4\n##### H5\n###### H6",
		);
		expect(result).toEqual([
			{ type: "h1", children: [{ text: "H1" }] },
			{ type: "h2", children: [{ text: "H2" }] },
			{ type: "h3", children: [{ text: "H3" }] },
			{ type: "h4", children: [{ text: "H4" }] },
			{ type: "h5", children: [{ text: "H5" }] },
			{ type: "h6", children: [{ text: "H6" }] },
		]);
	});

	// ── Inline formatting ────────────────────────────────────────────────

	it("converts bold text", () => {
		const result = markdownToSlate("Some **bold** text");
		expect(result[0].children).toEqual([
			{ text: "Some " },
			{ text: "bold", bold: true },
			{ text: " text" },
		]);
	});

	it("converts italic text", () => {
		const result = markdownToSlate("Some *italic* text");
		expect(result[0].children).toEqual([
			{ text: "Some " },
			{ text: "italic", italic: true },
			{ text: " text" },
		]);
	});

	it("converts inline code", () => {
		const result = markdownToSlate("Use `console.log` here");
		expect(result[0].children).toEqual([
			{ text: "Use " },
			{ text: "console.log", code: true },
			{ text: " here" },
		]);
	});

	it("converts strikethrough", () => {
		const result = markdownToSlate("~~removed~~ text");
		expect(result[0].children).toEqual([
			{ text: "removed", strikethrough: true },
			{ text: " text" },
		]);
	});

	it("converts links", () => {
		const result = markdownToSlate("Click [here](https://example.com)");
		expect(result[0].children).toEqual([
			{ text: "Click " },
			{
				type: "a",
				url: "https://example.com",
				children: [{ text: "here" }],
			},
		]);
	});

	// ── Lists ────────────────────────────────────────────────────────────

	it("converts bullet lists", () => {
		const result = markdownToSlate("- Item 1\n- Item 2\n- Item 3");
		expect(result).toEqual([
			{
				type: "p",
				indent: 1,
				listStyleType: "disc",
				children: [{ text: "Item 1" }],
			},
			{
				type: "p",
				indent: 1,
				listStyleType: "disc",
				children: [{ text: "Item 2" }],
			},
			{
				type: "p",
				indent: 1,
				listStyleType: "disc",
				children: [{ text: "Item 3" }],
			},
		]);
	});

	it("converts numbered lists", () => {
		const result = markdownToSlate("1. First\n2. Second");
		expect(result).toEqual([
			{
				type: "p",
				indent: 1,
				listStyleType: "decimal",
				children: [{ text: "First" }],
			},
			{
				type: "p",
				indent: 1,
				listStyleType: "decimal",
				children: [{ text: "Second" }],
			},
		]);
	});

	it("converts checkbox lists", () => {
		const result = markdownToSlate("- [ ] Todo\n- [x] Done");
		expect(result).toEqual([
			{
				type: "p",
				indent: 1,
				listStyleType: "todo",
				checked: false,
				children: [{ text: "Todo" }],
			},
			{
				type: "p",
				indent: 1,
				listStyleType: "todo",
				checked: true,
				children: [{ text: "Done" }],
			},
		]);
	});

	// ── Code blocks ──────────────────────────────────────────────────────

	it("converts fenced code blocks", () => {
		const result = markdownToSlate(
			"```typescript\nconst x = 1;\nreturn x;\n```",
		);
		expect(result).toEqual([
			{
				type: "code_block",
				lang: "typescript",
				children: [
					{ type: "code_line", children: [{ text: "const x = 1;" }] },
					{ type: "code_line", children: [{ text: "return x;" }] },
				],
			},
		]);
	});

	// ── Tables ───────────────────────────────────────────────────────────

	it("converts markdown tables", () => {
		const md = "| Name | Age |\n| --- | --- |\n| Alice | 30 |\n| Bob | 25 |";
		const result = markdownToSlate(md);
		expect(result).toEqual([
			{
				type: "table",
				children: [
					{
						type: "tr",
						children: [
							{
								type: "th",
								children: [{ type: "p", children: [{ text: "Name" }] }],
							},
							{
								type: "th",
								children: [{ type: "p", children: [{ text: "Age" }] }],
							},
						],
					},
					{
						type: "tr",
						children: [
							{
								type: "td",
								children: [{ type: "p", children: [{ text: "Alice" }] }],
							},
							{
								type: "td",
								children: [{ type: "p", children: [{ text: "30" }] }],
							},
						],
					},
					{
						type: "tr",
						children: [
							{
								type: "td",
								children: [{ type: "p", children: [{ text: "Bob" }] }],
							},
							{
								type: "td",
								children: [{ type: "p", children: [{ text: "25" }] }],
							},
						],
					},
				],
			},
		]);
	});

	// ── Blockquotes ──────────────────────────────────────────────────────

	it("converts blockquotes", () => {
		const result = markdownToSlate("> This is quoted");
		expect(result).toEqual([
			{
				type: "blockquote",
				children: [{ type: "p", children: [{ text: "This is quoted" }] }],
			},
		]);
	});

	// ── Horizontal rule ──────────────────────────────────────────────────

	it("converts horizontal rules", () => {
		const result = markdownToSlate("---");
		expect(result).toEqual([{ type: "hr", children: [{ text: "" }] }]);
	});

	// ── Mixed document ───────────────────────────────────────────────────

	it("converts a full markdown document", () => {
		const md = [
			"# Project Overview",
			"",
			"This project uses **React** and *TypeScript*.",
			"",
			"## Features",
			"",
			"- Fast rendering",
			"- Type safety",
			"",
			"| Feature | Status |",
			"| --- | --- |",
			"| Auth | Done |",
		].join("\n");

		const result = markdownToSlate(md);
		expect(result[0]).toEqual({
			type: "h1",
			children: [{ text: "Project Overview" }],
		});
		// Paragraph with inline formatting
		expect(result[1].type).toBe("p");
		expect(result[1].children).toContainEqual({
			text: "React",
			bold: true,
		});
		expect(result[1].children).toContainEqual({
			text: "TypeScript",
			italic: true,
		});
		// Subheading
		expect(result[2]).toEqual({
			type: "h2",
			children: [{ text: "Features" }],
		});
		// List items
		expect(result[3]).toMatchObject({
			type: "p",
			listStyleType: "disc",
		});
		// Table
		expect(result[5].type).toBe("table");
	});
});
