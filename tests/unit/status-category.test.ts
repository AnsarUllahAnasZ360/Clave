import { describe, expect, it } from "vitest";
import { inferStatusCategory } from "../../convex/lib/statusCategory";

describe("inferStatusCategory — key-pattern matches", () => {
	it("classifies triage/inbox/new keys as backlog", () => {
		expect(inferStatusCategory({ key: "triage" })).toBe("backlog");
		expect(inferStatusCategory({ key: "inbox" })).toBe("backlog");
		expect(inferStatusCategory({ key: "new" })).toBe("backlog");
		expect(inferStatusCategory({ key: "needs_triage" })).toBe("backlog");
	});

	it("classifies backlog/icebox/someday keys as backlog", () => {
		expect(inferStatusCategory({ key: "backlog" })).toBe("backlog");
		expect(inferStatusCategory({ key: "icebox" })).toBe("backlog");
		expect(inferStatusCategory({ key: "someday" })).toBe("backlog");
	});

	it("classifies todo/ready/planned keys as unstarted", () => {
		expect(inferStatusCategory({ key: "todo" })).toBe("unstarted");
		expect(inferStatusCategory({ key: "ready" })).toBe("unstarted");
		expect(inferStatusCategory({ key: "planned" })).toBe("unstarted");
		expect(inferStatusCategory({ key: "up_next" })).toBe("unstarted");
	});

	it("classifies in_progress/doing/working keys as started", () => {
		expect(inferStatusCategory({ key: "in_progress" })).toBe("started");
		expect(inferStatusCategory({ key: "doing" })).toBe("started");
		expect(inferStatusCategory({ key: "working" })).toBe("started");
		expect(inferStatusCategory({ key: "wip" })).toBe("started");
	});

	it("classifies review/QA/testing/staging keys as started", () => {
		// Review/test states are still "in flight" — they belong with started.
		expect(inferStatusCategory({ key: "in_review" })).toBe("started");
		expect(inferStatusCategory({ key: "review" })).toBe("started");
		expect(inferStatusCategory({ key: "qa" })).toBe("started");
		expect(inferStatusCategory({ key: "testing" })).toBe("started");
		expect(inferStatusCategory({ key: "staging" })).toBe("started");
		expect(inferStatusCategory({ key: "uat" })).toBe("started");
		expect(inferStatusCategory({ key: "blocked" })).toBe("started");
		expect(inferStatusCategory({ key: "on_hold" })).toBe("started");
	});

	it("classifies done/shipped/closed keys as completed", () => {
		expect(inferStatusCategory({ key: "done" })).toBe("completed");
		expect(inferStatusCategory({ key: "completed" })).toBe("completed");
		expect(inferStatusCategory({ key: "shipped" })).toBe("completed");
		expect(inferStatusCategory({ key: "deployed" })).toBe("completed");
		expect(inferStatusCategory({ key: "released" })).toBe("completed");
		expect(inferStatusCategory({ key: "closed" })).toBe("completed");
		expect(inferStatusCategory({ key: "merged" })).toBe("completed");
	});

	it("classifies cancelled/wontfix/rejected/duplicate keys as canceled", () => {
		expect(inferStatusCategory({ key: "cancelled" })).toBe("canceled");
		expect(inferStatusCategory({ key: "canceled" })).toBe("canceled");
		expect(inferStatusCategory({ key: "wontfix" })).toBe("canceled");
		expect(inferStatusCategory({ key: "rejected" })).toBe("canceled");
		expect(inferStatusCategory({ key: "duplicate" })).toBe("canceled");
		expect(inferStatusCategory({ key: "invalid" })).toBe("canceled");
		expect(inferStatusCategory({ key: "archived" })).toBe("canceled");
	});
});

describe("inferStatusCategory — name-keyword fallback", () => {
	it("uses name keywords when key is opaque", () => {
		// User created a status with key "abc123" but named it "In progress"
		expect(inferStatusCategory({ key: "abc123", name: "In progress" })).toBe(
			"started",
		);
		expect(
			inferStatusCategory({ key: "stage_3", name: "Testing in staging" }),
		).toBe("started");
		expect(inferStatusCategory({ key: "x", name: "QA review" })).toBe(
			"started",
		);
		expect(inferStatusCategory({ key: "y", name: "Shipped to prod" })).toBe(
			"completed",
		);
		expect(inferStatusCategory({ key: "z", name: "Won't fix" })).toBe(
			"canceled",
		);
	});

	it("matches name keywords case-insensitively", () => {
		expect(inferStatusCategory({ key: "x", name: "DONE" })).toBe("completed");
		expect(inferStatusCategory({ key: "x", name: "ToDo" })).toBe("unstarted");
	});
});

describe("inferStatusCategory — fallback default", () => {
	it("returns 'unstarted' when nothing matches", () => {
		// Truly opaque status with no useful key or name signals.
		expect(inferStatusCategory({ key: "zxqf" })).toBe("unstarted");
		expect(inferStatusCategory({ key: "zxqf", name: "Whatever" })).toBe(
			"unstarted",
		);
	});

	it("returns 'unstarted' when name is missing and key has no signal", () => {
		expect(inferStatusCategory({ key: "qq_42" })).toBe("unstarted");
	});
});

describe("inferStatusCategory — precedence (key beats name)", () => {
	it("uses key match even if name suggests different category", () => {
		// User has a "done" key but names it "Backlog" — key wins because it's
		// more authoritative; renaming a default key is rare and the key is the
		// canonical anchor.
		expect(inferStatusCategory({ key: "done", name: "Backlog" })).toBe(
			"completed",
		);
		expect(inferStatusCategory({ key: "in_progress", name: "Cancelled" })).toBe(
			"started",
		);
	});
});
