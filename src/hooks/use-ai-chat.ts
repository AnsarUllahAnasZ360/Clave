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

const CHAT_DEBUG_TIMING = process.env.NODE_ENV === "development";

function generateDebugRequestId() {
	return `frontend_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

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

export type SkillSummary = {
	_id: Id<"skills">;
	name: string;
	description: string;
	category: string;
	isEnabled: boolean;
};

export type SubAgentSummary = {
	_id: Id<"subAgents">;
	name: string;
	description: string;
	avatar?: string;
	isPreset: boolean;
};

export type ChatAttachmentInput = Pick<
	FileUIPart,
	"filename" | "mediaType" | "url"
>;

type PendingUserMessage = {
	prompt: string;
	files: ChatAttachmentInput[];
};

export function isPendingUserMessageDelivered(
	rawMessages: UIMessage[],
	pending: PendingUserMessage,
): boolean {
	const lastUserMsg = [...rawMessages].reverse().find((m) => m.role === "user");
	if (!lastUserMsg) return false;

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
				part.type === "file" && "url" in part && typeof part.url === "string",
		)
		.map((part: { url: string }) => part.url)
		.sort()
		.join("|");
	const pendingFiles = pending.files
		.map((file) => file.url)
		.sort()
		.join("|");

	return (
		lastUserText.trim() === pending.prompt.trim() &&
		lastUserFiles === pendingFiles
	);
}

type FailedMessagePayload = {
	prompt: string;
	context?: AIContext;
	systemPromptSuffix?: string;
	mentions?: MentionReference[];
	files?: ChatAttachmentInput[];
};

type PendingSendPayload = {
	prompt: string;
	context?: AIContext;
	systemPromptSuffix?: string;
	mentions?: MentionReference[];
	files?: ChatAttachmentInput[];
	selectedServerIdsOverride?: Id<"mcpServers">[];
};

type ChatMentionEntityType = "document" | "issue" | "user";

function isChatMentionEntityType(
	entityType: MentionReference["entityType"],
): entityType is ChatMentionEntityType {
	return (
		entityType === "document" || entityType === "issue" || entityType === "user"
	);
}

export function toChatMentions(mentions?: MentionReference[]): {
	entityType: ChatMentionEntityType;
	entityId: string;
	displayName: string;
}[] {
	if (!mentions) return [];
	return mentions.reduce<
		{
			entityType: ChatMentionEntityType;
			entityId: string;
			displayName: string;
		}[]
	>((acc, mention) => {
		if (!isChatMentionEntityType(mention.entityType)) return acc;
		acc.push({
			entityType: mention.entityType,
			entityId: mention.entityId,
			displayName: mention.displayName,
		});
		return acc;
	}, []);
}

const pendingMessageHandoff = new Map<string, PendingUserMessage>();
const pendingSendHandoff = new Map<string, PendingSendPayload>();
const threadModelSelectionHandoff = new Map<string, string>();
const workspaceModelSelection = new Map<string, string>();

/** Peek without deleting — safe for React Strict Mode double-mount. */
function peekPendingMessageHandoff(
	threadId: string | null | undefined,
): PendingUserMessage | null {
	if (!threadId) return null;
	return pendingMessageHandoff.get(threadId) ?? null;
}

/** Delete after confirmed consumption. */
function clearPendingMessageHandoff(threadId: string | null | undefined) {
	if (threadId) pendingMessageHandoff.delete(threadId);
}

/** Peek without deleting — safe for React Strict Mode double-mount. */
function peekPendingSendHandoff(
	threadId: string | null | undefined,
): PendingSendPayload | null {
	if (!threadId) return null;
	return pendingSendHandoff.get(threadId) ?? null;
}

/** Delete after confirmed consumption. */
function clearPendingSendHandoff(threadId: string | null | undefined) {
	if (threadId) pendingSendHandoff.delete(threadId);
}

function isRequiredExcalidrawServer(server: {
	name: string;
	url: string;
}): boolean {
	const lowerUrl = server.url.trim().toLowerCase();
	return (
		lowerUrl.includes("/api/mcp/excalidraw") ||
		lowerUrl.includes("/mcp/excalidraw")
	);
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
	/** Available skills for this workspace */
	skills: SkillSummary[];
	/** Selected skill IDs for this thread */
	selectedSkillIds: Id<"skills">[];
	/** Set selected skills for the active thread */
	setSelectedSkillIds: (skillIds: Id<"skills">[]) => void;
	/** Available sub-agents for this workspace */
	subAgents: SubAgentSummary[];
	/** Selected sub-agent for this thread (single selection) */
	selectedSubAgentId: Id<"subAgents"> | null;
	/** Set selected sub-agent for the active thread */
	setSelectedSubAgentId: (id: Id<"subAgents"> | null) => void;
};

// ── Hook ──────────────────────────────────────────────────────────────────

export function useAIChat(
	workspaceId: Id<"workspaces">,
	initialThreadId?: string | null,
	options?: { deferFirstSendUntilThreadActivation?: boolean },
): UseAIChatReturn {
	const deferFirstSendUntilThreadActivation =
		options?.deferFirstSendUntilThreadActivation ?? false;
	const workspaceModelKey = String(workspaceId);
	const [activeThreadId, setActiveThreadId] = useState<string | null>(
		initialThreadId ?? null,
	);
	const [isSending, setIsSending] = useState(false);
	const isSendingRef = useRef(false);
	const [isForceStopped, setIsForceStopped] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [errorInfo, setErrorInfo] = useState<ErrorInfo | null>(null);
	const [pendingUserMessage, setPendingUserMessage] =
		useState<PendingUserMessage | null>(() =>
			peekPendingMessageHandoff(initialThreadId ?? null),
		);
	const [lastFailedPayload, setLastFailedPayload] =
		useState<FailedMessagePayload | null>(null);
	const [selectedModel, setSelectedModel] = useState<string>(() => {
		const threadSeed =
			initialThreadId && threadModelSelectionHandoff.get(initialThreadId);
		return (
			threadSeed ??
			workspaceModelSelection.get(workspaceModelKey) ??
			DEFAULT_MODEL_ID
		);
	});
	const [modelWarning, setModelWarning] = useState<string | null>(null);
	const [selectedMcpServerIds, setSelectedMcpServerIds] = useState<
		Id<"mcpServers">[]
	>([]);
	const selectedModelRef = useRef<string>(selectedModel);
	const selectedMcpServerIdsRef = useRef<Id<"mcpServers">[]>([]);
	const normalizeModelId = useCallback((modelId: string | undefined) => {
		if (!modelId) return DEFAULT_MODEL_ID;
		return AI_MODELS.some((model) => model.id === modelId)
			? modelId
			: DEFAULT_MODEL_ID;
	}, []);
	const activeThreadIdRef = useRef<string | null>(initialThreadId ?? null);
	useEffect(() => {
		activeThreadIdRef.current = activeThreadId;
	}, [activeThreadId]);
	const setSelectedModelState = useCallback(
		(modelId: string) => {
			selectedModelRef.current = modelId;
			workspaceModelSelection.set(workspaceModelKey, modelId);
			const threadId = activeThreadIdRef.current;
			if (threadId) {
				threadModelSelectionHandoff.set(threadId, modelId);
			}
			setSelectedModel(modelId);
		},
		[workspaceModelKey],
	);
	const setSelectedMcpServerIdsState = useCallback(
		(serverIds: Id<"mcpServers">[]) => {
			selectedMcpServerIdsRef.current = serverIds;
			setSelectedMcpServerIds(serverIds);
		},
		[],
	);
	const prevInitialThreadIdRef = useRef<string | null>(initialThreadId ?? null);
	const ensuredSystemServerWorkspaceRef = useRef<Id<"workspaces"> | null>(null);

	// Clean up the initial pendingMessageHandoff after mount commits.
	// Peek was used in useState initializer (safe for Strict Mode double-mount),
	// so we delete here once the value has been consumed.
	useEffect(() => {
		return () => {
			clearPendingMessageHandoff(initialThreadId ?? null);
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [initialThreadId]);

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
	const ensureSystemExcalidrawServer = useMutation(
		api.mcpServers.ensureSystemExcalidrawServer,
	);
	useEffect(() => {
		if (ensuredSystemServerWorkspaceRef.current === workspaceId) return;
		ensuredSystemServerWorkspaceRef.current = workspaceId;
		void ensureSystemExcalidrawServer({ workspaceId }).catch((error) => {
			console.warn(
				"[use-ai-chat] Failed to ensure system Excalidraw MCP server:",
				error instanceof Error ? error.message : error,
			);
			ensuredSystemServerWorkspaceRef.current = null;
		});
	}, [ensureSystemExcalidrawServer, workspaceId]);

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
	const skillsRaw = useQuery(api.ai.skills.list, { workspaceId });
	const skills = (skillsRaw ?? []) as SkillSummary[];
	const subAgentsRaw = useQuery(api.ai.subAgents.list, { workspaceId });
	const subAgents = (subAgentsRaw ?? []) as SubAgentSummary[];
	const [selectedSkillIds, setSelectedSkillIds] = useState<Id<"skills">[]>([]);
	const selectedSkillIdsRef = useRef<Id<"skills">[]>([]);
	const [selectedSubAgentId, setSelectedSubAgentId] =
		useState<Id<"subAgents"> | null>(null);
	const selectedSubAgentIdRef = useRef<Id<"subAgents"> | null>(null);
	useEffect(() => {
		selectedSkillIdsRef.current = selectedSkillIds;
	}, [selectedSkillIds]);
	useEffect(() => {
		selectedSubAgentIdRef.current = selectedSubAgentId;
	}, [selectedSubAgentId]);
	const requiredMcpServerIds = useMemo(
		() =>
			mcpServers
				.filter(
					(server) =>
						server.status === "active" && isRequiredExcalidrawServer(server),
				)
				.map((server) => server._id),
		[mcpServers],
	);
	const requiredServerIdSet = useMemo(
		() => new Set(requiredMcpServerIds),
		[requiredMcpServerIds],
	);
	const activeServerIdSet = useMemo(
		() =>
			new Set(
				mcpServers
					.filter((server) => server.status === "active")
					.map((server) => server._id),
			),
		[mcpServers],
	);
	const normalizeMcpSelection = useCallback(
		(serverIds: Id<"mcpServers">[]) => {
			const deduped = [...new Set(serverIds)].filter((id) =>
				activeServerIdSet.has(id),
			);
			const hasOptionalSelection = deduped.some(
				(id) => !requiredServerIdSet.has(id),
			);
			if (!hasOptionalSelection) {
				// Legacy threads may contain only auto-injected required connectors.
				// Treat that case as "no explicit MCP selection" to preserve fast chat sends.
				return [];
			}
			return deduped;
		},
		[activeServerIdSet, requiredServerIdSet],
	);

	// Derive isStreaming from the message subscription status alone.
	// The Convex useUIMessages hook reports status="streaming" on assistant
	// messages while the backend DeltaStreamer is writing deltas. This is
	// the authoritative signal — decoupled from the action in-flight state
	// to avoid gaps during the deferred-first-send navigation handoff.
	const isStreaming = useMemo(() => {
		if (isForceStopped) return false;
		const lastAssistant = [...rawMessages]
			.reverse()
			.find((m) => m.role === "assistant");
		return lastAssistant?.status === "streaming";
	}, [rawMessages, isForceStopped]);

	// Merge pending optimistic user message with real messages.
	// Once the real messages include the user's prompt, clear the pending state.
	const messages = useMemo(() => {
		if (!pendingUserMessage) return rawMessages;

		if (isPendingUserMessageDelivered(rawMessages, pendingUserMessage)) {
			// Real message arrived, no need for optimistic one
			return rawMessages;
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

	// Clear pending state only after the real user message is persisted.
	useEffect(() => {
		if (!pendingUserMessage) return;
		if (isPendingUserMessageDelivered(rawMessages, pendingUserMessage)) {
			setPendingUserMessage(null);
		}
	}, [rawMessages, pendingUserMessage]);

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
		const normalized = normalizeMcpSelection(saved ?? []);
		setSelectedMcpServerIdsState(normalized);
	}, [
		activeThreadId,
		activeThreadMetadata,
		normalizeMcpSelection,
		setSelectedMcpServerIdsState,
	]);

	useEffect(() => {
		const normalized = normalizeMcpSelection(selectedMcpServerIdsRef.current);
		if (
			normalized.length === selectedMcpServerIdsRef.current.length &&
			normalized.every(
				(id, index) => id === selectedMcpServerIdsRef.current[index],
			)
		) {
			return;
		}
		setSelectedMcpServerIdsState(normalized);
	}, [normalizeMcpSelection, setSelectedMcpServerIdsState]);

	// Reset skills/sub-agent selections when thread changes
	// (These are session-local until backend persistence is added)
	const prevThreadIdForReset = useRef<string | null>(null);
	useEffect(() => {
		if (activeThreadId !== prevThreadIdForReset.current) {
			prevThreadIdForReset.current = activeThreadId;
			setSelectedSkillIds([]);
			setSelectedSubAgentId(null);
		}
	}, [activeThreadId]);

	useEffect(() => {
		if (pendingUserMessage || !activeThreadId) return;
		const transferred = peekPendingMessageHandoff(activeThreadId);
		if (transferred) {
			setPendingUserMessage(transferred);
		}
		// Cleanup: delete after confirmed consumption (safe under Strict Mode
		// since the second mount will still see the value before this cleanup runs).
		return () => {
			clearPendingMessageHandoff(activeThreadId);
		};
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
			if (isSendingRef.current) return;

			const trimmedPrompt = prompt.trim();
			const normalizedFiles = files ?? [];
			if (!trimmedPrompt && normalizedFiles.length === 0) return;
			const effectiveModelId = selectedModelRef.current;
			const effectiveSelectedMcpServerIds = normalizeMcpSelection(
				selectedServerIdsOverride ?? selectedMcpServerIdsRef.current,
			);
			const normalizedMentions = toChatMentions(mentions);
			const requestStartAt = Date.now();
			const debugRequestId = CHAT_DEBUG_TIMING
				? generateDebugRequestId()
				: undefined;
			const requestContext = {
				requestId: debugRequestId,
				threadHint: activeThreadId ?? "new",
				modelId: effectiveModelId,
				workspaceId,
				hasContext: Boolean(context),
				hasMentions: normalizedMentions.length > 0,
				hasAttachments: normalizedFiles.length > 0,
			};

			if (CHAT_DEBUG_TIMING) {
				console.info("[ai-chat:send:start]", requestContext);
			}
			if (hasPendingApproval) {
				setError(
					"A tool action is waiting for approval. Approve/reject it before sending another message.",
				);
				return;
			}

			isSendingRef.current = true;
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
					threadModelSelectionHandoff.set(createdThreadId, effectiveModelId);
					pendingMessageHandoff.set(createdThreadId, {
						files: normalizedFiles,
						prompt: trimmedPrompt,
					});
					// Activate subscription immediately — streaming will be visible
					setActiveThreadId(createdThreadId);
					if (deferFirstSendUntilThreadActivation) {
						pendingSendHandoff.set(createdThreadId, {
							prompt: trimmedPrompt,
							context,
							systemPromptSuffix,
							mentions,
							files: normalizedFiles,
							selectedServerIdsOverride: effectiveSelectedMcpServerIds,
						});
						return;
					}
				}

				const actionPromise = sendMessageAction({
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
					...(selectedSkillIdsRef.current.length > 0
						? { selectedSkillIds: selectedSkillIdsRef.current }
						: {}),
					...(selectedSubAgentIdRef.current
						? {
								aiTeammateId:
									selectedSubAgentIdRef.current as unknown as Id<"aiTeammates">,
							}
						: {}),
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
					...(normalizedMentions.length > 0
						? {
								mentions: normalizedMentions,
							}
						: {}),
					...(debugRequestId
						? {
								debugRequestId,
							}
						: {}),
				});

				const result = (await actionPromise) as {
					threadId: string;
					resolvedModelId?: string;
					modelWarning?: string;
					requestId?: string;
					timings?: {
						authMs: number;
						modelMs: number;
						threadMs: number;
						setupMs: number;
						streamMs: number;
						totalMs: number;
					};
					errorInfo?: ErrorInfo;
					errorMessage?: string;
				};

				if (result.resolvedModelId) {
					threadModelSelectionHandoff.set(
						result.threadId,
						normalizeModelId(result.resolvedModelId),
					);
					setSelectedModelState(normalizeModelId(result.resolvedModelId));
				}
				setModelWarning(result.modelWarning ?? null);
				// Surface structured error info from stream-level failures
				if (result.errorInfo) {
					setErrorInfo(result.errorInfo);
				}
				if (result.errorMessage) {
					setPendingUserMessage(null);
					setError(result.errorMessage);
					setLastFailedPayload({
						prompt: trimmedPrompt,
						context,
						systemPromptSuffix,
						mentions,
						files: normalizedFiles,
					});
				}
				if (CHAT_DEBUG_TIMING) {
					console.info("[ai-chat:send:done]", {
						...requestContext,
						requestId: result.requestId ?? debugRequestId,
						serverTimingsMs: result.timings,
						clientLatencyMs: Date.now() - requestStartAt,
						streamErrorType: result.errorInfo?.type,
					});
				}
			} catch (err) {
				const message =
					err instanceof Error ? err.message : "Failed to send message";
				setPendingUserMessage(null);
				setError(message);
				setLastFailedPayload({
					prompt: trimmedPrompt,
					context,
					systemPromptSuffix,
					mentions,
					files: normalizedFiles,
				});
			} finally {
				isSendingRef.current = false;
				setIsSending(false);
			}
		},
		[
			workspaceId,
			activeThreadId,
			sendMessageAction,
			createThreadMutation,
			normalizeModelId,
			normalizeMcpSelection,
			setSelectedModelState,
			hasPendingApproval,
			deferFirstSendUntilThreadActivation,
		],
	);

	// Resume a deferred first-send after landing page navigates into /chat/[threadId].
	useEffect(() => {
		if (deferFirstSendUntilThreadActivation || !activeThreadId) return;
		if (isSendingRef.current) return;
		const deferred = peekPendingSendHandoff(activeThreadId);
		if (!deferred) return;
		// Clear immediately before sending to prevent double-fire on Strict Mode remount.
		clearPendingSendHandoff(activeThreadId);
		void sendMessage(
			deferred.prompt,
			deferred.context,
			deferred.systemPromptSuffix,
			deferred.mentions,
			deferred.files,
			deferred.selectedServerIdsOverride,
		);
	}, [activeThreadId, deferFirstSendUntilThreadActivation, sendMessage]);

	const createNewThread = useCallback(async (): Promise<string | undefined> => {
		setError(null);
		setModelWarning(null);
		try {
			const result = await createThreadMutation({
				workspaceId,
				model: selectedModelRef.current,
				selectedMcpServerIds: selectedMcpServerIdsRef.current,
			});
			threadModelSelectionHandoff.set(
				result.threadId,
				selectedModelRef.current,
			);
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
			threadModelSelectionHandoff.set(
				result.threadId,
				selectedModelRef.current,
			);
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
			const deduped = normalizeMcpSelection(serverIds);
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
			activeThreadId,
			normalizeMcpSelection,
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
		// Unblock sending so the user can immediately send a new message
		// after stopping. The backend action may still be running, but
		// the user intent is clear: abandon the current response.
		isSendingRef.current = false;
		setIsSending(false);
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
		skills,
		selectedSkillIds,
		setSelectedSkillIds,
		subAgents,
		selectedSubAgentId,
		setSelectedSubAgentId,
	};
}
