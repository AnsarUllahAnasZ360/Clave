"use client";

import { useMutation } from "convex/react";
import { Check, Copy, Save } from "lucide-react";
import dynamic from "next/dynamic";
import { useCallback, useState } from "react";
import { toast } from "sonner";

const MermaidDiagram = dynamic(
	() =>
		import("@/components/ai/MermaidDiagram").then((mod) => mod.MermaidDiagram),
	{
		ssr: false,
		loading: () => (
			<div className="h-32 w-full animate-pulse rounded-md bg-neutral-800" />
		),
	},
);

import { useWorkspace } from "@/components/providers/workspace-context";
import { Button } from "@/components/ui/button";
import type { ArtifactData } from "@/types/artifacts";
import { api } from "../../../../convex/_generated/api";

// ── DiagramArtifact ──────────────────────────────────────────────────────

export function DiagramArtifact({ artifact }: { artifact: ArtifactData }) {
	const [copied, setCopied] = useState(false);
	const [saving, setSaving] = useState(false);
	const workspace = useWorkspace();
	const createDocument = useMutation(api.documents.create);

	const handleCopy = useCallback(async () => {
		try {
			await navigator.clipboard.writeText(artifact.content);
			setCopied(true);
			setTimeout(() => setCopied(false), 2000);
		} catch {
			// Clipboard API may fail in insecure contexts
		}
	}, [artifact.content]);

	const handleSave = useCallback(async () => {
		if (!workspace?.workspaceId) return;
		setSaving(true);
		try {
			await createDocument({
				workspaceId: workspace.workspaceId,
				title: artifact.title,
			});
			toast.success("Saved to Docs");
		} catch {
			toast.error("Failed to save document");
		} finally {
			setSaving(false);
		}
	}, [workspace?.workspaceId, createDocument, artifact.title]);

	return (
		<div className="flex h-full flex-col">
			{/* Toolbar */}
			<div className="flex items-center gap-1 border-b border-border/40 px-3 py-1.5">
				<Button
					variant="ghost"
					size="sm"
					className="h-7 gap-1.5 text-xs"
					onClick={handleCopy}
				>
					{copied ? (
						<Check className="size-3.5 text-green-500" />
					) : (
						<Copy className="size-3.5" />
					)}
					{copied ? "Copied" : "Copy"}
				</Button>
				<div className="flex-1" />
				<Button
					variant="ghost"
					size="sm"
					className="h-7 gap-1.5 text-xs"
					onClick={handleSave}
					disabled={saving}
				>
					<Save className="size-3.5" />
					{saving ? "Saving..." : "Save to workspace"}
				</Button>
			</div>

			{/* Diagram content — MermaidDiagram already has fullscreen + PNG/SVG export */}
			<div className="flex-1 overflow-y-auto p-4">
				<MermaidDiagram definition={artifact.content} className="my-0" />
			</div>
		</div>
	);
}
