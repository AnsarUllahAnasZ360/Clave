/// <reference types="vite/client" />

/**
 * Validator-drift guard.
 *
 * The motivating incident: someone added `statusOverride` to the sprints
 * schema and the update mutation, but the listByWorkspace / listByProject /
 * getById returns validators were handwritten v.object({...}) and didn't
 * declare it. The moment any sprint had its dates edited, every workspace
 * sidebar query started throwing — the entire app went unreachable until
 * the validator gained the missing line.
 *
 * Same shape exists in every other table whose returns validator is a
 * handwritten v.object() that mirrors the schema. The pattern: schema
 * grows a new optional field, validator forgets, queries throw on rows
 * that have the new field set.
 *
 * This test is a tripwire. For each high-risk table, we seed a doc with
 * every optional field populated to a non-null sentinel, then call the
 * public queries that return that doc. If a validator misses a field, the
 * call throws and the test fails — at PR time, not after deploy. When a
 * new optional field is added, the seed below MUST be extended with that
 * field; that's the contract that surfaces drift.
 */

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
	clientId: Id<"clients">;
	sprintFolderId: Id<"sprintFolders">;
	sprintId: Id<"sprints">;
	listId: Id<"lists">;
	milestoneId: Id<"milestones">;
	labelId: Id<"labels">;
	parentIssueId: Id<"issues">;
	childIssueId: Id<"issues">;
};

