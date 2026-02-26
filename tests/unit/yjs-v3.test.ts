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

function createTextUpdate(text: string): ArrayBuffer {
	const doc = new Y.Doc();
	doc.getText("content").insert(0, text);
	const update = Y.encodeStateAsUpdate(doc);
	doc.destroy();
	return update.buffer as ArrayBuffer;
}

async function createDocumentFixture(
	t: ReturnType<typeof createBackend>,
): Promise<Id<"documents">> {
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
	return await t.run(async (ctx) => {
		return await ctx.db.insert("documents", {
			workspaceId,
			title: "Test Document",
			createdBy: userId,
		});
	});
}

describe("yjsV3", () => {
	it("compacts a bounded window and leaves backlog for follow-up compaction", async () => {
		const t = createBackend();
		const documentId = await createDocumentFixture(t);
		const update = createTextUpdate("seed");
		const totalUpdates = 2001;

		const snapshotId = await t.run(async (ctx) => {
			return await ctx.db.insert("yjsSnapshotsV3", {
				documentId,
				snapshotVersion: 0,
				updatedAt: Date.now(),
			});
		});

		await t.run(async (ctx) => {
			const base = Date.now();
			for (let i = 0; i < totalUpdates; i++) {
				await ctx.db.insert("yjsUpdatesV3", {
					documentId,
					update,
					clientSessionId: `session-${i}`,
					createdAt: base + i,
				});
			}
		});

		await t.mutation(internal.yjsV3.compactUpdates, { documentId });

		const { snapshotRow, remainingRows } = await t.run(async (ctx) => {
			const row = await ctx.db.get(snapshotId);
			const remaining = await ctx.db
				.query("yjsUpdatesV3")
				.withIndex("by_document", (q) => q.eq("documentId", documentId))
				.collect();
			return { snapshotRow: row, remainingRows: remaining };
		});

		expect(snapshotRow?.snapshotVersion).toBe(1);
		expect(snapshotRow?.snapshot).toBeDefined();
		expect(remainingRows.length).toBeGreaterThan(0);
		expect(remainingRows.length).toBeLessThan(totalUpdates);

		const verifyDoc = new Y.Doc();
		Y.applyUpdate(
			verifyDoc,
			new Uint8Array(snapshotRow?.snapshot as ArrayBuffer),
		);
		expect(verifyDoc.getText("content").toJSON().length).toBeGreaterThan(0);
		verifyDoc.destroy();
	});
});
