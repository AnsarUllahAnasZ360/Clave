import { v } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";
import { requireAuth, requireWorkspaceMember } from "./lib/auth";

export const PRESENCE_TOUCH_FRESH_MS = 8000;

export function isPresenceTouchFresh(
	lastActiveAt: number,
	now: number,
): boolean {
	return now - lastActiveAt < PRESENCE_TOUCH_FRESH_MS;
}

/** Upsert workspace presence record, touching lastActiveAt (called periodically) */
export const heartbeat = mutation({
	args: {
		workspaceId: v.id("workspaces"),
	},
	handler: async (ctx, args) => {
		const { userId } = await requireWorkspaceMember(ctx, args.workspaceId);
		const now = Date.now();

		const existing = await ctx.db
			.query("workspacePresence")
			.withIndex("by_workspace_user", (q) =>
				q.eq("workspaceId", args.workspaceId).eq("userId", userId),
			)
			.unique();

		if (existing) {
			if (isPresenceTouchFresh(existing.lastActiveAt, now)) {
				return;
			}
			await ctx.db.patch(existing._id, {
				lastActiveAt: now,
			});
		} else {
			await ctx.db.insert("workspacePresence", {
				workspaceId: args.workspaceId,
				userId,
				lastActiveAt: now,
			});
		}
	},
});

/** Remove presence record when user navigates away (best-effort cleanup) */
export const leave = mutation({
	args: {
		workspaceId: v.id("workspaces"),
	},
	handler: async (ctx, args) => {
		const userId = await requireAuth(ctx);

		const existing = await ctx.db
			.query("workspacePresence")
			.withIndex("by_workspace_user", (q) =>
				q.eq("workspaceId", args.workspaceId).eq("userId", userId),
			)
			.unique();

		if (existing) {
			await ctx.db.delete(existing._id);
		}
	},
});

/** Return all active workspace presence records (reactive via Convex subscriptions) */
export const listActive = query({
	args: {
		workspaceId: v.id("workspaces"),
	},
	handler: async (ctx, args) => {
		await requireWorkspaceMember(ctx, args.workspaceId);

		const records = await ctx.db
			.query("workspacePresence")
			.withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
			.collect();

		const cutoff = Date.now() - 60000; // 60 seconds
		const active = records.filter((r) => r.lastActiveAt > cutoff);

		const enriched = await Promise.all(
			active.map(async (r) => {
				const user = await ctx.db.get(r.userId);
				let avatarUrl: string | undefined;
				if (user?.avatarStorageId) {
					const url = await ctx.storage.getUrl(user.avatarStorageId);
					if (url) avatarUrl = url;
				}
				return {
					userId: r.userId,
					name: user?.name ?? "Unknown",
					image: avatarUrl ?? user?.image,
					lastActiveAt: r.lastActiveAt,
				};
			}),
		);

		return enriched;
	},
});

/** Remove stale presence records older than 60s (called by cron) */
export const cleanupStale = internalMutation({
	args: {},
	handler: async (ctx) => {
		const cutoff = Date.now() - 60000; // 60 seconds
		const allRecords = await ctx.db
			.query("workspacePresence")
			.withIndex("by_workspace")
			.collect();

		for (const record of allRecords) {
			if (record.lastActiveAt < cutoff) {
				await ctx.db.delete(record._id);
			}
		}
	},
});
