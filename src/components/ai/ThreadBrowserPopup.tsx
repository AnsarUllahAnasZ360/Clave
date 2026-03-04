"use client";

import { useQuery } from "convex/react";
import { MessageSquare, Plus, Search, SearchX, X } from "lucide-react";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { Dialog as RadixDialog } from "radix-ui";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MessageResponse } from "@/components/ai-elements/message";
import { useWorkspaceOptional } from "@/components/providers/workspace-context";
import {
	Dialog,
	DialogDescription,
	DialogOverlay,
	DialogPortal,
	DialogTitle,
} from "@/components/ui/dialog";
import type { AIThread } from "@/hooks/use-ai-chat";
import { sanitizeHtml } from "@/lib/ai/sanitize";
import {
	formatThreadDate,
	type GroupedThreads,
	groupThreadsByTimePeriod,
} from "@/lib/thread-utils";
import { cn } from "@/lib/utils";
import { api } from "../../../convex/_generated/api";

// ── Types ─────────────────────────────────────────────────────────────────

export type ThreadBrowserPopupProps = {
	isOpen: boolean;
	onClose: () => void;
	workspaceSlug: string;
	currentThreadId?: string;
	threads: AIThread[];
	onOpenThread: (threadId: string) => void;
	onDeleteThread: (threadId: string) => Promise<void>;
	onCreateNewThread: () => Promise<string | undefined>;
	/** When true, only calls onOpenThread without navigating to /chat route */
	inlineMode?: boolean;
};

// ── Preview message type (from getMessages / @convex-dev/agent MessageDoc) ──

type PreviewMessageDoc = {
	message?: { role: string };
	text?: string;
	tool?: boolean;
};

// ── Preview Panel ─────────────────────────────────────────────────────────

const PREVIEW_MESSAGE_COUNT = 20;

const PreviewPanel = memo(function PreviewPanel({
	threadId,
}: {
	threadId: string | null;
}) {
	const rawMessages = useQuery(
		api.ai.chatQueries.getMessages,
		threadId ? { threadId } : "skip",
	) as PreviewMessageDoc[] | undefined;

	const messages = useMemo(() => {
		if (!rawMessages) return undefined;
		return rawMessages
			.filter(
				(m): m is PreviewMessageDoc & { text: string } =>
					Boolean(m.text) && !m.tool,
			)
			.map((m) => ({
				role: (m.message?.role === "user" ? "user" : "assistant") as
					| "user"
					| "assistant",
				text: m.text,
			}))
			.toReversed();
	}, [rawMessages]);

	const scrollRef = useRef<HTMLDivElement>(null);

	const messageCount = rawMessages?.length ?? 0;
	// biome-ignore lint/correctness/useExhaustiveDependencies: threadId and messageCount are intentional triggers
	useEffect(() => {
		const el = scrollRef.current;
		if (!el) return;
		requestAnimationFrame(() => {
			requestAnimationFrame(() => {
				el.scrollTop = el.scrollHeight;
			});
		});
	}, [threadId, messageCount]);

	if (!threadId) {
		return (
			<div className="flex h-full items-center justify-center text-sm text-muted-foreground/60">
				Select a thread to preview
			</div>
		);
	}

	if (!rawMessages || !messages) {
		return (
			<div className="flex h-full items-center justify-center">
				<div className="flex items-center gap-2 text-sm text-muted-foreground">
					<div className="size-1.5 animate-pulse rounded-full bg-muted-foreground/60" />
					<div className="size-1.5 animate-pulse rounded-full bg-muted-foreground/60 [animation-delay:150ms]" />
					<div className="size-1.5 animate-pulse rounded-full bg-muted-foreground/60 [animation-delay:300ms]" />
				</div>
			</div>
		);
	}

	const sliced = messages.slice(-PREVIEW_MESSAGE_COUNT);

	if (sliced.length === 0) {
		return (
			<div className="flex h-full items-center justify-center text-sm text-muted-foreground/60">
				No messages yet
			</div>
		);
	}

	return (
		<div
			ref={scrollRef}
			className="h-full overflow-y-auto scroll-smooth p-4 scrollbar-hide"
		>
			<div className="flex flex-col gap-3">
				{messages.length > PREVIEW_MESSAGE_COUNT && (
					<div className="text-center text-xs text-muted-foreground/50">
						{messages.length - PREVIEW_MESSAGE_COUNT} earlier messages
					</div>
				)}
				{sliced.map((msg, idx) => {
					const { role, text } = msg;
					const prevRole = idx > 0 ? sliced[idx - 1]?.role : null;
					const showLabel = role !== prevRole;
					return (
						<div
							key={`${threadId}-${idx}-${role}`}
							className={cn(
								"flex w-full flex-col gap-1",
								role === "user" ? "items-end" : "items-start",
							)}
						>
							{showLabel && (
								<span
									className={cn(
										"text-[10px] font-medium uppercase tracking-widest text-muted-foreground/50",
										role === "user" ? "pr-1" : "pl-1",
									)}
								>
									{role === "user" ? "You" : "Clave"}
								</span>
							)}
							<div
								className={cn(
									"max-w-[85%] rounded-2xl px-3.5 py-2.5 text-[13px] leading-relaxed",
									role === "user"
										? "rounded-br-md bg-primary text-primary-foreground"
										: "rounded-bl-md bg-muted/60 text-foreground",
								)}
							>
								{role === "assistant" ? (
									<MessageResponse className="text-[13px] [&_*]:text-[13px] [&_ul]:list-disc [&_ul]:pl-4 [&_ol]:list-decimal [&_ol]:pl-4 [&_li]:my-0.5">
										{text}
									</MessageResponse>
								) : (
									<span>{text}</span>
								)}
							</div>
						</div>
					);
				})}
				<div className="h-1" />
			</div>
		</div>
	);
});

