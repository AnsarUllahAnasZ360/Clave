"use client";

import { useQuery } from "convex/react";
import {
	ChevronRight,
	Code2,
	Copy,
	GitBranch,
	GitCommitHorizontal,
	GitPullRequest,
} from "lucide-react";
import { useCallback, useState } from "react";
import { toast } from "sonner";
import { CreateBranchDialog } from "@/components/github/CreateBranchDialog";
import { LinkedPrBadge } from "@/components/github/LinkedPrBadge";
import { PrLinkDialog } from "@/components/github/PrLinkDialog";
import { Button } from "@/components/ui/button";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

type IssueDevelopmentSectionProps = {
	issueId: Id<"issues">;
	projectId: Id<"projects">;
	gitBranchName?: string;
	identifier: string;
	title: string;
};

function slugify(text: string, maxLength = 60): string {
	return text
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/-{2,}/g, "-")
		.slice(0, maxLength)
		.replace(/-$/, "");
}

function copyText(text: string): Promise<void> {
	if (navigator.clipboard?.writeText) {
		return navigator.clipboard.writeText(text);
	}
	// Fallback for insecure contexts
	const textarea = document.createElement("textarea");
	textarea.value = text;
	textarea.style.position = "fixed";
	textarea.style.opacity = "0";
	document.body.appendChild(textarea);
	textarea.select();
	document.execCommand("copy");
	document.body.removeChild(textarea);
	return Promise.resolve();
}

export function IssueDevelopmentSection({
	issueId,
	projectId,
	gitBranchName,
	identifier,
	title,
}: IssueDevelopmentSectionProps) {
	const linkedPrs = useQuery(api.githubSync.listLinkedPrs, { issueId });
	const linkedCommits = useQuery(api.githubSync.listLinkedCommits, {
		issueId,
	});
	const [createBranchOpen, setCreateBranchOpen] = useState(false);

	const prCount = linkedPrs?.length ?? 0;
	const commitCount = linkedCommits?.length ?? 0;
	const branchCount = gitBranchName ? 1 : 0;
	const totalCount = prCount + commitCount + branchCount;

	const handleCopyBranch = useCallback(async () => {
		try {
			const branch = `feat/${slugify(`${identifier}-${title}`)}`;
			await copyText(branch);
			toast.success("Branch name copied");
		} catch {
			toast.error("Failed to copy");
		}
	}, [identifier, title]);

	const handleCopyCommit = useCallback(async () => {
		try {
			await copyText(`${identifier}: ${title}`);
			toast.success("Commit message copied");
		} catch {
			toast.error("Failed to copy");
		}
	}, [identifier, title]);

	const handleCopyId = useCallback(async () => {
		try {
			await copyText(identifier);
			toast.success(`Copied "${identifier}"`);
		} catch {
			toast.error("Failed to copy");
		}
	}, [identifier]);

	return (
		<Collapsible defaultOpen>
			<div className="space-y-2.5">
				<div className="flex items-center justify-between">
					<CollapsibleTrigger className="flex items-center gap-1.5 group cursor-pointer">
						<ChevronRight className="h-3.5 w-3.5 text-muted-foreground transition-transform group-data-[state=open]:rotate-90" />
						<h3 className="text-[13px] font-medium text-foreground/80 flex items-center gap-1.5">
							<Code2 className="h-3.5 w-3.5 text-muted-foreground" />
							Development
							{totalCount > 0 && (
								<span className="text-xs text-muted-foreground/70">
									({totalCount})
								</span>
							)}
						</h3>
					</CollapsibleTrigger>
				</div>

				{/* Quick actions — outside CollapsibleContent so always visible */}
				<div className="flex items-center gap-1.5 pl-5">
					<Button
						variant="outline"
						size="sm"
						className="h-6 px-2 text-xs gap-1.5"
						onClick={() => setCreateBranchOpen(true)}
					>
						<GitBranch className="h-3 w-3" />
						Create branch
					</Button>
					<Button
						variant="outline"
						size="sm"
						className="h-6 px-2 text-xs gap-1.5"
						onClick={handleCopyCommit}
					>
						<GitCommitHorizontal className="h-3 w-3" />
						Copy commit message
					</Button>
					<Button
						variant="outline"
						size="sm"
						className="h-6 px-2 text-xs gap-1.5"
						onClick={handleCopyId}
					>
						<Copy className="h-3 w-3" />
						Copy ID
					</Button>
				</div>

				<CollapsibleContent>
					<div className="space-y-3 pl-5">
						{/* Branch */}
						{gitBranchName && (
							<div className="space-y-1">
								<div className="flex items-center gap-1.5 text-xs text-muted-foreground">
									<GitBranch className="h-3 w-3" />
									<span className="font-medium">Branch</span>
								</div>
								<p className="text-sm font-mono text-foreground/80 pl-[18px]">
									{gitBranchName}
								</p>
							</div>
						)}

						{/* Pull Requests */}
						<div className="space-y-1.5">
							<div className="flex items-center gap-1.5 text-xs text-muted-foreground">
								<GitPullRequest className="h-3 w-3" />
								<span className="font-medium">
									Pull requests
									{prCount > 0 && ` (${prCount})`}
								</span>
							</div>
							<div className="pl-[18px]">
								<PrLinkDialog issueId={issueId} projectId={projectId} />
							</div>
						</div>

						{/* Commits */}
						{commitCount > 0 && (
							<div className="space-y-1.5">
								<div className="flex items-center gap-1.5 text-xs text-muted-foreground">
									<GitCommitHorizontal className="h-3 w-3" />
									<span className="font-medium">
										Commits ({commitCount})
									</span>
								</div>
								<div className="pl-[18px] space-y-1">
									{linkedCommits?.slice(0, 5).map((commit) => (
										<a
											key={commit._id}
											href={commit.htmlUrl}
											target="_blank"
											rel="noopener noreferrer"
											className="flex items-start gap-2 text-sm hover:bg-muted/50 rounded-md px-2 py-1 -mx-2 transition-colors"
										>
											<code className="text-[11px] text-muted-foreground font-mono shrink-0 mt-0.5">
												{commit.sha.slice(0, 7)}
											</code>
											<span className="text-foreground/80 truncate">
												{commit.message.split("\n")[0]}
											</span>
										</a>
									))}
									{commitCount > 5 && (
										<p className="text-xs text-muted-foreground/70 px-2">
											+{commitCount - 5} more commits
										</p>
									)}
								</div>
							</div>
						)}

						{/* Empty state */}
						{totalCount === 0 && (
							<p className="text-[13px] text-muted-foreground/50 py-2 text-center">
								No development activity
							</p>
						)}
					</div>
				</CollapsibleContent>
			</div>

			<CreateBranchDialog
				open={createBranchOpen}
				onOpenChange={setCreateBranchOpen}
				projectId={projectId}
				issueId={issueId}
				identifier={identifier}
				title={title}
			/>
		</Collapsible>
	);
}
