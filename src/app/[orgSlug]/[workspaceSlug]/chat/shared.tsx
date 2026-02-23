"use client";

import type { FileUIPart } from "ai";
import { EyeOff, Search, SquarePen } from "lucide-react";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import {
	type RefObject,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { ContextChip } from "@/components/ai/shared";
import { useWorkspace } from "@/components/providers/workspace-context";
import { useAIChat } from "@/hooks/use-ai-chat";
import { useAIContext } from "@/hooks/use-ai-context";
import type { MentionReference } from "@/hooks/use-mention-search";
import type { WorkspaceContext } from "@/lib/ai/slash-commands";

export function useChatPageShared(threadId?: string) {
	const router = useRouter();
	const { workspaceId, workspaceSlug, orgSlug } = useWorkspace();
	const chat = useAIChat(workspaceId, threadId);
	const routeContext = useAIContext();
	const [contextCleared, setContextCleared] = useState(false);
	const prevContextKeyRef = useRef<string | null>(null);
	const [threadBrowserOpen, setThreadBrowserOpen] = useState(false);
	const pageRef = useRef<HTMLDivElement>(null);

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

	const handleClearContext = useCallback(() => setContextCleared(true), []);

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

	const handleNewChat = useCallback(async () => {
		const newThreadId = await chat.createNewThread();
		if (newThreadId) {
			router.push(`/${orgSlug}/${workspaceSlug}/chat/${newThreadId}` as Route);
		}
	}, [chat.createNewThread, orgSlug, workspaceSlug, router]);

	const handleIncognito = useCallback(async () => {
		const newThreadId = await chat.createIncognitoThread();
		if (newThreadId) {
			router.push(`/${orgSlug}/${workspaceSlug}/chat/${newThreadId}` as Route);
		}
	}, [chat.createIncognitoThread, orgSlug, workspaceSlug, router]);

	const handleSubmit = useCallback(
		(
			text: string,
			systemPromptSuffix?: string,
			mentions?: MentionReference[],
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

	const contextChip = effectiveContext ? (
		<ContextChip context={effectiveContext} onClear={handleClearContext} />
	) : undefined;

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

	return {
		router,
		workspaceId,
		workspaceSlug,
		orgSlug,
		chat,
		effectiveContext,
		slashCommandContext,
		contextChip,
		threadBrowserOpen,
		setThreadBrowserOpen,
		handleNewChat,
		handleIncognito,
		handleSubmit,
		pageRef,
	};
}

export function ChatPageHeaderActions({
	onSearchClick,
	onIncognitoClick,
	onNewChatClick,
	showIncognito = true,
}: {
	onSearchClick: () => void;
	onIncognitoClick: () => void;
	onNewChatClick: () => void;
	showIncognito?: boolean;
}) {
	return (
		<>
			<button
				type="button"
				onClick={onSearchClick}
				className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
				aria-label="Search threads"
				title="Search threads (⌘K)"
			>
				<Search className="size-4" />
			</button>
			{showIncognito && (
				<button
					type="button"
					onClick={onIncognitoClick}
					className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
					aria-label="New private chat"
					title="Incognito"
				>
					<EyeOff className="size-4" />
				</button>
			)}
			<button
				type="button"
				onClick={onNewChatClick}
				className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
				aria-label="New chat"
				title="New chat"
			>
				<SquarePen className="size-4" />
			</button>
		</>
	);
}
