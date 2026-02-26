/// <reference types="vite/client" />

import { makeFunctionReference } from "convex/server";
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import type { Id } from "../../convex/_generated/dataModel";
import schema from "../../convex/schema";

const modules = import.meta.glob("../../convex/**/*.*s");

function createBackend() {
	return convexTest(schema, modules);
}

const setSpaceSubscriptionRef = makeFunctionReference<
	"mutation",
	{
		workspaceId: Id<"workspaces">;
		provider?: "google-chat";
		targetId: string;
		eventType: string;
		enabled: boolean;
	},
	Id<"chatSubscriptions">
>("chatRelay:setSpaceSubscription");

const enqueueNotificationRelayRef = makeFunctionReference<
	"mutation",
	{ notificationId: Id<"notifications">; scheduleSend?: boolean },
	{ queued: number; skipped: number }
>("chatRelay:enqueueNotificationRelay");

type Fixture = {
	adminId: Id<"users">;
	memberId: Id<"users">;
	workspaceId: Id<"workspaces">;
};

async function seedFixture(
	t: ReturnType<typeof createBackend>,
): Promise<Fixture> {
	return t.run(async (ctx) => {
		const ownerId = await ctx.db.insert("users", { name: "Owner" });
		const adminId = await ctx.db.insert("users", { name: "Admin" });
		const memberId = await ctx.db.insert("users", {
			name: "Member",
			notifyGoogleChat: true,
		});

		const organizationId = await ctx.db.insert("organizations", {
			name: "Relay Org",
			slug: "relay-org",
			ownerId,
		});

		await ctx.db.insert("organizationMembers", {
			organizationId,
			userId: ownerId,
			role: "owner",
			joinedAt: Date.now(),
		});
		await ctx.db.insert("organizationMembers", {
			organizationId,
			userId: adminId,
			role: "admin",
			joinedAt: Date.now(),
		});
		await ctx.db.insert("organizationMembers", {
			organizationId,
			userId: memberId,
			role: "member",
			joinedAt: Date.now(),
		});

		const workspaceId = await ctx.db.insert("workspaces", {
			name: "Relay Workspace",
			slug: "relay-workspace",
			ownerId: adminId,
			organizationId,
		});

		await ctx.db.insert("workspaceMembers", {
			workspaceId,
			userId: adminId,
			role: "admin",
			joinedAt: Date.now(),
		});
		await ctx.db.insert("workspaceMembers", {
			workspaceId,
			userId: memberId,
			role: "member",
			joinedAt: Date.now(),
		});

		await ctx.db.insert("workspaceSettings", {
			workspaceId,
			storyPrefix: "GC",
			nextStoryNumber: 1,
		});

		await ctx.db.insert("chatConnections", {
			workspaceId,
			provider: "google-chat",
			status: "connected",
			installedBy: adminId,
			installedAt: Date.now(),
			createdAt: Date.now(),
			updatedAt: Date.now(),
		});

		await ctx.db.insert("chatPolicies", {
			workspaceId,
			provider: "google-chat",
			enabled: true,
			allowDirectMessages: true,
			allowSpaces: true,
			requireIdentityLink: true,
			allowedIssueActionIds: [
				"assign_to_me",
				"set_status_non_destructive",
				"open_issue_link",
			],
			requireActionConfirmation: false,
			updatedBy: adminId,
			createdAt: Date.now(),
			updatedAt: Date.now(),
		});

		await ctx.db.insert("chatUserLinks", {
			workspaceId,
			provider: "google-chat",
			chatUserId: "users/member-chat",
			userId: memberId,
			linkedBy: adminId,
			linkedAt: Date.now(),
			updatedAt: Date.now(),
		});

		return { adminId, memberId, workspaceId };
	});
}

describe("google chat relay queueing (integration)", () => {
	it("queues DM and space relay targets for matching notification", async () => {
		const t = createBackend();
		const fixture = await seedFixture(t);
		const admin = t.withIdentity({ subject: fixture.adminId });

		await admin.mutation(setSpaceSubscriptionRef, {
			workspaceId: fixture.workspaceId,
			provider: "google-chat",
			targetId: "spaces/SPACE_001",
			eventType: "issue_assigned",
			enabled: true,
		});

		const notificationId = await t.run(async (ctx) => {
			return await ctx.db.insert("notifications", {
				userId: fixture.memberId,
				workspaceId: fixture.workspaceId,
				type: "issue_assigned",
				eventType: "issue_assigned",
				title: "Issue assigned to you",
				body: "GC-2: Relay notifications to Chat",
				isRead: false,
			});
		});

		// scheduleSend: false prevents actually scheduling the action,
		// but still resolves targets and returns the count
		const result = await admin.mutation(enqueueNotificationRelayRef, {
			notificationId,
			scheduleSend: false,
		});

		// Should find 2 targets: 1 DM (via chatUserLinks) + 1 space subscription
		expect(result.queued).toBe(2);
		expect(result.skipped).toBe(0);
	});

	it("skips relay when policy is disabled", async () => {
		const t = createBackend();
		const fixture = await seedFixture(t);
		const admin = t.withIdentity({ subject: fixture.adminId });

		// Disable the policy
		await t.run(async (ctx) => {
			const policy = await ctx.db
				.query("chatPolicies")
				.withIndex("by_workspace_provider", (q) =>
					q
						.eq("workspaceId", fixture.workspaceId)
						.eq("provider", "google-chat"),
				)
				.first();
			if (policy) {
				await ctx.db.patch(policy._id, { enabled: false });
			}
		});

		const notificationId = await t.run(async (ctx) => {
			return await ctx.db.insert("notifications", {
				userId: fixture.memberId,
				workspaceId: fixture.workspaceId,
				type: "issue_assigned",
				eventType: "issue_assigned",
				title: "Issue assigned",
				body: "Disabled policy test",
				isRead: false,
			});
		});

		const result = await admin.mutation(enqueueNotificationRelayRef, {
			notificationId,
			scheduleSend: false,
		});

		expect(result.queued).toBe(0);
		expect(result.skipped).toBe(1);
	});

	it("skips relay when connection is not active", async () => {
		const t = createBackend();
		const fixture = await seedFixture(t);
		const admin = t.withIdentity({ subject: fixture.adminId });

		// Disconnect
		await t.run(async (ctx) => {
			const conn = await ctx.db
				.query("chatConnections")
				.withIndex("by_workspace_provider", (q) =>
					q
						.eq("workspaceId", fixture.workspaceId)
						.eq("provider", "google-chat"),
				)
				.first();
			if (conn) {
				await ctx.db.patch(conn._id, { status: "disconnected" });
			}
		});

		const notificationId = await t.run(async (ctx) => {
			return await ctx.db.insert("notifications", {
				userId: fixture.memberId,
				workspaceId: fixture.workspaceId,
				type: "issue_assigned",
				eventType: "issue_assigned",
				title: "Issue assigned",
				body: "Disconnected test",
				isRead: false,
			});
		});

		const result = await admin.mutation(enqueueNotificationRelayRef, {
			notificationId,
			scheduleSend: false,
		});

		expect(result.queued).toBe(0);
		expect(result.skipped).toBe(1);
	});
});
