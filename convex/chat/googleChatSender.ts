"use node";

import { makeFunctionReference } from "convex/server";
import { v } from "convex/values";
import { google } from "googleapis";
import type { Id } from "../_generated/dataModel";
import { action, internalAction } from "../_generated/server";
import { decryptChatCredentials } from "./chatCryptoUtils";

// ---------------------------------------------------------------------------
// Google Chat API client via googleapis
// ---------------------------------------------------------------------------

function getChatClient(credentialsJson?: string) {
	const raw = credentialsJson ?? process.env.GOOGLE_CHAT_CREDENTIALS;
	if (!raw) {
		throw new Error("GOOGLE_CHAT_CREDENTIALS is required for relay delivery");
	}
	const credentials = JSON.parse(raw) as {
		client_email?: string;
		private_key?: string;
	};
	if (!credentials.client_email || !credentials.private_key) {
		throw new Error("Credentials must include client_email and private_key");
	}

	const auth = new google.auth.JWT(
		credentials.client_email,
		undefined,
		credentials.private_key.replaceAll("\\n", "\n"),
		["https://www.googleapis.com/auth/chat.bot"],
	);
	return google.chat({ version: "v1", auth });
}

function normalizeSpaceName(targetId: string): string {
	if (targetId.startsWith("spaces/")) return targetId;
	return `spaces/${targetId}`;
}

async function resolveDmSpace(
	chatClient: ReturnType<typeof getChatClient>,
	targetId: string,
): Promise<string> {
	if (targetId.startsWith("spaces/")) return targetId;
	if (!targetId.startsWith("users/")) {
		throw new Error("DM target must be users/{id} or spaces/{id}");
	}
	const response = await chatClient.spaces.findDirectMessage({
		name: targetId,
	});
	const spaceName = response.data.name;
	if (!spaceName) {
		throw new Error(`No direct message space found for ${targetId}`);
	}
	return spaceName;
}

// ---------------------------------------------------------------------------
// Reference to prepareNotificationCard in googleChatCards.ts
// ---------------------------------------------------------------------------

const getConnectionCredentialsRef = makeFunctionReference<
	"query",
	{
		workspaceId: Id<"workspaces">;
		provider: "google-chat";
	},
	{
		credentialSource: "marketplace" | "byosa" | "global";
		encryptedCredentials?: string;
	} | null
>("chatIntegrations:getConnectionCredentials");

const prepareNotificationCardRef = makeFunctionReference<
	"query",
	{
		notificationId: Id<"notifications">;
		workspaceId: Id<"workspaces">;
	},
	{
		status: "ready" | "drop";
		reason?: string;
		messageJson?: string;
	}
>("chat/googleChatCards:prepareNotificationCard");

// ---------------------------------------------------------------------------
// Shared credential resolution helper
// ---------------------------------------------------------------------------

async function resolveWorkspaceCredentials(
	ctx: {
		runQuery: (
			ref: typeof getConnectionCredentialsRef,
			args: { workspaceId: Id<"workspaces">; provider: "google-chat" },
		) => Promise<{
			credentialSource: "marketplace" | "byosa" | "global";
			encryptedCredentials?: string;
		} | null>;
	},
	workspaceId: Id<"workspaces">,
): Promise<string | undefined> {
	try {
		const creds = await ctx.runQuery(getConnectionCredentialsRef, {
			workspaceId,
			provider: "google-chat",
		});
		if (creds?.credentialSource === "byosa" && creds.encryptedCredentials) {
			return await decryptChatCredentials(creds.encryptedCredentials);
		}
	} catch {
		// Fall through to global credentials
	}
	return undefined;
}

// ---------------------------------------------------------------------------
// postMessage — create a new message in a space (public, called from Next.js)
// ---------------------------------------------------------------------------

