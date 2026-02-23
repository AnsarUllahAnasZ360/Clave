"use client";

import type { UIMessage } from "@convex-dev/agent/react";
import { useUIMessages } from "@convex-dev/agent/react";
import type { FileUIPart, TextUIPart } from "ai";
import {
	useAction,
	useMutation,
	usePaginatedQuery,
	useQuery,
} from "convex/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AI_MODELS, DEFAULT_MODEL_ID } from "@/lib/ai-models";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import type { AIContext } from "./use-ai-context";
import type { MentionReference } from "./use-mention-search";

// ── Types ─────────────────────────────────────────────────────────────────

export type AIThread = {
	_id: Id<"aiThreads">;
	_creationTime: number;
	workspaceId: Id<"workspaces">;
	userId: Id<"users">;
	threadId: string;
	title?: string;
	model?: string;
	isIncognito?: boolean;
	updatedAt: number;
};

export type AIToolApproval = {
	_id: Id<"aiToolApprovals">;
	_creationTime: number;
	threadId: string;
	toolCallId: string;
	toolName: string;
	description: string;
	actionPayload: string;
	status: "pending" | "approved" | "rejected";
	resultMessage?: string;
	createdAt: number;
	resolvedAt?: number;
};

export type ErrorInfo = {
	type: string;
	retryAfter?: number;
};

export type MCPServerSummary = {
	_id: Id<"mcpServers">;
	name: string;
	url: string;
	transport: "http" | "sse";
	status: "active" | "inactive";
	description?: string;
	hasApiKey: boolean;
	authType?: "none" | "apiKey" | "oauth";
	authConfigUrl?: string;
};

export type ChatAttachmentInput = Pick<
	FileUIPart,
	"filename" | "mediaType" | "url"
>;

type PendingUserMessage = {
	prompt: string;
	files: ChatAttachmentInput[];
};

type FailedMessagePayload = {
	prompt: string;
	context?: AIContext;
	systemPromptSuffix?: string;
	mentions?: MentionReference[];
	files?: ChatAttachmentInput[];
};

const pendingMessageHandoff = new Map<string, PendingUserMessage>();

function takePendingMessageHandoff(
	threadId: string | null | undefined,
): PendingUserMessage | null {
	if (!threadId) return null;
	const pending = pendingMessageHandoff.get(threadId);
	if (!pending) return null;
	pendingMessageHandoff.delete(threadId);
	return pending;
}

export type UseAIChatReturn = {
	/** Messages for the active thread (real-time, includes streaming) */
	messages: UIMessage[];
	/** User's AI threads, sorted by most recent */
	threads: AIThread[];
	/** Currently active thread ID (agent component ID, not aiThreads _id) */
	activeThreadId: string | null;
	/** Set the active thread */
	setActiveThreadId: (threadId: string | null) => void;
	/** Send a message to the active thread (or create a new thread) */
	sendMessage: (
		prompt: string,
		context?: AIContext,
		systemPromptSuffix?: string,
		mentions?: MentionReference[],
		files?: ChatAttachmentInput[],
		selectedServerIdsOverride?: Id<"mcpServers">[],
	) => Promise<void>;
	/** Create a new empty thread and set it as active. Returns the new threadId. */
	createNewThread: () => Promise<string | undefined>;
	/** Create an incognito thread (not saved to history, auto-deleted after 24h) */
	createIncognitoThread: () => Promise<string | undefined>;
	/** Whether the current active thread is incognito */
	isIncognito: boolean;
	/** Delete a thread */
	deleteThread: (threadId: string) => Promise<void>;
	/** Rename a thread */
	renameThread: (threadId: string, title: string) => Promise<void>;
	/** Stop displaying the streaming response (client-side cancel) */
	stop: () => void;
	/** Whether a message is currently being sent (action in-flight) */
	isSending: boolean;
	/** Whether the assistant is currently streaming a response */
	isStreaming: boolean;
	/** Whether threads are loading */
	isLoadingThreads: boolean;
	/** Error message, if any */
	error: string | null;
	/** Structured error info from the backend (type, retryAfter) */
	errorInfo: ErrorInfo | null;
	/** Clear the error */
	clearError: () => void;
	/** Retry the last failed message */
	retry: () => Promise<void>;
	/** Whether messages are still loading for the active thread */
	isLoadingMessages: boolean;
	/** Load more threads (pagination) */
	loadMoreThreads: (numItems: number) => void;
	/** Load more messages (pagination) */
	loadMoreMessages: (numItems: number) => void;
	/** Tool approvals for the active thread (real-time) */
	approvals: AIToolApproval[];
	/** Whether there's a pending approval blocking input */
	hasPendingApproval: boolean;
	/** Approve a pending tool action */
	approveTool: (approvalId: Id<"aiToolApprovals">) => Promise<void>;
	/** Reject a pending tool action */
	rejectTool: (approvalId: Id<"aiToolApprovals">) => Promise<void>;
	/** The model ID selected for the active thread */
	selectedModel: string;
	/** Warning message when the requested model is not available */
	modelWarning: string | null;
	/** Change the model for the active thread (persists to thread metadata) */
	setThreadModel: (modelId: string) => Promise<void>;
	/** Available MCP servers for this workspace */
	mcpServers: MCPServerSummary[];
	/** Selected MCP servers for this thread's chat calls */
	selectedMcpServerIds: Id<"mcpServers">[];
	/** Persist selected MCP servers for the active thread */
	setThreadMcpServers: (serverIds: Id<"mcpServers">[]) => Promise<void>;
};

