import { describe, expect, it } from "vitest";

import { sprintIdFromSingleMilestoneFilter } from "@/components/issues/MyIssuesFilterPopover";
import type { Id } from "../../convex/_generated/dataModel";

describe("sprintIdFromSingleMilestoneFilter", () => {
	it("returns undefined when zero or multiple milestone/sprint ids are selected", () => {
		expect(sprintIdFromSingleMilestoneFilter([])).toBeUndefined();
		expect(sprintIdFromSingleMilestoneFilter(["a", "b"])).toBeUndefined();
	});

	it("returns the sprint id when exactly one is selected", () => {
		const only = "abc" as Id<"sprints">;
		expect(sprintIdFromSingleMilestoneFilter([only])).toBe(only);
	});
});
