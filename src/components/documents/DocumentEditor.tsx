"use client";

import { registerProviderType } from "@platejs/yjs";
import { YjsPlugin } from "@platejs/yjs/react";
import { useConvex, useMutation, useQuery } from "convex/react";
import { isUrl, KEYS } from "platejs";
import { createPlateEditor, Plate, type PlateEditor } from "platejs/react";
import type React from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

// ── Dev-only performance instrumentation ──────────────────────────────────
const __DEV__ = process.env.NODE_ENV === "development";

function perfMark(name: string) {
	if (__DEV__) {
		performance.mark(`doc-editor:${name}`);
	}
}

function perfLogSummary() {
	if (!__DEV__) return;
	try {
		const marks = performance
			.getEntriesByType("mark")
			.filter((m) => m.name.startsWith("doc-editor:"));
		if (marks.length === 0) return;
		const base = marks[0].startTime;
		const summary = marks.map(
			(m) =>
				`  ${m.name.replace("doc-editor:", "")} +${Math.round(m.startTime - base)}ms`,
		);
		console.log(`[DocEditor perf]\n${summary.join("\n")}`);
		// Clean up marks
		for (const m of marks) performance.clearMarks(m.name);
	} catch {
		// Ignore errors in perf logging
	}
}

import { AIEditorPlugin } from "@/components/ai/editor/ai-editor-plugin";
import { EditorAIBridge } from "@/components/ai/editor/EditorAIBridge";
import { useWorkspaceOptional } from "@/components/providers/workspace-context";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Editor, EditorContainer } from "@/components/ui/editor";
import { FixedToolbar } from "@/components/ui/fixed-toolbar";
import { FixedToolbarButtons } from "@/components/ui/fixed-toolbar-buttons";
import { Input } from "@/components/ui/input";
import { usePlateDiscussions } from "@/hooks/use-plate-discussions";
import { parseAnyContentToSlate } from "@/lib/content-converters";
import { ConvexYjsProvider } from "@/lib/convex-yjs-provider";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { createBasePlugins } from "../editor/plate-plugins";
import { DictationButton } from "./DictationButton";
import { GifPicker } from "./GifPicker";

// Register the Convex provider type for Plate's YjsPlugin
registerProviderType("convex", ConvexYjsProvider);

const CURSOR_COLORS = [
	"#ef4444",
	"#3b82f6",
	"#22c55e",
	"#eab308",
	"#a855f7",
	"#06b6d4",
	"#f97316",
	"#f87171",
];

/** Default empty Slate document for new Yjs documents. */
const DEFAULT_SLATE_VALUE = [{ type: "p", children: [{ text: "" }] }];

/** Interval for periodic content snapshot saving (ms). */
const SNAPSHOT_SAVE_INTERVAL_MS = 7_000;

interface DocumentEditorProps {
	documentId: Id<"documents">;
	onEditorReady?: (editor: PlateEditor | null) => void;
	shareMode?: boolean;
	heroSlot?: React.ReactNode;
}

/**
 * Collaborative Plate.js document editor with Yjs real-time sync via Convex.
 *
 * Outer component gates on `mounted` (SSR compat) and resolves the current
 * user + document metadata for cursor awareness and sync version detection
 * before mounting the inner editor.
 */
export default function DocumentEditor({
	documentId,
	onEditorReady,
	shareMode,
	heroSlot,
}: DocumentEditorProps) {
	perfMark("bundle-loaded");

	const currentUser = useQuery(
		api.users.current,
		shareMode ? "skip" : undefined,
	);
	const document = useQuery(api.documents.getById, { documentId });

	// Determine initial value for v1 documents (one-time migration).
	// Must be above early returns to satisfy the Rules of Hooks.
	// Optional chaining handles the loading state (document === undefined).
	// Memoized so DocumentEditorInner's Yjs init effect is not re-triggered
	// on unrelated re-renders (e.g. Convex query re-deliveries).
	const needsSyncUpgrade =
		!document?.syncVersion || document.syncVersion === "v1";
	const initialValue = useMemo(() => {
		const isV1 = !document?.syncVersion || document.syncVersion === "v1";
		const convertedContent =
			isV1 && document?.content
				? parseAnyContentToSlate(document.content)
				: undefined;
		return convertedContent ?? DEFAULT_SLATE_VALUE;
	}, [document?.content, document?.syncVersion]);

	// Note: mounted gate removed — this component is "use client" and loaded
	// via next/dynamic with ssr: false, so it never SSRs. Removing the
	// useState(false) + useEffect(setMounted(true)) saves a render cycle.

	// In auth mode, wait for current user to resolve for cursor info.
	// In share mode, render immediately (no user needed).
	// Always wait for document metadata to resolve for syncVersion detection.
	if ((!shareMode && currentUser === undefined) || document === undefined) {
		return <DocumentEditorSkeleton />;
	}

	perfMark("queries-resolved");

	return (
		<DocumentEditorInner
			documentId={documentId}
			onEditorReady={onEditorReady}
			shareMode={shareMode}
			heroSlot={heroSlot}
			currentUser={shareMode ? null : (currentUser ?? null)}
			initialValue={initialValue}
			needsSyncUpgrade={needsSyncUpgrade}
		/>
	);
}

