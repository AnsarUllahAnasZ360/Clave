"use node";

import type { ModelMessage } from "ai";
import { makeFunctionReference } from "convex/server";
import { ConvexError, v } from "convex/values";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { internalAction } from "../_generated/server";
import { getClaveAgent } from "../ai/agents";
import {
	buildMentionContextBlock,
	type MentionReferenceData,
	resolveMentions,
} from "../ai/mentionResolver";
import { resolveChatModel } from "../ai/providers";

const getExternalChatActorContextRef = makeFunctionReference<
	"query",
	{ workspaceId: Id<"workspaces">; userId: Id<"users"> },
	{
		workspaceName: string;
		userName: string;
		aiWorkspaceContext?: string;
		aiAssistantCharacteristics?: string;
	} | null
>("ai/chatQueries:getExternalChatActorContext");

const insertThreadMetadataRef = makeFunctionReference<
	"mutation",
	{
		workspaceId: Id<"workspaces">;
		userId: Id<"users">;
		threadId: string;
		model?: string;
	},
	Id<"aiThreads">
>("ai/threads:insertThreadMetadata");

const getThreadMetadataRef = makeFunctionReference<
	"query",
	{ threadId: string },
	{
		_id: Id<"aiThreads">;
		workspaceId: Id<"workspaces">;
		userId: Id<"users">;
		threadId: string;
	} | null
>("ai/threads:getThreadMetadata");

const touchThreadRef = makeFunctionReference<
	"mutation",
	{ threadId: string },
	null
>("ai/threads:touchThread");

const listPendingApprovalsForThreadRef = makeFunctionReference<
	"query",
	{ threadId: string },
	Array<{
		_id: Id<"aiToolApprovals">;
		toolCallId: string;
		toolName: string;
		description: string;
		status: "pending";
		createdAt: number;
	}>
>("ai/approval:listPendingApprovalsForThread");

