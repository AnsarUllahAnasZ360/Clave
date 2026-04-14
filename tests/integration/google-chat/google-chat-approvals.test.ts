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
		status: string;
		assigneeId?: Id<"users">;
	} | null
>("issues:getById");

type Fixture = {
	adminId: Id<"users">;
	approverUserId: Id<"users">;
	unauthorizedUserId: Id<"users">;
	workspaceId: Id<"workspaces">;
	issueId: Id<"issues">;
	threadId: string;
	approverChatUserId: string;
	unauthorizedChatUserId: string;
};

async function seedFixture(
	t: ReturnType<typeof createBackend>,
): Promise<Fixture> {
	return t.run(async (ctx) => {
		const ownerId = await ctx.db.insert("users", { name: "Owner" });
		const adminId = await ctx.db.insert("users", { name: "Admin" });
		const approverUserId = await ctx.db.insert("users", { name: "Approver" });
		const unauthorizedUserId = await ctx.db.insert("users", {
			name: "Unauthorized",
		});

		const organizationId = await ctx.db.insert("organizations", {
			name: "Approval Org",
			slug: "approval-org",
			ownerId,
		});

		for (const [userId, role] of [
			[ownerId, "owner"],
			[adminId, "admin"],
			[approverUserId, "member"],
			[unauthorizedUserId, "member"],
		] as const) {
			await ctx.db.insert("organizationMembers", {
				organizationId,
				userId,
				role,
				joinedAt: Date.now(),
			});
		}

		const workspaceId = await ctx.db.insert("workspaces", {
			name: "Approval Workspace",
			slug: "approval-workspace",
			ownerId: adminId,
			organizationId,
		});

		for (const [userId, role] of [
			[adminId, "admin"],
			[approverUserId, "member"],
			[unauthorizedUserId, "member"],
		] as const) {
			await ctx.db.insert("workspaceMembers", {
				workspaceId,
				userId,
				role,
				joinedAt: Date.now(),
			});
		}

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

		const approverChatUserId = "users/chat-approver";
		const unauthorizedChatUserId = "users/chat-unauthorized";
		await ctx.db.insert("chatUserLinks", {
			workspaceId,
			provider: "google-chat",
			chatUserId: approverChatUserId,
			userId: approverUserId,
			linkedBy: adminId,
			linkedAt: Date.now(),
			updatedAt: Date.now(),
		});
		await ctx.db.insert("chatUserLinks", {
			workspaceId,
			provider: "google-chat",
			chatUserId: unauthorizedChatUserId,
			userId: unauthorizedUserId,
			linkedBy: adminId,
			linkedAt: Date.now(),
			updatedAt: Date.now(),
		});

		const issueId = await ctx.db.insert("issues", {
			workspaceId,
			identifier: "GC-APP-1",
			title: "Approval target issue",
			status: "todo",
			priority: "medium",
			type: "feature",
			sortOrder: 1,
			createdBy: adminId,
		});

		const threadId = "thread-google-chat-approval-1";
		await ctx.db.insert("aiThreads", {
			workspaceId,
			userId: approverUserId,
			threadId,
			updatedAt: Date.now(),
		});

		return {
			adminId,
			approverUserId,
			unauthorizedUserId,
			workspaceId,
			issueId,
			threadId,
			approverChatUserId,
			unauthorizedChatUserId,
		};
	});
}

function buildApprovalCardPayload(args: {
	eventTime: string;
	spaceName: string;
	chatUserId: string;
	actionMethodName: "ai_approval_approve" | "ai_approval_reject";
	approvalId: string;
	toolCallId: string;
	threadId: string;
	actionInstanceId: string;
}) {
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
			parameters: [
				{ key: "approval_id", value: args.approvalId },
				{ key: "tool_call_id", value: args.toolCallId },
				{ key: "thread_id", value: args.threadId },
				{ key: "action_instance_id", value: args.actionInstanceId },
			],
		},
	});
}

async function insertApproval(
	t: ReturnType<typeof createBackend>,
	args: {
		threadId: string;
		toolCallId: string;
		description: string;
		actionPayload: string;
	},
) {
	return await t.run(async (ctx) => {
		return await ctx.db.insert("aiToolApprovals", {
			threadId: args.threadId,
			toolCallId: args.toolCallId,
			toolName: "updateIssue",
			description: args.description,
			actionPayload: args.actionPayload,
			status: "pending",
			createdAt: Date.now(),
		});
	});
}

async function getApprovalStatus(
	t: ReturnType<typeof createBackend>,
	approvalId: Id<"aiToolApprovals">,
) {
	return await t.run(async (ctx) => {
		const approval = await ctx.db.get(approvalId);
		return approval?.status;
	});
}

