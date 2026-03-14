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

type ConsumeCodeResult = {
	success: boolean;
	message: string;
	workspaceId?: Id<"workspaces">;
	userId?: Id<"users">;
};

const consumeCodeRef = makeFunctionReference<
	"mutation",
	{
		code: string;
		chatUserId: string;
		chatDisplayName?: string;
		chatEmail?: string;
	},
	ConsumeCodeResult
>("chatVerificationCodes:consumeCodePublic");

/** Check if text is a 6-char verification code (uppercase alphanumeric, no ambiguous chars). */
const VERIFICATION_CODE_RE = /^[A-Z2-9]{6}$/;

/**
 * Strip markdown formatting for plain-text Google Chat messages.
 * The bot SDK sends plain text, not HTML cards, so we remove markdown syntax.
 */
function stripMarkdown(md: string): string {
	let result = md;
	// Headings: ### Title → Title
	result = result.replace(/^#{1,6}\s+/gm, "");
	// Bold: **text** or __text__
	result = result.replace(/\*\*(.+?)\*\*/g, "$1");
	result = result.replace(/__(.+?)__/g, "$1");
	// Italic: *text* or _text_
	result = result.replace(/(?<!\w)\*([^*]+?)\*(?!\w)/g, "$1");
	result = result.replace(/(?<!\w)_([^_]+?)_(?!\w)/g, "$1");
	// Strikethrough: ~~text~~
	result = result.replace(/~~(.+?)~~/g, "$1");
	// Inline code: `text`
	result = result.replace(/`([^`]+)`/g, "$1");
	// Links: [text](url) → text
	result = result.replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1");
	// List markers: - item or * item → • item
	result = result.replace(/^[\s]*[-*]\s+/gm, "• ");
	return result;
}

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
 * Extract the best reply text from an action result.
 * Prefers assistantText, falls back to message, then tries to extract
 * text from the chatResponse card payload.
 */
function getReplyText(result: ActionResult): string | null {
	if (result.assistantText?.trim()) return result.assistantText.trim();
	if (result.message?.trim()) return result.message.trim();

	// Try to extract text from Google Chat card response
	if (result.chatResponse) {
		try {
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const card = result.chatResponse as any;
			// Card format: { text, cardsV2: [{ card: { sections: [{ widgets: [{ textParagraph: { text } }] }] } }] }
			if (typeof card.text === "string" && card.text.trim()) {
				return card.text.trim();
			}
			const firstWidget = card.cardsV2?.[0]?.card?.sections?.[0]?.widgets?.[0];
			if (firstWidget?.textParagraph?.text) {
				return firstWidget.textParagraph.text.trim();
			}
		} catch {
			// Ignore card parsing errors
		}
	}

	return null;
}

// ---------------------------------------------------------------------------
// Shared handler logic
// ---------------------------------------------------------------------------

/**
 * Process a mention or follow-up message from Google Chat.
 * Used by both onNewMention and onSubscribedMessage handlers.
 */
async function handleMessage(
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	thread: any,
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	message: any,
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	sent: any,
) {
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
	const messageText = (message.text ?? "").trim();
	const trimmedUpper = messageText.toUpperCase();

	// ── Verification code intercept ──────────────────────────────
	if (
		(thread.isDM ?? false) &&
		VERIFICATION_CODE_RE.test(trimmedUpper) &&
		chatUserId
	) {
		try {
			const consumeResult = await convex.mutation(consumeCodeRef, {
				code: trimmedUpper,
				chatUserId,
			});
			if (consumeResult.success) {
				await sent.edit(
					"Your Google Chat identity has been linked to your Clave account. You can now use @Clave.",
				);
				return;
			}
			// Code didn't match — fall through to normal handling
		} catch {
			// consumeCode failed — fall through
		}
	}

	// ── AI mention handling ──────────────────────────────────────
	try {
		console.log("[chat-sdk] Calling handleMention", {
			workspaceId,
			chatUserId,
			prompt: messageText.slice(0, 100),
			isDM: thread.isDM ?? false,
		});

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

		const replyText = getReplyText(result);

		console.log("[chat-sdk] Action result", {
			status: result.status,
			hasAssistantText: !!result.assistantText,
			hasMessage: !!result.message,
			hasChatResponse: !!result.chatResponse,
			replyPreview: replyText?.slice(0, 100),
		});

		if (replyText) {
			await sent.edit(stripMarkdown(replyText));
		} else {
			await sent.edit("Processed your request.");
		}

		if (result.threadId) {
			await thread.setState({ aiThreadId: result.threadId });
		}
	} catch (error) {
		console.error("[chat-sdk] handleMention error", error);
		const errorMessage =
			error instanceof Error
				? error.message
				: "An error occurred while processing your request.";
		await sent.edit(errorMessage);
	}
}

// ---------------------------------------------------------------------------
// onNewMention — bot @-mentioned in an unsubscribed thread or DM
// ---------------------------------------------------------------------------

const bot = getBot();

bot.onNewMention(async (thread, message) => {
	thread.subscribe().catch(() => {});
	const sent = await thread.post("_Thinking..._");
	await handleMessage(thread, message, sent);
});

// ---------------------------------------------------------------------------
// onSubscribedMessage — follow-up in a thread we're subscribed to
// ---------------------------------------------------------------------------

bot.onSubscribedMessage(async (thread, message) => {
	if (message.author?.isMe) return;
	const sent = await thread.post("_Thinking..._");
	await handleMessage(thread, message, sent);
});

// ---------------------------------------------------------------------------
// onAction — card button clicks
// ---------------------------------------------------------------------------

// Issue actions: assign_to_me, set_status_non_destructive, open_issue_link
bot.onAction(
	["assign_to_me", "set_status_non_destructive", "open_issue_link"],
	async (event) => {
		const convex = getConvexClient();
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

		const replyText = getReplyText(result);
		if (replyText) {
			await event.thread.post(replyText);
		}
	},
);

// Approval actions: ai_approval_approve, ai_approval_reject
bot.onAction(["ai_approval_approve", "ai_approval_reject"], async (event) => {
	const convex = getConvexClient();
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

	const replyText = getReplyText(result);
	if (replyText) {
		await event.thread.post(replyText);
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

		const replyText = getReplyText(result);
		if (replyText) {
			await event.thread.post(replyText);
		}
	},
);