// ── Thread List Item ──────────────────────────────────────────────────────

const ThreadListItem = memo(function ThreadListItem({
	thread,
	isSelected,
	isCurrent,
	onSelect,
	onOpen,
}: {
	thread: AIThread;
	isSelected: boolean;
	isCurrent: boolean;
	onSelect: (threadId: string) => void;
	onOpen: (threadId: string) => void;
}) {
	const handleClick = useCallback(() => {
		onSelect(thread.threadId);
	}, [thread.threadId, onSelect]);

	const handleDoubleClick = useCallback(() => {
		onOpen(thread.threadId);
	}, [thread.threadId, onOpen]);

	return (
		<button
			type="button"
			onClick={handleClick}
			onDoubleClick={handleDoubleClick}
			data-thread-id={thread.threadId}
			className={cn(
				"group/item flex w-full items-start gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm transition-colors",
				isSelected
					? "bg-accent text-accent-foreground"
					: "text-foreground/80 hover:bg-accent/50",
				isCurrent && "ring-1 ring-primary/30",
			)}
		>
			<MessageSquare className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
			<div className="flex min-w-0 flex-1 flex-col gap-0.5">
				<span className="truncate text-[13px] font-medium leading-snug">
					{thread.title || "New conversation"}
				</span>
				<span className="line-clamp-1 text-[11px] text-muted-foreground/60">
					{thread.model ? `${thread.model} · ` : ""}
					{formatThreadDate(thread.updatedAt)}
				</span>
			</div>
		</button>
	);
});

// ── Thread Browser Popup ──────────────────────────────────────────────────

