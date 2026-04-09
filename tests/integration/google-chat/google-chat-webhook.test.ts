/// <reference types="vite/client" />

import { makeFunctionReference } from "convex/server";
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import type { Id } from "../../../convex/_generated/dataModel";
import schema from "../../../convex/schema";

const modules = import.meta.glob("../../../convex/**/*.*s");

function createBackend() {
	return convexTest(schema, modules);
}

const handleWebhookRef = makeFunctionReference<
	"action",
	{
		rawBody: string;
		authorization?: string;
		requestId?: string;
		devBypassHeader?: string;
		expectedAudience?: string;
		allowInsecureDevBypass?: boolean;
		tokenInfoEndpoint?: string;
	},
	{
		status:
			| "accepted"
			| "duplicate"
			| "invalid_auth"
			| "invalid_payload"
			| "unsupported_action"
			| "permission_denied"
			| "error";
		message?: string;
		eventId?: string;
		eventType?: string;
		chatResponse?: Record<string, unknown>;
	}
>("chat/googleChatWebhook:handleWebhook");

const getIssueByIdRef = makeFunctionReference<
	"query",
	{ issueId: Id<"issues"> },
	{
		_id: Id<"issues">;
		assigneeId?: Id<"users">;
		status: string;
	} | null
>("issues:getById");

type Fixture = {
	adminId: Id<"users">;
	memberId: Id<"users">;
	workspaceId: Id<"workspaces">;
	issueId: Id<"issues">;
	linkedChatUserId: string;
};

