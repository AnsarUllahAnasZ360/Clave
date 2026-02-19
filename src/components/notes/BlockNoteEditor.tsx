"use client";

import "@blocknote/core/fonts/inter.css";
import type { Block } from "@blocknote/core";
import { useCreateBlockNote } from "@blocknote/react";
import { BlockNoteView } from "@blocknote/shadcn";
import "@blocknote/shadcn/style.css";
import { useConvex, useMutation } from "convex/react";
import { useTheme } from "next-themes";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

interface NoteBlockNoteEditorProps {
	content?: string;
	editable?: boolean;
	onUpdate?: (jsonString: string) => void;
	placeholder?: string;
}

/** Try to parse a string as BlockNote JSON blocks (array of blocks). */
function parseBlockNoteBlocks(content: string): Block[] | undefined {
	try {
		const parsed = JSON.parse(content);
		if (Array.isArray(parsed)) {
			return parsed as Block[];
		}
	} catch {
		// Not valid JSON
	}
	return undefined;
}

/** Extract text from TipTap JSON and convert to BlockNote paragraph blocks. */
function tipTapToBlocks(content: string): Block[] | undefined {
	try {
		const doc = JSON.parse(content);
		if (doc?.type !== "doc" || !Array.isArray(doc.content)) return undefined;

		const blocks: Block[] = [];
		for (const node of doc.content) {
			const texts: string[] = [];
			function walkNode(n: { text?: string; content?: unknown[] }) {
				if (n.text) texts.push(n.text);
				if (Array.isArray(n.content)) {
					for (const child of n.content) {
						walkNode(child as { text?: string; content?: unknown[] });
					}
				}
			}
			walkNode(node);
			const text = texts.join("");
			blocks.push({
				id: crypto.randomUUID(),
				type: "paragraph" as const,
				props: {
					textColor: "default" as const,
					backgroundColor: "default" as const,
					textAlignment: "left" as const,
				},
				content: text ? [{ type: "text" as const, text, styles: {} }] : [],
				children: [],
			});
		}
		return blocks.length > 0 ? blocks : undefined;
	} catch {
		return undefined;
	}
}

/** Convert plain text string to BlockNote blocks. */
function plainTextToBlocks(text: string): Block[] {
	if (!text.trim()) return [];
	return text.split("\n").map((line) => ({
		id: crypto.randomUUID(),
		type: "paragraph" as const,
		props: {
			textColor: "default" as const,
			backgroundColor: "default" as const,
			textAlignment: "left" as const,
		},
		content: line ? [{ type: "text" as const, text: line, styles: {} }] : [],
		children: [],
	}));
}

/** Parse content string into BlockNote blocks, handling BlockNote JSON, TipTap JSON, or plain text. */
function parseContent(content: string | undefined): Block[] | undefined {
	if (!content) return undefined;

	// Try BlockNote JSON first (array of blocks)
	const bnBlocks = parseBlockNoteBlocks(content);
	if (bnBlocks) return bnBlocks;

	// Try TipTap JSON (object with type: "doc")
	const ttBlocks = tipTapToBlocks(content);
	if (ttBlocks) return ttBlocks;

	// Fallback: treat as plain text
	const ptBlocks = plainTextToBlocks(content);
	return ptBlocks.length > 0 ? ptBlocks : undefined;
}

export default function NoteBlockNoteEditor({
	content,
	editable = true,
	onUpdate,
}: NoteBlockNoteEditorProps) {
	const { resolvedTheme } = useTheme();
	const [mounted, setMounted] = useState(false);
	const onUpdateRef = useRef(onUpdate);
	onUpdateRef.current = onUpdate;
	const convex = useConvex();
	const generateUploadUrl = useMutation(api.files.generateUploadUrl);

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

	const initialBlocks = parseContent(content);

	const editor = useCreateBlockNote({
		initialContent: initialBlocks,
		uploadFile,
	});

	const handleChange = useCallback(() => {
		if (onUpdateRef.current) {
			onUpdateRef.current(JSON.stringify(editor.document));
		}
	}, [editor]);

	if (!mounted) {
		return <NoteBlockNoteEditorSkeleton />;
	}

	return (
		<div className="bn-container rounded-md border border-border bg-background min-h-[120px] [&_.bn-editor]:!pl-1 [&_.bn-editor]:!pr-1">
			<BlockNoteView
				editor={editor}
				editable={editable}
				theme={resolvedTheme === "dark" ? "dark" : "light"}
				onChange={handleChange}
			/>
		</div>
	);
}

export function NoteBlockNoteEditorSkeleton() {
	return (
		<div className="space-y-2 py-2 min-h-[120px]">
			<div className="h-4 w-full animate-pulse rounded bg-muted" />
			<div className="h-4 w-3/4 animate-pulse rounded bg-muted" />
			<div className="h-4 w-5/6 animate-pulse rounded bg-muted" />
		</div>
	);
}
