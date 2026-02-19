"use client";

import "@blocknote/core/fonts/inter.css";
import { BlockNoteView } from "@blocknote/shadcn";
import "@blocknote/shadcn/style.css";
import { useCreateBlockNote } from "@blocknote/react";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

interface DocumentReadOnlyProps {
	content: string | undefined;
}

export function DocumentReadOnly({ content }: DocumentReadOnlyProps) {
	const { resolvedTheme } = useTheme();
	const [mounted, setMounted] = useState(false);

	const editor = useCreateBlockNote();

	useEffect(() => {
		setMounted(true);
	}, []);

	// Load content into the editor
	useEffect(() => {
		if (!editor || !content) return;
		try {
			const parsed = JSON.parse(content);
			if (parsed && parsed.type === "doc") {
				// ProseMirror document JSON from the sync system
				const tiptap = (
					editor as unknown as {
						_tiptapEditor: {
							commands: { setContent: (content: unknown) => void };
						};
					}
				)._tiptapEditor;
				if (tiptap) {
					tiptap.commands.setContent(parsed);
				}
			} else if (Array.isArray(parsed)) {
				// Legacy BlockNote block array
				editor.replaceBlocks(editor.document, parsed);
			}
		} catch {
			// Content is not valid JSON
		}
	}, [editor, content]);

	if (!mounted) {
		return <DocumentReadOnlySkeleton />;
	}

	return (
		<BlockNoteView
			editor={editor}
			editable={false}
			theme={resolvedTheme === "dark" ? "dark" : "light"}
		/>
	);
}

function DocumentReadOnlySkeleton() {
	return (
		<div className="flex flex-col gap-3 py-4">
			<div className="h-8 w-2/3 animate-pulse rounded bg-muted" />
			<div className="h-4 w-full animate-pulse rounded bg-muted" />
			<div className="h-4 w-5/6 animate-pulse rounded bg-muted" />
			<div className="h-4 w-3/4 animate-pulse rounded bg-muted" />
		</div>
	);
}