async function seedFixture(
	t: ReturnType<typeof createBackend>,
): Promise<Fixture> {
	return t.run(async (ctx) => {
		const ownerId = await ctx.db.insert("users", { name: "Owner" });
		const adminId = await ctx.db.insert("users", { name: "Admin" });
		const memberId = await ctx.db.insert("users", { name: "Member" });

		const organizationId = await ctx.db.insert("organizations", {
			name: "Webhook Org",
			slug: "webhook-org",
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
			name: "Webhook Workspace",
			slug: "webhook-workspace",
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

		await ctx.db.insert("chatConnections", {
			workspaceId,
			provider: "google-chat",
			status: "connected",
			installedBy: adminId,
			installedAt: Date.now(),
			createdAt: Date.now(),
			updatedAt: Date.now(),
		});

		await ctx.db.insert("chatPolicies", {
			workspaceId,
			provider: "google-chat",
			enabled: true,
			allowDirectMessages: true,
			allowSpaces: true,
			requireIdentityLink: true,
			allowedIssueActionIds: [
				"assign_to_me",
				"set_status_non_destructive",
				"open_issue_link",
			],
			requireActionConfirmation: false,
			updatedBy: adminId,
			createdAt: Date.now(),
			updatedAt: Date.now(),
		});

		const linkedChatUserId = "users/member-chat";
		await ctx.db.insert("chatUserLinks", {
			workspaceId,
			provider: "google-chat",
			chatUserId: linkedChatUserId,
			userId: memberId,
			linkedBy: adminId,
			linkedAt: Date.now(),
			updatedAt: Date.now(),
		});

		const issueId = await ctx.db.insert("issues", {
			workspaceId,
			identifier: "GC-321",
			title: "Handle Google Chat card actions",
			description: "Seed issue",
			status: "todo",
			priority: "medium",
			type: "feature",
			sortOrder: 1,
			createdBy: adminId,
		});

		return {
			adminId,
			memberId,
			workspaceId,
			issueId,
			linkedChatUserId,
		};
	});
}

function buildCardClickedPayload(args: {
	eventTime: string;
	spaceName: string;
	chatUserId: string;
	actionMethodName: string;
	issueId: string;
	actionInstanceId: string;
	status?: string;
}) {
	const parameters = [
		{ key: "issue_id", value: args.issueId },
		{ key: "action_instance_id", value: args.actionInstanceId },
	];
	if (args.status) {
		parameters.push({ key: "status", value: args.status });
	}

	return JSON.stringify({
		type: "CARD_CLICKED",
		eventTime: args.eventTime,
		space: { name: args.spaceName },
		user: { name: args.chatUserId },
		message: {
			name: "spaces/SPACE_1/messages/MSG_1",
			sender: { type: "HUMAN" },
		},
		action: {
			actionMethodName: args.actionMethodName,
			parameters,
		},
	});
}

describe("google chat webhook interactions (integration)", () => {
	it("routes assign and status actions and enforces idempotency", async () => {
		const t = createBackend();
		const fx = await seedFixture(t);
		const admin = t.withIdentity({ subject: fx.adminId });
		const member = t.withIdentity({ subject: fx.memberId });

		const assignPayload = buildCardClickedPayload({
			eventTime: "2026-02-25T20:00:00.000Z",
			spaceName: "spaces/SPACE_1",
			chatUserId: fx.linkedChatUserId,
			actionMethodName: "assign_to_me",
			issueId: fx.issueId,
			actionInstanceId: "assign-1",
		});

		const firstAssign = await admin.action(handleWebhookRef, {
			rawBody: assignPayload,
			devBypassHeader: "1",
			allowInsecureDevBypass: true,
		});
		expect(firstAssign.status).toBe("accepted");
		expect(firstAssign.chatResponse).toBeDefined();

		const issueAfterAssign = await member.query(getIssueByIdRef, {
			issueId: fx.issueId,
		});
		expect(issueAfterAssign?.assigneeId).toBe(fx.memberId);

		const replayAssign = await admin.action(handleWebhookRef, {
			rawBody: assignPayload,
			devBypassHeader: "1",
			allowInsecureDevBypass: true,
		});
		expect(replayAssign.status).toBe("duplicate");

		const statusPayload = buildCardClickedPayload({
			eventTime: "2026-02-25T20:01:00.000Z",
			spaceName: "spaces/SPACE_1",
			chatUserId: fx.linkedChatUserId,
			actionMethodName: "set_status_non_destructive",
			issueId: fx.issueId,
			actionInstanceId: "status-1",
			status: "in_progress",
		});
		const statusResult = await admin.action(handleWebhookRef, {
			rawBody: statusPayload,
			devBypassHeader: "1",
			allowInsecureDevBypass: true,
		});
		expect(statusResult.status).toBe("accepted");

		const issueAfterStatus = await member.query(getIssueByIdRef, {
			issueId: fx.issueId,
		});
		expect(issueAfterStatus?.status).toBe("in_progress");
	}, 15000);

	it("returns safe errors for unsupported and unauthorized actions without mutating", async () => {
		const t = createBackend();
		const fx = await seedFixture(t);
		const admin = t.withIdentity({ subject: fx.adminId });
		const member = t.withIdentity({ subject: fx.memberId });

		const unsupportedPayload = buildCardClickedPayload({
			eventTime: "2026-02-25T21:00:00.000Z",
			spaceName: "spaces/SPACE_1",
			chatUserId: fx.linkedChatUserId,
			actionMethodName: "delete_issue",
			issueId: fx.issueId,
			actionInstanceId: "unsupported-1",
		});

		const unsupportedResult = await admin.action(handleWebhookRef, {
			rawBody: unsupportedPayload,
			devBypassHeader: "1",
			allowInsecureDevBypass: true,
		});
		expect(unsupportedResult.status).toBe("unsupported_action");
		expect(unsupportedResult.chatResponse).toBeDefined();

		const unauthorizedPayload = buildCardClickedPayload({
			eventTime: "2026-02-25T21:05:00.000Z",
			spaceName: "spaces/SPACE_1",
			chatUserId: "users/unlinked",
			actionMethodName: "assign_to_me",
			issueId: fx.issueId,
			actionInstanceId: "assign-unlinked-1",
		});

		const unauthorizedResult = await admin.action(handleWebhookRef, {
			rawBody: unauthorizedPayload,
			devBypassHeader: "1",
			allowInsecureDevBypass: true,
		});
		expect(unauthorizedResult.status).toBe("permission_denied");
		expect(unauthorizedResult.chatResponse).toBeDefined();

		const issueAfterErrors = await member.query(getIssueByIdRef, {
			issueId: fx.issueId,
		});
		expect(issueAfterErrors?.assigneeId).toBeUndefined();
		expect(issueAfterErrors?.status).toBe("todo");
	}, 15000);
});
