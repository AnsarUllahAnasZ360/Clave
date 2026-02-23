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
	projectId: Id<"projects">;
	restrictedProjectId: Id<"projects">;
};

async function seedFixture(
	t: ReturnType<typeof createBackend>,
): Promise<Fixture> {
	return t.run(async (ctx) => {
		const adminId = await ctx.db.insert("users", { name: "Admin" });
		const memberId = await ctx.db.insert("users", { name: "Member" });
		const outsiderId = await ctx.db.insert("users", { name: "Outsider" });

		const workspaceId = await ctx.db.insert("workspaces", {
			name: "Sprint WS",
			slug: "sprint-ws",
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
			storyPrefix: "SP",
			nextStoryNumber: 1,
			issuePrefix: "ISS",
			nextIssueNumber: 1,
		});

		const projectId = await ctx.db.insert("projects", {
			workspaceId,
			name: "Open Project",
			slug: "open-project",
			status: "active",
			sortOrder: 1,
			createdBy: adminId,
		});

		// Add member to project
		await ctx.db.insert("projectMembers", {
			projectId,
			userId: memberId,
			role: "member",
			addedAt: Date.now(),
		});

		const restrictedProjectId = await ctx.db.insert("projects", {
			workspaceId,
			name: "Restricted Project",
			slug: "restricted-project",
			status: "active",
			sortOrder: 2,
			createdBy: adminId,
		});

		return {
			adminId,
			memberId,
			outsiderId,
			workspaceId,
			projectId,
			restrictedProjectId,
		};
	});
}

