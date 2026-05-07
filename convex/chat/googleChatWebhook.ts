"use node";

import { createHash } from "node:crypto";
import { makeFunctionReference } from "convex/server";
import { v } from "convex/values";
// biome-ignore lint/suspicious/noTsIgnore: resolved by Convex bundler at deploy time
// @ts-ignore — resolved by Convex bundler at deploy time
import { buildGoogleChatIssueActionCard } from "../../src/lib/chat/google-chat/action-card-builders";
// biome-ignore lint/suspicious/noTsIgnore: resolved by Convex bundler at deploy time
// @ts-ignore — resolved by Convex bundler at deploy time
import {
	buildGoogleChatApprovalActionCard,
	buildGoogleChatApprovalRequestCard,
	buildGoogleChatAssistantTextCard,
	buildGoogleChatIssueTriageDraftCard,
	buildGoogleChatIssueTriageResultCard,
} from "../../src/lib/chat/google-chat/assistant-card-builders";
// biome-ignore lint/suspicious/noTsIgnore: resolved by Convex bundler at deploy time
// @ts-ignore — resolved by Convex bundler at deploy time
import {
	buildConversationTraceNote,
	buildFallbackIssueDraftFromTranscript,
	type ConversationTranscriptEntry,
	formatConversationTranscript,
	isExplicitCreateConfirmation,
	normalizeDuplicateHints,
	normalizeIssueTriageMetadata,
	parseLooseJsonObject,
	rankDuplicateCandidates,
} from "../../src/lib/chat/google-chat/conversation-triage";
// biome-ignore lint/suspicious/noTsIgnore: resolved by Convex bundler at deploy time
// @ts-ignore — resolved by Convex bundler at deploy time
import {
	isAllowedGoogleChatAction,
	isMutatingGoogleChatAction,
	type ParsedGoogleChatActionEvent,
	type ParsedGoogleChatApprovalActionEvent,
	type ParsedGoogleChatTriageActionEvent,
	parseGoogleChatActionEvent,
	parseGoogleChatApprovalActionEvent,
	parseGoogleChatTriageActionEvent,
} from "../../src/lib/chat/google-chat/interaction-contract";
import type { Id } from "../_generated/dataModel";
import { type ActionCtx, action } from "../_generated/server";
import { resolveChatAppBaseUrl } from "./appUrl";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ActionResult = {
	status: string;
	message?: string;
	assistantText?: string;
	threadId?: string;
	chatResponse?: Record<string, unknown>;
};

type GoogleChatIssueContext = {
	issueId: Id<"issues">;
	workspaceId: Id<"workspaces">;
	workspaceSlug: string;

	identifier: string;
	title: string;
	status: string;
	assigneeId?: Id<"users">;
	assigneeName?: string;
};

// ---------------------------------------------------------------------------
// Function references
// ---------------------------------------------------------------------------

const resolveWorkspaceForWebhookRef = makeFunctionReference<
	"query",
	{ provider: "google-chat"; spaceName?: string; chatUserId?: string },
	Id<"workspaces"> | null
>("chatIntegrations:resolveWorkspaceForWebhook");

const getPolicyForWebhookRef = makeFunctionReference<
	"query",
	{ workspaceId: Id<"workspaces">; provider: "google-chat" },
	{
		enabled: boolean;
		allowDirectMessages: boolean;
		allowSpaces: boolean;
		requireIdentityLink: boolean;
		allowedIssueActionIds: string[];
		requireActionConfirmation: boolean;
	}
>("chatIntegrations:getPolicyForWebhook");

const getConversationForWebhookRef = makeFunctionReference<
	"query",
	{
		workspaceId: Id<"workspaces">;
		provider: "google-chat";
		conversationKey: string;
	},
	{
		aiThreadId: string;
		conversationKey: string;
		spaceName: string;
		chatThreadName?: string;
		chatMessageName?: string;
		chatUserId?: string;
		lastMessageAt?: number;
	} | null
>("chatIntegrations:getConversationForWebhook");

const upsertConversationForWebhookRef = makeFunctionReference<
	"mutation",
	{
		workspaceId: Id<"workspaces">;
		provider: "google-chat";
		spaceName: string;
		conversationKey: string;
		aiThreadId: string;
		chatThreadName?: string;
		chatMessageName?: string;
		chatUserId?: string;
		eventTime?: number;
	},
	Id<"chatConversations">
>("chatIntegrations:upsertConversationForWebhook");

const resolveLinkedUserForWebhookRef = makeFunctionReference<
	"query",
	{
		workspaceId: Id<"workspaces">;
		provider?: "google-chat";
		chatUserId: string;
	},
	Id<"users"> | null
>("chatIdentityLinks:resolveLinkedUserForWebhook");

const consumeVerificationCodeRef = makeFunctionReference<
	"mutation",
	{
		code: string;
		chatUserId: string;
		chatDisplayName?: string;
		chatEmail?: string;
	},
	{
		success: boolean;
		message: string;
		workspaceId?: Id<"workspaces">;
		userId?: Id<"users">;
	}
>("chatVerificationCodes:consumeCode");

const resolveIssueIdByIdentifierInternalRef = makeFunctionReference<
	"query",
	{ workspaceId: Id<"workspaces">; identifier: string },
	Id<"issues"> | null
>("issues:resolveIssueIdByIdentifierInternal");

const getGoogleChatIssueContextInternalRef = makeFunctionReference<
	"query",
	{ issueId: Id<"issues"> },
	GoogleChatIssueContext | null
>("issues:getGoogleChatIssueContextInternal");

const assignToUserFromIntegrationRef = makeFunctionReference<
	"mutation",
	{
		issueId: Id<"issues">;
		actorUserId: Id<"users">;
		assigneeId: Id<"users">;
	},
	{
		issueId: Id<"issues">;
		workspaceId: Id<"workspaces">;
		identifier: string;
		title: string;
		status: string;
		assigneeId?: Id<"users">;
	}
>("issues:assignToUserFromIntegration");

const updateStatusFromIntegrationRef = makeFunctionReference<
	"mutation",
	{
		issueId: Id<"issues">;
		actorUserId: Id<"users">;
		status: "triage" | "backlog" | "todo" | "in_progress" | "in_review";
	},
	{
		issueId: Id<"issues">;
		workspaceId: Id<"workspaces">;
		identifier: string;
		title: string;
		status: string;
		assigneeId?: Id<"users">;
	}
>("issues:updateStatusFromIntegration");

const searchForGoogleChatDuplicatesRef = makeFunctionReference<
	"query",
	{
		workspaceId: Id<"workspaces">;
		actorUserId: Id<"users">;
		searchTerm: string;
		limit?: number;
	},
	Array<{
		issueId: Id<"issues">;
		identifier: string;
		title: string;
		status: string;
		priority: string;
		projectId?: Id<"projects">;
	}>
>("issues:searchForGoogleChatDuplicates");

