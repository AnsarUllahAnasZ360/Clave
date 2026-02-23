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
	outsiderId: Id<"users">;
	workspaceId: Id<"workspaces">;
	projectAccessibleId: Id<"projects">;
	projectRestrictedId: Id<"projects">;
	sprintRestrictedId: Id<"sprints">;
	accessibleIssueId: Id<"issues">;
	restrictedIssueId: Id<"issues">;
};

async function seedFixture(
	t: ReturnType<typeof createBackend>,
): Promise<Fixture> {
	return t.run(async (ctx) => {
		const adminId = await ctx.db.insert("users", { name: "Admin" });
		const memberId = await ctx.db.insert("users", { name: "Member" });
		const outsiderId = await ctx.db.insert("users", { name: "Outsider" });

		const workspaceId = await ctx.db.insert("workspaces", {
			name: "Acme",
			slug: "acme-hardening",
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
			issuePrefix: "ISS",
			nextIssueNumber: 10,
		});

		const projectAccessibleId = await ctx.db.insert("projects", {
			workspaceId,
			name: "Accessible",
			slug: "accessible",
			status: "active",
			sortOrder: 1,
			createdBy: memberId,
		});
		const projectRestrictedId = await ctx.db.insert("projects", {
			workspaceId,
			name: "Restricted",
			slug: "restricted",
			status: "active",
			sortOrder: 2,
			createdBy: adminId,
		});

		const sprintRestrictedId = await ctx.db.insert("sprints", {
			projectId: projectRestrictedId,
			name: "Secret Sprint",
			status: "active",
			sortOrder: 1,
			createdBy: adminId,
		});

		const accessibleIssueId = await ctx.db.insert("issues", {
			workspaceId,
			projectId: projectAccessibleId,
			identifier: "ISS-1",
			title: "Visible issue",
			status: "backlog",
			priority: "medium",
			type: "issue",
			assigneeId: memberId,
			sortOrder: 1,
			createdBy: memberId,
		});
		const restrictedIssueId = await ctx.db.insert("issues", {
			workspaceId,
			projectId: projectRestrictedId,
			identifier: "ISS-2",
			title: "Hidden issue",
			status: "backlog",
			priority: "medium",
			type: "issue",
			sortOrder: 2,
			createdBy: adminId,
		});

		return {
			adminId,
			memberId,
			outsiderId,
			workspaceId,
			projectAccessibleId,
			projectRestrictedId,
			sprintRestrictedId,
			accessibleIssueId,
			restrictedIssueId,
		};
	});
}

describe("project management hardening", () => {
	it("blocks moving an issue into a sprint in an inaccessible project", async () => {
		const t = createBackend();
		const fx = await seedFixture(t);
		const member = t.withIdentity({ subject: fx.memberId });

		await expect(
			member.mutation(api.issues.update, {
				issueId: fx.accessibleIssueId,
				sprintId: fx.sprintRestrictedId,
			}),
		).rejects.toThrow(/target project/i);
	});

	it("rejects assigning an issue to a non-workspace member", async () => {
		const t = createBackend();
		const fx = await seedFixture(t);
		const member = t.withIdentity({ subject: fx.memberId });

		await expect(
			member.mutation(api.issues.assign, {
				issueId: fx.accessibleIssueId,
				assigneeId: fx.outsiderId,
			}),
		).rejects.toThrow(/assignee must be a member/i);
	});

	it("hides restricted relation targets and blocks relation changes without access", async () => {
		const t = createBackend();
		const fx = await seedFixture(t);

		await t.run(async (ctx) => {
			await ctx.db.insert("issueRelations", {
				issueId: fx.accessibleIssueId,
				relatedIssueId: fx.restrictedIssueId,
				type: "blocks",
				createdBy: fx.adminId,
				createdAt: Date.now(),
			});
		});

		const member = t.withIdentity({ subject: fx.memberId });
		const relations = await member.query(api.issueRelations.listByIssue, {
			issueId: fx.accessibleIssueId,
		});
		expect(relations.blocks).toHaveLength(0);
		expect(relations.blocked_by).toHaveLength(0);

		await expect(
			member.mutation(api.issueRelations.create, {
				issueId: fx.restrictedIssueId,
				relatedIssueId: fx.accessibleIssueId,
				type: "relates_to",
			}),
		).rejects.toThrow(/don't have access/i);
	});

	it("returns no sprints for projects the member cannot access", async () => {
		const t = createBackend();
		const fx = await seedFixture(t);
		const member = t.withIdentity({ subject: fx.memberId });

		const sprints = await member.query(api.sprints.listByProject, {
			projectId: fx.projectRestrictedId,
		});
		expect(sprints).toEqual([]);
	});
});
