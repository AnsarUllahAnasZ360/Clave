import { getAuthUserId } from "@convex-dev/auth/server";
import { ConvexError, v } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";
import { checkDocumentReadAccess, checkDocumentWriteAccess } from "./lib/auth";

const AWARENESS_TIMEOUT_MS = 30_000;
const CLEANUP_TIMEOUT_MS = 60_000;
const MAX_PRESENCE_ROWS_PER_DOCUMENT = 5000;
const MAX_PRESENCE_ROWS_PER_CLEANUP = 5000;

export const upsertPresence = mutation({
	args: {
		documentId: v.id("documents"),
		clientId: v.number(),
		clientSessionId: v.string(),
		displayName: v.string(),
		color: v.string(),
		isGuest: v.boolean(),
		awarenessState: v.string(),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const document = await ctx.db.get(args.documentId);
		if (!document) throw new ConvexError("Document not found");
		if (document.deletedAt) throw new ConvexError("Document has been deleted");

		const { canWrite } = await checkDocumentWriteAccess(ctx, document);
		if (!canWrite) throw new ConvexError("No write access to this document");

		const userId = await getAuthUserId(ctx);
		const existing = await ctx.db
			.query("yjsPresenceV3")
			.withIndex("by_document_session", (q) =>
				q
					.eq("documentId", args.documentId)
					.eq("clientSessionId", args.clientSessionId),
			)
			.unique();

		if (existing) {
			await ctx.db.patch(existing._id, {
				clientId: args.clientId,
				...(userId ? { userId } : {}),
				displayName: args.displayName,
				color: args.color,
				isGuest: args.isGuest,
				awarenessState: args.awarenessState,
				lastActiveAt: Date.now(),
			});
		} else {
			await ctx.db.insert("yjsPresenceV3", {
				documentId: args.documentId,
				clientId: args.clientId,
				clientSessionId: args.clientSessionId,
				...(userId ? { userId } : {}),
				displayName: args.displayName,
				color: args.color,
				isGuest: args.isGuest,
				awarenessState: args.awarenessState,
				lastActiveAt: Date.now(),
			});
		}

		return null;
	},
});

export const listPresence = query({
	args: { documentId: v.id("documents") },
	returns: v.array(
		v.object({
			clientId: v.number(),
			clientSessionId: v.string(),
			displayName: v.string(),
			color: v.string(),
			isGuest: v.boolean(),
			awarenessState: v.string(),
		}),
	),
	handler: async (ctx, args) => {
		const document = await ctx.db.get(args.documentId);
		if (!document || document.deletedAt) return [];

		const { canRead } = await checkDocumentReadAccess(ctx, document);
		if (!canRead) return [];

		const entries = await ctx.db
			.query("yjsPresenceV3")
			.withIndex("by_document", (q) => q.eq("documentId", args.documentId))
			.take(MAX_PRESENCE_ROWS_PER_DOCUMENT);

		const cutoff = Date.now() - AWARENESS_TIMEOUT_MS;
		return entries
			.filter((entry) => entry.lastActiveAt > cutoff)
			.map((entry) => ({
				clientId: entry.clientId,
				clientSessionId: entry.clientSessionId,
				displayName: entry.displayName,
				color: entry.color,
				isGuest: entry.isGuest,
				awarenessState: entry.awarenessState,
			}));
	},
});

export const leavePresence = mutation({
	args: {
		documentId: v.id("documents"),
		clientSessionId: v.string(),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		// Best effort cleanup: do not fail leave on auth or permission drift.
		const existing = await ctx.db
			.query("yjsPresenceV3")
			.withIndex("by_document_session", (q) =>
				q
					.eq("documentId", args.documentId)
					.eq("clientSessionId", args.clientSessionId),
			)
			.unique();

		if (existing) {
			await ctx.db.delete(existing._id);
		}

		return null;
	},
});

export const cleanupStalePresence = internalMutation({
	args: {},
	returns: v.null(),
	handler: async (ctx) => {
		const cutoff = Date.now() - CLEANUP_TIMEOUT_MS;
		const entries = await ctx.db
			.query("yjsPresenceV3")
			.order("asc")
			.take(MAX_PRESENCE_ROWS_PER_CLEANUP);

		for (const entry of entries) {
			if (entry.lastActiveAt < cutoff) {
				await ctx.db.delete(entry._id);
			}
		}

		return null;
	},
});
