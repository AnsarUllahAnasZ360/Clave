"use client";

import { useMutation } from "convex/react";
import { Check, Copy, Download, Save } from "lucide-react";
import { useCallback, useState } from "react";
import { toast } from "sonner";

import { CodeBlock } from "@/components/ai/CodeBlock";
import { useWorkspace } from "@/components/providers/workspace-context";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ArtifactData } from "@/types/artifacts";
import { api } from "../../../../convex/_generated/api";

// ── File extension mapping ───────────────────────────────────────────────

const LANGUAGE_EXTENSIONS: Record<string, string> = {
	typescript: "ts",
	javascript: "js",
	python: "py",
	rust: "rs",
	go: "go",
	css: "css",
	json: "json",
	yaml: "yaml",
	bash: "sh",
	html: "html",
	tsx: "tsx",
	jsx: "jsx",
	sql: "sql",
	ruby: "rb",
	java: "java",
	kotlin: "kt",
	swift: "swift",
	cpp: "cpp",
	c: "c",
};

function getExtension(language?: string): string {
	if (!language) return "txt";
	return LANGUAGE_EXTENSIONS[language.toLowerCase()] ?? "txt";
}

// ── CodeArtifact ─────────────────────────────────────────────────────────

export function CodeArtifact({ artifact }: { artifact: ArtifactData }) {
	const [copied, setCopied] = useState(false);
	const [saving, setSaving] = useState(false);
	const workspace = useWorkspace();
	const createDocument = useMutation(api.documents.create);

	const ext = getExtension(artifact.language);

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
		const blob = new Blob([artifact.content], { type: "text/plain" });
		const url = URL.createObjectURL(blob);
		const a = document.createElement("a");
		a.href = url;
		a.download = `${artifact.title}.${ext}`;
		a.click();
		URL.revokeObjectURL(url);
	}, [artifact.content, artifact.title, ext]);

	const handleSave = useCallback(async () => {
		if (!workspace?.workspaceId) return;
		setSaving(true);
		try {
			await createDocument({
				workspaceId: workspace.workspaceId,
				title: artifact.title,
				content: artifact.content,
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
					className={cn(
						"h-7 gap-1.5 text-xs transition-colors",
						copied &&
							"bg-green-500/10 text-green-500 hover:bg-green-500/10 hover:text-green-500",
					)}
					onClick={handleCopy}
				>
					{copied ? (
						<Check className="size-3.5" />
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
					Download .{ext}
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

			{/* Code content */}
			<div className="flex-1 overflow-y-auto">
				<CodeBlock
					code={artifact.content}
					language={artifact.language}
					showLineNumbers
					className="my-0 rounded-none border-0"
				/>
			</div>
		</div>
	);
}