export function ThreadBrowserPopup({
	isOpen,
	onClose,
	workspaceSlug,
	currentThreadId,
	threads,
	onOpenThread,
	onDeleteThread,
	onCreateNewThread,
	inlineMode = false,
}: ThreadBrowserPopupProps) {
	const router = useRouter();
	const workspace = useWorkspaceOptional();
	const [search, setSearch] = useState("");
	const [debouncedSearch, setDebouncedSearch] = useState("");
	const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
	const searchInputRef = useRef<HTMLInputElement>(null);

	// Debounce search input before sending to backend
	useEffect(() => {
		const timer = setTimeout(() => setDebouncedSearch(search), 300);
		return () => clearTimeout(timer);
	}, [search]);

	// Backend search — activated when debounced search is non-empty
	const backendResults = useQuery(
		api.ai.threads.searchThreads,
		workspace?.workspaceId && debouncedSearch.trim()
			? { workspaceId: workspace.workspaceId, query: debouncedSearch.trim() }
			: "skip",
	);

	const filteredThreads = useMemo(() => {
		const nonIncognito = threads.filter((t) => !t.isIncognito);
		if (!search.trim()) return nonIncognito;
		// Use backend results when available; fall back to client-side title filter while loading
		if (backendResults) return backendResults as AIThread[];
		const query = search.toLowerCase();
		return nonIncognito.filter((t) =>
			(t.title || "New conversation").toLowerCase().includes(query),
		);
	}, [threads, search, backendResults]);

	const groupedThreads = useMemo(
		() => groupThreadsByTimePeriod(filteredThreads),
		[filteredThreads],
	);

	const flatThreadIds = useMemo(
		() => groupedThreads.flatMap((g) => g.threads.map((t) => t.threadId)),
		[groupedThreads],
	);

	useEffect(() => {
		if (isOpen) {
			if (currentThreadId && flatThreadIds.includes(currentThreadId)) {
				setSelectedThreadId(currentThreadId);
			} else if (flatThreadIds.length > 0) {
				setSelectedThreadId(flatThreadIds[0]);
			} else {
				setSelectedThreadId(null);
			}
		}
	}, [isOpen, flatThreadIds, currentThreadId]);

	useEffect(() => {
		if (isOpen) {
			setSearch("");
			requestAnimationFrame(() => {
				searchInputRef.current?.focus();
			});
		}
	}, [isOpen]);

	const handleOpenThread = useCallback(
		(threadId: string) => {
			onOpenThread(threadId);
			if (!inlineMode) {
				router.push(`/${workspaceSlug}/chat/${threadId}` as Route);
			}
			onClose();
		},
		[workspaceSlug, router, onOpenThread, onClose, inlineMode],
	);

	const handleCreateNew = useCallback(async () => {
		await onCreateNewThread();
		onClose();
	}, [onCreateNewThread, onClose]);

	const handleDeleteSelected = useCallback(async () => {
		if (!selectedThreadId) return;
		await onDeleteThread(selectedThreadId);
		const currentIndex = flatThreadIds.indexOf(selectedThreadId);
		const nextId =
			flatThreadIds[currentIndex + 1] ??
			flatThreadIds[currentIndex - 1] ??
			null;
		setSelectedThreadId(nextId);
	}, [selectedThreadId, onDeleteThread, flatThreadIds]);

	const handleKeyDown = useCallback(
		(e: React.KeyboardEvent) => {
			switch (e.key) {
				case "ArrowDown": {
					e.preventDefault();
					const currentIdx = selectedThreadId
						? flatThreadIds.indexOf(selectedThreadId)
						: -1;
					const nextIdx = Math.min(currentIdx + 1, flatThreadIds.length - 1);
					if (flatThreadIds[nextIdx]) {
						setSelectedThreadId(flatThreadIds[nextIdx]);
						document
							.querySelector(`[data-thread-id="${flatThreadIds[nextIdx]}"]`)
							?.scrollIntoView({ block: "nearest" });
					}
					break;
				}
				case "ArrowUp": {
					e.preventDefault();
					const currentIdx = selectedThreadId
						? flatThreadIds.indexOf(selectedThreadId)
						: flatThreadIds.length;
					const nextIdx = Math.max(currentIdx - 1, 0);
					if (flatThreadIds[nextIdx]) {
						setSelectedThreadId(flatThreadIds[nextIdx]);
						document
							.querySelector(`[data-thread-id="${flatThreadIds[nextIdx]}"]`)
							?.scrollIntoView({ block: "nearest" });
					}
					break;
				}
				case "Enter": {
					e.preventDefault();
					if (selectedThreadId) {
						handleOpenThread(selectedThreadId);
					}
					break;
				}
				case "Backspace": {
					if (e.metaKey && selectedThreadId) {
						e.preventDefault();
						handleDeleteSelected();
					}
					break;
				}
			}
		},
		[selectedThreadId, flatThreadIds, handleOpenThread, handleDeleteSelected],
	);

	return (
		<Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
			<DialogPortal>
				<DialogOverlay className="bg-black/60 backdrop-blur-sm" />
				{/* Use RadixDialog.Content so react-remove-scroll registers its
				    contentRef as a scroll shard — without this, the overlay's
				    RemoveScroll blocks ALL wheel/touch scroll inside the dialog. */}
				<RadixDialog.Content
					className="fixed inset-0 z-50 flex items-center justify-center p-4 outline-none"
					onKeyDown={handleKeyDown}
					onOpenAutoFocus={(e) => e.preventDefault()}
				>
					<DialogTitle className="sr-only">Thread Browser</DialogTitle>
					<DialogDescription className="sr-only">
						Browse and manage your AI chat threads
					</DialogDescription>

					{/* Main container — CSS Grid with explicit rows/cols */}
					<div
						className="grid w-full max-w-[900px] overflow-hidden rounded-xl border border-border/60 bg-background shadow-2xl"
						style={{
							height: "min(640px, 80vh)",
							gridTemplateRows: "48px 1fr",
							gridTemplateColumns: "40% 1fr",
						}}
					>
						{/* Search bar — spans both columns */}
						<div className="col-span-2 flex items-center gap-3 border-b border-border/40 px-4">
							<Search className="size-4 shrink-0 text-muted-foreground" />
							<input
								ref={searchInputRef}
								type="text"
								placeholder="Search conversations..."
								value={search}
								onChange={(e) => setSearch(e.target.value)}
								className="flex-1 bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground/50"
							/>
							{search && (
								<button
									type="button"
									onClick={() => setSearch("")}
									className="flex size-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
								>
									<X className="size-3.5" />
								</button>
							)}
							<div className="ml-1 flex items-center gap-2">
								<kbd className="inline-flex h-5 min-w-5 items-center justify-center rounded border border-border/60 bg-muted/50 px-1.5 font-mono text-[10px] text-muted-foreground/60">
									esc
								</kbd>
								<button
									type="button"
									onClick={onClose}
									className="flex size-6 items-center justify-center rounded-md text-muted-foreground/60 transition-colors hover:bg-accent hover:text-foreground"
								>
									<X className="size-4" />
								</button>
							</div>
						</div>

						{/* ── Left panel — nested grid: thread list + footer ── */}
						<div
							className="grid min-h-0 border-r border-border/40"
							style={{ gridTemplateRows: "1fr 32px" }}
						>
							{/* Scrollable thread list */}
							<div className="min-h-0 overflow-y-auto scroll-smooth p-1.5 scrollbar-hide">
								<div className="mb-1">
									<button
										type="button"
										onClick={handleCreateNew}
										className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground"
									>
										<Plus className="size-3.5" />
										<span>New Chat</span>
									</button>
								</div>

								{groupedThreads.length === 0 ? (
									<div className="flex flex-col items-center gap-2 px-2.5 py-10 text-center">
										{search ? (
											<>
												<SearchX className="size-5 text-muted-foreground/40" />
												<div className="text-sm text-muted-foreground/60">
													No threads matching &ldquo;{search}&rdquo;
												</div>
												<button
													type="button"
													onClick={() => setSearch("")}
													className="text-xs text-primary hover:underline"
												>
													Clear search
												</button>
											</>
										) : (
											<>
												<MessageSquare className="size-5 text-muted-foreground/40" />
												<div className="text-sm text-muted-foreground/60">
													No conversations yet
												</div>
												<div className="text-xs text-muted-foreground/40">
													Start a new chat to get going
												</div>
											</>
										)}
									</div>
								) : (
									groupedThreads.map((group) => (
										<ThreadGroup
											key={group.label}
											group={group}
											selectedThreadId={selectedThreadId}
											currentThreadId={currentThreadId}
											onSelect={setSelectedThreadId}
											onOpen={handleOpenThread}
										/>
									))
								)}
							</div>

							{/* Footer — keyboard hints */}
							<div className="flex items-center gap-3 border-t border-border/40 px-3">
								<KeyHint label="Open" keys={["&#8629;"]} />
								<KeyHint label="Navigate" keys={["&#8593;", "&#8595;"]} />
								<KeyHint label="Delete" keys={["&#8984;", "&#9003;"]} />
							</div>
						</div>

						{/* ── Right panel — message preview ───────────────── */}
						<div className="min-h-0 overflow-hidden bg-muted/20">
							<PreviewPanel threadId={selectedThreadId} />
						</div>
					</div>
				</RadixDialog.Content>
			</DialogPortal>
		</Dialog>
	);
}

