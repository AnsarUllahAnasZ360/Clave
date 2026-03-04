"use client";

import { GitMerge, GitPullRequest } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type LinkedPrBadgeProps = {
	number: number;
	state: "open" | "closed" | "merged" | "draft";
	htmlUrl: string;
	title?: string;
};

export function LinkedPrBadge({
	number,
	state,
	htmlUrl,
	title,
}: LinkedPrBadgeProps) {
	const Icon = state === "merged" ? GitMerge : GitPullRequest;

	return (
		<a
			href={htmlUrl}
			target="_blank"
			rel="noopener noreferrer"
			title={title ? `#${number}: ${title}` : `PR #${number}`}
		>
			<Badge
				variant="outline"
				className={cn(
					"gap-1 text-[10px] px-1.5 py-0 h-5 hover:bg-muted/50 transition-colors cursor-pointer",
					state === "open" && "text-emerald-400 border-emerald-500/20",
					state === "merged" && "text-purple-400 border-purple-500/20",
					state === "closed" && "text-red-400 border-red-500/20",
					state === "draft" && "text-muted-foreground border-border",
				)}
			>
				<Icon className="h-3 w-3" />#{number}
			</Badge>
		</a>
	);
}
