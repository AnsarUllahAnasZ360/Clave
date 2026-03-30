/// <reference types="vite/client" />

import { makeFunctionReference } from "convex/server";
import { convexTest } from "convex-test";
import { beforeAll, describe, expect, it } from "vitest";

// Tests run without credentials — allow global connections
beforeAll(() => {
	process.env.DEV_MODE = "true";
});

import type { Id } from "../../convex/_generated/dataModel";
import schema from "../../convex/schema";

const modules = import.meta.glob("../../convex/**/*.*s");

function createBackend() {
	return convexTest(schema, modules);
}

const getConnectionStatusRef = makeFunctionReference<
	"query",
	{ workspaceId: Id<"workspaces">; provider?: "google-chat" },
	{
		provider: "google-chat";
		connection: { status: "connected" | "disconnected" | "error" } | null;
		policy: {
			enabled: boolean;
			allowDirectMessages: boolean;
			allowSpaces: boolean;
			requireIdentityLink: boolean;
			allowedIssueActionIds: string[];
			requireActionConfirmation: boolean;
		} | null;
	}
>("chatIntegrations:getConnectionStatus");

const connectRef = makeFunctionReference<
	"mutation",
	{
		workspaceId: Id<"workspaces">;
		provider?: "google-chat";
		webhookUrl?: string;
		authAudience?: string;
		externalAppName?: string;
		encryptedCredentials?: string;
		byosaClientEmail?: string;
		credentialSource?: "marketplace" | "byosa" | "global";
	},
	Id<"chatConnections">
>("chatIntegrations:connect");

const disconnectRef = makeFunctionReference<
	"mutation",
	{ workspaceId: Id<"workspaces">; provider?: "google-chat" },
	null
>("chatIntegrations:disconnect");

const upsertLinkRef = makeFunctionReference<
	"mutation",
	{
		workspaceId: Id<"workspaces">;
		provider?: "google-chat";
		chatUserId: string;
		chatDisplayName?: string;
		chatEmail?: string;
		userId: Id<"users">;
	},
	Id<"chatUserLinks">
>("chatIdentityLinks:upsertLink");

type Fixture = {
	adminId: Id<"users">;
	memberId: Id<"users">;
	outsiderId: Id<"users">;
	workspaceId: Id<"workspaces">;
};

async function seedFixture(
	t: ReturnType<typeof createBackend>,
): Promise<Fixture> {
	return t.run(async (ctx) => {
		const ownerId = await ctx.db.insert("users", { name: "Owner" });
		const adminId = await ctx.db.insert("users", { name: "Admin" });
		const memberId = await ctx.db.insert("users", { name: "Member" });
		const outsiderId = await ctx.db.insert("users", { name: "Outsider" });

		const organizationId = await ctx.db.insert("organizations", {
			name: "GC Org",
			slug: "gc-org",
			ownerId,
		});

		await ctx.db.insert("organizationMembers", {
			organizationId,
			userId: ownerId,
			role: "owner",
			joinedAt: Date.now(),
		});
		await ctx.db.insert("organizationMembers", {
			organizationId,
			userId: adminId,
			role: "admin",
			joinedAt: Date.now(),
		});
		await ctx.db.insert("organizationMembers", {
			organizationId,
			userId: memberId,
			role: "member",
			joinedAt: Date.now(),
		});

		const workspaceId = await ctx.db.insert("workspaces", {
			name: "GC Workspace",
			slug: "gc-workspace",
			ownerId: adminId,
			organizationId,
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
			storyPrefix: "GC",
			nextStoryNumber: 1,
		});

		return {
			adminId,
			memberId,
			outsiderId,
			workspaceId,
		};
	});
}

