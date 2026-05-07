/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import schema from "../../convex/schema";

const modules = import.meta.glob("../../convex/**/*.*s");

function createBackend() {
	return convexTest(schema, modules);
}

type Fixture = {
	adminId: Id<"users">;
	memberId: Id<"users">;
	workspaceId: Id<"workspaces">;
	projectId: Id<"projects">;
};

async function seedFixture(
	t: ReturnType<typeof createBackend>,
): Promise<Fixture> {
	return t.run(async (ctx) => {
		const adminId = await ctx.db.insert("users", {
			name: "Admin",
			email: "admin@example.com",
		});
		const memberId = await ctx.db.insert("users", {
			name: "Member",
			email: "member@example.com",
		});

		const workspaceId = await ctx.db.insert("workspaces", {
			name: "Notif WS",
			slug: "notif-ws",
			ownerId: adminId,
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
			storyPrefix: "ST",
			nextStoryNumber: 1,
			issuePrefix: "CLV",
			nextIssueNumber: 1,
		});

		// Issues now require projectId — seed a project so create() succeeds.
		const projectId = await ctx.db.insert("projects", {
			workspaceId,
			name: "Notif Project",
			slug: "notif-project",
			status: "active",
			sortOrder: 0,
			createdBy: adminId,
		});

		return { adminId, memberId, workspaceId, projectId };
	});
}

describe("issue assignment notifications", () => {
	it("creates an assignee notification when assignees change through issues.update", async () => {
		const t = createBackend();
		const fx = await seedFixture(t);
		const admin = t.withIdentity({ subject: fx.adminId });

		const { issueId } = await admin.mutation(api.issues.create, {
			workspaceId: fx.workspaceId,
			projectId: fx.projectId,
			title: "Wire notification flow",
		});

		await admin.mutation(api.issues.update, {
			issueId,
			assigneeIds: [fx.memberId],
		});

		const notifications = await t.run(async (ctx) => {
			return await ctx.db
				.query("notifications")
				.withIndex("by_user_workspace", (q) =>
					q.eq("userId", fx.memberId).eq("workspaceId", fx.workspaceId),
				)
				.collect();
		});

		expect(notifications).toHaveLength(1);
		expect(notifications[0]?.type).toBe("issue_assigned");
		expect(notifications[0]?.issueId).toBe(issueId);
	});

	it("auto-subscribes the new assignee so later issue updates notify them", async () => {
		const t = createBackend();
		const fx = await seedFixture(t);
		const admin = t.withIdentity({ subject: fx.adminId });
		const member = t.withIdentity({ subject: fx.memberId });

		const { issueId } = await admin.mutation(api.issues.create, {
			workspaceId: fx.workspaceId,
			projectId: fx.projectId,
			title: "Track assignment subscriptions",
		});

		await admin.mutation(api.issues.update, {
			issueId,
			assigneeIds: [fx.memberId],
		});

		const subscriptions = await t.run(async (ctx) => {
			return await ctx.db
				.query("issueSubscriptions")
				.withIndex("by_issue", (q) => q.eq("issueId", issueId))
				.collect();
		});

		expect(subscriptions.some((s) => s.userId === fx.memberId)).toBe(true);

		await admin.mutation(api.issues.updateStatus, {
			issueId,
			status: "in_progress",
		});

		const inbox = await member.query(api.notifications.list, {
			workspaceId: fx.workspaceId,
			limit: 20,
		});

		expect(
			inbox.notifications.some(
				(n) =>
					n.type === "issue_status_changed" &&
					n.issueId === issueId &&
					n.title === "Issue status changed",
			),
		).toBe(true);
	});
});
