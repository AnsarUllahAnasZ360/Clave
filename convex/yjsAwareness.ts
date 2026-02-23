import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { checkDocumentReadAccess, checkDocumentWriteAccess } from "./lib/auth";

const AWARENESS_TIMEOUT_MS = 30_000;

/**
 * Upsert awareness state for a client in a document.
 * Called on cursor moves, selection changes, and heartbeats.
 * Requires write access to the document.
 */
export const upsertAwareness = mutation({
	args: {
		documentId: v.id("documents"),
		clientId: v.number(),
		awarenessState: v.string(),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const document = await ctx.db.get(args.documentId);
		if (!document) throw new ConvexError("Document not found");
		if (document.deletedAt) throw new ConvexError("Document has been deleted");

		const { canWrite } = await checkDocumentWriteAccess(ctx, document);
		if (!canWrite) throw new ConvexError("No write access to this document");

		const existing = await ctx.db
			.query("yjsAwareness")
			.withIndex("by_document_client", (q) =>
				q.eq("documentId", args.documentId).eq("clientId", args.clientId),
			)
			.unique();

		if (existing) {
			await ctx.db.patch(existing._id, {
				awarenessState: args.awarenessState,
				lastActiveAt: Date.now(),
			});
		} else {
			await ctx.db.insert("yjsAwareness", {
				documentId: args.documentId,
				clientId: args.clientId,
				awarenessState: args.awarenessState,
				lastActiveAt: Date.now(),
			});
		}
		return null;
	},
});

/**
 * List all active awareness states for a document.
 * Filters out stale entries (>30s inactive).
 * Requires read access to the document.
 */
export const listAwareness = query({
	args: { documentId: v.id("documents") },
	returns: v.array(
		v.object({
			clientId: v.number(),
			awarenessState: v.string(),
		}),
	),
	handler: async (ctx, args) => {
		const document = await ctx.db.get(args.documentId);
		if (!document || document.deletedAt) return [];

		const { canRead } = await checkDocumentReadAccess(ctx, document);
		if (!canRead) return [];

		const entries = await ctx.db
			.query("yjsAwareness")
			.withIndex("by_document", (q) => q.eq("documentId", args.documentId))
			.collect();

		const cutoff = Date.now() - AWARENESS_TIMEOUT_MS;
		return entries
			.filter((e) => e.lastActiveAt > cutoff)
			.map((e) => ({
				clientId: e.clientId,
				awarenessState: e.awarenessState,
			}));
	},
});

/**
 * Remove awareness state when a client disconnects.
 * Best-effort cleanup — tolerates errors gracefully.
 */
export const leaveAwareness = mutation({
	args: {
		documentId: v.id("documents"),
		clientId: v.number(),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		// Best-effort: try to verify access, but don't fail on leave
		try {
			const document = await ctx.db.get(args.documentId);
			if (document && !document.deletedAt) {
				await checkDocumentWriteAccess(ctx, document);
			}
		} catch {
			// Allow cleanup even if access check fails (e.g., permission changed)
		}

		const existing = await ctx.db
			.query("yjsAwareness")
			.withIndex("by_document_client", (q) =>
				q.eq("documentId", args.documentId).eq("clientId", args.clientId),
			)
			.unique();

		if (existing) {
			await ctx.db.delete(existing._id);
		}
		return null;
	},
});
