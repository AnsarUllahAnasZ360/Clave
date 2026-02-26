/**
 * Doc Page Sync Status — Internal helpers for tracking doc page indexing state.
 *
 * Provides internalQuery/internalMutation functions to read and write
 * docPageSyncStatus records. Used by docsIndexer to implement incremental
 * sync (hash-based change detection) for global documentation pages.
 *
 * This is separate from syncHelpers.ts because doc pages use a slug-based
 * tracking table (docPageSyncStatus) rather than the project-scoped
 * ragSyncStatus table.
 */
import { v } from "convex/values";
import { internalMutation, internalQuery } from "../../_generated/server";

/**
 * Get an existing docPageSyncStatus record by slug.
 * Returns null if no record exists.
 */
export const getDocSyncRecord = internalQuery({
	args: {
		slug: v.string(),
	},
	returns: v.union(
		v.object({
			_id: v.id("docPageSyncStatus"),
			_creationTime: v.number(),
			slug: v.string(),
			contentHash: v.string(),
			lastSyncedAt: v.number(),
			chunkCount: v.number(),
			status: v.union(
				v.literal("synced"),
				v.literal("pending"),
				v.literal("error"),
			),
			errorMessage: v.optional(v.string()),
			ragEntryId: v.optional(v.string()),
		}),
		v.null(),
	),
	handler: async (ctx, args) => {
		return await ctx.db
			.query("docPageSyncStatus")
			.withIndex("by_slug", (q) => q.eq("slug", args.slug))
			.unique();
	},
});

/**
 * Create or update a docPageSyncStatus record after indexing.
 * Stores the RAG entryId for cleanup on re-indexing.
 */
export const upsertDocSyncRecord = internalMutation({
	args: {
		slug: v.string(),
		contentHash: v.string(),
		chunkCount: v.number(),
		status: v.union(
			v.literal("synced"),
			v.literal("pending"),
			v.literal("error"),
		),
		errorMessage: v.optional(v.string()),
		ragEntryId: v.optional(v.string()),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const existing = await ctx.db
			.query("docPageSyncStatus")
			.withIndex("by_slug", (q) => q.eq("slug", args.slug))
			.unique();

		if (existing) {
			await ctx.db.patch(existing._id, {
				contentHash: args.contentHash,
				lastSyncedAt: Date.now(),
				chunkCount: args.chunkCount,
				status: args.status,
				errorMessage: args.errorMessage,
				ragEntryId: args.ragEntryId,
			});
		} else {
			await ctx.db.insert("docPageSyncStatus", {
				slug: args.slug,
				contentHash: args.contentHash,
				lastSyncedAt: Date.now(),
				chunkCount: args.chunkCount,
				status: args.status,
				errorMessage: args.errorMessage,
				ragEntryId: args.ragEntryId,
			});
		}
		return null;
	},
});
