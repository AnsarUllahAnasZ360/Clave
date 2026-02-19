"use client";

import { useMutation, useQuery } from "convex/react";
import { format } from "date-fns";
import { useCallback, useMemo } from "react";
import { toast } from "sonner";
import { useWorkspace } from "@/components/providers/workspace-context";
import {
	type KanbanItem,
	type KanbanStatus,
	StatusKanbanBoard,
} from "@/components/tasks/StatusKanbanBoard";
import { useWorkspaceSettings } from "@/hooks/use-workspace-settings";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

type StoriesBoardViewProps = {
	projectId: Id<"projects">;
	onAddStory?: (status?: KanbanStatus) => void;
};

/** Map backend story priority to frontend display priority */
function mapPriority(
	priority: string,
): "no-priority" | "low" | "medium" | "high" | "urgent" {
	if (priority === "no_priority") return "no-priority";
	return priority as "low" | "medium" | "high" | "urgent";
}

/** Map backend status to display status for the card */
function mapDisplayStatus(status: string): "todo" | "in-progress" | "done" {
	switch (status) {
		case "done":
			return "done";
		case "in_progress":
		case "in_review":
			return "in-progress";
		default:
			return "todo";
	}
}

/** Map backend story status to KanbanStatus (for column assignment) */
function mapKanbanStatus(status: string): KanbanStatus {
	switch (status) {
		case "backlog":
		case "triage":
			return "backlog";
		case "todo":
			return "todo";
		case "in_progress":
			return "in_progress";
		case "in_review":
			return "in_review";
		case "done":
			return "done";
		case "cancelled":
			return "done"; // Show cancelled in done column
		default:
			return "backlog";
	}
}

export function StoriesBoardView({
	projectId,
	onAddStory,
}: StoriesBoardViewProps) {
	const { workspaceId } = useWorkspace();
	const ws = useWorkspaceSettings(workspaceId);

	const stories = useQuery(api.stories.listByProject, { projectId });
	const members = useQuery(api.workspaceMembers.list, { workspaceId });

	const updateStatus = useMutation(api.stories.updateStatus);
	const reorder = useMutation(api.stories.reorder);

	// Build user lookup map
	const userMap = useMemo(() => {
		if (!members) return new Map<string, { name: string; image?: string }>();
		const map = new Map<string, { name: string; image?: string }>();
		for (const m of members) {
			if (m.user) {
				map.set(m.userId, {
					name: m.user.name ?? "Unknown",
					image: m.user.avatarUrl ?? m.user.image ?? undefined,
				});
			}
		}
		return map;
	}, [members]);

	// Map stories to KanbanItem format
	const kanbanItems = useMemo<KanbanItem[]>(() => {
		if (!stories) return [];

		return stories.map((story) => {
			const assignee = story.assigneeId
				? userMap.get(story.assigneeId)
				: undefined;

			return {
				id: story._id,
				name: story.title,
				status: mapDisplayStatus(story.status),
				backendStatus: mapKanbanStatus(story.status),
				sortOrder: story.sortOrder,
				priority: mapPriority(story.priority),
				assignee: assignee
					? {
							id: story.assigneeId!,
							name: assignee.name,
							avatarUrl: assignee.image,
						}
					: undefined,
				startDate: story.startDate ? new Date(story.startDate) : undefined,
				dueLabel: story.dueDate
					? format(new Date(story.dueDate), "MMM d")
					: undefined,
				tag: story.type,
				projectId: story.projectId ?? "",
				projectName: story.identifier,
				workstreamId: story._id,
				workstreamName: story.identifier,
			};
		});
	}, [stories, userMap]);

	const handleStatusChange = useCallback(
		async (itemId: string, newStatus: KanbanStatus) => {
			// Map KanbanStatus to backend story status
			const backendStatus = newStatus as
				| "backlog"
				| "todo"
				| "in_progress"
				| "in_review"
				| "done";

			try {
				await updateStatus({
					storyId: itemId as Id<"stories">,
					status: backendStatus,
				});
			} catch {
				toast.error("Failed to update story status");
			}
		},
		[updateStatus],
	);

	const handleReorder = useCallback(
		async (itemId: string, newSortOrder: number) => {
			try {
				await reorder({
					storyId: itemId as Id<"stories">,
					newSortOrder,
				});
			} catch {
				toast.error("Failed to reorder story");
			}
		},
		[reorder],
	);

	const handleToggleItem = useCallback(
		async (itemId: string) => {
			const story = stories?.find((s) => s._id === itemId);
			if (!story) return;

			const newStatus = story.status === "done" ? "todo" : "done";
			try {
				await updateStatus({
					storyId: itemId as Id<"stories">,
					status: newStatus,
				});
			} catch {
				toast.error("Failed to update story status");
			}
		},
		[stories, updateStatus],
	);

	const handleAddItem = useCallback(
		(status: KanbanStatus) => {
			onAddStory?.(status);
		},
		[onAddStory],
	);

	const isLoading = stories === undefined;

	const columnLabels = useMemo(() => {
		const labels: Record<string, string> = {};
		for (const s of ws.statuses) {
			labels[s.key] = s.name;
		}
		return labels;
	}, [ws.statuses]);

	return (
		<StatusKanbanBoard
			items={kanbanItems}
			onStatusChange={handleStatusChange}
			onReorder={handleReorder}
			onToggleItem={handleToggleItem}
			onAddItem={onAddStory ? handleAddItem : undefined}
			loading={isLoading}
			columnLabels={columnLabels}
		/>
	);
}