// ── Hook ──────────────────────────────────────────────────────────────────

export function useAIChat(
	workspaceId: Id<"workspaces">,
	initialThreadId?: string | null,
): UseAIChatReturn {
	const [activeThreadId, setActiveThreadId] = useState<string | null>(
		initialThreadId ?? null,
	);
	const [isSending, setIsSending] = useState(false);
	const [isForceStopped, setIsForceStopped] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [errorInfo, setErrorInfo] = useState<ErrorInfo | null>(null);
	const [pendingUserMessage, setPendingUserMessage] =
		useState<PendingUserMessage | null>(() =>
			takePendingMessageHandoff(initialThreadId ?? null),
		);
	const [lastFailedPayload, setLastFailedPayload] =
		useState<FailedMessagePayload | null>(null);
	const [selectedModel, setSelectedModel] = useState<string>(DEFAULT_MODEL_ID);
	const [modelWarning, setModelWarning] = useState<string | null>(null);
	const [selectedMcpServerIds, setSelectedMcpServerIds] = useState<
		Id<"mcpServers">[]
	>([]);
	const selectedModelRef = useRef<string>(DEFAULT_MODEL_ID);
	const selectedMcpServerIdsRef = useRef<Id<"mcpServers">[]>([]);
	const normalizeModelId = useCallback((modelId: string | undefined) => {
		if (!modelId) return DEFAULT_MODEL_ID;
		return AI_MODELS.some((model) => model.id === modelId)
			? modelId
			: DEFAULT_MODEL_ID;
	}, []);
	const setSelectedModelState = useCallback((modelId: string) => {
		selectedModelRef.current = modelId;
		setSelectedModel(modelId);
	}, []);
	const setSelectedMcpServerIdsState = useCallback(
		(serverIds: Id<"mcpServers">[]) => {
			selectedMcpServerIdsRef.current = serverIds;
			setSelectedMcpServerIds(serverIds);
		},
		[],
	);
	const prevInitialThreadIdRef = useRef<string | null>(initialThreadId ?? null);

	// Keep hook state aligned with route-driven thread changes while avoiding
	// stale-url feedback loops during in-app thread switches.
	useEffect(() => {
		const normalizedInitial = initialThreadId ?? null;
		if (
			normalizedInitial &&
			normalizedInitial !== prevInitialThreadIdRef.current
		) {
			setActiveThreadId(normalizedInitial);
		}
		prevInitialThreadIdRef.current = normalizedInitial;
	}, [initialThreadId]);

	// ── Thread list subscription ────────────────────────────────────────
	const {
		results: threads,
		status: threadsStatus,
		loadMore: loadMoreThreads,
	} = usePaginatedQuery(
		api.ai.threads.listThreads,
		{ workspaceId },
		{ initialNumItems: 20 },
	);

	// ── Message subscription (real-time with streaming) ─────────────────
	const {
		results: rawMessages,
		status: messagesStatus,
		loadMore: loadMoreMessages,
	} = useUIMessages(
		api.ai.chatQueries.listThreadMessages,
		activeThreadId ? { threadId: activeThreadId } : "skip",
		{ initialNumItems: 20, stream: true },
	);
	const mcpServersRaw = useQuery(api.mcpServers.list, { workspaceId });
	const mcpServers = (mcpServersRaw ?? []) as MCPServerSummary[];
	const activeServerIdSet = useMemo(
		() =>
			new Set(
				mcpServers
					.filter((server) => server.status === "active")
					.map((server) => server._id),
			),
		[mcpServers],
	);

	// Derive isStreaming from message statuses, respecting client-side force-stop
	const isStreaming = useMemo(
		() => !isForceStopped && rawMessages.some((m) => m.status === "streaming"),
		[rawMessages, isForceStopped],
	);

	// Merge pending optimistic user message with real messages.
	// Once the real messages include the user's prompt, clear the pending state.
	const messages = useMemo(() => {
		if (!pendingUserMessage) return rawMessages;

		// Check if the real messages already include the user's latest prompt
		const lastUserMsg = [...rawMessages]
			.reverse()
			.find((m) => m.role === "user");
		if (lastUserMsg) {
			const lastUserText =
				lastUserMsg.parts
					?.filter(
						(p: {
							type: string;
							text?: string;
						}): p is Extract<
							(typeof lastUserMsg.parts)[number],
							{ type: "text" }
						> => p.type === "text",
					)
					.map((p: { text: string }) => p.text)
					.join("") ?? "";
			const lastUserFiles = (lastUserMsg.parts ?? [])
				.filter(
					(
						part: (typeof lastUserMsg.parts)[number],
					): part is Extract<
						(typeof lastUserMsg.parts)[number],
						{ type: "file" }
					> =>
						part.type === "file" &&
						"url" in part &&
						typeof part.url === "string",
				)
				.map((part: { url: string }) => part.url)
				.sort()
				.join("|");
			const pendingFiles = pendingUserMessage.files
				.map((file) => file.url)
				.sort()
				.join("|");
			if (
				lastUserText.trim() === pendingUserMessage.prompt.trim() &&
				lastUserFiles === pendingFiles
			) {
				// Real message arrived, no need for optimistic one
				return rawMessages;
			}
		}

		// Append optimistic user message
		const pendingId = "pending-optimistic";
		const optimisticParts: UIMessage["parts"] = [
			...(pendingUserMessage.prompt
				? [
						{
							type: "text",
							text: pendingUserMessage.prompt,
						} satisfies TextUIPart,
					]
				: []),
			...pendingUserMessage.files.map(
				(file) =>
					({
						type: "file",
						mediaType: file.mediaType,
						filename: file.filename,
						url: file.url,
					}) satisfies FileUIPart,
			),
		];
		const optimisticMsg: UIMessage = {
			id: pendingId,
			role: "user",
			parts: optimisticParts,
			key: pendingId,
			order: Number.MAX_SAFE_INTEGER,
			stepOrder: 0,
			status: "success",
			text: pendingUserMessage.prompt,
			_creationTime: Date.now(),
		};
		return [...rawMessages, optimisticMsg];
	}, [rawMessages, pendingUserMessage]);

	// Clear pending message when real messages update with it
	// This is handled inline in the messages memo above

	// ── Query thread metadata directly (includes incognito threads filtered from list) ───
	const activeThreadMetadata = useQuery(
		api.ai.threads.getThreadMetadata,
		activeThreadId ? { threadId: activeThreadId } : "skip",
	);
	const isIncognito = activeThreadMetadata?.isIncognito === true;

	// ── Sync selectedModel from active thread metadata ───────────────────
	// When the active thread changes, update selectedModel to reflect its saved model.
	const activeThread = useMemo(
		() => (threads as AIThread[]).find((t) => t.threadId === activeThreadId),
		[threads, activeThreadId],
	);
	// Sync model + reset transient state when activeThreadId changes
	useEffect(() => {
		setIsForceStopped(false);
		setModelWarning(null);

		// Keep current picker selection when no thread is active (new-chat state).
		if (!activeThreadId) return;

		// Wait for at least one model source to resolve to avoid transiently
		// snapping to DEFAULT_MODEL_ID while thread metadata is still loading.
		const hasResolvedModelSource =
			activeThread?.model !== undefined || activeThreadMetadata !== undefined;
		if (!hasResolvedModelSource) return;

		// Use direct metadata for incognito threads (not in threads list).
		const model = activeThread?.model ?? activeThreadMetadata?.model;
		const threadModel = normalizeModelId(model);
		setSelectedModelState(threadModel);
	}, [
		activeThreadId,
		activeThread?.model,
		activeThreadMetadata,
		activeThreadMetadata?.model,
		normalizeModelId,
		setSelectedModelState,
	]);

	useEffect(() => {
		// No active thread yet: keep current selection (useful for first message).
		if (!activeThreadId) return;
		// Query is still resolving.
		if (activeThreadMetadata === undefined) return;

		const saved = (
			activeThreadMetadata as
				| { selectedMcpServerIds?: Id<"mcpServers">[] }
				| undefined
		)?.selectedMcpServerIds;
		const normalized = (saved ?? []).filter((id) => activeServerIdSet.has(id));
		setSelectedMcpServerIdsState(normalized);
	}, [
		activeThreadId,
		activeThreadMetadata,
		activeServerIdSet,
		setSelectedMcpServerIdsState,
	]);

	useEffect(() => {
		selectedModelRef.current = selectedModel;
	}, [selectedModel]);

	useEffect(() => {
		selectedMcpServerIdsRef.current = selectedMcpServerIds;
	}, [selectedMcpServerIds]);

	useEffect(() => {
		if (pendingUserMessage || !activeThreadId) return;
		const transferred = takePendingMessageHandoff(activeThreadId);
		if (transferred) {
			setPendingUserMessage(transferred);
		}
	}, [activeThreadId, pendingUserMessage]);

	// ── Tool approvals subscription ──────────────────────────────────────
	const rawApprovals = useQuery(
		api.ai.approval.listApprovals,
		activeThreadId ? { threadId: activeThreadId } : "skip",
	);
	const approvals = (rawApprovals ?? []) as AIToolApproval[];
	const hasPendingApproval = approvals.some((a) => a.status === "pending");

	// ── Actions & Mutations ─────────────────────────────────────────────
	const sendMessageAction = useAction(api.ai.chat.sendMessage);
	const createThreadMutation = useMutation(api.ai.threads.createThread);
	const createIncognitoThreadMutation = useMutation(
		api.ai.threads.createIncognitoThread,
	);
	const deleteThreadMutation = useMutation(api.ai.threads.deleteThread);
	const renameThreadMutation = useMutation(api.ai.threads.renameThread);
	const updateThreadModelMutation = useMutation(
		api.ai.threads.updateThreadModel,
	);
	const updateThreadMcpServersMutation = useMutation(
		api.ai.threads.updateThreadMcpServers,
	);
	const approveActionMutation = useMutation(api.ai.approval.approveAction);
	const rejectActionMutation = useMutation(api.ai.approval.rejectAction);

	const sendMessage = useCallback(
		async (
			prompt: string,
			context?: AIContext,
			systemPromptSuffix?: string,
			mentions?: MentionReference[],
			files?: ChatAttachmentInput[],
			selectedServerIdsOverride?: Id<"mcpServers">[],
		) => {
			const trimmedPrompt = prompt.trim();
			const normalizedFiles = files ?? [];
			if (!trimmedPrompt && normalizedFiles.length === 0) return;
			const effectiveModelId = selectedModelRef.current;
			const effectiveSelectedMcpServerIds =
				selectedServerIdsOverride ?? selectedMcpServerIdsRef.current;

			setIsSending(true);
			setIsForceStopped(false);
			setError(null);
			setErrorInfo(null);
			setLastFailedPayload(null);
			setModelWarning(null);
			setPendingUserMessage({ files: normalizedFiles, prompt: trimmedPrompt });

			try {
				// Pre-create thread when no active thread exists.
				// This sets activeThreadId immediately so the useUIMessages
				// subscription is live BEFORE the action starts streaming.
				let threadIdForAction = activeThreadId;
				let isFirstMessage = false;
				if (!threadIdForAction) {
					const created = await createThreadMutation({
						workspaceId,
						model: effectiveModelId,
						selectedMcpServerIds: effectiveSelectedMcpServerIds,
					});
					const createdThreadId = created.threadId;
					threadIdForAction = createdThreadId;
					isFirstMessage = true;
					pendingMessageHandoff.set(createdThreadId, {
						files: normalizedFiles,
						prompt: trimmedPrompt,
					});
					// Activate subscription immediately — streaming will be visible
					setActiveThreadId(createdThreadId);
				}

				const result = (await sendMessageAction({
					workspaceId,
					threadId: threadIdForAction,
					prompt: trimmedPrompt,
					modelId: effectiveModelId,
					isFirstMessage,
					...(normalizedFiles.length > 0
						? {
								attachments: normalizedFiles.map((file) => ({
									filename: file.filename,
									mediaType: file.mediaType,
									url: file.url,
								})),
							}
						: {}),
					selectedMcpServerIds: effectiveSelectedMcpServerIds,
					...(context
						? {
								pageContext: {
									type: context.type,
									entityId: context.entityId,
									entityName: context.entityName,
									summary: context.summary,
								},
							}
						: {}),
					...(systemPromptSuffix ? { systemPromptSuffix } : {}),
					...(mentions && mentions.length > 0
						? {
								mentions: mentions.map((m) => ({
									entityType: m.entityType,
									entityId: m.entityId,
									displayName: m.displayName,
								})),
							}
						: {}),
				})) as {
					threadId: string;
					resolvedModelId?: string;
					modelWarning?: string;
					errorInfo?: ErrorInfo;
				};

				if (result.resolvedModelId) {
					setSelectedModelState(normalizeModelId(result.resolvedModelId));
				}
				setModelWarning(result.modelWarning ?? null);
				// Surface structured error info from stream-level failures
				if (result.errorInfo) {
					setErrorInfo(result.errorInfo);
				}
			} catch (err) {
				const message =
					err instanceof Error ? err.message : "Failed to send message";
				setError(message);
				setLastFailedPayload({
					prompt: trimmedPrompt,
					context,
					systemPromptSuffix,
					mentions,
					files: normalizedFiles,
				});
			} finally {
				setIsSending(false);
				setPendingUserMessage(null);
			}
		},
		[
			workspaceId,
			activeThreadId,
			sendMessageAction,
			createThreadMutation,
			normalizeModelId,
			setSelectedModelState,
		],
	);

	const createNewThread = useCallback(async (): Promise<string | undefined> => {
		setError(null);
		setModelWarning(null);
		try {
			const result = await createThreadMutation({
				workspaceId,
				model: selectedModelRef.current,
				selectedMcpServerIds: selectedMcpServerIdsRef.current,
			});
			setActiveThreadId(result.threadId);
			return result.threadId;
		} catch (err) {
			const message =
				err instanceof Error ? err.message : "Failed to create thread";
			setError(message);
			return undefined;
		}
	}, [workspaceId, createThreadMutation]);

	const createIncognitoThread = useCallback(async (): Promise<
		string | undefined
	> => {
		setError(null);
		setModelWarning(null);
		try {
			const result = await createIncognitoThreadMutation({
				workspaceId,
				model: selectedModelRef.current,
				selectedMcpServerIds: selectedMcpServerIdsRef.current,
			});
			setActiveThreadId(result.threadId);
			return result.threadId;
		} catch (err) {
			const message =
				err instanceof Error
					? err.message
					: "Failed to create incognito thread";
			setError(message);
			return undefined;
		}
	}, [workspaceId, createIncognitoThreadMutation]);

	const deleteThread = useCallback(
		async (threadId: string) => {
			setError(null);
			try {
				await deleteThreadMutation({ threadId });
				// If deleting the active thread, clear selection
				if (activeThreadId === threadId) {
					setActiveThreadId(null);
				}
			} catch (err) {
				const message =
					err instanceof Error ? err.message : "Failed to delete thread";
				setError(message);
			}
		},
		[activeThreadId, deleteThreadMutation],
	);

	const renameThread = useCallback(
		async (threadId: string, title: string) => {
			setError(null);
			try {
				await renameThreadMutation({ threadId, title });
			} catch (err) {
				const message =
					err instanceof Error ? err.message : "Failed to rename thread";
				setError(message);
			}
		},
		[renameThreadMutation],
	);

	const setThreadModel = useCallback(
		async (modelId: string) => {
			const normalizedModelId = normalizeModelId(modelId);
			setSelectedModelState(normalizedModelId);
			if (!activeThreadId) return;
			try {
				await updateThreadModelMutation({
					threadId: activeThreadId,
					model: normalizedModelId,
				});
			} catch {
				// Non-critical: model selection persists for this session even if save fails
			}
		},
		[
			activeThreadId,
			updateThreadModelMutation,
			normalizeModelId,
			setSelectedModelState,
		],
	);

	const setThreadMcpServers = useCallback(
		async (serverIds: Id<"mcpServers">[]) => {
			const deduped = [...new Set(serverIds)].filter((id) =>
				activeServerIdSet.has(id),
			);
			setSelectedMcpServerIdsState(deduped);
			if (!activeThreadId) return;
			try {
				await updateThreadMcpServersMutation({
					threadId: activeThreadId,
					selectedMcpServerIds: deduped,
				});
			} catch {
				// Non-critical: local selection still applies to immediate request payloads.
			}
		},
		[
			activeServerIdSet,
			activeThreadId,
			updateThreadMcpServersMutation,
			setSelectedMcpServerIdsState,
		],
	);

	const clearError = useCallback(() => {
		setError(null);
		setErrorInfo(null);
		setLastFailedPayload(null);
		setModelWarning(null);
	}, []);

	const retry = useCallback(async () => {
		if (!lastFailedPayload) return;
		setError(null);
		setLastFailedPayload(null);
		await sendMessage(
			lastFailedPayload.prompt,
			lastFailedPayload.context,
			lastFailedPayload.systemPromptSuffix,
			lastFailedPayload.mentions,
			lastFailedPayload.files,
		);
	}, [lastFailedPayload, sendMessage]);

	const stop = useCallback(() => {
		setIsForceStopped(true);
	}, []);

	const approveTool = useCallback(
		async (approvalId: Id<"aiToolApprovals">) => {
			try {
				await approveActionMutation({ approvalId });
			} catch (err) {
				const message =
					err instanceof Error ? err.message : "Failed to approve action";
				setError(message);
			}
		},
		[approveActionMutation],
	);

	const rejectTool = useCallback(
		async (approvalId: Id<"aiToolApprovals">) => {
			try {
				await rejectActionMutation({ approvalId });
			} catch (err) {
				const message =
					err instanceof Error ? err.message : "Failed to reject action";
				setError(message);
			}
		},
		[rejectActionMutation],
	);

	return {
		messages,
		threads: threads as AIThread[],
		activeThreadId,
		setActiveThreadId,
		sendMessage,
		createNewThread,
		createIncognitoThread,
		isIncognito,
		deleteThread,
		renameThread,
		stop,
		isSending,
		isStreaming,
		isLoadingThreads: threadsStatus === "LoadingFirstPage",
		error,
		errorInfo,
		clearError,
		retry,
		isLoadingMessages: activeThreadId
			? messagesStatus === "LoadingFirstPage"
			: false,
		loadMoreThreads,
		loadMoreMessages,
		approvals,
		hasPendingApproval,
		approveTool,
		rejectTool,
		selectedModel,
		modelWarning,
		setThreadModel,
		mcpServers,
		selectedMcpServerIds,
		setThreadMcpServers,
	};
}