// ── Inner editor — mounts once prerequisites are met ──────────────────────

interface CurrentUserInfo {
	_id: string;
	name?: string;
	email?: string;
}

interface DocumentEditorInnerProps {
	documentId: Id<"documents">;
	onEditorReady?: (editor: PlateEditor | null) => void;
	shareMode?: boolean;
	heroSlot?: React.ReactNode;
	currentUser: CurrentUserInfo | null;
	initialValue: Record<string, unknown>[];
	needsSyncUpgrade: boolean;
}

function DocumentEditorInner({
	documentId,
	onEditorReady,
	shareMode,
	heroSlot,
	currentUser,
	initialValue,
	needsSyncUpgrade,
}: DocumentEditorInnerProps) {
	const client = useConvex();
	const createDocument = useMutation(api.yjsSync.createDocument);
	const updateContent = useMutation(api.documents.updateContent);
	const [error, setError] = useState<string | null>(null);
	const [isSynced, setIsSynced] = useState(false);
	const [gifPickerOpen, setGifPickerOpen] = useState(false);
	const [embedDialogOpen, setEmbedDialogOpen] = useState(false);

	// Stable user info for cursor awareness
	const user = useMemo(() => {
		if (shareMode || !currentUser) return undefined;
		const hash = currentUser._id
			.split("")
			.reduce((a, c) => a + c.charCodeAt(0), 0);
		return {
			name: currentUser.name ?? currentUser.email ?? "Anonymous",
			color: CURSOR_COLORS[hash % CURSOR_COLORS.length],
		};
	}, [shareMode, currentUser]);

	// Refs for callbacks used inside useMemo (avoid re-creating editor)
	const userRef = useRef(user);
	userRef.current = user;
	const syncRef = useRef(setIsSynced);
	syncRef.current = setIsSynced;

	const workspace = useWorkspaceOptional();

	// Create Plate editor with all plugins + YjsPlugin for collaboration
	const editor = useMemo(() => {
		return createPlateEditor({
			plugins: [
				...createBasePlugins(),
				// Enable AI slash menu items (filtered by "ai-editor" plugin presence)
				...(!shareMode ? [AIEditorPlugin] : []),
				YjsPlugin.configure({
					options: {
						providers: [
							{
								type: "convex",
								options: {
									client,
									documentId,
									user: userRef.current,
								},
							},
							// biome-ignore lint/suspicious/noExplicitAny: Custom provider type not in YjsProviderConfig union
						] as any,
						cursors: userRef.current ? { data: userRef.current } : undefined,
						onSyncChange: ({ isSynced: synced }) => {
							syncRef.current(synced);
						},
					},
				}),
			],
		});
	}, [client, documentId, shareMode]);

	// Ensure Yjs document exists and initialize collaboration.
	// createDocument and yjs.init() run concurrently — createDocument is an
	// idempotent upsert and they don't share mutable state before sync.
	useEffect(() => {
		let cancelled = false;

		perfMark("yjs-init-start");

		async function init() {
			// Fire both concurrently:
			// 1. Ensure backend Yjs doc entry exists (idempotent, may fail in share mode)
			// 2. Init YjsPlugin — connects providers and binds Slate to Y.Doc
			const createDocPromise = createDocument({ documentId }).catch(() => {});
			const yjsInitPromise = editor.getApi(YjsPlugin).yjs.init({
				id: documentId,
				autoConnect: true,
				value: initialValue,
			});

			await Promise.all([createDocPromise, yjsInitPromise]);

			if (cancelled) {
				// Cleanup ran before init finished — destroy to leave editor clean
				editor.getApi(YjsPlugin).yjs.destroy();
				return;
			}
			perfMark("yjs-init-done");
		}

		init().catch((err) => {
			if (!cancelled) {
				setError(
					err instanceof Error ? err.message : "Failed to initialize editor",
				);
			}
		});

		// Always destroy on cleanup — yjs.destroy() is safe to call at any
		// init stage (providers list may be empty, wrapped in try/catch internally).
		// Previously guarded by `initialized`, which was only set after the async
		// await resolved — causing destroy() to be skipped on early unmounts and
		// leading to "already connected" on remount.
		return () => {
			cancelled = true;
			try {
				editor.getApi(YjsPlugin).yjs.destroy();
			} catch {
				// Ignore errors during cleanup
			}
		};
	}, [editor, documentId, createDocument, initialValue]);

	// Periodic Slate JSON snapshot saving to documents.content
	// Replicates the onSnapshot behavior from prosemirrorSync
	useEffect(() => {
		if (!isSynced) return;

		let lastSavedJson = "";
		let syncUpgraded = !needsSyncUpgrade;

		const interval = setInterval(() => {
			const json = JSON.stringify(editor.children);
			if (json !== lastSavedJson) {
				lastSavedJson = json;
				// On first save of a v1 doc, also upgrade syncVersion to v2
				if (!syncUpgraded) {
					syncUpgraded = true;
					updateContent({ documentId, content: json, syncVersion: "v2" }).catch(
						() => {},
					);
				} else {
					updateContent({ documentId, content: json }).catch(() => {});
				}
			}
		}, SNAPSHOT_SAVE_INTERVAL_MS);

		return () => {
			clearInterval(interval);
			// Final save on unmount — fire-and-forget
			const json = JSON.stringify(editor.children);
			if (json !== lastSavedJson) {
				if (!syncUpgraded) {
					updateContent({ documentId, content: json, syncVersion: "v2" }).catch(
						() => {},
					);
				} else {
					updateContent({ documentId, content: json }).catch(() => {});
				}
			}
		};
	}, [isSynced, editor, documentId, updateContent, needsSyncUpgrade]);

	// Expose editor instance to parent
	useEffect(() => {
		onEditorReady?.(editor);
		return () => onEditorReady?.(null);
	}, [editor, onEditorReady]);

	// Listen for slash menu GIF picker trigger
	useEffect(() => {
		const handler = () => setGifPickerOpen(true);
		window.addEventListener("plate:open-gif-picker", handler);
		return () => window.removeEventListener("plate:open-gif-picker", handler);
	}, []);

	// Listen for embed URL dialog trigger (from Insert menu / slash commands)
	useEffect(() => {
		const handler = () => setEmbedDialogOpen(true);
		window.addEventListener("plate:open-embed-url-dialog", handler);
		return () =>
			window.removeEventListener("plate:open-embed-url-dialog", handler);
	}, []);

	// Handle GIF selection: insert as image element via Plate API
	const handleGifSelect = useCallback(
		(url: string) => {
			editor.tf.insertNodes({
				type: KEYS.img,
				url,
				children: [{ text: "" }],
			});
		},
		[editor],
	);

	// Handle embed URL submission: insert as media_embed element
	const handleEmbedUrl = useCallback(
		(url: string) => {
			editor.tf.insertNodes({
				type: KEYS.mediaEmbed,
				url,
				children: [{ text: "" }],
			});
		},
		[editor],
	);

	// Log perf summary when editor becomes visible
	const prevSyncedRef = useRef(false);
	useEffect(() => {
		if (isSynced && !prevSyncedRef.current) {
			prevSyncedRef.current = true;
			perfMark("editor-visible");
			perfLogSummary();
		}
	}, [isSynced]);

	if (error) {
		return (
			<div className="flex flex-col items-center justify-center gap-2 p-8 text-sm text-muted-foreground">
				<p>Failed to load editor</p>
				<p className="text-xs">{error}</p>
			</div>
		);
	}

	return (
		<div className="flex flex-col h-full">
			<div className="relative flex flex-col flex-1 min-h-0">
				{/* Syncing overlay — shows a subtle indicator while Yjs connects */}
				{!isSynced && (
					<div className="absolute inset-0 z-10 flex items-start justify-center pt-16 pointer-events-none">
						<div className="flex items-center gap-2 rounded-md bg-muted/80 px-3 py-1.5 text-xs text-muted-foreground backdrop-blur-sm">
							<div className="h-3 w-3 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-muted-foreground" />
							Syncing…
						</div>
					</div>
				)}
				<Plate editor={editor}>
					{!shareMode && (
						<DiscussionsBridge
							documentId={documentId}
							userId={currentUser?._id}
						/>
					)}
					{!shareMode && workspace && (
						<EditorAIBridge
							context={{
								workspaceId: workspace.workspaceId,
								documentId,
							}}
						/>
					)}
					{/* Toolbar: non-scrolling, pinned below page header */}
					<div className="shrink-0">
						<FixedToolbar>
							<FixedToolbarButtons />
							{!shareMode && <DictationButton />}
						</FixedToolbar>
					</div>
					{/* Scrollable content: hero + editor */}
					<div className="flex-1 overflow-auto">
						{heroSlot && (
							<div className="mx-auto max-w-3xl px-8 pt-6">{heroSlot}</div>
						)}
						<EditorContainer className="overflow-y-visible">
							<Editor placeholder="Start writing..." autoFocus />
						</EditorContainer>
					</div>
				</Plate>
			</div>
			<GifPicker
				open={gifPickerOpen}
				onOpenChange={setGifPickerOpen}
				onSelect={handleGifSelect}
			/>
			<EmbedUrlDialog
				open={embedDialogOpen}
				onOpenChange={setEmbedDialogOpen}
				onSubmit={handleEmbedUrl}
			/>
		</div>
	);
}

