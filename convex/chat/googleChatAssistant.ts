"use node";

import { listMessages } from "@convex-dev/agent";
import type { ModelMessage } from "ai";
import { makeFunctionReference } from "convex/server";
import { ConvexError, v } from "convex/values";
import { components } from "../_generated/api";
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

function extractMessageText(message: {
	text?: string;
	tool?: boolean;
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	message?: Record<string, any>;
}): string | null {
	// Prefer the convenience `text` field from @convex-dev/agent
	if (message.text?.trim()) return message.text.trim();
	const content = message.message?.content;
	if (typeof content === "string" && content.trim().length > 0) {
		return content.trim();
	}
	// Handle AI SDK array content format: [{type: "text", text: "..."}, ...]
	if (Array.isArray(content)) {
		const textParts = content
			.filter(
				(part: { type?: string; text?: string }) =>
					part.type === "text" && typeof part.text === "string",
			)
			.map((part: { text: string }) => part.text)
			.join("");
		if (textParts.trim().length > 0) return textParts.trim();
	}
	return null;
}

function getLatestAssistantMessage(
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	messages: Array<{
		text?: string;
		tool?: boolean;
		message?: Record<string, any>;
	}>,
) {
	// listMessages returns newest-first, so iterate from the start.
	// Skip tool-call messages (tool: true) — we want the text response.
	for (const entry of messages) {
		if (entry.message?.role === "assistant" && !entry.tool) {
			return entry;
		}
	}
	// Fallback: return any assistant message
	for (const entry of messages) {
		if (entry.message?.role === "assistant") {
			return entry;
		}
	}
	return null;
}

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

		const { resolvedModelId, model } = resolveChatModel(undefined);

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

		const listed = await listMessages(ctx, components.agent, {
			threadId: resolvedThreadId,
			paginationOpts: { numItems: 30, cursor: null },
		});
		const latestAssistant = getLatestAssistantMessage(listed.page);
		const assistantText = latestAssistant
			? (extractMessageText(latestAssistant) ?? "Processed your request.")
			: "Processed your request.";

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