describe("google chat webhook approvals (integration)", () => {
	it("approves deferred action once and returns duplicate on replay", async () => {
		const t = createBackend();
		const fx = await seedFixture(t);
		const admin = t.withIdentity({ subject: fx.adminId });

		const approvalId = await insertApproval(t, {
			threadId: fx.threadId,
			toolCallId: "tool-approve-1",
			description: "Mark GC-APP-1 as done",
			actionPayload: JSON.stringify({
				type: "updateIssue",
				issueId: fx.issueId,
				updates: { status: "done" },
			}),
		});

		const firstPayload = buildApprovalCardPayload({
			eventTime: "2026-02-25T22:00:00.000Z",
			spaceName: "spaces/SPACE_1",
			chatUserId: fx.approverChatUserId,
			actionMethodName: "ai_approval_approve",
			approvalId,
			toolCallId: "tool-approve-1",
			threadId: fx.threadId,
			actionInstanceId: "approve-1",
		});

		const firstResult = await admin.action(handleWebhookRef, {
			rawBody: firstPayload,
			devBypassHeader: "1",
			allowInsecureDevBypass: true,
		});
		expect(firstResult.status, JSON.stringify(firstResult)).toBe("accepted");
		expect(firstResult.chatResponse).toBeDefined();

		const issueAfterApprove = await admin.query(getIssueByIdRef, {
			issueId: fx.issueId,
		});
		expect(issueAfterApprove?.status).toBe("done");
		expect(await getApprovalStatus(t, approvalId)).toBe("approved");

		const replayPayload = buildApprovalCardPayload({
			eventTime: "2026-02-25T22:01:00.000Z",
			spaceName: "spaces/SPACE_1",
			chatUserId: fx.approverChatUserId,
			actionMethodName: "ai_approval_approve",
			approvalId,
			toolCallId: "tool-approve-1",
			threadId: fx.threadId,
			actionInstanceId: "approve-2",
		});
		const replayResult = await admin.action(handleWebhookRef, {
			rawBody: replayPayload,
			devBypassHeader: "1",
			allowInsecureDevBypass: true,
		});
		expect(replayResult.status).toBe("duplicate");
		expect(await getApprovalStatus(t, approvalId)).toBe("approved");
	}, 15_000);

	it("rejects action and denies unauthorized approval actor", async () => {
		const t = createBackend();
		const fx = await seedFixture(t);
		const admin = t.withIdentity({ subject: fx.adminId });

		const rejectApprovalId = await insertApproval(t, {
			threadId: fx.threadId,
			toolCallId: "tool-reject-1",
			description: "Reject destructive status update",
			actionPayload: JSON.stringify({
				type: "updateIssue",
				issueId: fx.issueId,
				updates: { status: "cancelled" },
			}),
		});

		const rejectPayload = buildApprovalCardPayload({
			eventTime: "2026-02-25T22:10:00.000Z",
			spaceName: "spaces/SPACE_1",
			chatUserId: fx.approverChatUserId,
			actionMethodName: "ai_approval_reject",
			approvalId: rejectApprovalId,
			toolCallId: "tool-reject-1",
			threadId: fx.threadId,
			actionInstanceId: "reject-1",
		});
		const rejectResult = await admin.action(handleWebhookRef, {
			rawBody: rejectPayload,
			devBypassHeader: "1",
			allowInsecureDevBypass: true,
		});
		expect(rejectResult.status, JSON.stringify(rejectResult)).toBe("accepted");
		expect(await getApprovalStatus(t, rejectApprovalId)).toBe("rejected");

		const unauthorizedApprovalId = await insertApproval(t, {
			threadId: fx.threadId,
			toolCallId: "tool-unauthorized-1",
			description: "Unauthorized user should not approve",
			actionPayload: JSON.stringify({
				type: "updateIssue",
				issueId: fx.issueId,
				updates: { status: "done" },
			}),
		});

		const unauthorizedPayload = buildApprovalCardPayload({
			eventTime: "2026-02-25T22:11:00.000Z",
			spaceName: "spaces/SPACE_1",
			chatUserId: fx.unauthorizedChatUserId,
			actionMethodName: "ai_approval_approve",
			approvalId: unauthorizedApprovalId,
			toolCallId: "tool-unauthorized-1",
			threadId: fx.threadId,
			actionInstanceId: "approve-unauthorized-1",
		});
		const unauthorizedResult = await admin.action(handleWebhookRef, {
			rawBody: unauthorizedPayload,
			devBypassHeader: "1",
			allowInsecureDevBypass: true,
		});
		expect(unauthorizedResult.status).toBe("permission_denied");
		expect(await getApprovalStatus(t, unauthorizedApprovalId)).toBe("pending");
	});
});
