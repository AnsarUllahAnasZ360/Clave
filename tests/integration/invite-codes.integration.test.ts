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
		orgSlug?: string;
	} | null
>("inviteCodes:validate");

describe("invite codes (integration)", () => {
	it("returns orgSlug and workspaceSlug for a valid code", async () => {
		const t = createBackend();

		const { code } = await t.run(async (ctx) => {
			const ownerId = await ctx.db.insert("users", { name: "Owner" });

			const organizationId = await ctx.db.insert("organizations", {
				name: "Test Org",
				slug: "test-org",
				ownerId,
			});

			await ctx.db.insert("organizationMembers", {
				organizationId,
				userId: ownerId,
				role: "owner",
				joinedAt: Date.now(),
			});

			const workspaceId = await ctx.db.insert("workspaces", {
				name: "Test Workspace",
				slug: "test-ws",
				ownerId,
				organizationId,
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
			});

			return { code: inviteCode };
		});

		const result = await t.query(validateRef, { code });
		expect(result).not.toBeNull();
		expect(result!.valid).toBe(true);
		expect(result!.workspaceName).toBe("Test Workspace");
		expect(result!.workspaceSlug).toBe("test-ws");
		expect(result!.orgSlug).toBe("test-org");
	});

	it("returns invalid for expired code", async () => {
		const t = createBackend();

		await t.run(async (ctx) => {
			const ownerId = await ctx.db.insert("users", { name: "Owner" });
			const organizationId = await ctx.db.insert("organizations", {
				name: "Org",
				slug: "org",
				ownerId,
			});
			const workspaceId = await ctx.db.insert("workspaces", {
				name: "WS",
				slug: "ws",
				ownerId,
				organizationId,
			});

			await ctx.db.insert("inviteCodes", {
				code: "EXPIRE",
				workspaceId,
				createdBy: ownerId,
				expiresAt: Date.now() - 1000,
				maxUses: 10,
				useCount: 0,
			});
		});

		const result = await t.query(validateRef, { code: "EXPIRE" });
		expect(result).not.toBeNull();
		expect(result!.valid).toBe(false);
	});
});
