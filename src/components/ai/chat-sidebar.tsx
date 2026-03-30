"use client";

import type { FileUIPart } from "ai";
import { useAction, useMutation } from "convex/react";
import { History, PanelRightClose, SquarePen } from "lucide-react";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
	ArtifactPanel,
	ArtifactPanelProvider,
	useArtifactPanel,
} from "@/components/ai/ArtifactPanel";
import { useAIChatPanel } from "@/components/ai/ai-chat-context";
import {
	ChatMessageList,
	type SubAgentInvocation,
} from "@/components/ai/ChatMessageList";
import { ChatModeSelector } from "@/components/ai/ChatModeSelector";
import { ConnectionBanner } from "@/components/ai/ConnectionBanner";
import { McpActionMenuItems } from "@/components/ai/McpConnectorPicker";
import { MentionAutocomplete } from "@/components/ai/MentionAutocomplete";
import { RateLimitBanner } from "@/components/ai/RateLimitBanner";
import { SkillsActionMenuItems } from "@/components/ai/SkillsActionMenuItems";
import { SubAgentActionMenuItems } from "@/components/ai/SubAgentActionMenuItems";
import { ChatHeader, ContextChip, ModelSelector } from "@/components/ai/shared";
import { ThreadBrowserPopup } from "@/components/ai/ThreadBrowserPopup";
import { useWorkspace } from "@/components/providers/workspace-context";
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetHeader,
	SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { useAIChat } from "@/hooks/use-ai-chat";
import { useAIContext } from "@/hooks/use-ai-context";
import { useConnectionStatus } from "@/hooks/use-connection-status";
import { useMessageQueue } from "@/hooks/use-message-queue";
import { useMessageRetry } from "@/hooks/use-message-retry";
import { useIsMobile } from "@/hooks/use-mobile";
import type { WorkspaceContext } from "@/lib/ai/slash-commands";
import { cn } from "@/lib/utils";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

// ── Sidebar-specific header actions ──────────────────────────────────────

function SidebarHeaderActions({
	onClose,
	onNewChat,
	onOpenHistory,
}: {
	onClose: () => void;
	onNewChat: () => void;
	onOpenHistory: () => void;
}) {
	return (
		<TooltipProvider delayDuration={300}>
			<Tooltip>
				<TooltipTrigger asChild>
					<button
						type="button"
						onClick={onNewChat}
						className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
						aria-label="New chat"
					>
						<SquarePen className="size-4" />
					</button>
				</TooltipTrigger>
				<TooltipContent side="bottom">New chat</TooltipContent>
			</Tooltip>
			<Tooltip>
				<TooltipTrigger asChild>
					<button
						type="button"
						onClick={onOpenHistory}
						className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
						aria-label="Browse threads"
					>
						<History className="size-4" />
					</button>
				</TooltipTrigger>
				<TooltipContent side="bottom">History</TooltipContent>
			</Tooltip>
			<Tooltip>
				<TooltipTrigger asChild>
					<button
						type="button"
						onClick={onClose}
						className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
						aria-label="Close sidebar"
					>
						<PanelRightClose className="size-4" />
					</button>
				</TooltipTrigger>
				<TooltipContent side="bottom">
					Close sidebar{" "}
					<kbd className="ml-1 font-mono text-[10px] opacity-60">⌘J</kbd>
				</TooltipContent>
			</Tooltip>
		</TooltipProvider>
	);
}

// ── Panel Content ───────────────────────────────────────────────────────

