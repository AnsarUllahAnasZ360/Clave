/// <reference types="vite/client" />

import { makeFunctionReference } from "convex/server";
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import type { Id } from "../../convex/_generated/dataModel";
import schema from "../../convex/schema";

const modules = import.meta.glob("../../convex/**/*.*s");

function createBackend() {
	return convexTest(schema, modules);
}

const validateRef = makeFunctionReference<
	"query",
	{ code: string },
	{
		valid: boolean;
		workspaceName?: string;
		workspaceId?: Id<"workspaces">;
		workspaceSlug?: string;
	} | null
>("inviteCodes:validate");

describe("invite codes (integration)", () => {
	it("returns workspaceSlug for a valid code", async () => {
		const t = createBackend();

		const { code } = await t.run(async (ctx) => {
			const ownerId = await ctx.db.insert("users", { name: "Owner" });

			const workspaceId = await ctx.db.insert("workspaces", {
				name: "Test Workspace",
				slug: "test-ws",
				ownerId,
			});

			await ctx.db.insert("workspaceMembers", {
				workspaceId,
				userId: ownerId,
				role: "admin",
				joinedAt: Date.now(),
			});

			await ctx.db.insert("workspaceSettings", {
				workspaceId,
				storyPrefix: "TW",
				nextStoryNumber: 1,
			});

			const inviteCode = "ABCDEF";
			await ctx.db.insert("inviteCodes", {
				code: inviteCode,
				workspaceId,
				createdBy: ownerId,
				expiresAt: Date.now() + 86400000,
				maxUses: 10,
				useCount: 0,
				status: "pending",
			});

			return { code: inviteCode };
		});

		const result = await t.query(validateRef, { code });
		expect(result).not.toBeNull();
		expect(result?.valid).toBe(true);
		expect(result?.workspaceName).toBe("Test Workspace");
		expect(result?.workspaceSlug).toBe("test-ws");
	});

	it("stores role on invite code and validates it", async () => {
		const t = createBackend();

		const { code } = await t.run(async (ctx) => {
			const ownerId = await ctx.db.insert("users", { name: "Owner" });

			const workspaceId = await ctx.db.insert("workspaces", {
				name: "Role WS",
				slug: "role-ws",
				ownerId,
			});

			await ctx.db.insert("inviteCodes", {
				code: "ADMROL",
				workspaceId,
				createdBy: ownerId,
				role: "admin",
				expiresAt: Date.now() + 86400000,
				maxUses: 5,
				useCount: 0,
				status: "pending",
			});

			return { code: "ADMROL" };
		});

		const result = await t.query(validateRef, { code });
		expect(result?.valid).toBe(true);

		// Verify the role was stored correctly
		await t.run(async (ctx) => {
			const invite = await ctx.db
				.query("inviteCodes")
				.withIndex("by_code", (q) => q.eq("code", "ADMROL"))
				.unique();
			expect(invite?.role).toBe("admin");
		});
	});

	it("returns invalid for expired code", async () => {
		const t = createBackend();

		await t.run(async (ctx) => {
			const ownerId = await ctx.db.insert("users", { name: "Owner" });
			const workspaceId = await ctx.db.insert("workspaces", {
				name: "WS",
				slug: "ws",
				ownerId,
			});

			await ctx.db.insert("inviteCodes", {
				code: "EXPIRE",
				workspaceId,
				createdBy: ownerId,
				expiresAt: Date.now() - 1000,
				maxUses: 10,
				useCount: 0,
				status: "pending",
			});
		});

		const result = await t.query(validateRef, { code: "EXPIRE" });
		expect(result).not.toBeNull();
		expect(result?.valid).toBe(false);
	});
});
