/// <reference types="vite/client" />

import { makeFunctionReference } from "convex/server";
import { convexTest } from "convex-test";
import { describe, expect, it, vi } from "vitest";
import type { Id } from "../../convex/_generated/dataModel";
import { enqueueEmailForNotification } from "../../convex/emailRelay";
import { createNotification } from "../../convex/lib/notifications";
import schema from "../../convex/schema";

const modules = import.meta.glob("../../convex/**/*.*s");

function createBackend() {
	return convexTest(schema, modules);
}

const prepareEmailRef = makeFunctionReference<
	"query",
	{
		notificationId: Id<"notifications">;
		workspaceId: Id<"workspaces">;
	},
	{
		status: "ready" | "drop";
		reason?: string;
		to?: string;
		subject?: string;
		html?: string;
	}
>("emailRelay:prepareNotificationEmail");

type Fixture = {
	recipientId: Id<"users">;
	actorId: Id<"users">;
	workspaceId: Id<"workspaces">;
};

async function seedFixture(
	t: ReturnType<typeof createBackend>,
	opts: { notifyEmail?: boolean; omitEmail?: boolean } = {},
): Promise<Fixture> {
	const { notifyEmail, omitEmail = false } = opts;
	return t.run(async (ctx) => {
		const actorId = await ctx.db.insert("users", {
			name: "Sarah",
			email: "sarah@example.com",
		});
		const recipientId = await ctx.db.insert(
			"users",
			omitEmail
				? { name: "Ansar Ullah", notifyEmail }
				: {
						name: "Ansar Ullah",
						email: "recipient@example.com",
						notifyEmail,
					},
		);
		const workspaceId = await ctx.db.insert("workspaces", {
			name: "Acme",
			slug: "acme",
			ownerId: actorId,
		});
		await ctx.db.insert("workspaceMembers", {
			workspaceId,
			userId: actorId,
			role: "admin",
			joinedAt: Date.now(),
		});
		await ctx.db.insert("workspaceMembers", {
			workspaceId,
			userId: recipientId,
			role: "member",
			joinedAt: Date.now(),
		});
		return { actorId, recipientId, workspaceId };
	});
}

async function insertIssueAssignedNotification(
	t: ReturnType<typeof createBackend>,
	f: Fixture,
): Promise<Id<"notifications">> {
	return t.run(async (ctx) => {
		return await ctx.db.insert("notifications", {
			userId: f.recipientId,
			workspaceId: f.workspaceId,
			type: "issue_assigned",
			eventType: "issue_assigned",
			title: "Assigned to you: CLV-42",
			body: "Please take a look",
			actorId: f.actorId,
			isRead: false,
		});
	});
}

describe("emailRelay enqueue gating (integration)", () => {
	it("queues an email when recipient has email and notifyEmail is not false", async () => {
		const t = createBackend();
		const f = await seedFixture(t);
		const notificationId = await insertIssueAssignedNotification(t, f);

		const result = await t.run((ctx) =>
			enqueueEmailForNotification(ctx, {
				notificationId,
				workspaceId: f.workspaceId,
				userId: f.recipientId,
				eventType: "issue_assigned",
			}),
		);

		expect(result).toEqual({ queued: 1, skipped: 0 });
	});

	it("skips event types not in EMAIL_RELAY_EVENT_TYPES (e.g. system)", async () => {
		const t = createBackend();
		const f = await seedFixture(t);
		const notificationId = await insertIssueAssignedNotification(t, f);

		const result = await t.run((ctx) =>
			enqueueEmailForNotification(ctx, {
				notificationId,
				workspaceId: f.workspaceId,
				userId: f.recipientId,
				eventType: "system",
			}),
		);

		expect(result).toEqual({ queued: 0, skipped: 1 });
	});

	it("respects the notifyEmail === false opt-out", async () => {
		const t = createBackend();
		const f = await seedFixture(t, { notifyEmail: false });
		const notificationId = await insertIssueAssignedNotification(t, f);

		const result = await t.run((ctx) =>
			enqueueEmailForNotification(ctx, {
				notificationId,
				workspaceId: f.workspaceId,
				userId: f.recipientId,
				eventType: "issue_assigned",
			}),
		);

		expect(result).toEqual({ queued: 0, skipped: 1 });
	});

	it("skips when recipient has no email on record", async () => {
		const t = createBackend();
		const f = await seedFixture(t, { omitEmail: true });
		const notificationId = await insertIssueAssignedNotification(t, f);

		const result = await t.run((ctx) =>
			enqueueEmailForNotification(ctx, {
				notificationId,
				workspaceId: f.workspaceId,
				userId: f.recipientId,
				eventType: "issue_assigned",
			}),
		);

		expect(result).toEqual({ queued: 0, skipped: 1 });
	});

	it("treats notifyEmail === undefined as opt-in (default)", async () => {
		const t = createBackend();
		const f = await seedFixture(t, { notifyEmail: undefined });
		const notificationId = await insertIssueAssignedNotification(t, f);

		const result = await t.run((ctx) =>
			enqueueEmailForNotification(ctx, {
				notificationId,
				workspaceId: f.workspaceId,
				userId: f.recipientId,
				eventType: "issue_assigned",
			}),
		);

		expect(result).toEqual({ queued: 1, skipped: 0 });
	});

	it("still creates an archived notification when in-app is disabled but email remains enabled", async () => {
		const t = createBackend();
		const f = await seedFixture(t);

		await t.run(async (ctx) => {
			await ctx.db.patch(f.recipientId, { notifyInApp: false });
		});

		const created = await t.run((ctx) =>
			createNotification(ctx, {
				userId: f.recipientId,
				workspaceId: f.workspaceId,
				type: "issue_assigned",
				title: "Assigned to you: CLV-42",
				body: "Please take a look",
				actorId: f.actorId,
			}),
		);

		const notifications = await t.run(async (ctx) => {
			return await ctx.db
				.query("notifications")
				.withIndex("by_user_workspace", (q) =>
					q.eq("userId", f.recipientId).eq("workspaceId", f.workspaceId),
				)
				.collect();
		});

		expect(created).toBe(true);
		expect(notifications).toHaveLength(1);
		expect(notifications[0]?.isArchived).toBe(true);
	});
});

