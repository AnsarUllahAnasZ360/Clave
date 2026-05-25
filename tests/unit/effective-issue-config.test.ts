import { Circle } from "lucide-react";
import { describe, expect, it } from "vitest";
import {
	buildEffectiveIssueConfig,
	mergeWithCustom,
} from "@/hooks/use-effective-issue-config";
import { applyOrder } from "@/hooks/use-workspace-settings";

// Synthetic WorkspaceConfig shape — buildEffectiveIssueConfig only reads
// `types`, `statuses`. Returning Circle as a stub icon is enough for the
// resolution assertions below; tests don't render the icons.
function makeWs(opts: {
	statuses: { key: string; name: string; color: string }[];
	types?: { key: string; name: string; color: string }[];
}) {
	const statuses = opts.statuses;
	const types = opts.types ?? [
		{ key: "issue", name: "Issue", color: "#6b7280" },
	];
	return {
		statuses,
		types,
		priorities: [],
		settings: undefined,
		isLoading: false,
		getStatusName: (k: string) => statuses.find((s) => s.key === k)?.name ?? k,
		getStatusColor: (k: string) =>
			statuses.find((s) => s.key === k)?.color ?? "#6b7280",
		getStatusIcon: () => Circle,
		getTypeName: (k: string) => types.find((t) => t.key === k)?.name ?? k,
		getTypeColor: (k: string) =>
			types.find((t) => t.key === k)?.color ?? "#6b7280",
		getTypeIcon: () => Circle,
		getPriorityName: (k: string) => k,
		getPriorityColor: () => "#6b7280",
		getPriorityIcon: () => Circle,
	};
}

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

describe("buildEffectiveIssueConfig — per-project resolution", () => {
	const wsStatuses = [
		{ key: "todo", name: "To Do", color: "#a3a3a3" },
		{ key: "in_progress", name: "In Progress", color: "#3b82f6" },
		{ key: "done", name: "Done", color: "#10b981" },
	];

	it("falls back to workspace dictionary when no project given", () => {
		const ws = makeWs({ statuses: wsStatuses });
		const cfg = buildEffectiveIssueConfig(ws, undefined);
		expect(cfg.getStatusName("todo")).toBe("To Do");
		expect(cfg.getStatusName("in_progress")).toBe("In Progress");
		// Project-only key the workspace doesn't know about → falls back to key
		expect(cfg.getStatusName("testing_staging")).toBe("testing_staging");
		expect(cfg.statusItems.map((s) => s.id)).toEqual([
			"todo",
			"in_progress",
			"done",
		]);
	});

	it("resolves a project-only custom status via project dictionary", () => {
		// This is the bug-fix scenario: an issue whose status string is
		// `testing_staging` lives in a project that defines that key, but the
		// workspace does not. With per-project resolution, the name/color
		// comes from the project, NOT a workspace fallback.
		const ws = makeWs({ statuses: wsStatuses });
		const project = {
			customStatuses: [
				{
					key: "testing_staging",
					name: "Testing in staging",
					color: "#f97316",
				},
			],
		};
		const cfg = buildEffectiveIssueConfig(ws, project);
		expect(cfg.getStatusName("testing_staging")).toBe("Testing in staging");
		expect(cfg.getStatusColor("testing_staging")).toBe("#f97316");
		expect(cfg.statusItems.map((s) => s.id)).toEqual([
			"todo",
			"in_progress",
			"done",
			"testing_staging",
		]);
	});

	it("project override of a workspace key wins over workspace value", () => {
		const ws = makeWs({ statuses: wsStatuses });
		const project = {
			customStatuses: [
				{ key: "in_progress", name: "Working", color: "#ff00ff" },
			],
		};
		const cfg = buildEffectiveIssueConfig(ws, project);
		expect(cfg.getStatusName("in_progress")).toBe("Working");
		expect(cfg.getStatusColor("in_progress")).toBe("#ff00ff");
	});

	it("statusRecord and statusItems both reflect project overrides", () => {
		const ws = makeWs({ statuses: wsStatuses });
		const project = {
			customStatuses: [
				{ key: "qa_review", name: "QA Review", color: "#a855f7" },
			],
		};
		const cfg = buildEffectiveIssueConfig(ws, project);
		expect(cfg.statusRecord.qa_review).toEqual({
			label: "QA Review",
			icon: expect.anything(),
			colorHex: "#a855f7",
			category: expect.any(String),
		});
		const item = cfg.statusItems.find((s) => s.id === "qa_review");
		expect(item).toBeDefined();
		expect(item?.label).toBe("QA Review");
		expect(item?.colorHex).toBe("#a855f7");
	});

	it("applies project's customStatusOrder over the merged list", () => {
		const ws = makeWs({ statuses: wsStatuses });
		const project = {
			customStatuses: [{ key: "blocked", name: "Blocked", color: "#ef4444" }],
			customStatusOrder: ["blocked", "done", "in_progress", "todo"],
		};
		const cfg = buildEffectiveIssueConfig(ws, project);
		expect(cfg.statusItems.map((s) => s.id)).toEqual([
			"blocked",
			"done",
			"in_progress",
			"todo",
		]);
	});
});

