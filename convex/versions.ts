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
type DbShape = {
	query: (t: "appVersions" | "users") => {
		collect: () => Promise<unknown[]>;
	};
	insert: (t: "appVersions", doc: unknown) => Promise<unknown>;
	patch: (id: unknown, patch: unknown) => Promise<void>;
	delete: (id: unknown) => Promise<void>;
};

type ReconcileResult = {
	inserted: number;
	patched: number;
	deleted: number;
	usersReset: number;
};

/**
 * Full three-way reconcile between the in-code `CHANGELOG_ENTRIES` source
 * of truth and the `appVersions` table, with cascade cleanup of any
 * `users.lastSeenVersion` pointers that reference touched rows.
 *
 * Why all three operations in one pass:
 * - **Insert** missing entries (new release shipped).
 * - **Patch** entries whose content has drifted (you re-worded a line
 *   after shipping).
 * - **Delete** rows whose version isn't in the source anymore (release
 *   was retracted or consolidated into another version).
 * - **Reset** `lastSeenVersion` on every user whose dismissal pointer
 *   matches a row that was just patched or deleted, so the `WhatsNewPopup`
 *   card shows up again with the corrected content.
 *
 * Idempotent — on a no-op run all four counters are 0, no writes fire.
 *
 * Runs on every authed workspace load via `WhatsNewPopup`, so the first
 * client to open the app after a deploy reconciles prod automatically.
 * No Convex dashboard or CLI access is required for any of the three
 * edit paths (insert / patch / delete).
 */
async function reconcileChangelog(ctx: {
	db: DbShape;
}): Promise<ReconcileResult> {
	type AppVersionRow = {
		_id: unknown;
		version: string;
		releasedAt: number;
		title: string;
		features: string[];
		bugFixes: string[];
	};
	type UserRow = { _id: unknown; lastSeenVersion?: string };

	const existing = (await ctx.db
		.query("appVersions")
		.collect()) as AppVersionRow[];
	const byVersion = new Map(existing.map((row) => [row.version, row]));
	const sourceVersions = new Set(CHANGELOG_ENTRIES.map((e) => e.version));

	// Collect every version string whose row's *content* (or existence)
	// changes on this run. Users whose lastSeenVersion is in this set need
	// to see the popup card again.
	const touchedVersions = new Set<string>();

	let inserted = 0;
	let patched = 0;
	let deleted = 0;

	for (const entry of CHANGELOG_ENTRIES) {
		const row = byVersion.get(entry.version);
		const releasedAtMs = new Date(entry.releasedAt).getTime();

		if (!row) {
			await ctx.db.insert("appVersions", {
				version: entry.version,
				releasedAt: releasedAtMs,
				title: entry.title,
				features: entry.features,
				bugFixes: entry.bugFixes,
			});
			inserted++;
			// New version → anyone whose lastSeenVersion was the previous
			// latest should see the popup again. That happens naturally
			// because `getLatest` will now return this new row and the
			// gate `user.lastSeenVersion !== latest.version` evaluates
			// to true without any reset.
			continue;
		}

		const drifted =
			row.title !== entry.title ||
			row.releasedAt !== releasedAtMs ||
			JSON.stringify(row.features) !== JSON.stringify(entry.features) ||
			JSON.stringify(row.bugFixes) !== JSON.stringify(entry.bugFixes);
		if (drifted) {
			await ctx.db.patch(row._id, {
				releasedAt: releasedAtMs,
				title: entry.title,
				features: entry.features,
				bugFixes: entry.bugFixes,
			});
			patched++;
			touchedVersions.add(entry.version);
		}
	}

	for (const row of existing) {
		if (!sourceVersions.has(row.version)) {
			await ctx.db.delete(row._id);
			deleted++;
			touchedVersions.add(row.version);
		}
	}

	// Cascade: clear lastSeenVersion for users whose dismissal pointer
	// references a row that was just patched or deleted. We only scan the
	// users table when at least one version was touched, so the no-op
	// path stays cheap.
	let usersReset = 0;
	if (touchedVersions.size > 0) {
		const users = (await ctx.db.query("users").collect()) as UserRow[];
		for (const user of users) {
			if (
				user.lastSeenVersion !== undefined &&
				touchedVersions.has(user.lastSeenVersion)
			) {
				await ctx.db.patch(user._id, { lastSeenVersion: undefined });
				usersReset++;
			}
		}
	}

	return { inserted, patched, deleted, usersReset };
}

const reconcileResultValidator = v.object({
	inserted: v.number(),
	patched: v.number(),
	deleted: v.number(),
	usersReset: v.number(),
});

export const syncChangelog = mutation({
	args: {},
	returns: reconcileResultValidator,
	handler: async (ctx) => {
		const userId = await getAuthUserId(ctx);
		if (!userId) throw new ConvexError("Not authenticated");
		return await reconcileChangelog(ctx as unknown as { db: DbShape });
	},
});

/**
 * Internal variant of `syncChangelog` — no auth, CLI-runnable via
 * `bunx convex run versions:syncChangelogInternal`. Equivalent behaviour,
 * useful for initial seeding from a CI step or a local dev loop where
 * you don't want to wait for the first authed client to trigger it.
 */
export const syncChangelogInternal = internalMutation({
	args: {},
	returns: reconcileResultValidator,
	handler: async (ctx) => {
		return await reconcileChangelog(ctx as unknown as { db: DbShape });
	},
});
