"use client";

import {
	closestCenter,
	DndContext,
	type DragEndEvent,
	KeyboardSensor,
	PointerSensor,
	useSensor,
	useSensors,
} from "@dnd-kit/core";
import {
	SortableContext,
	sortableKeyboardCoordinates,
	useSortable,
	verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useMutation, useQuery } from "convex/react";
import { format } from "date-fns";
import {
	Calendar,
	CircleCheck,
	CircleDot,
	Diamond,
	GripVertical,
	LayoutList,
	MoreHorizontal,
	Pencil,
	Plus,
	SparklesIcon,
	SquarePen,
	Trash2,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { ProjectAISummary } from "@/components/ai/project/ProjectAISummary";
import { SprintPlannerPanel } from "@/components/ai/project/SprintPlannerPanel";
import { StatusReportGenerator } from "@/components/ai/project/StatusReportGenerator";
import { GitHubConnectionCard } from "@/components/github/GitHubConnectionCard";
import { MilestoneDetailPanel } from "@/components/projects/MilestoneDetailPanel";
import { MilestoneEditDialog } from "@/components/projects/MilestoneEditDialog";
import { useWorkspace } from "@/components/providers/workspace-context";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { DatePicker } from "@/components/ui/pickers";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { ProjectDescriptionEditorDynamic } from "./ProjectDescriptionEditorDynamic";
import { ResourcesSection } from "./ResourcesSection";

// ── Types ──────────────────────────────────────────────────────────────────

type ProjectStatusId =
	| "backlog"
	| "planned"
	| "active"
	| "completed"
	| "cancelled";

type ProjectOverviewProps = {
	project: {
		_id: Id<"projects">;
		name: string;
		slug: string;
		summary?: string;
		description?: string;
		richDescription?: string;
		status: ProjectStatusId;
		priority: "urgent" | "high" | "medium" | "low" | "no_priority";
		leadId?: Id<"users">;
		startDate?: number;
		endDate?: number;
		resources?: { url: string; label: string }[];
	};
	icon?: string;
	onUpdate: (
		updates: Record<string, string | number | undefined>,
	) => Promise<void>;
};

// ── Component ──────────────────────────────────────────────────────────────

export function ProjectOverview({
	project,
	icon,
	onUpdate,
}: ProjectOverviewProps) {
	const { workspaceId, workspaceSlug } = useWorkspace();
	const milestones = useQuery(api.sprints.listByProject, {
		projectId: project._id,
	});
	const backlogIssues = useQuery(api.issues.listBacklog, {
		projectId: project._id,
	});
	const sprintFolders = useQuery(api.sprintFolders.listByProject, {
		projectId: project._id,
	});
	const updateProject = useMutation(api.projects.update);
	const [statusReportOpen, setStatusReportOpen] = useState(false);
	const [sprintPlannerOpen, setSprintPlannerOpen] = useState(false);

	const handleUpdateResources = useCallback(
		async (resources: { url: string; label: string }[]) => {
			try {
				await updateProject({ projectId: project._id, resources });
			} catch {
				toast.error("Failed to update resources");
			}
		},
		[project._id, updateProject],
	);

	return (
		<div className="space-y-6 py-4">
			{/* AI Project Summary */}
			{workspaceId && (
				<ProjectAISummary projectId={project._id} workspaceId={workspaceId} />
			)}

			{/* Project identity: icon + name */}
			<div className="space-y-1.5">
				<div className="flex items-center gap-3">
					{icon && (
						<span className="text-4xl leading-none shrink-0">{icon}</span>
					)}
					<h1 className="text-2xl font-semibold text-foreground truncate">
						{project.name}
					</h1>
				</div>
				<InlineSummary
					summary={project.summary}
					onUpdate={async (summary) => {
						await onUpdate({ summary });
					}}
				/>
			</div>

			<Separator />
			<ProjectDescriptionEditorDynamic
				projectId={project._id}
				initialContent={project.richDescription}
				plainTextFallback={project.description}
			/>
			<Separator />
			<ResourcesSection
				projectId={project._id}
				workspaceId={workspaceId}
				resources={project.resources}
				onUpdateResources={handleUpdateResources}
			/>
			<Separator />
			<div className="space-y-2">
				<h3 className="text-sm font-medium text-foreground">Integrations</h3>
				<GitHubConnectionCard
					projectId={project._id}
					projectSlug={project.slug}
				/>
			</div>
			<Separator />
			<MilestonesSection
				projectId={project._id}
				milestones={(milestones ?? []) as MilestoneData[]}
				folders={sprintFolders ?? []}
			/>

			{/* Backlog summary */}
			<Separator />
			<section>
				<div className="flex items-center justify-between mb-3">
					<h3 className="text-sm font-medium text-muted-foreground">Backlog</h3>
					<span className="text-xs text-muted-foreground">
						{backlogIssues?.length ?? 0} issues
					</span>
				</div>
				{(backlogIssues?.length ?? 0) === 0 ? (
					<p className="text-sm text-muted-foreground/70">
						No unassigned issues in the backlog.
					</p>
				) : (
					<Link
						href={`/${workspaceSlug}/projects/${project.slug}/backlog`}
						className="flex items-center gap-2 rounded-lg border border-border/60 bg-muted/30 px-4 py-3 text-sm text-muted-foreground hover:bg-muted/50 transition-colors"
					>
						<LayoutList className="h-4 w-4" />
						View {backlogIssues?.length} backlog issues
					</Link>
				)}
			</section>

			{/* AI Project Actions */}
			{workspaceId && (
				<>
					<div className="flex items-center gap-2 pt-2">
						<Button
							variant="outline"
							size="sm"
							className="gap-1.5 text-xs"
							onClick={() => setStatusReportOpen(true)}
						>
							<SparklesIcon className="h-3.5 w-3.5 text-sienna-500 dark:text-sienna-400" />
							Generate Status Report
						</Button>
						<Button
							variant="outline"
							size="sm"
							className="gap-1.5 text-xs"
							onClick={() => setSprintPlannerOpen(true)}
						>
							<SparklesIcon className="h-3.5 w-3.5 text-sienna-500 dark:text-sienna-400" />
							Plan Next Sprint
						</Button>
					</div>

					<StatusReportGenerator
						projectId={project._id}
						workspaceId={workspaceId}
						projectName={project.name}
						open={statusReportOpen}
						onOpenChange={setStatusReportOpen}
					/>
					<SprintPlannerPanel
						projectId={project._id}
						workspaceId={workspaceId}
						projectName={project.name}
						open={sprintPlannerOpen}
						onOpenChange={setSprintPlannerOpen}
					/>
				</>
			)}
		</div>
	);
}

// ── Inline Summary ─────────────────────────────────────────────────────────

function InlineSummary({
	summary,
	onUpdate,
}: {
	summary?: string;
	onUpdate: (summary: string) => Promise<void>;
}) {
	const [isEditing, setIsEditing] = useState(false);
	const [value, setValue] = useState(summary ?? "");
	const inputRef = useRef<HTMLTextAreaElement>(null);
	const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	useEffect(() => {
		if (!isEditing) {
			setValue(summary ?? "");
		}
	}, [summary, isEditing]);

	const saveSummary = useCallback(
		async (text: string) => {
			try {
				await onUpdate(text);
			} catch {
				toast.error("Failed to save summary");
			}
		},
		[onUpdate],
	);

	const handleChange = useCallback(
		(e: React.ChangeEvent<HTMLTextAreaElement>) => {
			const newValue = e.target.value;
			setValue(newValue);

			if (saveTimeoutRef.current) {
				clearTimeout(saveTimeoutRef.current);
			}
			saveTimeoutRef.current = setTimeout(() => {
				saveSummary(newValue);
			}, 800);
		},
		[saveSummary],
	);

	const handleBlur = useCallback(() => {
		if (saveTimeoutRef.current) {
			clearTimeout(saveTimeoutRef.current);
		}
		saveSummary(value);
		setIsEditing(false);
	}, [value, saveSummary]);

	const handleKeyDown = useCallback(
		(e: React.KeyboardEvent) => {
			if (e.key === "Escape") {
				setValue(summary ?? "");
				setIsEditing(false);
			}
		},
		[summary],
	);

	useEffect(() => {
		if (isEditing && inputRef.current) {
			const el = inputRef.current;
			el.style.height = "auto";
			el.style.height = `${el.scrollHeight}px`;
			el.focus();
		}
	}, [isEditing]);

	if (isEditing) {
		return (
			<textarea
				ref={inputRef}
				value={value}
				onChange={handleChange}
				onBlur={handleBlur}
				onKeyDown={handleKeyDown}
				placeholder="Add a short summary..."
				className="w-full min-h-[32px] rounded-md border border-border bg-background px-3 py-1.5 text-sm text-muted-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring resize-none"
			/>
		);
	}

	return (
		<button
			type="button"
			onClick={() => setIsEditing(true)}
			className="w-full text-left rounded-md px-1 py-0.5 text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap hover:bg-muted/50 transition-colors cursor-pointer line-clamp-2"
		>
			{summary || "Add a short summary..."}
		</button>
	);
}

// ── Milestones Section ─────────────────────────────────────────────────────

type MilestoneData = {
	_id: Id<"sprints">;
	name: string;
	description?: string;
	icon?: string;
	startDate?: number;
	targetDate?: number;
	sortOrder: number;
	status: "planned" | "active" | "completed" | "cancelled";
	issueCount: number;
	completedCount: number;
	progressPercentage: number;
};

type FolderData = {
	_id: Id<"sprintFolders">;
	name: string;
};

function MilestonesSection({
	projectId,
	milestones,
	folders,
}: {
	projectId: Id<"projects">;
	milestones: MilestoneData[];
	folders: FolderData[];
}) {
	const [isAdding, setIsAdding] = useState(false);
	const [detailMilestoneId, setDetailMilestoneId] =
		useState<Id<"sprints"> | null>(null);
	const reorderMilestone = useMutation(api.sprints.reorder);

	const sensors = useSensors(
		useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
		useSensor(KeyboardSensor, {
			coordinateGetter: sortableKeyboardCoordinates,
		}),
	);

	const handleDragEnd = useCallback(
		(event: DragEndEvent) => {
			const { active, over } = event;
			if (!over || active.id === over.id) return;

			const oldIndex = milestones.findIndex(
				(m) => m._id === (active.id as string),
			);
			const newIndex = milestones.findIndex(
				(m) => m._id === (over.id as string),
			);
			if (oldIndex === -1 || newIndex === -1) return;

			const before = newIndex > 0 ? milestones[newIndex - 1].sortOrder : null;
			const after =
				newIndex < milestones.length - 1
					? milestones[newIndex + 1].sortOrder
					: null;

			// Compute new sortOrder between neighbors
			let newSortOrder: number;
			if (oldIndex < newIndex) {
				// Moving down: place between target and next
				const targetSort = milestones[newIndex].sortOrder;
				newSortOrder =
					after !== null ? (targetSort + after) / 2 : targetSort + 1;
			} else {
				// Moving up: place between previous and target
				const targetSort = milestones[newIndex].sortOrder;
				newSortOrder =
					before !== null ? (before + targetSort) / 2 : targetSort / 2;
			}

			reorderMilestone({
				sprintId: active.id as Id<"sprints">,
				newSortOrder,
			});
		},
		[milestones, reorderMilestone],
	);

	// Group sprints by folder
	const folderMap = new Map(folders.map((f) => [f._id, f.name]));
	const looseSprints = milestones.filter(
		(m) => !(m as MilestoneData & { folderId?: string }).folderId,
	);
	const folderGroups = folders
		.map((f) => ({
			folder: f,
			sprints: milestones.filter(
				(m) => (m as MilestoneData & { folderId?: string }).folderId === f._id,
			),
		}))
		.filter((g) => g.sprints.length > 0);

	return (
		<section>
			<div className="flex items-center justify-between mb-3">
				<h3 className="text-sm font-medium text-muted-foreground">Sprints</h3>
				<div className="flex items-center gap-2">
					{milestones.length > 0 && (
						<span className="text-xs text-muted-foreground">
							{milestones.filter((m) => m.status === "completed").length}/
							{milestones.length} completed
						</span>
					)}
					<Button
						variant="ghost"
						size="sm"
						className="h-7 gap-1 text-xs text-muted-foreground"
						onClick={() => setIsAdding(true)}
					>
						<Plus className="h-3.5 w-3.5" />
						Add sprint
					</Button>
				</div>
			</div>

			{milestones.length === 0 && !isAdding && (
				<button
					type="button"
					onClick={() => setIsAdding(true)}
					className="w-full rounded-lg border border-dashed border-border/70 bg-muted/30 px-4 py-6 text-center text-sm text-muted-foreground hover:bg-muted/50 transition-colors cursor-pointer"
				>
					No sprints yet. Click to add one.
				</button>
			)}

			{milestones.length > 0 && (
				<DndContext
					sensors={sensors}
					collisionDetection={closestCenter}
					onDragEnd={handleDragEnd}
				>
					<SortableContext
						items={milestones.map((m) => m._id)}
						strategy={verticalListSortingStrategy}
					>
						<div className="space-y-2">
							{/* Sprint folders */}
							{folderGroups.map((group) => (
								<div key={group.folder._id} className="space-y-1">
									<div className="text-xs font-medium text-muted-foreground/70 px-1 pt-1">
										{group.folder.name}
									</div>
									{group.sprints.map((milestone) => (
										<SortableMilestoneRow
											key={milestone._id}
											milestone={milestone}
											onOpenDetail={setDetailMilestoneId}
										/>
									))}
								</div>
							))}
							{/* Loose sprints (no folder) */}
							{looseSprints.map((milestone) => (
								<SortableMilestoneRow
									key={milestone._id}
									milestone={milestone}
									onOpenDetail={setDetailMilestoneId}
								/>
							))}
						</div>
					</SortableContext>
				</DndContext>
			)}

			{isAdding && (
				<MilestoneCreateForm
					projectId={projectId}
					onClose={() => setIsAdding(false)}
				/>
			)}

			<MilestoneDetailPanel
				sprintId={detailMilestoneId}
				onClose={() => setDetailMilestoneId(null)}
			/>
		</section>
	);
}

// ── Milestone create form ───────────────────────────────────────────────────

function MilestoneCreateForm({
	projectId,
	onClose,
}: {
	projectId: Id<"projects">;
	onClose: () => void;
}) {
	const [name, setName] = useState("");
	const [description, setDescription] = useState("");
	const [startDate, setStartDate] = useState<Date | undefined>(undefined);
	const [targetDate, setTargetDate] = useState<Date | undefined>(undefined);
	const nameRef = useRef<HTMLInputElement>(null);
	const createMilestone = useMutation(api.sprints.create);

	useEffect(() => {
		nameRef.current?.focus();
	}, []);

	const handleCreate = useCallback(async () => {
		if (!name.trim()) {
			toast.error("Sprint name is required");
			return;
		}
		try {
			await createMilestone({
				projectId,
				name: name.trim(),
				description: description.trim() || undefined,
				startDate: startDate?.getTime(),
				targetDate: targetDate?.getTime(),
			});
			toast.success("Sprint created");
			onClose();
		} catch {
			toast.error("Failed to create sprint");
		}
	}, [
		name,
		description,
		targetDate,
		projectId,
		createMilestone,
		onClose,
		startDate?.getTime,
	]);

	const handleKeyDown = useCallback(
		(e: React.KeyboardEvent) => {
			if (e.key === "Enter" && !e.shiftKey) {
				e.preventDefault();
				handleCreate();
			} else if (e.key === "Escape") {
				onClose();
			}
		},
		[handleCreate, onClose],
	);

	return (
		<div className="mt-2 space-y-2 rounded-lg border border-border p-3">
			<input
				ref={nameRef}
				type="text"
				value={name}
				onChange={(e) => setName(e.target.value)}
				onKeyDown={handleKeyDown}
				placeholder="Sprint name"
				className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
			/>
			<input
				type="text"
				value={description}
				onChange={(e) => setDescription(e.target.value)}
				onKeyDown={handleKeyDown}
				placeholder="Description (optional)"
				className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
			/>
			<div className="flex items-center gap-2">
				<DatePicker
					date={startDate}
					onSelect={setStartDate}
					trigger={
						<button
							type="button"
							className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted transition-colors"
						>
							<Calendar className="h-3.5 w-3.5 text-muted-foreground" />
							<span
								className={
									startDate ? "text-foreground" : "text-muted-foreground"
								}
							>
								{startDate ? format(startDate, "MMM d, yyyy") : "Start date"}
							</span>
						</button>
					}
				/>
				<DatePicker
					date={targetDate}
					onSelect={setTargetDate}
					trigger={
						<button
							type="button"
							className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted transition-colors"
						>
							<Calendar className="h-3.5 w-3.5 text-muted-foreground" />
							<span
								className={
									targetDate ? "text-foreground" : "text-muted-foreground"
								}
							>
								{targetDate ? format(targetDate, "MMM d, yyyy") : "End date"}
							</span>
						</button>
					}
				/>
				<div className="ml-auto flex items-center gap-2">
					<Button
						variant="ghost"
						size="sm"
						className="h-7 text-xs"
						onClick={onClose}
					>
						Cancel
					</Button>
					<Button size="sm" className="h-7 text-xs" onClick={handleCreate}>
						Create
					</Button>
				</div>
			</div>
		</div>
	);
}

// ── Sortable milestone row ──────────────────────────────────────────────────

function SortableMilestoneRow({
	milestone,
	onOpenDetail,
}: {
	milestone: MilestoneData;
	onOpenDetail: (id: Id<"sprints">) => void;
}) {
	const {
		attributes,
		listeners,
		setNodeRef,
		transform,
		transition,
		isDragging,
	} = useSortable({ id: milestone._id });

	const style = {
		transform: CSS.Transform.toString(transform),
		transition,
	};

	return (
		<div
			ref={setNodeRef}
			style={style}
			className={cn(isDragging && "opacity-50 z-10")}
		>
			<MilestoneRow
				milestone={milestone}
				dragHandleProps={{ ...attributes, ...listeners }}
				onOpenDetail={onOpenDetail}
			/>
		</div>
	);
}

// ── Milestone row with inline editing ───────────────────────────────────────

function MilestoneRow({
	milestone,
	dragHandleProps,
	onOpenDetail,
}: {
	milestone: MilestoneData;
	dragHandleProps?: Record<string, unknown>;
	onOpenDetail: (id: Id<"sprints">) => void;
}) {
	const isCompleted = milestone.status === "completed";
	const isCancelled = milestone.status === "cancelled";

	const [editingName, setEditingName] = useState(false);
	const [nameValue, setNameValue] = useState(milestone.name);
	const [editDialogOpen, setEditDialogOpen] = useState(false);
	const [deleteOpen, setDeleteOpen] = useState(false);
	const nameInputRef = useRef<HTMLInputElement>(null);

	const updateMilestone = useMutation(api.sprints.update);
	const removeMilestone = useMutation(api.sprints.remove);
	const completeMilestone = useMutation(api.sprints.complete);

	// Sync name when milestone changes externally
	useEffect(() => {
		if (!editingName) setNameValue(milestone.name);
	}, [milestone.name, editingName]);

	useEffect(() => {
		if (editingName) nameInputRef.current?.focus();
	}, [editingName]);

	const handleNameSave = useCallback(async () => {
		setEditingName(false);
		if (!nameValue.trim() || nameValue.trim() === milestone.name) {
			setNameValue(milestone.name);
			return;
		}
		try {
			await updateMilestone({
				sprintId: milestone._id,
				name: nameValue.trim(),
			});
		} catch {
			toast.error("Failed to rename sprint");
			setNameValue(milestone.name);
		}
	}, [nameValue, milestone._id, milestone.name, updateMilestone]);

	const handleDateChange = useCallback(
		async (date: Date | undefined) => {
			try {
				await updateMilestone({
					sprintId: milestone._id,
					targetDate: date?.getTime(),
				});
			} catch {
				toast.error("Failed to update target date");
			}
		},
		[milestone._id, updateMilestone],
	);

	const handleDelete = useCallback(async () => {
		try {
			await removeMilestone({ sprintId: milestone._id });
			toast.success("Sprint deleted");
			setDeleteOpen(false);
		} catch {
			toast.error("Failed to delete sprint");
		}
	}, [milestone._id, removeMilestone]);

	const handleComplete = useCallback(async () => {
		try {
			if (isCompleted) {
				await updateMilestone({
					sprintId: milestone._id,
					status: "active",
				});
			} else {
				await completeMilestone({ sprintId: milestone._id });
			}
		} catch {
			toast.error("Failed to update sprint status");
		}
	}, [milestone._id, isCompleted, updateMilestone, completeMilestone]);

	return (
		<>
			<div
				className={cn(
					"group rounded-lg border border-border px-3 py-2.5 transition-colors hover:border-border/80",
					isCompleted && "bg-emerald-500/5 border-emerald-500/20",
					isCancelled && "opacity-60",
				)}
			>
				<div className="flex items-center gap-2">
					{/* Drag handle */}
					<button
						type="button"
						className="opacity-0 group-hover:opacity-100 cursor-grab active:cursor-grabbing transition-opacity shrink-0 touch-none"
						{...dragHandleProps}
					>
						<GripVertical className="h-4 w-4 text-muted-foreground" />
					</button>

					{/* Status icon */}
					{milestone.icon ? (
						<span className="text-base leading-none shrink-0">
							{milestone.icon}
						</span>
					) : (
						<Diamond
							className={cn(
								"h-4 w-4 shrink-0",
								isCompleted
									? "text-emerald-500"
									: isCancelled
										? "text-muted-foreground"
										: "text-primary",
							)}
						/>
					)}

					{/* Name (inline editable) */}
					<div className="flex-1 min-w-0">
						{editingName ? (
							<input
								ref={nameInputRef}
								value={nameValue}
								onChange={(e) => setNameValue(e.target.value)}
								onBlur={handleNameSave}
								onKeyDown={(e) => {
									if (e.key === "Enter") handleNameSave();
									if (e.key === "Escape") {
										setNameValue(milestone.name);
										setEditingName(false);
									}
								}}
								className="w-full text-sm font-medium bg-transparent border-b border-primary outline-none pb-0.5"
							/>
						) : (
							<button
								type="button"
								onClick={() => onOpenDetail(milestone._id)}
								className={cn(
									"text-sm font-medium truncate text-left hover:underline cursor-pointer",
									(isCompleted || isCancelled) &&
										"line-through text-muted-foreground",
								)}
							>
								{milestone.name}
							</button>
						)}
					</div>

					{/* Target date (clickable) */}
					<DatePicker
						date={
							milestone.targetDate ? new Date(milestone.targetDate) : undefined
						}
						onSelect={handleDateChange}
						trigger={
							<button
								type="button"
								className="text-xs text-muted-foreground shrink-0 hover:text-foreground transition-colors px-1"
							>
								{milestone.targetDate
									? format(new Date(milestone.targetDate), "MMM d, yyyy")
									: "No date"}
							</button>
						}
					/>

					{/* Progress */}
					<div className="flex items-center gap-2 shrink-0">
						<span className="text-xs text-muted-foreground tabular-nums">
							{milestone.completedCount}/{milestone.issueCount}
						</span>
						<Progress
							value={milestone.progressPercentage}
							className="w-16 h-1.5"
						/>
					</div>

					{/* Actions menu */}
					<DropdownMenu>
						<DropdownMenuTrigger asChild>
							<button
								type="button"
								className="opacity-0 group-hover:opacity-100 rounded p-1 hover:bg-muted transition-opacity shrink-0"
							>
								<MoreHorizontal className="h-4 w-4 text-muted-foreground" />
							</button>
						</DropdownMenuTrigger>
						<DropdownMenuContent align="end" className="w-40">
							<DropdownMenuItem onClick={() => setEditDialogOpen(true)}>
								<SquarePen className="h-4 w-4 mr-2" />
								Edit
							</DropdownMenuItem>
							<DropdownMenuItem onClick={() => setEditingName(true)}>
								<Pencil className="h-4 w-4 mr-2" />
								Rename
							</DropdownMenuItem>
							<DropdownMenuItem onClick={handleComplete}>
								{isCompleted ? (
									<>
										<CircleDot className="h-4 w-4 mr-2" />
										Reopen
									</>
								) : (
									<>
										<CircleCheck className="h-4 w-4 mr-2" />
										Complete
									</>
								)}
							</DropdownMenuItem>
							<DropdownMenuItem
								onClick={() => setDeleteOpen(true)}
								className="text-destructive focus:text-destructive"
							>
								<Trash2 className="h-4 w-4 mr-2" />
								Delete
							</DropdownMenuItem>
						</DropdownMenuContent>
					</DropdownMenu>
				</div>
			</div>

			{/* Edit dialog */}
			<MilestoneEditDialog
				sprintId={milestone._id}
				name={milestone.name}
				description={milestone.description}
				startDate={milestone.startDate}
				targetDate={milestone.targetDate}
				open={editDialogOpen}
				onOpenChange={setEditDialogOpen}
			/>

			{/* Delete confirmation dialog */}
			<AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Delete sprint</AlertDialogTitle>
						<AlertDialogDescription>
							Are you sure you want to delete &quot;{milestone.name}&quot;?
							Issues assigned to this sprint will be unassigned. This action
							cannot be undone.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>Cancel</AlertDialogCancel>
						<AlertDialogAction variant="destructive" onClick={handleDelete}>
							Delete
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</>
	);
}
