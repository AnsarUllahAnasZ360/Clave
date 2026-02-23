"use client";

import type { FileUIPart } from "ai";
import { EyeOff, Search, SquarePen } from "lucide-react";
import type { Route } from "next";
import dynamic from "next/dynamic";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ConnectionBanner } from "@/components/ai/ConnectionBanner";
import { McpActionMenuItems } from "@/components/ai/McpConnectorPicker";
import { MentionAutocomplete } from "@/components/ai/MentionAutocomplete";
import { SkillsActionMenuItems } from "@/components/ai/SkillsActionMenuItems";
import { SubAgentActionMenuItems } from "@/components/ai/SubAgentActionMenuItems";
import {
	ChatHeader,
	ContextChip,
	ConversationView,
	ModelSelector,
} from "@/components/ai/shared";
import { useWorkspace } from "@/components/providers/workspace-context";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { useAIChat } from "@/hooks/use-ai-chat";
import { useAIContext } from "@/hooks/use-ai-context";
import { useConnectionStatus } from "@/hooks/use-connection-status";
import { useMessageQueue } from "@/hooks/use-message-queue";
import { useMessageRetry } from "@/hooks/use-message-retry";
import type { WorkspaceContext } from "@/lib/ai/slash-commands";

const ThreadBrowserPopup = dynamic(
	() =>
		import("@/components/ai/ThreadBrowserPopup").then(
			(mod) => mod.ThreadBrowserPopup,
		),
	{
		loading: () => null,
	},
);

const RateLimitBanner = dynamic(
	() =>
		import("@/components/ai/RateLimitBanner").then(
			(mod) => mod.RateLimitBanner,
		),
	{
		loading: () => null,
	},
);