export const postMessage = action({
	args: {
		workspaceId: v.id("workspaces"),
		spaceName: v.string(),
		text: v.string(),
	},
	returns: v.object({
		status: v.union(v.literal("sent"), v.literal("failed")),
		messageName: v.optional(v.string()),
		reason: v.optional(v.string()),
	}),
	handler: async (ctx, args) => {
		const credentialsJson = await resolveWorkspaceCredentials(
			ctx,
			args.workspaceId,
		);

		let chatClient: ReturnType<typeof getChatClient>;
		try {
			chatClient = getChatClient(credentialsJson);
		} catch (error) {
			return {
				status: "failed" as const,
				reason: error instanceof Error ? error.message : "Auth failed",
			};
		}

		try {
			const response = await chatClient.spaces.messages.create({
				parent: args.spaceName,
				requestBody: { text: args.text },
			});
			return {
				status: "sent" as const,
				messageName: response.data.name ?? undefined,
			};
		} catch (error) {
			return {
				status: "failed" as const,
				reason:
					error instanceof Error ? error.message : "Failed to post message",
			};
		}
	},
});

// ---------------------------------------------------------------------------
// updateMessage — edit an existing message (public, called from Next.js)
// ---------------------------------------------------------------------------

export const updateMessage = action({
	args: {
		workspaceId: v.id("workspaces"),
		messageName: v.string(),
		text: v.string(),
	},
	returns: v.object({
		status: v.union(v.literal("sent"), v.literal("failed")),
		reason: v.optional(v.string()),
	}),
	handler: async (ctx, args) => {
		const credentialsJson = await resolveWorkspaceCredentials(
			ctx,
			args.workspaceId,
		);

		let chatClient: ReturnType<typeof getChatClient>;
		try {
			chatClient = getChatClient(credentialsJson);
		} catch (error) {
			return {
				status: "failed" as const,
				reason: error instanceof Error ? error.message : "Auth failed",
			};
		}

		try {
			await chatClient.spaces.messages.update({
				name: args.messageName,
				updateMask: "text",
				requestBody: { text: args.text },
			});
			return { status: "sent" as const };
		} catch (error) {
			return {
				status: "failed" as const,
				reason:
					error instanceof Error ? error.message : "Failed to update message",
			};
		}
	},
});

// ---------------------------------------------------------------------------
// sendRelayMessage — simplified sender called directly by chatRelay
// ---------------------------------------------------------------------------

export const sendRelayMessage = internalAction({
	args: {
		notificationId: v.id("notifications"),
		workspaceId: v.id("workspaces"),
		targetType: v.union(v.literal("dm"), v.literal("space")),
		targetId: v.string(),
	},
	returns: v.object({
		status: v.union(
			v.literal("sent"),
			v.literal("failed"),
			v.literal("dropped"),
		),
		reason: v.optional(v.string()),
	}),
	handler: async (ctx, args) => {
		const prepared = await ctx.runQuery(prepareNotificationCardRef, {
			notificationId: args.notificationId,
			workspaceId: args.workspaceId,
		});

		if (prepared.status === "drop") {
			return {
				status: "dropped" as const,
				reason: prepared.reason ?? "Card preparation dropped",
			};
		}

		if (!prepared.messageJson) {
			return {
				status: "dropped" as const,
				reason: "No message content produced",
			};
		}

		const cardMessage = JSON.parse(prepared.messageJson) as Record<
			string,
			unknown
		>;

		// Resolve per-workspace credentials, falling back to global env var
		const credentialsJson = await resolveWorkspaceCredentials(
			ctx,
			args.workspaceId,
		);

		let chatClient: ReturnType<typeof getChatClient>;
		try {
			chatClient = getChatClient(credentialsJson);
		} catch (error) {
			return {
				status: "failed" as const,
				reason: error instanceof Error ? error.message : "Auth failed",
			};
		}

		let spaceName: string;
		try {
			spaceName =
				args.targetType === "dm"
					? await resolveDmSpace(chatClient, args.targetId)
					: normalizeSpaceName(args.targetId);
		} catch (error) {
			const reason =
				error instanceof Error ? error.message : "Failed to resolve target";
			return { status: "dropped" as const, reason };
		}

		try {
			await chatClient.spaces.messages.create({
				parent: spaceName,
				requestBody: cardMessage,
			});
			return { status: "sent" as const };
		} catch (error) {
			return {
				status: "failed" as const,
				reason:
					error instanceof Error ? error.message : "Failed to send message",
			};
		}
	},
});
