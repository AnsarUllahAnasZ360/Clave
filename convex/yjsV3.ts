import { ConvexError, v } from "convex/values";
import * as Y from "yjs";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { internalMutation, mutation, query } from "./_generated/server";
import {
	checkDocumentReadAccess,
	checkDocumentWriteAccess,
	requireAuth,
} from "./lib/auth";

const COMPACTION_THRESHOLD = 80;
const MAX_UPDATES_PER_READ = 1000;
const MAX_UPDATES_PER_COMPACTION = 2000;

async function bootstrapSnapshotFromLegacy(
	// biome-ignore lint/suspicious/noExplicitAny: mutation context duck-typed
	ctx: any,
	documentId: Id<"documents">,
): Promise<Id<"yjsSnapshotsV3"> | null> {
	const existingSnapshot = await ctx.db
		.query("yjsSnapshotsV3")
		// biome-ignore lint/suspicious/noExplicitAny: dynamic index type
		.withIndex("by_document", (q: any) => q.eq("documentId", documentId))
		.unique();
	if (existingSnapshot) {
		return existingSnapshot._id;
	}

	const legacy = await ctx.db
		.query("yjsDocuments")
		// biome-ignore lint/suspicious/noExplicitAny: dynamic index type
		.withIndex("by_document", (q: any) => q.eq("documentId", documentId))
		.unique();

	const snapshotId = (await ctx.db.insert("yjsSnapshotsV3", {
		documentId,
		...(legacy?.snapshot ? { snapshot: legacy.snapshot } : {}),
		snapshotVersion: legacy?.snapshotVersion ?? 0,
		updatedAt: Date.now(),
	})) as Id<"yjsSnapshotsV3">;

	if (legacy?.updates?.length) {
		const base = Date.now();
		for (let i = 0; i < legacy.updates.length; i++) {
			await ctx.db.insert("yjsUpdatesV3", {
				documentId,
				update: legacy.updates[i],
				clientSessionId: "legacy-import",
				createdAt: base + i,
			});
		}
	}

	return snapshotId;
}

export const ensureDocument = mutation({
	args: { documentId: v.id("documents") },
	returns: v.null(),
	handler: async (ctx, args) => {
		const document = await ctx.db.get(args.documentId);
		if (!document) throw new ConvexError("Document not found");
		if (document.deletedAt) throw new ConvexError("Document has been deleted");

		const { canWrite } = await checkDocumentWriteAccess(ctx, document);
		if (!canWrite) throw new ConvexError("No write access to this document");

		await bootstrapSnapshotFromLegacy(ctx, args.documentId);

		// Mark collaboration backend version after successful v3 bootstrap.
		if (document.syncVersion !== "v3") {
			await ctx.db.patch(args.documentId, {
				syncVersion: "v3",
				updatedAt: Date.now(),
			});
		}

		return null;
	},
});

export const getState = query({
	args: { documentId: v.id("documents") },
	returns: v.union(
		v.object({
			snapshot: v.optional(v.bytes()),
			snapshotVersion: v.number(),
			updates: v.array(
				v.object({
					_id: v.id("yjsUpdatesV3"),
					update: v.bytes(),
					clientSessionId: v.string(),
					createdAt: v.number(),
				}),
			),
		}),
		v.null(),
	),
	handler: async (ctx, args) => {
		const document = await ctx.db.get(args.documentId);
		if (!document || document.deletedAt) return null;

		const { canRead } = await checkDocumentReadAccess(ctx, document);
		if (!canRead) return null;

		const snapshotRow = await ctx.db
			.query("yjsSnapshotsV3")
			.withIndex("by_document", (q) => q.eq("documentId", args.documentId))
			.unique();

		const updates = await ctx.db
			.query("yjsUpdatesV3")
			.withIndex("by_document_created", (q) =>
				q.eq("documentId", args.documentId),
			)
			.order("asc")
			.take(MAX_UPDATES_PER_READ);

		const state: {
			snapshot?: ArrayBuffer;
			snapshotVersion: number;
			updates: Array<{
				_id: Id<"yjsUpdatesV3">;
				update: ArrayBuffer;
				clientSessionId: string;
				createdAt: number;
			}>;
		} = {
			snapshotVersion: snapshotRow?.snapshotVersion ?? 0,
			updates: updates.map((u) => ({
				_id: u._id,
				update: u.update,
				clientSessionId: u.clientSessionId,
				createdAt: u.createdAt,
			})),
		};
		if (snapshotRow?.snapshot) {
			state.snapshot = snapshotRow.snapshot;
		}
		return state;
	},
});

