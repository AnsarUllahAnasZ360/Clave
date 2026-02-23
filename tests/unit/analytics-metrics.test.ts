import { describe, expect, it } from "vitest";
import {
	computeHealth,
	isClosedStatus,
	isDoneStatus,
	isWipStatus,
	mapIssueTypeToWorkCategory,
	median,
	roundToOneDecimal,
} from "../../convex/lib/analyticsMetrics";

describe("analytics metrics helpers", () => {
	it("classifies statuses correctly", () => {
		expect(isDoneStatus("done")).toBe(true);
		expect(isDoneStatus("cancelled")).toBe(false);

		expect(isClosedStatus("done")).toBe(true);
		expect(isClosedStatus("cancelled")).toBe(true);
		expect(isClosedStatus("in_progress")).toBe(false);

		expect(isWipStatus("triage")).toBe(true);
		expect(isWipStatus("todo")).toBe(true);
		expect(isWipStatus("in_progress")).toBe(true);
		expect(isWipStatus("in_review")).toBe(true);
		expect(isWipStatus("backlog")).toBe(false);
		expect(isWipStatus("done")).toBe(false);
	});

	it("maps issue types to work categories", () => {
		expect(mapIssueTypeToWorkCategory("bug")).toBe("bug");
		expect(mapIssueTypeToWorkCategory("improvement")).toBe("improvement");
		expect(mapIssueTypeToWorkCategory("feature")).toBe("feature");
		expect(mapIssueTypeToWorkCategory("issue")).toBe("issue");
		expect(mapIssueTypeToWorkCategory("unknown")).toBe("issue");
	});

	it("computes median for odd and even sets", () => {
		expect(median([])).toBe(0);
		expect(median([4])).toBe(4);
		expect(median([1, 9, 3])).toBe(3);
		expect(median([1, 2, 9, 10])).toBe(5.5);
	});

	it("rounds values to one decimal", () => {
		expect(roundToOneDecimal(3.14)).toBe(3.1);
		expect(roundToOneDecimal(3.15)).toBe(3.2);
		expect(roundToOneDecimal(0)).toBe(0);
	});

	it("computes health labels by progress vs schedule", () => {
		expect(computeHealth("completed", 100, 100)).toEqual({
			label: "Completed",
			tone: "positive",
		});
		expect(computeHealth("cancelled", 10, 80)).toEqual({
			label: "Cancelled",
			tone: "muted",
		});
		expect(computeHealth("active", 70, 60).label).toBe("Ahead");
		expect(computeHealth("active", 50, 80).label).toBe("At risk");
		expect(computeHealth("active", 20, 80).label).toBe("Behind");
	});
});