const createFromGoogleChatIntegrationRef = makeFunctionReference<
	"mutation",
	{
		workspaceId: Id<"workspaces">;
		actorUserId: Id<"users">;
		title: string;
		description?: string;
		status?:
			| "triage"
			| "backlog"
			| "todo"
			| "in_progress"
			| "in_review"
			| "done"
			| "cancelled";
		priority?: "urgent" | "high" | "medium" | "low" | "no_priority";
		type?: "issue" | "bug" | "improvement" | "feature";
		labelNames?: string[];
		tags?: string[];
	},
	{
		issueId: Id<"issues">;
		identifier: string;
	}
>("issues:createFromGoogleChatIntegration");

const embeddedActionRef = makeFunctionReference<
	"action",
	{
		type:
			| "issue_auto_triage"
			| "issue_detect_duplicates"
			| "issue_draft_description";
		context: {
			workspaceId: Id<"workspaces">;
			projectId?: Id<"projects">;
			issueId?: Id<"issues">;
			documentId?: Id<"documents">;
			whiteboardId?: Id<"whiteboards">;
		};
		prompt?: string;
		selectedText?: string;
	},
	{
		type: string;
		text: string;
		data?: unknown;
		error?: string;
	}
>("ai/embedded:embeddedAction");

const dispatchMentionRef = makeFunctionReference<
	"action",
	{
		workspaceId: Id<"workspaces">;
		actorUserId: Id<"users">;
		prompt: string;
		threadId?: string;
		mentions?: Array<{
			entityType: "user" | "issue" | "document";
			entityId: string;
			displayName: string;
		}>;
	},
	{
		threadId: string;
		assistantText: string;
		resolvedModelId: string;
		pendingApprovals: Array<{
			approvalId: Id<"aiToolApprovals">;
			toolCallId: string;
			toolName: string;
			description: string;
		}>;
	}
>("chat/googleChatAssistant:dispatchMention");

const approveActionForGoogleChatRef = makeFunctionReference<
	"mutation",
	{
		approvalId: Id<"aiToolApprovals">;
		actorUserId: Id<"users">;
		expectedToolCallId: string;
	},
	{
		status: "approved" | "duplicate";
		message: string;
		toolName: string;
		description: string;
	}
>("ai/approval:approveActionForGoogleChat");

const rejectActionForGoogleChatRef = makeFunctionReference<
	"mutation",
	{
		approvalId: Id<"aiToolApprovals">;
		actorUserId: Id<"users">;
		expectedToolCallId: string;
		reason?: string;
	},
	{
		status: "rejected" | "duplicate";
		message: string;
		toolName: string;
		description: string;
	}
>("ai/approval:rejectActionForGoogleChat");

const recordActionAuditRef = makeFunctionReference<
	"mutation",
	{
		workspaceId: Id<"workspaces">;
		provider: "google-chat";
		eventId: string;
		idempotencyKey: string;
		actionType: string;
		actionKind: "issue" | "triage" | "approval" | "unknown";
		actorUserId?: Id<"users">;
		chatUserId?: string;
		entityType?: string;
		entityId?: string;
		result:
			| "accepted"
			| "duplicate"
			| "invalid_auth"
			| "invalid_payload"
			| "unsupported_action"
			| "permission_denied"
			| "error";
		message?: string;
		metadata?: string;
	},
	null
>("chatDeliveryLogs:recordActionAudit");

const checkIdempotencyRef = makeFunctionReference<
	"query",
	{ workspaceId: Id<"workspaces">; idempotencyKey: string },
	boolean
>("chatDeliveryLogs:checkIdempotency");

// ---------------------------------------------------------------------------
// Helper functions
// ---------------------------------------------------------------------------

function buildIssueDeepLink(issueContext: GoogleChatIssueContext): string {
	const path = `/${issueContext.workspaceSlug}/issues/${issueContext.identifier}`;

	const appBaseUrl = resolveChatAppBaseUrl();
	if (!appBaseUrl) return path;
	return `${appBaseUrl}${path}`;
}

function isPermissionDeniedMessage(message: string): boolean {
	const normalized = message.toLowerCase();
	return (
		normalized.includes("not a workspace member") ||
		normalized.includes("don't have access") ||
		normalized.includes("permission") ||
		normalized.includes("identity link") ||
		normalized.includes("denied")
	);
}

function clampMessageText(text: string, maxLength = 1900): string {
	const trimmed = text.trim();
	if (trimmed.length <= maxLength) return trimmed;
	return `${trimmed.slice(0, maxLength - 1)}…`;
}

function buildActionCardResult(args: {
	status: string;
	responseType: "UPDATE_MESSAGE" | "UPDATE_USER_MESSAGE_CARDS";
	title: string;
	message: string;
	issueContext?: GoogleChatIssueContext | null;
}): ActionResult {
	return {
		status: args.status,
		message: args.message,
		chatResponse: buildGoogleChatIssueActionCard({
			responseType: args.responseType,
			resultType:
				args.status === "permission_denied"
					? "permission_denied"
					: args.status === "accepted"
						? "success"
						: "failure",
			title: args.title,
			message: args.message,
			issueIdentifier: args.issueContext?.identifier,
			issueTitle: args.issueContext?.title,
			issueStatus: args.issueContext?.status,
			assigneeName: args.issueContext?.assigneeName,
			deepLinkUrl: args.issueContext
				? buildIssueDeepLink(args.issueContext)
				: undefined,
		}),
	};
}

function buildAssistantCardResult(args: {
	status: string;
	title: string;
	subtitle?: string;
	message: string;
}): ActionResult {
	return {
		status: args.status,
		message: args.message,
		chatResponse: buildGoogleChatAssistantTextCard({
			title: args.title,
			subtitle: args.subtitle,
			message: args.message,
		}),
	};
}

function buildApprovalActionCardResult(args: {
	status: string;
	responseType: "UPDATE_MESSAGE" | "UPDATE_USER_MESSAGE_CARDS";
	title: string;
	message: string;
	toolName?: string;
	description?: string;
}): ActionResult {
	const cardStatus =
		args.status === "accepted"
			? "success"
			: args.status === "permission_denied"
				? "permission_denied"
				: args.status === "duplicate"
					? "duplicate"
					: "failure";
	return {
		status: args.status,
		message: args.message,
		chatResponse: buildGoogleChatApprovalActionCard({
			responseType: args.responseType,
			title: args.title,
			message: args.message,
			status: cardStatus,
			toolName: args.toolName,
			approvalDescription: args.description,
		}),
	};
}

function buildIssueTriageCardResult(args: {
	status: string;
	responseType: "UPDATE_MESSAGE" | "UPDATE_USER_MESSAGE_CARDS";
	title: string;
	message: string;
	issueContext?: GoogleChatIssueContext | null;
}): ActionResult {
	return {
		status: args.status,
		message: args.message,
		chatResponse: buildGoogleChatIssueTriageResultCard({
			responseType: args.responseType,
			title: args.title,
			message: args.message,
			status:
				args.status === "accepted"
					? "success"
					: args.status === "permission_denied"
						? "permission_denied"
						: args.status === "duplicate"
							? "cancelled"
							: "failure",
			issueIdentifier: args.issueContext?.identifier,
			issueTitle: args.issueContext?.title,
			deepLinkUrl: args.issueContext
				? buildIssueDeepLink(args.issueContext)
				: undefined,
		}),
	};
}