export const pushUpdate = mutation({
	args: {
		documentId: v.id("documents"),
		update: v.bytes(),
		clientSessionId: v.string(),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const document = await ctx.db.get(args.documentId);
		if (!document) throw new ConvexError("Document not found");
		if (document.deletedAt) throw new ConvexError("Document has been deleted");

		const { canWrite } = await checkDocumentWriteAccess(ctx, document);
		if (!canWrite) throw new ConvexError("No write access to this document");

		await bootstrapSnapshotFromLegacy(ctx, args.documentId);

		await ctx.db.insert("yjsUpdatesV3", {
			documentId: args.documentId,
			update: args.update,
			clientSessionId: args.clientSessionId,
			createdAt: Date.now(),
		});

		const recentUpdates = await ctx.db
			.query("yjsUpdatesV3")
			.withIndex("by_document", (q) => q.eq("documentId", args.documentId))
			.order("desc")
			.take(COMPACTION_THRESHOLD);

		if (recentUpdates.length >= COMPACTION_THRESHOLD) {
			// biome-ignore lint/suspicious/noExplicitAny: internal API cast
			await ctx.scheduler.runAfter(0, (internal as any).yjsV3.compactUpdates, {
				documentId: args.documentId,
			});
		}

		return null;
	},
});

export const compactUpdates = internalMutation({
	args: { documentId: v.id("documents") },
	returns: v.null(),
	handler: async (ctx, args) => {
		const snapshotRow = await ctx.db
			.query("yjsSnapshotsV3")
			.withIndex("by_document", (q) => q.eq("documentId", args.documentId))
			.unique();
		if (!snapshotRow) {
			return null;
		}

		const updates = await ctx.db
			.query("yjsUpdatesV3")
			.withIndex("by_document_created", (q) =>
				q.eq("documentId", args.documentId),
			)
			.order("asc")
			.take(MAX_UPDATES_PER_COMPACTION);

		if (updates.length < COMPACTION_THRESHOLD) {
			return null;
		}

		const ydoc = new Y.Doc();
		try {
			if (snapshotRow.snapshot) {
				Y.applyUpdate(ydoc, new Uint8Array(snapshotRow.snapshot));
			}

			for (const updateRow of updates) {
				try {
					Y.applyUpdate(ydoc, new Uint8Array(updateRow.update));
				} catch {
					// Skip malformed updates so one bad row doesn't block compaction.
				}
			}

			const mergedSnapshot = Y.encodeStateAsUpdate(ydoc);
			await ctx.db.patch(snapshotRow._id, {
				snapshot: mergedSnapshot.buffer as ArrayBuffer,
				snapshotVersion: snapshotRow.snapshotVersion + 1,
				updatedAt: Date.now(),
			});
		} finally {
			ydoc.destroy();
		}

		for (const updateRow of updates) {
			await ctx.db.delete(updateRow._id);
		}

		if (updates.length === MAX_UPDATES_PER_COMPACTION) {
			// biome-ignore lint/suspicious/noExplicitAny: internal API cast
			await ctx.scheduler.runAfter(0, (internal as any).yjsV3.compactUpdates, {
				documentId: args.documentId,
			});
		}

		return null;
	},
});

export const migrateLegacyBatch = mutation({
	args: { limit: v.optional(v.number()) },
	returns: v.object({
		processed: v.number(),
		migrated: v.number(),
		skipped: v.number(),
	}),
	handler: async (ctx, args) => {
		await requireAuth(ctx);

		const limit = Math.min(Math.max(args.limit ?? 1000, 1), 5000);
		const legacyRows = await ctx.db
			.query("yjsDocuments")
			.order("asc")
			.take(limit);

		let migrated = 0;
		let skipped = 0;

		for (const row of legacyRows) {
			const document = await ctx.db.get(row.documentId);
			if (!document || document.deletedAt) {
				skipped += 1;
				continue;
			}
			const { canWrite } = await checkDocumentWriteAccess(ctx, document);
			if (!canWrite) {
				skipped += 1;
				continue;
			}

			const existingSnapshot = await ctx.db
				.query("yjsSnapshotsV3")
				.withIndex("by_document", (q) => q.eq("documentId", row.documentId))
				.unique();

			if (!existingSnapshot) {
				await bootstrapSnapshotFromLegacy(ctx, row.documentId);
				migrated += 1;
			} else {
				skipped += 1;
			}

			if (document.syncVersion !== "v3") {
				await ctx.db.patch(row.documentId, {
					syncVersion: "v3",
					updatedAt: Date.now(),
				});
			}
		}

		return {
			processed: legacyRows.length,
			migrated,
			skipped,
		};
	},
});

export const migrateLegacyDocument = mutation({
	args: { documentId: v.id("documents") },
	returns: v.object({
		migrated: v.boolean(),
	}),
	handler: async (ctx, args) => {
		const document = await ctx.db.get(args.documentId);
		if (!document) throw new ConvexError("Document not found");
		if (document.deletedAt) throw new ConvexError("Document has been deleted");

		const { canWrite } = await checkDocumentWriteAccess(ctx, document);
		if (!canWrite) throw new ConvexError("No write access to this document");

		const existingSnapshot = await ctx.db
			.query("yjsSnapshotsV3")
			.withIndex("by_document", (q) => q.eq("documentId", args.documentId))
			.unique();
		if (existingSnapshot) {
			if (document.syncVersion !== "v3") {
				await ctx.db.patch(args.documentId, {
					syncVersion: "v3",
					updatedAt: Date.now(),
				});
			}
			return { migrated: false };
		}

		await bootstrapSnapshotFromLegacy(ctx, args.documentId);
		await ctx.db.patch(args.documentId, {
			syncVersion: "v3",
			updatedAt: Date.now(),
		});

		return { migrated: true };
	},
});
