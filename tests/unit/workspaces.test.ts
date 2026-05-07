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
	slug: string;
};

async function seedFixture(
	t: ReturnType<typeof createBackend>,
): Promise<Fixture> {
	return t.run(async (ctx) => {
		const adminId = await ctx.db.insert("users", { name: "Admin" });
		const memberId = await ctx.db.insert("users", { name: "Member" });
		const outsiderId = await ctx.db.insert("users", { name: "Outsider" });
		const slug = "workspace-slug-gate";

		const workspaceId = await ctx.db.insert("workspaces", {
			name: "Workspace Slug Gate",
			slug,
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

		return { adminId, memberId, outsiderId, workspaceId, slug };
	});
}

describe("workspaces.getBySlug", () => {
	it("returns the workspace for a member", async () => {
		const t = createBackend();
		const fx = await seedFixture(t);
		const member = t.withIdentity({ subject: fx.memberId });

		const workspace = await member.query(api.workspaces.getBySlug, {
			slug: fx.slug,
		});

		expect(workspace?._id).toBe(fx.workspaceId);
		expect(workspace?.slug).toBe(fx.slug);
	});

	it("returns null for an authenticated non-member", async () => {
		const t = createBackend();
		const fx = await seedFixture(t);
		const outsider = t.withIdentity({ subject: fx.outsiderId });

		const workspace = await outsider.query(api.workspaces.getBySlug, {
			slug: fx.slug,
		});

		expect(workspace).toBeNull();
	});
});
