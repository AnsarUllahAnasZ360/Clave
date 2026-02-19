"use client";

import {
	CaptureUpdateAction,
	Excalidraw,
	hashElementsVersion,
	MainMenu,
	reconcileElements,
	restoreElements,
} from "@excalidraw/excalidraw";
import type { RemoteExcalidrawElement } from "@excalidraw/excalidraw/data/reconcile";
import type { OrderedExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import type {
	AppState,
	BinaryFiles,
	ExcalidrawImperativeAPI,
} from "@excalidraw/excalidraw/types";
import type { SuggestionOptions } from "@tiptap/suggestion";
import { useConvex, useMutation, useQuery } from "convex/react";
import { useTheme } from "next-themes";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MentionItem } from "@/components/comments/MentionList";
import { createMentionSuggestion } from "@/components/comments/mention-suggestion";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import type { WhiteboardThread } from "./CommentPinsOverlay";
import { CommentPinsOverlay } from "./CommentPinsOverlay";
import { WhiteboardCommentsSidebar } from "./WhiteboardCommentsSidebar";
import "@excalidraw/excalidraw/index.css";
import "@/styles/excalidraw.css";

// Self-host Excalidraw fonts
if (typeof window !== "undefined") {
	// biome-ignore lint/suspicious/noExplicitAny: Excalidraw reads this global at runtime
	(window as any).EXCALIDRAW_ASSET_PATH = "/excalidraw-assets/";
}

const SAVE_DEBOUNCE_MS = 300;

interface WhiteboardEditorProps {
	whiteboardId: Id<"whiteboards">;
	commentMode?: boolean;
	workspaceId?: Id<"workspaces">;
	currentUserId?: string;
	workspaceSlug?: string;
}

