"use client";

import { closestCenter, DndContext, type DragEndEvent } from "@dnd-kit/core";
import { Plus, Sparkle } from "@phosphor-icons/react/dist/ssr";
import { useMutation, useQuery } from "convex/react";
import { format } from "date-fns";
import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";
import { ChipOverflow } from "@/components/chip-overflow";
import { FilterPopover } from "@/components/filter-popover";
import { useWorkspace } from "@/components/providers/workspace-context";
import { BulkActionBar } from "@/components/tasks/BulkActionBar";
import { TaskDetailSheet } from "@/components/tasks/TaskDetailSheet";
import {
	type CreateTaskContext,
	TaskQuickCreateModal,
} from "@/components/tasks/TaskQuickCreateModal";
import { TasksKanbanBoard } from "@/components/tasks/TasksKanbanBoard";
import {
	computeTaskFilterCounts,
	filterTasksByChips,
	type ProjectTaskGroup,
	ProjectTaskListView,
} from "@/components/tasks/task-helpers";
import { Button } from "@/components/ui/button";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Skeleton } from "@/components/ui/skeleton";
import { ViewOptionsPopover } from "@/components/view-options-popover";
import type { ProjectTask } from "@/lib/data/project-details";
import type { FilterCounts, Project } from "@/lib/data/projects";
import {
	DEFAULT_VIEW_OPTIONS,
	type FilterChip as FilterChipType,
	type ViewOptions,
} from "@/lib/view-options";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

