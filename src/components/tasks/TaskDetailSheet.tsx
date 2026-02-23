"use client";

import {
	CalendarBlank,
	ChartBar,
	CheckCircle,
	Circle,
	CircleNotch,
	Eye,
	StackSimple,
	Tag as TagIcon,
	User as UserIcon,
	X,
} from "@phosphor-icons/react/dist/ssr";
import { useMutation, useQuery } from "convex/react";
import { format } from "date-fns";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { ActivityFeed } from "@/components/projects/ActivityFeed";
import { useWorkspace } from "@/components/providers/workspace-context";
import {
	useCurrentUser,
	useWorkspaceMembers,
	useWorkspaceProjects,
} from "@/components/providers/workspace-data-context";
import { TaskCommentSection } from "@/components/tasks/TaskCommentSection";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { DatePicker, GenericPicker } from "@/components/ui/pickers";
import {
	Sheet,
	SheetContent,
	SheetHeader,
	SheetTitle,
} from "@/components/ui/sheet";
import { useWorkspaceSettings } from "@/hooks/use-workspace-settings";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

type TaskDetailSheetProps = {
	taskId: Id<"tasks"> | null;
	open: boolean;
	onClose: () => void;
};

const STATUS_OPTIONS = [
	{
		id: "backlog" as const,
		label: "Backlog",
		icon: <StackSimple className="h-4 w-4 text-muted-foreground" />,
	},
	{
		id: "todo" as const,
		label: "To do",
		icon: <Circle className="h-4 w-4 text-muted-foreground" />,
	},
	{
		id: "in_progress" as const,
		label: "In progress",
		icon: <CircleNotch className="h-4 w-4 text-yellow-500" />,
	},
	{
		id: "in_review" as const,
		label: "In review",
		icon: <Eye className="h-4 w-4 text-blue-500" />,
	},
	{
		id: "done" as const,
		label: "Done",
		icon: <CheckCircle className="h-4 w-4 text-emerald-500" />,
	},
	{
		id: "cancelled" as const,
		label: "Cancelled",
		icon: <X className="h-4 w-4 text-muted-foreground" />,
	},
];

const PRIORITY_OPTIONS = [
	{ id: "none" as const, label: "No priority" },
	{ id: "low" as const, label: "Low" },
	{ id: "medium" as const, label: "Medium" },
	{ id: "high" as const, label: "High" },
	{ id: "urgent" as const, label: "Urgent" },
];

const TYPE_OPTIONS = [
	{ id: "task" as const, label: "Task" },
	{ id: "bug" as const, label: "Bug" },
	{ id: "chore" as const, label: "Chore" },
];

