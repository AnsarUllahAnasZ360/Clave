"use client";

import "@blocknote/core/fonts/inter.css";
import { useCreateBlockNote } from "@blocknote/react";
import { BlockNoteView } from "@blocknote/shadcn";
import "@blocknote/shadcn/style.css";
import type { Block } from "@blocknote/core";
import { useConvex, useMutation } from "convex/react";
import { useTheme } from "next-themes";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

interface ProjectDescriptionEditorProps {
	projectId: Id<"projects">;
	initialContent?: string; // BlockNote JSON string (richDescription)
	plainTextFallback?: string; // Legacy plain text description
}

/** Convert a plain text string into a BlockNote-compatible Block array */
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

export default function ProjectDescriptionEditor({
	projectId,
	initialContent,
	plainTextFallback,
}: ProjectDescriptionEditorProps) {
	const { resolvedTheme } = useTheme();
	const [mounted, setMounted] = useState(false);
	const updateProject = useMutation(api.projects.update);
	const generateUploadUrl = useMutation(api.files.generateUploadUrl);
	const convex = useConvex();
	const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const latestContentRef = useRef<string | undefined>(initialContent);

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

	// Compute initial blocks
	const initialBlocks = (() => {
		if (initialContent) {
			try {
				return JSON.parse(initialContent) as Block[];
			} catch {
				// Invalid JSON, fall through
			}
		}
		if (plainTextFallback) {
			return plainTextToBlocks(plainTextFallback);
		}
		return undefined;
	})();

	const editor = useCreateBlockNote({
		initialContent: initialBlocks,
		uploadFile,
	});

	const saveContent = useCallback(
		async (content: string) => {
			latestContentRef.current = content;
			try {
				await updateProject({
					projectId,
					richDescription: content,
				});
			} catch {
				// Silently fail -- user will see stale content on reload
			}
		},
		[projectId, updateProject],
	);

	const handleChange = useCallback(() => {
		const content = JSON.stringify(editor.document);
		if (saveTimeoutRef.current) {
			clearTimeout(saveTimeoutRef.current);
		}
		saveTimeoutRef.current = setTimeout(() => {
			saveContent(content);
		}, 800);
	}, [editor, saveContent]);

	// Save on unmount if pending
	useEffect(() => {
		return () => {
			if (saveTimeoutRef.current) {
				clearTimeout(saveTimeoutRef.current);
			}
		};
	}, []);

	if (!mounted) {
		return <ProjectDescriptionEditorSkeleton />;
	}

	return (
		<section>
			<h3 className="text-sm font-medium text-muted-foreground mb-2">
				Description
			</h3>
			<div className="bn-container rounded-lg border border-border/50 hover:border-border bg-muted/20 px-3 py-2 transition-colors min-h-[100px] [&_.bn-editor]:!pl-0 [&_.bn-editor]:!pr-0">
				<BlockNoteView
					editor={editor}
					theme={resolvedTheme === "dark" ? "dark" : "light"}
					onChange={handleChange}
				/>
			</div>
		</section>
	);
}

export function ProjectDescriptionEditorSkeleton() {
	return (
		<section>
			<div className="h-4 w-20 animate-pulse rounded bg-muted mb-2" />
			<div className="space-y-2">
				<div className="h-4 w-full animate-pulse rounded bg-muted" />
				<div className="h-4 w-3/4 animate-pulse rounded bg-muted" />
			</div>
		</section>
	);
}
