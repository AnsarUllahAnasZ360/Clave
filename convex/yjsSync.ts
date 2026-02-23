import { ConvexError, v } from "convex/values";
import * as Y from "yjs";
import { internal } from "./_generated/api";
import { internalMutation, mutation, query } from "./_generated/server";
import { checkDocumentReadAccess, checkDocumentWriteAccess } from "./lib/auth";

const COMPACTION_THRESHOLD = 50;

/**
 * Create a new Yjs document entry. Rejects duplicates.
 * Requires write access to the document.
 */
export const createDocument = mutation({
	args: { documentId: v.id("documents") },
	returns: v.null(),
	handler: async (ctx, args) => {
		const document = await ctx.db.get(args.documentId);
		if (!document) throw new ConvexError("Document not found");
		if (document.deletedAt) throw new ConvexError("Document has been deleted");

		const { canWrite } = await checkDocumentWriteAccess(ctx, document);
		if (!canWrite) throw new ConvexError("No write access to this document");

		const existing = await ctx.db
			.query("yjsDocuments")
			.withIndex("by_document", (q) => q.eq("documentId", args.documentId))
			.unique();
		if (existing) {
			return null;
		}
		await ctx.db.insert("yjsDocuments", {
			documentId: args.documentId,
			updates: [],
			snapshotVersion: 0,
			updatedAt: Date.now(),
		});
		return null;
	},
});

/**
 * Get document state (snapshot + pending updates).
 * This is the reactive subscription endpoint — clients subscribe to this.
 * Requires read access to the document.
 */
export const getDocument = query({
	args: { documentId: v.id("documents") },
	returns: v.union(
		v.object({
			snapshot: v.optional(v.bytes()),
			updates: v.array(v.bytes()),
			snapshotVersion: v.number(),
		}),
		v.null(),
	),
	handler: async (ctx, args) => {
		const document = await ctx.db.get(args.documentId);
		if (!document) return null;
		if (document.deletedAt) return null;

		const { canRead } = await checkDocumentReadAccess(ctx, document);
		if (!canRead) return null;

		const doc = await ctx.db
			.query("yjsDocuments")
			.withIndex("by_document", (q) => q.eq("documentId", args.documentId))
			.unique();
		if (!doc) {
			return null;
		}
		return {
			snapshot: doc.snapshot,
			updates: doc.updates,
			snapshotVersion: doc.snapshotVersion,
		};
	},
});

/**
 * Push a binary Yjs update to a document.
 * Triggers compaction when updates exceed the threshold.
 * Requires write access to the document.
 */
export const pushUpdate = mutation({
	args: {
		documentId: v.id("documents"),
		update: v.bytes(),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const document = await ctx.db.get(args.documentId);
		if (!document) throw new ConvexError("Document not found");
		if (document.deletedAt) throw new ConvexError("Document has been deleted");

		const { canWrite } = await checkDocumentWriteAccess(ctx, document);
		if (!canWrite) throw new ConvexError("No write access to this document");

		const doc = await ctx.db
			.query("yjsDocuments")
			.withIndex("by_document", (q) => q.eq("documentId", args.documentId))
			.unique();
		if (!doc) {
			// Auto-create Yjs document entry on first update
			await ctx.db.insert("yjsDocuments", {
				documentId: args.documentId,
				updates: [args.update],
				snapshotVersion: 0,
				updatedAt: Date.now(),
			});
			return null;
		}
		const newUpdates = [...doc.updates, args.update];
		await ctx.db.patch(doc._id, {
			updates: newUpdates,
			updatedAt: Date.now(),
		});
		if (newUpdates.length >= COMPACTION_THRESHOLD) {
			await ctx.scheduler.runAfter(0, internal.yjsSync.compactUpdates, {
				documentId: args.documentId,
			});
		}
		return null;
	},
});

/**
 * Compact all pending updates into a single snapshot.
 * Internal-only — triggered automatically after COMPACTION_THRESHOLD updates.
 */
export const compactUpdates = internalMutation({
	args: { documentId: v.id("documents") },
	returns: v.null(),
	handler: async (ctx, args) => {
		const doc = await ctx.db
			.query("yjsDocuments")
			.withIndex("by_document", (q) => q.eq("documentId", args.documentId))
			.unique();
		if (!doc) {
			return null;
		}
		if (doc.updates.length === 0) {
			return null;
		}

		const ydoc = new Y.Doc();

		// Apply existing snapshot first
		if (doc.snapshot) {
			Y.applyUpdate(ydoc, new Uint8Array(doc.snapshot));
		}

		// Apply all pending updates
		for (const update of doc.updates) {
			Y.applyUpdate(ydoc, new Uint8Array(update));
		}

		// Encode the merged state as a single snapshot
		const mergedSnapshot = Y.encodeStateAsUpdate(ydoc);
		ydoc.destroy();

		await ctx.db.patch(doc._id, {
			snapshot: mergedSnapshot.buffer as ArrayBuffer,
			updates: [],
			snapshotVersion: doc.snapshotVersion + 1,
			updatedAt: Date.now(),
		});

		return null;
	},
});