async function resolveIssueContextForAction(
	ctx: ActionCtx,
	args: {
		workspaceId: Id<"workspaces">;
		actionEvent: ParsedGoogleChatActionEvent;
	},
): Promise<GoogleChatIssueContext | null> {
	let issueId = args.actionEvent.issueId as Id<"issues"> | undefined;
	if (!issueId && args.actionEvent.issueIdentifier) {
		issueId =
			(await ctx.runQuery(resolveIssueIdByIdentifierInternalRef, {
				workspaceId: args.workspaceId,
				identifier: args.actionEvent.issueIdentifier,
			})) ?? undefined;
	}
	if (!issueId) {
		return null;
	}

	return await ctx.runQuery(getGoogleChatIssueContextInternalRef, { issueId });
}

async function resolveLinkedUser(args: {
	ctx: ActionCtx;
	workspaceId: Id<"workspaces">;
	chatUserId: string | null;
}) {
	if (!args.chatUserId) return null;
	return await args.ctx.runQuery(resolveLinkedUserForWebhookRef, {
		workspaceId: args.workspaceId,
		provider: "google-chat",
		chatUserId: args.chatUserId,
	});
}

function getParameterValue(
	parameters: Record<string, string>,
	keys: string[],
): string | null {
	for (const key of keys) {
		const value = parameters[key];
		if (!value) continue;
		const trimmed = value.trim();
		if (trimmed.length > 0) return trimmed;
	}
	return null;
}

function buildConversationTranscriptFromAction(
	actionEvent: ParsedGoogleChatTriageActionEvent,
): ConversationTranscriptEntry[] {
	const entries: ConversationTranscriptEntry[] = [];
	const latestPrompt = getParameterValue(actionEvent.parameters, [
		"latest_prompt",
		"latestPrompt",
	]);
	if (latestPrompt) {
		entries.push({ role: "user", text: latestPrompt });
	}
	const assistantReply = getParameterValue(actionEvent.parameters, [
		"assistant_reply",
		"assistantReply",
	]);
	if (assistantReply) {
		entries.push({ role: "assistant", text: assistantReply });
	}
	return entries;
}

async function runEmbeddedIssueAction(args: {
	ctx: ActionCtx;
	type:
		| "issue_auto_triage"
		| "issue_detect_duplicates"
		| "issue_draft_description";
	workspaceId: Id<"workspaces">;
	prompt: string;
	projectId?: Id<"projects">;
}) {
	if (
		process.env.GOOGLE_CHAT_DISABLE_EMBEDDED_ACTIONS === "1" ||
		process.env.VITEST === "true" ||
		process.env.NODE_ENV === "test"
	) {
		return null;
	}

	try {
		const result = await args.ctx.runAction(embeddedActionRef, {
			type: args.type,
			context: {
				workspaceId: args.workspaceId,
				projectId: args.projectId,
			},
			prompt: args.prompt,
		});
		if (result.error) {
			return null;
		}
		return result;
	} catch {
		return null;
	}
}

// ---------------------------------------------------------------------------
// Business logic — issue actions
// ---------------------------------------------------------------------------

async function dispatchInteractiveIssueAction(args: {
	ctx: ActionCtx;
	workspaceId: Id<"workspaces">;
	chatUserId: string | null;
	actionEvent: ParsedGoogleChatActionEvent;
}): Promise<ActionResult> {
	const responseType = args.actionEvent.actionResponseType;

	const policy = await args.ctx.runQuery(getPolicyForWebhookRef, {
		workspaceId: args.workspaceId,
		provider: "google-chat",
	});

	if (!policy.enabled) {
		return buildActionCardResult({
			status: "permission_denied",
			responseType,
			title: "Google Chat action blocked",
			message: "Google Chat actions are currently disabled for this workspace.",
		});
	}

	if (
		!isAllowedGoogleChatAction(
			args.actionEvent.actionId,
			policy.allowedIssueActionIds,
		)
	) {
		return buildActionCardResult({
			status: "permission_denied",
			responseType,
			title: "Action not allowed",
			message: `Action "${args.actionEvent.actionMethodName}" is not allowlisted for this workspace.`,
		});
	}

	if (
		policy.requireActionConfirmation &&
		isMutatingGoogleChatAction(args.actionEvent.actionId)
	) {
		const issueContext = await resolveIssueContextForAction(args.ctx, {
			workspaceId: args.workspaceId,
			actionEvent: args.actionEvent,
		});
		return buildActionCardResult({
			status: "permission_denied",
			responseType,
			title: "Confirmation required",
			message:
				"Workspace policy requires confirming this action in Clave before changing issue state.",
			issueContext,
		});
	}

	const linkedUserId = await resolveLinkedUser({
		ctx: args.ctx,
		workspaceId: args.workspaceId,
		chatUserId: args.chatUserId,
	});

	if (policy.requireIdentityLink && !linkedUserId) {
		const issueContext = await resolveIssueContextForAction(args.ctx, {
			workspaceId: args.workspaceId,
			actionEvent: args.actionEvent,
		});
		return buildActionCardResult({
			status: "permission_denied",
			responseType,
			title: "Identity link required",
			message:
				"Link your Google Chat identity to your Clave account before using issue actions.",
			issueContext,
		});
	}

	let issueContext = await resolveIssueContextForAction(args.ctx, {
		workspaceId: args.workspaceId,
		actionEvent: args.actionEvent,
	});
	if (!issueContext) {
		return buildActionCardResult({
			status: "invalid_payload",
			responseType,
			title: "Invalid action payload",
			message:
				"Missing issue reference. Include `issue_id` or `issue_identifier` in action parameters.",
		});
	}

	try {
		if (args.actionEvent.actionId === "assign_to_me") {
			if (!linkedUserId) {
				return buildActionCardResult({
					status: "permission_denied",
					responseType,
					title: "Assignment blocked",
					message:
						"Unable to resolve your Clave identity for this workspace. Ask an admin to link your account.",
					issueContext,
				});
			}

			await args.ctx.runMutation(assignToUserFromIntegrationRef, {
				issueId: issueContext.issueId,
				actorUserId: linkedUserId,
				assigneeId: linkedUserId,
			});
			issueContext = await args.ctx.runQuery(
				getGoogleChatIssueContextInternalRef,
				{ issueId: issueContext.issueId },
			);
			return {
				status: "accepted",
				message: "Issue assigned to you.",
				chatResponse: buildGoogleChatIssueActionCard({
					responseType,
					resultType: "success",
					title: "Issue assigned",
					message: "Issue assigned to you.",
					issueIdentifier: issueContext?.identifier,
					issueTitle: issueContext?.title,
					issueStatus: issueContext?.status,
					assigneeName: issueContext?.assigneeName,
					deepLinkUrl: issueContext
						? buildIssueDeepLink(issueContext)
						: undefined,
				}),
			};
		}

		if (args.actionEvent.actionId === "set_status_non_destructive") {
			if (!linkedUserId) {
				return buildActionCardResult({
					status: "permission_denied",
					responseType,
					title: "Status update blocked",
					message:
						"Unable to resolve your Clave identity for this workspace. Ask an admin to link your account.",
					issueContext,
				});
			}
			if (!args.actionEvent.requestedStatus) {
				return buildActionCardResult({
					status: "invalid_payload",
					responseType,
					title: "Invalid action payload",
					message:
						"Missing supported `status` parameter for `set_status_non_destructive`.",
					issueContext,
				});
			}

			await args.ctx.runMutation(updateStatusFromIntegrationRef, {
				issueId: issueContext.issueId,
				actorUserId: linkedUserId,
				status: args.actionEvent.requestedStatus,
			});
			issueContext = await args.ctx.runQuery(
				getGoogleChatIssueContextInternalRef,
				{ issueId: issueContext.issueId },
			);
			return {
				status: "accepted",
				message: `Status set to ${args.actionEvent.requestedStatus.replaceAll("_", " ")}.`,
				chatResponse: buildGoogleChatIssueActionCard({
					responseType,
					resultType: "success",
					title: "Issue status updated",
					message: `Status set to ${args.actionEvent.requestedStatus.replaceAll("_", " ")}.`,
					issueIdentifier: issueContext?.identifier,
					issueTitle: issueContext?.title,
					issueStatus: issueContext?.status,
					assigneeName: issueContext?.assigneeName,
					deepLinkUrl: issueContext
						? buildIssueDeepLink(issueContext)
						: undefined,
				}),
			};
		}

		return {
			status: "accepted",
			message: "Open this issue in Clave.",
			chatResponse: buildGoogleChatIssueActionCard({
				responseType,
				resultType: "success",
				title: "Open in Clave",
				message: "Open this issue in Clave.",
				issueIdentifier: issueContext.identifier,
				issueTitle: issueContext.title,
				issueStatus: issueContext.status,
				assigneeName: issueContext.assigneeName,
				deepLinkUrl: buildIssueDeepLink(issueContext),
			}),
		};
	} catch (error) {
		const message =
			error instanceof Error ? error.message : "Failed to execute action";
		return buildActionCardResult({
			status: isPermissionDeniedMessage(message)
				? "permission_denied"
				: "error",
			responseType,
			title: "Action failed",
			message,
			issueContext,
		});
	}
}