// ── Thread Group ──────────────────────────────────────────────────────────

function ThreadGroup<T extends AIThread>({
	group,
	selectedThreadId,
	currentThreadId,
	onSelect,
	onOpen,
}: {
	group: GroupedThreads<T>;
	selectedThreadId: string | null;
	currentThreadId?: string;
	onSelect: (threadId: string) => void;
	onOpen: (threadId: string) => void;
}) {
	return (
		<div className="mt-1">
			<div className="px-2.5 py-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground/50">
				{group.label}
			</div>
			{group.threads.map((thread) => (
				<ThreadListItem
					key={thread._id}
					thread={thread}
					isSelected={selectedThreadId === thread.threadId}
					isCurrent={currentThreadId === thread.threadId}
					onSelect={onSelect}
					onOpen={onOpen}
				/>
			))}
		</div>
	);
}

// ── Keyboard Hint ─────────────────────────────────────────────────────────

function KeyHint({ label, keys }: { label: string; keys: string[] }) {
	return (
		<div className="flex items-center gap-1 text-[11px] text-muted-foreground/50">
			{keys.map((key) => (
				<kbd
					key={key}
					className="inline-flex h-4 min-w-4 items-center justify-center rounded border border-border/40 bg-muted/40 px-0.5 font-mono text-[9px]"
					// biome-ignore lint/security/noDangerouslySetInnerHtml: static HTML entities sanitized via DOMPurify
					dangerouslySetInnerHTML={{ __html: sanitizeHtml(key) }}
				/>
			))}
			<span>{label}</span>
		</div>
	);
}
