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
	workspaceId: Id<"workspaces">;
	code: string;
};

async function seedInviteFixture(
	t: ReturnType<typeof createBackend>,
): Promise<InviteFixture> {
	return t.run(async (ctx) => {
		const ownerId = await ctx.db.insert("users", { name: "Owner" });
		const joinerId = await ctx.db.insert("users", { name: "Joiner" });

		const workspaceId = await ctx.db.insert("workspaces", {
			name: "Invite Workspace",
			slug: `invite-ws-${Math.random().toString(36).slice(2, 8)}`,
			ownerId,
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
			status: "pending",
		});

		return { ownerId, joinerId, workspaceId, code };
	});
}

describe("workspaceMembers.joinWithCode", () => {
	it("adds workspace membership on invite join", async () => {
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

			return { workspaceMember, inviteCode };
		});

		expect(records.workspaceMember?.role).toBe("member");
		expect(records.inviteCode?.useCount).toBe(1);
		expect(records.inviteCode?.usedBy).toContain(fx.joinerId);
		expect(records.inviteCode?.status).toBe("accepted");
		expect(records.inviteCode?.acceptedBy).toBe(fx.joinerId);
		expect(records.inviteCode?.acceptedAt).toBeDefined();
	});

	it("enforces plan member limits on join", async () => {
		const t = createBackend();
		const fx = await seedInviteFixture(t);
		const joiner = t.withIdentity({ subject: fx.joinerId });

		// Set plan limit to 1 (owner already uses 1 slot)
		await t.run(async (ctx) => {
			await ctx.db.patch(fx.workspaceId, {
				planLimits: { maxMembers: 1 },
			});
		});

		await expect(
			joiner.mutation(api.workspaceMembers.joinWithCode, { code: fx.code }),
		).rejects.toThrow(/plan_limit/i);
	});

	it("rejects invalid invite codes", async () => {
		const t = createBackend();
		const fx = await seedInviteFixture(t);
		const joiner = t.withIdentity({ subject: fx.joinerId });

		await expect(
			joiner.mutation(api.workspaceMembers.joinWithCode, {
				code: "INVALID",
			}),
		).rejects.toThrow(/invalid invite code/i);
	});
});
