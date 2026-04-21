import { describe, expect, it } from "vitest";
import { buildBurndownSeries } from "../../convex/sprints";

const DAY = 86_400_000;
const MIDNIGHT = 1_800_000_000_000 - (1_800_000_000_000 % DAY);

describe("buildBurndownSeries", () => {
	it("returns empty when endDate <= startDate", () => {
		expect(
			buildBurndownSeries({
				startDate: MIDNIGHT,
				endDate: MIDNIGHT,
				totalIssues: 10,
				completedTimestamps: [],
			}),
		).toEqual([]);
	});

	it("emits one sample per day with a linear ideal", () => {
		// 5-day sprint, 10 issues committed, none completed yet, `now` is
		// the start so every day after the first is in the future.
		const start = MIDNIGHT;
		const end = MIDNIGHT + 5 * DAY;
		const series = buildBurndownSeries({
			startDate: start,
			endDate: end,
			totalIssues: 10,
			completedTimestamps: [],
			now: start,
		});
		expect(series.length).toBe(5);
		// Ideal descends linearly from (10 - 10/5) = 8 on day 1 to 0 on day 5.
		expect(series.map((p) => p.ideal)).toEqual([8, 6, 4, 2, 0]);
	});

	it("marks future-day remaining as null while still drawing the ideal line", () => {
		const start = MIDNIGHT;
		const end = MIDNIGHT + 3 * DAY;
		const now = MIDNIGHT + DAY; // into day 2, day 3 is future
		const series = buildBurndownSeries({
			startDate: start,
			endDate: end,
			totalIssues: 6,
			completedTimestamps: [],
			now,
		});
		expect(series.length).toBe(3);
		expect(series[0].remaining).toBe(6);
		expect(series[2].remaining).toBeNull();
		expect(series[2].ideal).toBe(0);
	});

	it("subtracts completed issues from remaining as their completedAt crosses each day boundary", () => {
		const start = MIDNIGHT;
		const end = MIDNIGHT + 4 * DAY;
		const now = end; // all days are in the past
		const series = buildBurndownSeries({
			startDate: start,
			endDate: end,
			totalIssues: 4,
			completedTimestamps: [
				MIDNIGHT + DAY / 2, // day 1
				MIDNIGHT + 2 * DAY + DAY / 2, // day 3
			],
			now,
		});
		expect(series.map((p) => p.remaining)).toEqual([3, 3, 2, 2]);
	});
});
