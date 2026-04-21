import { describe, expect, it } from "vitest";
import { deriveScheduledSprintStatus } from "../../convex/sprints";

const DAY = 86_400_000;

describe("deriveScheduledSprintStatus", () => {
	const now = 1_800_000_000_000;

	it("returns null when the user manually overrode the status", () => {
		expect(
			deriveScheduledSprintStatus(
				{
					status: "planned",
					statusOverride: true,
					startDate: now - DAY,
					endDate: now + DAY,
				},
				now,
			),
		).toBeNull();
	});

	it("returns null for terminal statuses (completed, cancelled)", () => {
		expect(
			deriveScheduledSprintStatus(
				{ status: "completed", endDate: now + DAY },
				now,
			),
		).toBeNull();
		expect(
			deriveScheduledSprintStatus(
				{ status: "cancelled", endDate: now + DAY },
				now,
			),
		).toBeNull();
	});

	it("flips planned → active when startDate has passed", () => {
		expect(
			deriveScheduledSprintStatus(
				{ status: "planned", startDate: now - DAY, endDate: now + DAY },
				now,
			),
		).toBe("active");
	});

	it("keeps planned when startDate is in the future", () => {
		expect(
			deriveScheduledSprintStatus(
				{ status: "planned", startDate: now + DAY, endDate: now + 2 * DAY },
				now,
			),
		).toBeNull();
	});

	it("flips active → completed when endDate has passed", () => {
		expect(
			deriveScheduledSprintStatus(
				{ status: "active", startDate: now - 2 * DAY, endDate: now - DAY },
				now,
			),
		).toBe("completed");
	});

	it("flips planned → completed when endDate has passed without an explicit active transition first", () => {
		// Covers a dormant-sprint case where the cron hasn't run in a
		// while and both transitions should collapse to the newer one.
		expect(
			deriveScheduledSprintStatus(
				{ status: "planned", startDate: now - 2 * DAY, endDate: now - DAY },
				now,
			),
		).toBe("completed");
	});

	it("falls back to targetDate when endDate is missing", () => {
		expect(
			deriveScheduledSprintStatus(
				{ status: "active", targetDate: now - DAY },
				now,
			),
		).toBe("completed");
	});

	it("returns null when there are no scheduled dates at all", () => {
		expect(deriveScheduledSprintStatus({ status: "planned" }, now)).toBeNull();
		expect(deriveScheduledSprintStatus({ status: "active" }, now)).toBeNull();
	});
});