describe("category-aware resolution (cross-project kanban)", () => {
	const wsStatuses = [
		{ key: "todo", name: "To Do", color: "#a3a3a3" },
		{ key: "in_progress", name: "In Progress", color: "#3b82f6" },
		{ key: "done", name: "Done", color: "#10b981" },
	];

	it("statusItems carry the resolved category", () => {
		const ws = makeWs({ statuses: wsStatuses });
		const project = {
			customStatuses: [
				{
					key: "testing_staging",
					name: "Testing in staging",
					color: "#f97316",
					category: "started" as const,
				},
			],
		};
		const cfg = buildEffectiveIssueConfig(ws, project);
		const testingItem = cfg.statusItems.find((s) => s.id === "testing_staging");
		expect(testingItem?.category).toBe("started");
		// Built-in keys still resolve via DEFAULT_STATUSES mapping.
		expect(cfg.statusItems.find((s) => s.id === "in_progress")?.category).toBe(
			"started",
		);
		expect(cfg.statusItems.find((s) => s.id === "done")?.category).toBe(
			"completed",
		);
	});

	it("getStatusCategory falls back to inference for unknown keys without explicit category", () => {
		const ws = makeWs({ statuses: wsStatuses });
		const project = {
			customStatuses: [
				// No explicit category — should be inferred via name keyword.
				{ key: "qa_review", name: "QA review", color: "#8b5cf6" },
			],
		};
		const cfg = buildEffectiveIssueConfig(ws, project);
		expect(cfg.getStatusCategory("qa_review")).toBe("started");
	});

	it("statusesByCategory groups items into the 5 buckets", () => {
		const ws = makeWs({ statuses: wsStatuses });
		const project = {
			customStatuses: [
				{
					key: "blocked",
					name: "Blocked",
					color: "#ef4444",
					category: "started" as const,
				},
				{
					key: "shipped",
					name: "Shipped",
					color: "#22c55e",
					category: "completed" as const,
				},
			],
		};
		const cfg = buildEffectiveIssueConfig(ws, project);
		expect(cfg.statusesByCategory.started.map((s) => s.id)).toEqual([
			"in_progress",
			"blocked",
		]);
		expect(cfg.statusesByCategory.completed.map((s) => s.id)).toEqual([
			"done",
			"shipped",
		]);
		expect(cfg.statusesByCategory.canceled).toEqual([]);
	});

	it("resolveStatusForCategory equivalent — find first matching status by display order", () => {
		// Cross-project kanban drag-drop logic: when dropping a card into a
		// category column, we resolve to the issue's project's *first* status
		// in that category (per `customStatusOrder` if set, else natural order).
		const ws = makeWs({ statuses: wsStatuses });
		const project = {
			customStatuses: [
				{
					key: "shipped",
					name: "Shipped",
					color: "#22c55e",
					category: "completed" as const,
				},
			],
			// User explicitly ordered `shipped` BEFORE `done` — drop on Done
			// column should resolve to `shipped` for this project.
			customStatusOrder: ["shipped", "done", "in_progress", "todo"],
		};
		const cfg = buildEffectiveIssueConfig(ws, project);
		const firstCompleted = cfg.statusItems.find(
			(s) => s.category === "completed",
		);
		expect(firstCompleted?.id).toBe("shipped");
	});

	it("resolveStatusForCategory equivalent — returns undefined when project has no matching status", () => {
		// Edge case: project deleted/never had a status in the target category.
		// The kanban handler should treat this as a no-op rather than guessing.
		const ws = makeWs({
			statuses: [
				// Workspace also has no `canceled`-category status.
				{ key: "todo", name: "To Do", color: "#a3a3a3" },
				{ key: "done", name: "Done", color: "#10b981" },
			],
		});
		const project = { customStatuses: [] };
		const cfg = buildEffectiveIssueConfig(ws, project);
		const firstCanceled = cfg.statusItems.find(
			(s) => s.category === "canceled",
		);
		expect(firstCanceled).toBeUndefined();
	});

	it("getProjectStatusesInCategory equivalent — returns every status in the bucket, in order", () => {
		// Cross-project drop disambiguation: when a bucket maps to more than
		// one status the board shows a picker. The picker is fed from this
		// list, so order + completeness matters.
		const ws = makeWs({
			statuses: [
				{ key: "triage", name: "Triage", color: "#f97316" },
				{ key: "backlog", name: "Backlog", color: "#6b7280" },
				{ key: "todo", name: "Todo", color: "#a3a3a3" },
				{ key: "done", name: "Done", color: "#10b981" },
			],
		});
		const project = {
			customStatuses: [
				{
					key: "icebox",
					name: "Icebox",
					color: "#94a3b8",
					category: "backlog" as const,
				},
			],
			// User ordered icebox before triage; the picker should respect that.
			customStatusOrder: ["icebox", "triage", "backlog", "todo", "done"],
		};
		const cfg = buildEffectiveIssueConfig(ws, project);
		const backlogStatuses = cfg.statusItems.filter(
			(s) => s.category === "backlog",
		);
		expect(backlogStatuses.map((s) => s.id)).toEqual([
			"icebox",
			"triage",
			"backlog",
		]);
	});

	it("getProjectStatusesInCategory equivalent — single match still returns an array of length 1", () => {
		// Single-match path: drop applies the status directly without showing
		// the picker. The hook must still return an array (not the bare item)
		// so the caller can branch on length.
		const ws = makeWs({
			statuses: [
				{ key: "todo", name: "Todo", color: "#a3a3a3" },
				{ key: "done", name: "Done", color: "#10b981" },
			],
		});
		const project = { customStatuses: [] };
		const cfg = buildEffectiveIssueConfig(ws, project);
		const unstarted = cfg.statusItems.filter((s) => s.category === "unstarted");
		expect(unstarted.map((s) => s.id)).toEqual(["todo"]);
	});
});
