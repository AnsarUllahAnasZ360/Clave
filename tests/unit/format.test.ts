import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { formatCommentTime, formatRelativeTime } from "../../src/lib/format";

describe("format", () => {
	beforeEach(() => {
		vi.useFakeTimers();
		// Fixed "now" at 2026-01-15 12:00:00 UTC
		vi.setSystemTime(new Date("2026-01-15T12:00:00Z"));
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	describe("formatCommentTime", () => {
		it("returns 'now' for timestamps less than 1 minute ago", () => {
			expect(formatCommentTime(Date.now() - 30_000)).toBe("now");
			expect(formatCommentTime(Date.now())).toBe("now");
		});

		it("returns minutes for timestamps less than 1 hour ago", () => {
			expect(formatCommentTime(Date.now() - 5 * 60_000)).toBe("5m");
			expect(formatCommentTime(Date.now() - 59 * 60_000)).toBe("59m");
		});

		it("returns hours for timestamps less than 24 hours ago", () => {
			expect(formatCommentTime(Date.now() - 2 * 3_600_000)).toBe("2h");
			expect(formatCommentTime(Date.now() - 23 * 3_600_000)).toBe("23h");
		});

		it("returns days for timestamps 24+ hours ago", () => {
			expect(formatCommentTime(Date.now() - 3 * 86_400_000)).toBe("3d");
			expect(formatCommentTime(Date.now() - 30 * 86_400_000)).toBe("30d");
		});
	});

	describe("formatRelativeTime", () => {
		it("returns 'just now' for timestamps less than 1 minute ago", () => {
			expect(formatRelativeTime(Date.now() - 30_000)).toBe("just now");
			expect(formatRelativeTime(Date.now())).toBe("just now");
		});

		it("returns minutes for timestamps less than 1 hour ago", () => {
			expect(formatRelativeTime(Date.now() - 5 * 60_000)).toBe("5m ago");
		});

		it("returns hours for timestamps less than 24 hours ago", () => {
			expect(formatRelativeTime(Date.now() - 2 * 3_600_000)).toBe("2h ago");
		});

		it("returns days for timestamps less than 7 days ago", () => {
			expect(formatRelativeTime(Date.now() - 3 * 86_400_000)).toBe("3d ago");
		});

		it("returns locale date string for timestamps 7+ days ago", () => {
			const result = formatRelativeTime(Date.now() - 14 * 86_400_000);
			// Should be a date string, not a relative time
			expect(result).not.toContain("ago");
			expect(result).not.toBe("just now");
		});
	});
});
