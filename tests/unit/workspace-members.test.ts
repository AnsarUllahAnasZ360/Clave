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

type InviteFixture = {
	ownerId: Id<"users">;
	joinerId: Id<"users">;
	organizationId: Id<"organizations">;
	workspaceId: Id<"workspaces">;
	code: string;
};

async function seedInviteFixture(
	t: ReturnType<typeof createBackend>,
	opts?: {
		maxMembers?: number;
		orgDeleted?: boolean;
	},
): Promise<InviteFixture> {
	return t.run(async (ctx) => {
		const ownerId = await ctx.db.insert("users", { name: "Owner" });
		const joinerId = await ctx.db.insert("users", { name: "Joiner" });

		const organizationId = await ctx.db.insert("organizations", {
			name: "Invite Org",
			slug: `invite-org-${Math.random().toString(36).slice(2, 8)}`,
			ownerId,
			planLimits: opts?.maxMembers
				? { maxMembers: opts.maxMembers }
				: undefined,
			deletedAt: opts?.orgDeleted ? Date.now() : undefined,
		});

		await ctx.db.insert("organizationMembers", {
			organizationId,
			userId: ownerId,
			role: "owner",
			joinedAt: Date.now(),
		});

		const workspaceId = await ctx.db.insert("workspaces", {
			name: "Invite Workspace",
			slug: `invite-ws-${Math.random().toString(36).slice(2, 8)}`,
			ownerId,
			organizationId,
		});

		await ctx.db.insert("workspaceMembers", {
			workspaceId,
			userId: ownerId,
			role: "admin",
			joinedAt: Date.now(),
		});

		const code = "JOIN42";
		await ctx.db.insert("inviteCodes", {
			code,
			workspaceId,
			createdBy: ownerId,
			useCount: 0,
			usedBy: [],
		});

		return { ownerId, joinerId, organizationId, workspaceId, code };
	});
}

describe("workspaceMembers.joinWithCode", () => {
	it("auto-adds missing org membership for workspace invite joins", async () => {
		const t = createBackend();
		const fx = await seedInviteFixture(t);
		const joiner = t.withIdentity({ subject: fx.joinerId });

		const workspaceId = await joiner.mutation(
			api.workspaceMembers.joinWithCode,
			{
				code: fx.code.toLowerCase(),
			},
		);

		expect(workspaceId).toBe(fx.workspaceId);

		const records = await t.run(async (ctx) => {
			const orgMember = await ctx.db
				.query("organizationMembers")
				.withIndex("by_org_user", (q) =>
					q.eq("organizationId", fx.organizationId).eq("userId", fx.joinerId),
				)
				.unique();

			const workspaceMember = await ctx.db
				.query("workspaceMembers")
				.withIndex("by_workspace_user", (q) =>
					q.eq("workspaceId", fx.workspaceId).eq("userId", fx.joinerId),
				)
				.unique();

			const inviteCode = await ctx.db
				.query("inviteCodes")
				.withIndex("by_code", (q) => q.eq("code", fx.code))
				.unique();

			return { orgMember, workspaceMember, inviteCode };
		});

		expect(records.orgMember?.role).toBe("member");
		expect(records.workspaceMember?.role).toBe("member");
		expect(records.inviteCode?.useCount).toBe(1);
		expect(records.inviteCode?.usedBy).toContain(fx.joinerId);
	});

	it("enforces plan member limits before auto-adding org membership", async () => {
		const t = createBackend();
		const fx = await seedInviteFixture(t, { maxMembers: 1 });
		const joiner = t.withIdentity({ subject: fx.joinerId });

		await expect(
			joiner.mutation(api.workspaceMembers.joinWithCode, { code: fx.code }),
		).rejects.toThrow();

		const records = await t.run(async (ctx) => {
			const orgMember = await ctx.db
				.query("organizationMembers")
				.withIndex("by_org_user", (q) =>
					q.eq("organizationId", fx.organizationId).eq("userId", fx.joinerId),
				)
				.unique();

			const workspaceMember = await ctx.db
				.query("workspaceMembers")
				.withIndex("by_workspace_user", (q) =>
					q.eq("workspaceId", fx.workspaceId).eq("userId", fx.joinerId),
				)
				.unique();

			const inviteCode = await ctx.db
				.query("inviteCodes")
				.withIndex("by_code", (q) => q.eq("code", fx.code))
				.unique();

			return { orgMember, workspaceMember, inviteCode };
		});

		expect(records.orgMember).toBeNull();
		expect(records.workspaceMember).toBeNull();
		expect(records.inviteCode?.useCount).toBe(0);
		expect(records.inviteCode?.usedBy).toEqual([]);
	});

	it("rejects invite joins when parent organization is deleted", async () => {
		const t = createBackend();
		const fx = await seedInviteFixture(t, { orgDeleted: true });
		const joiner = t.withIdentity({ subject: fx.joinerId });

		await expect(
			joiner.mutation(api.workspaceMembers.joinWithCode, { code: fx.code }),
		).rejects.toThrow(/organization no longer exists/i);
	});
});