// ---------------------------------------------------------------------------
// Business logic — approval actions
// ---------------------------------------------------------------------------

async function dispatchApprovalAction(args: {
	ctx: ActionCtx;
	workspaceId: Id<"workspaces">;
	chatUserId: string | null;
	actionEvent: ParsedGoogleChatApprovalActionEvent;
}): Promise<ActionResult> {
	const responseType = args.actionEvent.actionResponseType;

	const policy = await args.ctx.runQuery(getPolicyForWebhookRef, {
		workspaceId: args.workspaceId,
		provider: "google-chat",
	});
	if (!policy.enabled) {
		return buildApprovalActionCardResult({
			status: "permission_denied",
			responseType,
			title: "Approval blocked",
			message: "Google Chat actions are currently disabled for this workspace.",
		});
	}

	const linkedUserId = await resolveLinkedUser({
		ctx: args.ctx,
		workspaceId: args.workspaceId,
		chatUserId: args.chatUserId,
	});
	if (!linkedUserId) {
		return buildApprovalActionCardResult({
			status: "permission_denied",
			responseType,
			title: "Identity link required",
			message:
				"Link your Google Chat identity to your Clave account before approving actions.",
		});
	}

	try {
		if (args.actionEvent.actionId === "ai_approval_approve") {
			const outcome = await args.ctx.runMutation(
				approveActionForGoogleChatRef,
				{
					approvalId: args.actionEvent.approvalId as Id<"aiToolApprovals">,
					actorUserId: linkedUserId,
					expectedToolCallId: args.actionEvent.toolCallId,
				},
			);
			return buildApprovalActionCardResult({
				status: outcome.status === "duplicate" ? "duplicate" : "accepted",
				responseType,
				title:
					outcome.status === "duplicate"
						? "Already processed"
						: "Action approved",
				message: outcome.message,
				toolName: outcome.toolName,
				description: outcome.description,
			});
		}

		const outcome = await args.ctx.runMutation(rejectActionForGoogleChatRef, {
			approvalId: args.actionEvent.approvalId as Id<"aiToolApprovals">,
			actorUserId: linkedUserId,
			expectedToolCallId: args.actionEvent.toolCallId,
		});
		return buildApprovalActionCardResult({
			status: outcome.status === "duplicate" ? "duplicate" : "accepted",
			responseType,
			title:
				outcome.status === "duplicate"
					? "Already processed"
					: "Action rejected",
			message: outcome.message,
			toolName: outcome.toolName,
			description: outcome.description,
		});
	} catch (error) {
		const message =
			error instanceof Error
				? error.message
				: "Failed to process approval action";
		return buildApprovalActionCardResult({
			status: isPermissionDeniedMessage(message)
				? "permission_denied"
				: "error",
			responseType,
			title: "Approval action failed",
			message,
		});
	}
}

// ---------------------------------------------------------------------------
// Business logic — conversation triage
// ---------------------------------------------------------------------------

