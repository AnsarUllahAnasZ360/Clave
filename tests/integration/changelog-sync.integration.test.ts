/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { internal } from "../../convex/_generated/api";
import { CHANGELOG_ENTRIES } from "../../convex/changelogEntries";
import schema from "../../convex/schema";

const modules = import.meta.glob("../../convex/**/*.*s");

function createBackend() {
	return convexTest(schema, modules);
}

describe("changelog sync (integration)", () => {
	it("seeds every source entry into appVersions on first run", async () => {
		const t = createBackend();

		const inserted = await t.mutation(
			internal.versions.syncChangelogInternal,
			{},
		);
		// Upsert touches every source entry on first run (no existing rows).
		expect(inserted).toBe(CHANGELOG_ENTRIES.length);

		const rows = await t.run((ctx) => ctx.db.query("appVersions").collect());
		expect(rows.length).toBe(CHANGELOG_ENTRIES.length);

		for (const entry of CHANGELOG_ENTRIES) {
			const row = rows.find((r) => r.version === entry.version);
			expect(row, `missing row for ${entry.version}`).toBeDefined();
			expect(row?.title).toBe(entry.title);
			expect(row?.features).toEqual(entry.features);
			expect(row?.bugFixes).toEqual(entry.bugFixes);
		}
	});

	it("is a no-op on the second run when source matches the DB", async () => {
		const t = createBackend();

		await t.mutation(internal.versions.syncChangelogInternal, {});
		// Second run: every entry is already in sync, nothing to touch.
		const touched = await t.mutation(
			internal.versions.syncChangelogInternal,
			{},
		);
		expect(touched).toBe(0);
	});

	it("patches drifted rows so post-release edits propagate", async () => {
		const t = createBackend();

		// Seed once.
		await t.mutation(internal.versions.syncChangelogInternal, {});

		// Simulate a stale row by rewriting its title + clearing its fixes,
		// as if an older version had been seeded before the constant was
		// reworded.
		const target = CHANGELOG_ENTRIES[0];
		await t.run(async (ctx) => {
			const row = await ctx.db
				.query("appVersions")
				.filter((q) => q.eq(q.field("version"), target.version))
				.first();
			if (!row) throw new Error("seed row missing");
			await ctx.db.patch(row._id, {
				title: "Old stale title",
				bugFixes: [],
			});
		});

		const touched = await t.mutation(
			internal.versions.syncChangelogInternal,
			{},
		);
		// Exactly one row drifted, so exactly one patch should fire.
		expect(touched).toBe(1);

		const row = await t.run((ctx) =>
			ctx.db
				.query("appVersions")
				.filter((q) => q.eq(q.field("version"), target.version))
				.first(),
		);
		expect(row?.title).toBe(target.title);
		expect(row?.bugFixes).toEqual(target.bugFixes);
	});

	it("pruneOrphanVersions removes rows whose version isn't in source", async () => {
		const t = createBackend();

		// Seed the real source, plus a rogue row that doesn't belong.
		await t.mutation(internal.versions.syncChangelogInternal, {});
		await t.run(async (ctx) => {
			await ctx.db.insert("appVersions", {
				version: "9.9.9-orphan",
				releasedAt: Date.now(),
				title: "Removed by mistake, resurrected by bug",
				features: [],
				bugFixes: [],
			});
		});

		const deleted = await t.mutation(internal.versions.pruneOrphanVersions, {});
		expect(deleted).toBe(1);

		const rows = await t.run((ctx) => ctx.db.query("appVersions").collect());
		expect(rows.find((r) => r.version === "9.9.9-orphan")).toBeUndefined();
		expect(rows.length).toBe(CHANGELOG_ENTRIES.length);
	});
});
