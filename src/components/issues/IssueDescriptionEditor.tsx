"use client";

import { useMutation } from "convex/react";
import type { Value } from "platejs";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AIEditorPlugin } from "@/components/ai/editor/ai-editor-plugin";
import { EditorAIBridge } from "@/components/ai/editor/EditorAIBridge";
import { DraftDescriptionButton } from "@/components/ai/issues/DraftDescriptionButton";
import { PlateEditor } from "@/components/editor/plate-editor";
import { useWorkspaceOptional } from "@/components/providers/workspace-context";
import { parseAnyContentToSlate } from "@/lib/content-converters";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

interface IssueDescriptionEditorProps {
	issueId: Id<"issues">;
	initialContent?: string;
	issueTitle?: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function IssueDescriptionEditor({
	issueId,
	initialContent,
	issueTitle,
}: IssueDescriptionEditorProps) {
	const [mounted, setMounted] = useState(false);
	const updateIssue = useMutation(api.issues.update);
	const workspace = useWorkspaceOptional();
	const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const pendingSaveRef = useRef<string | null>(null);
	const lastSavedRef = useRef<string | null>(null);
	// Local content override for when AI drafts a new description
	const [contentOverride, setContentOverride] = useState<string | undefined>(
		undefined,
	);
	const [editorKey, setEditorKey] = useState(0);

	useEffect(() => {
		setMounted(true);
	}, []);

	const activeContent = contentOverride ?? initialContent;
	const initialValue = useMemo(
		() => parseAnyContentToSlate(activeContent) as Value | undefined,
		[activeContent],
	);
	const serializedInitialValue = useMemo(
		() => (initialValue ? JSON.stringify(initialValue) : null),
		[initialValue],
	);

	useEffect(() => {
		pendingSaveRef.current = null;
		lastSavedRef.current = serializedInitialValue;
	}, [serializedInitialValue]);

	const flushPendingSave = useCallback(() => {
		const nextValue = pendingSaveRef.current;
		if (!nextValue || nextValue === lastSavedRef.current) {
			return;
		}

		pendingSaveRef.current = null;
		const previousSaved = lastSavedRef.current;
		lastSavedRef.current = nextValue;

		updateIssue({
			issueId,
			description: nextValue,
		}).catch(() => {
			lastSavedRef.current = previousSaved;
			pendingSaveRef.current = nextValue;
		});
	}, [issueId, updateIssue]);

	// Clean up save timeout on unmount and flush latest pending content.
	useEffect(() => {
		return () => {
			if (saveTimeoutRef.current) {
				clearTimeout(saveTimeoutRef.current);
			}
			flushPendingSave();
		};
	}, [flushPendingSave]);

	const handleChange = useCallback(
		(value: Value) => {
			const serialized = JSON.stringify(value);
			if (serialized === lastSavedRef.current) {
				pendingSaveRef.current = null;
				return;
			}

			pendingSaveRef.current = serialized;
			if (saveTimeoutRef.current) {
				clearTimeout(saveTimeoutRef.current);
			}
			saveTimeoutRef.current = setTimeout(() => {
				flushPendingSave();
			}, 1000);
		},
		[flushPendingSave],
	);

	const handleDraft = useCallback(
		(text: string) => {
			// Save to database
			updateIssue({ issueId, description: text }).catch(() => {});
			// Update local override and re-mount editor
			setContentOverride(text);
			setEditorKey((k) => k + 1);
		},
		[issueId, updateIssue],
	);

	if (!mounted) {
		return <IssueDescriptionEditorSkeleton />;
	}

	const aiPlugins = workspace ? [AIEditorPlugin] : [];
	const hasContent = (activeContent ?? "").trim().length > 0;

	return (
		<div className="space-y-2">
			{workspace && issueTitle && (
				<div className="flex justify-end">
					<DraftDescriptionButton
						title={issueTitle}
						workspaceId={workspace.workspaceId}
						issueId={issueId}
						hasExistingContent={hasContent}
						onDraft={handleDraft}
					/>
				</div>
			)}
			<div className="rounded-md border border-transparent hover:border-border transition-colors min-h-[80px]">
				<PlateEditor
					key={editorKey}
					variant="simple"
					value={initialValue}
					onChange={handleChange}
					placeholder="Add a description..."
					plugins={aiPlugins}
				>
					{workspace && (
						<EditorAIBridge
							context={{
								workspaceId: workspace.workspaceId,
								issueId,
							}}
						/>
					)}
				</PlateEditor>
			</div>
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
