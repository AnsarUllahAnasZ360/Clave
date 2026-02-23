"use client";

import type { FileUIPart } from "ai";
import { EyeOff, Search, SquarePen } from "lucide-react";
import type { Route } from "next";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import {
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
	useTransition,
} from "react";
import {
	ChatWelcomeScreen,
	SUGGESTION_CHIPS,
	SuggestionChip,
} from "@/components/ai/ChatWelcomeScreen";
import { ConnectionBanner } from "@/components/ai/ConnectionBanner";
import { McpActionMenuItems } from "@/components/ai/McpConnectorPicker";
import { MentionAutocomplete } from "@/components/ai/MentionAutocomplete";
import { SkillsActionMenuItems } from "@/components/ai/SkillsActionMenuItems";
import { SubAgentActionMenuItems } from "@/components/ai/SubAgentActionMenuItems";
import { ChatHeader, ContextChip, ModelSelector } from "@/components/ai/shared";
import { useWorkspace } from "@/components/providers/workspace-context";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { useAIChat } from "@/hooks/use-ai-chat";
import { useAIContext } from "@/hooks/use-ai-context";
import { useConnectionStatus } from "@/hooks/use-connection-status";
import type { WorkspaceContext } from "@/lib/ai/slash-commands";
import { cn } from "@/lib/utils";

const ThreadBrowserPopup = dynamic(
	() =>
		import("@/components/ai/ThreadBrowserPopup").then(
			(mod) => mod.ThreadBrowserPopup,
		),
	{
		loading: () => null,
	},
);

// ── Deferred suggestion chips ─────────────────────────────────────────────
// Rendered below the input after the page hydrates, so they never block LCP.

function DeferredSuggestions({
	onSelect,
	className,
}: {
	onSelect: (text: string) => void;
	className?: string;
}) {
	const [visible, setVisible] = useState(false);

	useEffect(() => {
		const id = setTimeout(() => setVisible(true), 280);
		return () => clearTimeout(id);
	}, []);

	return (
		<div
			className={cn(
				"flex flex-wrap justify-center gap-2 transition-all duration-500",
				visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-1",
				className,
			)}
		>
			{SUGGESTION_CHIPS.map((chip) => (
				<SuggestionChip key={chip} text={chip} onClick={onSelect} />
			))}
		</div>
	);
}