async function dispatchConversationTriageAction(args: {
	ctx: ActionCtx;
	workspaceId: Id<"workspaces">;
	chatUserId: string | null;
	spaceName: string | null;
	threadName: string | null;
	actionEvent: ParsedGoogleChatTriageActionEvent;
}): Promise<ActionResult> {
	const responseType = args.actionEvent.actionResponseType;

	const policy = await args.ctx.runQuery(getPolicyForWebhookRef, {
		workspaceId: args.workspaceId,
		provider: "google-chat",
	});
	if (!policy.enabled) {
		return buildIssueTriageCardResult({
			status: "permission_denied",
			responseType,
			title: "Issue triage blocked",
			message: "Google Chat actions are currently disabled for this workspace.",
		});
	}

	const linkedUserId = await resolveLinkedUser({
		ctx: args.ctx,
		workspaceId: args.workspaceId,
		chatUserId: args.chatUserId,
	});
	if (policy.requireIdentityLink && !linkedUserId) {
		return buildIssueTriageCardResult({
			status: "permission_denied",
			responseType,
			title: "Identity link required",
			message:
				"Link your Google Chat identity to your Clave account before creating issues from conversation triage.",
		});
	}
	if (!linkedUserId) {
		return buildIssueTriageCardResult({
			status: "permission_denied",
			responseType,
			title: "Unable to identify actor",
			message:
				"Could not resolve this Google Chat actor to a workspace member.",
		});
	}

	const conversationKey =
		args.actionEvent.conversationKey ??
		(args.spaceName
			? `${args.spaceName}::${args.threadName ?? "space-root"}`
			: null);
	if (!conversationKey) {
		return buildIssueTriageCardResult({
			status: "invalid_payload",
			responseType,
			title: "Invalid triage payload",
			message: "Missing conversation key for issue triage.",
		});
	}

	if (args.actionEvent.actionId === "cancel_triage_issue_create") {
		return buildIssueTriageCardResult({
			status: "accepted",
			responseType,
			title: "Issue creation cancelled",
			message: "No issue was created from this conversation.",
		});
	}

	if (args.actionEvent.actionId === "confirm_triage_issue_create") {
		const isConfirmed =
			args.actionEvent.confirmCreate ||
			isExplicitCreateConfirmation(args.actionEvent.parameters.confirm_create);
		if (!isConfirmed) {
			return buildIssueTriageCardResult({
				status: "invalid_payload",
				responseType,
				title: "Confirmation required",
				message: "Issue creation requires explicit confirmation.",
			});
		}

		const draftTitle = args.actionEvent.draftTitle?.trim() ?? "";
		if (!draftTitle) {
			return buildIssueTriageCardResult({
				status: "invalid_payload",
				responseType,
				title: "Missing draft title",
				message:
					"Draft title is empty. Re-run conversation triage and confirm again.",
			});
		}

		const triageMetadata = normalizeIssueTriageMetadata({
			priority: args.actionEvent.triagePriority ?? undefined,
			type: args.actionEvent.triageType ?? undefined,
			labels: args.actionEvent.triageLabels,
		});
		const rawDescription = args.actionEvent.draftDescription?.trim() ?? "";
		const conversationTrace = buildConversationTraceNote({
			conversationKey,
			spaceName:
				args.actionEvent.sourceSpaceName ?? args.spaceName ?? undefined,
			threadName:
				args.actionEvent.sourceThreadName ?? args.threadName ?? undefined,
		});
		const description = rawDescription
			? `${rawDescription}\n\n${conversationTrace}`
			: conversationTrace;

		try {
			const traceDigest = createHash("sha1")
				.update(conversationKey)
				.digest("hex")
				.slice(0, 12);
			const created = await args.ctx.runMutation(
				createFromGoogleChatIntegrationRef,
				{
					workspaceId: args.workspaceId,
					actorUserId: linkedUserId,
					title: draftTitle,
					description,
					status: "triage",
					priority: triageMetadata.priority,
					type: triageMetadata.type,
					labelNames: triageMetadata.labels,
					tags: ["source:google-chat", `conversation:${traceDigest}`],
				},
			);
			const issueContext = await args.ctx.runQuery(
				getGoogleChatIssueContextInternalRef,
				{ issueId: created.issueId },
			);
			return buildIssueTriageCardResult({
				status: "accepted",
				responseType,
				title: "Issue created",
				message: `Created ${created.identifier} from this conversation.`,
				issueContext,
			});
		} catch (error) {
			const message =
				error instanceof Error ? error.message : "Failed to create issue";
			return buildIssueTriageCardResult({
				status: isPermissionDeniedMessage(message)
					? "permission_denied"
					: "error",
				responseType,
				title: "Issue creation failed",
				message,
			});
		}
	}

	const transcriptEntries = buildConversationTranscriptFromAction(
		args.actionEvent,
	);
	const fallbackDraft = buildFallbackIssueDraftFromTranscript(
		transcriptEntries.length > 0
			? transcriptEntries
			: [{ role: "user", text: `Conversation key ${conversationKey}` }],
	);

	let description = fallbackDraft.description;
	const draftDescriptionResult = await runEmbeddedIssueAction({
		ctx: args.ctx,
		type: "issue_draft_description",
		workspaceId: args.workspaceId,
		prompt: fallbackDraft.title,
	});
	if (draftDescriptionResult?.text?.trim()) {
		description = draftDescriptionResult.text.trim();
	}

	const triageResult = await runEmbeddedIssueAction({
		ctx: args.ctx,
		type: "issue_auto_triage",
		workspaceId: args.workspaceId,
		prompt: `${fallbackDraft.title}\n\n${description}`,
	});
	const triageFromData =
		triageResult?.data && typeof triageResult.data === "object"
			? (triageResult.data as Record<string, unknown>)
			: parseLooseJsonObject(triageResult?.text ?? "");
	const triageMetadata = normalizeIssueTriageMetadata(triageFromData);

	const duplicateCandidates = await args.ctx.runQuery(
		searchForGoogleChatDuplicatesRef,
		{
			workspaceId: args.workspaceId,
			actorUserId: linkedUserId,
			searchTerm: fallbackDraft.title,
			limit: 8,
		},
	);

	let duplicateHints = [] as ReturnType<typeof normalizeDuplicateHints>;
	const preferredProjectId =
		duplicateCandidates.find((candidate) => candidate.projectId)?.projectId ??
		undefined;
	const duplicateResult = await runEmbeddedIssueAction({
		ctx: args.ctx,
		type: "issue_detect_duplicates",
		workspaceId: args.workspaceId,
		projectId: preferredProjectId,
		prompt: `${fallbackDraft.title}\n\n${description}`,
	});
	const duplicateData =
		duplicateResult?.data && typeof duplicateResult.data === "object"
			? (duplicateResult.data as Record<string, unknown>)
			: parseLooseJsonObject(duplicateResult?.text ?? "");
	duplicateHints = normalizeDuplicateHints(duplicateData);

	const rankedDuplicates = rankDuplicateCandidates({
		searchTerm: fallbackDraft.title,
		candidates: duplicateCandidates.map((candidate) => ({
			identifier: candidate.identifier,
			title: candidate.title,
			status: candidate.status,
			priority: candidate.priority,
		})),
		aiHints: duplicateHints,
		limit: 3,
	});

	const transcript = formatConversationTranscript(transcriptEntries);
	const reasoningPrefix = triageMetadata.reasoning
		? triageMetadata.reasoning
		: "Triage metadata was generated from the conversation draft.";
	const reasoning = transcript
		? `${reasoningPrefix}\n\nTranscript excerpt:\n${transcript.slice(0, 600)}`
		: reasoningPrefix;

	return {
		status: "accepted",
		message: "Draft issue generated from conversation.",
		chatResponse: buildGoogleChatIssueTriageDraftCard({
			responseType,
			title: fallbackDraft.title,
			description,
			priority: triageMetadata.priority,
			issueType: triageMetadata.type,
			labels: triageMetadata.labels,
			reasoning,
			conversationKey,
			sourceSpaceName:
				args.actionEvent.sourceSpaceName ?? args.spaceName ?? undefined,
			sourceThreadName:
				args.actionEvent.sourceThreadName ?? args.threadName ?? undefined,
			duplicates: rankedDuplicates,
		}),
	};
}

// ---------------------------------------------------------------------------
// Business logic — mention / AI assistant
// ---------------------------------------------------------------------------

