import { describe, expect, it } from "vitest";
import {
	FOCUS_GROUP_LABELS,
	FOCUS_GROUP_ORDER,
	type FocusGroup,
	getFocusGroup,
	groupByFocus,
} from "../../src/lib/focus-grouping";

// ── Helpers ─────────────────────────────────────────────────────────────

function makeIssue(
	overrides: Partial<{
		_id: string;
		status: string;
		priority: string;
		sprintId: string;
		milestoneId: string;
	}> = {},
) {
	return {
		_id: overrides._id ?? "issue-1",
		status: overrides.status ?? "todo",
		priority: overrides.priority ?? "medium",
		sprintId: overrides.sprintId,
		milestoneId: overrides.milestoneId,
	};
}

// ── Tests ───────────────────────────────────────────────────────────────

describe("focus-grouping", () => {
	describe("FOCUS_GROUP_ORDER", () => {
		it("has exactly 8 tiers", () => {
			expect(FOCUS_GROUP_ORDER).toHaveLength(8);
		});

		it("starts with urgent and ends with cancelled", () => {
			expect(FOCUS_GROUP_ORDER[0]).toBe("urgent");
			expect(FOCUS_GROUP_ORDER[FOCUS_GROUP_ORDER.length - 1]).toBe("cancelled");
		});
	});

	describe("FOCUS_GROUP_LABELS", () => {
		it("has a label for every group", () => {
			for (const group of FOCUS_GROUP_ORDER) {
				expect(FOCUS_GROUP_LABELS[group]).toBeDefined();
				expect(typeof FOCUS_GROUP_LABELS[group]).toBe("string");
			}
		});
	});

	describe("getFocusGroup", () => {
		const noBlocking = new Set<string>();

		it("tier 1: urgent priority → urgent", () => {
			const issue = makeIssue({ priority: "urgent", status: "todo" });
			expect(getFocusGroup(issue, noBlocking)).toBe("urgent");
		});

		it("tier 2: blocking others → blocking", () => {
			const issue = makeIssue({ _id: "blocks-others", priority: "high" });
			const blocking = new Set(["blocks-others"]);
			expect(getFocusGroup(issue, blocking)).toBe("blocking");
		});

		it("tier 3: has sprintId → milestone", () => {
			const issue = makeIssue({ sprintId: "sprint-1", priority: "low" });
			expect(getFocusGroup(issue, noBlocking)).toBe("milestone");
		});

		it("tier 3: has milestoneId → milestone", () => {
			const issue = makeIssue({ milestoneId: "ms-1", priority: "low" });
			expect(getFocusGroup(issue, noBlocking)).toBe("milestone");
		});

		it("tier 4: in_progress → active", () => {
			const issue = makeIssue({ status: "in_progress" });
			expect(getFocusGroup(issue, noBlocking)).toBe("active");
		});

		it("tier 4: in_review → active", () => {
			const issue = makeIssue({ status: "in_review" });
			expect(getFocusGroup(issue, noBlocking)).toBe("active");
		});

		it("tier 5: triage → triage", () => {
			const issue = makeIssue({ status: "triage" });
			expect(getFocusGroup(issue, noBlocking)).toBe("triage");
		});

		it("tier 6: backlog → backlog", () => {
			const issue = makeIssue({ status: "backlog" });
			expect(getFocusGroup(issue, noBlocking)).toBe("backlog");
		});

		it("tier 6: todo → backlog", () => {
			const issue = makeIssue({ status: "todo" });
			expect(getFocusGroup(issue, noBlocking)).toBe("backlog");
		});

		it("tier 6: unknown status → backlog", () => {
			const issue = makeIssue({ status: "some_random_status" });
			expect(getFocusGroup(issue, noBlocking)).toBe("backlog");
		});

		it("tier 7: done → done", () => {
			const issue = makeIssue({
				status: "done",
				priority: "urgent",
			});
			expect(getFocusGroup(issue, noBlocking)).toBe("done");
		});

		it("tier 8: cancelled → cancelled", () => {
			const issue = makeIssue({
				status: "cancelled",
				priority: "urgent",
			});
			expect(getFocusGroup(issue, noBlocking)).toBe("cancelled");
		});

		it("done takes priority over urgent", () => {
			const issue = makeIssue({ status: "done", priority: "urgent" });
			expect(getFocusGroup(issue, noBlocking)).toBe("done");
		});

		it("urgent takes priority over blocking", () => {
			const issue = makeIssue({
				_id: "blocks-others",
				priority: "urgent",
			});
			const blocking = new Set(["blocks-others"]);
			expect(getFocusGroup(issue, blocking)).toBe("urgent");
		});
	});

	describe("groupByFocus", () => {
		it("returns empty array for empty input", () => {
			expect(groupByFocus([], new Set())).toEqual([]);
		});

		it("groups issues correctly and omits empty groups", () => {
			const issues = [
				makeIssue({ _id: "1", status: "todo", priority: "medium" }),
				makeIssue({ _id: "2", status: "in_progress", priority: "high" }),
				makeIssue({ _id: "3", status: "done", priority: "low" }),
			];
			const result = groupByFocus(issues, new Set());

			const groupNames = result.map((g) => g.group);
			expect(groupNames).toContain("active");
			expect(groupNames).toContain("backlog");
			expect(groupNames).toContain("done");
			// Tiers with no issues should be omitted
			expect(groupNames).not.toContain("urgent");
			expect(groupNames).not.toContain("blocking");
		});

		it("sorts within groups by priority (urgent > high > medium > low)", () => {
			const issues = [
				makeIssue({ _id: "1", status: "todo", priority: "low" }),
				makeIssue({ _id: "2", status: "todo", priority: "high" }),
				makeIssue({ _id: "3", status: "todo", priority: "medium" }),
			];
			const result = groupByFocus(issues, new Set());
			const backlog = result.find((g) => g.group === "backlog");
			expect(backlog).toBeDefined();
			expect(backlog?.issues.map((i) => i.priority)).toEqual([
				"high",
				"medium",
				"low",
			]);
		});

		it("sorts started issues before non-started within same priority", () => {
			const issues = [
				makeIssue({
					_id: "1",
					status: "todo",
					priority: "medium",
					sprintId: "s1",
				}),
				makeIssue({
					_id: "2",
					status: "in_progress",
					priority: "medium",
					sprintId: "s1",
				}),
			];
			const result = groupByFocus(issues, new Set());
			const milestone = result.find((g) => g.group === "milestone");
			expect(milestone).toBeDefined();
			expect(milestone?.issues[0]._id).toBe("2"); // in_progress first
		});

		it("groups are ordered according to FOCUS_GROUP_ORDER", () => {
			const issues = [
				makeIssue({ _id: "1", status: "cancelled" }),
				makeIssue({ _id: "2", priority: "urgent", status: "todo" }),
				makeIssue({ _id: "3", status: "done" }),
				makeIssue({ _id: "4", status: "triage" }),
			];
			const result = groupByFocus(issues, new Set());
			const groupNames = result.map((g) => g.group);
			// Verify ordering: urgent < triage < done < cancelled
			expect(groupNames.indexOf("urgent")).toBeLessThan(
				groupNames.indexOf("triage"),
			);
			expect(groupNames.indexOf("triage")).toBeLessThan(
				groupNames.indexOf("done"),
			);
			expect(groupNames.indexOf("done")).toBeLessThan(
				groupNames.indexOf("cancelled"),
			);
		});

		it("each result has a label from FOCUS_GROUP_LABELS", () => {
			const issues = [makeIssue({ _id: "1", status: "in_progress" })];
			const result = groupByFocus(issues, new Set());
			for (const group of result) {
				expect(group.label).toBe(FOCUS_GROUP_LABELS[group.group as FocusGroup]);
			}
		});
	});
});
