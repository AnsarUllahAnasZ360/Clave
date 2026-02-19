"use client";

import {
	CalendarBlank,
	ChartBar,
	Folder,
	Paperclip,
	Tag as TagIcon,
	UserCircle,
	X,
} from "@phosphor-icons/react/dist/ssr";
import { useMutation, useQuery } from "convex/react";
import { format } from "date-fns";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { ProjectDescriptionEditor } from "@/components/project-wizard/ProjectDescriptionEditor";
import { useWorkspace } from "@/components/providers/workspace-context";
import { QuickCreateModalLayout } from "@/components/QuickCreateModalLayout";
import { Button } from "@/components/ui/button";
import { DatePicker, GenericPicker } from "@/components/ui/pickers";
import { Switch } from "@/components/ui/switch";
import type { ProjectTask } from "@/lib/data/project-details";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

export type CreateTaskContext = {
	projectId?: string;
	workstreamId?: string;
	workstreamName?: string;
};

interface TaskQuickCreateModalProps {
	open: boolean;
	onClose: () => void;
	context?: CreateTaskContext;
	onTaskCreated?: (task: ProjectTask) => void;
	editingTask?: ProjectTask;
	onTaskUpdated?: (task: ProjectTask) => void;
}

type TaskStatusId = "todo" | "in_progress" | "done";

type StatusOption = {
	id: TaskStatusId;
	label: string;
};

type PriorityOption = {
	id: "none" | "low" | "medium" | "high" | "urgent";
	label: string;
};

export type TagOption = {
	id: string;
	label: string;
};

const STATUS_OPTIONS: StatusOption[] = [
	{ id: "todo", label: "To do" },
	{ id: "in_progress", label: "In progress" },
	{ id: "done", label: "Done" },
];

const PRIORITY_OPTIONS: PriorityOption[] = [
	{ id: "none", label: "No priority" },
	{ id: "low", label: "Low" },
	{ id: "medium", label: "Medium" },
	{ id: "high", label: "High" },
	{ id: "urgent", label: "Urgent" },
];

export const TAG_OPTIONS: TagOption[] = [
	{ id: "task", label: "Task" },
	{ id: "bug", label: "Bug" },
	{ id: "chore", label: "Chore" },
];