async function dispatchMentionInner(args: {
	ctx: ActionCtx;
	workspaceId: Id<"workspaces">;
	chatUserId: string | null;
	prompt: string;
	spaceName: string;
	conversationKey: string;
	threadName?: string;
	messageName?: string;
	isDirectMessage: boolean;
	eventTime?: number;
}): Promise<ActionResult> {
	const policy = await args.ctx.runQuery(getPolicyForWebhookRef, {
		workspaceId: args.workspaceId,
		provider: "google-chat",
	});
	if (!policy.enabled) {
		return buildAssistantCardResult({
			status: "permission_denied",
			title: "Assistant unavailable",
			subtitle: "Action blocked",
			message: "Google Chat assistant flows are disabled for this workspace.",
		});
	}

	if (args.isDirectMessage && !policy.allowDirectMessages) {
		return buildAssistantCardResult({
			status: "permission_denied",
			title: "Direct messages disabled",
			subtitle: "Policy enforcement",
			message:
				"Workspace policy disables Google Chat direct-message assistant interactions.",
		});
	}
	if (!args.isDirectMessage && !policy.allowSpaces) {
		return buildAssistantCardResult({
			status: "permission_denied",
			title: "Space mentions disabled",
			subtitle: "Policy enforcement",
			message:
				"Workspace policy disables Google Chat assistant mentions in spaces.",
		});
	}

	const linkedUserId = await resolveLinkedUser({
		ctx: args.ctx,
		workspaceId: args.workspaceId,
		chatUserId: args.chatUserId,
	});
	if (!linkedUserId && policy.requireIdentityLink) {
		return buildAssistantCardResult({
			status: "permission_denied",
			title: "Identity link required",
			subtitle: "Action blocked",
			message:
				"Link your Google Chat identity to your Clave account before using @Clave assistant actions.",
		});
	}
	if (!linkedUserId) {
		return buildAssistantCardResult({
			status: "permission_denied",
			title: "Unable to identify actor",
			subtitle: "Action blocked",
			message:
				"Google Chat actor could not be resolved to a workspace member for assistant actions.",
		});
	}

	try {
		const existingConversation = await args.ctx.runQuery(
			getConversationForWebhookRef,
			{
				workspaceId: args.workspaceId,
				provider: "google-chat",
				conversationKey: args.conversationKey,
			},
		);
		const assistantResult = await args.ctx.runAction(dispatchMentionRef, {
			workspaceId: args.workspaceId,
			actorUserId: linkedUserId,
			prompt: args.prompt,
			threadId: existingConversation?.aiThreadId,
		});

		await args.ctx.runMutation(upsertConversationForWebhookRef, {
			workspaceId: args.workspaceId,
			provider: "google-chat",
			spaceName: args.spaceName,
			conversationKey: args.conversationKey,
			aiThreadId: assistantResult.threadId,
			chatThreadName: args.threadName,
			chatMessageName: args.messageName,
			chatUserId: args.chatUserId ?? undefined,
			eventTime: args.eventTime,
		});

		const assistantText = clampMessageText(
			assistantResult.assistantText || "Processed your request.",
		);
		const firstPendingApproval = assistantResult.pendingApprovals[0];
		if (firstPendingApproval) {
			return {
				status: "accepted",
				message: assistantText,
				assistantText,
				threadId: assistantResult.threadId,
				chatResponse: buildGoogleChatApprovalRequestCard({
					assistantText,
					approvalId: firstPendingApproval.approvalId,
					toolCallId: firstPendingApproval.toolCallId,
					threadId: assistantResult.threadId,
					approvalDescription: firstPendingApproval.description,
					toolName: firstPendingApproval.toolName,
				}),
			};
		}

		return {
			status: "accepted",
			message: assistantText,
			assistantText,
			threadId: assistantResult.threadId,
			chatResponse: buildGoogleChatAssistantTextCard({
				title: "Clave",
				subtitle: "Assistant response",
				message: assistantText,
				triageAction: {
					conversationKey: args.conversationKey,
					spaceName: args.spaceName,
					threadName: args.threadName,
					latestPrompt: args.prompt,
					assistantReply: assistantText,
				},
			}),
		};
	} catch (error) {
		const message =
			error instanceof Error
				? error.message
				: "Google Chat assistant dispatch failed";
		return buildAssistantCardResult({
			status: isPermissionDeniedMessage(message)
				? "permission_denied"
				: "error",
			title: "Assistant dispatch failed",
			subtitle: "Try again",
			message,
		});
	}
}

// ---------------------------------------------------------------------------
// Action exports — called by SDK handlers in src/lib/chat/handlers.ts
// ---------------------------------------------------------------------------

const actionResultValidator = v.object({
	status: v.string(),
	message: v.optional(v.string()),
	assistantText: v.optional(v.string()),
	threadId: v.optional(v.string()),
	chatResponse: v.optional(v.any()),
});

export const handleMention = action({
	args: {
		workspaceId: v.id("workspaces"),
		chatUserId: v.string(),
		prompt: v.string(),
		spaceName: v.string(),
		conversationKey: v.string(),
		threadName: v.optional(v.string()),
		messageName: v.optional(v.string()),
		isDirectMessage: v.boolean(),
		eventTime: v.optional(v.number()),
	},
	returns: actionResultValidator,
	handler: async (ctx, args) => {
		return dispatchMentionInner({
			ctx,
			workspaceId: args.workspaceId,
			chatUserId: args.chatUserId,
			prompt: args.prompt,
			spaceName: args.spaceName,
			conversationKey: args.conversationKey,
			threadName: args.threadName,
			messageName: args.messageName,
			isDirectMessage: args.isDirectMessage,
			eventTime: args.eventTime,
		});
	},
});

export const handleIssueAction = action({
	args: {
		workspaceId: v.id("workspaces"),
		chatUserId: v.string(),
		payload: v.any(),
		eventId: v.string(),
	},
	returns: actionResultValidator,
	handler: async (ctx, args) => {
		const actionEvent = parseGoogleChatActionEvent({
			payload: args.payload as Record<string, unknown>,
			eventType: "CARD_CLICKED",
			eventId: args.eventId,
		});
		if (!actionEvent) {
			return {
				status: "invalid_payload",
				message: "Could not parse issue action event from payload.",
			};
		}
		return dispatchInteractiveIssueAction({
			ctx,
			workspaceId: args.workspaceId,
			chatUserId: args.chatUserId,
			actionEvent,
		});
	},
});

export const handleApprovalAction = action({
	args: {
		workspaceId: v.id("workspaces"),
		chatUserId: v.string(),
		payload: v.any(),
		eventId: v.string(),
	},
	returns: actionResultValidator,
	handler: async (ctx, args) => {
		const actionEvent = parseGoogleChatApprovalActionEvent({
			payload: args.payload as Record<string, unknown>,
			eventType: "CARD_CLICKED",
			eventId: args.eventId,
		});
		if (!actionEvent) {
			return {
				status: "invalid_payload",
				message: "Could not parse approval action event from payload.",
			};
		}
		return dispatchApprovalAction({
			ctx,
			workspaceId: args.workspaceId,
			chatUserId: args.chatUserId,
			actionEvent,
		});
	},
});

