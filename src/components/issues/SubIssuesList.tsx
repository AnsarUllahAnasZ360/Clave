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
import {
	ChevronRight,
	Circle,
	CircleCheck,
	CircleDashed,
	CircleDot,
	CircleX,
	Eye,
	GripVertical,
	Minus,
	Plus,
	Timer,
	TriangleAlert,
	User,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { useWorkspace } from "@/components/providers/workspace-context";
import { useWorkspaceMembers } from "@/components/providers/workspace-data-context";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { GenericPicker } from "@/components/ui/pickers";
import { Progress } from "@/components/ui/progress";
import { PRIORITY_ITEMS, STATUS_ITEMS } from "@/lib/issue-config";
import { cn } from "@/lib/utils";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

// ── Status icon mapping ─────────────────────────────────────────────────

const STATUS_ICONS: Record<string, { icon: typeof Circle; color: string }> = {
	triage: { icon: TriangleAlert, color: "text-orange-500" },
	backlog: { icon: CircleDashed, color: "text-muted-foreground" },
	todo: { icon: Circle, color: "text-muted-foreground" },
	in_progress: { icon: Timer, color: "text-yellow-500" },
	in_review: { icon: Eye, color: "text-blue-500" },
	done: { icon: CircleCheck, color: "text-emerald-500" },
	cancelled: { icon: CircleX, color: "text-muted-foreground" },
};

function isCompletedStatus(status: string): boolean {
	return status === "done" || status === "cancelled";
}

// ── Sortable sub-issue row ──────────────────────────────────────────────

function SortableSubIssueRow({
	subIssue,
	workspaceSlug,
	orgSlug,
	member,
	onToggle,
}: {
	subIssue: {
		_id: Id<"issues">;
		identifier: string;
		title: string;
		status: string;
		assigneeId?: Id<"users"> | null;
	};
	workspaceSlug: string;
	orgSlug: string;
	member?: { name: string; image?: string };
	onToggle: (issueId: Id<"issues">, currentStatus: string) => void;
}) {
	const {
		attributes,
		listeners,
		setNodeRef,
		transform,
		transition,
		isDragging,
	} = useSortable({ id: subIssue._id });

	const style = {
		transform: CSS.Transform.toString(transform),
		transition,
	};

	const statusConfig = STATUS_ICONS[subIssue.status];
	const StatusIcon = statusConfig?.icon ?? CircleDot;
	const statusColor = statusConfig?.color ?? "text-muted-foreground";
	const isDone = isCompletedStatus(subIssue.status);

	return (
		<div
			ref={setNodeRef}
			style={style}
			className={cn(
				"group flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-muted/50 transition-colors",
				isDragging && "opacity-50 bg-muted",
			)}
		>
			<button
				type="button"
				className="cursor-grab opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-foreground shrink-0"
				{...attributes}
				{...listeners}
			>
				<GripVertical className="h-3.5 w-3.5" />
			</button>

			<Checkbox
				checked={isDone}
				onCheckedChange={() => onToggle(subIssue._id, subIssue.status)}
				className="shrink-0"
			/>

			<StatusIcon className={cn("h-4 w-4 shrink-0", statusColor)} />

			<span className="text-xs text-muted-foreground font-mono shrink-0">
				{subIssue.identifier}
			</span>

			<Link
				href={`/${orgSlug}/${workspaceSlug}/issues/${subIssue.identifier}`}
				className={cn(
					"text-sm truncate flex-1 hover:text-primary transition-colors",
					isDone && "line-through text-muted-foreground",
				)}
			>
				{subIssue.title}
			</Link>

			{member && (
				<Avatar className="size-5 shrink-0">
					{member.image && <AvatarImage src={member.image} alt={member.name} />}
					<AvatarFallback className="text-[10px]">
						{member.name.charAt(0).toUpperCase()}
					</AvatarFallback>
				</Avatar>
			)}
		</div>
	);
}

// ── Inline creation input ───────────────────────────────────────────────

function InlineCreateInput({
	parentId,
	members,
	forceOpen,
	onForceOpenConsumed,
	onCreated,
}: {
	parentId: Id<"issues">;
	members?: Array<{
		userId: string;
		user?: {
			name?: string;
			email?: string;
			avatarUrl?: string;
			image?: string;
		} | null;
	}>;
	forceOpen?: boolean;
	onForceOpenConsumed?: () => void;
	onCreated?: () => void;
}) {
	const [isOpen, setIsOpen] = useState(false);
	const [title, setTitle] = useState("");
	const [status, setStatus] = useState("backlog");
	const [priority, setPriority] = useState("no_priority");
	const [assigneeId, setAssigneeId] = useState<string | null>(null);
	const [isCreating, setIsCreating] = useState(false);
	const inputRef = useRef<HTMLInputElement>(null);
	const createSubIssue = useMutation(api.issues.createSubIssue);

	useEffect(() => {
		if (forceOpen) {
			setIsOpen(true);
			onForceOpenConsumed?.();
			setTimeout(() => inputRef.current?.focus(), 0);
		}
	}, [forceOpen, onForceOpenConsumed]);

	const resetForm = useCallback(() => {
		setTitle("");
		setStatus("backlog");
		setPriority("no_priority");
		setAssigneeId(null);
	}, []);

	const handleCreate = useCallback(async () => {
		const trimmed = title.trim();
		if (!trimmed || isCreating) return;

		setIsCreating(true);
		try {
			await createSubIssue({
				parentId,
				title: trimmed,
				status: status as
					| "backlog"
					| "todo"
					| "in_progress"
					| "in_review"
					| "done"
					| "cancelled"
					| "triage",
				priority: priority as
					| "no_priority"
					| "low"
					| "medium"
					| "high"
					| "urgent",
				...(assigneeId ? { assigneeId: assigneeId as Id<"users"> } : {}),
			});
			resetForm();
			onCreated?.();
			inputRef.current?.focus();
		} catch {
			toast.error("Failed to create sub-issue");
		} finally {
			setIsCreating(false);
		}
	}, [
		title,
		isCreating,
		createSubIssue,
		parentId,
		status,
		priority,
		assigneeId,
		onCreated,
		resetForm,
	]);

	const handleCancel = useCallback(() => {
		setIsOpen(false);
		resetForm();
	}, [resetForm]);

	const currentStatus = STATUS_ITEMS.find((s) => s.id === status);
	const CurrentStatusIcon = currentStatus?.icon ?? CircleDashed;
	const currentPriority = PRIORITY_ITEMS.find((p) => p.id === priority);
	const CurrentPriorityIcon = currentPriority?.icon ?? Minus;

	const memberItems = (members ?? [])
		.filter((m) => m.user)
		.map((m) => ({
			id: m.userId,
			label: m.user?.name ?? m.user?.email ?? "Unknown",
			image: m.user?.avatarUrl ?? m.user?.image ?? undefined,
		}));

	const selectedMember = memberItems.find((m) => m.id === assigneeId);

	if (!isOpen) {
		return (
			<button
				type="button"
				onClick={() => {
					setIsOpen(true);
					setTimeout(() => inputRef.current?.focus(), 0);
				}}
				className="flex items-center gap-1.5 px-2 py-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors rounded-md hover:bg-muted/50 w-full"
			>
				<Plus className="h-3.5 w-3.5" />
				Add sub-issue
			</button>
		);
	}

	return (
		<div className="space-y-2 px-2 py-1.5">
			<div className="flex items-center gap-1.5">
				{/* Status picker */}
				<GenericPicker
					trigger={
						<button
							type="button"
							className="p-1 rounded hover:bg-muted/80 transition-colors shrink-0"
							title="Status"
						>
							<CurrentStatusIcon
								className={cn(
									"h-4 w-4",
									currentStatus?.color ?? "text-muted-foreground",
								)}
							/>
						</button>
					}
					items={STATUS_ITEMS}
					selectedId={status}
					onSelect={(item) => setStatus(item.id)}
					placeholder="Set status..."
					renderItem={(item, isSelected) => {
						const Icon = item.icon;
						return (
							<div className="flex items-center gap-2 w-full">
								<Icon className={cn("h-4 w-4", item.color)} />
								<span className="flex-1">{item.label}</span>
								{isSelected && (
									<CircleCheck className="h-3.5 w-3.5 text-primary" />
								)}
							</div>
						);
					}}
				/>

				{/* Title input */}
				<input
					ref={inputRef}
					value={title}
					onChange={(e) => setTitle(e.target.value)}
					onKeyDown={(e) => {
						if (e.key === "Enter") handleCreate();
						if (e.key === "Escape") handleCancel();
					}}
					placeholder="Sub-issue title..."
					disabled={isCreating}
					className="flex-1 text-sm bg-transparent outline-none placeholder:text-muted-foreground/60 min-w-0"
				/>

				{/* Priority picker */}
				<GenericPicker
					trigger={
						<button
							type="button"
							className="p-1 rounded hover:bg-muted/80 transition-colors shrink-0"
							title="Priority"
						>
							<CurrentPriorityIcon
								className={cn(
									"h-3.5 w-3.5",
									currentPriority?.color ?? "text-muted-foreground",
								)}
							/>
						</button>
					}
					items={PRIORITY_ITEMS}
					selectedId={priority}
					onSelect={(item) => setPriority(item.id)}
					placeholder="Set priority..."
					renderItem={(item, isSelected) => {
						const Icon = item.icon;
						return (
							<div className="flex items-center gap-2 w-full">
								<Icon className={cn("h-4 w-4", item.color)} />
								<span className="flex-1">{item.label}</span>
								{isSelected && (
									<CircleCheck className="h-3.5 w-3.5 text-primary" />
								)}
							</div>
						);
					}}
				/>

				{/* Assignee picker */}
				<GenericPicker
					trigger={
						<button
							type="button"
							className="p-1 rounded hover:bg-muted/80 transition-colors shrink-0"
							title="Assignee"
						>
							{selectedMember ? (
								<Avatar className="size-5">
									{selectedMember.image && (
										<AvatarImage
											src={selectedMember.image}
											alt={selectedMember.label}
										/>
									)}
									<AvatarFallback className="text-[10px]">
										{selectedMember.label.charAt(0).toUpperCase()}
									</AvatarFallback>
								</Avatar>
							) : (
								<User className="h-3.5 w-3.5 text-muted-foreground" />
							)}
						</button>
					}
					items={[
						{ id: "__unassigned__", label: "Unassigned" },
						...memberItems,
					]}
					selectedId={assigneeId ?? "__unassigned__"}
					onSelect={(item) =>
						setAssigneeId(item.id === "__unassigned__" ? null : item.id)
					}
					placeholder="Assign to..."
					renderItem={(item, isSelected) => (
						<div className="flex items-center gap-2 w-full">
							{item.id === "__unassigned__" ? (
								<User className="h-4 w-4 text-muted-foreground" />
							) : (
								<Avatar className="size-5">
									{"image" in item && (item as { image?: string }).image && (
										<AvatarImage
											src={(item as { image?: string }).image}
											alt={item.label ?? ""}
										/>
									)}
									<AvatarFallback className="text-[10px]">
										{(item.label ?? "?").charAt(0).toUpperCase()}
									</AvatarFallback>
								</Avatar>
							)}
							<span className="flex-1">{item.label}</span>
							{isSelected && (
								<CircleCheck className="h-3.5 w-3.5 text-primary" />
							)}
						</div>
					)}
				/>
			</div>

			{/* Action buttons */}
			<div className="flex items-center justify-end gap-1.5">
				<Button
					variant="ghost"
					size="sm"
					className="h-6 px-2 text-xs"
					onClick={handleCancel}
				>
					Cancel
				</Button>
				<Button
					size="sm"
					className="h-6 px-2 text-xs"
					onClick={handleCreate}
					disabled={!title.trim() || isCreating}
				>
					{isCreating ? "Creating..." : "Create"}
				</Button>
			</div>
		</div>
	);
}

// ── Main component ──────────────────────────────────────────────────────

export function SubIssuesList({ parentId }: { parentId: Id<"issues"> }) {
	const { workspaceId, workspaceSlug, orgSlug } = useWorkspace();
	const [isCollapsibleOpen, setIsCollapsibleOpen] = useState<
		boolean | undefined
	>(undefined);
	const [forceInlineOpen, setForceInlineOpen] = useState(false);

	const data = useQuery(api.issues.getSubIssues, { parentId });
	const members = useWorkspaceMembers();
	const updateStatus = useMutation(api.issues.updateStatus);
	const reorder = useMutation(api.issues.reorder);

	const sensors = useSensors(
		useSensor(PointerSensor, {
			activationConstraint: { distance: 5 },
		}),
		useSensor(KeyboardSensor, {
			coordinateGetter: sortableKeyboardCoordinates,
		}),
	);

	const memberMap = new Map<string, { name: string; image?: string }>();
	if (members) {
		for (const m of members) {
			if (m.user) {
				memberMap.set(m.userId, {
					name: m.user.name ?? m.user.email ?? "Unknown",
					image: m.user.avatarUrl ?? m.user.image ?? undefined,
				});
			}
		}
	}

	const handleToggle = useCallback(
		async (issueId: Id<"issues">, currentStatus: string) => {
			const newStatus = isCompletedStatus(currentStatus) ? "backlog" : "done";
			try {
				await updateStatus({
					issueId,
					status: newStatus as "backlog" | "done",
				});
			} catch {
				toast.error("Failed to update status");
			}
		},
		[updateStatus],
	);

	const handleDragEnd = useCallback(
		(event: DragEndEvent) => {
			const { active, over } = event;
			if (!over || !data?.subIssues || active.id === over.id) return;

			const items = data.subIssues;
			const oldIndex = items.findIndex((i) => i._id === active.id);
			const overIndex = items.findIndex((i) => i._id === over.id);
			if (oldIndex === -1 || overIndex === -1) return;

			// Compute new sort order from neighbors (excluding the dragged item)
			const filtered = items.filter((i) => i._id !== active.id);
			let newSortOrder: number;
			if (filtered.length === 0) {
				newSortOrder = 1.0;
			} else if (overIndex <= 0) {
				newSortOrder = filtered[0].sortOrder / 2;
			} else if (overIndex >= filtered.length) {
				newSortOrder = filtered[filtered.length - 1].sortOrder + 1.0;
			} else {
				const before = filtered[overIndex - 1].sortOrder;
				const after = filtered[overIndex].sortOrder;
				newSortOrder = (before + after) / 2;
			}

			reorder({
				issueId: active.id as Id<"issues">,
				newSortOrder,
			});
		},
		[data?.subIssues, reorder],
	);

	const handleAddClick = useCallback(() => {
		setIsCollapsibleOpen(true);
		setForceInlineOpen(true);
	}, []);

	// Loading state
	if (data === undefined) {
		return (
			<div className="space-y-2.5">
				<h3 className="text-[13px] font-medium text-foreground/80">
					Sub-issues
				</h3>
				<div className="animate-pulse h-8 bg-muted/20 rounded-md" />
			</div>
		);
	}

	const subIssues = data?.subIssues ?? [];
	const stats = data?.stats ?? { total: 0, completed: 0, inProgress: 0 };
	const progressPercent =
		stats.total > 0 ? Math.round((stats.completed / stats.total) * 100) : 0;
	const hasSubIssues = subIssues.length > 0;

	// Use controlled open state: undefined means "use default" (open if has sub-issues)
	const effectiveOpen = isCollapsibleOpen ?? hasSubIssues;

	return (
		<Collapsible open={effectiveOpen} onOpenChange={setIsCollapsibleOpen}>
			<div className="space-y-2.5">
				<div className="flex items-center justify-between">
					<CollapsibleTrigger className="flex items-center gap-1.5 group cursor-pointer">
						<ChevronRight className="h-3.5 w-3.5 text-muted-foreground transition-transform group-data-[state=open]:rotate-90" />
						<h3 className="text-[13px] font-medium text-foreground/80">
							Sub-issues
						</h3>
						{stats.total > 0 && (
							<span className="text-xs text-muted-foreground/70">
								({stats.completed}/{stats.total})
							</span>
						)}
					</CollapsibleTrigger>
					<button
						type="button"
						className="text-muted-foreground hover:text-foreground transition-colors p-0.5 rounded hover:bg-muted/50"
						onClick={handleAddClick}
					>
						<Plus className="h-3.5 w-3.5" />
					</button>
				</div>

				<CollapsibleContent>
					{stats.total > 0 && (
						<Progress value={progressPercent} className="h-1 mb-2" />
					)}

					{hasSubIssues ? (
						<DndContext
							sensors={sensors}
							collisionDetection={closestCenter}
							onDragEnd={handleDragEnd}
						>
							<SortableContext
								items={subIssues.map((s) => s._id)}
								strategy={verticalListSortingStrategy}
							>
								<div className="space-y-0.5">
									{subIssues.map((subIssue) => (
										<SortableSubIssueRow
											key={subIssue._id}
											subIssue={subIssue}
											workspaceSlug={workspaceSlug}
											orgSlug={orgSlug}
											member={
												subIssue.assigneeId
													? memberMap.get(subIssue.assigneeId)
													: undefined
											}
											onToggle={handleToggle}
										/>
									))}
								</div>
							</SortableContext>
						</DndContext>
					) : (
						<p className="text-[13px] text-muted-foreground/50 py-3 text-center">
							No sub-issues yet
						</p>
					)}

					<InlineCreateInput
						parentId={parentId}
						members={members}
						forceOpen={forceInlineOpen}
						onForceOpenConsumed={() => setForceInlineOpen(false)}
					/>
				</CollapsibleContent>
			</div>
		</Collapsible>
	);
}
