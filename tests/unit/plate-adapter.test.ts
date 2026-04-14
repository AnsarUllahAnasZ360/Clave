import { describe, expect, it, vi } from "vitest";
import { PlateAdapter } from "../../src/components/ai/editor/plate-adapter";

function createMockEditor(overrides: Record<string, unknown> = {}) {
	return {
		selection: {
			anchor: { path: [0, 0], offset: 0 },
			focus: { path: [0, 0], offset: 0 },
		},
		children: [{ type: "p", children: [{ text: "" }] }],
		tf: {
			insertText: vi.fn(),
			insertBreak: vi.fn(),
			deleteFragment: vi.fn(),
		},
		api: {
			string: vi.fn((selection: unknown) => {
				// biome-ignore lint/suspicious/noExplicitAny: mock
				const sel = selection as any;
				if (!sel) return "";
				return "selected text";
			}),
			block: vi.fn(() => null),
		},
		...overrides,
		// biome-ignore lint/suspicious/noExplicitAny: mock editor for tests
	} as any;
}

describe("PlateAdapter", () => {
	it("includes text before cursor in current block for slash context", () => {
		const editor = createMockEditor({
			selection: {
				anchor: { path: [1, 0], offset: 3 },
				focus: { path: [1, 0], offset: 3 },
			},
			children: [
				{ type: "p", children: [{ text: "First block" }] },
				{ type: "p", children: [{ text: "Second block" }] },
			],
		});

		const adapter = new PlateAdapter(editor);
		expect(adapter.getContentBefore()).toBe("First block\nSec");
	});

	it("strips trailing slash command token from slash context", () => {
		const editor = createMockEditor({
			selection: {
				anchor: { path: [1, 0], offset: 10 },
				focus: { path: [1, 0], offset: 10 },
			},
			children: [
				{ type: "p", children: [{ text: "Intro context" }] },
				{ type: "p", children: [{ text: "/summarize" }] },
			],
		});

		const adapter = new PlateAdapter(editor);
		expect(adapter.getContentBefore()).toBe("Intro context");
	});

	it("inserts multiline AI output at cursor with explicit line breaks", () => {
		const editor = createMockEditor();
		const adapter = new PlateAdapter(editor);

		adapter.insertAtCursor("Line 1\nLine 2");

		expect(editor.tf.insertText).toHaveBeenNthCalledWith(1, "Line 1");
		expect(editor.tf.insertBreak).toHaveBeenCalledTimes(1);
		expect(editor.tf.insertText).toHaveBeenNthCalledWith(2, "Line 2");
	});

	it("replaces selection and preserves multiline output", () => {
		const editor = createMockEditor({
			selection: {
				anchor: { path: [0, 0], offset: 0 },
				focus: { path: [0, 0], offset: 4 },
			},
		});
		const adapter = new PlateAdapter(editor);

		adapter.replaceSelection("Alpha\nBeta");

		expect(editor.tf.deleteFragment).toHaveBeenCalledTimes(1);
		expect(editor.tf.insertText).toHaveBeenNthCalledWith(1, "Alpha");
		expect(editor.tf.insertBreak).toHaveBeenCalledTimes(1);
		expect(editor.tf.insertText).toHaveBeenNthCalledWith(2, "Beta");
	});

	it("returns 'plate' as editor type", () => {
		const adapter = new PlateAdapter(createMockEditor());
		expect(adapter.getEditorType()).toBe("plate");
	});

	it("returns full document content joined by newlines", () => {
		const editor = createMockEditor({
			selection: null,
			children: [
				{ type: "p", children: [{ text: "First paragraph" }] },
				{ type: "p", children: [{ text: "Second paragraph" }] },
				{ type: "p", children: [{ text: "Third paragraph" }] },
			],
		});

		const adapter = new PlateAdapter(editor);
		expect(adapter.getFullContent()).toBe(
			"First paragraph\nSecond paragraph\nThird paragraph",
		);
	});

	it("returns null for getFullContent when document has no text blocks", () => {
		const editor = createMockEditor({
			selection: null,
			children: [{ type: "p", children: [{ text: "" }] }],
		});

		const adapter = new PlateAdapter(editor);
		expect(adapter.getFullContent()).toBe("");
	});

	it("returns current block type from selection", () => {
		const editor = createMockEditor({
			selection: {
				anchor: { path: [1, 0], offset: 0 },
				focus: { path: [1, 0], offset: 0 },
			},
			children: [
				{ type: "p", children: [{ text: "Paragraph" }] },
				{ type: "h2", children: [{ text: "Heading" }] },
			],
		});

		const adapter = new PlateAdapter(editor);
		expect(adapter.getCurrentBlockType()).toBe("h2");
	});

	it("returns null for getCurrentBlockType when no selection", () => {
		const editor = createMockEditor({ selection: null });
		const adapter = new PlateAdapter(editor);
		expect(adapter.getCurrentBlockType()).toBeNull();
	});

	it("returns surrounding context with before, after, and blockType", () => {
		const editor = createMockEditor({
			selection: {
				anchor: { path: [1, 0], offset: 0 },
				focus: { path: [1, 0], offset: 0 },
			},
			children: [
				{ type: "p", children: [{ text: "Before block" }] },
				{ type: "p", children: [{ text: "Current block" }] },
				{ type: "p", children: [{ text: "After block" }] },
			],
		});

		const adapter = new PlateAdapter(editor);
		const ctx = adapter.getSurroundingContext();

		expect(ctx.before).toBe("Before block");
		expect(ctx.after).toBe("After block");
		expect(ctx.blockType).toBe("p");
	});

	it("returns empty surrounding context when no selection", () => {
		const editor = createMockEditor({ selection: null });
		const adapter = new PlateAdapter(editor);
		const ctx = adapter.getSurroundingContext();

		expect(ctx.before).toBe("");
		expect(ctx.after).toBe("");
		expect(ctx.blockType).toBeNull();
	});

	it("returns null for getSelectedText when selection is collapsed", () => {
		const editor = createMockEditor({
			selection: {
				anchor: { path: [0, 0], offset: 3 },
				focus: { path: [0, 0], offset: 3 },
			},
		});

		const adapter = new PlateAdapter(editor);
		expect(adapter.getSelectedText()).toBeNull();
	});

	it("returns null for getSelectedText when no selection", () => {
		const editor = createMockEditor({ selection: null });
		const adapter = new PlateAdapter(editor);
		expect(adapter.getSelectedText()).toBeNull();
	});

	it("returns empty string for getContentBefore when no selection", () => {
		const editor = createMockEditor({ selection: null });
		const adapter = new PlateAdapter(editor);
		expect(adapter.getContentBefore()).toBe("");
	});
});
