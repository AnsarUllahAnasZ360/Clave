"use client";

import type { BlockNoteEditor } from "@blocknote/core";
import { CommentsExtension } from "@blocknote/core/comments";
import "@blocknote/core/fonts/inter.css";
import { filterSuggestionItems } from "@blocknote/core/extensions";
import {
	FloatingThreadController,
	getDefaultReactSlashMenuItems,
	SuggestionMenuController,
} from "@blocknote/react";
import { BlockNoteView } from "@blocknote/shadcn";
import "@blocknote/shadcn/style.css";
import { useBlockNoteSync } from "@convex-dev/prosemirror-sync/blocknote";
import { useConvex, useMutation, useQuery } from "convex/react";
import { useTheme } from "next-themes";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useConvexThreadStore } from "@/hooks/use-convex-thread-store";
import { useDocumentPresence } from "@/hooks/use-document-presence";
import { useResolveUsers } from "@/hooks/use-resolve-users";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { CollaborationCursors, cursorPluginKey } from "./cursor-decorations";
import { customBlockSchema } from "./custom-video-block";
import { GifPicker } from "./GifPicker";

interface DocumentEditorProps {
	documentId: Id<"documents">;
	onEditorReady?: (editor: BlockNoteEditor | null) => void;
}

/** Default empty BlockNote document in ProseMirror JSON format.
 *  Structure must match BlockNote's PM schema exactly:
 *  doc > blockGroup > blockContainer(id) > paragraph(textColor, backgroundColor, textAlignment)
 */
const DEFAULT_BLOCKNOTE_DOC = {
	type: "doc",
	content: [
		{
			type: "blockGroup",
			content: [
				{
					type: "blockContainer",
					attrs: { id: "titleBlock" },
					content: [
						{
							type: "heading",
							attrs: {
								textColor: "default",
								backgroundColor: "default",
								textAlignment: "left",
								level: 1,
							},
						},
					],
				},
				{
					type: "blockContainer",
					attrs: { id: "initialBlock" },
					content: [
						{
							type: "paragraph",
							attrs: {
								textColor: "default",
								backgroundColor: "default",
								textAlignment: "left",
							},
						},
					],
				},
			],
		},
	],
};

