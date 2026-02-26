/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { internal } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import schema from "../../convex/schema";

const modules = import.meta.glob("../../convex/**/*.*s");

function createBackend() {
	return convexTest(schema, modules);
}

type Fixture = {
	userId: Id<"users">;
	workspaceId: Id<"workspaces">;
};

async function seedFixture(
	t: ReturnType<typeof createBackend>,
): Promise<Fixture> {
	return t.run(async (ctx) => {
		const userId = await ctx.db.insert("users", { name: "Notification User" });
		const workspaceId = await ctx.db.insert("workspaces", {
			name: "Notifications WS",
			slug: "notifications-ws",
			ownerId: userId,
		});
		await ctx.db.insert("workspaceMembers", {
			workspaceId,
			userId,
			role: "admin",
			joinedAt: Date.now(),
		});
		return { userId, workspaceId };
	});
}

describe("notifications.unsnoozeExpired", () => {
	it("unsnoozes only expired, non-deleted notifications", async () => {
		const t = createBackend();
		const fx = await seedFixture(t);
		const now = Date.now();

		const ids = await t.run(async (ctx) => {
			const expiredId = await ctx.db.insert("notifications", {
				userId: fx.userId,
				workspaceId: fx.workspaceId,
				type: "issue_assigned",
				title: "Expired",
				isRead: true,
				snoozedUntil: now - 5_000,
			});
			const deletedExpiredId = await ctx.db.insert("notifications", {
				userId: fx.userId,
				workspaceId: fx.workspaceId,
				type: "issue_assigned",
				title: "Deleted expired",
				isRead: true,
				snoozedUntil: now - 10_000,
				deletedAt: now - 1_000,
			});
			const futureId = await ctx.db.insert("notifications", {
				userId: fx.userId,
				workspaceId: fx.workspaceId,
				type: "issue_assigned",
				title: "Future",
				isRead: true,
				snoozedUntil: now + 60_000,
			});
			const activeId = await ctx.db.insert("notifications", {
				userId: fx.userId,
				workspaceId: fx.workspaceId,
				type: "issue_assigned",
				title: "Active",
				isRead: false,
			});
			return { expiredId, deletedExpiredId, futureId, activeId };
		});

		const result = await t.mutation(internal.notifications.unsnoozeExpired, {});
		expect(result.scanned).toBe(2);
		expect(result.unsnoozed).toBe(1);
		expect(result.hasMore).toBe(false);

		const docs = await t.run(async (ctx) => {
			return Promise.all([
				ctx.db.get(ids.expiredId),
				ctx.db.get(ids.deletedExpiredId),
				ctx.db.get(ids.futureId),
				ctx.db.get(ids.activeId),
			]);
		});

		expect(docs[0]?.snoozedUntil).toBeUndefined();
		expect(docs[0]?.isRead).toBe(false);
		expect(docs[1]?.snoozedUntil).toBe(now - 10_000);
		expect(docs[1]?.deletedAt).toBe(now - 1_000);
		expect(docs[2]?.snoozedUntil).toBe(now + 60_000);
		expect(docs[3]?.snoozedUntil).toBeUndefined();
		expect(docs[3]?.isRead).toBe(false);
	});

	it("processes expired notifications in bounded batches", async () => {
		const t = createBackend();
		const fx = await seedFixture(t);
		const now = Date.now();
		const total = 5_001;

		await t.run(async (ctx) => {
			for (let i = 0; i < total; i++) {
				await ctx.db.insert("notifications", {
					userId: fx.userId,
					workspaceId: fx.workspaceId,
					type: "issue_assigned",
					title: `Batch ${i}`,
					isRead: true,
					snoozedUntil: now - (i + 1),
				});
			}
		});

		const first = await t.mutation(internal.notifications.unsnoozeExpired, {});
		expect(first.scanned).toBe(5_000);
		expect(first.unsnoozed).toBe(5_000);
		expect(first.hasMore).toBe(true);

		const second = await t.mutation(internal.notifications.unsnoozeExpired, {});
		expect(second.scanned).toBe(1);
		expect(second.unsnoozed).toBe(1);
		expect(second.hasMore).toBe(false);

		const remainingExpired = await t.run(async (ctx) => {
			return ctx.db
				.query("notifications")
				.withIndex("by_snoozed_until", (q) =>
					q.gte("snoozedUntil", 0).lte("snoozedUntil", now),
				)
				.collect();
		});
		expect(remainingExpired).toHaveLength(0);
	});
});