export default function ChatPage() {
	const router = useRouter();
	const { workspaceId, workspaceSlug, orgSlug } = useWorkspace();
	const chat = useAIChat(workspaceId);
	const routeContext = useAIContext();
	const { status: connectionStatus } = useConnectionStatus();
	const [contextCleared, setContextCleared] = useState(false);
	const prevContextKeyRef = useRef<string | null>(null);
	const [threadBrowserOpen, setThreadBrowserOpen] = useState(false);
	const hasNavigatedRef = useRef(false);
	const prefetchedRoutesRef = useRef(new Set<string>());
	const [, startNavigationTransition] = useTransition();

	// Reset cleared state when route context changes
	const contextKey = routeContext
		? `${routeContext.type}:${routeContext.entityId}`
		: null;
	useEffect(() => {
		if (contextKey === prevContextKeyRef.current) return;
		prevContextKeyRef.current = contextKey;
		setContextCleared(false);
	}, [contextKey]);
	const effectiveContext = contextCleared ? null : routeContext;
	const prefetchThreadRoute = useCallback(
		(threadId: string) => {
			const targetRoute =
				`/${orgSlug}/${workspaceSlug}/chat/${threadId}` as Route;
			if (prefetchedRoutesRef.current.has(targetRoute)) return;
			prefetchedRoutesRef.current.add(targetRoute);
			router.prefetch(targetRoute);
		},
		[orgSlug, workspaceSlug, router],
	);

	// Warm the dynamic thread route chunk early to reduce first-send navigation lag.
	useEffect(() => {
		const seedThreadId = chat.threads[0]?.threadId;
		if (!seedThreadId) return;
		void prefetchThreadRoute(seedThreadId);
	}, [chat.threads, prefetchThreadRoute]);

	// Navigate to thread when activeThreadId becomes set (after first message)
	useEffect(() => {
		if (!chat.activeThreadId || hasNavigatedRef.current) return;
		hasNavigatedRef.current = true;
		const targetRoute =
			`/${orgSlug}/${workspaceSlug}/chat/${chat.activeThreadId}` as Route;
		prefetchThreadRoute(chat.activeThreadId);
		startNavigationTransition(() => {
			router.replace(targetRoute);
		});
	}, [
		chat.activeThreadId,
		orgSlug,
		workspaceSlug,
		router,
		prefetchThreadRoute,
	]);

	const pageRef = useRef<HTMLDivElement>(null);

	const handleSubmit = useCallback(
		(
			text: string,
			systemPromptSuffix?: string,
			mentions?: import("@/hooks/use-mention-search").MentionReference[],
			files?: Pick<FileUIPart, "filename" | "mediaType" | "url">[],
		) => {
			chat.sendMessage(
				text,
				effectiveContext ?? undefined,
				systemPromptSuffix,
				mentions,
				files,
			);
		},
		[chat.sendMessage, effectiveContext],
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

	const handleSuggestionClick = useCallback(
		(text: string) => {
			void handleSubmit(text);
		},
		[handleSubmit],
	);

	const handleOpenThread = useCallback(
		(threadId: string) => {
			chat.setActiveThreadId(threadId);
		},
		[chat.setActiveThreadId],
	);

	const handleClearContext = useCallback(() => setContextCleared(true), []);

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

	const handleIncognito = useCallback(async () => {
		const newThreadId = await chat.createIncognitoThread();
		if (newThreadId) {
			router.push(`/${orgSlug}/${workspaceSlug}/chat/${newThreadId}` as Route);
		}
	}, [chat.createIncognitoThread, orgSlug, workspaceSlug, router]);

	const contextChip = effectiveContext ? (
		<ContextChip context={effectiveContext} onClear={handleClearContext} />
	) : undefined;

	return (
		<div ref={pageRef} className="flex h-full flex-1 flex-col">
			{/* Header */}
			<ChatHeader
				contextChip={contextChip}
				leftAction={
					<SidebarTrigger className="h-8 w-8 rounded-lg hover:bg-accent text-muted-foreground" />
				}
				actions={
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
						<button
							type="button"
							onClick={handleIncognito}
							className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
							aria-label="New private chat"
							title="Incognito"
						>
							<EyeOff className="size-4" />
						</button>
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
				}
			/>

			{/* Connection banner */}
			<ConnectionBanner status={connectionStatus} />

			{/* Centered landing — branding and input */}
			<div className="flex flex-1 flex-col items-center justify-center gap-6 px-6 pb-8">
				<ChatWelcomeScreen />

				{chat.modelWarning && (
					<div className="w-full max-w-3xl">
						<p className="rounded border border-amber-300/50 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-500/30 dark:bg-amber-950/30 dark:text-amber-200">
							{chat.modelWarning}
						</p>
					</div>
				)}

				<div className="w-full max-w-3xl">
					<MentionAutocomplete
						workspaceId={workspaceId}
						onSubmit={handleSubmit}
						context={slashCommandContext}
						onStop={chat.stop}
						disabled={chat.hasPendingApproval}
						isSending={chat.isSending}
						isStreaming={chat.isStreaming}
						placeholder="Ask your AI teammate..."
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
				</div>

				{/* Deferred suggestion chips — appear after page load */}
				<DeferredSuggestions
					onSelect={handleSuggestionClick}
					className="max-w-3xl"
				/>
			</div>

			{/* Thread browser popup */}
			<ThreadBrowserPopup
				isOpen={threadBrowserOpen}
				onClose={() => setThreadBrowserOpen(false)}
				workspaceSlug={workspaceSlug}
				threads={chat.threads}
				onOpenThread={handleOpenThread}
				onDeleteThread={chat.deleteThread}
				onCreateNewThread={chat.createNewThread}
			/>
		</div>
	);
}