function AIChatPanelContent({ onClose }: { onClose: () => void }) {
	const { isOpen } = useAIChatPanel();
	const { workspaceId, workspaceSlug } = useWorkspace();
	const containerRef = useRef<HTMLDivElement>(null);
	const chat = useAIChat(workspaceId);

	// Sub-agent invocation via @mention
	const invokeSubAgentAction = useAction(
		api.ai.subAgentExecution.invokeSubAgent,
	);
	const createThreadMutation = useMutation(api.ai.threads.createThread);
	const {
		messages,
		threads,
		activeThreadId,
		setActiveThreadId,
		sendMessage,
		createNewThread,
		deleteThread,
		stop,
		isSending,
		isStreaming,
		isLoadingThreads,
		isLoadingMessages,
		error,
		errorInfo,
		retry,
		approvals,
		hasPendingApproval,
		approveTool,
		rejectTool,
		selectedModel,
		modelWarning,
		setThreadModel,
	} = chat;

	// ── Resilience hooks ──────────────────────────────────────────────
	const { status: connectionStatus, isOnline } = useConnectionStatus();
	const messageRetry = useMessageRetry(retry);
	const messageQueue = useMessageQueue(sendMessage, isOnline);

	// Auto-record failures for retry logic
	useEffect(() => {
		if (error && !isSending) {
			messageRetry.recordFailure();
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps -- only trigger on new errors
	}, [error, isSending, messageRetry.recordFailure]);

	// Reset retry state on successful send
	useEffect(() => {
		if (!error && !isSending && messageRetry.state !== "idle") {
			messageRetry.reset();
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [error, isSending, messageRetry.reset, messageRetry.state]);

	// Rate limit state from backend
	const isRateLimited = errorInfo?.type === "rate_limit";
	const rateLimitRetryAfter = isRateLimited ? (errorInfo?.retryAfter ?? 15) : 0;

	const hasAutoSelectedRef = useRef(false);
	const [threadBrowserOpen, setThreadBrowserOpen] = useState(false);

	// Sub-agent invocation tracking for progress/result cards
	const [subAgentInvocations, setSubAgentInvocations] = useState<
		SubAgentInvocation[]
	>([]);

	// Context awareness — auto-detect page context, allow manual clearing
	const routeContext = useAIContext();
	const [contextCleared, setContextCleared] = useState(false);
	const prevContextKeyRef = useRef<string | null>(null);

	// Reset cleared state when route context changes to a different entity
	const contextKey = routeContext
		? `${routeContext.type}:${routeContext.entityId}`
		: null;
	useEffect(() => {
		if (contextKey !== prevContextKeyRef.current) {
			prevContextKeyRef.current = contextKey;
			setContextCleared(false);
		}
	}, [contextKey]);

	const effectiveContext = contextCleared ? null : routeContext;

	// Auto-select the most recent thread when sidebar opens.
	// If no threads exist, the first sendMessage call will create one automatically.
	useEffect(() => {
		if (!isOpen) {
			hasAutoSelectedRef.current = false;
			return;
		}
		if (isLoadingThreads || activeThreadId || hasAutoSelectedRef.current) {
			return;
		}
		hasAutoSelectedRef.current = true;

		if (threads.length > 0) {
			setActiveThreadId(threads[0].threadId);
		} else {
			createNewThread();
		}
	}, [
		isOpen,
		isLoadingThreads,
		activeThreadId,
		threads,
		setActiveThreadId,
		createNewThread,
	]);

	// ── Focus management: auto-focus chat input when sidebar opens ───
	useEffect(() => {
		if (isOpen) {
			// Short delay to ensure DOM is ready after CSS transition starts
			const timer = setTimeout(() => {
				containerRef.current?.querySelector("textarea")?.focus();
			}, 100);
			return () => clearTimeout(timer);
		}
	}, [isOpen]);

	// ── Keyboard shortcuts: Cmd+N, Cmd+/, Escape ────────────────────
	useEffect(() => {
		if (!isOpen) return;

		function handleKeyDown(e: KeyboardEvent) {
			// Cmd+N — new thread
			if ((e.metaKey || e.ctrlKey) && e.key === "n") {
				e.preventDefault();
				createNewThread();
				return;
			}
			// Cmd+/ — focus chat input
			if ((e.metaKey || e.ctrlKey) && e.key === "/") {
				e.preventDefault();
				containerRef.current?.querySelector("textarea")?.focus();
				return;
			}
			// Escape — close sidebar (only if not already handled by autocomplete)
			if (e.key === "Escape" && !e.defaultPrevented) {
				e.preventDefault();
				onClose();
			}
		}

		document.addEventListener("keydown", handleKeyDown);
		return () => document.removeEventListener("keydown", handleKeyDown);
	}, [isOpen, createNewThread, onClose]);

	// Derive active thread title for header subtitle
	const activeThreadTitle = useMemo(() => {
		if (!activeThreadId) return undefined;
		const thread = threads.find((t) => t.threadId === activeThreadId);
		return thread?.title || "New conversation";
	}, [activeThreadId, threads]);
	const handleSubmit = useCallback(
		(
			text: string,
			systemPromptSuffix?: string,
			mentions?: import("@/hooks/use-mention-search").MentionReference[],
			files?: Pick<FileUIPart, "filename" | "mediaType" | "url">[],
		) => {
			// Queue messages when offline
			if (!isOnline) {
				messageQueue.enqueue({
					prompt: text,
					context: effectiveContext ?? undefined,
					systemPromptSuffix,
					mentions,
					files,
				});
				return;
			}
			messageRetry.reset();

			// Check for @agent mentions — route to sub-agent invocation
			const agentMention = mentions?.find((m) => m.entityType === "agent");
			if (agentMention) {
				// Remove the @AgentName from the prompt text
				const prompt = text
					.replace(new RegExp(`@${agentMention.displayName}\\s*`), "")
					.trim();

				// Invoke sub-agent with progress tracking
				const invocationId = `inv-${Date.now()}`;
				const agentName = agentMention.displayName ?? "Sub-Agent";

				// Add progress card immediately
				setSubAgentInvocations((prev) => [
					...prev,
					{
						id: invocationId,
						status: "progress",
						agentName,
						agentAvatar: undefined,
						executionType: "direct",
						startedAt: Date.now(),
					},
				]);

				(async () => {
					try {
						// Ensure we have a thread
						let threadId = activeThreadId;
						if (!threadId) {
							const created = await createThreadMutation({
								workspaceId,
								model: selectedModel,
								selectedMcpServerIds: chat.selectedMcpServerIds,
							});
							threadId = created.threadId;
							setActiveThreadId(threadId);
						}

						const result = await invokeSubAgentAction({
							subAgentId: agentMention.entityId as Id<"subAgents">,
							threadId,
							prompt: prompt || text,
							workspaceId,
							pageContext: effectiveContext?.summary,
						});

						// Update invocation state based on result
						if (result.workflowRunId) {
							// Workflow-backed: update to workflow mode
							setSubAgentInvocations((prev) =>
								prev.map((inv) =>
									inv.id === invocationId
										? {
												...inv,
												executionType: "workflow" as const,
												workflowRunId: result.workflowRunId,
											}
										: inv,
								),
							);
						} else if (result.error) {
							// Error: transition to error state
							setSubAgentInvocations((prev) =>
								prev.map((inv) =>
									inv.id === invocationId
										? {
												...inv,
												status: "error" as const,
												errorMessage: result.error,
												completedAt: Date.now(),
											}
										: inv,
								),
							);
						} else {
							// Direct execution complete: transition to result card
							setSubAgentInvocations((prev) =>
								prev.map((inv) =>
									inv.id === invocationId
										? {
												...inv,
												status: "result" as const,
												resultText:
													result.text ?? "Agent completed without output.",
												completedAt: Date.now(),
												threadId: result.threadId || undefined,
											}
										: inv,
								),
							);
						}
					} catch (err) {
						console.error(
							"[chat-sidebar] invokeSubAgent error:",
							err instanceof Error ? err.message : err,
						);
						// Transition to error state
						setSubAgentInvocations((prev) =>
							prev.map((inv) =>
								inv.id === invocationId
									? {
											...inv,
											status: "error" as const,
											errorMessage:
												err instanceof Error
													? err.message
													: "Sub-agent invocation failed",
											completedAt: Date.now(),
										}
									: inv,
							),
						);
					}
				})();
				return;
			}

			sendMessage(
				text,
				effectiveContext ?? undefined,
				systemPromptSuffix,
				mentions,
				files,
			);
		},
		[
			sendMessage,
			effectiveContext,
			isOnline,
			messageQueue,
			messageRetry,
			activeThreadId,
			createThreadMutation,
			invokeSubAgentAction,
			workspaceId,
			selectedModel,
			setActiveThreadId,
			chat.selectedMcpServerIds,
		],
	);

	const handleSuggestedPrompt = useCallback(
		(prompt: string) => {
			sendMessage(prompt, effectiveContext ?? undefined);
		},
		[sendMessage, effectiveContext],
	);

	const handleClearContext = useCallback(() => setContextCleared(true), []);

	const handleNewChat = useCallback(() => {
		createNewThread();
	}, [createNewThread]);

	const handleOpenHistory = useCallback(() => {
		setThreadBrowserOpen(true);
	}, []);

	// Thread browser: open thread inline (change active thread, don't navigate)
	const handleOpenThread = useCallback(
		(threadId: string) => {
			setActiveThreadId(threadId);
		},
		[setActiveThreadId],
	);

	const headerActions = (
		<SidebarHeaderActions
			onClose={onClose}
			onNewChat={handleNewChat}
			onOpenHistory={handleOpenHistory}
		/>
	);

	const contextChip = effectiveContext ? (
		<ContextChip context={effectiveContext} onClear={handleClearContext} />
	) : undefined;

	// Build workspace context for slash command prompts
	const slashCommandContext = useMemo(
		(): WorkspaceContext | undefined =>
			effectiveContext
				? {
						workspaceId: workspaceId as string,
						pageType: effectiveContext.type,
						entityId: effectiveContext.entityId,
						entityName: effectiveContext.entityName,
					}
				: { workspaceId: workspaceId as string },
		[workspaceId, effectiveContext],
	);

	const handleRateLimitComplete = useCallback(() => {
		messageRetry.triggerRetry();
	}, [messageRetry.triggerRetry]);

	// Loading state while threads initialize
	if (isLoadingThreads) {
		return (
			<div className="flex h-full w-full flex-col border-l border-border/40 bg-background">
				<ChatHeader actions={headerActions} />
				<div className="flex flex-1 flex-col gap-4 p-4">
					<Skeleton className="h-8 w-3/4" />
					<Skeleton className="h-8 w-1/2" />
					<Skeleton className="h-8 w-2/3" />
				</div>
			</div>
		);
	}

	return (
		<div
			ref={containerRef}
			className="flex h-full w-full flex-col border-l border-border/40 bg-background"
		>
			<ChatHeader
				subtitle={activeThreadTitle}
				actions={headerActions}
				contextChip={contextChip}
			/>

			{/* Connection / rate-limit banners */}
			<ConnectionBanner
				status={connectionStatus}
				queueLength={messageQueue.queueLength}
			/>
			{isRateLimited && (
				<RateLimitBanner
					retryAfter={rateLimitRetryAfter}
					onCountdownComplete={handleRateLimitComplete}
				/>
			)}

			{/* Conversation area with sub-agent invocation cards */}
			<ChatMessageList
				messages={messages}
				isSending={isSending}
				isStreaming={isStreaming}
				isLoadingMessages={isLoadingMessages}
				error={error}
				onRetry={messageRetry.triggerRetry}
				retryState={messageRetry.state}
				retryCountdown={messageRetry.countdown}
				onSuggestedPrompt={handleSuggestedPrompt}
				className="flex-1"
				approvals={approvals}
				onApproveTool={approveTool}
				onRejectTool={rejectTool}
				invocations={subAgentInvocations}
			/>

			{modelWarning && (
				<div className="px-3 pb-2">
					<p className="rounded border border-amber-300/50 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-500/30 dark:bg-amber-950/30 dark:text-amber-200">
						{modelWarning}
					</p>
				</div>
			)}

			{/* Input area */}
			<MentionAutocomplete
				workspaceId={workspaceId}
				onSubmit={handleSubmit}
				context={slashCommandContext}
				onStop={stop}
				disabled={hasPendingApproval || chat.hasPendingModeSuggestion}
				isSending={isSending}
				isStreaming={isStreaming}
				placeholder={
					hasPendingApproval
						? "Approve or reject the pending action first..."
						: chat.hasPendingModeSuggestion
							? "Click the button above to switch mode..."
							: "Ask your AI teammate..."
				}
				footerLeft={
					<div className="flex items-center gap-1.5">
						<ChatModeSelector
							mode={chat.chatMode}
							onChange={chat.setChatMode}
							disabled={isSending || isStreaming}
						/>
						<ModelSelector
							value={selectedModel}
							onValueChange={setThreadModel}
							disabled={isSending || isStreaming}
						/>
					</div>
				}
				actionMenuItems={
					<>
						<SkillsActionMenuItems
							skills={chat.skills}
							selectedIds={chat.selectedSkillIds}
							onChange={chat.setSelectedSkillIds}
						/>
						<SubAgentActionMenuItems
							subAgents={chat.subAgents}
							selectedId={chat.selectedSubAgentId}
							onChange={chat.setSelectedSubAgentId}
						/>
						<McpActionMenuItems
							servers={chat.mcpServers}
							selectedIds={chat.selectedMcpServerIds}
							onChange={chat.setThreadMcpServers}
						/>
					</>
				}
			/>

			{/* Thread browser popup (inline, no navigation) */}
			<ThreadBrowserPopup
				isOpen={threadBrowserOpen}
				onClose={() => setThreadBrowserOpen(false)}
				workspaceSlug={workspaceSlug}
				currentThreadId={activeThreadId ?? undefined}
				threads={threads}
				onOpenThread={handleOpenThread}
				onDeleteThread={deleteThread}
				onCreateNewThread={createNewThread}
				inlineMode
			/>
		</div>
	);
}

// ── Sidebar layout constants ─────────────────────────────────────────────

const SIDEBAR_CHAT_WIDTH = 400;
const SIDEBAR_EXPANDED_WIDTH = 820;
const ARTIFACT_DEFAULT_WIDTH = Math.round(SIDEBAR_EXPANDED_WIDTH * 0.4);
const ARTIFACT_MIN_WIDTH = 300;
const ARTIFACT_MAX_RATIO = 0.6;

// ── Drag handle ─────────────────────────────────────────────────────────

function DragHandle({
	onDragStart,
	valueNow,
}: {
	onDragStart: (e: React.MouseEvent) => void;
	valueNow: number;
}) {
	return (
		<div
			className="group flex w-1.5 shrink-0 cursor-col-resize items-center justify-center transition-colors hover:bg-primary/20 active:bg-primary/30"
			onMouseDown={onDragStart}
			role="slider"
			aria-label="Resize artifact panel"
			aria-valuenow={valueNow}
			aria-valuemin={ARTIFACT_MIN_WIDTH}
			aria-valuemax={Math.round(SIDEBAR_EXPANDED_WIDTH * ARTIFACT_MAX_RATIO)}
			tabIndex={0}
		>
			<div className="h-8 w-0.5 rounded-full bg-border transition-colors group-hover:bg-primary/50" />
		</div>
	);
}

// ── Sidebar Shell (push panel + mobile sheet + artifact split-view) ──────

export function AIChatSidebar() {
	return (
		<ArtifactPanelProvider>
			<AIChatSidebarInner />
		</ArtifactPanelProvider>
	);
}

function AIChatSidebarInner() {
	const { isOpen, close } = useAIChatPanel();
	const { isOpen: artifactOpen, closeArtifact } = useArtifactPanel();
	const isMobile = useIsMobile();
	const pathname = usePathname();
	const [isDragging, setIsDragging] = useState(false);
	const [artifactWidth, setArtifactWidth] = useState(ARTIFACT_DEFAULT_WIDTH);

	const maxArtifactWidth = Math.round(
		SIDEBAR_EXPANDED_WIDTH * ARTIFACT_MAX_RATIO,
	);
	const clampedArtifactWidth = Math.max(
		ARTIFACT_MIN_WIDTH,
		Math.min(artifactWidth, maxArtifactWidth),
	);

	const handleDragStart = useCallback(
		(e: React.MouseEvent) => {
			e.preventDefault();
			setIsDragging(true);
			const startX = e.clientX;
			const startWidth = artifactWidth;

			function onMouseMove(ev: MouseEvent) {
				// Dragging left (decreasing clientX) → increases artifact width
				const delta = startX - ev.clientX;
				const newWidth = Math.max(
					ARTIFACT_MIN_WIDTH,
					Math.min(startWidth + delta, maxArtifactWidth),
				);
				setArtifactWidth(newWidth);
			}

			function onMouseUp() {
				setIsDragging(false);
				document.removeEventListener("mousemove", onMouseMove);
				document.removeEventListener("mouseup", onMouseUp);
				document.body.style.cursor = "";
				document.body.style.userSelect = "";
			}

			document.body.style.cursor = "col-resize";
			document.body.style.userSelect = "none";
			document.addEventListener("mousemove", onMouseMove);
			document.addEventListener("mouseup", onMouseUp);
		},
		[artifactWidth, maxArtifactWidth],
	);

	// Don't render sidebar on /chat pages — the full-page chat UI handles it
	if (pathname.includes("/chat")) {
		return null;
	}

	// Mobile: chat sheet + artifact sheet overlay
	if (isMobile) {
		return (
			<>
				<Sheet open={isOpen} onOpenChange={(open) => !open && close()}>
					<SheetContent side="right" className="w-full p-0 sm:max-w-[400px]">
						<SheetHeader className="sr-only">
							<SheetTitle>AI Assistant</SheetTitle>
							<SheetDescription>AI chat panel</SheetDescription>
						</SheetHeader>
						<AIChatPanelContent onClose={close} />
					</SheetContent>
				</Sheet>
				<Sheet
					open={artifactOpen}
					onOpenChange={(open) => !open && closeArtifact()}
				>
					<SheetContent side="bottom" className="h-[85vh] rounded-t-xl p-0">
						<SheetHeader className="sr-only">
							<SheetTitle>Artifact</SheetTitle>
							<SheetDescription>View artifact content</SheetDescription>
						</SheetHeader>
						<ArtifactPanel />
					</SheetContent>
				</Sheet>
			</>
		);
	}

	// Desktop: push panel with optional artifact split-view
	const outerWidth = isOpen
		? artifactOpen
			? SIDEBAR_EXPANDED_WIDTH
			: SIDEBAR_CHAT_WIDTH
		: 0;

	// Inner container is always sized to the expanded width when artifact is
	// open. The outer overflow-hidden clips during the width transition,
	// creating a smooth "reveal from right" animation.
	const innerWidth = artifactOpen ? SIDEBAR_EXPANDED_WIDTH : SIDEBAR_CHAT_WIDTH;

	return (
		<div
			className={cn(
				"flex-shrink-0 overflow-hidden",
				!isDragging && "transition-[width] duration-300 ease-in-out",
			)}
			style={{ width: outerWidth }}
		>
			<div className="flex h-full" style={{ width: innerWidth }}>
				{/* Chat column */}
				<div className="min-w-0 flex-1">
					<AIChatPanelContent onClose={close} />
				</div>

				{/* Drag handle + artifact panel (only when open) */}
				{artifactOpen && (
					<>
						<DragHandle
							onDragStart={handleDragStart}
							valueNow={clampedArtifactWidth}
						/>
						<div
							className="shrink-0 overflow-hidden"
							style={{ width: clampedArtifactWidth }}
						>
							<div
								className="h-full"
								style={{ minWidth: clampedArtifactWidth }}
							>
								<ArtifactPanel />
							</div>
						</div>
					</>
				)}
			</div>
		</div>
	);
}
