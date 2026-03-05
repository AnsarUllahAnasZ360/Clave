"use client";

import { GitMerge, GitPullRequest } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type PullRequestData = {
	_id: string;
	number: number;
	title: string;
	state: "open" | "closed" | "merged" | "draft";
	authorLogin: string;
	authorAvatarUrl?: string;
	headBranch: string;
	htmlUrl: string;
	isDraft: boolean;
	reviewDecision?: string;
	linkedIssueId?: string;
	githubCreatedAt: number;
	githubUpdatedAt: number;
};

type PullRequestListProps = {
	pullRequests: PullRequestData[];
	linkedIssueIdentifiers?: Map<string, string>;
};

const STATE_CONFIG = {
	open: {
		label: "Open",
		color: "bg-emerald-500/15 text-emerald-400 border-emerald-500/20",
		icon: GitPullRequest,
	},
	draft: {
		label: "Draft",
		color: "bg-neutral-500/15 text-neutral-400 border-neutral-500/20",
		icon: GitPullRequest,
	},
	merged: {
		label: "Merged",
		color: "bg-purple-500/15 text-purple-400 border-purple-500/20",
		icon: GitMerge,
	},
	closed: {
		label: "Closed",
		color: "bg-red-500/15 text-red-400 border-red-500/20",
		icon: GitPullRequest,
	},
};

function formatRelativeTime(timestamp: number): string {
	const diff = Date.now() - timestamp;
	const minutes = Math.floor(diff / 60000);
	if (minutes < 60) return `${minutes}m ago`;
	const hours = Math.floor(minutes / 60);
	if (hours < 24) return `${hours}h ago`;
	const days = Math.floor(hours / 24);
	if (days < 30) return `${days}d ago`;
	return new Date(timestamp).toLocaleDateString();
}

export function PullRequestList({
	pullRequests,
	linkedIssueIdentifiers,
}: PullRequestListProps) {
	if (pullRequests.length === 0) {
		return (
			<div className="flex flex-col items-center justify-center py-12 text-center">
				<GitPullRequest className="h-8 w-8 text-muted-foreground/50 mb-3" />
				<p className="text-sm text-muted-foreground">No pull requests found</p>
			</div>
		);
	}

	return (
		<div className="divide-y divide-border/40">
			{pullRequests.map((pr) => {
				const config = STATE_CONFIG[pr.state];
				const StateIcon = config.icon;
				const linkedIdentifier = pr.linkedIssueId
					? linkedIssueIdentifiers?.get(pr.linkedIssueId)
					: undefined;

				return (
					<div
						key={pr._id}
						className="flex items-center gap-3 px-4 py-2.5 hover:bg-muted/30 transition-colors"
					>
						<StateIcon
							className={cn(
								"h-4 w-4 shrink-0",
								pr.state === "open" && "text-emerald-400",
								pr.state === "merged" && "text-purple-400",
								pr.state === "closed" && "text-red-400",
								pr.state === "draft" && "text-muted-foreground",
							)}
						/>

						<div className="flex-1 min-w-0">
							<div className="flex items-center gap-2">
								<a
									href={pr.htmlUrl}
									target="_blank"
									rel="noopener noreferrer"
									className="text-sm font-medium truncate hover:underline"
								>
									{pr.title}
								</a>
								<span className="text-xs text-muted-foreground shrink-0">
									#{pr.number}
								</span>
							</div>
							<div className="flex items-center gap-2 mt-0.5">
								<span className="text-xs text-muted-foreground">
									{pr.authorLogin}
								</span>
								<span className="text-xs text-muted-foreground/50">·</span>
								<code className="text-xs text-muted-foreground font-mono bg-muted/50 px-1 rounded">
									{pr.headBranch}
								</code>
								{linkedIdentifier && (
									<>
										<span className="text-xs text-muted-foreground/50">·</span>
										<Badge
											variant="outline"
											className="text-[10px] px-1.5 py-0 h-4"
										>
											{linkedIdentifier}
										</Badge>
									</>
								)}
							</div>
						</div>

						<Badge
							variant="outline"
							className={cn("text-[10px] shrink-0", config.color)}
						>
							{config.label}
						</Badge>

						{pr.reviewDecision && (
							<Badge
								variant="outline"
								className={cn(
									"text-[10px] shrink-0",
									pr.reviewDecision === "approved" &&
										"text-emerald-400 border-emerald-500/20",
									pr.reviewDecision === "changes_requested" &&
										"text-amber-400 border-amber-500/20",
								)}
							>
								{pr.reviewDecision === "approved"
									? "Approved"
									: pr.reviewDecision === "changes_requested"
										? "Changes"
										: "Review"}
							</Badge>
						)}

						<span className="text-xs text-muted-foreground shrink-0">
							{formatRelativeTime(pr.githubUpdatedAt)}
						</span>
					</div>
				);
			})}
		</div>
	);
}