export default function WhiteboardEditor({
	whiteboardId,
	commentMode = false,
	workspaceId,
	currentUserId,
	workspaceSlug,
}: WhiteboardEditorProps) {
	const { resolvedTheme } = useTheme();
	const [mounted, setMounted] = useState(false);
	const [excalidrawAPI, setExcalidrawAPI] =
		useState<ExcalidrawImperativeAPI | null>(null);
	const excalidrawAPIRef = useRef<ExcalidrawImperativeAPI | null>(null);

	const whiteboard = useQuery(api.whiteboards.getById, { whiteboardId });
	const updateSceneMutation = useMutation(api.whiteboards.updateScene);

	// Refs for debounced save and remote sync
	const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const lastSavedHashRef = useRef(0);
	const isRemoteUpdateRef = useRef(false);
	const lastRemoteTimestampRef = useRef(0);

	// Save status for user feedback
	const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">(
		"idle",
	);
	const savedResetRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	// ── Comment overlay state ──────────────────────────────────────────────
	const threads = useQuery(
		api.whiteboardComments.listByWhiteboard,
		workspaceId ? { whiteboardId } : "skip",
	);
	const createThreadMutation = useMutation(api.whiteboardComments.createThread);
	const addReplyMutation = useMutation(api.whiteboardComments.addReply);
	const resolveMutation = useMutation(api.whiteboardComments.resolve);
	const unresolveMutation = useMutation(api.whiteboardComments.unresolve);
	const editCommentMutation = useMutation(api.whiteboardComments.update);
	const deleteCommentMutation = useMutation(api.whiteboardComments.remove);

	const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
	const [pendingPin, setPendingPin] = useState<{
		canvasX: number;
		canvasY: number;
	} | null>(null);
	// Whether user clicked "Add comment" and is placing a pin on the canvas
	const [placingPin, setPlacingPin] = useState(false);

	// Mention suggestion for comment editors
	const convex = useConvex();
	const mentionSuggestion = useMemo<
		Omit<SuggestionOptions<MentionItem>, "editor"> | undefined
	>(() => {
		if (!workspaceId) return undefined;
		return createMentionSuggestion({
			fetchItems: async (query: string) => {
				const results = await convex.query(api.mentions.search, {
					workspaceId,
					term: query,
				});
				const items: MentionItem[] = [];
				for (const u of results.users) items.push({ type: "user", data: u });
				for (const d of results.documents)
					items.push({ type: "document", data: d });
				for (const w of results.whiteboards)
					items.push({ type: "whiteboard", data: w });
				return items;
			},
		});
	}, [workspaceId, convex]);

	const handlePinClick = useCallback((threadId: string) => {
		setActiveThreadId((prev) => (prev === threadId ? null : threadId));
		setPendingPin(null);
		setPlacingPin(false);
	}, []);

	const handleCanvasClick = useCallback(
		(canvasX: number, canvasY: number) => {
			if (!placingPin) return;
			setActiveThreadId(null);
			setPendingPin({ canvasX, canvasY });
		},
		[placingPin],
	);

	const handleCreateThread = useCallback(
		async (body: string) => {
			if (!pendingPin) return;
			await createThreadMutation({
				whiteboardId,
				canvasX: pendingPin.canvasX,
				canvasY: pendingPin.canvasY,
				body,
			});
			setPendingPin(null);
			setPlacingPin(false);
		},
		[pendingPin, whiteboardId, createThreadMutation],
	);

	const handleReply = useCallback(
		async (parentId: string, body: string) => {
			await addReplyMutation({
				parentId: parentId as Id<"comments">,
				body,
			});
		},
		[addReplyMutation],
	);

	const handleResolve = useCallback(
		async (commentId: string) => {
			await resolveMutation({ commentId: commentId as Id<"comments"> });
		},
		[resolveMutation],
	);

	const handleUnresolve = useCallback(
		async (commentId: string) => {
			await unresolveMutation({ commentId: commentId as Id<"comments"> });
		},
		[unresolveMutation],
	);

	const handleEditComment = useCallback(
		async (commentId: string, body: string) => {
			await editCommentMutation({
				commentId: commentId as Id<"comments">,
				body,
			});
		},
		[editCommentMutation],
	);

	const handleDeleteComment = useCallback(
		async (commentId: string) => {
			await deleteCommentMutation({ commentId: commentId as Id<"comments"> });
		},
		[deleteCommentMutation],
	);

	const handleStartPlacePin = useCallback(() => {
		setPlacingPin(true);
		setActiveThreadId(null);
		setPendingPin(null);
	}, []);

	const handleCancelPlacePin = useCallback(() => {
		setPlacingPin(false);
		setPendingPin(null);
	}, []);

	// Reset comment state when exiting comment mode
	useEffect(() => {
		if (!commentMode) {
			setPendingPin(null);
			setPlacingPin(false);
			setActiveThreadId(null);
		}
	}, [commentMode]);

	useEffect(() => {
		setMounted(true);
	}, []);

	// Flush pending save on unmount instead of discarding
	useEffect(() => {
		return () => {
			if (savedResetRef.current) {
				clearTimeout(savedResetRef.current);
			}
			if (saveTimeoutRef.current) {
				clearTimeout(saveTimeoutRef.current);
				saveTimeoutRef.current = null;
				const api = excalidrawAPIRef.current;
				if (api) {
					const elements = api.getSceneElementsIncludingDeleted();
					const appState = api.getAppState();
					if (elements.length > 0) {
						const hash = hashElementsVersion(elements);
						if (hash !== lastSavedHashRef.current) {
							updateSceneMutation({
								whiteboardId,
								sceneData: JSON.stringify(elements),
								appState: JSON.stringify({
									viewBackgroundColor: appState.viewBackgroundColor,
									gridSize: appState.gridSize,
								}),
							});
						}
					}
				}
			}
		};
	}, [whiteboardId, updateSceneMutation]);

	// Warn user about unsaved changes on page unload
	useEffect(() => {
		const handleBeforeUnload = (e: BeforeUnloadEvent) => {
			if (saveTimeoutRef.current) {
				e.preventDefault();
			}
		};
		window.addEventListener("beforeunload", handleBeforeUnload);
		return () => window.removeEventListener("beforeunload", handleBeforeUnload);
	}, []);

	// Remote sync: reconcile changes from other clients
	useEffect(() => {
		if (!excalidrawAPI || !whiteboard?.sceneData) return;

		try {
			const rawRemote = JSON.parse(whiteboard.sceneData);
			const restoredRemote = restoreElements(rawRemote, null);
			const remoteHash = hashElementsVersion(restoredRemote);
			const remoteTimestamp = whiteboard.updatedAt ?? 0;

			// Skip if this is our own save echoing back (hash matches AND no newer timestamp)
			if (
				remoteHash === lastSavedHashRef.current &&
				remoteTimestamp <= lastRemoteTimestampRef.current
			)
				return;
			lastRemoteTimestampRef.current = remoteTimestamp;

			// Get current local state (including deleted tombstones)
			const localElements = excalidrawAPI.getSceneElementsIncludingDeleted();
			const localAppState = excalidrawAPI.getAppState();

			// Element-level merge: union of all element IDs,
			// higher version wins per element, versionNonce breaks ties
			const reconciledElements = reconcileElements(
				localElements,
				restoredRemote as unknown as RemoteExcalidrawElement[],
				localAppState,
			);

			isRemoteUpdateRef.current = true;
			excalidrawAPI.updateScene({
				elements: reconciledElements,
				captureUpdate: CaptureUpdateAction.NEVER,
			});
			lastSavedHashRef.current = hashElementsVersion(reconciledElements);
			requestAnimationFrame(() => {
				isRemoteUpdateRef.current = false;
			});
		} catch {
			// Invalid JSON -- skip
		}
	}, [excalidrawAPI, whiteboard?.sceneData, whiteboard?.updatedAt]);

	// Debounced save handler
	const handleChange = useCallback(
		(
			elements: readonly OrderedExcalidrawElement[],
			appState: AppState,
			_files: BinaryFiles,
		) => {
			// Skip if this change is from a remote update
			if (isRemoteUpdateRef.current) return;

			if (saveTimeoutRef.current) {
				clearTimeout(saveTimeoutRef.current);
			}

			saveTimeoutRef.current = setTimeout(() => {
				const currentHash = hashElementsVersion(elements);
				if (currentHash === lastSavedHashRef.current) return;

				lastSavedHashRef.current = currentHash;

				// Keep ALL elements including isDeleted tombstones.
				// reconcileElements needs tombstones to propagate deletions.
				const minimalAppState = {
					viewBackgroundColor: appState.viewBackgroundColor,
					gridSize: appState.gridSize,
				};

				setSaveStatus("saving");
				updateSceneMutation({
					whiteboardId,
					sceneData: JSON.stringify(elements),
					appState: JSON.stringify(minimalAppState),
				})
					.then(() => {
						setSaveStatus("saved");
						if (savedResetRef.current) clearTimeout(savedResetRef.current);
						savedResetRef.current = setTimeout(
							() => setSaveStatus("idle"),
							2000,
						);
					})
					.catch(() => {
						setSaveStatus("idle");
					});
			}, SAVE_DEBOUNCE_MS);
		},
		[whiteboardId, updateSceneMutation],
	);

	if (!mounted || whiteboard === undefined) {
		return <WhiteboardEditorSkeleton />;
	}

	if (whiteboard === null) {
		return <WhiteboardEditorSkeleton />;
	}

	// Parse initial data from stored whiteboard
	let initialElements: OrderedExcalidrawElement[] = [];
	let initialAppState: Partial<AppState> = {};
	try {
		if (whiteboard.sceneData) {
			const raw = JSON.parse(whiteboard.sceneData);
			initialElements = restoreElements(raw, null);
			lastSavedHashRef.current = hashElementsVersion(initialElements);
		}
	} catch {
		// Invalid JSON -- start with empty canvas
	}
	try {
		if (whiteboard.appState) {
			initialAppState = JSON.parse(whiteboard.appState) as Partial<AppState>;
		}
	} catch {
		// Invalid JSON -- use defaults
	}

	return (
		<div className="flex h-full w-full">
			{/* Canvas area */}
			<div className="relative flex-1 min-w-0 excalidraw-clave">
				{saveStatus === "saving" && (
					<div className="absolute top-2 right-48 z-10 flex items-center gap-1.5 rounded-md bg-background/80 px-2 py-1 text-xs text-muted-foreground backdrop-blur-sm">
						<div className="h-2 w-2 animate-pulse rounded-full bg-sienna-9" />
						Saving...
					</div>
				)}
				{saveStatus === "saved" && (
					<div className="absolute top-2 right-48 z-10 flex items-center gap-1.5 rounded-md bg-background/80 px-2 py-1 text-xs text-muted-foreground backdrop-blur-sm">
						<div className="h-2 w-2 rounded-full bg-emerald-500" />
						Saved
					</div>
				)}
				<Excalidraw
					initialData={{
						elements: initialElements,
						appState: {
							...initialAppState,
							theme: resolvedTheme === "dark" ? "dark" : "light",
						},
					}}
					theme={resolvedTheme === "dark" ? "dark" : "light"}
					isCollaborating={true}
					onChange={handleChange}
					excalidrawAPI={(apiRef) => {
						excalidrawAPIRef.current = apiRef;
						setExcalidrawAPI(apiRef);
					}}
					UIOptions={{
						canvasActions: {
							toggleTheme: false,
						},
					}}
					libraryReturnUrl=""
					onLibraryChange={() => {}}
				>
					{/* Custom menu: removes Excalidraw social/branding links */}
					<MainMenu>
						<MainMenu.DefaultItems.LoadScene />
						<MainMenu.DefaultItems.SaveToActiveFile />
						<MainMenu.DefaultItems.Export />
						<MainMenu.DefaultItems.SaveAsImage />
						<MainMenu.DefaultItems.SearchMenu />
						<MainMenu.DefaultItems.Help />
						<MainMenu.DefaultItems.ClearCanvas />
						<MainMenu.Separator />
						<MainMenu.DefaultItems.ChangeCanvasBackground />
					</MainMenu>
				</Excalidraw>

				{/* Comment pins overlay -- only visible when sidebar is open */}
				{commentMode && (
					<CommentPinsOverlay
						threads={(threads ?? []) as WhiteboardThread[]}
						excalidrawAPI={excalidrawAPI}
						commentMode={commentMode}
						placingPin={placingPin}
						activeThreadId={activeThreadId}
						onPinClick={handlePinClick}
						onCanvasClick={handleCanvasClick}
					/>
				)}
			</div>

			{/* Comments sidebar -- visible when comment mode is active */}
			{commentMode && (
				<WhiteboardCommentsSidebar
					threads={(threads ?? []) as WhiteboardThread[]}
					activeThreadId={activeThreadId}
					pendingPin={pendingPin}
					currentUserId={currentUserId}
					workspaceSlug={workspaceSlug}
					mentionSuggestion={mentionSuggestion}
					placingPin={placingPin}
					onThreadSelect={setActiveThreadId}
					onStartPlacePin={handleStartPlacePin}
					onCancelPlacePin={handleCancelPlacePin}
					onCreateThread={handleCreateThread}
					onReply={handleReply}
					onResolve={handleResolve}
					onUnresolve={handleUnresolve}
					onEdit={handleEditComment}
					onDelete={handleDeleteComment}
				/>
			)}
		</div>
	);
}

export function WhiteboardEditorSkeleton() {
	return (
		<div className="flex h-full w-full items-center justify-center bg-background">
			<div className="flex flex-col items-center gap-3">
				<div className="h-10 w-10 animate-spin rounded-full border-2 border-muted border-t-sienna-9" />
				<p className="text-sm text-muted-foreground">Loading whiteboard...</p>
			</div>
		</div>
	);
}
