"use client";

import {
	ArrowRight,
	ChatCircle,
	FileText,
	PenNib,
	Plus,
	Trash,
	UserCircle,
} from "@phosphor-icons/react/dist/ssr";
import { useQuery } from "convex/react";
import { formatDistanceToNow } from "date-fns";
import { useCallback, useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

export type ActivityActionFilter =
	| "all"
	| "status_changed"
	| "assigned"
	| "commented"
	| "created"
	| "deleted";

type ActivityFeedProps = {
	projectId?: Id<"projects">;
	taskId?: Id<"tasks">;
	actionFilter?: ActivityActionFilter;
};

function getActionIcon(action: string, entityType?: string) {
	// Show entity-specific icons for document/whiteboard activity
	if (entityType === "document") {
		return <FileText className="h-3.5 w-3.5 text-blue-500" />;
	}
	if (entityType === "whiteboard") {
		return <PenNib className="h-3.5 w-3.5 text-violet-500" />;
	}
	switch (action) {
		case "created":
			return <Plus className="h-3.5 w-3.5 text-emerald-500" />;
		case "deleted":
			return <Trash className="h-3.5 w-3.5 text-red-500" />;
		case "status_changed":
		case "moved_to_sprint":
			return <ArrowRight className="h-3.5 w-3.5 text-blue-500" />;
		case "assigned":
			return <UserCircle className="h-3.5 w-3.5 text-purple-500" />;
		default:
			return <ChatCircle className="h-3.5 w-3.5 text-muted-foreground" />;
	}
}

function matchesFilter(action: string, filter: ActivityActionFilter): boolean {
	if (filter === "all") return true;
	if (filter === "status_changed")
		return action === "status_changed" || action === "moved_to_sprint";
	if (filter === "assigned") return action === "assigned";
	if (filter === "commented")
		return action === "commented" || action === "comment_created";
	if (filter === "created") return action === "created";
	if (filter === "deleted") return action === "deleted";
	return true;
}

export function ActivityFeed({
	projectId,
	taskId,
	actionFilter = "all",
}: ActivityFeedProps) {
	const [cursor, setCursor] = useState<number | undefined>(undefined);
	const [allEntries, setAllEntries] = useState<
		Array<{
			_id: string;
			_creationTime: number;
			action: string;
			entityType: string;
			description?: string;
			field?: string;
			oldValue?: string;
			newValue?: string;
			actorName: string;
			actorImage?: string;
		}>
	>([]);
	const [loadedMore, setLoadedMore] = useState(false);

	const projectResult = useQuery(
		api.activityLogs.listByProject,
		projectId ? { projectId, limit: 50, cursor } : "skip",
	);

	const taskResult = useQuery(
		api.activityLogs.listByTask,
		taskId ? { taskId, limit: 50, cursor } : "skip",
	);

	const result = projectId ? projectResult : taskResult;

	// Merge entries from initial load and "load more" pages
	const rawEntries = loadedMore ? allEntries : (result?.entries ?? []);
	const entries =
		actionFilter === "all"
			? rawEntries
			: rawEntries.filter((e) => matchesFilter(e.action, actionFilter));
	const hasMore = result?.hasMore ?? false;

	const handleLoadMore = useCallback(() => {
		if (!result?.entries?.length) return;
		const lastEntry = result.entries[result.entries.length - 1];
		setAllEntries((prev) =>
			loadedMore ? [...prev, ...result.entries] : [...result.entries],
		);
		setLoadedMore(true);
		setCursor(lastEntry._creationTime);
	}, [result, loadedMore]);

	// Loading state
	if (result === undefined) {
		return (
			<div className="space-y-3 py-2">
				{Array.from({ length: 3 }).map((_, i) => (
					<div key={`skel-${i}`} className="flex items-start gap-3">
						<Skeleton className="h-7 w-7 rounded-full shrink-0" />
						<div className="flex-1 space-y-1.5">
							<Skeleton className="h-3.5 w-3/4" />
							<Skeleton className="h-3 w-1/3" />
						</div>
					</div>
				))}
			</div>
		);
	}

	// Empty state
	if (entries.length === 0) {
		return (
			<div className="py-8 text-center text-sm text-muted-foreground">
				No activity yet
			</div>
		);
	}

	return (
		<div className="space-y-1">
			{entries.map((entry) => (
				<div
					key={entry._id}
					className="flex items-start gap-3 py-2 px-1 rounded-md hover:bg-muted/50 transition-colors"
				>
					<Avatar className="h-7 w-7 shrink-0 mt-0.5">
						{entry.actorImage && (
							<AvatarImage src={entry.actorImage} alt={entry.actorName} />
						)}
						<AvatarFallback className="text-[10px]">
							{entry.actorName.charAt(0).toUpperCase()}
						</AvatarFallback>
					</Avatar>

					<div className="flex-1 min-w-0">
						<div className="flex items-center gap-1.5 text-sm">
							<span className="font-medium text-foreground truncate">
								{entry.actorName}
							</span>
							<span className="shrink-0">
								{getActionIcon(entry.action, entry.entityType)}
							</span>
							<span className="text-muted-foreground truncate">
								{entry.description ?? entry.action.replace(/_/g, " ")}
							</span>
						</div>

						{entry.field && entry.oldValue && entry.newValue && (
							<div className="mt-0.5 text-xs text-muted-foreground">
								<span className="capitalize">
									{entry.field.replace(/Id$/, "")}
								</span>
								:{" "}
								<span className="line-through">
									{entry.oldValue.replace(/_/g, " ")}
								</span>{" "}
								<ArrowRight className="inline h-3 w-3" />{" "}
								<span className="font-medium text-foreground/80">
									{entry.newValue.replace(/_/g, " ")}
								</span>
							</div>
						)}

						<span className="text-xs text-muted-foreground">
							{formatDistanceToNow(new Date(entry._creationTime), {
								addSuffix: true,
							})}
						</span>
					</div>
				</div>
			))}

			{hasMore && (
				<div className="pt-2">
					<Button
						variant="ghost"
						size="sm"
						className="w-full text-xs text-muted-foreground"
						onClick={handleLoadMore}
					>
						Load more activity
					</Button>
				</div>
			)}
		</div>
	);
}
