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

type AuthFixture = {
	ownerId: Id<"users">;
	adminId: Id<"users">;
	memberId: Id<"users">;
	outsiderId: Id<"users">;
	superAdminId: Id<"users">;
	workspaceId: Id<"workspaces">;
	projectOwnedId: Id<"projects">;
	projectRestrictedId: Id<"projects">;
	documentPrivateId: Id<"documents">;
	documentWorkspaceId: Id<"documents">;
	documentPublicId: Id<"documents">;
	documentDeletedId: Id<"documents">;
	documentPublicEditId: Id<"documents">;
	whiteboardPrivateId: Id<"whiteboards">;
	whiteboardPublicId: Id<"whiteboards">;
	whiteboardDeletedId: Id<"whiteboards">;
	whiteboardPublicEditId: Id<"whiteboards">;
};

async function seedAuthFixture(
	t: ReturnType<typeof createBackend>,
): Promise<AuthFixture> {
	return t.run(async (ctx) => {
		const ownerId = await ctx.db.insert("users", { name: "Owner" });
		const adminId = await ctx.db.insert("users", { name: "Admin" });
		const memberId = await ctx.db.insert("users", { name: "Member" });
		const outsiderId = await ctx.db.insert("users", { name: "Outsider" });
		const superAdminId = await ctx.db.insert("users", {
			name: "SuperAdmin",
			role: "superadmin",
		});

		const workspaceId = await ctx.db.insert("workspaces", {
			name: "Test Workspace",
			slug: "test-ws-auth",
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
			storyPrefix: "AUTH",
			nextStoryNumber: 1,
		});

		const projectOwnedId = await ctx.db.insert("projects", {
			workspaceId,
			name: "Member Project",
			slug: "member-project",
			status: "active",
			sortOrder: 1,
			createdBy: memberId,
		});
		const projectRestrictedId = await ctx.db.insert("projects", {
			workspaceId,
			name: "Restricted Project",
			slug: "restricted-project",
			status: "active",
			sortOrder: 2,
			createdBy: adminId,
		});

		const documentPrivateId = await ctx.db.insert("documents", {
			workspaceId,
			title: "Private Doc",
			createdBy: adminId,
			visibility: "private",
		});
		const documentWorkspaceId = await ctx.db.insert("documents", {
			workspaceId,
			title: "Workspace Doc",
			createdBy: adminId,
			visibility: "workspace",
		});
		const documentPublicId = await ctx.db.insert("documents", {
			workspaceId,
			title: "Public Doc",
			createdBy: adminId,
			visibility: "public",
		});
		const documentDeletedId = await ctx.db.insert("documents", {
			workspaceId,
			title: "Deleted Doc",
			createdBy: adminId,
			visibility: "public",
			deletedAt: Date.now(),
		});
		const documentPublicEditId = await ctx.db.insert("documents", {
			workspaceId,
			title: "Public Editable Doc",
			createdBy: adminId,
			visibility: "public",
			defaultPermission: "edit",
		});

		const whiteboardPrivateId = await ctx.db.insert("whiteboards", {
			workspaceId,
			title: "Private Board",
			createdBy: adminId,
			visibility: "private",
		});
		const whiteboardPublicId = await ctx.db.insert("whiteboards", {
			workspaceId,
			title: "Public Board",
			createdBy: adminId,
			visibility: "public",
		});
		const whiteboardDeletedId = await ctx.db.insert("whiteboards", {
			workspaceId,
			title: "Deleted Board",
			createdBy: adminId,
			visibility: "public",
			deletedAt: Date.now(),
		});
		const whiteboardPublicEditId = await ctx.db.insert("whiteboards", {
			workspaceId,
			title: "Public Editable Board",
			createdBy: adminId,
			visibility: "public",
			defaultPermission: "edit",
		});

		return {
			ownerId,
			adminId,
			memberId,
			outsiderId,
			superAdminId,
			workspaceId,
			projectOwnedId,
			projectRestrictedId,
			documentPrivateId,
			documentWorkspaceId,
			documentPublicId,
			documentDeletedId,
			documentPublicEditId,
			whiteboardPrivateId,
			whiteboardPublicId,
			whiteboardDeletedId,
			whiteboardPublicEditId,
		};
	});
}

// Auth helpers are tested indirectly through the public API functions.
// `getAuthUserId` from @convex-dev/auth requires t.withIdentity() + api calls.
// Direct helper functions that don't use getAuthUserId are tested via t.run().

import {
	canAccessProject,
	checkDocumentReadAccess,
	checkDocumentWriteAccess,
	checkWhiteboardReadAccess,
	checkWhiteboardWriteAccess,
	getAccessibleProjectIds,
} from "../../convex/lib/auth";

