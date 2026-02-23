/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import { internal } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import schema from "../../convex/schema";

const modules = import.meta.glob("../../convex/**/*.*s");

function createBackend() {
	return convexTest(schema, modules);
}

/** Helper: create a Yjs update that sets text content on a Y.Text named "content". */
function createTextUpdate(text: string): ArrayBuffer {
	const doc = new Y.Doc();
	const ytext = doc.getText("content");
	ytext.insert(0, text);
	const update = Y.encodeStateAsUpdate(doc);
	doc.destroy();
	return update.buffer as ArrayBuffer;
}

/** Helper: create a minimal document fixture and return its ID. */
async function createDocumentFixture(
	t: ReturnType<typeof createBackend>,
): Promise<Id<"documents">> {
	// Create a workspace and user for the document
	const userId = await t.run(async (ctx) => {
		return await ctx.db.insert("users", { name: "Test User" });
	});
	const workspaceId = await t.run(async (ctx) => {
		return await ctx.db.insert("workspaces", {
			name: "Test Workspace",
			slug: "test",
			ownerId: userId,
		});
	});
	const documentId = await t.run(async (ctx) => {
		return await ctx.db.insert("documents", {
			workspaceId,
			title: "Test Document",
			createdBy: userId,
		});
	});
	return documentId;
}

describe("yjsSync", () => {
	describe("compactUpdates (internal)", () => {
		it("merges updates into a single snapshot", async () => {
			const t = createBackend();
			const documentId = await createDocumentFixture(t);

			// Create a Yjs document entry
			const yjsDocId = await t.run(async (ctx) => {
				return await ctx.db.insert("yjsDocuments", {
					documentId,
					updates: [],
					snapshotVersion: 0,
					updatedAt: Date.now(),
				});
			});

			// Push updates directly
			for (let i = 0; i < 5; i++) {
				const update = createTextUpdate(`text-${i}`);
				await t.run(async (ctx) => {
					const doc = await ctx.db.get(yjsDocId);
					if (!doc) throw new Error("Not found");
					await ctx.db.patch(yjsDocId, {
						updates: [...doc.updates, update],
						updatedAt: Date.now(),
					});
				});
			}

			// Verify updates exist
			let result = await t.run(async (ctx) => {
				return await ctx.db.get(yjsDocId);
			});
			expect(result?.updates).toHaveLength(5);
			expect(result?.snapshotVersion).toBe(0);

			// Run compaction via internal mutation
			await t.mutation(internal.yjsSync.compactUpdates, { documentId });

			// After compaction: snapshot exists, updates cleared, version incremented
			result = await t.run(async (ctx) => {
				return await ctx.db.get(yjsDocId);
			});
			expect(result?.updates).toHaveLength(0);
			expect(result?.snapshotVersion).toBe(1);
			expect(result?.snapshot).toBeDefined();

			// Verify snapshot contains valid Yjs data
			const snapshot = result?.snapshot;
			expect(snapshot).toBeDefined();
			const verifyDoc = new Y.Doc();
			Y.applyUpdate(verifyDoc, new Uint8Array(snapshot as ArrayBuffer));
			const text = verifyDoc.getText("content");
			expect(text.toJSON().length).toBeGreaterThan(0);
			verifyDoc.destroy();
		});

		it("is a no-op when there are no pending updates", async () => {
			const t = createBackend();
			const documentId = await createDocumentFixture(t);

			const yjsDocId = await t.run(async (ctx) => {
				return await ctx.db.insert("yjsDocuments", {
					documentId,
					updates: [],
					snapshotVersion: 0,
					updatedAt: Date.now(),
				});
			});

			await t.mutation(internal.yjsSync.compactUpdates, { documentId });

			const result = await t.run(async (ctx) => {
				return await ctx.db.get(yjsDocId);
			});
			expect(result?.updates).toHaveLength(0);
			expect(result?.snapshotVersion).toBe(0);
			expect(result?.snapshot).toBeUndefined();
		});

		it("preserves data across multiple compaction cycles", async () => {
			const t = createBackend();
			const documentId = await createDocumentFixture(t);

			const yjsDocId = await t.run(async (ctx) => {
				return await ctx.db.insert("yjsDocuments", {
					documentId,
					updates: [],
					snapshotVersion: 0,
					updatedAt: Date.now(),
				});
			});

			// First batch + compaction
			const update1 = createTextUpdate("first");
			await t.run(async (ctx) => {
				const doc = await ctx.db.get(yjsDocId);
				if (!doc) throw new Error("Not found");
				await ctx.db.patch(yjsDocId, {
					updates: [...doc.updates, update1],
					updatedAt: Date.now(),
				});
			});
			await t.mutation(internal.yjsSync.compactUpdates, { documentId });

			// Second batch + compaction
			const update2 = createTextUpdate("second");
			await t.run(async (ctx) => {
				const doc = await ctx.db.get(yjsDocId);
				if (!doc) throw new Error("Not found");
				await ctx.db.patch(yjsDocId, {
					updates: [...doc.updates, update2],
					updatedAt: Date.now(),
				});
			});
			await t.mutation(internal.yjsSync.compactUpdates, { documentId });

			const result = await t.run(async (ctx) => {
				return await ctx.db.get(yjsDocId);
			});
			expect(result?.snapshotVersion).toBe(2);
			expect(result?.updates).toHaveLength(0);

			// Verify snapshot contains content from both cycles
			const snapshot = result?.snapshot;
			expect(snapshot).toBeDefined();
			const verifyDoc = new Y.Doc();
			Y.applyUpdate(verifyDoc, new Uint8Array(snapshot as ArrayBuffer));
			const text = verifyDoc.getText("content");
			expect(text.toJSON().length).toBeGreaterThan(0);
			verifyDoc.destroy();
		});
	});
});
