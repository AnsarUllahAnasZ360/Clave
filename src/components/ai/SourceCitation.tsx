"use client";

import { ExternalLink, FileText } from "lucide-react";
import { memo } from "react";
import {
	HoverCard,
	HoverCardContent,
	HoverCardTrigger,
} from "@/components/ui/hover-card";
import { sanitizeUrl } from "@/lib/ai/sanitize";

// ── Source part types from AI SDK ────────────────────────────────────────

export type SourceUrlPart = {
	type: "source-url";
	sourceId: string;
	url: string;
	title?: string;
	providerMetadata?: Record<string, unknown>;
};

export type SourceDocumentPart = {
	type: "source-document";
	sourceId: string;
	mediaType: string;
	title: string;
	filename?: string;
	providerMetadata?: Record<string, unknown>;
};

export type AnySourcePart = SourceUrlPart | SourceDocumentPart;

// ── Type predicates ──────────────────────────────────────────────────────

export function isSourcePart(part: { type: string }): part is AnySourcePart {
	return part.type === "source-url" || part.type === "source-document";
}

// ── SourceCitation ───────────────────────────────────────────────────────

type SourceCitationProps = {
	index: number;
	source: AnySourcePart;
};

export const SourceCitation = memo(function SourceCitation({
	index,
	source,
}: SourceCitationProps) {
	const isUrl = source.type === "source-url";
	const title = source.title ?? (isUrl ? source.url : source.filename);
	const safeUrl = isUrl ? sanitizeUrl((source as SourceUrlPart).url) : "";
	const displayUrl = isUrl ? (source as SourceUrlPart).url : undefined;

	return (
		<HoverCard openDelay={200} closeDelay={100}>
			<HoverCardTrigger asChild>
				<button
					type="button"
					aria-label={`Source ${index}: ${title ?? "citation"}`}
					className="relative -top-px inline-block cursor-pointer rounded px-0.5 text-[10px] font-semibold leading-none text-primary/70 transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
				>
					[{index}]
				</button>
			</HoverCardTrigger>
			<HoverCardContent
				className="w-72 p-3"
				side="top"
				align="start"
				sideOffset={6}
			>
				<div className="flex flex-col gap-2">
					{/* Icon row */}
					<div className="flex items-start gap-2">
						<div className="mt-0.5 shrink-0 text-muted-foreground">
							{isUrl ? (
								<ExternalLink className="size-3.5" />
							) : (
								<FileText className="size-3.5" />
							)}
						</div>
						{title ? (
							<p className="text-sm font-medium leading-snug">{title}</p>
						) : null}
					</div>

					{/* URL link */}
					{safeUrl && displayUrl ? (
						<a
							href={safeUrl}
							target="_blank"
							rel="noopener noreferrer"
							className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground hover:underline"
						>
							<span className="truncate">{displayUrl}</span>
						</a>
					) : null}

					{/* Document metadata */}
					{!isUrl && (source as SourceDocumentPart).filename ? (
						<p className="text-xs text-muted-foreground">
							{(source as SourceDocumentPart).filename}
						</p>
					) : null}
				</div>
			</HoverCardContent>
		</HoverCard>
	);
});

// ── SourcesList ──────────────────────────────────────────────────────────

type SourcesListProps = {
	sources: AnySourcePart[];
};

export const SourcesList = memo(function SourcesList({
	sources,
}: SourcesListProps) {
	if (sources.length === 0) return null;

	return (
		<div className="mt-3 flex flex-col gap-1.5 border-t border-border/50 pt-2">
			<p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/60">
				Sources
			</p>
			<div className="flex flex-wrap items-center gap-1">
				{sources.map((source, i) => (
					<SourceCitation key={source.sourceId} index={i + 1} source={source} />
				))}
			</div>
		</div>
	);
});
