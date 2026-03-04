"use client";

import { GitCommit } from "lucide-react";
import { Badge } from "@/components/ui/badge";

type CommitData = {
	_id: string;
	sha: string;
	message: string;
	authorLogin: string;
	authorAvatarUrl?: string;
	htmlUrl: string;
	linkedIssueId?: string;
	committedAt: number;
};

type CommitListProps = {
	commits: CommitData[];
	linkedIssueIdentifiers?: Map<string, string>;
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

export function CommitList({
	commits,
	linkedIssueIdentifiers,
}: CommitListProps) {
	if (commits.length === 0) {
		return (
			<div className="flex flex-col items-center justify-center py-12 text-center">
				<GitCommit className="h-8 w-8 text-muted-foreground/50 mb-3" />
				<p className="text-sm text-muted-foreground">No commits found</p>
			</div>
		);
	}

	return (
		<div className="divide-y divide-border/40">
			{commits.map((commit) => {
				const firstLine = commit.message.split("\n")[0];
				const linkedIdentifier = commit.linkedIssueId
					? linkedIssueIdentifiers?.get(commit.linkedIssueId)
					: undefined;

				return (
					<div
						key={commit._id}
						className="flex items-center gap-3 px-4 py-2.5 hover:bg-muted/30 transition-colors"
					>
						<GitCommit className="h-4 w-4 text-muted-foreground shrink-0" />

						<a
							href={commit.htmlUrl}
							target="_blank"
							rel="noopener noreferrer"
							className="shrink-0"
						>
							<code className="text-xs font-mono text-sienna-400 hover:underline">
								{commit.sha.slice(0, 7)}
							</code>
						</a>

						<div className="flex-1 min-w-0">
							<span className="text-sm truncate block">{firstLine}</span>
						</div>

						{linkedIdentifier && (
							<Badge
								variant="outline"
								className="text-[10px] px-1.5 py-0 h-4 shrink-0"
							>
								{linkedIdentifier}
							</Badge>
						)}

						<span className="text-xs text-muted-foreground shrink-0">
							{commit.authorLogin}
						</span>

						<span className="text-xs text-muted-foreground shrink-0">
							{formatRelativeTime(commit.committedAt)}
						</span>
					</div>
				);
			})}
		</div>
	);
}
