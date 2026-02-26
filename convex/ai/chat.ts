"use node";

import type { ModelMessage } from "ai";
import { makeFunctionReference } from "convex/server";
import { v } from "convex/values";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { action } from "../_generated/server";
import { getClaveAgent } from "./agents";
import { buildContextPrompt, type PageContext } from "./contextPrompts";
import { getComposedPrompt } from "./getComposedPrompt";
import { closeMcpClients, loadMcpTools } from "./mcpClient";
import {
	buildMentionContextBlock,
	type MentionReferenceData,
	resolveMentions,
} from "./mentionResolver";
import {
	getReasoningProviderOptions,
	resolveChatModel,
	supportsTemperatureSetting,
} from "./providers";
import { allTools } from "./tools";

type IncomingAttachment = {
	url: string;
	mediaType?: string;
	filename?: string;
};

function buildPromptWithAttachments(
	prompt: string,
	attachments?: IncomingAttachment[],
): string | ModelMessage[] {
	const files = attachments ?? [];
	if (files.length === 0) return prompt;

	const content: Array<
		| { type: "text"; text: string }
		| { type: "image"; image: string; mediaType?: string }
		| { type: "file"; data: string; mediaType: string; filename?: string }
	> = [];
	if (prompt.trim()) {
		content.push({ type: "text", text: prompt.trim() });
	}
	for (const file of files) {
		const mediaType = file.mediaType;
		if (mediaType?.startsWith("image/")) {
			content.push({
				type: "image",
				image: file.url,
				mediaType,
			});
			continue;
		}
		content.push({
			type: "file",
			data: file.url,
			mediaType: mediaType ?? "application/octet-stream",
			filename: file.filename,
		});
	}

	return [{ role: "user", content }];
}

// Function reference for the titling action (not yet in generated types; resolved at runtime)
const generateThreadTitle = makeFunctionReference<
	"action",
	{ threadId: string; prompt: string },
	null
>("ai/titling:generateThreadTitle");

// ── Error classification ─────────────────────────────────────────────────

export type ErrorType =
	| "rate_limit"
	| "deployment"
	| "auth"
	| "quota"
	| "content_filter"
	| "timeout"
	| "network"
	| "generic";

type ClassifiedError = {
	message: string;
	type: ErrorType;
	/** Suggested seconds to wait before retry (rate limits / quota). */
	retryAfter?: number;
};

const ENABLE_CHAT_TIMINGS = process.env.AI_CHAT_DEBUG_TIMING === "true";
// Default audit logging to on unless explicitly disabled.
const ENABLE_CHAT_AUDIT_LOGS = process.env.AI_CHAT_AUDIT_LOGS !== "false";

