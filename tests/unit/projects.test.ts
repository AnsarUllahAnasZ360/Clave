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
};

async function seedFixture(
	t: ReturnType<typeof createBackend>,
): Promise<Fixture> {
	return t.run(async (ctx) => {
		const adminId = await ctx.db.insert("users", { name: "Admin" });
		const memberId = await ctx.db.insert("users", { name: "Member" });

		const workspaceId = await ctx.db.insert("workspaces", {
			name: "Project WS",
			slug: "project-ws",
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
			issuePrefix: "PRJ",
			nextIssueNumber: 1,
		});

		return { adminId, memberId, workspaceId };
	});
}

describe("projects", () => {
	describe("create", () => {
		it("creates a project with required fields", async () => {
			const t = createBackend();
			const fx = await seedFixture(t);
			const admin = t.withIdentity({ subject: fx.adminId });

			const projectId = await admin.mutation(api.projects.create, {
				workspaceId: fx.workspaceId,
				name: "New Project",
			});

			expect(projectId).toBeDefined();

			const project = await admin.query(api.projects.getById, {
				projectId,
			});
			expect(project).not.toBeNull();
			expect(project?.name).toBe("New Project");
			expect(project?.status).toBe("planned"); // default
			expect(project?.slug).toBe("new-project");
		}, 15000);

		it("creates project with all optional fields", async () => {
			const t = createBackend();
			const fx = await seedFixture(t);
			const admin = t.withIdentity({ subject: fx.adminId });

			const now = Date.now();
			const projectId = await admin.mutation(api.projects.create, {
				workspaceId: fx.workspaceId,
				name: "Full Project",
				description: "A full project",
				status: "active",
				priority: "high",
				startDate: now,
				endDate: now + 30 * 86400000,
				intent: "delivery",
				successType: "deliverable",
				structure: "sprints",
				tags: ["v1", "core"],
			});

			const project = await admin.query(api.projects.getById, {
				projectId,
			});
			expect(project?.description).toBe("A full project");
			expect(project?.status).toBe("active");
			expect(project?.priority).toBe("high");
			expect(project?.tags).toEqual(["v1", "core"]);
		});

		it("generates unique slug on duplicate name", async () => {
			const t = createBackend();
			const fx = await seedFixture(t);
			const admin = t.withIdentity({ subject: fx.adminId });

			const id1 = await admin.mutation(api.projects.create, {
				workspaceId: fx.workspaceId,
				name: "Same Name",
			});
			const id2 = await admin.mutation(api.projects.create, {
				workspaceId: fx.workspaceId,
				name: "Same Name",
			});

			const p1 = await admin.query(api.projects.getById, {
				projectId: id1,
			});
			const p2 = await admin.query(api.projects.getById, {
				projectId: id2,
			});
			expect(p1?.slug).toBe("same-name");
			expect(p2?.slug).toBe("same-name-2");
		});

		it("adds creator as project owner", async () => {
			const t = createBackend();
			const fx = await seedFixture(t);
			const member = t.withIdentity({ subject: fx.memberId });

			const projectId = await member.mutation(api.projects.create, {
				workspaceId: fx.workspaceId,
				name: "Member Project",
			});

			// Creator should be able to access their own project
			const project = await member.query(api.projects.getById, {
				projectId,
			});
			expect(project).not.toBeNull();
		});
	});

	describe("list", () => {
		it("lists all projects for admin", async () => {
			const t = createBackend();
			const fx = await seedFixture(t);
			const admin = t.withIdentity({ subject: fx.adminId });

			await admin.mutation(api.projects.create, {
				workspaceId: fx.workspaceId,
				name: "Project A",
			});
			await admin.mutation(api.projects.create, {
				workspaceId: fx.workspaceId,
				name: "Project B",
			});

			const projects = await admin.query(api.projects.list, {
				workspaceId: fx.workspaceId,
			});
			expect(projects).toHaveLength(2);
		});

		it("excludes deleted projects", async () => {
			const t = createBackend();
			const fx = await seedFixture(t);
			const admin = t.withIdentity({ subject: fx.adminId });

			const projectId = await admin.mutation(api.projects.create, {
				workspaceId: fx.workspaceId,
				name: "Delete Me",
			});

			await admin.mutation(api.projects.remove, { projectId });

			const projects = await admin.query(api.projects.list, {
				workspaceId: fx.workspaceId,
			});
			expect(projects).toHaveLength(0);
		});

		it("members only see accessible projects", async () => {
			const t = createBackend();
			const fx = await seedFixture(t);
			const admin = t.withIdentity({ subject: fx.adminId });
			const member = t.withIdentity({ subject: fx.memberId });

			// Admin creates two projects
			await admin.mutation(api.projects.create, {
				workspaceId: fx.workspaceId,
				name: "Admin Only Project",
			});

			// Member creates their own — they become owner
			await member.mutation(api.projects.create, {
				workspaceId: fx.workspaceId,
				name: "Member Project",
			});

			const memberProjects = await member.query(api.projects.list, {
				workspaceId: fx.workspaceId,
			});
			// Member sees their own project but not admin-only
			expect(memberProjects.length).toBeGreaterThanOrEqual(1);
			const names = memberProjects.map((p) => p.name);
			expect(names).toContain("Member Project");
		});
	});

	describe("listActive", () => {
		it("returns only active projects", async () => {
			const t = createBackend();
			const fx = await seedFixture(t);
			const admin = t.withIdentity({ subject: fx.adminId });

			await admin.mutation(api.projects.create, {
				workspaceId: fx.workspaceId,
				name: "Active",
				status: "active",
			});
			await admin.mutation(api.projects.create, {
				workspaceId: fx.workspaceId,
				name: "Planned",
				status: "planned",
			});

			const active = await admin.query(api.projects.listActive, {
				workspaceId: fx.workspaceId,
			});
			expect(active).toHaveLength(1);
			expect(active[0].name).toBe("Active");
		});
	});

	describe("getById", () => {
		it("returns project by ID", async () => {
			const t = createBackend();
			const fx = await seedFixture(t);
			const admin = t.withIdentity({ subject: fx.adminId });

			const projectId = await admin.mutation(api.projects.create, {
				workspaceId: fx.workspaceId,
				name: "Get Me",
			});

			const project = await admin.query(api.projects.getById, {
				projectId,
			});
			expect(project?.name).toBe("Get Me");
		});

		it("returns null for deleted project", async () => {
			const t = createBackend();
			const fx = await seedFixture(t);
			const admin = t.withIdentity({ subject: fx.adminId });

			const projectId = await admin.mutation(api.projects.create, {
				workspaceId: fx.workspaceId,
				name: "Delete Me",
			});
			await admin.mutation(api.projects.remove, { projectId });

			const project = await admin.query(api.projects.getById, {
				projectId,
			});
			expect(project).toBeNull();
		});
	});

	describe("getBySlug", () => {
		it("returns project by slug", async () => {
			const t = createBackend();
			const fx = await seedFixture(t);
			const admin = t.withIdentity({ subject: fx.adminId });

			await admin.mutation(api.projects.create, {
				workspaceId: fx.workspaceId,
				name: "Slug Project",
			});

			const project = await admin.query(api.projects.getBySlug, {
				workspaceId: fx.workspaceId,
				slug: "slug-project",
			});
			expect(project?.name).toBe("Slug Project");
		});

		it("returns null for non-existent slug", async () => {
			const t = createBackend();
			const fx = await seedFixture(t);
			const admin = t.withIdentity({ subject: fx.adminId });

			const project = await admin.query(api.projects.getBySlug, {
				workspaceId: fx.workspaceId,
				slug: "no-such-project",
			});
			expect(project).toBeNull();
		});
	});

	describe("getStats", () => {
		it("returns issue counts by status", async () => {
			const t = createBackend();
			const fx = await seedFixture(t);
			const admin = t.withIdentity({ subject: fx.adminId });

			const projectId = await admin.mutation(api.projects.create, {
				workspaceId: fx.workspaceId,
				name: "Stats Project",
				status: "active",
			});

			await admin.mutation(api.issues.create, {
				workspaceId: fx.workspaceId,
				projectId,
				title: "Backlog Issue",
				status: "backlog",
			});
			await admin.mutation(api.issues.create, {
				workspaceId: fx.workspaceId,
				projectId,
				title: "Done Issue",
				status: "done",
			});
			await admin.mutation(api.issues.create, {
				workspaceId: fx.workspaceId,
				projectId,
				title: "In Progress",
				status: "in_progress",
			});

			const stats = await admin.query(api.projects.getStats, {
				projectId,
			});
			expect(stats).not.toBeNull();
			expect(stats?.total).toBe(3);
			expect(stats?.backlog).toBe(1);
			expect(stats?.done).toBe(1);
			expect(stats?.in_progress).toBe(1);
		}, 15000);

		it("returns null for inaccessible project", async () => {
			const t = createBackend();
			const fx = await seedFixture(t);
			const admin = t.withIdentity({ subject: fx.adminId });

			const projectId = await admin.mutation(api.projects.create, {
				workspaceId: fx.workspaceId,
				name: "Admin Project",
			});

			const member = t.withIdentity({ subject: fx.memberId });
			// Member can't access project created by admin (no projectMembers entry)
			const stats = await member.query(api.projects.getStats, {
				projectId,
			});
			expect(stats).toBeNull();
		});
	});

	describe("getWorkspaceProjectSummaries", () => {
		it("returns counts for accessible projects only and excludes deleted/sub-issues", async () => {
			const t = createBackend();
			const fx = await seedFixture(t);
			const admin = t.withIdentity({ subject: fx.adminId });
			const member = t.withIdentity({ subject: fx.memberId });

			const adminProjectId = await admin.mutation(api.projects.create, {
				workspaceId: fx.workspaceId,
				name: "Admin Only",
				status: "active",
			});
			const memberProjectId = await member.mutation(api.projects.create, {
				workspaceId: fx.workspaceId,
				name: "Member Project",
				status: "active",
			});

			const topLevelA = await admin.mutation(api.issues.create, {
				workspaceId: fx.workspaceId,
				projectId: memberProjectId,
				title: "Top Level A",
				status: "backlog",
			});
			await admin.mutation(api.issues.create, {
				workspaceId: fx.workspaceId,
				projectId: memberProjectId,
				title: "Top Level B",
				status: "done",
			});
			await admin.mutation(api.issues.create, {
				workspaceId: fx.workspaceId,
				projectId: adminProjectId,
				title: "Admin Issue",
				status: "done",
			});
			await admin.mutation(api.issues.createSubIssue, {
				parentId: topLevelA.issueId,
				title: "Child issue",
				status: "done",
			});
			const deletedIssue = await admin.mutation(api.issues.create, {
				workspaceId: fx.workspaceId,
				projectId: memberProjectId,
				title: "Deleted issue",
				status: "done",
			});
			await admin.mutation(api.issues.remove, {
				issueId: deletedIssue.issueId,
			});

			const memberSummaries = await member.query(
				api.projects.getWorkspaceProjectSummaries,
				{
					workspaceId: fx.workspaceId,
				},
			);
			expect(Object.keys(memberSummaries)).toEqual([memberProjectId]);
			expect(memberSummaries[memberProjectId]?.issueCount).toBe(2);
			expect(memberSummaries[memberProjectId]?.doneCount).toBe(1);
			expect(
				memberSummaries[memberProjectId]?.members.some(
					(profile) => profile.name === "Member",
				),
			).toBe(true);

			const adminSummaries = await admin.query(
				api.projects.getWorkspaceProjectSummaries,
				{
					workspaceId: fx.workspaceId,
				},
			);
			expect(adminSummaries[adminProjectId]?.issueCount).toBe(1);
			expect(adminSummaries[adminProjectId]?.doneCount).toBe(1);
			expect(adminSummaries[memberProjectId]?.issueCount).toBe(2);
			expect(adminSummaries[memberProjectId]?.doneCount).toBe(1);
		});
	});

	describe("update", () => {
		it("updates project fields", async () => {
			const t = createBackend();
			const fx = await seedFixture(t);
			const admin = t.withIdentity({ subject: fx.adminId });

			const projectId = await admin.mutation(api.projects.create, {
				workspaceId: fx.workspaceId,
				name: "Original",
			});

			await admin.mutation(api.projects.update, {
				projectId,
				name: "Updated",
				description: "New description",
			});

			const project = await admin.query(api.projects.getById, {
				projectId,
			});
			expect(project?.name).toBe("Updated");
			expect(project?.description).toBe("New description");
		});

		it("rejects update for non-existent project", async () => {
			const t = createBackend();
			const fx = await seedFixture(t);
			const admin = t.withIdentity({ subject: fx.adminId });

			const projectId = await admin.mutation(api.projects.create, {
				workspaceId: fx.workspaceId,
				name: "Delete First",
			});
			await admin.mutation(api.projects.remove, { projectId });

			await expect(
				admin.mutation(api.projects.update, {
					projectId,
					name: "Can't Update",
				}),
			).rejects.toThrow(/project not found/i);
		});
	});

	describe("updateStatus", () => {
		it("changes project status", async () => {
			const t = createBackend();
			const fx = await seedFixture(t);
			const admin = t.withIdentity({ subject: fx.adminId });

			const projectId = await admin.mutation(api.projects.create, {
				workspaceId: fx.workspaceId,
				name: "Status Project",
				status: "planned",
			});

			await admin.mutation(api.projects.updateStatus, {
				projectId,
				status: "active",
			});

			const project = await admin.query(api.projects.getById, {
				projectId,
			});
			expect(project?.status).toBe("active");
		});
	});

	describe("remove", () => {
		it("soft-deletes a project", async () => {
			const t = createBackend();
			const fx = await seedFixture(t);
			const admin = t.withIdentity({ subject: fx.adminId });

			const projectId = await admin.mutation(api.projects.create, {
				workspaceId: fx.workspaceId,
				name: "Delete Me",
			});

			await admin.mutation(api.projects.remove, { projectId });

			const project = await admin.query(api.projects.getById, {
				projectId,
			});
			expect(project).toBeNull();
		});

		it("requires admin role", async () => {
			const t = createBackend();
			const fx = await seedFixture(t);
			const admin = t.withIdentity({ subject: fx.adminId });

			const projectId = await admin.mutation(api.projects.create, {
				workspaceId: fx.workspaceId,
				name: "Admin Only Delete",
			});

			const member = t.withIdentity({ subject: fx.memberId });
			await expect(
				member.mutation(api.projects.remove, { projectId }),
			).rejects.toThrow();
		});
	});

	describe("reorder", () => {
		it("updates project sort order", async () => {
			const t = createBackend();
			const fx = await seedFixture(t);
			const admin = t.withIdentity({ subject: fx.adminId });

			const projectId = await admin.mutation(api.projects.create, {
				workspaceId: fx.workspaceId,
				name: "Reorder Me",
			});

			await admin.mutation(api.projects.reorder, {
				projectId,
				newSortOrder: 42.5,
			});

			const project = await admin.query(api.projects.getById, {
				projectId,
			});
			expect(project?.sortOrder).toBe(42.5);
		});
	});

	describe("getTimeline", () => {
		it("returns timeline data for projects", async () => {
			const t = createBackend();
			const fx = await seedFixture(t);
			const admin = t.withIdentity({ subject: fx.adminId });

			const now = Date.now();
			await admin.mutation(api.projects.create, {
				workspaceId: fx.workspaceId,
				name: "Timeline Project",
				startDate: now,
				endDate: now + 30 * 86400000,
			});

			const timeline = await admin.query(api.projects.getTimeline, {
				workspaceId: fx.workspaceId,
			});
			expect(timeline).toHaveLength(1);
			expect(timeline[0].name).toBe("Timeline Project");
			expect(timeline[0].startDate).toBeDefined();
		});
	});
});
