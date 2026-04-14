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
	it("seeds every source entry on first run", async () => {
		const t = createBackend();

		const result = await t.mutation(
			internal.versions.syncChangelogInternal,
			{},
		);
		expect(result.inserted).toBe(CHANGELOG_ENTRIES.length);
		expect(result.patched).toBe(0);
		expect(result.deleted).toBe(0);
		expect(result.usersReset).toBe(0);

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

	it("is a full no-op on the second run when source matches DB", async () => {
		const t = createBackend();

		await t.mutation(internal.versions.syncChangelogInternal, {});
		const second = await t.mutation(
			internal.versions.syncChangelogInternal,
			{},
		);
		expect(second).toEqual({
			inserted: 0,
			patched: 0,
			deleted: 0,
			usersReset: 0,
		});
	});

	it("patches drifted rows and resets lastSeenVersion for affected users", async () => {
		const t = createBackend();

		// Seed the full source, plus a user who dismissed the first entry.
		await t.mutation(internal.versions.syncChangelogInternal, {});
		const target = CHANGELOG_ENTRIES[0];
		const otherTarget = CHANGELOG_ENTRIES[1];
		const { dismissedUserId, otherUserId, untouchedUserId } = await t.run(
			async (ctx) => {
				const dismissed = await ctx.db.insert("users", {
					name: "Dismissed",
					lastSeenVersion: target.version,
				});
				const other = await ctx.db.insert("users", {
					name: "Other",
					lastSeenVersion: otherTarget?.version,
				});
				const untouched = await ctx.db.insert("users", {
					name: "Untouched",
				});
				// Simulate a drifted row for `target` — older title, cleared fixes.
				const row = await ctx.db
					.query("appVersions")
					.filter((q) => q.eq(q.field("version"), target.version))
					.first();
				if (!row) throw new Error("seed row missing");
				await ctx.db.patch(row._id, {
					title: "Stale title from a previous release",
					bugFixes: [],
				});
				return {
					dismissedUserId: dismissed,
					otherUserId: other,
					untouchedUserId: untouched,
				};
			},
		);

		const result = await t.mutation(
			internal.versions.syncChangelogInternal,
			{},
		);
		// Only `target` drifted, so exactly one patch + one cascade reset.
		expect(result.patched).toBe(1);
		expect(result.deleted).toBe(0);
		expect(result.usersReset).toBe(1);

		const row = await t.run((ctx) =>
			ctx.db
				.query("appVersions")
				.filter((q) => q.eq(q.field("version"), target.version))
				.first(),
		);
		expect(row?.title).toBe(target.title);
		expect(row?.bugFixes).toEqual(target.bugFixes);

		// Cascade verification: the user who dismissed `target` gets reset;
		// the user who dismissed a different version and the untouched user
		// are both left alone.
		const [dismissed, other, untouched] = await t.run((ctx) =>
			Promise.all([
				ctx.db.get(dismissedUserId),
				ctx.db.get(otherUserId),
				ctx.db.get(untouchedUserId),
			]),
		);
		expect(dismissed?.lastSeenVersion).toBeUndefined();
		expect(other?.lastSeenVersion).toBe(otherTarget?.version);
		expect(untouched?.lastSeenVersion).toBeUndefined();
	});

	it("deletes orphan rows and resets lastSeenVersion for users stuck on them", async () => {
		const t = createBackend();

		// Seed the real source, plus a rogue row that doesn't belong.
		await t.mutation(internal.versions.syncChangelogInternal, {});
		const { orphanDismisserId } = await t.run(async (ctx) => {
			await ctx.db.insert("appVersions", {
				version: "9.9.9-orphan",
				releasedAt: Date.now(),
				title: "Removed by mistake, resurrected by bug",
				features: [],
				bugFixes: [],
			});
			const orphanDismisser = await ctx.db.insert("users", {
				name: "Stuck on orphan",
				lastSeenVersion: "9.9.9-orphan",
			});
			return { orphanDismisserId: orphanDismisser };
		});

		const result = await t.mutation(
			internal.versions.syncChangelogInternal,
			{},
		);
		expect(result.deleted).toBe(1);
		expect(result.usersReset).toBe(1);

		const rows = await t.run((ctx) => ctx.db.query("appVersions").collect());
		expect(rows.find((r) => r.version === "9.9.9-orphan")).toBeUndefined();
		expect(rows.length).toBe(CHANGELOG_ENTRIES.length);

		// User who had dismissed the orphan is now free to see the real latest.
		const stuckUser = await t.run((ctx) => ctx.db.get(orphanDismisserId));
		expect(stuckUser?.lastSeenVersion).toBeUndefined();
	});
});