export const handleTriageAction = action({
	args: {
		workspaceId: v.id("workspaces"),
		chatUserId: v.string(),
		spaceName: v.optional(v.string()),
		threadName: v.optional(v.string()),
		payload: v.any(),
		eventId: v.string(),
	},
	returns: actionResultValidator,
	handler: async (ctx, args) => {
		const actionEvent = parseGoogleChatTriageActionEvent({
			payload: args.payload as Record<string, unknown>,
			eventType: "CARD_CLICKED",
			eventId: args.eventId,
		});
		if (!actionEvent) {
			return {
				status: "invalid_payload",
				message: "Could not parse triage action event from payload.",
			};
		}
		return dispatchConversationTriageAction({
			ctx,
			workspaceId: args.workspaceId,
			chatUserId: args.chatUserId,
			spaceName: args.spaceName ?? null,
			threadName: args.threadName ?? null,
			actionEvent,
		});
	},
});

// ---------------------------------------------------------------------------
// Unified webhook entry point
// ---------------------------------------------------------------------------
// All integration tests and the Next.js webhook route delegate through this
// single action.  It parses the raw JSON body, resolves workspace + identity,
// checks policy, and dispatches to the correct inner handler.
// ---------------------------------------------------------------------------

type WebhookStatus =
	| "accepted"
	| "duplicate"
	| "invalid_auth"
	| "invalid_payload"
	| "unsupported_action"
	| "permission_denied"
	| "error";

const VALID_STATUSES = new Set<string>([
	"accepted",
	"duplicate",
	"invalid_auth",
	"invalid_payload",
	"unsupported_action",
	"permission_denied",
	"error",
]);

function toWebhookResult(
	result: ActionResult,
	eventId: string,
	eventType: string,
) {
	const status = VALID_STATUSES.has(result.status)
		? (result.status as WebhookStatus)
		: ("error" as const);
	return {
		status,
		message: result.message,
		chatResponse: result.chatResponse,
		eventId,
		eventType,
	};
}

const APPROVAL_METHODS = new Set(["ai_approval_approve", "ai_approval_reject"]);
const TRIAGE_METHODS = new Set([
	"triage_conversation_to_issue",
	"confirm_triage_issue_create",
	"cancel_triage_issue_create",
]);

