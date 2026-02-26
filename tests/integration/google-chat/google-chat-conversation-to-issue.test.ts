/// <reference types="vite/client" />

import { makeFunctionReference } from "convex/server";
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import type { Id } from "../../../convex/_generated/dataModel";
import schema from "../../../convex/schema";

const modules = import.meta.glob("../../../convex/**/*.*s");

process.env.GOOGLE_CHAT_DISABLE_EMBEDDED_ACTIONS = "1";

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

type Fixture = {
	adminId: Id<"users">;
	memberId: Id<"users">;
	workspaceId: Id<"workspaces">;
	linkedChatUserId: string;
	seedIssueId: Id<"issues">;
};

async function seedFixture(
	t: ReturnType<typeof createBackend>,
): Promise<Fixture> {
	return t.run(async (ctx) => {
		const ownerId = await ctx.db.insert("users", { name: "Owner" });
		const adminId = await ctx.db.insert("users", { name: "Admin" });
		const memberId = await ctx.db.insert("users", { name: "Member" });

		const organizationId = await ctx.db.insert("organizations", {
			name: "Triage Org",
			slug: "triage-org",
			ownerId,
		});

		for (const [userId, role] of [
			[ownerId, "owner"],
			[adminId, "admin"],
			[memberId, "member"],
		] as const) {
			await ctx.db.insert("organizationMembers", {
				organizationId,
				userId,
				role,
				joinedAt: Date.now(),
			});
		}

		const workspaceId = await ctx.db.insert("workspaces", {
			name: "Triage Workspace",
			slug: "triage-workspace",
			ownerId: adminId,
			organizationId,
		});

		for (const [userId, role] of [
			[adminId, "admin"],
			[memberId, "member"],
		] as const) {
			await ctx.db.insert("workspaceMembers", {
				workspaceId,
				userId,
				role,
				joinedAt: Date.now(),
			});
		}

		await ctx.db.insert("workspaceSettings", {
			workspaceId,
			storyPrefix: "ST",
			nextStoryNumber: 1,
			issuePrefix: "GC",
			nextIssueNumber: 200,
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

		await ctx.db.insert("chatSubscriptions", {
			workspaceId,
			provider: "google-chat",
			targetType: "space",
			targetId: "spaces/SPACE_1",
			eventType: "all",
			enabled: true,
			createdBy: adminId,
			createdAt: Date.now(),
			updatedAt: Date.now(),
		});

		const linkedChatUserId = "users/triage-member-chat";
		await ctx.db.insert("chatUserLinks", {
			workspaceId,
			provider: "google-chat",
			chatUserId: linkedChatUserId,
			userId: memberId,
			linkedBy: adminId,
			linkedAt: Date.now(),
			updatedAt: Date.now(),
		});

		const seedIssueId = await ctx.db.insert("issues", {
			workspaceId,
			identifier: "GC-199",
			title: "Retry Google Chat webhook failures",
			description: "Seed duplicate candidate",
			status: "todo",
			priority: "high",
			type: "bug",
			sortOrder: 1,
			createdBy: adminId,
			assigneeId: memberId,
		});

		return {
			adminId,
			memberId,
			workspaceId,
			linkedChatUserId,
			seedIssueId,
		};
	});
}

function buildCardClickPayload(args: {
	eventTime: string;
	spaceName: string;
	threadName?: string;
	chatUserId: string;
	actionMethodName:
		| "triage_conversation_to_issue"
		| "confirm_triage_issue_create"
		| "cancel_triage_issue_create";
	actionInstanceId: string;
	parameters?: Array<{ key: string; value: string }>;
	formInputs?: Record<string, unknown>;
}) {
	return JSON.stringify({
		type: "CARD_CLICKED",
		eventTime: args.eventTime,
		space: { name: args.spaceName },
		thread: args.threadName ? { name: args.threadName } : undefined,
		user: { name: args.chatUserId },
		message: {
			name: "spaces/SPACE_1/messages/MSG_1",
			sender: { type: "HUMAN" },
		},
		common: args.formInputs ? { formInputs: args.formInputs } : undefined,
		action: {
			actionMethodName: args.actionMethodName,
			parameters: [
				...(args.parameters ?? []),
				{ key: "action_instance_id", value: args.actionInstanceId },
			],
		},
	});
}

async function countWorkspaceIssues(
	t: ReturnType<typeof createBackend>,
	workspaceId: Id<"workspaces">,
) {
	return await t.run(async (ctx) => {
		return (
			await ctx.db
				.query("issues")
				.withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
				.collect()
		).length;
	});
}

async function findIssueByIdentifier(
	t: ReturnType<typeof createBackend>,
	workspaceId: Id<"workspaces">,
	identifier: string,
) {
	return await t.run(async (ctx) => {
		return await ctx.db
			.query("issues")
			.withIndex("by_identifier", (q) =>
				q.eq("workspaceId", workspaceId).eq("identifier", identifier),
			)
			.unique();
	});
}

describe("google chat conversation-to-issue triage (integration)", () => {
	it("returns a triage draft card with duplicate hints and explicit actions", async () => {
		const t = createBackend();
		const fx = await seedFixture(t);
		const admin = t.withIdentity({ subject: fx.adminId });

		const triagePayload = buildCardClickPayload({
			eventTime: "2026-02-25T23:00:00.000Z",
			spaceName: "spaces/SPACE_1",
			threadName: "spaces/SPACE_1/threads/THREAD_1",
			chatUserId: fx.linkedChatUserId,
			actionMethodName: "triage_conversation_to_issue",
			actionInstanceId: "triage-1",
			parameters: [
				{ key: "conversation_key", value: "spaces/SPACE_1::THREAD_1" },
				{ key: "source_space_name", value: "spaces/SPACE_1" },
				{ key: "source_thread_name", value: "THREAD_1" },
				{
					key: "latest_prompt",
					value: "create issue for Retry Google Chat webhook failures",
				},
				{
					key: "assistant_reply",
					value: "I can draft this with triage metadata and duplicate hints.",
				},
			],
		});

		const result = await admin.action(handleWebhookRef, {
			rawBody: triagePayload,
			devBypassHeader: "1",
			allowInsecureDevBypass: true,
		});
		expect(result.status, JSON.stringify(result)).toBe("accepted");

		const chatResponse = result.chatResponse as Record<string, unknown>;
		expect(chatResponse.actionResponse).toBeDefined();
		const cards = chatResponse.cardsV2 as Array<Record<string, unknown>>;
		expect(Array.isArray(cards)).toBe(true);
		expect(cards[0]?.cardId).toBe("clave-triage-issue-draft");

		const firstCard = cards[0]?.card as Record<string, unknown>;
		const sections = firstCard?.sections as Array<Record<string, unknown>>;
		const cardText = JSON.stringify(sections);
		expect(cardText).toContain("Possible duplicates");
		expect(cardText).toContain("GC-199");
		expect(cardText).toContain("confirm_triage_issue_create");
		expect(cardText).toContain("cancel_triage_issue_create");
	});

	it("requires explicit confirmation, then creates an issue from confirmed draft", async () => {
		const t = createBackend();
		const fx = await seedFixture(t);
		const admin = t.withIdentity({ subject: fx.adminId });

		const baseParameters = [
			{ key: "conversation_key", value: "spaces/SPACE_1::THREAD_2" },
			{ key: "triage_priority", value: "high" },
			{ key: "triage_type", value: "bug" },
			{ key: "triage_labels", value: "backend,reliability" },
			{ key: "source_space_name", value: "spaces/SPACE_1" },
			{ key: "source_thread_name", value: "THREAD_2" },
			{ key: "draft_title", value: "Retry Google Chat webhook failures" },
			{
				key: "draft_description",
				value:
					"Retries fail with duplicate cards under transient transport errors.",
			},
		];

		const unconfirmedPayload = buildCardClickPayload({
			eventTime: "2026-02-25T23:10:00.000Z",
			spaceName: "spaces/SPACE_1",
			chatUserId: fx.linkedChatUserId,
			actionMethodName: "confirm_triage_issue_create",
			actionInstanceId: "confirm-missing-flag",
			parameters: baseParameters,
			formInputs: {
				triage_issue_title: {
					stringInputs: { value: ["Retry Google Chat webhook failures"] },
				},
				triage_issue_description: {
					stringInputs: {
						value: [
							"Retries fail with duplicate cards under transient transport errors.",
						],
					},
				},
			},
		});

		const unconfirmedResult = await admin.action(handleWebhookRef, {
			rawBody: unconfirmedPayload,
			devBypassHeader: "1",
			allowInsecureDevBypass: true,
		});
		expect(unconfirmedResult.status).toBe("invalid_payload");
		expect(unconfirmedResult.message).toContain("explicit confirmation");

		const confirmedPayload = buildCardClickPayload({
			eventTime: "2026-02-25T23:11:00.000Z",
			spaceName: "spaces/SPACE_1",
			chatUserId: fx.linkedChatUserId,
			actionMethodName: "confirm_triage_issue_create",
			actionInstanceId: "confirm-true",
			parameters: [...baseParameters, { key: "confirm_create", value: "true" }],
			formInputs: {
				triage_issue_title: {
					stringInputs: { value: ["Retry Google Chat webhook failures"] },
				},
				triage_issue_description: {
					stringInputs: {
						value: [
							"Retries fail with duplicate cards under transient transport errors.",
						],
					},
				},
			},
		});

		const confirmedResult = await admin.action(handleWebhookRef, {
			rawBody: confirmedPayload,
			devBypassHeader: "1",
			allowInsecureDevBypass: true,
		});
		expect(confirmedResult.status, JSON.stringify(confirmedResult)).toBe(
			"accepted",
		);
		expect(confirmedResult.message).toContain("GC-200");

		const createdIssue = await findIssueByIdentifier(
			t,
			fx.workspaceId,
			"GC-200",
		);
		expect(createdIssue).not.toBeNull();
		expect(createdIssue?.status).toBe("triage");
		expect(createdIssue?.priority).toBe("high");
		expect(createdIssue?.type).toBe("bug");
		expect(createdIssue?.tags).toContain("source:google-chat");
		expect(createdIssue?.description).toContain(
			"_Created from Google Chat conversation._",
		);
		expect(createdIssue?.description).toContain("spaces/SPACE_1::THREAD_2");
	});

	it("cancels triage creation without creating a new issue", async () => {
		const t = createBackend();
		const fx = await seedFixture(t);
		const admin = t.withIdentity({ subject: fx.adminId });

		const beforeCount = await countWorkspaceIssues(t, fx.workspaceId);

		const cancelPayload = buildCardClickPayload({
			eventTime: "2026-02-25T23:20:00.000Z",
			spaceName: "spaces/SPACE_1",
			chatUserId: fx.linkedChatUserId,
			actionMethodName: "cancel_triage_issue_create",
			actionInstanceId: "cancel-1",
			parameters: [
				{ key: "conversation_key", value: "spaces/SPACE_1::THREAD_3" },
			],
		});

		const cancelResult = await admin.action(handleWebhookRef, {
			rawBody: cancelPayload,
			devBypassHeader: "1",
			allowInsecureDevBypass: true,
		});
		expect(cancelResult.status).toBe("accepted");
		expect(cancelResult.message).toContain("No issue was created");

		const afterCount = await countWorkspaceIssues(t, fx.workspaceId);
		expect(afterCount).toBe(beforeCount);
	});
});
