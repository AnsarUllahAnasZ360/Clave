import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	formatThreadDate,
	groupThreadsByTimePeriod,
	type ThreadLike,
} from "../../src/lib/thread-utils";

function makeThread(id: string, updatedAt: number, title?: string): ThreadLike {
	return { _id: id, updatedAt, title };
}

describe("thread-utils", () => {
	beforeEach(() => {
		vi.useFakeTimers();
		// Fixed "now" at 2026-02-15 12:00:00 UTC (Sunday)
		vi.setSystemTime(new Date("2026-02-15T12:00:00Z"));
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	describe("formatThreadDate", () => {
		it("returns 'Just now' for less than 1 minute ago", () => {
			expect(formatThreadDate(Date.now() - 30_000)).toBe("Just now");
			expect(formatThreadDate(Date.now())).toBe("Just now");
		});

		it("returns minutes for less than 1 hour ago", () => {
			expect(formatThreadDate(Date.now() - 5 * 60_000)).toBe("5m ago");
		});

		it("returns hours for less than 24 hours ago", () => {
			expect(formatThreadDate(Date.now() - 3 * 3_600_000)).toBe("3h ago");
		});

		it("returns days for less than 7 days ago", () => {
			expect(formatThreadDate(Date.now() - 3 * 86_400_000)).toBe("3d ago");
		});

		it("returns formatted date for 7+ days ago", () => {
			const result = formatThreadDate(Date.now() - 14 * 86_400_000);
			expect(result).not.toContain("ago");
			// Should be a short date like "Feb 1"
			expect(result).toMatch(/\w+ \d+/);
		});

		it("includes year for dates from a different year", () => {
			// Go to 2025 (different year from our fake 2026)
			const oldDate = new Date("2025-06-15T12:00:00Z").getTime();
			const result = formatThreadDate(oldDate);
			expect(result).toContain("2025");
		});
	});

	describe("groupThreadsByTimePeriod", () => {
		it("returns empty array for empty input", () => {
			expect(groupThreadsByTimePeriod([])).toEqual([]);
		});

		it("groups a today thread into Today", () => {
			const threads = [makeThread("1", Date.now() - 60_000, "Recent")];
			const groups = groupThreadsByTimePeriod(threads);
			expect(groups).toHaveLength(1);
			expect(groups[0].label).toBe("Today");
			expect(groups[0].threads).toHaveLength(1);
		});

		it("groups threads into multiple time periods", () => {
			const now = Date.now();
			const threads = [
				makeThread("today", now - 60_000),
				makeThread("yesterday", now - 2 * 86_400_000), // 2 days ago (same week)
				makeThread("last-month", now - 20 * 86_400_000), // 20 days ago
				makeThread("old", new Date("2024-01-01").getTime()), // 2 years ago
			];
			const groups = groupThreadsByTimePeriod(threads);
			expect(groups.length).toBeGreaterThanOrEqual(2);
			const labels = groups.map((g) => g.label);
			expect(labels).toContain("Today");
		});

		it("omits empty groups", () => {
			const threads = [makeThread("1", Date.now() - 60_000)];
			const groups = groupThreadsByTimePeriod(threads);
			for (const group of groups) {
				expect(group.threads.length).toBeGreaterThan(0);
			}
		});

		it("groups are in chronological order (Today first, Older last)", () => {
			const now = Date.now();
			const threads = [
				makeThread("old", new Date("2023-01-01").getTime()),
				makeThread("today", now - 60_000),
			];
			const groups = groupThreadsByTimePeriod(threads);
			const labels = groups.map((g) => g.label);
			if (labels.includes("Today") && labels.includes("Older")) {
				expect(labels.indexOf("Today")).toBeLessThan(labels.indexOf("Older"));
			}
		});
	});
});
