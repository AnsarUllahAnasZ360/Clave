import { describe, expect, it } from "vitest";
import { CHANGELOG_ENTRIES } from "../../convex/changelogEntries";

describe("CHANGELOG_ENTRIES source of truth", () => {
	it("has at least one entry", () => {
		expect(CHANGELOG_ENTRIES.length).toBeGreaterThan(0);
	});

	it("uses unique version strings (idempotency key)", () => {
		const versions = CHANGELOG_ENTRIES.map((e) => e.version);
		const unique = new Set(versions);
		expect(unique.size).toBe(versions.length);
	});

	it("ships every entry with a title, features array, and bugFixes array", () => {
		for (const entry of CHANGELOG_ENTRIES) {
			expect(entry.version).toBeTypeOf("string");
			expect(entry.version.length).toBeGreaterThan(0);
			expect(entry.title).toBeTypeOf("string");
			expect(entry.title.length).toBeGreaterThan(0);
			expect(Array.isArray(entry.features)).toBe(true);
			expect(Array.isArray(entry.bugFixes)).toBe(true);
		}
	});

	it("uses ISO-8601 releasedAt strings that parse to valid dates", () => {
		for (const entry of CHANGELOG_ENTRIES) {
			const ms = new Date(entry.releasedAt).getTime();
			expect(Number.isFinite(ms)).toBe(true);
		}
	});

	it("sorts entries in descending release date order", () => {
		// The Changelog dialog renders these straight from the array, so a
		// wrong order in source would also surface in the UI. Guard it here
		// instead of leaving it to visual review.
		for (let i = 1; i < CHANGELOG_ENTRIES.length; i++) {
			const prev = new Date(CHANGELOG_ENTRIES[i - 1].releasedAt).getTime();
			const curr = new Date(CHANGELOG_ENTRIES[i].releasedAt).getTime();
			expect(prev).toBeGreaterThanOrEqual(curr);
		}
	});

	it("includes v0.3.0 (active sprints + doc-aware AI)", () => {
		const v030 = CHANGELOG_ENTRIES.find((e) => e.version === "0.3.0");
		expect(v030).toBeDefined();
		expect(v030?.title).toContain("Active Sprints");
		expect(v030?.features.length).toBeGreaterThan(0);
		expect(v030?.bugFixes.length).toBeGreaterThan(0);
	});
});