export default function ChatThreadPage() {
	const params = useParams();
	const router = useRouter();
	const threadId = params.threadId as string;
	const { workspaceId, workspaceSlug, orgSlug } = useWorkspace();
	const chat = useAIChat(workspaceId, threadId);
	const routeContext = useAIContext();
	const [contextCleared, setContextCleared] = useState(false);
	const prevContextKeyRef = useRef<string | null>(null);
	const [threadBrowserOpen, setThreadBrowserOpen] = useState(false);

	// ── Resilience hooks ──────────────────────────────────────────────
	const { status: connectionStatus, isOnline } = useConnectionStatus();
	const messageRetry = useMessageRetry(chat.retry);
	const messageQueue = useMessageQueue(chat.sendMessage, isOnline);

	// Auto-record failures for retry logic
	useEffect(() => {
		if (chat.error && !chat.isSending) {
			messageRetry.recordFailure();
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [chat.error, chat.isSending, messageRetry.recordFailure]);

	// Reset retry state on successful send
	useEffect(() => {
		if (!chat.error && !chat.isSending && messageRetry.state !== "idle") {
			messageRetry.reset();
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [chat.error, chat.isSending, messageRetry.reset, messageRetry.state]);

	const isRateLimited = chat.errorInfo?.type === "rate_limit";
	const rateLimitRetryAfter = isRateLimited
		? (chat.errorInfo?.retryAfter ?? 15)
		: 0;

	// Reset cleared state when route context changes
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

	const handleClearContext = useCallback(() => setContextCleared(true), []);

	// Sync activeThreadId from URL param
	useEffect(() => {
		chat.setActiveThreadId(threadId);
	}, [threadId, chat.setActiveThreadId]);

	const pageRef = useRef<HTMLDivElement>(null);

	const handleSubmit = useCallback(
		(
			text: string,
			systemPromptSuffix?: string,
			mentions?: import("@/hooks/use-mention-search").MentionReference[],
			files?: Pick<FileUIPart, "filename" | "mediaType" | "url">[],
		) => {
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
			chat.sendMessage(
				text,
				effectiveContext ?? undefined,
				systemPromptSuffix,
				mentions,
				files,
			);
		},
		[chat.sendMessage, effectiveContext, isOnline, messageQueue, messageRetry],
	);

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

	const handleSuggestedPrompt = useCallback(
		(prompt: string) => {
			chat.sendMessage(prompt, effectiveContext ?? undefined);
		},
		[chat.sendMessage, effectiveContext],
	);

	const handleOpenThread = useCallback(
		(openThreadId: string) => {
			chat.setActiveThreadId(openThreadId);
			router.push(`/${orgSlug}/${workspaceSlug}/chat/${openThreadId}` as Route);
		},
		[chat.setActiveThreadId, orgSlug, workspaceSlug, router],
	);

	const handleIncognito = useCallback(async () => {
		const newThreadId = await chat.createIncognitoThread();
		if (newThreadId) {
			router.push(`/${orgSlug}/${workspaceSlug}/chat/${newThreadId}` as Route);
		}
	}, [chat.createIncognitoThread, orgSlug, workspaceSlug, router]);

	const handleNewChat = useCallback(async () => {
		const newThreadId = await chat.createNewThread();
		if (newThreadId) {
			router.push(`/${orgSlug}/${workspaceSlug}/chat/${newThreadId}` as Route);
		}
	}, [chat.createNewThread, orgSlug, workspaceSlug, router]);

	// Keyboard shortcuts: Cmd+K (thread browser), Cmd+N (new thread), Cmd+/ (focus input)
	useEffect(() => {
		function handleKeyDown(e: KeyboardEvent) {
			if ((e.metaKey || e.ctrlKey) && e.key === "k") {
				e.preventDefault();
				setThreadBrowserOpen(true);
			}
			if ((e.metaKey || e.ctrlKey) && e.key === "n") {
				e.preventDefault();
				handleNewChat();
			}
			if ((e.metaKey || e.ctrlKey) && e.key === "/") {
				e.preventDefault();
				pageRef.current?.querySelector("textarea")?.focus();
			}
		}
		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, [handleNewChat]);

	// Navigate when activeThreadId changes (from incognito/new thread)
	const prevActiveRef = useRef<string | null>(threadId);
	useEffect(() => {
		if (
			chat.activeThreadId &&
			chat.activeThreadId !== threadId &&
			chat.activeThreadId !== prevActiveRef.current
		) {
			prevActiveRef.current = chat.activeThreadId;
			router.push(
				`/${orgSlug}/${workspaceSlug}/chat/${chat.activeThreadId}` as Route,
			);
		}
	}, [chat.activeThreadId, threadId, orgSlug, workspaceSlug, router]);

	// Handle delete of current thread — navigate to next or /chat
	const handleDeleteThread = useCallback(
		async (deleteThreadId: string) => {
			await chat.deleteThread(deleteThreadId);
			if (deleteThreadId === threadId) {
				// Find next thread to navigate to
				const remaining = chat.threads.filter(
					(t) => t.threadId !== deleteThreadId,
				);
				if (remaining.length > 0) {
					router.replace(
						`/${orgSlug}/${workspaceSlug}/chat/${remaining[0].threadId}` as Route,
					);
				} else {
					router.replace(`/${orgSlug}/${workspaceSlug}/chat` as Route);
				}
			}
		},
		[chat.deleteThread, chat.threads, threadId, orgSlug, workspaceSlug, router],
	);

	// Context chip
	const contextChip = effectiveContext ? (
		<ContextChip context={effectiveContext} onClear={handleClearContext} />
	) : undefined;

	// Header actions — consistent order: Search, EyeOff, SquarePen
	const headerActions = (
		<>
			<button
				type="button"
				onClick={() => setThreadBrowserOpen(true)}
				className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
				aria-label="Search threads"
				title="Search threads (⌘K)"
			>
				<Search className="size-4" />
			</button>
			{!chat.isIncognito && (
				<button
					type="button"
					onClick={handleIncognito}
					className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
					aria-label="New private chat"
					title="Incognito"
				>
					<EyeOff className="size-4" />
				</button>
			)}
			<button
				type="button"
				onClick={handleNewChat}
				className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
				aria-label="New chat"
				title="New chat"
			>
				<SquarePen className="size-4" />
			</button>
		</>
	);

	// Don't block the whole page on thread list loading — messages load independently

	return (
		<div ref={pageRef} className="flex h-full flex-1 flex-col">
			{/* Header */}
			<ChatHeader
				title={chat.isIncognito ? "Temporary Chat" : undefined}
				contextChip={contextChip}
				actions={headerActions}
				leftAction={
					<SidebarTrigger className="h-8 w-8 rounded-lg hover:bg-accent text-muted-foreground" />
				}
			>
				{chat.isIncognito && (
					<EyeOff className="ml-2 size-3.5 text-muted-foreground" />
				)}
			</ChatHeader>

			{/* Connection / rate-limit banners */}
			<ConnectionBanner
				status={connectionStatus}
				queueLength={messageQueue.queueLength}
			/>
			{isRateLimited && rateLimitRetryAfter > 0 && (
				<RateLimitBanner
					retryAfter={rateLimitRetryAfter}
					onCountdownComplete={messageRetry.triggerRetry}
				/>
			)}

			{/* Conversation — centered column */}
			<div className="mx-auto flex w-full max-w-4xl flex-1 flex-col min-h-0">
				<ConversationView
					messages={chat.messages}
					isSending={chat.isSending}
					isStreaming={chat.isStreaming}
					isLoadingMessages={chat.isLoadingMessages}
					error={chat.error}
					onRetry={messageRetry.triggerRetry}
					retryState={messageRetry.state}
					retryCountdown={messageRetry.countdown}
					onSuggestedPrompt={
						chat.isIncognito ? undefined : handleSuggestedPrompt
					}
					className="flex-1"
					approvals={chat.approvals}
					onApproveTool={chat.approveTool}
					onRejectTool={chat.rejectTool}
					isIncognito={chat.isIncognito}
				/>

				{chat.modelWarning && (
					<div className="mb-3 px-4">
						<p className="rounded border border-amber-300/50 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-500/30 dark:bg-amber-950/30 dark:text-amber-200">
							{chat.modelWarning}
						</p>
					</div>
				)}

				{/* Input */}
				<MentionAutocomplete
					workspaceId={workspaceId}
					onSubmit={handleSubmit}
					context={slashCommandContext}
					onStop={chat.stop}
					disabled={chat.hasPendingApproval}
					isSending={chat.isSending}
					isStreaming={chat.isStreaming}
					placeholder={
						chat.hasPendingApproval
							? "Approve or reject the pending action first..."
							: chat.isIncognito
								? "This conversation won't be saved..."
								: "Ask your AI teammate..."
					}
					footerLeft={
						<ModelSelector
							value={chat.selectedModel}
							onValueChange={chat.setThreadModel}
							disabled={chat.isSending || chat.isStreaming}
						/>
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
				{!chat.isIncognito && (
					<p className="animate-[fadeOut_0.5s_ease-out_4s_forwards] pb-3 text-center text-xs text-muted-foreground">
						Press{" "}
						<kbd className="rounded border bg-muted px-1 py-0.5 font-mono text-[10px]">
							⌘K
						</kbd>{" "}
						to search threads
					</p>
				)}
			</div>

			{/* Thread browser popup */}
			<ThreadBrowserPopup
				isOpen={threadBrowserOpen}
				onClose={() => setThreadBrowserOpen(false)}
				workspaceSlug={workspaceSlug}
				currentThreadId={threadId}
				threads={chat.threads}
				onOpenThread={handleOpenThread}
				onDeleteThread={handleDeleteThread}
				onCreateNewThread={chat.createNewThread}
			/>
		</div>
	);
}
