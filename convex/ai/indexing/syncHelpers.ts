/**
 * RAG Sync Status — Internal helpers for tracking indexing state.
 *
 * Provides internalQuery/internalMutation functions to read and write
 * ragSyncStatus records. Used by issueIndexer and documentIndexer actions
 * to implement incremental sync (hash-based change detection).
 */
import { v } from "convex/values";
import { internalMutation, internalQuery } from "../../_generated/server";

const sourceTypeValidator = v.union(
	v.literal("issue"),
	v.literal("document"),
	v.literal("note"),
	v.literal("comment"),
	v.literal("github_file"),
);

/**
 * Get an existing ragSyncStatus record by project + sourceType + sourceId.
 * Returns null if no record exists.
 */
export const getSyncRecord = internalQuery({
	args: {
		projectId: v.id("projects"),
		sourceType: sourceTypeValidator,
		sourceId: v.string(),
	},
	returns: v.union(
		v.object({
			_id: v.id("ragSyncStatus"),
			_creationTime: v.number(),
			projectId: v.id("projects"),
			sourceType: sourceTypeValidator,
			sourceId: v.string(),
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
			.query("ragSyncStatus")
			.withIndex("by_project_source", (q) =>
				q
					.eq("projectId", args.projectId)
					.eq("sourceType", args.sourceType)
					.eq("sourceId", args.sourceId),
			)
			.unique();
	},
});

/**
 * Create or update a ragSyncStatus record after successful indexing.
 * Stores the RAG entryId for cleanup on deletion.
 */
export const upsertSyncRecord = internalMutation({
	args: {
		projectId: v.id("projects"),
		sourceType: sourceTypeValidator,
		sourceId: v.string(),
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
			.query("ragSyncStatus")
			.withIndex("by_project_source", (q) =>
				q
					.eq("projectId", args.projectId)
					.eq("sourceType", args.sourceType)
					.eq("sourceId", args.sourceId),
			)
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
			await ctx.db.insert("ragSyncStatus", {
				projectId: args.projectId,
				sourceType: args.sourceType,
				sourceId: args.sourceId,
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

/**
 * Delete a ragSyncStatus record when content is removed (soft-deleted).
 * Returns the ragEntryId so the caller can delete the RAG entry.
 */
export const deleteSyncRecord = internalMutation({
	args: {
		projectId: v.id("projects"),
		sourceType: sourceTypeValidator,
		sourceId: v.string(),
	},
	returns: v.union(v.string(), v.null()),
	handler: async (ctx, args) => {
		const existing = await ctx.db
			.query("ragSyncStatus")
			.withIndex("by_project_source", (q) =>
				q
					.eq("projectId", args.projectId)
					.eq("sourceType", args.sourceType)
					.eq("sourceId", args.sourceId),
			)
			.unique();

		if (existing) {
			const entryId = existing.ragEntryId ?? null;
			await ctx.db.delete(existing._id);
			return entryId;
		}
		return null;
	},
});
