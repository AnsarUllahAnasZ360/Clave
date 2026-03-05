"use client";

import { useMutation } from "convex/react";
import type { Value } from "platejs";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AIEditorPlugin } from "@/components/ai/editor/ai-editor-plugin";
import { EditorAIBridge } from "@/components/ai/editor/EditorAIBridge";
import { PlateEditor } from "@/components/editor/plate-editor";
import { useWorkspaceOptional } from "@/components/providers/workspace-context";
import {
	parseAnyContentToSlate,
	plainTextToSlate,
} from "@/lib/content-converters";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

interface ProjectDescriptionEditorProps {
	projectId: Id<"projects">;
	initialContent?: string; // richDescription (BlockNote or Slate JSON string)
	plainTextFallback?: string; // Legacy plain text description
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function ProjectDescriptionEditor({
	projectId,
	initialContent,
	plainTextFallback,
}: ProjectDescriptionEditorProps) {
	const [mounted, setMounted] = useState(false);
	const workspace = useWorkspaceOptional();
	const updateProject = useMutation(api.projects.update);
	const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const pendingSaveRef = useRef<string | null>(null);
	const lastSavedRef = useRef<string | null>(null);

	useEffect(() => {
		setMounted(true);
	}, []);

	const initialValue = useMemo(
		() =>
			(parseAnyContentToSlate(initialContent) ??
				(plainTextFallback
					? (plainTextToSlate(plainTextFallback) ?? undefined)
					: undefined)) as Value | undefined,
		[initialContent, plainTextFallback],
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

		updateProject({
			projectId,
			richDescription: nextValue,
		}).catch(() => {
			lastSavedRef.current = previousSaved;
			pendingSaveRef.current = nextValue;
		});
	}, [projectId, updateProject]);

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
			}, 800);
		},
		[flushPendingSave],
	);

	const aiPlugins = useMemo(
		() => (workspace ? [AIEditorPlugin] : []),
		[workspace?.workspaceId, workspace],
	);

	if (!mounted) {
		return <ProjectDescriptionEditorSkeleton />;
	}

	return (
		<section>
			<h3 className="text-sm font-medium text-muted-foreground mb-2">
				Description
			</h3>
			<div className="min-h-[100px] bg-background px-0 py-0 [&_.font-heading]:mt-2 [&_.font-heading]:pb-0">
				<PlateEditor
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
								projectId,
							}}
						/>
					)}
				</PlateEditor>
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
