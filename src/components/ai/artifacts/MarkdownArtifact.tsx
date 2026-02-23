"use client";

import { useMutation } from "convex/react";
import { Check, Copy, Download, Save } from "lucide-react";
import { useCallback, useState } from "react";
import { toast } from "sonner";

import { StreamdownRenderer } from "@/components/ai/StreamdownRenderer";
import { useWorkspace } from "@/components/providers/workspace-context";
import { Button } from "@/components/ui/button";
import type { ArtifactData } from "@/types/artifacts";
import { api } from "../../../../convex/_generated/api";

// ── MarkdownArtifact ─────────────────────────────────────────────────────

export function MarkdownArtifact({ artifact }: { artifact: ArtifactData }) {
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

	const handleDownload = useCallback(() => {
		const blob = new Blob([artifact.content], { type: "text/markdown" });
		const url = URL.createObjectURL(blob);
		const a = document.createElement("a");
		a.href = url;
		a.download = `${artifact.title}.md`;
		a.click();
		URL.revokeObjectURL(url);
	}, [artifact.content, artifact.title]);

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
				<Button
					variant="ghost"
					size="sm"
					className="h-7 gap-1.5 text-xs"
					onClick={handleDownload}
				>
					<Download className="size-3.5" />
					Download .md
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

			{/* Markdown content */}
			<div className="flex-1 overflow-y-auto px-6 py-4">
				<div className="prose prose-sm dark:prose-invert mx-auto max-w-2xl">
					<StreamdownRenderer content={artifact.content} />
				</div>
			</div>
		</div>
	);
}
