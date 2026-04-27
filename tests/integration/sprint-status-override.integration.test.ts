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
	workspaceId: Id<"workspaces">;
	projectId: Id<"projects">;
	sprintId: Id<"sprints">;
};

async function seedFixture(
	t: ReturnType<typeof createBackend>,
): Promise<Fixture> {
	return t.run(async (ctx) => {
		const adminId = await ctx.db.insert("users", {
			name: "Admin",
			email: "admin@example.com",
		});

		const workspaceId = await ctx.db.insert("workspaces", {
			name: "Sprint Validator Workspace",
			slug: "sprint-validator",
			ownerId: adminId,
		});

		await ctx.db.insert("workspaceMembers", {
			workspaceId,
			userId: adminId,
			role: "admin",
			joinedAt: Date.now(),
		});

		await ctx.db.insert("workspaceSettings", {
			workspaceId,
			storyPrefix: "SV",
			nextStoryNumber: 1,
		});

		const projectId = await ctx.db.insert("projects", {
			workspaceId,
			name: "Override Project",
			slug: "override-project",
			createdBy: adminId,
			leadId: adminId,
			status: "active",
			sortOrder: 0,
		});

		const now = Date.now();
		const sprintId = await ctx.db.insert("sprints", {
			projectId,
			name: "Override Sprint",
			status: "active",
			// This is the field that broke the workspace sidebar before the
			// fix — a sprint with statusOverride set was rejected by the
			// strict v.object() validators on listByWorkspace / getById.
			statusOverride: true,
			startDate: now - 86_400_000,
			endDate: now + 86_400_000,
			sortOrder: 0,
			createdBy: adminId,
		});

		return { adminId, workspaceId, projectId, sprintId };
	});
}

describe("sprint validators tolerate statusOverride (integration)", () => {
	it("getById returns a sprint that has statusOverride set", async () => {
		const t = createBackend();
		const { adminId, sprintId } = await seedFixture(t);
		const admin = t.withIdentity({ subject: adminId });

		const sprint = await admin.query(api.sprints.getById, { sprintId });

		expect(sprint).not.toBeNull();
		expect(sprint?.statusOverride).toBe(true);
	});

	it("listByWorkspace returns sprints that have statusOverride set", async () => {
		const t = createBackend();
		const { adminId, workspaceId, sprintId } = await seedFixture(t);
		const admin = t.withIdentity({ subject: adminId });

		const sprints = await admin.query(api.sprints.listByWorkspace, {
			workspaceId,
		});

		expect(sprints).toHaveLength(1);
		expect(sprints[0]._id).toBe(sprintId);
		expect(sprints[0].statusOverride).toBe(true);
	});
});
