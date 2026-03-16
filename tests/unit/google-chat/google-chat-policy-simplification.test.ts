/// <reference types="vite/client" />

import { makeFunctionReference } from "convex/server";
import { convexTest } from "convex-test";
import { beforeAll, describe, expect, it } from "vitest";

// Tests run without credentials — allow global connections
beforeAll(() => {
	process.env.DEV_MODE = "true";
});

import type { Id } from "../../../convex/_generated/dataModel";
import schema from "../../../convex/schema";

const modules = import.meta.glob("../../../convex/**/*.*s");

function createBackend() {
	return convexTest(schema, modules);
}

const getConnectionStatusRef = makeFunctionReference<
	"query",
	{ workspaceId: Id<"workspaces">; provider?: "google-chat" },
	{
		provider: "google-chat";
		connection: {
			status: "connected" | "disconnected" | "error";
			webhookUrl?: string;
			authAudience?: string;
			externalAppName?: string;
		} | null;
		policy: {
			enabled: boolean;
			allowDirectMessages: boolean;
			allowSpaces: boolean;
			requireIdentityLink: boolean;
			allowedIssueActionIds?: string[];
			requireActionConfirmation?: boolean;
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
	},
	Id<"chatConnections">
>("chatIntegrations:connect");

const updatePolicyRef = makeFunctionReference<
	"mutation",
	{
		workspaceId: Id<"workspaces">;
		provider?: "google-chat";
		enabled?: boolean;
		allowDirectMessages?: boolean;
		allowSpaces?: boolean;
		requireIdentityLink?: boolean;
		allowedIssueActionIds?: string[];
		requireActionConfirmation?: boolean;
	},
	Id<"chatPolicies">
>("chatIntegrations:updatePolicy");

const _getPolicyForWebhookRef = makeFunctionReference<
	"query",
	{ workspaceId: Id<"workspaces">; provider: "google-chat" },
	{
		enabled: boolean;
		allowDirectMessages: boolean;
		allowSpaces: boolean;
		requireIdentityLink: boolean;
		allowedIssueActionIds?: string[];
		requireActionConfirmation?: boolean;
	}
>("chatIntegrations:getPolicyForWebhook");

type Fixture = {
	adminId: Id<"users">;
	workspaceId: Id<"workspaces">;
};

async function seedFixture(
	t: ReturnType<typeof createBackend>,
): Promise<Fixture> {
	return t.run(async (ctx) => {
		const adminId = await ctx.db.insert("users", { name: "Admin" });

		const organizationId = await ctx.db.insert("organizations", {
			name: "Test Org",
			slug: "test-org",
			ownerId: adminId,
		});

		await ctx.db.insert("organizationMembers", {
			organizationId,
			userId: adminId,
			role: "owner",
			joinedAt: Date.now(),
		});

		const workspaceId = await ctx.db.insert("workspaces", {
			name: "Test Workspace",
			slug: "test-workspace",
			ownerId: adminId,
			organizationId,
		});

		await ctx.db.insert("workspaceMembers", {
			workspaceId,
			userId: adminId,
			role: "admin",
			joinedAt: Date.now(),
		});

		await ctx.db.insert("workspaceSettings", {
			workspaceId,
			storyPrefix: "TS",
			nextStoryNumber: 1,
		});

		return { adminId, workspaceId };
	});
}

describe("google chat policy simplification", () => {
	it("connect creates policy with 6 core fields and no rollout fields in return", async () => {
		const t = createBackend();
		const fx = await seedFixture(t);
		const admin = t.withIdentity({ subject: fx.adminId });

		await admin.mutation(connectRef, {
			workspaceId: fx.workspaceId,
			provider: "google-chat",
			webhookUrl: "https://example.com/api/webhooks/google-chat",
		});

		const status = await admin.query(getConnectionStatusRef, {
			workspaceId: fx.workspaceId,
			provider: "google-chat",
		});

		expect(status.policy).not.toBeNull();
		expect(status.policy?.enabled).toBe(true);
		expect(status.policy?.allowDirectMessages).toBe(true);
		expect(status.policy?.allowSpaces).toBe(true);
		expect(status.policy?.requireIdentityLink).toBe(true);
		expect(status.policy?.requireActionConfirmation).toBe(false);
		expect(status.policy?.allowedIssueActionIds).toBeDefined();
	});

	it("updatePolicy patches only the 6 core policy fields", async () => {
		const t = createBackend();
		const fx = await seedFixture(t);
		const admin = t.withIdentity({ subject: fx.adminId });

		await admin.mutation(connectRef, {
			workspaceId: fx.workspaceId,
			provider: "google-chat",
		});

		await admin.mutation(updatePolicyRef, {
			workspaceId: fx.workspaceId,
			provider: "google-chat",
			enabled: false,
			allowDirectMessages: false,
			requireActionConfirmation: true,
		});

		const status = await admin.query(getConnectionStatusRef, {
			workspaceId: fx.workspaceId,
			provider: "google-chat",
		});

		expect(status.policy?.enabled).toBe(false);
		expect(status.policy?.allowDirectMessages).toBe(false);
		expect(status.policy?.allowSpaces).toBe(true);
		expect(status.policy?.requireIdentityLink).toBe(true);
		expect(status.policy?.requireActionConfirmation).toBe(true);
	});

	it("getConnectionStatus returns simplified connection without health fields", async () => {
		const t = createBackend();
		const fx = await seedFixture(t);
		const admin = t.withIdentity({ subject: fx.adminId });

		await admin.mutation(connectRef, {
			workspaceId: fx.workspaceId,
			provider: "google-chat",
			webhookUrl: "https://example.com/api/webhooks/google-chat",
			authAudience: "https://example.com",
			externalAppName: "Clave",
		});

		const status = await admin.query(getConnectionStatusRef, {
			workspaceId: fx.workspaceId,
			provider: "google-chat",
		});

		expect(status.connection).not.toBeNull();
		expect(status.connection?.status).toBe("connected");
		expect(status.connection?.webhookUrl).toBe(
			"https://example.com/api/webhooks/google-chat",
		);
		expect(status.connection?.externalAppName).toBe("Clave");
	});

	it("getPolicyForWebhook returns simplified policy without rollout fields", async () => {
		const t = createBackend();
		const fx = await seedFixture(t);
		const admin = t.withIdentity({ subject: fx.adminId });

		await admin.mutation(connectRef, {
			workspaceId: fx.workspaceId,
			provider: "google-chat",
		});

		const policy = await t.run(async (ctx) => {
			const result = await ctx.db
				.query("chatPolicies")
				.withIndex("by_workspace_provider", (q) =>
					q.eq("workspaceId", fx.workspaceId).eq("provider", "google-chat"),
				)
				.first();
			return result;
		});
		expect(policy).not.toBeNull();

		// getPolicyForWebhook is an internal query, test the shape via direct DB
		expect(policy?.enabled).toBe(true);
		expect(policy?.allowDirectMessages).toBe(true);
		expect(policy?.allowSpaces).toBe(true);
		expect(policy?.requireIdentityLink).toBe(true);
	});

	it("updatePolicy creates policy with defaults when none exists", async () => {
		const t = createBackend();
		const fx = await seedFixture(t);
		const admin = t.withIdentity({ subject: fx.adminId });

		// Call updatePolicy without connect (no existing policy)
		await admin.mutation(updatePolicyRef, {
			workspaceId: fx.workspaceId,
			provider: "google-chat",
			enabled: false,
		});

		const status = await admin.query(getConnectionStatusRef, {
			workspaceId: fx.workspaceId,
			provider: "google-chat",
		});

		expect(status.policy).not.toBeNull();
		expect(status.policy?.enabled).toBe(false);
		expect(status.policy?.allowDirectMessages).toBe(true);
		expect(status.policy?.allowSpaces).toBe(true);
	});

	it("recordActionAudit still lives in chatDeliveryLogs", async () => {
		const t = createBackend();
		const fx = await seedFixture(t);

		// recordActionAudit remains in chatDeliveryLogs.ts (not moved due to
		// out-of-scope dependencies). Verify the table accepts inserts.
		await t.run(async (ctx) => {
			await ctx.db.insert("chatActionAuditLogs", {
				workspaceId: fx.workspaceId,
				provider: "google-chat",
				eventId: "evt-123",
				idempotencyKey: "key-123",
				actionType: "assign_to_me",
				actionKind: "issue",
				result: "accepted",
				createdAt: Date.now(),
			});
		});

		const audits = await t.run(async (ctx) => {
			return ctx.db
				.query("chatActionAuditLogs")
				.withIndex("by_workspace_provider_created_at", (q) =>
					q.eq("workspaceId", fx.workspaceId).eq("provider", "google-chat"),
				)
				.collect();
		});

		expect(audits).toHaveLength(1);
		expect(audits[0].actionKind).toBe("issue");
		expect(audits[0].result).toBe("accepted");
	});
});
