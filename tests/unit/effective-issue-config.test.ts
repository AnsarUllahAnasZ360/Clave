import { describe, expect, it } from "vitest";
import { mergeWithCustom } from "@/hooks/use-effective-issue-config";
import { applyOrder } from "@/hooks/use-workspace-settings";

describe("mergeWithCustom", () => {
	const defaults = [
		{ key: "triage", name: "Triage", color: "#f97316" },
		{ key: "backlog", name: "Backlog", color: "#6b7280" },
		{ key: "todo", name: "Todo", color: "#a3a3a3" },
		{ key: "done", name: "Done", color: "#10b981" },
	];

	it("returns defaults when no custom statuses provided", () => {
		expect(mergeWithCustom(defaults, undefined)).toEqual(defaults);
		expect(mergeWithCustom(defaults, [])).toEqual(defaults);
	});

	it("overrides a default status by key (rename + recolor)", () => {
		const result = mergeWithCustom(defaults, [
			{ key: "todo", name: "To Do!", color: "#ff00ff" },
		]);
		const todo = result.find((s) => s.key === "todo");
		expect(todo).toEqual({ key: "todo", name: "To Do!", color: "#ff00ff" });
		expect(result).toHaveLength(defaults.length);
	});

	it("appends brand-new custom statuses after defaults", () => {
		const result = mergeWithCustom(defaults, [
			{ key: "blocked", name: "Blocked", color: "#ef4444" },
			{ key: "shipped", name: "Shipped", color: "#22c55e" },
		]);
		expect(result).toHaveLength(defaults.length + 2);
		expect(result[result.length - 2]).toEqual({
			key: "blocked",
			name: "Blocked",
			color: "#ef4444",
		});
		expect(result[result.length - 1]).toEqual({
			key: "shipped",
			name: "Shipped",
			color: "#22c55e",
		});
	});

	it("preserves default order when overriding", () => {
		const result = mergeWithCustom(defaults, [
			{ key: "backlog", name: "Ideas", color: "#000000" },
		]);
		expect(result.map((s) => s.key)).toEqual([
			"triage",
			"backlog",
			"todo",
			"done",
		]);
	});

	it("handles mixed overrides + additions", () => {
		const result = mergeWithCustom(defaults, [
			{ key: "done", name: "Shipped", color: "#00ff00" },
			{ key: "blocked", name: "Blocked", color: "#ef4444" },
		]);
		expect(result.map((s) => s.key)).toEqual([
			"triage",
			"backlog",
			"todo",
			"done",
			"blocked",
		]);
		expect(result.find((s) => s.key === "done")).toEqual({
			key: "done",
			name: "Shipped",
			color: "#00ff00",
		});
	});
});

describe("applyOrder", () => {
	const items = [
		{ key: "triage", name: "Triage", color: "#000" },
		{ key: "backlog", name: "Backlog", color: "#000" },
		{ key: "todo", name: "Todo", color: "#000" },
		{ key: "done", name: "Done", color: "#000" },
	];

	it("returns items unchanged when order is missing or empty", () => {
		expect(applyOrder(items, undefined)).toEqual(items);
		expect(applyOrder(items, [])).toEqual(items);
	});

	it("reorders items by the provided key sequence", () => {
		const result = applyOrder(items, ["done", "triage", "todo", "backlog"]);
		expect(result.map((i) => i.key)).toEqual([
			"done",
			"triage",
			"todo",
			"backlog",
		]);
	});

	it("appends items missing from the order array at the end", () => {
		// Drag-to-reorder may run before a newly-added status is in the order
		// array. Those orphans should still render — at the end — never drop.
		const result = applyOrder(items, ["done", "todo"]);
		expect(result.map((i) => i.key)).toEqual([
			"done",
			"todo",
			"triage",
			"backlog",
		]);
	});

	it("ignores keys in the order array that don't exist in items", () => {
		const result = applyOrder(items, ["nonexistent", "done", "todo"]);
		expect(result.map((i) => i.key)).toEqual([
			"done",
			"todo",
			"triage",
			"backlog",
		]);
	});
});
