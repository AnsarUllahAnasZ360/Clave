"use client";

import dynamic from "next/dynamic";
import { memo } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import type { ArtifactData } from "@/types/artifacts";

// ── Lazy-loaded artifact renderers ───────────────────────────────────────
// Artifact renderers are only needed when the artifact panel opens (rare).
// Dynamic imports keep them out of the initial JS bundle.

function ArtifactSkeleton() {
	return (
		<div className="flex flex-col gap-3 p-4">
			<Skeleton className="h-4 w-3/4" />
			<Skeleton className="h-4 w-full" />
			<Skeleton className="h-4 w-2/3" />
			<Skeleton className="h-32 w-full" />
		</div>
	);
}

const CodeArtifact = dynamic(
	() =>
		import("@/components/ai/artifacts/CodeArtifact").then(
			(m) => m.CodeArtifact,
		),
	{ loading: ArtifactSkeleton },
);

const MarkdownArtifact = dynamic(
	() =>
		import("@/components/ai/artifacts/MarkdownArtifact").then(
			(m) => m.MarkdownArtifact,
		),
	{ loading: ArtifactSkeleton },
);

const DiagramArtifact = dynamic(
	() =>
		import("@/components/ai/artifacts/DiagramArtifact").then(
			(m) => m.DiagramArtifact,
		),
	{ loading: ArtifactSkeleton },
);

const TableArtifact = dynamic(
	() =>
		import("@/components/ai/artifacts/TableArtifact").then(
			(m) => m.TableArtifact,
		),
	{ loading: ArtifactSkeleton },
);

// ── ArtifactRenderer ─────────────────────────────────────────────────────
// Router component that dispatches to the correct artifact type renderer.

export const ArtifactRenderer = memo(function ArtifactRenderer({
	artifact,
}: {
	artifact: ArtifactData;
}) {
	switch (artifact.type) {
		case "code":
			return <CodeArtifact artifact={artifact} />;
		case "markdown":
			return <MarkdownArtifact artifact={artifact} />;
		case "diagram":
			return <DiagramArtifact artifact={artifact} />;
		case "table":
			return <TableArtifact artifact={artifact} />;
	}
});