describe("google chat integrations (integration)", () => {
	it("allows admin connect/disconnect and member read", async () => {
		const t = createBackend();
		const fx = await seedFixture(t);
		const admin = t.withIdentity({ subject: fx.adminId });
		const member = t.withIdentity({ subject: fx.memberId });

		await admin.mutation(connectRef, {
			workspaceId: fx.workspaceId,
			provider: "google-chat",
			webhookUrl: "https://clave.z360.js/api/webhooks/google-chat",
			authAudience: "https://clave.z360.js/api/webhooks/google-chat",
			externalAppName: "Clave",
		});

		const connectedStatus = await member.query(getConnectionStatusRef, {
			workspaceId: fx.workspaceId,
			provider: "google-chat",
		});
		expect(connectedStatus.connection?.status).toBe("connected");
		expect(connectedStatus.policy?.enabled).toBe(true);

		await admin.mutation(disconnectRef, {
			workspaceId: fx.workspaceId,
			provider: "google-chat",
		});
		const disconnectedStatus = await member.query(getConnectionStatusRef, {
			workspaceId: fx.workspaceId,
			provider: "google-chat",
		});
		expect(disconnectedStatus.connection?.status).toBe("disconnected");
	});

	it("denies non-admin mutation access", async () => {
		const t = createBackend();
		const fx = await seedFixture(t);
		const member = t.withIdentity({ subject: fx.memberId });

		await expect(
			member.mutation(connectRef, {
				workspaceId: fx.workspaceId,
				provider: "google-chat",
			}),
		).rejects.toThrow(/Admin access required/i);
	});

	it("rejects BYOSA duplicate when same service account connects to another workspace", async () => {
		const t = createBackend();
		const fx = await seedFixture(t);
		const admin = t.withIdentity({ subject: fx.adminId });

		// Create a second workspace under the same org
		const workspace2Id = await t.run(async (ctx) => {
			const ws2 = await ctx.db.insert("workspaces", {
				name: "GC Workspace 2",
				slug: "gc-workspace-2",
				ownerId: fx.adminId,
				organizationId: (await ctx.db.get(fx.workspaceId))!.organizationId,
			});
			await ctx.db.insert("workspaceMembers", {
				workspaceId: ws2,
				userId: fx.adminId,
				role: "admin",
				joinedAt: Date.now(),
			});
			await ctx.db.insert("workspaceSettings", {
				workspaceId: ws2,
				storyPrefix: "GC2",
				nextStoryNumber: 1,
			});
			return ws2;
		});

		// Connect workspace 1 with BYOSA
		await admin.mutation(connectRef, {
			workspaceId: fx.workspaceId,
			provider: "google-chat",
			encryptedCredentials: "encrypted-blob",
			byosaClientEmail: "bot@project.iam.gserviceaccount.com",
			credentialSource: "byosa",
		});

		// Same service account on workspace 2 should fail
		await expect(
			admin.mutation(connectRef, {
				workspaceId: workspace2Id,
				provider: "google-chat",
				encryptedCredentials: "encrypted-blob",
				byosaClientEmail: "bot@project.iam.gserviceaccount.com",
				credentialSource: "byosa",
			}),
		).rejects.toThrow(/already connected to another workspace/i);
	});

	it("enforces chat identity uniqueness and workspace membership", async () => {
		const t = createBackend();
		const fx = await seedFixture(t);
		const admin = t.withIdentity({ subject: fx.adminId });

		await admin.mutation(upsertLinkRef, {
			workspaceId: fx.workspaceId,
			provider: "google-chat",
			chatUserId: "users/abc",
			chatDisplayName: "GC Member",
			userId: fx.memberId,
		});

		await expect(
			admin.mutation(upsertLinkRef, {
				workspaceId: fx.workspaceId,
				provider: "google-chat",
				chatUserId: "users/abc",
				userId: fx.adminId,
			}),
		).rejects.toThrow(/already linked/i);

		await expect(
			admin.mutation(upsertLinkRef, {
				workspaceId: fx.workspaceId,
				provider: "google-chat",
				chatUserId: "users/outside",
				userId: fx.outsiderId,
			}),
		).rejects.toThrow(/not a member/i);
	});
});
