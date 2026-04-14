import { getAuthUserId } from "@convex-dev/auth/server";
import { ConvexError, v } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";
import { CHANGELOG_ENTRIES } from "./changelogEntries";

/** List all app versions in reverse chronological order */
export const list = query({
	args: {},
	returns: v.array(
		v.object({
			_id: v.id("appVersions"),
			_creationTime: v.number(),
			version: v.string(),
			releasedAt: v.number(),
			title: v.string(),
			features: v.array(v.string()),
			bugFixes: v.array(v.string()),
		}),
	),
	handler: async (ctx) => {
		const versions = await ctx.db
			.query("appVersions")
			.withIndex("by_released")
			.order("desc")
			.collect();
		return versions;
	},
});

/** Get the latest app version */
export const getLatest = query({
	args: {},
	returns: v.union(
		v.object({
			_id: v.id("appVersions"),
			_creationTime: v.number(),
			version: v.string(),
			releasedAt: v.number(),
			title: v.string(),
			features: v.array(v.string()),
			bugFixes: v.array(v.string()),
		}),
		v.null(),
	),
	handler: async (ctx) => {
		const latest = await ctx.db
			.query("appVersions")
			.withIndex("by_released")
			.order("desc")
			.first();
		return latest;
	},
});

/** Mark the latest version as seen by the current user */
export const markSeen = mutation({
	args: { version: v.string() },
	returns: v.null(),
	handler: async (ctx, args) => {
		const userId = await getAuthUserId(ctx);
		if (!userId) throw new ConvexError("Not authenticated");
		await ctx.db.patch(userId, { lastSeenVersion: args.version });
		return null;
	},
});

/**
 * Reconcile the `appVersions` table against `CHANGELOG_ENTRIES` — the
 * in-code source of truth. Idempotent per-version, so every client (and the
 * CLI) can call this freely; only genuinely missing rows get inserted.
 *
 * The frontend calls this once per workspace session (see `WhatsNewPopup`),
 * which means **pushing a new release to prod auto-seeds the entry the next
 * time any authenticated user opens the workspace** — no manual dashboard
 * run, no deploy-time hook, no drift between code and data.
 */
export const syncChangelog = mutation({
	args: {},
	returns: v.number(),
	handler: async (ctx) => {
		const userId = await getAuthUserId(ctx);
		if (!userId) throw new ConvexError("Not authenticated");

		const existing = await ctx.db.query("appVersions").collect();
		const existingVersions = new Set(existing.map((v) => v.version));

		let inserted = 0;
		for (const entry of CHANGELOG_ENTRIES) {
			if (existingVersions.has(entry.version)) continue;
			await ctx.db.insert("appVersions", {
				version: entry.version,
				releasedAt: new Date(entry.releasedAt).getTime(),
				title: entry.title,
				features: entry.features,
				bugFixes: entry.bugFixes,
			});
			inserted++;
		}
		return inserted;
	},
});

/**
 * Internal variant of `syncChangelog` — no auth, CLI-runnable via
 * `bunx convex run versions:syncChangelogInternal`. Useful for initial
 * prod seeding or if you want to seed from a CI step rather than waiting
 * for the first authed client to hit the workspace.
 */
export const syncChangelogInternal = internalMutation({
	args: {},
	returns: v.number(),
	handler: async (ctx) => {
		const existing = await ctx.db.query("appVersions").collect();
		const existingVersions = new Set(existing.map((v) => v.version));

		let inserted = 0;
		for (const entry of CHANGELOG_ENTRIES) {
			if (existingVersions.has(entry.version)) continue;
			await ctx.db.insert("appVersions", {
				version: entry.version,
				releasedAt: new Date(entry.releasedAt).getTime(),
				title: entry.title,
				features: entry.features,
				bugFixes: entry.bugFixes,
			});
			inserted++;
		}
		return inserted;
	},
});

/**
 * Clear `lastSeenVersion` on every user so the WhatsNewPopup fires again
 * the next time they load a workspace page. Only useful in dev — call
 * explicitly if you've dismissed the latest popup and want to re-see it.
 */
export const resetLastSeenForAll = internalMutation({
	args: {},
	returns: v.number(),
	handler: async (ctx) => {
		const users = await ctx.db.query("users").collect();
		let cleared = 0;
		for (const user of users) {
			if (user.lastSeenVersion !== undefined) {
				await ctx.db.patch(user._id, { lastSeenVersion: undefined });
				cleared++;
			}
		}
		return cleared;
	},
});
