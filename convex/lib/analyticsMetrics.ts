export const MS_DAY = 1000 * 60 * 60 * 24;

export type HealthTone =
	| "positive"
	| "warning"
	| "danger"
	| "neutral"
	| "muted";

export function clamp(val: number, min: number, max: number): number {
	return Math.min(max, Math.max(min, val));
}

export function isDoneStatus(status: string): boolean {
	return status === "done";
}

export function isClosedStatus(status: string): boolean {
	return status === "done" || status === "cancelled";
}

export function isWipStatus(status: string): boolean {
	return (
		status === "triage" ||
		status === "todo" ||
		status === "in_progress" ||
		status === "in_review"
	);
}

export function mapIssueTypeToWorkCategory(
	type: string,
): "bug" | "improvement" | "feature" | "issue" {
	if (type === "bug") return "bug";
	if (type === "improvement") return "improvement";
	if (type === "feature") return "feature";
	return "issue";
}

export function computeHealth(
	status: string,
	progress: number,
	scheduleProgress: number,
): { label: string; tone: HealthTone } {
	if (status === "completed") return { label: "Completed", tone: "positive" };
	if (status === "cancelled") return { label: "Cancelled", tone: "muted" };

	if (scheduleProgress === 0 || progress >= scheduleProgress * 0.75) {
		const variance = progress - scheduleProgress;
		if (variance >= 8) return { label: "Ahead", tone: "positive" };
		return { label: "On track", tone: "neutral" };
	}
	if (progress >= scheduleProgress * 0.5) {
		return { label: "At risk", tone: "warning" };
	}
	return { label: "Behind", tone: "danger" };
}

export function roundToOneDecimal(value: number): number {
	return Math.round(value * 10) / 10;
}

export function median(values: number[]): number {
	if (values.length === 0) return 0;
	const sorted = [...values].sort((a, b) => a - b);
	const mid = Math.floor(sorted.length / 2);
	if (sorted.length % 2 === 0) {
		return (sorted[mid - 1] + sorted[mid]) / 2;
	}
	return sorted[mid];
}
