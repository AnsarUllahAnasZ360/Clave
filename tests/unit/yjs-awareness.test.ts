/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import type { Id } from "../../convex/_generated/dataModel";
import schema from "../../convex/schema";

const modules = import.meta.glob("../../convex/**/*.*s");

function createBackend() {
	return convexTest(schema, modules);
}

/** Helper: create a minimal document fixture and return its ID. */
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
	const documentId = await t.run(async (ctx) => {
		return await ctx.db.insert("documents", {
			workspaceId,
			title: "Test Document",
			createdBy: userId,
		});
	});
	return documentId;
}

describe("yjsAwareness", () => {
	describe("awareness table operations (direct DB)", () => {
		it("stores awareness state for a client", async () => {
			const t = createBackend();
			const documentId = await createDocumentFixture(t);

			await t.run(async (ctx) => {
				await ctx.db.insert("yjsAwareness", {
					documentId,
					clientId: 100,
					awarenessState: JSON.stringify({
						cursor: { index: 5 },
						user: { name: "Alice" },
					}),
					lastActiveAt: Date.now(),
				});
			});

			const entries = await t.run(async (ctx) => {
				return await ctx.db.query("yjsAwareness").collect();
			});
			expect(entries).toHaveLength(1);
			expect(entries[0].clientId).toBe(100);
			const state = JSON.parse(entries[0].awarenessState);
			expect(state.user.name).toBe("Alice");
		});

		it("stores multiple clients for the same document", async () => {
			const t = createBackend();
			const documentId = await createDocumentFixture(t);

			await t.run(async (ctx) => {
				await ctx.db.insert("yjsAwareness", {
					documentId,
					clientId: 100,
					awarenessState: JSON.stringify({ user: { name: "Alice" } }),
					lastActiveAt: Date.now(),
				});
				await ctx.db.insert("yjsAwareness", {
					documentId,
					clientId: 200,
					awarenessState: JSON.stringify({ user: { name: "Bob" } }),
					lastActiveAt: Date.now(),
				});
			});

			const entries = await t.run(async (ctx) => {
				return await ctx.db.query("yjsAwareness").collect();
			});
			expect(entries).toHaveLength(2);
			const names = entries
				.map((e) => JSON.parse(e.awarenessState).user.name)
				.sort();
			expect(names).toEqual(["Alice", "Bob"]);
		});

		it("filters out stale entries by lastActiveAt", async () => {
			const t = createBackend();
			const documentId = await createDocumentFixture(t);

			const now = Date.now();
			await t.run(async (ctx) => {
				await ctx.db.insert("yjsAwareness", {
					documentId,
					clientId: 100,
					awarenessState: JSON.stringify({ user: "Active" }),
					lastActiveAt: now,
				});
				await ctx.db.insert("yjsAwareness", {
					documentId,
					clientId: 200,
					awarenessState: JSON.stringify({ user: "Stale" }),
					lastActiveAt: now - 60_000,
				});
			});

			const entries = await t.run(async (ctx) => {
				const all = await ctx.db.query("yjsAwareness").collect();
				const cutoff = Date.now() - 30_000;
				return all.filter((e) => e.lastActiveAt > cutoff);
			});
			expect(entries).toHaveLength(1);
			expect(entries[0].clientId).toBe(100);
		});

		it("deletes awareness entry on leave", async () => {
			const t = createBackend();
			const documentId = await createDocumentFixture(t);

			const entryId = await t.run(async (ctx) => {
				return await ctx.db.insert("yjsAwareness", {
					documentId,
					clientId: 100,
					awarenessState: JSON.stringify({ user: "Alice" }),
					lastActiveAt: Date.now(),
				});
			});

			await t.run(async (ctx) => {
				await ctx.db.delete(entryId);
			});

			const entries = await t.run(async (ctx) => {
				return await ctx.db.query("yjsAwareness").collect();
			});
			expect(entries).toHaveLength(0);
		});
	});
});
