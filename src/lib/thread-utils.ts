import { isThisMonth, isThisWeek, isThisYear, isToday } from "date-fns";

// ── Types ─────────────────────────────────────────────────────────────────

export type ThreadLike = {
	_id: string;
	updatedAt: number;
	title?: string;
	[key: string]: unknown;
};

export type TimePeriod =
	| "Today"
	| "This Week"
	| "This Month"
	| "This Year"
	| "Older";

export type GroupedThreads<T extends ThreadLike> = {
	label: TimePeriod;
	threads: T[];
};

// ── Time period classification ────────────────────────────────────────────

const PERIOD_ORDER: TimePeriod[] = [
	"Today",
	"This Week",
	"This Month",
	"This Year",
	"Older",
];

function classifyTimePeriod(timestamp: number): TimePeriod {
	const date = new Date(timestamp);
	if (isToday(date)) return "Today";
	if (isThisWeek(date)) return "This Week";
	if (isThisMonth(date)) return "This Month";
	if (isThisYear(date)) return "This Year";
	return "Older";
}

// ── Group threads by time period ──────────────────────────────────────────

/**
 * Groups threads into time period buckets (Today, This Week, This Month, This Year, Older).
 * Threads are assumed to already be sorted by updatedAt desc.
 * Empty groups are omitted from the result.
 */
export function groupThreadsByTimePeriod<T extends ThreadLike>(
	threads: T[],
): GroupedThreads<T>[] {
	const groups = new Map<TimePeriod, T[]>();

	for (const thread of threads) {
		const period = classifyTimePeriod(thread.updatedAt);
		const existing = groups.get(period);
		if (existing) {
			existing.push(thread);
		} else {
			groups.set(period, [thread]);
		}
	}

	// Return groups in chronological order, omitting empty ones
	const result: GroupedThreads<T>[] = [];
	for (const label of PERIOD_ORDER) {
		const groupThreads = groups.get(label);
		if (groupThreads && groupThreads.length > 0) {
			result.push({ label, threads: groupThreads });
		}
	}

	return result;
}

// ── Format relative date ──────────────────────────────────────────────────

/**
 * Format a timestamp into a short relative date label for display in the thread list.
 */
export function formatThreadDate(timestamp: number): string {
	const date = new Date(timestamp);
	const now = new Date();
	const diffMs = now.getTime() - date.getTime();
	const diffMins = Math.floor(diffMs / 60_000);
	const diffHours = Math.floor(diffMs / 3_600_000);
	const diffDays = Math.floor(diffMs / 86_400_000);

	if (diffMins < 1) return "Just now";
	if (diffMins < 60) return `${diffMins}m ago`;
	if (diffHours < 24) return `${diffHours}h ago`;
	if (diffDays < 7) return `${diffDays}d ago`;

	// For older dates, show the month and day
	return date.toLocaleDateString("en-US", {
		month: "short",
		day: "numeric",
		...(date.getFullYear() !== now.getFullYear() ? { year: "numeric" } : {}),
	});
}
