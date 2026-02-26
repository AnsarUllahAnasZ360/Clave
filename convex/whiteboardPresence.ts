import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { internalMutation, mutation, query } from "./_generated/server";
import { requireAuth, requireWorkspaceMember } from "./lib/auth";

export const PRESENCE_TOUCH_FRESH_MS = 8000;

export function isPresenceTouchFresh(
	lastActiveAt: number,
	now: number,
): boolean {
	return now - lastActiveAt < PRESENCE_TOUCH_FRESH_MS;
}

export function isWhiteboardCursorUnchanged(
	existing: { cursorX?: number; cursorY?: number },
	next: { cursorX?: number; cursorY?: number },
): boolean {
	return existing.cursorX === next.cursorX && existing.cursorY === next.cursorY;
}

/** Look up a whiteboard and return its workspaceId, throwing if not found or deleted */
async function getWhiteboardWorkspaceId(
	ctx: { db: { get: (id: Id<"whiteboards">) => Promise<unknown> } },
	whiteboardId: Id<"whiteboards">,
): Promise<Id<"workspaces">> {
	const board = (await ctx.db.get(whiteboardId)) as {
		workspaceId: Id<"workspaces">;
		deletedAt?: number;
	} | null;
	if (!board) throw new Error("Whiteboard not found");
	if (board.deletedAt) throw new Error("Whiteboard has been deleted");
	return board.workspaceId;
}

/** Upsert presence record for a whiteboard user */
export const upsert = mutation({
	args: {
		whiteboardId: v.id("whiteboards"),
		cursorX: v.optional(v.float64()),
		cursorY: v.optional(v.float64()),
	},
	handler: async (ctx, args) => {
		const workspaceId = await getWhiteboardWorkspaceId(ctx, args.whiteboardId);
		const { userId } = await requireWorkspaceMember(ctx, workspaceId);
		const now = Date.now();

		const existing = await ctx.db
			.query("whiteboardPresence")
			.withIndex("by_whiteboard_user", (q) =>
				q.eq("whiteboardId", args.whiteboardId).eq("userId", userId),
			)
			.unique();

		if (existing) {
			if (
				isWhiteboardCursorUnchanged(existing, args) &&
				isPresenceTouchFresh(existing.lastActiveAt, now)
			) {
				return;
			}
			await ctx.db.patch(existing._id, {
				cursorX: args.cursorX,
				cursorY: args.cursorY,
				lastActiveAt: now,
			});
		} else {
			await ctx.db.insert("whiteboardPresence", {
				whiteboardId: args.whiteboardId,
				userId,
				cursorX: args.cursorX,
				cursorY: args.cursorY,
				lastActiveAt: now,
			});
		}
	},
});

/** Touch lastActiveAt without changing cursor position (called every 10s) */
export const heartbeat = mutation({
	args: {
		whiteboardId: v.id("whiteboards"),
	},
	handler: async (ctx, args) => {
		const workspaceId = await getWhiteboardWorkspaceId(ctx, args.whiteboardId);
		const { userId } = await requireWorkspaceMember(ctx, workspaceId);
		const now = Date.now();

		const existing = await ctx.db
			.query("whiteboardPresence")
			.withIndex("by_whiteboard_user", (q) =>
				q.eq("whiteboardId", args.whiteboardId).eq("userId", userId),
			)
			.unique();

		if (existing && !isPresenceTouchFresh(existing.lastActiveAt, now)) {
			await ctx.db.patch(existing._id, {
				lastActiveAt: now,
			});
		}
	},
});

/** Remove presence record when user navigates away (best-effort cleanup) */
export const leave = mutation({
	args: {
		whiteboardId: v.id("whiteboards"),
	},
	handler: async (ctx, args) => {
		const userId = await requireAuth(ctx);

		const existing = await ctx.db
			.query("whiteboardPresence")
			.withIndex("by_whiteboard_user", (q) =>
				q.eq("whiteboardId", args.whiteboardId).eq("userId", userId),
			)
			.unique();

		if (existing) {
			await ctx.db.delete(existing._id);
		}
	},
});

/** Return all active presence records for a whiteboard (reactive via Convex subscriptions) */
export const listActive = query({
	args: {
		whiteboardId: v.id("whiteboards"),
	},
	handler: async (ctx, args) => {
		const workspaceId = await getWhiteboardWorkspaceId(ctx, args.whiteboardId);
		await requireWorkspaceMember(ctx, workspaceId);

		const records = await ctx.db
			.query("whiteboardPresence")
			.withIndex("by_whiteboard", (q) =>
				q.eq("whiteboardId", args.whiteboardId),
			)
			.collect();

		const cutoff = Date.now() - 30000; // 30 seconds
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
			.query("whiteboardPresence")
			.withIndex("by_whiteboard")
			.collect();

		for (const record of allRecords) {
			if (record.lastActiveAt < cutoff) {
				await ctx.db.delete(record._id);
			}
		}
	},
});
