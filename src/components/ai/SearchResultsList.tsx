"use client";

import { SearchX } from "lucide-react";
import { memo } from "react";
import {
	type SearchResult,
	SearchResultCard,
} from "@/components/ai/SearchResultCard";

// ── Types ────────────────────────────────────────────────────────────────

interface SearchResultsListProps {
	results: SearchResult[];
	workspaceSlug: string;
}

// ── Component ────────────────────────────────────────────────────────────

export const SearchResultsList = memo(function SearchResultsList({
	results,
	workspaceSlug,
}: SearchResultsListProps) {
	if (results.length === 0) {
		return (
			<div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-border/60 bg-muted/30 px-4 py-6 text-center">
				<SearchX className="size-8 text-muted-foreground/50" />
				<div className="text-sm font-medium text-muted-foreground">
					No results found
				</div>
				<p className="max-w-[280px] text-xs text-muted-foreground/70">
					Try a different search term or broaden your query.
				</p>
			</div>
		);
	}

	return (
		<div className="flex flex-col gap-1.5 py-1">
			<div className="flex items-center gap-2 px-1 text-xs text-muted-foreground">
				<span className="font-medium">
					{results.length} result{results.length !== 1 ? "s" : ""} found
				</span>
			</div>
			<div className="flex flex-col gap-1">
				{results.map((result) => (
					<SearchResultCard
						key={`${result.type}-${result.id}`}
						result={result}
						workspaceSlug={workspaceSlug}
					/>
				))}
			</div>
		</div>
	);
});
