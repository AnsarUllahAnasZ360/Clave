/**
 * @vitest-environment node
 *
 * Integration tests for chat modes (Agent/Plan/Ask) and custom type/status parsing.
 */

import { describe, expect, it } from "vitest";
import {
	hasCustomBlocks,
	parseCustomBlocks,
} from "../../src/components/ai/ChatBlockRenderer";

// ── Chat block parsing ──────────────────────────────────────────────────

describe("ChatBlockRenderer", () => {
	describe("hasCustomBlocks", () => {
		it("detects mode-suggest blocks", () => {
			expect(
				hasCustomBlocks("Some text :::mode-suggest plan Switch to Plan:::"),
			).toBe(true);
		});

		it("detects todo-list blocks", () => {
			expect(
				hasCustomBlocks("Here:\n:::todo-list\n- [ ] Step 1\n- [x] Step 2\n:::"),
			).toBe(true);
		});

		it("returns false for plain text", () => {
			expect(hasCustomBlocks("Just a regular message")).toBe(false);
		});

		it("returns false for partial markers", () => {
			expect(hasCustomBlocks(":::unknown-block content:::")).toBe(false);
		});
	});

	describe("parseCustomBlocks", () => {
		it("parses mode-suggest with mode and description", () => {
			const blocks = parseCustomBlocks(
				"Before :::mode-suggest plan Switch to Plan mode for planning::: After",
			);
			expect(blocks).toHaveLength(2); // text before + mode-suggest (after is truncated)
			expect(blocks[0]).toEqual({
				type: "text",
				content: "Before ",
			});
			expect(blocks[1]).toEqual({
				type: "mode-suggest",
				mode: "plan",
				description: "Switch to Plan mode for planning",
			});
		});

		it("truncates text after mode-suggest", () => {
			const blocks = parseCustomBlocks(
				"Start :::mode-suggest agent Execute::: This should be hidden",
			);
			const textBlocks = blocks.filter((b) => b.type === "text");
			expect(textBlocks).toHaveLength(1);
			expect(textBlocks[0].content).toBe("Start ");
		});

		it("parses todo-list with checked and unchecked items", () => {
			const blocks = parseCustomBlocks(
				":::todo-list\n- [ ] First task\n- [x] Done task\n- [ ] Third task\n:::",
			);
			// Parser may produce text + todo-list blocks
			const todoBlock = blocks.find((b) => b.type === "todo-list");
			expect(todoBlock).toBeDefined();
			if (todoBlock?.type === "todo-list") {
				expect(todoBlock.items).toHaveLength(3);
				expect(todoBlock.items[0]).toEqual({ text: "First task", done: false });
				expect(todoBlock.items[1]).toEqual({ text: "Done task", done: true });
				expect(todoBlock.items[2]).toEqual({
					text: "Third task",
					done: false,
				});
			}
		});

		it("handles mixed text and blocks", () => {
			const blocks = parseCustomBlocks(
				"Intro text\n:::todo-list\n- [ ] Task 1\n:::\nMore text",
			);
			expect(blocks.length).toBeGreaterThanOrEqual(2);
			expect(blocks.some((b) => b.type === "text")).toBe(true);
			expect(blocks.some((b) => b.type === "todo-list")).toBe(true);
		});

		it("defaults to plan mode for unknown mode value", () => {
			const blocks = parseCustomBlocks(
				":::mode-suggest unknown Switch mode:::",
			);
			const modeBlock = blocks.find((b) => b.type === "mode-suggest");
			expect(modeBlock).toBeDefined();
			if (modeBlock?.type === "mode-suggest") {
				expect(modeBlock.mode).toBe("plan");
			}
		});
	});
});

// ── Custom types/statuses merge logic ───────────────────────────────────

describe("Custom types merge logic", () => {
	const defaults = [
		{ key: "issue", name: "Issue", color: "#6b7280" },
		{ key: "bug", name: "Bug", color: "#ef4444" },
	];

	function mergeDefaults(
		defs: typeof defaults,
		custom: typeof defaults | undefined,
	) {
		if (!custom || custom.length === 0)
			return defs.map((d) => ({ ...d, isDefault: true }));
		const merged = defs.map((def) => {
			const override = custom.find((c) => c.key === def.key);
			return { ...(override ?? def), isDefault: true };
		});
		const customOnly = custom.filter((c) => !defs.some((d) => d.key === c.key));
		return [...merged, ...customOnly.map((c) => ({ ...c, isDefault: false }))];
	}

	it("returns defaults with isDefault flag when no custom", () => {
		const result = mergeDefaults(defaults, undefined);
		expect(result).toHaveLength(2);
		expect(result[0].isDefault).toBe(true);
		expect(result[1].isDefault).toBe(true);
	});

	it("overrides default name/color with custom values", () => {
		const custom = [{ key: "bug", name: "Defect", color: "#ff0000" }];
		const result = mergeDefaults(defaults, custom);
		expect(result.find((r) => r.key === "bug")?.name).toBe("Defect");
		expect(result.find((r) => r.key === "bug")?.color).toBe("#ff0000");
	});

	it("appends custom-only items with isDefault=false", () => {
		const custom = [{ key: "epic", name: "Epic", color: "#8b5cf6" }];
		const result = mergeDefaults(defaults, custom);
		expect(result).toHaveLength(3);
		const epic = result.find((r) => r.key === "epic");
		expect(epic?.isDefault).toBe(false);
		expect(epic?.name).toBe("Epic");
	});

	it("handles both overrides and additions", () => {
		const custom = [
			{ key: "bug", name: "Defect", color: "#ff0000" },
			{ key: "story", name: "Story", color: "#22c55e" },
		];
		const result = mergeDefaults(defaults, custom);
		expect(result).toHaveLength(3);
		expect(result.find((r) => r.key === "bug")?.name).toBe("Defect");
		expect(result.find((r) => r.key === "story")?.isDefault).toBe(false);
	});
});