export const dispatchMention = internalAction({
	args: {
		workspaceId: v.id("workspaces"),
		actorUserId: v.id("users"),
		prompt: v.string(),
		threadId: v.optional(v.string()),
		mentions: v.optional(
			v.array(
				v.object({
					entityType: v.union(
						v.literal("user"),
						v.literal("issue"),
						v.literal("document"),
					),
					entityId: v.string(),
					displayName: v.string(),
				}),
			),
		),
	},
	returns: v.object({
		threadId: v.string(),
		assistantText: v.string(),
		resolvedModelId: v.string(),
		pendingApprovals: v.array(
			v.object({
				approvalId: v.id("aiToolApprovals"),
				toolCallId: v.string(),
				toolName: v.string(),
				description: v.string(),
			}),
		),
	}),
	handler: async (ctx, args) => {
		const actorContext = await ctx.runQuery(getExternalChatActorContextRef, {
			workspaceId: args.workspaceId,
			userId: args.actorUserId,
		});
		if (!actorContext) {
			throw new ConvexError(
				"Google Chat actor is not a member of the target workspace",
			);
		}

		// Optional override: Kimi K2.5 can return empty in some contexts; use GPT-5.2 instead
		const googleChatModelId =
			process.env.GOOGLE_CHAT_MODEL?.trim() || undefined;
		const { resolvedModelId, model } = resolveChatModel(googleChatModelId);

		let resolvedThreadId = args.threadId ?? "";
		if (resolvedThreadId) {
			const metadata = await ctx.runQuery(getThreadMetadataRef, {
				threadId: resolvedThreadId,
			});
			if (!metadata) {
				throw new ConvexError("Mapped AI thread not found");
			}
			if (metadata.workspaceId !== args.workspaceId) {
				throw new ConvexError("Mapped AI thread belongs to another workspace");
			}
			if (metadata.userId !== args.actorUserId) {
				throw new ConvexError(
					"Mapped AI thread owner does not match Google Chat actor",
				);
			}
		} else {
			const created = await getClaveAgent().createThread(ctx, {
				userId: args.actorUserId,
			});
			resolvedThreadId = created.threadId;
			await ctx.runMutation(insertThreadMetadataRef, {
				workspaceId: args.workspaceId,
				userId: args.actorUserId,
				threadId: resolvedThreadId,
				model: resolvedModelId,
			});
		}

		const promptMessages: ModelMessage[] = [
			{
				role: "user",
				content: args.prompt,
			},
		];
		const savedPrompt = await getClaveAgent().saveMessages(ctx, {
			threadId: resolvedThreadId,
			userId: args.actorUserId,
			messages: promptMessages,
		});
		const promptMessageId =
			savedPrompt.messages[savedPrompt.messages.length - 1]?._id;
		if (!promptMessageId) {
			throw new ConvexError(
				"Failed to persist Google Chat prompt before AI generation",
			);
		}

		const baseSystemPrompt =
			typeof getClaveAgent().options.instructions === "string"
				? getClaveAgent().options.instructions
				: "";
		let contextSuffix = `\n\nWorkspace: ${actorContext.workspaceName}\nUser: ${actorContext.userName}`;
		if (actorContext.aiWorkspaceContext?.trim()) {
			contextSuffix += `\n\nWorkspace context:\n${actorContext.aiWorkspaceContext.trim()}`;
		}
		if (actorContext.aiAssistantCharacteristics?.trim()) {
			contextSuffix += `\n\nAssistant characteristics:\n${actorContext.aiAssistantCharacteristics.trim()}`;
		}
		if (args.mentions && args.mentions.length > 0) {
			const resolvedMentions = await resolveMentions(
				ctx,
				args.workspaceId,
				args.mentions as MentionReferenceData[],
			);
			const mentionBlock = buildMentionContextBlock(resolvedMentions);
			if (mentionBlock) {
				contextSuffix += mentionBlock;
			}
		}

		const result = await getClaveAgent().streamText(
			ctx,
			{ threadId: resolvedThreadId, userId: args.actorUserId },
			{
				promptMessageId,
				system: baseSystemPrompt + contextSuffix,
				model,
				maxOutputTokens: 16384,
			},
			{
				saveStreamDeltas: {
					chunking: "word",
					throttleMs: 40,
				},
				contextOptions: {
					recentMessages: 20,
				},
			},
		);
		await result.consumeStream();

		await ctx.runMutation(touchThreadRef, {
			threadId: resolvedThreadId,
		});

		// Try result.text, result.reasoningText (Kimi K2.5 etc.), result.response, then DB
		let assistantText = "Processed your request.";
		try {
			const txt = await result.text;
			if (txt?.trim()) assistantText = txt.trim();
		} catch {
			// fall through
		}
		if (assistantText === "Processed your request.") {
			try {
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				const r = result as any;
				const reasoningText = await r?.reasoningText;
				if (typeof reasoningText === "string" && reasoningText.trim()) {
					assistantText = reasoningText.trim();
				}
			} catch {
				// fall through
			}
		}
		if (assistantText === "Processed your request.") {
			try {
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				const resp = await (result as any).response;
				const lastMsg = resp?.messages
					?.filter((m: { role: string }) => m.role === "assistant")
					?.pop();
				if (lastMsg) {
					const content = lastMsg.content;
					if (typeof content === "string" && content.trim()) {
						assistantText = content.trim();
					} else if (Array.isArray(content)) {
						const text = content
							.filter(
								(p: { type?: string }) =>
									p.type === "text" || p.type === "reasoning",
							)
							.map((p: { text?: string }) => p.text ?? "")
							.join("\n");
						if (text.trim()) assistantText = text.trim();
					}
				}
			} catch {
				// fall through
			}
		}
		if (assistantText === "Processed your request.") {
			const fromDb = await ctx.runQuery(
				internal.ai.threads.getLastAssistantMessageText,
				{ threadId: resolvedThreadId },
			);
			if (fromDb?.trim()) assistantText = fromDb.trim();
		}

		const pendingApprovals = await ctx.runQuery(
			listPendingApprovalsForThreadRef,
			{
				threadId: resolvedThreadId,
			},
		);

		return {
			threadId: resolvedThreadId,
			assistantText,
			resolvedModelId,
			pendingApprovals: pendingApprovals.map((approval) => ({
				approvalId: approval._id,
				toolCallId: approval.toolCallId,
				toolName: approval.toolName,
				description: approval.description,
			})),
		};
	},
});
