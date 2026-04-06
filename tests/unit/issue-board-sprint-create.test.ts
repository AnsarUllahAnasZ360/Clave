import { describe, expect, it } from "vitest";

import { resolveSprintIdForBoardCreate } from "@/components/issues/IssueBoardView";
import type { Id } from "../../convex/_generated/dataModel";

describe("resolveSprintIdForBoardCreate", () => {
	const rowSprint = "s1" as Id<"sprints">;
	const boardSprint = "s-board" as Id<"sprints">;

	it("uses swimlane row id for sprint/milestone swimlanes", () => {
		expect(resolveSprintIdForBoardCreate("sprint", rowSprint)).toBe(rowSprint);
		expect(resolveSprintIdForBoardCreate("milestone", rowSprint)).toBe(
			rowSprint,
		);
	});

	it("clears sprint for no-sprint row", () => {
		expect(
			resolveSprintIdForBoardCreate("sprint", "__no_sprint__"),
		).toBeUndefined();
	});

	it("uses board sprint context for assignee/priority/none swimlanes", () => {
		expect(resolveSprintIdForBoardCreate("assignee", "u1", boardSprint)).toBe(
			boardSprint,
		);
		expect(resolveSprintIdForBoardCreate("priority", "high", boardSprint)).toBe(
			boardSprint,
		);
		expect(resolveSprintIdForBoardCreate("none", "", boardSprint)).toBe(
			boardSprint,
		);
	});

	it("does not use board sprint when sprint swimlane supplies row id", () => {
		expect(
			resolveSprintIdForBoardCreate("sprint", rowSprint, boardSprint),
		).toBe(rowSprint);
	});
});
