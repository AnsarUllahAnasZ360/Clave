"use client";

import { useMutation, useQuery } from "convex/react";
import { GitPullRequest, Link2, Search, Unlink } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";
import { LinkedPrBadge } from "@/components/github/LinkedPrBadge";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

type PrLinkDialogProps = {
	issueId: Id<"issues">;
	projectId: Id<"projects">;
};

export function PrLinkDialog({ issueId, projectId }: PrLinkDialogProps) {
	const [open, setOpen] = useState(false);
	const [search, setSearch] = useState("");

	const linkedPrs = useQuery(api.githubSync.listLinkedPrs, { issueId });
	const allPrs = useQuery(
		api.githubSync.listPullRequests,
		open ? { projectId } : "skip",
	);
	const linkPr = useMutation(api.githubSync.manualLinkPr);
	const unlinkPr = useMutation(api.githubSync.manualUnlinkPr);

	const filteredPrs = useMemo(() => {
		if (!allPrs) return [];
		const linkedIds = new Set((linkedPrs ?? []).map((p) => p._id));
		return allPrs
			.filter((pr) => !linkedIds.has(pr._id))
			.filter(
				(pr) =>
					!search ||
					pr.title.toLowerCase().includes(search.toLowerCase()) ||
					`#${pr.number}`.includes(search),
			)
			.slice(0, 20);
	}, [allPrs, linkedPrs, search]);

	const handleLink = useCallback(
		async (prId: Id<"githubPullRequests">) => {
			try {
				await linkPr({ prId, issueId });
				toast.success("PR linked");
			} catch {
				toast.error("Failed to link PR");
			}
		},
		[linkPr, issueId],
	);

	const handleUnlink = useCallback(
		async (prId: Id<"githubPullRequests">) => {
			try {
				await unlinkPr({ prId });
				toast.success("PR unlinked");
			} catch {
				toast.error("Failed to unlink PR");
			}
		},
		[unlinkPr],
	);

	return (
		<div className="space-y-1.5">
			{/* Show linked PRs as badges */}
			{linkedPrs && linkedPrs.length > 0 && (
				<div className="flex flex-wrap gap-1">
					{linkedPrs.map((pr) => (
						<div key={pr._id} className="flex items-center gap-0.5">
							<LinkedPrBadge
								number={pr.number}
								state={pr.state}
								htmlUrl={pr.htmlUrl}
								title={pr.title}
							/>
							<button
								type="button"
								onClick={() => handleUnlink(pr._id as Id<"githubPullRequests">)}
								className="text-muted-foreground hover:text-foreground p-0.5"
								title="Unlink PR"
							>
								<Unlink className="h-3 w-3" />
							</button>
						</div>
					))}
				</div>
			)}

			<Dialog open={open} onOpenChange={setOpen}>
				<DialogTrigger asChild>
					<Button
						variant="ghost"
						size="sm"
						className="h-6 gap-1 text-xs text-muted-foreground"
					>
						<Link2 className="h-3 w-3" />
						Link PR
					</Button>
				</DialogTrigger>
				<DialogContent className="sm:max-w-md">
					<DialogHeader>
						<DialogTitle>Link pull request</DialogTitle>
						<DialogDescription>
							Search and link a pull request to this issue.
						</DialogDescription>
					</DialogHeader>

					<div className="space-y-3">
						<div className="relative">
							<Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
							<Input
								placeholder="Search by title or number..."
								value={search}
								onChange={(e) => setSearch(e.target.value)}
								className="pl-9 h-9"
							/>
						</div>

						<div className="max-h-64 overflow-y-auto space-y-0.5">
							{filteredPrs.length === 0 ? (
								<p className="text-sm text-muted-foreground text-center py-4">
									{allPrs === undefined
										? "Loading..."
										: "No matching pull requests"}
								</p>
							) : (
								filteredPrs.map((pr) => (
									<button
										key={pr._id}
										type="button"
										onClick={() =>
											handleLink(pr._id as Id<"githubPullRequests">)
										}
										className="w-full flex items-center gap-2.5 px-3 py-2 rounded-md hover:bg-muted transition-colors text-left"
									>
										<GitPullRequest className="h-4 w-4 text-muted-foreground shrink-0" />
										<div className="flex-1 min-w-0">
											<p className="text-sm truncate">{pr.title}</p>
											<p className="text-xs text-muted-foreground">
												#{pr.number} · {pr.authorLogin}
											</p>
										</div>
									</button>
								))
							)}
						</div>
					</div>
				</DialogContent>
			</Dialog>
		</div>
	);
}
