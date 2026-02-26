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
		api: {},
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
});
