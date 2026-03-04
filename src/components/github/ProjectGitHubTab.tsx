"use client";

import { useQuery } from "convex/react";
import { useMemo, useState } from "react";
import { CommitList } from "@/components/github/CommitList";
import { IssueSyncSettings } from "@/components/github/IssueSyncSettings";
import { PullRequestList } from "@/components/github/PullRequestList";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

const SUB_TAB_CLASS =
	"h-7 rounded-md px-2.5 py-1 text-xs font-medium after:hidden data-[state=active]:bg-muted data-[state=active]:text-foreground data-[state=active]:shadow-none text-muted-foreground hover:text-foreground hover:bg-muted/50";

type PrState = "open" | "closed" | "merged" | "draft";

const PR_FILTER_CHIPS: { value: PrState | "all"; label: string }[] = [
	{ value: "all", label: "All" },
	{ value: "open", label: "Open" },
	{ value: "merged", label: "Merged" },
	{ value: "closed", label: "Closed" },
	{ value: "draft", label: "Draft" },
];

type ProjectGitHubTabProps = {
	projectId: Id<"projects">;
	connectionId: Id<"githubConnections">;
};

export function ProjectGitHubTab({
	projectId,
	connectionId,
}: ProjectGitHubTabProps) {
	const [subTab, setSubTab] = useState("prs");
	const [prFilter, setPrFilter] = useState<PrState | "all">("all");

	const pullRequests = useQuery(api.githubSync.listPullRequests, {
		projectId,
		state: prFilter === "all" ? undefined : prFilter,
	});

	const commits = useQuery(api.githubSync.listCommits, { projectId });

	// Filter PRs client-side for "all"
	const filteredPrs = useMemo(() => {
		if (!pullRequests) return undefined;
		return pullRequests;
	}, [pullRequests]);

	return (
		<div className="px-6 py-4 max-w-7xl mx-auto">
			<Tabs value={subTab} onValueChange={setSubTab}>
				<div className="flex items-center gap-3 mb-4">
					<TabsList variant="line" className="h-auto gap-0.5 border-none p-0">
						<TabsTrigger value="prs" className={SUB_TAB_CLASS}>
							Pull Requests
						</TabsTrigger>
						<TabsTrigger value="commits" className={SUB_TAB_CLASS}>
							Commits
						</TabsTrigger>
						<TabsTrigger value="sync" className={SUB_TAB_CLASS}>
							Issue Sync
						</TabsTrigger>
					</TabsList>
				</div>

				<TabsContent value="prs" className="mt-0">
					{/* Filter chips */}
					<div className="flex items-center gap-1.5 mb-3">
						{PR_FILTER_CHIPS.map((chip) => (
							<button
								key={chip.value}
								type="button"
								onClick={() => setPrFilter(chip.value)}
								className={cn(
									"px-3 py-1 rounded-full text-xs font-medium transition-colors",
									prFilter === chip.value
										? "bg-primary text-primary-foreground"
										: "bg-muted text-muted-foreground hover:text-foreground hover:bg-muted/80",
								)}
							>
								{chip.label}
							</button>
						))}
					</div>

					{filteredPrs === undefined ? (
						<div className="space-y-2">
							<Skeleton className="h-10 w-full" />
							<Skeleton className="h-10 w-full" />
							<Skeleton className="h-10 w-full" />
						</div>
					) : (
						<div className="rounded-lg border border-border bg-card overflow-hidden">
							<PullRequestList pullRequests={filteredPrs as any} />
						</div>
					)}
				</TabsContent>

				<TabsContent value="commits" className="mt-0">
					{commits === undefined ? (
						<div className="space-y-2">
							<Skeleton className="h-10 w-full" />
							<Skeleton className="h-10 w-full" />
							<Skeleton className="h-10 w-full" />
						</div>
					) : (
						<div className="rounded-lg border border-border bg-card overflow-hidden">
							<CommitList commits={commits as any} />
						</div>
					)}
				</TabsContent>

				<TabsContent value="sync" className="mt-0">
					<IssueSyncSettings
						projectId={projectId}
						connectionId={connectionId}
					/>
				</TabsContent>
			</Tabs>
		</div>
	);
}