/** Map backend task status to frontend display status */
function mapStatus(status: string): "todo" | "in-progress" | "done" {
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

/** Map backend priority to frontend priority */
function mapPriority(
	priority: string,
): "no-priority" | "low" | "medium" | "high" | "urgent" {
	if (priority === "none") return "no-priority";
	return priority as "low" | "medium" | "high" | "urgent";
}

export function MyTasksPage() {
	const { workspaceId } = useWorkspace();

	// Fetch tasks assigned to me and projects for grouping
	const rawTasks = useQuery(api.tasks.myTasks, { workspaceId });
	const rawProjects = useQuery(api.projects.list, { workspaceId });
	const currentUser = useQuery(api.users.current);

	const updateTaskStatus = useMutation(api.tasks.updateStatus);

	const isLoading = rawTasks === undefined || rawProjects === undefined;

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
				typeLabel: p.typeLabel ?? undefined,
				durationLabel: undefined,
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

	// Map Convex tasks to ProjectTask type and group by project
	const groups = useMemo<ProjectTaskGroup[]>(() => {
		if (!rawTasks || !rawProjects) return [];

		const groupMap = new Map<
			string,
			{ project: Project; tasks: ProjectTask[] }
		>();

		for (const task of rawTasks) {
			const projectId = task.projectId ?? "unassigned";
			const project = task.projectId
				? projectMap.get(task.projectId)
				: undefined;

			const mapped: ProjectTask = {
				id: task._id,
				name: task.title,
				status: mapStatus(task.status),
				dueLabel: task.dueDate
					? format(new Date(task.dueDate), "dd/MM/yyyy")
					: undefined,
				assignee: currentUser
					? {
							id: currentUser._id,
							name: currentUser.name ?? "You",
							avatarUrl:
								currentUser.avatarUrl ?? currentUser.image ?? undefined,
						}
					: undefined,
				startDate: task.startDate ? new Date(task.startDate) : undefined,
				priority: mapPriority(task.priority),
				tag: task.tags?.[0] ?? undefined,
				description: task.description ?? undefined,
				projectId,
				projectName: project?.name ?? "No project",
				workstreamId: task.storyId ?? "",
				workstreamName: task.identifier,
			};

			if (!groupMap.has(projectId)) {
				groupMap.set(projectId, {
					project: project ?? {
						id: "unassigned",
						name: "No project",
						status: "active" as const,
						priority: "low" as const,
						taskCount: 0,
						progress: 0,
						startDate: new Date(),
						endDate: new Date(),
						tags: [],
						members: [],
						tasks: [],
					},
					tasks: [],
				});
			}
			groupMap.get(projectId)!.tasks.push(mapped);
		}

		return Array.from(groupMap.values());
	}, [rawTasks, rawProjects, projectMap, currentUser]);

	const [filters, setFilters] = useState<FilterChipType[]>([]);
	const [viewOptions, setViewOptions] =
		useState<ViewOptions>(DEFAULT_VIEW_OPTIONS);

	const [isCreateTaskOpen, setIsCreateTaskOpen] = useState(false);
	const [createContext, setCreateContext] = useState<
		CreateTaskContext | undefined
	>(undefined);
	const [editingTask, setEditingTask] = useState<ProjectTask | undefined>(
		undefined,
	);

	// Detail sheet state
	const [detailTaskId, setDetailTaskId] = useState<Id<"tasks"> | null>(null);

	// Bulk selection state
	const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
	const [lastClickedId, setLastClickedId] = useState<string | null>(null);

	const allTaskIds = useMemo(() => {
		return groups.flatMap((g) => g.tasks.map((t) => t.id));
	}, [groups]);

	const handleSelectTask = useCallback(
		(taskId: string, shiftKey: boolean) => {
			setSelectedIds((prev) => {
				const next = new Set(prev);
				if (shiftKey && lastClickedId) {
					// Range select
					const start = allTaskIds.indexOf(lastClickedId);
					const end = allTaskIds.indexOf(taskId);
					if (start !== -1 && end !== -1) {
						const [from, to] = start < end ? [start, end] : [end, start];
						for (let i = from; i <= to; i++) {
							next.add(allTaskIds[i]);
						}
					}
				} else {
					if (next.has(taskId)) {
						next.delete(taskId);
					} else {
						next.add(taskId);
					}
				}
				return next;
			});
			setLastClickedId(taskId);
		},
		[lastClickedId, allTaskIds],
	);

	const counts = useMemo<FilterCounts>(() => {
		const allTasks = groups.flatMap((g) => g.tasks);
		return computeTaskFilterCounts(allTasks);
	}, [groups]);

	const visibleGroups = useMemo<ProjectTaskGroup[]>(() => {
		if (!filters.length) return groups;

		return groups
			.map((group) => ({
				project: group.project,
				tasks: filterTasksByChips(group.tasks, filters),
			}))
			.filter((group) => group.tasks.length > 0);
	}, [groups, filters]);

	const openCreateTask = (context?: CreateTaskContext) => {
		setEditingTask(undefined);
		setCreateContext(context);
		setIsCreateTaskOpen(true);
	};

	const openEditTask = (task: ProjectTask) => {
		setDetailTaskId(task.id as Id<"tasks">);
	};

	const handleTaskCreated = useCallback(async (task: ProjectTask) => {
		// The task is already created via the modal mutation;
		// Convex real-time subscription will update the list automatically
	}, []);

	const toggleTask = useCallback(
		async (taskId: string) => {
			// Find the task's current status from groups
			const task = groups.flatMap((g) => g.tasks).find((t) => t.id === taskId);
			if (!task) return;

			const newStatus = task.status === "done" ? "todo" : ("done" as const);
			try {
				await updateTaskStatus({
					taskId: taskId as Id<"tasks">,
					status: newStatus,
				});
			} catch {
				toast.error("Failed to update task status");
			}
		},
		[groups, updateTaskStatus],
	);

	const handleTaskUpdated = (_updated: ProjectTask) => {
		// Convex real-time will handle updates
	};

	const handleDragEnd = (event: DragEndEvent) => {
		const { active, over } = event;
		if (!over || active.id === over.id) return;
		// DnD reordering will be wired to reorder mutation in STORY-017
	};

	if (isLoading) {
		return (
			<div className="flex flex-1 flex-col min-h-0 bg-background mx-2 my-2 border border-border rounded-lg min-w-0">
				<div className="flex items-center justify-between px-4 py-4 border-b border-border/70">
					<div className="space-y-2">
						<Skeleton className="h-5 w-20" />
						<Skeleton className="h-3 w-40" />
					</div>
				</div>
				<div className="p-4 space-y-3">
					<Skeleton className="h-24 w-full rounded-2xl" />
					<Skeleton className="h-24 w-full rounded-2xl" />
				</div>
			</div>
		);
	}

	if (!visibleGroups.length) {
		return (
			<div className="flex flex-1 flex-col min-h-0 bg-background mx-2 my-2 border border-border rounded-lg min-w-0">
				<div className="flex items-center justify-between px-4 py-4 border-b border-border/70">
					<div className="flex items-center gap-3">
						<SidebarTrigger className="h-8 w-8 rounded-lg hover:bg-accent text-muted-foreground" />
						<div className="space-y-1">
							<h1 className="text-lg font-semibold tracking-tight">Tasks</h1>
							<p className="text-xs text-muted-foreground">
								{rawTasks?.length === 0
									? "No tasks assigned to you yet."
									: "No tasks match your filters."}
							</p>
						</div>
					</div>
					<Button size="sm" variant="ghost" onClick={() => openCreateTask()}>
						<Plus className="mr-1.5 h-4 w-4" />
						New Task
					</Button>
				</div>

				<TaskQuickCreateModal
					open={isCreateTaskOpen}
					onClose={() => {
						setIsCreateTaskOpen(false);
						setCreateContext(undefined);
					}}
					context={createContext}
					onTaskCreated={handleTaskCreated}
				/>
			</div>
		);
	}

	return (
		<div className="flex flex-1 flex-col min-h-0 bg-background mx-2 my-2 border border-border rounded-lg min-w-0">
			<header className="flex flex-col border-b border-border/40">
				<div className="flex items-center justify-between px-4 py-3 border-b border-border/70">
					<div className="flex items-center gap-3">
						<SidebarTrigger className="h-8 w-8 rounded-lg hover:bg-accent text-muted-foreground" />
						<p className="text-base font-medium text-foreground">Tasks</p>
					</div>
					<div className="flex items-center gap-2">
						<Button size="sm" variant="ghost" onClick={() => openCreateTask()}>
							<Plus className="mr-1.5 h-4 w-4" />
							New Task
						</Button>
					</div>
				</div>

				<div className="flex items-center justify-between px-4 pb-3 pt-3">
					<div className="flex items-center gap-2">
						<FilterPopover
							initialChips={filters}
							onApply={setFilters}
							onClear={() => setFilters([])}
							counts={counts}
						/>
						<ChipOverflow
							chips={filters}
							onRemove={(key, value) =>
								setFilters((prev) =>
									prev.filter(
										(chip) => !(chip.key === key && chip.value === value),
									),
								)
							}
							maxVisible={6}
						/>
					</div>
					<div className="flex items-center gap-2">
						<ViewOptionsPopover
							options={viewOptions}
							onChange={setViewOptions}
							allowedViewTypes={["list", "board"]}
						/>
						<div className="relative">
							<div className="relative">
								<Button className="h-8 gap-2 shadow-sm rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 relative z-10 px-3">
									<Sparkle className="h-4 w-4" weight="fill" />
									Ask AI
								</Button>
							</div>
						</div>
					</div>
				</div>
			</header>

			<div className="flex-1 min-h-0 space-y-4 overflow-y-auto px-4 py-4">
				{viewOptions.viewType === "list" && (
					<DndContext
						collisionDetection={closestCenter}
						onDragEnd={handleDragEnd}
					>
						<ProjectTaskListView
							groups={visibleGroups}
							onToggleTask={toggleTask}
							onAddTask={(context) => openCreateTask(context)}
							selectedIds={selectedIds}
							onSelectTask={handleSelectTask}
							onOpenTask={openEditTask}
						/>
					</DndContext>
				)}
				{viewOptions.viewType === "board" && (
					<TasksKanbanBoard
						onAddTask={() => openCreateTask()}
						onOpenTask={openEditTask}
					/>
				)}
			</div>

			<TaskQuickCreateModal
				open={isCreateTaskOpen}
				onClose={() => {
					setIsCreateTaskOpen(false);
					setEditingTask(undefined);
					setCreateContext(undefined);
				}}
				context={editingTask ? undefined : createContext}
				onTaskCreated={handleTaskCreated}
				editingTask={editingTask}
				onTaskUpdated={handleTaskUpdated}
			/>

			<TaskDetailSheet
				taskId={detailTaskId}
				open={detailTaskId !== null}
				onClose={() => setDetailTaskId(null)}
			/>

			<BulkActionBar
				selectedIds={selectedIds}
				onClearSelection={() => setSelectedIds(new Set())}
				entityType="task"
			/>
		</div>
	);
}
