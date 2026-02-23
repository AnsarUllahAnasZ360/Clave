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

async function seedWorkspace(t: ReturnType<typeof createBackend>) {
	return t.run(async (ctx) => {
		const adminId = await ctx.db.insert("users", { name: "Admin" });
		const memberId = await ctx.db.insert("users", { name: "Member" });

		const workspaceId = await ctx.db.insert("workspaces", {
			name: "Test WS",
			slug: "test-ws-labels",
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

		return { adminId, memberId, workspaceId };
	});
}

describe("labels", () => {
	describe("create", () => {
		it("creates a label with required fields", async () => {
			const t = createBackend();
			const fx = await seedWorkspace(t);
			const admin = t.withIdentity({ subject: fx.adminId });

			const labelId = await admin.mutation(api.labels.create, {
				workspaceId: fx.workspaceId,
				name: "Bug",
				color: "#ff0000",
			});

			expect(labelId).toBeDefined();

			const labels = await admin.query(api.labels.list, {
				workspaceId: fx.workspaceId,
			});
			expect(labels).toHaveLength(1);
			expect(labels[0].name).toBe("Bug");
			expect(labels[0].color).toBe("#ff0000");
		});

		it("creates a label with optional description", async () => {
			const t = createBackend();
			const fx = await seedWorkspace(t);
			const admin = t.withIdentity({ subject: fx.adminId });

			await admin.mutation(api.labels.create, {
				workspaceId: fx.workspaceId,
				name: "Feature",
				color: "#00ff00",
				description: "Feature requests",
			});

			const labels = await admin.query(api.labels.list, {
				workspaceId: fx.workspaceId,
			});
			expect(labels[0].description).toBe("Feature requests");
		});

		it("rejects duplicate label names in same workspace", async () => {
			const t = createBackend();
			const fx = await seedWorkspace(t);
			const admin = t.withIdentity({ subject: fx.adminId });

			await admin.mutation(api.labels.create, {
				workspaceId: fx.workspaceId,
				name: "Bug",
				color: "#ff0000",
			});

			await expect(
				admin.mutation(api.labels.create, {
					workspaceId: fx.workspaceId,
					name: "Bug",
					color: "#00ff00",
				}),
			).rejects.toThrow(/label with this name already exists/i);
		});

		it("requires admin role to create labels", async () => {
			const t = createBackend();
			const fx = await seedWorkspace(t);
			const member = t.withIdentity({ subject: fx.memberId });

			await expect(
				member.mutation(api.labels.create, {
					workspaceId: fx.workspaceId,
					name: "Bug",
					color: "#ff0000",
				}),
			).rejects.toThrow();
		});
	});

	describe("list", () => {
		it("lists labels for a workspace", async () => {
			const t = createBackend();
			const fx = await seedWorkspace(t);
			const admin = t.withIdentity({ subject: fx.adminId });

			await admin.mutation(api.labels.create, {
				workspaceId: fx.workspaceId,
				name: "Bug",
				color: "#ff0000",
			});
			await admin.mutation(api.labels.create, {
				workspaceId: fx.workspaceId,
				name: "Feature",
				color: "#00ff00",
			});

			const labels = await admin.query(api.labels.list, {
				workspaceId: fx.workspaceId,
			});
			expect(labels).toHaveLength(2);
		});

		it("excludes soft-deleted labels", async () => {
			const t = createBackend();
			const fx = await seedWorkspace(t);
			const admin = t.withIdentity({ subject: fx.adminId });

			const labelId = await admin.mutation(api.labels.create, {
				workspaceId: fx.workspaceId,
				name: "ToDelete",
				color: "#ff0000",
			});

			await admin.mutation(api.labels.remove, { labelId });

			const labels = await admin.query(api.labels.list, {
				workspaceId: fx.workspaceId,
			});
			expect(labels).toHaveLength(0);
		});

		it("requires workspace membership", async () => {
			const t = createBackend();
			const fx = await seedWorkspace(t);
			const outsiderId = await t.run(async (ctx) => {
				return ctx.db.insert("users", { name: "Outsider" });
			});
			const outsider = t.withIdentity({ subject: outsiderId });

			await expect(
				outsider.query(api.labels.list, {
					workspaceId: fx.workspaceId,
				}),
			).rejects.toThrow();
		});
	});

	describe("update", () => {
		it("updates label name and color", async () => {
			const t = createBackend();
			const fx = await seedWorkspace(t);
			const admin = t.withIdentity({ subject: fx.adminId });

			const labelId = await admin.mutation(api.labels.create, {
				workspaceId: fx.workspaceId,
				name: "Bug",
				color: "#ff0000",
			});

			await admin.mutation(api.labels.update, {
				labelId,
				name: "Critical Bug",
				color: "#cc0000",
			});

			const labels = await admin.query(api.labels.list, {
				workspaceId: fx.workspaceId,
			});
			expect(labels[0].name).toBe("Critical Bug");
			expect(labels[0].color).toBe("#cc0000");
		});

		it("rejects renaming to an existing label name", async () => {
			const t = createBackend();
			const fx = await seedWorkspace(t);
			const admin = t.withIdentity({ subject: fx.adminId });

			await admin.mutation(api.labels.create, {
				workspaceId: fx.workspaceId,
				name: "Bug",
				color: "#ff0000",
			});
			const featureId = await admin.mutation(api.labels.create, {
				workspaceId: fx.workspaceId,
				name: "Feature",
				color: "#00ff00",
			});

			await expect(
				admin.mutation(api.labels.update, {
					labelId: featureId,
					name: "Bug",
				}),
			).rejects.toThrow(/label with this name already exists/i);
		});

		it("allows updating to the same name (no-op)", async () => {
			const t = createBackend();
			const fx = await seedWorkspace(t);
			const admin = t.withIdentity({ subject: fx.adminId });

			const labelId = await admin.mutation(api.labels.create, {
				workspaceId: fx.workspaceId,
				name: "Bug",
				color: "#ff0000",
			});

			// Updating to same name should not throw
			await admin.mutation(api.labels.update, {
				labelId,
				name: "Bug",
			});
		});
	});

	describe("remove", () => {
		it("soft-deletes a label", async () => {
			const t = createBackend();
			const fx = await seedWorkspace(t);
			const admin = t.withIdentity({ subject: fx.adminId });

			const labelId = await admin.mutation(api.labels.create, {
				workspaceId: fx.workspaceId,
				name: "Bug",
				color: "#ff0000",
			});

			await admin.mutation(api.labels.remove, { labelId });

			const labels = await admin.query(api.labels.list, {
				workspaceId: fx.workspaceId,
			});
			expect(labels).toHaveLength(0);
		});

		it("removes label from issues that reference it", async () => {
			const t = createBackend();
			const fx = await seedWorkspace(t);
			const admin = t.withIdentity({ subject: fx.adminId });

			// Seed workspace settings for issue creation
			await t.run(async (ctx) => {
				await ctx.db.insert("workspaceSettings", {
					workspaceId: fx.workspaceId,
					storyPrefix: "ST",
					nextStoryNumber: 1,
					issuePrefix: "LBL",
					nextIssueNumber: 1,
				});
			});

			const labelId = await admin.mutation(api.labels.create, {
				workspaceId: fx.workspaceId,
				name: "Bug",
				color: "#ff0000",
			});

			// Create issue with this label
			const { issueId } = await admin.mutation(api.issues.create, {
				workspaceId: fx.workspaceId,
				title: "Test issue",
				labelIds: [labelId],
			});

			// Remove the label
			await admin.mutation(api.labels.remove, { labelId });

			// Verify the issue no longer references the label
			const issue = await admin.query(api.issues.getById, { issueId });
			expect(issue?.labelIds ?? []).not.toContain(labelId);
		});
	});
});
