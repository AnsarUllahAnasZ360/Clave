"use client";

import { useMutation, useQuery } from "convex/react";
import { format } from "date-fns";
import { useCallback, useMemo } from "react";
import { toast } from "sonner";
import { useWorkspace } from "@/components/providers/workspace-context";
import {
	useCurrentUser,
	useWorkspaceProjects,
} from "@/components/providers/workspace-data-context";
import {
	type KanbanItem,
	type KanbanStatus,
	StatusKanbanBoard,
} from "@/components/tasks/StatusKanbanBoard";
import { useWorkspaceSettings } from "@/hooks/use-workspace-settings";
import type { ProjectTask } from "@/lib/data/project-details";
import type { Project } from "@/lib/data/projects";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

type TasksKanbanBoardProps = {
	onAddTask?: (status?: KanbanStatus) => void;
	onOpenTask?: (task: ProjectTask) => void;
};

/** Map backend task status to frontend display status */
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

/** Map backend task priority to frontend priority */
function mapPriority(
	priority: string,
): "no-priority" | "low" | "medium" | "high" | "urgent" {
	if (priority === "none") return "no-priority";
	return priority as "low" | "medium" | "high" | "urgent";
}

/** Map backend task status to KanbanStatus (for column assignment) */
function mapKanbanStatus(status: string): KanbanStatus {
	switch (status) {
		case "backlog":
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
			return "done";
		default:
			return "backlog";
	}
}

export function TasksKanbanBoard({
	onAddTask,
	onOpenTask,
}: TasksKanbanBoardProps) {
	const { workspaceId } = useWorkspace();
	const ws = useWorkspaceSettings(workspaceId);

	const rawTasks = useQuery(api.tasks.myTasks, { workspaceId });
	const rawProjects = useWorkspaceProjects();
	const currentUser = useCurrentUser();

	const updateTaskStatus = useMutation(api.tasks.updateStatus);
	const reorderTask = useMutation(api.tasks.reorder);

	// Build project lookup
	const projectMap = useMemo(() => {
		if (!rawProjects) return new Map<string, Project>();
		const map = new Map<string, Project>();
		for (const p of rawProjects) {
			map.set(p._id, {
				id: p._id,
				name: p.name,
				status: p.status as Project["status"],
				priority:
					p.priority === "no_priority"
						? "low"
						: (p.priority as Project["priority"]),
				slug: p.slug,
				taskCount: 0,
				progress: 0,
				startDate: p.startDate ? new Date(p.startDate) : new Date(),
				endDate: p.endDate ? new Date(p.endDate) : new Date(),
				tags: p.tags ?? [],
				members: [],
				tasks: [],
			});
		}
		return map;
	}, [rawProjects]);

	// Map tasks to KanbanItem format
	const kanbanItems = useMemo<KanbanItem[]>(() => {
		if (!rawTasks) return [];

		return rawTasks.map((task) => {
			const project = task.projectId
				? projectMap.get(task.projectId)
				: undefined;

			return {
				id: task._id,
				name: task.title,
				status: mapDisplayStatus(task.status),
				backendStatus: mapKanbanStatus(task.status),
				sortOrder: task.sortOrder,
				priority: mapPriority(task.priority),
				assignee: currentUser
					? {
							id: currentUser._id,
							name: currentUser.name ?? "You",
							avatarUrl:
								currentUser.avatarUrl ?? currentUser.image ?? undefined,
						}
					: undefined,
				startDate: task.startDate ? new Date(task.startDate) : undefined,
				dueLabel: task.dueDate
					? format(new Date(task.dueDate), "MMM d")
					: undefined,
				tag: task.tags?.[0],
				projectId: task.projectId ?? "",
				projectName: project?.name ?? "No project",
				workstreamId: task.storyId ?? "",
				workstreamName: task.identifier,
			};
		});
	}, [rawTasks, projectMap, currentUser]);

	const handleStatusChange = useCallback(
		async (itemId: string, newStatus: KanbanStatus) => {
			try {
				await updateTaskStatus({
					taskId: itemId as Id<"tasks">,
					status: newStatus,
				});
			} catch {
				toast.error("Failed to update task status");
			}
		},
		[updateTaskStatus],
	);

	const handleReorder = useCallback(
		async (itemId: string, newSortOrder: number) => {
			try {
				await reorderTask({
					taskId: itemId as Id<"tasks">,
					newSortOrder,
				});
			} catch {
				toast.error("Failed to reorder task");
			}
		},
		[reorderTask],
	);

	const handleToggleItem = useCallback(
		async (itemId: string) => {
			const task = rawTasks?.find((t) => t._id === itemId);
			if (!task) return;

			const newStatus = task.status === "done" ? "todo" : "done";
			try {
				await updateTaskStatus({
					taskId: itemId as Id<"tasks">,
					status: newStatus,
				});
			} catch {
				toast.error("Failed to update task status");
			}
		},
		[rawTasks, updateTaskStatus],
	);

	const handleOpenItem = useCallback(
		(item: KanbanItem) => {
			onOpenTask?.(item);
		},
		[onOpenTask],
	);

	const handleAddItem = useCallback(
		(status: KanbanStatus) => {
			onAddTask?.(status);
		},
		[onAddTask],
	);

	const isLoading = rawTasks === undefined || rawProjects === undefined;

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
			onOpenItem={handleOpenItem}
			onAddItem={onAddTask ? handleAddItem : undefined}
			loading={isLoading}
			columnLabels={columnLabels}
		/>
	);
}