export function TaskQuickCreateModal({
	open,
	onClose,
	context,
	onTaskCreated,
	editingTask,
	onTaskUpdated,
}: TaskQuickCreateModalProps) {
	const { workspaceId } = useWorkspace();
	const rawProjects = useQuery(api.projects.list, { workspaceId });
	const workspaceMembers = useQuery(api.workspaceMembers.list, {
		workspaceId,
	});
	const createTaskMutation = useMutation(api.tasks.create);
	const updateTaskMutation = useMutation(api.tasks.update);

	const [title, setTitle] = useState("");
	const [description, setDescription] = useState<string | undefined>(undefined);
	const [createMore, setCreateMore] = useState(false);
	const [isDescriptionExpanded, setIsDescriptionExpanded] = useState(false);

	const [projectId, setProjectId] = useState<string | undefined>(undefined);
	const [assigneeId, setAssigneeId] = useState<string | undefined>(undefined);
	const [status, setStatus] = useState<StatusOption>(STATUS_OPTIONS[0]);
	const [startDate, setStartDate] = useState<Date | undefined>(new Date());
	const [targetDate, setTargetDate] = useState<Date | undefined>(undefined);
	const [priority, setPriority] = useState<PriorityOption>(PRIORITY_OPTIONS[0]);
	const [selectedTag, setSelectedTag] = useState<TagOption | undefined>(
		undefined,
	);

	// Build project options from real data
	const projectOptions = useMemo(() => {
		if (!rawProjects) return [];
		return rawProjects.map((p) => ({ id: p._id, label: p.name }));
	}, [rawProjects]);

	// Build assignee options from workspace members
	const assigneeOptions = useMemo(() => {
		if (!workspaceMembers) return [];
		return workspaceMembers.map((m) => ({
			id: m.userId as string,
			name: m.user?.name ?? m.user?.email ?? "Unknown",
		}));
	}, [workspaceMembers]);

	const selectedAssignee = useMemo(
		() => assigneeOptions.find((a) => a.id === assigneeId),
		[assigneeOptions, assigneeId],
	);

	useEffect(() => {
		if (!open) return;

		if (editingTask) {
			setProjectId(editingTask.projectId);
			setTitle(editingTask.name);
			setDescription(editingTask.description);
			setCreateMore(false);
			setIsDescriptionExpanded(false);

			setAssigneeId(editingTask.assignee?.id);

			const statusOption = STATUS_OPTIONS.find(
				(s) => s.id === editingTask.status.replace("-", "_"),
			);
			setStatus(statusOption ?? STATUS_OPTIONS[0]);

			setStartDate(editingTask.startDate ?? new Date());
			setTargetDate(undefined);

			const priorityOption = editingTask.priority
				? PRIORITY_OPTIONS.find(
						(p) =>
							p.id ===
							(editingTask.priority === "no-priority"
								? "none"
								: editingTask.priority),
					)
				: undefined;
			setPriority(priorityOption ?? PRIORITY_OPTIONS[0]);

			const tagOption = editingTask.tag
				? TAG_OPTIONS.find((t) => t.label === editingTask.tag)
				: undefined;
			setSelectedTag(tagOption);

			return;
		}

		setProjectId(context?.projectId);
		setTitle("");
		setDescription(undefined);
		setCreateMore(false);
		setIsDescriptionExpanded(false);
		setAssigneeId(undefined);
		setStatus(STATUS_OPTIONS[0]);
		setStartDate(new Date());
		setTargetDate(undefined);
		setPriority(PRIORITY_OPTIONS[0]);
		setSelectedTag(undefined);
	}, [open, context?.projectId, editingTask]);

	const handleSubmit = async () => {
		if (editingTask) {
			try {
				await updateTaskMutation({
					taskId: editingTask.id as Id<"tasks">,
					title: title.trim() || "Untitled task",
					description,
					priority: priority.id,
					type: (selectedTag?.id as "task" | "bug" | "chore") ?? "task",
					startDate: startDate?.getTime(),
					dueDate: targetDate?.getTime(),
				});

				onTaskUpdated?.(editingTask);
				toast.success("Task updated successfully");
				onClose();
			} catch {
				toast.error("Failed to update task");
			}
			return;
		}

		try {
			const result = await createTaskMutation({
				workspaceId,
				projectId: projectId ? (projectId as Id<"projects">) : undefined,
				title: title.trim() || "Untitled task",
				description,
				status: status.id,
				priority: priority.id,
				type: (selectedTag?.id as "task" | "bug" | "chore") ?? "task",
				assigneeId: assigneeId ? (assigneeId as Id<"users">) : undefined,
				startDate: startDate?.getTime(),
				dueDate: targetDate?.getTime(),
				tags: selectedTag ? [selectedTag.label] : undefined,
			});

			// Create a ProjectTask for the callback (Convex real-time will sync)
			const newTask: ProjectTask = {
				id: result.taskId,
				name: title.trim() || "Untitled task",
				status:
					status.id === "done"
						? "done"
						: status.id === "in_progress"
							? "in-progress"
							: "todo",
				dueLabel: targetDate ? format(targetDate, "dd/MM/yyyy") : undefined,
				assignee: selectedAssignee
					? { id: selectedAssignee.id, name: selectedAssignee.name }
					: undefined,
				startDate,
				priority: priority.id === "none" ? "no-priority" : priority.id,
				tag: selectedTag?.label,
				description,
				projectId: projectId ?? "unassigned",
				projectName:
					projectOptions.find((p) => p.id === projectId)?.label ?? "No project",
				workstreamId: "",
				workstreamName: result.identifier,
			};

			onTaskCreated?.(newTask);

			if (createMore) {
				toast.success("Task created! Ready for another.");
				setTitle("");
				setDescription(undefined);
				setStatus(STATUS_OPTIONS[0]);
				setTargetDate(undefined);
				return;
			}

			toast.success("Task created successfully");
			onClose();
		} catch {
			toast.error("Failed to create task");
		}
	};

	const projectLabel = projectOptions.find((p) => p.id === projectId)?.label;

	return (
		<QuickCreateModalLayout
			open={open}
			onClose={onClose}
			isDescriptionExpanded={isDescriptionExpanded}
			onSubmitShortcut={handleSubmit}
		>
			{/* Context row */}
			<div className="flex items-center justify-between gap-3">
				<div className="flex items-center gap-2 flex-wrap">
					<GenericPicker
						items={projectOptions}
						selectedId={projectId}
						onSelect={(item) => setProjectId(item.id)}
						placeholder="Choose project..."
						renderItem={(item) => (
							<div className="flex items-center justify-between w-full gap-2">
								<span>{item.label}</span>
							</div>
						)}
						trigger={
							<button className="bg-background flex gap-2 h-7 items-center px-2 py-1 rounded-lg border border-background hover:border-primary/50 transition-colors text-xs disabled:opacity-60">
								<Folder className="size-4 text-muted-foreground" />
								<span className="truncate max-w-[160px] font-medium text-foreground">
									{projectLabel ?? "Choose project"}
								</span>
							</button>
						}
					/>
				</div>

				<Button
					type="button"
					variant="ghost"
					size="icon"
					onClick={onClose}
					className="h-8 w-8 rounded-full opacity-70 hover:opacity-100"
				>
					<X className="h-4 w-4 text-muted-foreground" />
				</Button>
			</div>

			{/* Title */}
			<div className="flex flex-col gap-2 w-full shrink-0 mt-1">
				<div className="flex gap-1 h-10 items-center w-full">
					<input
						id="task-create-title"
						type="text"
						value={title}
						onChange={(e) => setTitle(e.target.value)}
						placeholder="Task title"
						className="w-full font-normal leading-7 text-foreground placeholder:text-muted-foreground text-xl outline-none bg-transparent border-none p-0"
						autoComplete="off"
					/>
				</div>
			</div>

			{/* Description */}
			<ProjectDescriptionEditor
				value={description}
				onChange={setDescription}
				onExpandChange={setIsDescriptionExpanded}
				placeholder="Briefly describe the goal or details of this task..."
				showTemplates={false}
			/>

			{/* Properties */}
			<div className="flex flex-wrap gap-2.5 items-start w-full shrink-0">
				{/* Assignee */}
				<GenericPicker
					items={assigneeOptions}
					onSelect={(item) => setAssigneeId(item.id)}
					selectedId={assigneeId}
					placeholder="Assign owner..."
					renderItem={(item) => (
						<div className="flex items-center gap-2 w-full">
							<div className="size-5 rounded-full bg-muted flex items-center justify-center text-xs font-bold">
								{item.name.charAt(0)}
							</div>
							<span className="flex-1">{item.name}</span>
						</div>
					)}
					trigger={
						<button className="bg-muted flex gap-2 h-9 items-center px-3 py-2 rounded-lg border border-border hover:border-primary/50 transition-colors">
							<div className="size-4 rounded-full bg-background flex items-center justify-center text-[10px] font-medium">
								{selectedAssignee?.name.charAt(0) ?? "?"}
							</div>
							<span className="font-medium text-foreground text-sm leading-5">
								{selectedAssignee?.name ?? "Assignee"}
							</span>
						</button>
					}
				/>

				{/* Start date */}
				<DatePicker
					date={startDate}
					onSelect={setStartDate}
					trigger={
						<button className="bg-muted flex gap-2 h-9 items-center px-3 py-2 rounded-lg border border-border hover:border-primary/50 transition-colors">
							<CalendarBlank className="size-4 text-muted-foreground" />
							<span className="font-medium text-foreground text-sm leading-5">
								{startDate
									? `Start: ${format(startDate, "dd/MM/yyyy")}`
									: "Start date"}
							</span>
						</button>
					}
				/>

				{/* Status */}
				<GenericPicker
					items={STATUS_OPTIONS}
					onSelect={setStatus}
					selectedId={status.id}
					placeholder="Change status..."
					renderItem={(item) => (
						<div className="flex items-center gap-2 w-full">
							<span className="flex-1">{item.label}</span>
						</div>
					)}
					trigger={
						<button className="bg-background flex gap-2 h-9 items-center px-3 py-2 rounded-lg border border-border hover:bg-black/5 transition-colors">
							<UserCircle className="size-4 text-muted-foreground" />
							<span className="font-medium text-foreground text-sm leading-5">
								{status.label}
							</span>
						</button>
					}
				/>

				{/* Target date */}
				<DatePicker
					date={targetDate}
					onSelect={setTargetDate}
					trigger={
						<button className="bg-background flex gap-2 h-9 items-center px-3 py-2 rounded-lg border border-border hover:bg-black/5 transition-colors">
							<CalendarBlank className="size-4 text-muted-foreground" />
							<span className="font-medium text-foreground text-sm leading-5">
								{targetDate ? format(targetDate, "dd/MM/yyyy") : "Target"}
							</span>
						</button>
					}
				/>

				{/* Priority */}
				<GenericPicker
					items={PRIORITY_OPTIONS}
					onSelect={setPriority}
					selectedId={priority?.id}
					placeholder="Set priority..."
					renderItem={(item) => (
						<div className="flex items-center gap-2 w-full">
							<span className="flex-1">{item.label}</span>
						</div>
					)}
					trigger={
						<button className="bg-background flex gap-2 h-9 items-center px-3 py-2 rounded-lg border border-border hover:bg-black/5 transition-colors">
							<ChartBar className="size-4 text-muted-foreground" />
							<span className="font-medium text-foreground text-sm leading-5">
								{priority?.label ?? "Priority"}
							</span>
						</button>
					}
				/>

				{/* Tag / Type */}
				<GenericPicker
					items={TAG_OPTIONS}
					onSelect={setSelectedTag}
					selectedId={selectedTag?.id}
					placeholder="Add tag..."
					renderItem={(item) => (
						<div className="flex items-center gap-2 w-full">
							<span className="flex-1">{item.label}</span>
						</div>
					)}
					trigger={
						<button className="bg-background flex gap-2 h-9 items-center px-3 py-2 rounded-lg border border-border hover:bg-black/5 transition-colors">
							<TagIcon className="size-4 text-muted-foreground" />
							<span className="font-medium text-foreground text-sm leading-5">
								{selectedTag?.label ?? "Tag"}
							</span>
						</button>
					}
				/>
			</div>

			{/* Footer */}
			<div className="flex items-center justify-between mt-auto w-full pt-4 shrink-0">
				<div className="flex items-center gap-1">
					<button className="flex items-center justify-center size-10 rounded-lg hover:bg-muted transition-colors">
						<Paperclip className="size-4 text-muted-foreground" />
					</button>
				</div>

				<div className="flex items-center gap-4">
					{!editingTask && (
						<div className="flex items-center gap-2">
							<Switch
								checked={createMore}
								onCheckedChange={(value) => setCreateMore(Boolean(value))}
							/>
							<span className="text-sm font-medium text-foreground">
								Create more
							</span>
						</div>
					)}

					<Button
						type="button"
						onClick={handleSubmit}
						className="h-10 px-4 rounded-xl"
					>
						{editingTask ? "Save changes" : "Create Task"}
					</Button>
				</div>
			</div>
		</QuickCreateModalLayout>
	);
}
