import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { internalMutation, mutation, query } from "./_generated/server";
import { requireAuth, requireWorkspaceMember } from "./lib/auth";

/** Look up a document and return its workspaceId, throwing if not found or deleted */
async function getDocumentWorkspaceId(
	ctx: { db: { get: (id: Id<"documents">) => Promise<unknown> } },
	documentId: Id<"documents">,
): Promise<Id<"workspaces">> {
	const doc = (await ctx.db.get(documentId)) as {
		workspaceId: Id<"workspaces">;
		deletedAt?: number;
	} | null;
	if (!doc) throw new Error("Document not found");
	if (doc.deletedAt) throw new Error("Document has been deleted");
	return doc.workspaceId;
}

/** Upsert presence record with cursor position (debounce on client: 250ms) */
export const upsert = mutation({
	args: {
		documentId: v.id("documents"),
		cursorFrom: v.float64(),
		cursorTo: v.float64(),
	},
	handler: async (ctx, args) => {
		const workspaceId = await getDocumentWorkspaceId(ctx, args.documentId);
		const { userId } = await requireWorkspaceMember(ctx, workspaceId);

		const existing = await ctx.db
			.query("documentPresence")
			.withIndex("by_document_user", (q) =>
				q.eq("documentId", args.documentId).eq("userId", userId),
			)
			.unique();

		if (existing) {
			await ctx.db.patch(existing._id, {
				cursorFrom: args.cursorFrom,
				cursorTo: args.cursorTo,
				lastActiveAt: Date.now(),
			});
		} else {
			await ctx.db.insert("documentPresence", {
				documentId: args.documentId,
				userId,
				cursorFrom: args.cursorFrom,
				cursorTo: args.cursorTo,
				lastActiveAt: Date.now(),
			});
		}
	},
});

/** Touch lastActiveAt without changing cursor position (called every 10s) */
export const heartbeat = mutation({
	args: {
		documentId: v.id("documents"),
	},
	handler: async (ctx, args) => {
		const workspaceId = await getDocumentWorkspaceId(ctx, args.documentId);
		const { userId } = await requireWorkspaceMember(ctx, workspaceId);

		const existing = await ctx.db
			.query("documentPresence")
			.withIndex("by_document_user", (q) =>
				q.eq("documentId", args.documentId).eq("userId", userId),
			)
			.unique();

		if (existing) {
			await ctx.db.patch(existing._id, {
				lastActiveAt: Date.now(),
			});
		}
	},
});

/** Remove presence record when user navigates away (best-effort cleanup) */
export const leave = mutation({
	args: {
		documentId: v.id("documents"),
	},
	handler: async (ctx, args) => {
		// Use requireAuth only -- user should always be able to clean up their
		// own presence even if workspace membership has changed
		const userId = await requireAuth(ctx);

		const existing = await ctx.db
			.query("documentPresence")
			.withIndex("by_document_user", (q) =>
				q.eq("documentId", args.documentId).eq("userId", userId),
			)
			.unique();

		if (existing) {
			await ctx.db.delete(existing._id);
		}
	},
});

/** Return all active presence records for a document (reactive via Convex subscriptions) */
export const listActive = query({
	args: {
		documentId: v.id("documents"),
	},
	handler: async (ctx, args) => {
		const workspaceId = await getDocumentWorkspaceId(ctx, args.documentId);
		await requireWorkspaceMember(ctx, workspaceId);

		const records = await ctx.db
			.query("documentPresence")
			.withIndex("by_document", (q) => q.eq("documentId", args.documentId))
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
					cursorFrom: r.cursorFrom,
					cursorTo: r.cursorTo,
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
		const allRecords = await ctx.db.query("documentPresence").collect();

		for (const record of allRecords) {
			if (record.lastActiveAt < cutoff) {
				await ctx.db.delete(record._id);
			}
		}
	},
});
