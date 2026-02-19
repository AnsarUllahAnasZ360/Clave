"use client";

import { useQuery } from "convex/react";
import {
	Circle,
	CircleCheck,
	CircleDashed,
	CircleX,
	Eye,
	Loader2,
	Search,
	Timer,
	TriangleAlert,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

// ── Status icon map ──────────────────────────────────────────────────────

const STATUS_ICONS: Record<string, { icon: typeof Circle; color: string }> = {
	triage: { icon: TriangleAlert, color: "text-orange-500" },
	backlog: { icon: CircleDashed, color: "text-muted-foreground" },
	todo: { icon: Circle, color: "text-muted-foreground" },
	in_progress: { icon: Timer, color: "text-yellow-500" },
	in_review: { icon: Eye, color: "text-blue-500" },
	done: { icon: CircleCheck, color: "text-emerald-500" },
	cancelled: { icon: CircleX, color: "text-muted-foreground" },
};

// ── Types ────────────────────────────────────────────────────────────────

export interface IssueSearchResult {
	_id: Id<"issues">;
	identifier: string;
	title: string;
	status: string;
}

interface IssueSearchPickerProps {
	workspaceId: Id<"workspaces">;
	excludeIds?: Id<"issues">[];
	onSelect: (issue: IssueSearchResult) => void;
	placeholder?: string;
	autoFocus?: boolean;
}

// ── Component ────────────────────────────────────────────────────────────

export function IssueSearchPicker({
	workspaceId,
	excludeIds = [],
	onSelect,
	placeholder = "Search issues...",
	autoFocus = true,
}: IssueSearchPickerProps) {
	const [searchTerm, setSearchTerm] = useState("");
	const inputRef = useRef<HTMLInputElement>(null);

	const searchResults = useQuery(
		api.issues.search,
		searchTerm.trim() ? { workspaceId, searchTerm: searchTerm.trim() } : "skip",
	);

	useEffect(() => {
		if (autoFocus) {
			// Small delay for dialog animation
			const timer = setTimeout(() => inputRef.current?.focus(), 50);
			return () => clearTimeout(timer);
		}
	}, [autoFocus]);

	const filteredResults = searchResults?.filter(
		(issue) => !excludeIds.includes(issue._id),
	);

	const isLoading = searchTerm.trim() && searchResults === undefined;

	return (
		<div className="space-y-2">
			<div className="relative">
				<Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
				<input
					ref={inputRef}
					type="text"
					value={searchTerm}
					onChange={(e) => setSearchTerm(e.target.value)}
					placeholder={placeholder}
					className="w-full pl-9 pr-3 py-2 text-sm bg-transparent border border-border rounded-md outline-none focus:border-primary transition-colors"
				/>
				{isLoading && (
					<Loader2 className="absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground animate-spin" />
				)}
			</div>

			{searchTerm.trim() && (
				<div className="max-h-[200px] overflow-y-auto rounded-md border border-border">
					{filteredResults && filteredResults.length > 0 ? (
						<div className="py-1">
							{filteredResults.map((issue) => {
								const statusConfig = STATUS_ICONS[issue.status];
								const StatusIconComponent = statusConfig?.icon ?? Circle;
								const statusColor =
									statusConfig?.color ?? "text-muted-foreground";

								return (
									<button
										key={issue._id}
										type="button"
										onClick={() => {
											onSelect(issue);
											setSearchTerm("");
										}}
										className="flex items-center gap-2 w-full px-3 py-1.5 text-sm hover:bg-muted transition-colors text-left"
									>
										<StatusIconComponent
											className={cn("h-3.5 w-3.5 shrink-0", statusColor)}
										/>
										<span className="text-muted-foreground font-mono text-xs shrink-0">
											{issue.identifier}
										</span>
										<span className="truncate">{issue.title}</span>
									</button>
								);
							})}
						</div>
					) : filteredResults && filteredResults.length === 0 ? (
						<div className="py-4 text-center text-sm text-muted-foreground">
							No issues found
						</div>
					) : null}
				</div>
			)}
		</div>
	);
}
