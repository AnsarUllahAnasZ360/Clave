import { describe, expect, it } from "vitest";
import { effectiveAssigneeIds } from "@/components/issues/MultiAssigneePicker";

describe("effectiveAssigneeIds", () => {
	it("returns empty when no assignees are set", () => {
		expect(effectiveAssigneeIds({})).toEqual([]);
		expect(
			effectiveAssigneeIds({ assigneeId: undefined, assigneeIds: undefined }),
		).toEqual([]);
		expect(effectiveAssigneeIds({ assigneeIds: [] })).toEqual([]);
	});

	it("returns a single id from the legacy field", () => {
		expect(effectiveAssigneeIds({ assigneeId: "u1" })).toEqual(["u1"]);
	});

	it("returns the multi array as-is when only multi is set", () => {
		expect(effectiveAssigneeIds({ assigneeIds: ["u1", "u2", "u3"] })).toEqual([
			"u1",
			"u2",
			"u3",
		]);
	});

	it("dedupes when legacy id is also present in multi array", () => {
		// This is the half-migrated record case: multi was written, legacy was
		// mirrored to the first element. Reading it must not produce duplicates.
		expect(
			effectiveAssigneeIds({
				assigneeId: "u1",
				assigneeIds: ["u1", "u2"],
			}),
		).toEqual(["u1", "u2"]);
	});

	it("includes legacy id when it is NOT in the multi array", () => {
		// Defensive: if some old code path patched assigneeId without touching
		// assigneeIds, we still surface that user as assigned.
		expect(
			effectiveAssigneeIds({
				assigneeId: "u3",
				assigneeIds: ["u1", "u2"],
			}),
		).toEqual(["u1", "u2", "u3"]);
	});
});