async function seedMaximalFixture(
	t: ReturnType<typeof createBackend>,
): Promise<Fixture> {
	return t.run(async (ctx) => {
		const now = Date.now();

		const adminId = await ctx.db.insert("users", {
			name: "Validator Admin",
			email: "validator-admin@example.com",
		});
		const memberId = await ctx.db.insert("users", {
			name: "Validator Member",
			email: "validator-member@example.com",
		});

		const workspaceId = await ctx.db.insert("workspaces", {
			name: "Validator Drift Guard",
			slug: "validator-drift-guard",
			ownerId: adminId,
			description: "Workspace used to seed maximal fixtures",
			plan: "pro",
			isDemo: false,
			updatedAt: now,
		});

		await ctx.db.insert("workspaceMembers", {
			workspaceId,
			userId: adminId,
			role: "admin",
			joinedAt: now,
		});
		await ctx.db.insert("workspaceMembers", {
			workspaceId,
			userId: memberId,
			role: "member",
			joinedAt: now,
		});

		await ctx.db.insert("workspaceSettings", {
			workspaceId,
			storyPrefix: "VDG",
			nextStoryNumber: 1,
		});

		const clientId = await ctx.db.insert("clients", {
			workspaceId,
			name: "Validator Client",
			status: "active",
			industry: "tech",
			website: "https://example.com",
			location: "Remote",
			segment: "smb",
			ownerId: adminId,
			notes: "n",
			createdBy: adminId,
			updatedAt: now,
		});

		// projects: every optional field populated.
		const projectId = await ctx.db.insert("projects", {
			workspaceId,
			name: "Maximal Project",
			slug: "maximal-project",
			description: "desc",
			summary: "summary",
			richDescription: "rich",
			icon: "🚧",
			color: "#C26A3A",
			status: "active",
			priority: "high",
			leadId: adminId,
			clientId,
			startDate: now - 86_400_000,
			endDate: now + 86_400_000,
			intent: "ship",
			successType: "outcome",
			structure: "single-track",
			scopeInItems: ["a", "b"],
			scopeOutItems: ["c"],
			outcomes: ["x"],
			resources: [{ url: "https://example.com", label: "Spec" }],
			typeLabel: "feature",
			tags: ["alpha"],
			// `category` is the v0.6.0 addition to customStatusValidator — set
			// it explicitly here so the validator-drift guard catches anyone
			// who forgets to thread the field through a returns validator.
			customStatuses: [
				{ key: "k", name: "n", color: "#000000", category: "backlog" },
			],
			customStatusOrder: ["k"],
			customTypes: [{ key: "t", name: "n", color: "#000000" }],
			sortOrder: 0,
			createdBy: adminId,
			updatedAt: now,
		});

		const sprintFolderId = await ctx.db.insert("sprintFolders", {
			projectId,
			name: "Folder",
			icon: "📁",
			sortOrder: 0,
			createdBy: adminId,
			updatedAt: now,
		});

		// sprints: every optional field populated. Mirrors the original
		// b7b0b21 incident — statusOverride must round-trip cleanly.
		const sprintId = await ctx.db.insert("sprints", {
			projectId,
			folderId: sprintFolderId,
			name: "Maximal Sprint",
			description: "desc",
			status: "active",
			statusOverride: true,
			icon: "🏃",
			startDate: now - 86_400_000,
			targetDate: now + 86_400_000,
			endDate: now + 86_400_000,
			sortOrder: 0,
			goals: ["goal1", "goal2"],
			createdBy: adminId,
			updatedAt: now,
		});

		const listId = await ctx.db.insert("lists", {
			workspaceId,
			projectId,
			name: "Maximal List",
			sortOrder: 0,
			createdBy: adminId,
			updatedAt: now,
		});

		const milestoneId = await ctx.db.insert("milestones", {
			projectId,
			name: "Maximal Milestone",
			description: "desc",
			icon: "🎯",
			startDate: now - 86_400_000,
			targetDate: now + 86_400_000,
			sortOrder: 0,
			status: "active",
			createdBy: adminId,
			updatedAt: now,
		});

		const labelId = await ctx.db.insert("labels", {
			workspaceId,
			name: "Maximal Label",
			color: "#C26A3A",
			createdBy: adminId,
		});

		// issues: parent first so the child can reference it.
		const parentIssueId = await ctx.db.insert("issues", {
			workspaceId,
			projectId,
			sprintId,
			listId,
			milestoneId,
			identifier: "VDG-1",
			title: "Maximal Parent Issue",
			description: "desc",
			status: "in_progress",
			priority: "high",
			type: "feature",
			assigneeId: adminId,
			assigneeIds: [adminId, memberId],
			labelIds: [labelId],
			startDate: now - 3_600_000,
			dueDate: now + 3_600_000,
			sortOrder: 0,
			estimate: 5,
			tags: ["t1"],
			createdBy: adminId,
			completedAt: undefined,
			updatedAt: now,
			gitBranchName: "feat/maximal",
			linkedDocumentIds: [],
			linkedWhiteboardIds: [],
			githubSyncSource: "clave",
		});

		const childIssueId = await ctx.db.insert("issues", {
			workspaceId,
			projectId,
			sprintId,
			listId,
			milestoneId,
			parentId: parentIssueId,
			identifier: "VDG-2",
			title: "Maximal Child Issue",
			description: "desc",
			status: "todo",
			priority: "medium",
			type: "bug",
			assigneeId: memberId,
			assigneeIds: [memberId],
			labelIds: [labelId],
			startDate: now,
			dueDate: now + 86_400_000,
			sortOrder: 1,
			estimate: 2,
			tags: ["t2"],
			createdBy: adminId,
			completedAt: now,
			updatedAt: now,
			gitBranchName: "fix/maximal",
			linkedDocumentIds: [],
			linkedWhiteboardIds: [],
			githubSyncSource: "github",
		});

		return {
			adminId,
			memberId,
			workspaceId,
			projectId,
			clientId,
			sprintFolderId,
			sprintId,
			listId,
			milestoneId,
			labelId,
			parentIssueId,
			childIssueId,
		};
	});
}

