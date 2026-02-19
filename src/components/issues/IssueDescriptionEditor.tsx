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

interface IssueDescriptionEditorProps {
	issueId: Id<"issues">;
	initialContent?: string;
}

/** Try to parse a string as BlockNote JSON blocks. Returns undefined if not valid. */
function parseBlockNoteContent(content: string): Block[] | undefined {
	try {
		const parsed = JSON.parse(content);
		if (Array.isArray(parsed)) {
			return parsed as Block[];
		}
	} catch {
		// Not JSON
	}
	return undefined;
}

/** Convert a plain text string into BlockNote-compatible Block array */
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
		content: [{ type: "text" as const, text: line, styles: {} }],
		children: [],
	}));
}

export default function IssueDescriptionEditor({
	issueId,
	initialContent,
}: IssueDescriptionEditorProps) {
	const { resolvedTheme } = useTheme();
	const [mounted, setMounted] = useState(false);
	const updateIssue = useMutation(api.issues.update);
	const generateUploadUrl = useMutation(api.files.generateUploadUrl);
	const convex = useConvex();
	const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

	// Compute initial blocks with backward compatibility
	const initialBlocks = (() => {
		if (initialContent) {
			const parsed = parseBlockNoteContent(initialContent);
			if (parsed) return parsed;
			// Plain text fallback
			return plainTextToBlocks(initialContent);
		}
		return undefined;
	})();

	const editor = useCreateBlockNote({
		initialContent: initialBlocks,
		uploadFile,
	});

	const saveContent = useCallback(
		async (content: string) => {
			try {
				await updateIssue({
					issueId,
					description: content,
				});
			} catch {
				// Silently fail
			}
		},
		[issueId, updateIssue],
	);

	const handleChange = useCallback(() => {
		const content = JSON.stringify(editor.document);
		if (saveTimeoutRef.current) {
			clearTimeout(saveTimeoutRef.current);
		}
		saveTimeoutRef.current = setTimeout(() => {
			saveContent(content);
		}, 1000);
	}, [editor, saveContent]);

	// Clean up timeout on unmount
	useEffect(() => {
		return () => {
			if (saveTimeoutRef.current) {
				clearTimeout(saveTimeoutRef.current);
			}
		};
	}, []);

	if (!mounted) {
		return <IssueDescriptionEditorSkeleton />;
	}

	return (
		<div className="bn-container rounded-md border border-transparent hover:border-border transition-colors min-h-[80px] [&_.bn-editor]:!pl-0 [&_.bn-editor]:!pr-0">
			<BlockNoteView
				editor={editor}
				theme={resolvedTheme === "dark" ? "dark" : "light"}
				onChange={handleChange}
			/>
		</div>
	);
}

export function IssueDescriptionEditorSkeleton() {
	return (
		<div className="space-y-2 py-2">
			<div className="h-4 w-full animate-pulse rounded bg-muted" />
			<div className="h-4 w-3/4 animate-pulse rounded bg-muted" />
		</div>
	);
}