export default function DocumentEditor({
	documentId,
	onEditorReady,
}: DocumentEditorProps) {
	const { resolvedTheme } = useTheme();
	const [mounted, setMounted] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [gifPickerOpen, setGifPickerOpen] = useState(false);
	const creatingRef = useRef(false);
	const convex = useConvex();
	const generateUploadUrl = useMutation(api.files.generateUploadUrl);
	const currentUser = useQuery(api.users.current);

	// Thread store for inline comments
	const threadStore = useConvexThreadStore(
		documentId,
		currentUser?._id as string | undefined,
	);
	const resolveUsers = useResolveUsers();

	// Build CommentsExtension when store is ready
	const commentsExtension = useMemo(() => {
		if (!threadStore) return undefined;
		return CommentsExtension({
			threadStore,
			resolveUsers,
		});
	}, [threadStore, resolveUsers]);

	useEffect(() => {
		setMounted(true);
	}, []);

	const uploadFile = useCallback(
		async (file: File) => {
			const uploadUrl = await generateUploadUrl();
			const result = await fetch(uploadUrl, {
				method: "POST",
				headers: { "Content-Type": file.type },
				body: file,
			});
			const { storageId } = (await result.json()) as {
				storageId: Id<"_storage">;
			};
			const url = await convex.query(api.files.getUrl, { storageId });
			return url ?? "";
		},
		[convex, generateUploadUrl],
	);

	const sync = useBlockNoteSync<BlockNoteEditor>(
		api.prosemirrorSync,
		documentId,
		{
			editorOptions: {
				schema: customBlockSchema,
				uploadFile,
				extensions: commentsExtension ? [commentsExtension] : undefined,
				_tiptapOptions: {
					extensions: [CollaborationCursors],
				},
				// biome-ignore lint/suspicious/noExplicitAny: Custom schema type boundary with sync library
			} as any,
		},
	);

	// Presence hook for real-time collaboration cursors
	const { activeUsers, updateCursorPosition } = useDocumentPresence(
		documentId,
		currentUser?._id,
	);

	// Report local cursor/selection position changes to presence system
	useEffect(() => {
		if (!sync.editor) return;

		// Access the underlying Tiptap editor for selection events
		const tiptapEditor = (
			sync.editor as unknown as {
				_tiptapEditor: {
					on: (event: string, handler: () => void) => void;
					off: (event: string, handler: () => void) => void;
					state: { selection: { from: number; to: number } };
				};
			}
		)._tiptapEditor;
		if (!tiptapEditor) return;

		const handler = () => {
			const { from, to } = tiptapEditor.state.selection;
			updateCursorPosition(from, to);
		};

		tiptapEditor.on("selectionUpdate", handler);
		// Report initial position
		handler();

		return () => {
			tiptapEditor.off("selectionUpdate", handler);
		};
	}, [sync.editor, updateCursorPosition]);

	// Update remote cursor decorations when activeUsers data changes
	useEffect(() => {
		if (!sync.editor) return;

		const tiptapEditor = (
			sync.editor as unknown as {
				_tiptapEditor: {
					view: {
						state: {
							tr: {
								setMeta: (key: unknown, value: unknown) => unknown;
							};
						};
						dispatch: (tr: unknown) => void;
					};
				};
			}
		)._tiptapEditor;
		if (!tiptapEditor?.view) return;

		const { view } = tiptapEditor;
		const tr = view.state.tr.setMeta(cursorPluginKey, activeUsers);
		view.dispatch(tr);
	}, [sync.editor, activeUsers]);

	// Expose editor instance to parent
	useEffect(() => {
		onEditorReady?.(sync.editor ?? null);
	}, [sync.editor, onEditorReady]);

	// Auto-create initial ProseMirror snapshot when document has none
	useEffect(() => {
		if (
			!sync.isLoading &&
			!sync.editor &&
			"create" in sync &&
			!creatingRef.current
		) {
			creatingRef.current = true;
			sync
				.create(DEFAULT_BLOCKNOTE_DOC)
				.catch((err: unknown) => {
					setError(
						err instanceof Error ? err.message : "Failed to initialize editor",
					);
				})
				.finally(() => {
					creatingRef.current = false;
				});
		}
	}, [sync]);

	// Handle GIF selection: insert as image block
	const handleGifSelect = useCallback(
		(url: string) => {
			if (!sync.editor) return;
			const currentBlock = sync.editor.getTextCursorPosition().block;
			sync.editor.insertBlocks(
				[{ type: "image", props: { url } }],
				currentBlock,
				"after",
			);
		},
		[sync.editor],
	);

	if (!mounted || sync.isLoading) {
		return <DocumentEditorSkeleton />;
	}

	if (error) {
		return (
			<div className="flex flex-col items-center justify-center gap-2 p-8 text-sm text-muted-foreground">
				<p>Failed to load editor</p>
				<p className="text-xs">{error}</p>
			</div>
		);
	}

	if (!sync.editor) {
		return <DocumentEditorSkeleton />;
	}

	return (
		<div className="h-full doc-editor-container">
			<BlockNoteView
				editor={sync.editor}
				theme={resolvedTheme === "dark" ? "dark" : "light"}
				slashMenu={false}
			>
				<SuggestionMenuController
					triggerCharacter="/"
					getItems={async (query) =>
						filterSuggestionItems(
							[
								...getDefaultReactSlashMenuItems(sync.editor),
								{
									title: "GIF",
									onItemClick: () => setGifPickerOpen(true),
									aliases: ["gif", "giphy", "animated"],
									group: "Media",
									subtext: "Search and insert a GIF",
								},
							],
							query,
						)
					}
				/>
				{commentsExtension && <FloatingThreadController />}
			</BlockNoteView>
			<GifPicker
				open={gifPickerOpen}
				onOpenChange={setGifPickerOpen}
				onSelect={handleGifSelect}
			/>
		</div>
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