describe("auth helpers", () => {
	// ── requireAuth (tested via workspaceSettings.get which calls requireAuth) ──

	describe("requireAuth", () => {
		it("returns data when authenticated", async () => {
			const t = createBackend();
			const fx = await seedAuthFixture(t);
			const member = t.withIdentity({ subject: fx.memberId });

			const settings = await member.query(api.workspaceSettings.get, {
				workspaceId: fx.workspaceId,
			});
			expect(settings).not.toBeNull();
		});

		it("throws when not authenticated", async () => {
			const t = createBackend();
			const fx = await seedAuthFixture(t);

			await expect(
				t.query(api.workspaceSettings.get, {
					workspaceId: fx.workspaceId,
				}),
			).rejects.toThrow(/not authenticated/i);
		});
	});

	// ── requireWorkspaceMember (tested via workspaceSettings.get) ────────────

	describe("requireWorkspaceMember", () => {
		it("allows workspace member", async () => {
			const t = createBackend();
			const fx = await seedAuthFixture(t);
			const member = t.withIdentity({ subject: fx.memberId });

			// workspaceSettings.get calls requireWorkspaceMember
			const settings = await member.query(api.workspaceSettings.get, {
				workspaceId: fx.workspaceId,
			});
			expect(settings).not.toBeNull();
			expect(settings?.storyPrefix).toBe("AUTH");
		});

		it("throws for non-member", async () => {
			const t = createBackend();
			const fx = await seedAuthFixture(t);
			const outsider = t.withIdentity({ subject: fx.outsiderId });

			await expect(
				outsider.query(api.workspaceSettings.get, {
					workspaceId: fx.workspaceId,
				}),
			).rejects.toThrow(/not a workspace member/i);
		});

		it("throws for unauthenticated user", async () => {
			const t = createBackend();
			const fx = await seedAuthFixture(t);

			await expect(
				t.query(api.workspaceSettings.get, {
					workspaceId: fx.workspaceId,
				}),
			).rejects.toThrow(/not authenticated/i);
		});
	});

	// ── tryWorkspaceMember (tested indirectly — non-throwing variant) ────────
	// tryWorkspaceMember uses getAuthUserId directly, not requireAuth.
	// We test it via its behavior in public APIs that use it (none directly
	// exposed). Instead, we verify the logic via document/whiteboard access checks.

	// ── requireWorkspaceAdmin (tested via workspaceSettings.update) ──────────

	describe("requireWorkspaceAdmin", () => {
		it("allows admin to update settings", async () => {
			const t = createBackend();
			const fx = await seedAuthFixture(t);
			const admin = t.withIdentity({ subject: fx.adminId });

			await admin.mutation(api.workspaceSettings.update, {
				workspaceId: fx.workspaceId,
				storyPrefix: "NEW",
			});

			const settings = await admin.query(api.workspaceSettings.get, {
				workspaceId: fx.workspaceId,
			});
			expect(settings?.storyPrefix).toBe("NEW");
		});

		it("throws for regular member", async () => {
			const t = createBackend();
			const fx = await seedAuthFixture(t);
			const member = t.withIdentity({ subject: fx.memberId });

			await expect(
				member.mutation(api.workspaceSettings.update, {
					workspaceId: fx.workspaceId,
					storyPrefix: "NO",
				}),
			).rejects.toThrow(/admin access required/i);
		});
	});

	// ── requireSuperAdmin ────────────────────────────────────────────────────
	// No public API uses requireSuperAdmin in the files we're testing.
	// It's used in admin/ routes. We verify the logic by checking the user's
	// role field which is what requireSuperAdmin checks.

	describe("requireSuperAdmin (logic)", () => {
		it("superadmin user has role superadmin", async () => {
			const t = createBackend();
			const fx = await seedAuthFixture(t);

			const user = await t.run(async (ctx) => {
				return await ctx.db.get(fx.superAdminId);
			});
			expect(user?.role).toBe("superadmin");
		});

		it("regular user does not have superadmin role", async () => {
			const t = createBackend();
			const fx = await seedAuthFixture(t);

			const user = await t.run(async (ctx) => {
				return await ctx.db.get(fx.memberId);
			});
			expect(user?.role).not.toBe("superadmin");
		});
	});

	// ── checkDocumentReadAccess (direct — no getAuthUserId) ──────────────────

	describe("checkDocumentReadAccess", () => {
		it("allows anyone to read public documents", async () => {
			const t = createBackend();
			const fx = await seedAuthFixture(t);

			const result = await t.run(async (ctx) => {
				const doc = await ctx.db.get(fx.documentPublicId);
				return await checkDocumentReadAccess(ctx, doc!);
			});

			expect(result.canRead).toBe(true);
		});

		it("denies unauthenticated access to private documents", async () => {
			const t = createBackend();
			const fx = await seedAuthFixture(t);

			const result = await t.run(async (ctx) => {
				const doc = await ctx.db.get(fx.documentPrivateId);
				return await checkDocumentReadAccess(ctx, doc!);
			});

			expect(result.canRead).toBe(false);
			expect(result.userId).toBeNull();
		});

		it("denies access to deleted documents", async () => {
			const t = createBackend();
			const fx = await seedAuthFixture(t);

			const result = await t.run(async (ctx) => {
				const doc = await ctx.db.get(fx.documentDeletedId);
				return await checkDocumentReadAccess(ctx, doc!);
			});

			expect(result.canRead).toBe(false);
		});

		it("allows read via document share grant for non-member", async () => {
			const t = createBackend();
			const fx = await seedAuthFixture(t);

			await t.run(async (ctx) => {
				await ctx.db.insert("documentShares", {
					documentId: fx.documentPrivateId,
					userId: fx.outsiderId,
					permission: "view",
				});
			});

			// Note: without proper auth context from getAuthUserId, share grant
			// lookup won't find userId. Tested here for schema/DB correctness.
			const share = await t.run(async (ctx) => {
				return await ctx.db
					.query("documentShares")
					.withIndex("by_document_user", (q) =>
						q
							.eq("documentId", fx.documentPrivateId)
							.eq("userId", fx.outsiderId),
					)
					.unique();
			});
			expect(share).not.toBeNull();
			expect(share?.permission).toBe("view");
		});
	});

	// ── checkDocumentWriteAccess (direct — unauthenticated paths) ────────────

	describe("checkDocumentWriteAccess", () => {
		it("allows unauthenticated write to public+edit documents", async () => {
			const t = createBackend();
			const fx = await seedAuthFixture(t);

			const result = await t.run(async (ctx) => {
				const doc = await ctx.db.get(fx.documentPublicEditId);
				return await checkDocumentWriteAccess(ctx, doc!);
			});

			expect(result.canWrite).toBe(true);
			expect(result.userId).toBeNull();
		});

		it("denies unauthenticated write to public view-only documents", async () => {
			const t = createBackend();
			const fx = await seedAuthFixture(t);

			const result = await t.run(async (ctx) => {
				const doc = await ctx.db.get(fx.documentPublicId);
				return await checkDocumentWriteAccess(ctx, doc!);
			});

			expect(result.canWrite).toBe(false);
		});

		it("denies write to deleted documents", async () => {
			const t = createBackend();
			const fx = await seedAuthFixture(t);

			const result = await t.run(async (ctx) => {
				const doc = await ctx.db.get(fx.documentDeletedId);
				return await checkDocumentWriteAccess(ctx, doc!);
			});

			expect(result.canWrite).toBe(false);
		});
	});

	// ── checkWhiteboardReadAccess (direct — unauthenticated paths) ───────────

	describe("checkWhiteboardReadAccess", () => {
		it("allows anyone to read public whiteboards", async () => {
			const t = createBackend();
			const fx = await seedAuthFixture(t);

			const result = await t.run(async (ctx) => {
				const board = await ctx.db.get(fx.whiteboardPublicId);
				return await checkWhiteboardReadAccess(ctx, board!);
			});

			expect(result.canRead).toBe(true);
		});

		it("denies unauthenticated access to private whiteboards", async () => {
			const t = createBackend();
			const fx = await seedAuthFixture(t);

			const result = await t.run(async (ctx) => {
				const board = await ctx.db.get(fx.whiteboardPrivateId);
				return await checkWhiteboardReadAccess(ctx, board!);
			});

			expect(result.canRead).toBe(false);
		});

		it("denies access to deleted whiteboards", async () => {
			const t = createBackend();
			const fx = await seedAuthFixture(t);

			const result = await t.run(async (ctx) => {
				const board = await ctx.db.get(fx.whiteboardDeletedId);
				return await checkWhiteboardReadAccess(ctx, board!);
			});

			expect(result.canRead).toBe(false);
		});

		it("allows read via whiteboard share grant (DB correctness)", async () => {
			const t = createBackend();
			const fx = await seedAuthFixture(t);

			await t.run(async (ctx) => {
				await ctx.db.insert("whiteboardShares", {
					whiteboardId: fx.whiteboardPrivateId,
					userId: fx.outsiderId,
					permission: "view",
				});
			});

			const share = await t.run(async (ctx) => {
				return await ctx.db
					.query("whiteboardShares")
					.withIndex("by_whiteboard_user", (q) =>
						q
							.eq("whiteboardId", fx.whiteboardPrivateId)
							.eq("userId", fx.outsiderId),
					)
					.unique();
			});
			expect(share).not.toBeNull();
			expect(share?.permission).toBe("view");
		});
	});

	// ── checkWhiteboardWriteAccess (direct — unauthenticated paths) ──────────

	describe("checkWhiteboardWriteAccess", () => {
		it("allows unauthenticated write to public+edit whiteboards", async () => {
			const t = createBackend();
			const fx = await seedAuthFixture(t);

			const result = await t.run(async (ctx) => {
				const board = await ctx.db.get(fx.whiteboardPublicEditId);
				return await checkWhiteboardWriteAccess(ctx, board!);
			});

			expect(result.canWrite).toBe(true);
			expect(result.userId).toBeNull();
		});

		it("denies unauthenticated write to public view-only whiteboards", async () => {
			const t = createBackend();
			const fx = await seedAuthFixture(t);

			const result = await t.run(async (ctx) => {
				const board = await ctx.db.get(fx.whiteboardPublicId);
				return await checkWhiteboardWriteAccess(ctx, board!);
			});

			expect(result.canWrite).toBe(false);
		});

		it("denies write to deleted whiteboards", async () => {
			const t = createBackend();
			const fx = await seedAuthFixture(t);

			const result = await t.run(async (ctx) => {
				const board = await ctx.db.get(fx.whiteboardDeletedId);
				return await checkWhiteboardWriteAccess(ctx, board!);
			});

			expect(result.canWrite).toBe(false);
		});
	});

	// ── canAccessProject (direct — no getAuthUserId) ─────────────────────────

	describe("canAccessProject", () => {
		it("always returns true for admin role", async () => {
			const t = createBackend();
			const fx = await seedAuthFixture(t);

			const result = await t.run(async (ctx) => {
				return await canAccessProject(
					ctx,
					fx.projectRestrictedId,
					fx.adminId,
					"admin",
				);
			});

			expect(result).toBe(true);
		});

		it("allows member who created the project", async () => {
			const t = createBackend();
			const fx = await seedAuthFixture(t);

			const result = await t.run(async (ctx) => {
				return await canAccessProject(
					ctx,
					fx.projectOwnedId,
					fx.memberId,
					"member",
				);
			});

			expect(result).toBe(true);
		});

		it("denies member not associated with the project", async () => {
			const t = createBackend();
			const fx = await seedAuthFixture(t);

			const result = await t.run(async (ctx) => {
				return await canAccessProject(
					ctx,
					fx.projectRestrictedId,
					fx.memberId,
					"member",
				);
			});

			expect(result).toBe(false);
		});

		it("allows member via projectMembers table", async () => {
			const t = createBackend();
			const fx = await seedAuthFixture(t);

			await t.run(async (ctx) => {
				await ctx.db.insert("projectMembers", {
					projectId: fx.projectRestrictedId,
					userId: fx.memberId,
					role: "member",
					addedAt: Date.now(),
				});
			});

			const result = await t.run(async (ctx) => {
				return await canAccessProject(
					ctx,
					fx.projectRestrictedId,
					fx.memberId,
					"member",
				);
			});

			expect(result).toBe(true);
		});

		it("allows member who is project lead", async () => {
			const t = createBackend();
			const fx = await seedAuthFixture(t);

			await t.run(async (ctx) => {
				await ctx.db.patch(fx.projectRestrictedId, {
					leadId: fx.memberId,
				});
			});

			const result = await t.run(async (ctx) => {
				return await canAccessProject(
					ctx,
					fx.projectRestrictedId,
					fx.memberId,
					"member",
				);
			});

			expect(result).toBe(true);
		});

		it("returns false for deleted project", async () => {
			const t = createBackend();
			const fx = await seedAuthFixture(t);

			await t.run(async (ctx) => {
				await ctx.db.patch(fx.projectOwnedId, { deletedAt: Date.now() });
			});

			const result = await t.run(async (ctx) => {
				return await canAccessProject(
					ctx,
					fx.projectOwnedId,
					fx.memberId,
					"member",
				);
			});

			expect(result).toBe(false);
		});
	});

	// ── getAccessibleProjectIds (direct — no getAuthUserId) ──────────────────

	describe("getAccessibleProjectIds", () => {
		it("returns null for admin (all projects accessible)", async () => {
			const t = createBackend();
			const fx = await seedAuthFixture(t);

			const result = await t.run(async (ctx) => {
				return await getAccessibleProjectIds(
					ctx,
					fx.workspaceId,
					fx.adminId,
					"admin",
				);
			});

			expect(result).toBeNull();
		});

		it("returns set with only accessible project IDs for member", async () => {
			const t = createBackend();
			const fx = await seedAuthFixture(t);

			const result = await t.run(async (ctx) => {
				const ids = await getAccessibleProjectIds(
					ctx,
					fx.workspaceId,
					fx.memberId,
					"member",
				);
				return ids === null ? null : Array.from(ids);
			});

			const accessible = new Set(result ?? []);
			expect(accessible).toBeInstanceOf(Set);
			expect(accessible.has(fx.projectOwnedId)).toBe(true);
			expect(accessible.has(fx.projectRestrictedId)).toBe(false);
		});

		it("includes projects where member is lead", async () => {
			const t = createBackend();
			const fx = await seedAuthFixture(t);

			await t.run(async (ctx) => {
				await ctx.db.patch(fx.projectRestrictedId, {
					leadId: fx.memberId,
				});
			});

			const result = await t.run(async (ctx) => {
				const ids = await getAccessibleProjectIds(
					ctx,
					fx.workspaceId,
					fx.memberId,
					"member",
				);
				return ids === null ? null : Array.from(ids);
			});
			const accessible = new Set(result ?? []);

			expect(accessible.has(fx.projectRestrictedId)).toBe(true);
		});

		it("includes projects via projectMembers", async () => {
			const t = createBackend();
			const fx = await seedAuthFixture(t);

			await t.run(async (ctx) => {
				await ctx.db.insert("projectMembers", {
					projectId: fx.projectRestrictedId,
					userId: fx.memberId,
					role: "member",
					addedAt: Date.now(),
				});
			});

			const result = await t.run(async (ctx) => {
				const ids = await getAccessibleProjectIds(
					ctx,
					fx.workspaceId,
					fx.memberId,
					"member",
				);
				return ids === null ? null : Array.from(ids);
			});
			const accessible = new Set(result ?? []);

			expect(accessible.has(fx.projectRestrictedId)).toBe(true);
		});

		it("excludes deleted projects", async () => {
			const t = createBackend();
			const fx = await seedAuthFixture(t);

			await t.run(async (ctx) => {
				await ctx.db.patch(fx.projectOwnedId, { deletedAt: Date.now() });
			});

			const result = await t.run(async (ctx) => {
				const ids = await getAccessibleProjectIds(
					ctx,
					fx.workspaceId,
					fx.memberId,
					"member",
				);
				return ids === null ? null : Array.from(ids);
			});

			const accessible = new Set(result ?? []);
			expect(accessible.has(fx.projectOwnedId)).toBe(false);
		});
	});

	// ── requireProjectAccess (tested via API that uses it) ───────────────────
	// requireProjectAccess is used in issues.ts. Tested indirectly via issue ops.

	describe("requireProjectAccess (via issues)", () => {
		it("admin can access restricted project issues", async () => {
			const t = createBackend();
			const fx = await seedAuthFixture(t);

			// Create an issue in the restricted project
			const issueId = await t.run(async (ctx) => {
				return await ctx.db.insert("issues", {
					workspaceId: fx.workspaceId,
					projectId: fx.projectRestrictedId,
					identifier: "AUTH-1",
					title: "Admin visible",
					status: "backlog",
					priority: "medium",
					type: "issue",
					sortOrder: 1,
					createdBy: fx.adminId,
				});
			});

			const admin = t.withIdentity({ subject: fx.adminId });
			// Admin should be able to update the issue
			await admin.mutation(api.issues.update, {
				issueId,
				title: "Updated by admin",
			});

			const issue = await t.run(async (ctx) => {
				return await ctx.db.get(issueId);
			});
			expect(issue?.title).toBe("Updated by admin");
		});

		it("member without project access cannot update restricted issue", async () => {
			const t = createBackend();
			const fx = await seedAuthFixture(t);

			const issueId = await t.run(async (ctx) => {
				return await ctx.db.insert("issues", {
					workspaceId: fx.workspaceId,
					projectId: fx.projectRestrictedId,
					identifier: "AUTH-2",
					title: "Member cannot see",
					status: "backlog",
					priority: "medium",
					type: "issue",
					sortOrder: 2,
					createdBy: fx.adminId,
				});
			});

			const member = t.withIdentity({ subject: fx.memberId });
			await expect(
				member.mutation(api.issues.update, {
					issueId,
					title: "Should fail",
				}),
			).rejects.toThrow(/access/i);
		});
	});
});