describe("emailRelay prepareNotificationEmail (integration)", () => {
	it("returns a ready payload with title/body/deep-link for an assigned issue", async () => {
		const t = createBackend();
		const f = await seedFixture(t);
		const issueId = await t.run(async (ctx) => {
			return await ctx.db.insert("issues", {
				title: "Fix widget crash",
				identifier: "CLV-42",
				workspaceId: f.workspaceId,
				status: "todo",
				priority: "high",
				type: "bug",
				sortOrder: 0,
				createdBy: f.actorId,
				updatedAt: Date.now(),
			});
		});
		const notificationId = await t.run(async (ctx) => {
			return await ctx.db.insert("notifications", {
				userId: f.recipientId,
				workspaceId: f.workspaceId,
				type: "issue_assigned",
				eventType: "issue_assigned",
				title: "Assigned to you: CLV-42 Fix widget crash",
				body: "Please take a look",
				actorId: f.actorId,
				issueId,
				isRead: false,
			});
		});

		const prepared = await t.query(prepareEmailRef, {
			notificationId,
			workspaceId: f.workspaceId,
		});

		expect(prepared.status).toBe("ready");
		expect(prepared.to).toBe("recipient@example.com");
		expect(prepared.subject).toContain("Acme");
		expect(prepared.subject).toContain("CLV-42");
		expect(prepared.html).toContain("Fix widget crash");
		expect(prepared.html).toContain("/acme/issues/CLV-42");
		expect(prepared.html).toContain("Sarah");
	});

	it("prefers NEXT_PUBLIC_APP_URL over APP_URL when building notification links", async () => {
		const t = createBackend();
		const f = await seedFixture(t);
		const issueId = await t.run(async (ctx) => {
			return await ctx.db.insert("issues", {
				title: "Fix widget crash",
				identifier: "CLV-42",
				workspaceId: f.workspaceId,
				status: "todo",
				priority: "high",
				type: "bug",
				sortOrder: 0,
				createdBy: f.actorId,
				updatedAt: Date.now(),
			});
		});
		const notificationId = await t.run(async (ctx) => {
			return await ctx.db.insert("notifications", {
				userId: f.recipientId,
				workspaceId: f.workspaceId,
				type: "issue_assigned",
				eventType: "issue_assigned",
				title: "Assigned to you: CLV-42 Fix widget crash",
				actorId: f.actorId,
				issueId,
				isRead: false,
			});
		});

		vi.stubEnv("APP_URL", "https://clave.z360.js");
		vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://clave.z360.biz");

		try {
			const prepared = await t.query(prepareEmailRef, {
				notificationId,
				workspaceId: f.workspaceId,
			});

			expect(prepared.status).toBe("ready");
			expect(prepared.html).toContain(
				"https://clave.z360.biz/acme/issues/CLV-42",
			);
			expect(prepared.html).not.toContain(
				"https://clave.z360.js/acme/issues/CLV-42",
			);
		} finally {
			vi.unstubAllEnvs();
		}
	});

	it("drops when recipient has opted out (guards against a stale scheduled send)", async () => {
		const t = createBackend();
		const f = await seedFixture(t);
		const notificationId = await insertIssueAssignedNotification(t, f);

		// Opt out AFTER the notification was created (simulating a send
		// that was already in flight when the user toggled the pref off).
		await t.run(async (ctx) => {
			await ctx.db.patch(f.recipientId, { notifyEmail: false });
		});

		const prepared = await t.query(prepareEmailRef, {
			notificationId,
			workspaceId: f.workspaceId,
		});

		expect(prepared.status).toBe("drop");
		expect(prepared.reason).toMatch(/opted out/i);
	});

	it("drops non-emailable event types even if queue somehow picked them up", async () => {
		const t = createBackend();
		const f = await seedFixture(t);
		const notificationId = await t.run(async (ctx) => {
			return await ctx.db.insert("notifications", {
				userId: f.recipientId,
				workspaceId: f.workspaceId,
				type: "system",
				eventType: "system",
				title: "System message",
				isRead: false,
			});
		});

		const prepared = await t.query(prepareEmailRef, {
			notificationId,
			workspaceId: f.workspaceId,
		});

		expect(prepared.status).toBe("drop");
		expect(prepared.reason).toMatch(/not emailable/i);
	});
});