export const handleWebhook = action({
	args: {
		rawBody: v.string(),
		authorization: v.optional(v.string()),
		requestId: v.optional(v.string()),
		devBypassHeader: v.optional(v.string()),
		expectedAudience: v.optional(v.string()),
		allowInsecureDevBypass: v.optional(v.boolean()),
		tokenInfoEndpoint: v.optional(v.string()),
	},
	returns: v.object({
		status: v.union(
			v.literal("accepted"),
			v.literal("duplicate"),
			v.literal("invalid_auth"),
			v.literal("invalid_payload"),
			v.literal("unsupported_action"),
			v.literal("permission_denied"),
			v.literal("error"),
		),
		message: v.optional(v.string()),
		eventId: v.optional(v.string()),
		eventType: v.optional(v.string()),
		chatResponse: v.optional(v.any()),
	}),
	handler: async (ctx, args) => {
		// ── Parse raw body ────────────────────────────────────────────────────
		let payload: Record<string, unknown>;
		try {
			payload = JSON.parse(args.rawBody) as Record<string, unknown>;
		} catch {
			return { status: "invalid_payload" as const, message: "Invalid JSON" };
		}

		const eventType = (payload.type as string) ?? "UNKNOWN";
		const space = payload.space as Record<string, unknown> | undefined;
		const spaceName = (space?.name as string) ?? undefined;
		const user = payload.user as Record<string, unknown> | undefined;
		const chatUserId = (user?.name as string) ?? "";
		const eventTime = payload.eventTime as string | undefined;
		const eventId =
			args.requestId ??
			createHash("sha256").update(args.rawBody).digest("hex").slice(0, 32);

		// ── Resolve workspace ─────────────────────────────────────────────────
		const workspaceId = await ctx.runQuery(resolveWorkspaceForWebhookRef, {
			provider: "google-chat",
			spaceName,
			chatUserId: chatUserId || undefined,
		});
		if (!workspaceId) {
			return {
				status: "invalid_payload" as const,
				message: "No workspace connected to this Google Chat space.",
				eventId,
				eventType,
			};
		}

		// ── Resolve policy ────────────────────────────────────────────────────
		const policy = await ctx.runQuery(getPolicyForWebhookRef, {
			workspaceId,
			provider: "google-chat",
		});
		if (!policy?.enabled) {
			return {
				status: "permission_denied" as const,
				message: "Google Chat integration is disabled for this workspace.",
				eventId,
				eventType,
			};
		}

		// ── Resolve linked user ───────────────────────────────────────────────
		const linkedUserId = chatUserId
			? await ctx.runQuery(resolveLinkedUserForWebhookRef, {
					workspaceId,
					provider: "google-chat",
					chatUserId,
				})
			: null;

		if (policy.requireIdentityLink && !linkedUserId) {
			const permMsg =
				"Your Google Chat identity is not linked to a workspace account.";
			const permResult = buildActionCardResult({
				status: "permission_denied",
				responseType: "UPDATE_MESSAGE",
				title: "Identity Not Linked",
				message: permMsg,
			});
			return toWebhookResult(permResult, eventId, eventType);
		}

		// ── Route by event type ───────────────────────────────────────────────
		if (eventType === "CARD_CLICKED") {
			const actionObj = payload.action as Record<string, unknown> | undefined;
			const actionMethodName = (actionObj?.actionMethodName as string) ?? "";

			// Build an idempotency key from the payload parameters
			const rawParams = Array.isArray(actionObj?.parameters)
				? (actionObj.parameters as Array<Record<string, unknown>>)
				: [];
			const paramMap: Record<string, string> = {};
			for (const p of rawParams) {
				const k = typeof p.key === "string" ? p.key : "";
				const val = typeof p.value === "string" ? p.value : "";
				if (k) paramMap[k] = val;
			}
			const actionInstanceId =
				paramMap.action_instance_id ??
				paramMap.actionInstanceId ??
				actionMethodName;
			const issueRef =
				paramMap.issue_id ??
				paramMap.issueId ??
				paramMap.approval_id ??
				paramMap.approvalId ??
				"none";
			const idempotencyKey = [
				eventId,
				actionInstanceId,
				issueRef,
				paramMap.status ?? "no-status",
			].join(":");

			// Check for duplicate processing
			const isDuplicate = await ctx.runQuery(checkIdempotencyRef, {
				workspaceId,
				idempotencyKey,
			});
			if (isDuplicate) {
				return {
					status: "duplicate" as const,
					message: "This action has already been processed.",
					eventId,
					eventType,
					chatResponse: buildActionCardResult({
						status: "duplicate",
						responseType: "UPDATE_MESSAGE",
						title: "Duplicate Action",
						message: "This action has already been processed.",
					}).chatResponse,
				};
			}

			// Approval actions
			if (APPROVAL_METHODS.has(actionMethodName)) {
				const actionEvent = parseGoogleChatApprovalActionEvent({
					payload,
					eventType: "CARD_CLICKED",
					eventId,
				});
				if (!actionEvent) {
					return {
						status: "invalid_payload" as const,
						message: "Could not parse approval action event.",
						eventId,
						eventType,
					};
				}
				const result = await dispatchApprovalAction({
					ctx,
					workspaceId,
					chatUserId,
					actionEvent,
				});
				await ctx.runMutation(recordActionAuditRef, {
					workspaceId,
					provider: "google-chat",
					eventId,
					idempotencyKey,
					actionType: actionMethodName,
					actionKind: "approval",
					chatUserId: chatUserId || undefined,
					actorUserId: linkedUserId ?? undefined,
					result: (result.status === "accepted" || result.status === "duplicate"
						? result.status
						: "error") as "accepted" | "duplicate" | "error",
					message: result.message,
				});
				return toWebhookResult(result, eventId, eventType);
			}

			// Triage actions
			if (TRIAGE_METHODS.has(actionMethodName)) {
				const message = payload.message as Record<string, unknown> | undefined;
				const threadName = (message?.name as string)
					?.split("/messages/")[0]
					?.concat("/threads/main");
				const actionEvent = parseGoogleChatTriageActionEvent({
					payload,
					eventType: "CARD_CLICKED",
					eventId,
				});
				if (!actionEvent) {
					return {
						status: "invalid_payload" as const,
						message: "Could not parse triage action event.",
						eventId,
						eventType,
					};
				}
				const result = await dispatchConversationTriageAction({
					ctx,
					workspaceId,
					chatUserId,
					spaceName: spaceName ?? null,
					threadName: threadName ?? null,
					actionEvent,
				});
				await ctx.runMutation(recordActionAuditRef, {
					workspaceId,
					provider: "google-chat",
					eventId,
					idempotencyKey,
					actionType: actionMethodName,
					actionKind: "triage",
					chatUserId: chatUserId || undefined,
					actorUserId: linkedUserId ?? undefined,
					result: (result.status === "accepted" ? "accepted" : "error") as
						| "accepted"
						| "error",
					message: result.message,
				});
				return toWebhookResult(result, eventId, eventType);
			}

			// Issue actions (default for CARD_CLICKED)
			let actionEvent: ParsedGoogleChatActionEvent | null;
			try {
				actionEvent = parseGoogleChatActionEvent({
					payload,
					eventType: "CARD_CLICKED",
					eventId,
				});
			} catch (err) {
				// parseGoogleChatActionEvent throws for unsupported actions
				const msg = err instanceof Error ? err.message : "Unknown action";
				const message = payload.message as Record<string, unknown> | undefined;
				const sender =
					message && typeof message.sender === "object"
						? (message.sender as Record<string, unknown>)
						: null;
				const responseType =
					sender?.type === "HUMAN"
						? ("UPDATE_USER_MESSAGE_CARDS" as const)
						: ("UPDATE_MESSAGE" as const);
				const unsupportedResult = buildActionCardResult({
					status: "unsupported_action",
					responseType,
					title: "Unsupported Action",
					message: msg,
				});
				return toWebhookResult(unsupportedResult, eventId, eventType);
			}
			if (!actionEvent) {
				return {
					status: "invalid_payload" as const,
					message: "Could not parse issue action event.",
					eventId,
					eventType,
				};
			}
			const result = await dispatchInteractiveIssueAction({
				ctx,
				workspaceId,
				chatUserId,
				actionEvent,
			});
			// Record audit for idempotency
			await ctx.runMutation(recordActionAuditRef, {
				workspaceId,
				provider: "google-chat",
				eventId,
				idempotencyKey,
				actionType: actionMethodName,
				actionKind: "issue",
				chatUserId: chatUserId || undefined,
				actorUserId: linkedUserId ?? undefined,
				result: (result.status === "accepted"
					? "accepted"
					: result.status === "permission_denied"
						? "permission_denied"
						: "error") as "accepted" | "permission_denied" | "error",
				message: result.message,
			});
			return toWebhookResult(result, eventId, eventType);
		}

		if (eventType === "MESSAGE") {
			// Extract mention prompt from message text
			const message = payload.message as Record<string, unknown> | undefined;
			const text =
				(message?.argumentText as string) ?? (message?.text as string) ?? "";
			const threadName = (message?.thread as Record<string, unknown>)?.name as
				| string
				| undefined;
			const messageName = message?.name as string | undefined;
			const isDirectMessage =
				(space?.singleUserBotDm as boolean) ?? (space?.type as string) === "DM";
			const conversationKey =
				spaceName && threadName
					? `${spaceName}::${threadName}`
					: (spaceName ?? `dm::${chatUserId}`);

			// ── Verification code intercept ──────────────────────────────
			// If the text is exactly a 6-char code in a DM, try to consume it
			const trimmedText = text.trim().toUpperCase();
			if (isDirectMessage && /^[A-Z2-9]{6}$/.test(trimmedText) && chatUserId) {
				const senderUser = payload.user as Record<string, unknown> | undefined;
				const senderDisplayName = senderUser?.displayName as string | undefined;
				const senderEmail = senderUser?.email as string | undefined;

				const consumeResult = await ctx.runMutation(
					consumeVerificationCodeRef,
					{
						code: trimmedText,
						chatUserId,
						chatDisplayName: senderDisplayName,
						chatEmail: senderEmail,
					},
				);

				if (consumeResult.success) {
					return {
						status: "accepted" as const,
						message: "Verification code consumed",
						eventId,
						eventType,
						chatResponse: {
							cardsV2: [
								{
									cardId: "identity_linked",
									card: {
										header: {
											title: "Identity linked",
											subtitle:
												"Your Google Chat identity is now linked to your Clave account.",
											imageUrl:
												"https://fonts.gstatic.com/s/i/short-term/release/googlesymbols/check_circle/default/24px.svg",
											imageType: "CIRCLE",
										},
										sections: [
											{
												widgets: [
													{
														decoratedText: {
															topLabel: "Status",
															text: "Successfully linked",
															startIcon: {
																knownIcon: "INVITE",
															},
														},
													},
												],
											},
										],
									},
								},
							],
						},
					};
				}
				// If the code didn't match or was expired, fall through to normal assistant
			}
			// ── End verification code intercept ──────────────────────────

			const result = await dispatchMentionInner({
				ctx,
				workspaceId,
				chatUserId,
				prompt: text.trim(),
				spaceName: spaceName ?? "",
				conversationKey,
				threadName,
				messageName,
				isDirectMessage,
				eventTime: eventTime ? Date.parse(eventTime) : undefined,
			});
			return toWebhookResult(result, eventId, eventType);
		}

		// Unsupported event types
		return {
			status: "invalid_payload" as const,
			message: `Unsupported event type: ${eventType}`,
			eventId,
			eventType,
		};
	},
});