describe("validator drift guard (integration)", () => {
	describe("workspaces", () => {
		it("getBySlug returns a fully-populated workspace doc", async () => {
			const t = createBackend();
			const fx = await seedMaximalFixture(t);
			const admin = t.withIdentity({ subject: fx.adminId });

			const ws = await admin.query(api.workspaces.getBySlug, {
				slug: "validator-drift-guard",
			});

			expect(ws?._id).toBe(fx.workspaceId);
		});

		it("list returns workspaces with all optional fields set", async () => {
			const t = createBackend();
			const fx = await seedMaximalFixture(t);
			const admin = t.withIdentity({ subject: fx.adminId });

			const list = await admin.query(api.workspaces.list);

			expect(list).toHaveLength(1);
			expect(list[0]._id).toBe(fx.workspaceId);
		});
	});

	describe("projects", () => {
		it("list returns projects with every optional field populated", async () => {
			const t = createBackend();
			const fx = await seedMaximalFixture(t);
			const admin = t.withIdentity({ subject: fx.adminId });

			const list = await admin.query(api.projects.list, {
				workspaceId: fx.workspaceId,
			});

			expect(list).toHaveLength(1);
			expect(list[0]._id).toBe(fx.projectId);
		});

		it("getById returns a fully-populated project", async () => {
			const t = createBackend();
			const fx = await seedMaximalFixture(t);
			const admin = t.withIdentity({ subject: fx.adminId });

			const project = await admin.query(api.projects.getById, {
				projectId: fx.projectId,
			});

			expect(project?._id).toBe(fx.projectId);
		});
	});

	describe("sprints", () => {
		it("listByWorkspace tolerates statusOverride + every optional field", async () => {
			const t = createBackend();
			const fx = await seedMaximalFixture(t);
			const admin = t.withIdentity({ subject: fx.adminId });

			const sprints = await admin.query(api.sprints.listByWorkspace, {
				workspaceId: fx.workspaceId,
			});

			expect(sprints).toHaveLength(1);
			expect(sprints[0]._id).toBe(fx.sprintId);
			expect(sprints[0].statusOverride).toBe(true);
		});

		it("listByProject tolerates a fully-populated sprint", async () => {
			const t = createBackend();
			const fx = await seedMaximalFixture(t);
			const admin = t.withIdentity({ subject: fx.adminId });

			const sprints = await admin.query(api.sprints.listByProject, {
				projectId: fx.projectId,
			});

			expect(sprints).toHaveLength(1);
			expect(sprints[0]._id).toBe(fx.sprintId);
		});

		it("getById returns the maximally-populated sprint", async () => {
			const t = createBackend();
			const fx = await seedMaximalFixture(t);
			const admin = t.withIdentity({ subject: fx.adminId });

			const sprint = await admin.query(api.sprints.getById, {
				sprintId: fx.sprintId,
			});

			expect(sprint?._id).toBe(fx.sprintId);
		});
	});

	describe("issues", () => {
		it("listByWorkspace returns issues with every optional field populated", async () => {
			const t = createBackend();
			const fx = await seedMaximalFixture(t);
			const admin = t.withIdentity({ subject: fx.adminId });

			const result = await admin.query(api.issues.listByWorkspace, {
				workspaceId: fx.workspaceId,
			});

			expect(result.issues.length).toBeGreaterThanOrEqual(2);
			const ids = result.issues.map((i) => i._id);
			expect(ids).toContain(fx.parentIssueId);
			expect(ids).toContain(fx.childIssueId);
		});

		it("getById returns a fully-populated issue + parent", async () => {
			const t = createBackend();
			const fx = await seedMaximalFixture(t);
			const admin = t.withIdentity({ subject: fx.adminId });

			const issue = await admin.query(api.issues.getById, {
				issueId: fx.childIssueId,
			});

			expect(issue?._id).toBe(fx.childIssueId);
			expect(issue?.parent?._id).toBe(fx.parentIssueId);
		});

		it("listBySprint returns sprint-scoped issues", async () => {
			const t = createBackend();
			const fx = await seedMaximalFixture(t);
			const admin = t.withIdentity({ subject: fx.adminId });

			const issues = await admin.query(api.issues.listBySprint, {
				sprintId: fx.sprintId,
			});

			expect(Array.isArray(issues)).toBe(true);
			expect(issues.length).toBeGreaterThanOrEqual(2);
		});
	});
});
