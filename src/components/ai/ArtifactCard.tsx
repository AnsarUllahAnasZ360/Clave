"use client";

import { Code, ExternalLink, FileText, GitBranch, Table } from "lucide-react";
import { memo } from "react";
import { useArtifactPanel } from "@/components/ai/ArtifactPanel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { ArtifactData, ArtifactType } from "@/types/artifacts";

// ── Icon mapping ────────────────────────────────────────────────────────

const ARTIFACT_ICONS: Record<ArtifactType, typeof Code> = {
	code: Code,
	markdown: FileText,
	diagram: GitBranch,
	table: Table,
};

const ARTIFACT_LABELS: Record<ArtifactType, string> = {
	code: "Code",
	markdown: "Document",
	diagram: "Diagram",
	table: "Table",
};

// ── ArtifactCard ────────────────────────────────────────────────────────
// Compact card showing artifact type icon + title + type badge + "Open"
// button. Clicking "Open" opens the ArtifactPanel via context. An explicit
// onOpen prop overrides the context for use outside the ArtifactPanelProvider.

export type ArtifactCardProps = {
	artifact: ArtifactData;
	onOpen?: (artifact: ArtifactData) => void;
};

export const ArtifactCard = memo(function ArtifactCard({
	artifact,
	onOpen,
}: ArtifactCardProps) {
	const { openArtifact } = useArtifactPanel();
	const Icon = ARTIFACT_ICONS[artifact.type];
	const label = ARTIFACT_LABELS[artifact.type];

	function handleOpen() {
		if (onOpen) {
			onOpen(artifact);
		} else {
			openArtifact(artifact);
		}
	}

	return (
		<div className="my-2 flex items-center gap-3 rounded-lg border border-border/60 bg-muted/30 px-3 py-2.5 transition-colors hover:bg-muted/50">
			<div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary/10">
				<Icon className="size-4 text-primary" />
			</div>
			<div className="min-w-0 flex-1">
				<p className="truncate text-sm font-medium leading-tight">
					{artifact.title}
				</p>
				<div className="mt-0.5 flex items-center gap-1.5">
					<Badge variant="secondary" className="text-[10px] px-1.5 py-0">
						{label}
					</Badge>
					{artifact.language && (
						<Badge
							variant="outline"
							className="text-[10px] px-1.5 py-0 capitalize"
						>
							{artifact.language}
						</Badge>
					)}
				</div>
			</div>
			<Button
				variant="ghost"
				size="sm"
				className="h-7 shrink-0 gap-1 px-2 text-xs"
				onClick={handleOpen}
			>
				<ExternalLink className="size-3" />
				Open
			</Button>
		</div>
	);
});
