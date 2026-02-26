import { ConvexHttpClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";
import type { Id } from "../../../convex/_generated/dataModel";
import { getBot } from "./bot";

// ---------------------------------------------------------------------------
// Convex client — used to call Convex queries/actions from Next.js handlers
// ---------------------------------------------------------------------------

function getConvexClient(): ConvexHttpClient {
	const url = process.env.NEXT_PUBLIC_CONVEX_URL;
	if (!url) {
		throw new Error("NEXT_PUBLIC_CONVEX_URL is required for Chat SDK handlers");
	}
	return new ConvexHttpClient(url);
}

// ---------------------------------------------------------------------------
// Function references for Convex queries/actions
// ---------------------------------------------------------------------------

const resolveWorkspaceForWebhookRef = makeFunctionReference<
	"query",
	{ provider: "google-chat"; spaceName?: string },
	Id<"workspaces"> | null
>("chatIntegrations:resolveWorkspaceForWebhook");

type ActionResult = {
	status: string;
	message?: string;
	assistantText?: string;
	threadId?: string;
	chatResponse?: Record<string, unknown>;
};

const handleMentionRef = makeFunctionReference<
	"action",
	{
		workspaceId: Id<"workspaces">;
		chatUserId: string;
		prompt: string;
		spaceName: string;
		conversationKey: string;
		threadName?: string;
		messageName?: string;
		isDirectMessage: boolean;
		eventTime?: number;
	},
	ActionResult
>("chat/googleChatWebhook:handleMention");

const handleIssueActionRef = makeFunctionReference<
	"action",
	{
		workspaceId: Id<"workspaces">;
		chatUserId: string;
		payload: unknown;
		eventId: string;
	},
	ActionResult
>("chat/googleChatWebhook:handleIssueAction");

const handleApprovalActionRef = makeFunctionReference<
	"action",
	{
		workspaceId: Id<"workspaces">;
		chatUserId: string;
		payload: unknown;
		eventId: string;
	},
	ActionResult
>("chat/googleChatWebhook:handleApprovalAction");

const handleTriageActionRef = makeFunctionReference<
	"action",
	{
		workspaceId: Id<"workspaces">;
		chatUserId: string;
		spaceName?: string;
		threadName?: string;
		payload: unknown;
		eventId: string;
	},
	ActionResult
>("chat/googleChatWebhook:handleTriageAction");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Resolve workspace ID from an SDK thread's channel ID (Google Chat space name). */
async function resolveWorkspace(
	convex: ConvexHttpClient,
	channelId: string,
): Promise<Id<"workspaces"> | null> {
	const spaceName = channelId.startsWith("gchat:")
		? channelId.split(":")[1]
		: channelId;
	return convex.query(resolveWorkspaceForWebhookRef, {
		provider: "google-chat",
		spaceName: spaceName || undefined,
	});
}

/** Build a conversation key from space + thread identifiers. */
function buildConversationKey(
	spaceName: string,
	threadId: string | undefined,
): string {
	return `${spaceName}::${threadId ?? "space-root"}`;
}

/** Extract the Google Chat space name from an SDK channel ID. */
function extractSpaceName(channelId: string): string {
	if (channelId.startsWith("gchat:")) {
		return channelId.split(":")[1] ?? channelId;
	}
	return channelId;
}

/**
 * Post a raw Google Chat card JSON via the SDK thread.
 * The gchat adapter handles raw platform payloads but the SDK types
 * don't express this — cast through unknown to satisfy TypeScript.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function postRawCard(
	poster: { post: (msg: any) => Promise<any> },
	card: Record<string, unknown>,
) {
	return poster.post(card);
}

/**
 * Parse action value from SDK event. The SDK provides event.value as a string.
 * New cards encode parameters as JSON in value. Legacy cards use the raw payload's
 * action.parameters array — fall back to event.raw for those.
 */
function _parseActionValue(value: string | undefined): Record<string, string> {
	if (!value) return {};
	try {
		const parsed = JSON.parse(value);
		if (
			typeof parsed === "object" &&
			parsed !== null &&
			!Array.isArray(parsed)
		) {
			const result: Record<string, string> = {};
			for (const [k, v] of Object.entries(parsed)) {
				if (typeof v === "string") result[k] = v;
			}
			return result;
		}
	} catch {
		// Not JSON — treat as simple string value
	}
	return { value };
}

// ---------------------------------------------------------------------------
// onNewMention — bot @-mentioned in an unsubscribed thread or DM
// ---------------------------------------------------------------------------

const bot = getBot();

bot.onNewMention(async (thread, message) => {
	await thread.subscribe();
	const sent = await thread.post("_Thinking..._");

	const convex = getConvexClient();
	const spaceName = extractSpaceName(thread.channelId);
	const workspaceId = await resolveWorkspace(convex, thread.channelId);

	if (!workspaceId) {
		await sent.edit(
			"I couldn't identify your workspace. Ask a workspace admin to connect this space to Clave.",
		);
		return;
	}

	const conversationKey = buildConversationKey(
		spaceName,
		thread.id.split(":")[2],
	);
	const chatUserId = message.author?.userId ?? "";

	try {
		const result = await convex.action(handleMentionRef, {
			workspaceId,
			chatUserId,
			prompt: message.text ?? "",
			spaceName,
			conversationKey,
			threadName: thread.id.split(":")[2],
			isDirectMessage: thread.isDM ?? false,
			eventTime: message.metadata?.dateSent
				? new Date(message.metadata.dateSent).getTime()
				: undefined,
		});

		if (result.assistantText) {
			await sent.edit(result.assistantText);
		} else if (result.message) {
			await sent.edit(result.message);
		}

		if (result.chatResponse) {
			await postRawCard(thread, result.chatResponse);
		}

		if (result.threadId) {
			await thread.setState({ aiThreadId: result.threadId });
		}
	} catch (error) {
		const errorMessage =
			error instanceof Error
				? error.message
				: "An error occurred while processing your request.";
		await sent.edit(errorMessage);
	}
});

// ---------------------------------------------------------------------------
// onSubscribedMessage — follow-up in a thread we're subscribed to
// ---------------------------------------------------------------------------

bot.onSubscribedMessage(async (thread, message) => {
	if (message.author?.isMe) return;

	const sent = await thread.post("_Thinking..._");

	const convex = getConvexClient();
	const spaceName = extractSpaceName(thread.channelId);
	const workspaceId = await resolveWorkspace(convex, thread.channelId);

	if (!workspaceId) {
		await sent.edit("I couldn't identify your workspace.");
		return;
	}

	const _threadState = await thread.state;
	const conversationKey = buildConversationKey(
		spaceName,
		thread.id.split(":")[2],
	);
	const chatUserId = message.author?.userId ?? "";

	try {
		const result = await convex.action(handleMentionRef, {
			workspaceId,
			chatUserId,
			prompt: message.text ?? "",
			spaceName,
			conversationKey,
			threadName: thread.id.split(":")[2],
			isDirectMessage: thread.isDM ?? false,
			eventTime: message.metadata?.dateSent
				? new Date(message.metadata.dateSent).getTime()
				: undefined,
		});

		if (result.assistantText) {
			await sent.edit(result.assistantText);
		} else if (result.message) {
			await sent.edit(result.message);
		}

		if (result.chatResponse) {
			await postRawCard(thread, result.chatResponse);
		}

		if (result.threadId) {
			await thread.setState({ aiThreadId: result.threadId });
		}
	} catch (error) {
		const errorMessage =
			error instanceof Error ? error.message : "An error occurred.";
		await sent.edit(errorMessage);
	}
});

// ---------------------------------------------------------------------------
// onAction — card button clicks
// ---------------------------------------------------------------------------

// Issue actions: assign_to_me, set_status_non_destructive, open_issue_link
bot.onAction(
	["assign_to_me", "set_status_non_destructive", "open_issue_link"],
	async (event) => {
		const convex = getConvexClient();
		const _spaceName = extractSpaceName(event.thread.channelId);
		const workspaceId = await resolveWorkspace(convex, event.thread.channelId);

		if (!workspaceId) {
			await event.thread.post(
				"This space is not connected to a Clave workspace.",
			);
			return;
		}

		const result = await convex.action(handleIssueActionRef, {
			workspaceId,
			chatUserId: event.user?.userId ?? "",
			payload: event.raw ?? {},
			eventId: event.messageId ?? `action-${Date.now()}`,
		});

		if (result.chatResponse) {
			await postRawCard(event.thread, result.chatResponse);
		}
	},
);

// Approval actions: ai_approval_approve, ai_approval_reject
bot.onAction(["ai_approval_approve", "ai_approval_reject"], async (event) => {
	const convex = getConvexClient();
	const _spaceName = extractSpaceName(event.thread.channelId);
	const workspaceId = await resolveWorkspace(convex, event.thread.channelId);

	if (!workspaceId) {
		await event.thread.post(
			"This space is not connected to a Clave workspace.",
		);
		return;
	}

	const result = await convex.action(handleApprovalActionRef, {
		workspaceId,
		chatUserId: event.user?.userId ?? "",
		payload: event.raw ?? {},
		eventId: event.messageId ?? `action-${Date.now()}`,
	});

	if (result.chatResponse) {
		await postRawCard(event.thread, result.chatResponse);
	}
});

// Triage actions: triage_conversation_to_issue, confirm_triage_issue_create, cancel_triage_issue_create
bot.onAction(
	[
		"triage_conversation_to_issue",
		"confirm_triage_issue_create",
		"cancel_triage_issue_create",
	],
	async (event) => {
		const convex = getConvexClient();
		const spaceName = extractSpaceName(event.thread.channelId);
		const workspaceId = await resolveWorkspace(convex, event.thread.channelId);

		if (!workspaceId) {
			await event.thread.post(
				"This space is not connected to a Clave workspace.",
			);
			return;
		}

		const result = await convex.action(handleTriageActionRef, {
			workspaceId,
			chatUserId: event.user?.userId ?? "",
			spaceName,
			threadName: event.thread.id.split(":")[2],
			payload: event.raw ?? {},
			eventId: event.messageId ?? `action-${Date.now()}`,
		});

		if (result.chatResponse) {
			await postRawCard(event.thread, result.chatResponse);
		}
	},
);