export function TaskDetailSheet({
	taskId,
	open,
	onClose,
}: TaskDetailSheetProps) {
	const { workspaceId } = useWorkspace();
	const ws = useWorkspaceSettings(workspaceId);

	const task = useQuery(api.tasks.getById, taskId ? { taskId } : "skip");
	const members = useWorkspaceMembers();
	const projects = useWorkspaceProjects();
	const subtasks = useQuery(
		api.tasks.getSubtasks,
		taskId ? { parentId: taskId } : "skip",
	);
	const currentUser = useCurrentUser();

	const updateTask = useMutation(api.tasks.update);
	const updateStatus = useMutation(api.tasks.updateStatus);
	const assignTask = useMutation(api.tasks.assign);

	const [editingTitle, setEditingTitle] = useState(false);
	const [titleValue, setTitleValue] = useState("");
	const [editingDescription, setEditingDescription] = useState(false);
	const [descriptionValue, setDescriptionValue] = useState("");
	const titleInputRef = useRef<HTMLInputElement>(null);
	const descriptionRef = useRef<HTMLTextAreaElement>(null);

	useEffect(() => {
		if (editingTitle) titleInputRef.current?.focus();
	}, [editingTitle]);

	useEffect(() => {
		if (editingDescription) descriptionRef.current?.focus();
	}, [editingDescription]);

	useEffect(() => {
		if (task) {
			setTitleValue(task.title);
			setDescriptionValue(task.description ?? "");
		}
	}, [task]);

	const memberOptions = useMemo(() => {
		if (!members) return [];
		return members.map((m) => ({
			id: m.userId as string,
			name: m.user?.name ?? m.user?.email ?? "Unknown",
			image: m.user?.avatarUrl ?? m.user?.image ?? undefined,
		}));
	}, [members]);

	const assignee = useMemo(() => {
		if (!task?.assigneeId || !memberOptions.length) return undefined;
		return memberOptions.find((m) => m.id === task.assigneeId);
	}, [task?.assigneeId, memberOptions]);

	const project = useMemo(() => {
		if (!task?.projectId || !projects) return undefined;
		return projects.find((p) => p._id === task.projectId);
	}, [task?.projectId, projects]);

	const handleTitleSave = useCallback(async () => {
		if (!taskId || !titleValue.trim()) return;
		setEditingTitle(false);
		try {
			await updateTask({ taskId, title: titleValue.trim() });
		} catch {
			toast.error("Failed to update title");
		}
	}, [taskId, titleValue, updateTask]);

	const handleDescriptionSave = useCallback(async () => {
		if (!taskId) return;
		setEditingDescription(false);
		try {
			await updateTask({ taskId, description: descriptionValue });
		} catch {
			toast.error("Failed to update description");
		}
	}, [taskId, descriptionValue, updateTask]);

	const handleStatusChange = useCallback(
		async (option: { id: string }) => {
			if (!taskId) return;
			try {
				await updateStatus({
					taskId,
					status: option.id as
						| "backlog"
						| "todo"
						| "in_progress"
						| "in_review"
						| "done"
						| "cancelled",
				});
			} catch {
				toast.error("Failed to update status");
			}
		},
		[taskId, updateStatus],
	);

	const handleAssigneeChange = useCallback(
		async (option: { id: string }) => {
			if (!taskId) return;
			try {
				await assignTask({
					taskId,
					assigneeId: option.id as Id<"users">,
				});
			} catch {
				toast.error("Failed to assign task");
			}
		},
		[taskId, assignTask],
	);

	const handleUnassign = useCallback(async () => {
		if (!taskId) return;
		try {
			await assignTask({ taskId, assigneeId: undefined });
		} catch {
			toast.error("Failed to unassign task");
		}
	}, [taskId, assignTask]);

	const handlePriorityChange = useCallback(
		async (option: { id: string }) => {
			if (!taskId) return;
			try {
				await updateTask({
					taskId,
					priority: option.id as "none" | "low" | "medium" | "high" | "urgent",
				});
			} catch {
				toast.error("Failed to update priority");
			}
		},
		[taskId, updateTask],
	);

	const handleTypeChange = useCallback(
		async (option: { id: string }) => {
			if (!taskId) return;
			try {
				await updateTask({
					taskId,
					type: option.id as "task" | "bug" | "chore",
				});
			} catch {
				toast.error("Failed to update type");
			}
		},
		[taskId, updateTask],
	);

	const handleDueDateChange = useCallback(
		async (date: Date | undefined) => {
			if (!taskId) return;
			try {
				await updateTask({
					taskId,
					dueDate: date?.getTime(),
				});
			} catch {
				toast.error("Failed to update due date");
			}
		},
		[taskId, updateTask],
	);

	// Dynamic options from workspace settings
	const statusOptions = useMemo(
		() =>
			STATUS_OPTIONS.map((s) => ({
				...s,
				label: ws.getStatusName(s.id),
			})),
		[ws],
	);
	const priorityOptions = useMemo(
		() =>
			PRIORITY_OPTIONS.map((p) => ({
				...p,
				label: ws.getPriorityName(p.id),
			})),
		[ws],
	);
	const typeOptions = useMemo(
		() =>
			TYPE_OPTIONS.map((t) => ({
				...t,
				label: ws.getTypeName(t.id),
			})),
		[ws],
	);

	const currentStatus = statusOptions.find((s) => s.id === task?.status);
	const currentPriority = priorityOptions.find((p) => p.id === task?.priority);
	const currentType = typeOptions.find((t) => t.id === task?.type);

	const subtasksDone = subtasks?.filter((s) => s.status === "done").length ?? 0;
	const subtasksTotal = subtasks?.length ?? 0;

	if (!task) {
		return (
			<Sheet open={open} onOpenChange={(o) => !o && onClose()}>
				<SheetContent className="w-full sm:max-w-lg overflow-y-auto">
					<SheetHeader>
						<SheetTitle>Loading...</SheetTitle>
					</SheetHeader>
				</SheetContent>
			</Sheet>
		);
	}

	return (
		<Sheet open={open} onOpenChange={(o) => !o && onClose()}>
			<SheetContent className="w-full sm:max-w-lg overflow-y-auto">
				<SheetHeader className="space-y-1">
					{/* Identifier + project */}
					<div className="flex items-center gap-2 text-xs text-muted-foreground">
						<Badge variant="secondary" className="text-xs">
							{task.identifier}
						</Badge>
						{project && <span className="truncate">{project.name}</span>}
					</div>

					{/* Title */}
					{editingTitle ? (
						<input
							value={titleValue}
							onChange={(e) => setTitleValue(e.target.value)}
							onBlur={handleTitleSave}
							onKeyDown={(e) => {
								if (e.key === "Enter") handleTitleSave();
								if (e.key === "Escape") {
									setEditingTitle(false);
									setTitleValue(task.title);
								}
							}}
							className="text-lg font-semibold bg-transparent border-b border-primary outline-none w-full"
							ref={titleInputRef}
						/>
					) : (
						<SheetTitle
							className="text-lg font-semibold cursor-pointer hover:text-primary/80 transition-colors"
							onClick={() => setEditingTitle(true)}
						>
							{task.title}
						</SheetTitle>
					)}
				</SheetHeader>

				<div className="space-y-6 mt-6">
					{/* Properties grid */}
					<div className="grid grid-cols-[120px_1fr] gap-y-3 gap-x-4 text-sm">
						{/* Status */}
						<span className="text-muted-foreground flex items-center gap-2">
							<CircleNotch className="h-4 w-4" />
							Status
						</span>
						<GenericPicker
							items={statusOptions}
							onSelect={handleStatusChange}
							selectedId={task.status}
							placeholder="Set status..."
							renderItem={(item) => (
								<div className="flex items-center gap-2 w-full">
									<span className="flex-1">{item.label}</span>
								</div>
							)}
							trigger={
								<button
									type="button"
									className="flex items-center gap-2 px-2 py-1 rounded-md hover:bg-muted transition-colors text-sm"
								>
									{currentStatus?.icon}
									<span>{currentStatus?.label ?? "No status"}</span>
								</button>
							}
						/>

						{/* Assignee */}
						<span className="text-muted-foreground flex items-center gap-2">
							<UserIcon className="h-4 w-4" />
							Assignee
						</span>
						<div className="flex items-center gap-2">
							<GenericPicker
								items={memberOptions}
								onSelect={handleAssigneeChange}
								selectedId={task.assigneeId ?? undefined}
								placeholder="Assign to..."
								renderItem={(item) => (
									<div className="flex items-center gap-2 w-full">
										<div className="size-5 rounded-full bg-muted flex items-center justify-center text-xs font-bold">
											{item.name.charAt(0)}
										</div>
										<span className="flex-1">{item.name}</span>
									</div>
								)}
								trigger={
									<button
										type="button"
										className="flex items-center gap-2 px-2 py-1 rounded-md hover:bg-muted transition-colors text-sm"
									>
										{assignee ? (
											<>
												<Avatar className="size-5">
													{assignee.image && (
														<AvatarImage
															src={assignee.image}
															alt={assignee.name}
														/>
													)}
													<AvatarFallback className="text-[10px]">
														{assignee.name.charAt(0).toUpperCase()}
													</AvatarFallback>
												</Avatar>
												<span>{assignee.name}</span>
											</>
										) : (
											<span className="text-muted-foreground">Unassigned</span>
										)}
									</button>
								}
							/>
							{task.assigneeId && (
								<button
									type="button"
									onClick={handleUnassign}
									className="text-xs text-muted-foreground hover:text-foreground"
								>
									<X className="h-3 w-3" />
								</button>
							)}
						</div>

						{/* Priority */}
						<span className="text-muted-foreground flex items-center gap-2">
							<ChartBar className="h-4 w-4" />
							Priority
						</span>
						<GenericPicker
							items={priorityOptions}
							onSelect={handlePriorityChange}
							selectedId={task.priority}
							placeholder="Set priority..."
							renderItem={(item) => (
								<div className="flex items-center gap-2 w-full">
									<span className="flex-1">{item.label}</span>
								</div>
							)}
							trigger={
								<button
									type="button"
									className="flex items-center gap-2 px-2 py-1 rounded-md hover:bg-muted transition-colors text-sm"
								>
									<span>{currentPriority?.label ?? "No priority"}</span>
								</button>
							}
						/>

						{/* Type */}
						<span className="text-muted-foreground flex items-center gap-2">
							<TagIcon className="h-4 w-4" />
							Type
						</span>
						<GenericPicker
							items={typeOptions}
							onSelect={handleTypeChange}
							selectedId={task.type}
							placeholder="Set type..."
							renderItem={(item) => (
								<div className="flex items-center gap-2 w-full">
									<span className="flex-1">{item.label}</span>
								</div>
							)}
							trigger={
								<button
									type="button"
									className="flex items-center gap-2 px-2 py-1 rounded-md hover:bg-muted transition-colors text-sm"
								>
									<span>{currentType?.label ?? "Task"}</span>
								</button>
							}
						/>

						{/* Due date */}
						<span className="text-muted-foreground flex items-center gap-2">
							<CalendarBlank className="h-4 w-4" />
							Due date
						</span>
						<DatePicker
							date={task.dueDate ? new Date(task.dueDate) : undefined}
							onSelect={handleDueDateChange}
							trigger={
								<button
									type="button"
									className="flex items-center gap-2 px-2 py-1 rounded-md hover:bg-muted transition-colors text-sm"
								>
									<span>
										{task.dueDate
											? format(new Date(task.dueDate), "MMM d, yyyy")
											: "No due date"}
									</span>
								</button>
							}
						/>

						{/* Completed at */}
						{task.completedAt && (
							<>
								<span className="text-muted-foreground flex items-center gap-2">
									<CheckCircle className="h-4 w-4" />
									Completed
								</span>
								<span className="text-sm px-2 py-1">
									{format(
										new Date(task.completedAt),
										"MMM d, yyyy 'at' h:mm a",
									)}
								</span>
							</>
						)}
					</div>

					{/* Description */}
					<div className="space-y-2">
						<h3 className="text-sm font-medium text-muted-foreground">
							Description
						</h3>
						{editingDescription ? (
							<textarea
								value={descriptionValue}
								onChange={(e) => setDescriptionValue(e.target.value)}
								onBlur={handleDescriptionSave}
								className="w-full min-h-[100px] text-sm bg-transparent border border-border rounded-lg p-3 outline-none focus:border-primary resize-y"
								ref={descriptionRef}
							/>
						) : (
							<div
								className="text-sm text-foreground/80 min-h-[40px] p-3 rounded-lg border border-transparent hover:border-border cursor-pointer transition-colors"
								onClick={() => setEditingDescription(true)}
							>
								{task.description || (
									<span className="text-muted-foreground">
										Add a description...
									</span>
								)}
							</div>
						)}
					</div>

					{/* Sub-tasks */}
					{subtasksTotal > 0 && (
						<div className="space-y-2">
							<div className="flex items-center justify-between">
								<h3 className="text-sm font-medium text-muted-foreground">
									Sub-tasks
								</h3>
								<span className="text-xs text-muted-foreground">
									{subtasksDone}/{subtasksTotal} done
								</span>
							</div>
							<div className="space-y-1">
								{subtasks?.map((sub) => (
									<div
										key={sub._id}
										className="flex items-center gap-2 text-sm py-1 px-2 rounded hover:bg-muted"
									>
										{sub.status === "done" ? (
											<CheckCircle className="h-4 w-4 text-emerald-500 shrink-0" />
										) : (
											<Circle className="h-4 w-4 text-muted-foreground shrink-0" />
										)}
										<span
											className={
												sub.status === "done"
													? "line-through text-muted-foreground"
													: ""
											}
										>
											{sub.title}
										</span>
										<Badge variant="secondary" className="text-[10px] ml-auto">
											{sub.identifier}
										</Badge>
									</div>
								))}
							</div>
						</div>
					)}

					{/* Comments */}
					{taskId && (
						<div className="border-t border-border pt-4">
							<TaskCommentSection
								taskId={taskId}
								currentUserId={currentUser?._id}
							/>
						</div>
					)}

					{/* Activity */}
					{taskId && (
						<div className="border-t border-border pt-4">
							<h3 className="text-sm font-medium text-muted-foreground mb-2">
								Activity
							</h3>
							<ActivityFeed taskId={taskId} />
						</div>
					)}

					{/* Metadata */}
					<div className="border-t border-border pt-4 space-y-1 text-xs text-muted-foreground">
						<p>
							Created{" "}
							{format(new Date(task._creationTime), "MMM d, yyyy 'at' h:mm a")}
						</p>
						{task.updatedAt && (
							<p>
								Updated{" "}
								{format(new Date(task.updatedAt), "MMM d, yyyy 'at' h:mm a")}
							</p>
						)}
					</div>
				</div>
			</SheetContent>
		</Sheet>
	);
}