/** Headless component that bridges Convex discussions to Plate's discussion plugin. */
function DiscussionsBridge({
	documentId,
	userId,
}: {
	documentId: Id<"documents">;
	userId: string | undefined;
}) {
	usePlateDiscussions(documentId, userId);
	return null;
}

/** Dialog for inserting a media embed via URL (replaces window.prompt). */
function EmbedUrlDialog({
	open,
	onOpenChange,
	onSubmit,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onSubmit: (url: string) => void;
}) {
	const [url, setUrl] = useState("");

	const handleSubmit = useCallback(() => {
		if (!isUrl(url)) return;
		onOpenChange(false);
		onSubmit(url);
		setUrl("");
	}, [url, onOpenChange, onSubmit]);

	return (
		<AlertDialog open={open} onOpenChange={onOpenChange}>
			<AlertDialogContent className="gap-6">
				<AlertDialogHeader>
					<AlertDialogTitle>Insert Embed</AlertDialogTitle>
				</AlertDialogHeader>
				<AlertDialogDescription className="group relative w-full">
					<label
						className="-translate-y-1/2 absolute top-1/2 block cursor-text px-1 text-muted-foreground/70 text-sm transition-all group-focus-within:pointer-events-none group-focus-within:top-0 group-focus-within:cursor-default group-focus-within:font-medium group-focus-within:text-foreground group-focus-within:text-xs has-[+input:not(:placeholder-shown)]:pointer-events-none has-[+input:not(:placeholder-shown)]:top-0 has-[+input:not(:placeholder-shown)]:cursor-default has-[+input:not(:placeholder-shown)]:font-medium has-[+input:not(:placeholder-shown)]:text-foreground has-[+input:not(:placeholder-shown)]:text-xs"
						htmlFor="embed-url"
					>
						<span className="inline-flex bg-background px-2">URL</span>
					</label>
					<Input
						id="embed-url"
						className="w-full"
						value={url}
						onChange={(e) => setUrl(e.target.value)}
						onKeyDown={(e) => {
							if (e.key === "Enter") handleSubmit();
						}}
						placeholder=""
						type="url"
						autoFocus
					/>
				</AlertDialogDescription>
				<AlertDialogFooter>
					<AlertDialogCancel onClick={() => setUrl("")}>
						Cancel
					</AlertDialogCancel>
					<AlertDialogAction
						onClick={(e) => {
							e.preventDefault();
							handleSubmit();
						}}
					>
						Accept
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}

export function DocumentEditorSkeleton() {
	return (
		<div className="flex flex-col gap-3 py-2">
			<div className="h-8 w-2/3 animate-pulse rounded bg-muted" />
			<div className="h-4 w-full animate-pulse rounded bg-muted" />
			<div className="h-4 w-5/6 animate-pulse rounded bg-muted" />
			<div className="h-4 w-3/4 animate-pulse rounded bg-muted" />
			<div className="mt-2 h-4 w-full animate-pulse rounded bg-muted" />
			<div className="h-4 w-4/5 animate-pulse rounded bg-muted" />
		</div>
	);
}