function makeDebugRequestId(override?: string) {
	const fallback = `chat_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
	if (!override) return fallback;
	const sanitized = override.trim();
	return sanitized.length > 0 ? sanitized : fallback;
}

function logChatStage(
	traceId: string,
	stage: string,
	deltaMs: number,
	extra?: Record<string, unknown>,
) {
	if (!ENABLE_CHAT_TIMINGS) return;
	console.info(`[chat:trace] ${traceId} ${stage}`, deltaMs, extra ?? {});
}

function logChatTiming(step: string, startedAtMs: number) {
	if (!ENABLE_CHAT_TIMINGS) return;
	console.info(`[chat:timing] ${step} +${Date.now() - startedAtMs}ms`);
}

function classifyStreamError(error: unknown): ClassifiedError {
	if (!(error instanceof Error)) {
		return {
			message: "Something went wrong. Please try again.",
			type: "generic",
		};
	}

	const msg = error.message.toLowerCase();

	// Rate limiting
	if (msg.includes("rate") || msg.includes("429") || msg.includes("throttl")) {
		// Try to extract retry-after seconds from the error message
		const retryMatch = msg.match(/retry.after[:\s]*(\d+)/i);
		const retryAfter = retryMatch ? Number.parseInt(retryMatch[1], 10) : 15;
		return {
			message: `Rate limited — automatically retrying in ${retryAfter}s.`,
			type: "rate_limit",
			retryAfter,
		};
	}

	// Azure deployment not found (wrong deployment name or model not provisioned)
	if (
		msg.includes("deploymentnotfound") ||
		msg.includes("deployment not found") ||
		(msg.includes("404") && msg.includes("deployment"))
	) {
		return {
			message:
				"This AI model deployment is not available. Try switching to a different model in the model picker.",
			type: "deployment",
		};
	}

	// Azure resource / authentication errors
	if (
		msg.includes("401") ||
		msg.includes("unauthorized") ||
		msg.includes("invalid.*key") ||
		msg.includes("authentication")
	) {
		return {
			message:
				"AI service authentication failed. Please contact your workspace admin.",
			type: "auth",
		};
	}

	// Azure quota / capacity errors
	if (
		msg.includes("quota") ||
		msg.includes("capacity") ||
		msg.includes("503") ||
		msg.includes("overloaded")
	) {
		return {
			message:
				"The AI service is temporarily at capacity. Please try again in a few seconds.",
			type: "quota",
			retryAfter: 10,
		};
	}

	// Content filtering
	if (msg.includes("content_filter") || msg.includes("content filter")) {
		return {
			message:
				"Your message was flagged by content safety filters. Please rephrase and try again.",
			type: "content_filter",
		};
	}

	// Tool execution timeout
	if (msg.includes("tool timeout") || msg.includes("timed out")) {
		return {
			message:
				"A tool call timed out. The workspace operation took too long — please try a simpler request.",
			type: "timeout",
		};
	}

	// Network / connection errors
	if (
		msg.includes("econnrefused") ||
		msg.includes("enotfound") ||
		msg.includes("fetch failed") ||
		msg.includes("network")
	) {
		return {
			message:
				"Unable to reach the AI service. Please check your connection and try again.",
			type: "network",
		};
	}

	// Generic model error — include a snippet of the original message for debugging
	const snippet = error.message.slice(0, 100);
	return {
		message: `An error occurred while generating a response: ${snippet}. Please try again or switch models.`,
		type: "generic",
	};
}

// ── Send Message Action (Streaming) ─────────────────────────────────────

export const sendMessage = action({
	args: {
		workspaceId: v.id("workspaces"),
		threadId: v.optional(v.string()),
		prompt: v.string(),
		modelId: v.optional(v.string()),
		isFirstMessage: v.optional(v.boolean()),
		attachments: v.optional(
			v.array(
				v.object({
					url: v.string(),
					mediaType: v.optional(v.string()),
					filename: v.optional(v.string()),
				}),
			),
		),
		selectedMcpServerIds: v.optional(v.array(v.id("mcpServers"))),
		pageContext: v.optional(
			v.object({
				type: v.string(),
				entityId: v.string(),
				entityName: v.string(),
				summary: v.string(),
			}),
		),
		/** Optional system prompt suffix appended for slash commands (e.g. /summarize). */
		systemPromptSuffix: v.optional(v.string()),
		/** Optional skill IDs to load into the system prompt (on-demand). */
		selectedSkillIds: v.optional(v.array(v.id("skills"))),
		/** Optional AI teammate ID to apply custom persona config. */
		aiTeammateId: v.optional(v.id("aiTeammates")),
		/** Optional @mentions to resolve into entity context for the agent. */
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
		debugRequestId: v.optional(v.string()),
	},
	returns: v.object({
		threadId: v.string(),
		resolvedModelId: v.string(),
		modelWarning: v.optional(v.string()),
		requestId: v.string(),
		timings: v.optional(
			v.object({
				authMs: v.number(),
				modelMs: v.number(),
				threadMs: v.number(),
				setupMs: v.number(),
				streamMs: v.number(),
				totalMs: v.number(),
			}),
		),
		errorInfo: v.optional(
			v.object({
				type: v.string(),
				retryAfter: v.optional(v.number()),
			}),
		),
		errorMessage: v.optional(v.string()),
	}),
	handler: async (
		ctx,
		{
			workspaceId,
			threadId,
			prompt,
			modelId,
			isFirstMessage,
			attachments,
			selectedMcpServerIds,
			pageContext,
			systemPromptSuffix,
			selectedSkillIds,
			aiTeammateId,
			mentions,
			debugRequestId,
		},
	) => {
		const t0 = performance.now();
		const startedAt = Date.now();
		const traceId = makeDebugRequestId(debugRequestId);
		const timingMarks: Record<string, number> = {};
		const mark = (label: string) => {
			timingMarks[label] = Math.round(performance.now() - t0);
		};
		mark("action_start");
		const stageTimings = {
			authMs: 0,
			modelMs: 0,
			threadMs: 0,
			setupMs: 0,
			streamMs: 0,
			totalMs: 0,
		};
		let streamStartedAt: number | null = null;
		let mcpResult: Awaited<ReturnType<typeof loadMcpTools>> | null = null;
		let errorMessage: string | undefined;

		logChatStage(traceId, "request:start", 0, {
			workspaceId,
			threadHint: threadId ? "existing" : "new",
			hasContext: Boolean(pageContext),
			selectedMcpServerIds: selectedMcpServerIds?.length ?? 0,
			mentionCount: mentions?.length ?? 0,
			hasAttachments: (attachments?.length ?? 0) > 0,
		});

		const authStart = Date.now();
		const promptInput = buildPromptWithAttachments(
			prompt,
			attachments as IncomingAttachment[] | undefined,
		);
		// Combined auth + workspace context in a single round-trip
		const {
			userId,
			workspaceName,
			userName,
			aiAboutMe,
			aiHowToWorkWithMe,
			aiWorkspaceContext,
			aiAssistantCharacteristics,
		}: {
			userId: Id<"users">;
			workspaceName: string;
			userName: string;
			aiAboutMe?: string;
			aiHowToWorkWithMe?: string;
			aiWorkspaceContext?: string;
			aiAssistantCharacteristics?: string;
		} = await ctx.runQuery(internal.ai.chatQueries.getAuthAndContext, {
			workspaceId,
		});
		stageTimings.authMs = Date.now() - authStart;
		mark("after_auth_context");

		const modelResolveStart = Date.now();
		let {
			resolvedModelId: modelIdForRequest,
			model: modelForRequest,
			fallbackReason,
		} = resolveChatModel(modelId);
		stageTimings.modelMs = Date.now() - modelResolveStart;
		mark("after_model_resolve");

		// Resolve or create thread
		const threadResolveStart = Date.now();
		let resolvedThreadId = threadId ?? "";
		let _isNewThread = false;
		if (threadId) {
			resolvedThreadId = threadId;
			// Keep thread metadata in sync before continuing.
			await ctx.scheduler.runAfter(0, internal.ai.threads.syncThreadModel, {
				threadId: resolvedThreadId,
				model: modelIdForRequest,
			});
		} else {
			const created: { threadId: string } = await getClaveAgent().createThread(
				ctx,
				{
					userId,
				},
			);
			resolvedThreadId = created.threadId;
			_isNewThread = true;

			// Insert metadata only for threads created inside this action (fallback path)
			await ctx.runMutation(internal.ai.threads.insertThreadMetadata, {
				workspaceId,
				userId,
				threadId: resolvedThreadId,
				model: modelIdForRequest,
				...(aiTeammateId && { aiTeammateId }),
				...(selectedMcpServerIds !== undefined ? { selectedMcpServerIds } : {}),
			});
		}
		stageTimings.threadMs = Date.now() - threadResolveStart;
		mark("after_thread_resolve");

		let contextSuffix = `\n\nWorkspace: ${workspaceName}\nUser: ${userName}`;

		const personalizationSections: string[] = [];
		if (aiWorkspaceContext?.trim()) {
			personalizationSections.push(
				`Workspace context:\n${aiWorkspaceContext.trim()}`,
			);
		}
		if (aiAssistantCharacteristics?.trim()) {
			personalizationSections.push(
				`Assistant characteristics:\n${aiAssistantCharacteristics.trim()}`,
			);
		}
		if (aiAboutMe?.trim()) {
			personalizationSections.push(`About the user:\n${aiAboutMe.trim()}`);
		}
		if (aiHowToWorkWithMe?.trim()) {
			personalizationSections.push(
				`How to work with the user:\n${aiHowToWorkWithMe.trim()}`,
			);
		}

		if (personalizationSections.length > 0) {
			contextSuffix += `\n\nAI personalization:\n${personalizationSections.join("\n\n")}`;
		}

		// Append slash command system prompt suffix (e.g. /summarize instructions)
		if (systemPromptSuffix) {
			contextSuffix += systemPromptSuffix;
		}

		let errorInfo: { type: string; retryAfter?: number } | undefined;
		const defaultInstructions =
			typeof getClaveAgent().options.instructions === "string"
				? getClaveAgent().options.instructions
				: "";
		// Persist the user input first and continue generation from that saved message.
		const savePromptStart = Date.now();
		const promptMessages: ModelMessage[] =
			typeof promptInput === "string"
				? [{ role: "user", content: promptInput }]
				: promptInput;
		const savedPrompt = await getClaveAgent().saveMessages(ctx, {
			threadId: resolvedThreadId,
			userId,
			messages: promptMessages,
		});
		const promptMessageId =
			savedPrompt.messages[savedPrompt.messages.length - 1]?._id;
		if (!promptMessageId) {
			throw new Error("Failed to persist prompt message before generation");
		}
		const promptSaveMs = Date.now() - savePromptStart;
		mark("after_prompt_saved");
		// Kick off expensive setup steps in parallel so first-token latency is lower.
		const setupStart = Date.now();
		const mcpToolsPromise = loadMcpTools(ctx, workspaceId, {
			selectedServerIds: selectedMcpServerIds ?? [],
			pageContext: pageContext?.type,
		});
		const richContextPromise = pageContext
			? buildContextPrompt(ctx, pageContext as PageContext).catch((error) => {
					console.error(
						"[chat:sendMessage] context prompt error:",
						error instanceof Error ? error.message : error,
					);
					return `\n\nCurrent context: ${pageContext.summary}`;
				})
			: Promise.resolve<string | null>(null);
		const mentionResolutionPromise =
			mentions && mentions.length > 0
				? resolveMentions(
						ctx,
						workspaceId,
						mentions as MentionReferenceData[],
					).catch((error) => {
						console.error(
							"[chat:sendMessage] mention resolution error:",
							error instanceof Error ? error.message : error,
						);
						// Non-fatal: continue without mention context
						return null;
					})
				: Promise.resolve(null);
		const teammatePromise = ctx.runQuery(
			internal.ai.chatQueries.getTeammateForThread,
			{ threadId: resolvedThreadId },
		);
		mark("parallel_setup_start");
		logChatTiming("parallel setup started", startedAt);

		try {
			if (ENABLE_CHAT_TIMINGS) {
				logChatStage(traceId, "setup:parallel-start", Date.now() - setupStart);
			}
			const [
				teammateResult,
				loadedMcpResult,
				richContextResult,
				resolvedMentionsResult,
			] = await Promise.allSettled([
				teammatePromise,
				mcpToolsPromise,
				richContextPromise,
				mentionResolutionPromise,
			]);
			mark("after_parallel_group");
			if (teammateResult.status === "rejected") {
				throw teammateResult.reason;
			}
			const teammateConfig = teammateResult.value;

			// If a teammate has a model override, prefer it over the user-selected model
			// (unless the user explicitly chose a model via modelId arg)
			if (teammateConfig?.model && !modelId) {
				const teammateResolution = resolveChatModel(teammateConfig.model);
				if (!teammateResolution.fallbackReason) {
					modelIdForRequest = teammateResolution.resolvedModelId;
					modelForRequest = teammateResolution.model;
				}
			}
			const baseInstructions = teammateConfig
				? teammateConfig.systemPrompt
				: defaultInstructions;
			const composedBase = await getComposedPrompt(ctx, {
				workspaceId,
				baseInstructions,
				selectedSkillIds,
			});
			mark("after_composed_prompt");
			if (loadedMcpResult.status === "fulfilled") {
				mcpResult = loadedMcpResult.value;
			} else {
				console.warn(
					"[chat:sendMessage] MCP setup failed, continuing without MCP tools:",
					loadedMcpResult.reason instanceof Error
						? loadedMcpResult.reason.message
						: loadedMcpResult.reason,
				);
			}
			if (richContextResult.status === "rejected") {
				throw richContextResult.reason;
			}
			if (resolvedMentionsResult.status === "rejected") {
				throw resolvedMentionsResult.reason;
			}

			const richContext = richContextResult.value;
			const resolvedMentions = resolvedMentionsResult.value;
			if (richContext) {
				contextSuffix += richContext;
			}
			const mentionBlock = resolvedMentions
				? buildMentionContextBlock(resolvedMentions)
				: "";
			if (mentionBlock) {
				contextSuffix += mentionBlock;
			}
			mcpResult ??= {
				tools: {},
				clients: [],
				timing: { totalMs: 0, queryMs: 0, servers: [], fastPath: true },
			};
			const hasMcpTools = Object.keys(mcpResult.tools).length > 0;
			logChatTiming("parallel setup complete", startedAt);
			stageTimings.setupMs = promptSaveMs + (Date.now() - setupStart);

			// Stream the response with delta persistence.
			// saveStreamDeltas persists each token to the DB as it arrives,
			// allowing real-time subscriptions to push updates to the client.

			const systemPrompt = composedBase + contextSuffix;
			const reasoningOptions = getReasoningProviderOptions(modelIdForRequest);
			const supportsTemperature = supportsTemperatureSetting(modelIdForRequest);
			mark("before_stream");
			streamStartedAt = Date.now();
			const result = await getClaveAgent().streamText(
				ctx,
				{ threadId: resolvedThreadId, userId },
				{
					promptMessageId,
					system: systemPrompt,
					model: modelForRequest,
					// Allow enough room for substantial responses without unnecessary truncation.
					maxOutputTokens: 16384,
					// Apply teammate temperature override if set
					...(supportsTemperature &&
						teammateConfig?.temperature !== undefined && {
							temperature: teammateConfig.temperature,
						}),
					...(reasoningOptions && { providerOptions: reasoningOptions }),
					// Merge MCP tools with workspace tools when MCP servers are configured.
					// Per-call tools override agent defaults, so we spread both sets together.
					...(hasMcpTools && {
						tools: { ...allTools, ...mcpResult.tools },
					}),
					experimental_telemetry: {
						isEnabled: true,
						metadata: {
							threadId: resolvedThreadId,
							modelId: modelIdForRequest,
							hasMcpTools: Object.keys(mcpResult?.tools ?? {}).length > 0,
						},
					},
				},
				{
					saveStreamDeltas: {
						chunking: "word",
						// Reduce write amplification during long streams.
						throttleMs: 40,
					},
					contextOptions: {
						// 20 recent messages gives good conversational context while the
						// contextHandler trims long assistant responses in older turns.
						recentMessages: 20,
					},
				},
			);
			mark("after_stream_start");
			logChatStage(traceId, "stream:start", streamStartedAt - startedAt, {
				hasMcpTools,
				threadId: resolvedThreadId,
				modelId: modelIdForRequest,
			});

			// Always block until stream completion to avoid dangling mutations
			// from the agent persistence path.
			await result.consumeStream();
			stageTimings.streamMs = Date.now() - streamStartedAt;
			logChatTiming(
				`stream complete model=${modelIdForRequest} mcp=${hasMcpTools} (${Date.now() - streamStartedAt}ms)`,
				startedAt,
			);
		} catch (error) {
			// Log the actual error for debugging
			console.error(
				"[chat:sendMessage] streamText error:",
				error instanceof Error ? error.message : error,
			);
			console.error(
				"[chat:sendMessage] stack:",
				error instanceof Error ? error.stack : "no stack",
			);

			// Classify the error and surface a specific, actionable message
			const classified = classifyStreamError(error);
			errorInfo = {
				type: classified.type,
				...(classified.retryAfter !== undefined && {
					retryAfter: classified.retryAfter,
				}),
			};
			errorMessage = classified.message;
			stageTimings.streamMs = streamStartedAt
				? Date.now() - streamStartedAt
				: 0;

			logChatTiming(
				`stream failed model=${modelIdForRequest} (${classified.type})`,
				startedAt,
			);
		} finally {
			// Close MCP client connections (fire-and-forget, errors ignored)
			if (mcpResult?.clients.length) {
				await closeMcpClients(mcpResult.clients);
			}
			mark("action_end");
			console.info(
				"[chat-timing]",
				JSON.stringify({
					requestId: traceId,
					threadId: resolvedThreadId || undefined,
					modelId: modelIdForRequest,
					marks: timingMarks,
				}),
			);
		}

		stageTimings.totalMs = Date.now() - startedAt;
		// Touch aiThreads.updatedAt so thread sorts to top of list
		await ctx.scheduler.runAfter(0, internal.ai.threads.touchThread, {
			threadId: resolvedThreadId,
		});

		// Auto-title threads that don't have a title yet.
		// Set an immediate fallback title from the user's message so the thread
		// is never stuck as "New conversation". The background titling action
		// will overwrite it with an AI-generated title if it succeeds.
		const currentTitle: string | null = await ctx.runQuery(
			internal.ai.chatQueries.getThreadTitle,
			{ threadId: resolvedThreadId },
		);
		if (!currentTitle) {
			// Immediate fallback: first 60 chars of the user's message
			const fallbackTitle =
				prompt.trim().length <= 60
					? prompt.trim()
					: `${prompt.trim().slice(0, 60).trim()}\u2026`;
			if (fallbackTitle) {
				await ctx.runMutation(internal.ai.threads.internalSetThreadTitle, {
					threadId: resolvedThreadId,
					title: fallbackTitle,
				});
			}
			// Background: generate a better AI title (overwrites the fallback)
			await ctx.scheduler.runAfter(0, generateThreadTitle, {
				threadId: resolvedThreadId,
				prompt,
			});
		}

		if (ENABLE_CHAT_AUDIT_LOGS) {
			await ctx.runMutation(internal.ai.auditLog.logAction, {
				workspaceId,
				userId,
				action: "chat.sendMessage",
				threadId: resolvedThreadId,
				details: [
					`id:${traceId}`,
					`model:${modelIdForRequest}`,
					`mcp:${mcpResult ? Object.keys(mcpResult.tools).length : 0}`,
					`error:${errorInfo?.type ?? "none"}`,
					`timings:${JSON.stringify(stageTimings)}`,
				].join(" | "),
			});
		}

		return {
			threadId: resolvedThreadId,
			resolvedModelId: modelIdForRequest,
			modelWarning: fallbackReason,
			requestId: traceId,
			timings: stageTimings,
			errorInfo,
			errorMessage,
		};
	},
});