describe("sprints", () => {
	describe("create", () => {
		it("creates a sprint with required fields", async () => {
			const t = createBackend();
			const fx = await seedFixture(t);
			const admin = t.withIdentity({ subject: fx.adminId });

			const sprintId = await admin.mutation(api.sprints.create, {
				projectId: fx.projectId,
				name: "Sprint 1",
			});

			expect(sprintId).toBeDefined();

			const sprint = await admin.query(api.sprints.getById, { sprintId });
			expect(sprint).not.toBeNull();
			expect(sprint?.name).toBe("Sprint 1");
			expect(sprint?.status).toBe("active"); // default status
		});

		it("creates a sprint with all optional fields", async () => {
			const t = createBackend();
			const fx = await seedFixture(t);
			const admin = t.withIdentity({ subject: fx.adminId });

			const now = Date.now();
			const sprintId = await admin.mutation(api.sprints.create, {
				projectId: fx.projectId,
				name: "Sprint Full",
				description: "A full sprint",
				status: "planned",
				startDate: now,
				targetDate: now + 14 * 86400000,
				goals: ["Goal 1", "Goal 2"],
			});

			const sprint = await admin.query(api.sprints.getById, { sprintId });
			expect(sprint?.description).toBe("A full sprint");
			expect(sprint?.status).toBe("planned");
			expect(sprint?.goals).toEqual(["Goal 1", "Goal 2"]);
		});

		it("rejects sprint creation for inaccessible project (member)", async () => {
			const t = createBackend();
			const fx = await seedFixture(t);
			const member = t.withIdentity({ subject: fx.memberId });

			await expect(
				member.mutation(api.sprints.create, {
					projectId: fx.restrictedProjectId,
					name: "Blocked Sprint",
				}),
			).rejects.toThrow(/don't have access/i);
		});

		it("rejects sprint creation for deleted project", async () => {
			const t = createBackend();
			const fx = await seedFixture(t);
			const admin = t.withIdentity({ subject: fx.adminId });

			await t.run(async (ctx) => {
				await ctx.db.patch(fx.projectId, { deletedAt: Date.now() });
			});

			await expect(
				admin.mutation(api.sprints.create, {
					projectId: fx.projectId,
					name: "Sprint on Deleted",
				}),
			).rejects.toThrow(/project not found/i);
		});
	});

	describe("listByProject", () => {
		it("lists sprints for a project", async () => {
			const t = createBackend();
			const fx = await seedFixture(t);
			const admin = t.withIdentity({ subject: fx.adminId });

			await admin.mutation(api.sprints.create, {
				projectId: fx.projectId,
				name: "Sprint 1",
			});
			await admin.mutation(api.sprints.create, {
				projectId: fx.projectId,
				name: "Sprint 2",
			});

			const sprints = await admin.query(api.sprints.listByProject, {
				projectId: fx.projectId,
			});
			expect(sprints).toHaveLength(2);
		});

		it("excludes soft-deleted sprints", async () => {
			const t = createBackend();
			const fx = await seedFixture(t);
			const admin = t.withIdentity({ subject: fx.adminId });

			const sprintId = await admin.mutation(api.sprints.create, {
				projectId: fx.projectId,
				name: "To Delete",
			});

			await admin.mutation(api.sprints.remove, { sprintId });

			const sprints = await admin.query(api.sprints.listByProject, {
				projectId: fx.projectId,
			});
			expect(sprints).toHaveLength(0);
		});

		it("returns empty for inaccessible project", async () => {
			const t = createBackend();
			const fx = await seedFixture(t);
			const member = t.withIdentity({ subject: fx.memberId });

			// Admin creates sprint on restricted project
			const admin = t.withIdentity({ subject: fx.adminId });
			await admin.mutation(api.sprints.create, {
				projectId: fx.restrictedProjectId,
				name: "Secret Sprint",
			});

			const sprints = await member.query(api.sprints.listByProject, {
				projectId: fx.restrictedProjectId,
			});
			expect(sprints).toEqual([]);
		});

		it("includes progress data (issueCount, completedCount, progressPercentage)", async () => {
			const t = createBackend();
			const fx = await seedFixture(t);
			const admin = t.withIdentity({ subject: fx.adminId });

			const sprintId = await admin.mutation(api.sprints.create, {
				projectId: fx.projectId,
				name: "Progress Sprint",
			});

			// Add issues to sprint
			await admin.mutation(api.issues.create, {
				workspaceId: fx.workspaceId,
				projectId: fx.projectId,
				sprintId,
				title: "Issue 1",
				status: "done",
			});
			await admin.mutation(api.issues.create, {
				workspaceId: fx.workspaceId,
				projectId: fx.projectId,
				sprintId,
				title: "Issue 2",
				status: "in_progress",
			});

			const sprints = await admin.query(api.sprints.listByProject, {
				projectId: fx.projectId,
			});
			expect(sprints).toHaveLength(1);
			expect(sprints[0].issueCount).toBe(2);
			expect(sprints[0].completedCount).toBe(1);
			expect(sprints[0].progressPercentage).toBe(50);
		});
	});

	describe("listByWorkspace", () => {
		it("lists sprints across all accessible projects", async () => {
			const t = createBackend();
			const fx = await seedFixture(t);
			const admin = t.withIdentity({ subject: fx.adminId });

			await admin.mutation(api.sprints.create, {
				projectId: fx.projectId,
				name: "Sprint A",
			});
			await admin.mutation(api.sprints.create, {
				projectId: fx.restrictedProjectId,
				name: "Sprint B",
			});

			const sprints = await admin.query(api.sprints.listByWorkspace, {
				workspaceId: fx.workspaceId,
			});
			expect(sprints).toHaveLength(2);
		});

		it("includes projectName in results", async () => {
			const t = createBackend();
			const fx = await seedFixture(t);
			const admin = t.withIdentity({ subject: fx.adminId });

			await admin.mutation(api.sprints.create, {
				projectId: fx.projectId,
				name: "Sprint X",
			});

			const sprints = await admin.query(api.sprints.listByWorkspace, {
				workspaceId: fx.workspaceId,
			});
			expect(sprints[0].projectName).toBe("Open Project");
		});
	});

	describe("getById", () => {
		it("returns sprint by ID with progress", async () => {
			const t = createBackend();
			const fx = await seedFixture(t);
			const admin = t.withIdentity({ subject: fx.adminId });

			const sprintId = await admin.mutation(api.sprints.create, {
				projectId: fx.projectId,
				name: "Get Sprint",
			});

			const sprint = await admin.query(api.sprints.getById, { sprintId });
			expect(sprint).not.toBeNull();
			expect(sprint?.name).toBe("Get Sprint");
			expect(sprint?.issueCount).toBe(0);
			expect(sprint?.progressPercentage).toBe(0);
		});

		it("returns null for deleted sprint", async () => {
			const t = createBackend();
			const fx = await seedFixture(t);
			const admin = t.withIdentity({ subject: fx.adminId });

			const sprintId = await admin.mutation(api.sprints.create, {
				projectId: fx.projectId,
				name: "To Delete",
			});
			await admin.mutation(api.sprints.remove, { sprintId });

			const sprint = await admin.query(api.sprints.getById, { sprintId });
			expect(sprint).toBeNull();
		});

		it("returns null for inaccessible project sprint", async () => {
			const t = createBackend();
			const fx = await seedFixture(t);

			const admin = t.withIdentity({ subject: fx.adminId });
			const sprintId = await admin.mutation(api.sprints.create, {
				projectId: fx.restrictedProjectId,
				name: "Secret",
			});

			const member = t.withIdentity({ subject: fx.memberId });
			const sprint = await member.query(api.sprints.getById, { sprintId });
			expect(sprint).toBeNull();
		});
	});

	describe("update", () => {
		it("updates sprint name and description", async () => {
			const t = createBackend();
			const fx = await seedFixture(t);
			const admin = t.withIdentity({ subject: fx.adminId });

			const sprintId = await admin.mutation(api.sprints.create, {
				projectId: fx.projectId,
				name: "Original",
			});

			await admin.mutation(api.sprints.update, {
				sprintId,
				name: "Updated",
				description: "New desc",
			});

			const sprint = await admin.query(api.sprints.getById, { sprintId });
			expect(sprint?.name).toBe("Updated");
			expect(sprint?.description).toBe("New desc");
		});

		it("updates sprint status", async () => {
			const t = createBackend();
			const fx = await seedFixture(t);
			const admin = t.withIdentity({ subject: fx.adminId });

			const sprintId = await admin.mutation(api.sprints.create, {
				projectId: fx.projectId,
				name: "Status Sprint",
				status: "planned",
			});

			await admin.mutation(api.sprints.update, {
				sprintId,
				status: "active",
			});

			const sprint = await admin.query(api.sprints.getById, { sprintId });
			expect(sprint?.status).toBe("active");
		});

		it("rejects update for inaccessible project sprint", async () => {
			const t = createBackend();
			const fx = await seedFixture(t);

			const admin = t.withIdentity({ subject: fx.adminId });
			const sprintId = await admin.mutation(api.sprints.create, {
				projectId: fx.restrictedProjectId,
				name: "Blocked",
			});

			const member = t.withIdentity({ subject: fx.memberId });
			await expect(
				member.mutation(api.sprints.update, {
					sprintId,
					name: "Hacked",
				}),
			).rejects.toThrow(/don't have access/i);
		});
	});

	describe("remove", () => {
		it("soft-deletes a sprint", async () => {
			const t = createBackend();
			const fx = await seedFixture(t);
			const admin = t.withIdentity({ subject: fx.adminId });

			const sprintId = await admin.mutation(api.sprints.create, {
				projectId: fx.projectId,
				name: "Delete Me",
			});

			await admin.mutation(api.sprints.remove, { sprintId });

			const sprint = await admin.query(api.sprints.getById, { sprintId });
			expect(sprint).toBeNull();
		});

		it("disassociates issues from deleted sprint", async () => {
			const t = createBackend();
			const fx = await seedFixture(t);
			const admin = t.withIdentity({ subject: fx.adminId });

			const sprintId = await admin.mutation(api.sprints.create, {
				projectId: fx.projectId,
				name: "Sprint With Issues",
			});

			const { issueId } = await admin.mutation(api.issues.create, {
				workspaceId: fx.workspaceId,
				projectId: fx.projectId,
				sprintId,
				title: "Sprint Issue",
			});

			await admin.mutation(api.sprints.remove, { sprintId });

			const issue = await admin.query(api.issues.getById, { issueId });
			expect(issue?.sprintId).toBeUndefined();
		});
	});

	describe("complete", () => {
		it("marks a sprint as completed", async () => {
			const t = createBackend();
			const fx = await seedFixture(t);
			const admin = t.withIdentity({ subject: fx.adminId });

			const sprintId = await admin.mutation(api.sprints.create, {
				projectId: fx.projectId,
				name: "Complete Me",
			});

			await admin.mutation(api.sprints.complete, { sprintId });

			const sprint = await admin.query(api.sprints.getById, { sprintId });
			expect(sprint?.status).toBe("completed");
		});
	});

	describe("reorder", () => {
		it("updates sprint sort order", async () => {
			const t = createBackend();
			const fx = await seedFixture(t);
			const admin = t.withIdentity({ subject: fx.adminId });

			const sprintId = await admin.mutation(api.sprints.create, {
				projectId: fx.projectId,
				name: "Reorder Me",
			});

			await admin.mutation(api.sprints.reorder, {
				sprintId,
				newSortOrder: 99.5,
			});

			const sprint = await admin.query(api.sprints.getById, { sprintId });
			expect(sprint?.sortOrder).toBe(99.5);
		});
	});
});
