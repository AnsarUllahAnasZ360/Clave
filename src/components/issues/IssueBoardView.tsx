"use client";

import {
	closestCorners,
	DndContext,
	type DragEndEvent,
	DragOverlay,
	type DragStartEvent,
	KeyboardSensor,
	PointerSensor,
	useDroppable,
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
import { ChevronRight, Columns3, MoreHorizontal } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
	type DisplayProperties,
	IssueBoardCard,
	type IssueCardData,
} from "@/components/issues/IssueBoardCard";
import { IssueInlineCreate } from "@/components/issues/IssueInlineCreate";
import { useWorkspace } from "@/components/providers/workspace-context";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import {
	PRIORITY_LABELS,
	STATUS_ITEMS,
	type StatusKey,
} from "@/lib/issue-config";
import { cn } from "@/lib/utils";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

// ── Status configuration (from centralized module) ───────────────────────

export type IssueStatus = StatusKey;

type StatusColumnConfig = (typeof STATUS_ITEMS)[number];

const STATUS_COLUMNS = STATUS_ITEMS;

// ── Swimlane grouping ─────────────────────────────────────────────────────

export type SwimlaneSetting = "none" | "assignee" | "priority" | "milestone";

type SwimlaneGroup = {
	key: string;
	label: string;
	icon?: React.ReactNode;
};

const PRIORITY_ORDER = ["urgent", "high", "medium", "low", "no_priority"];

// ── Props ─────────────────────────────────────────────────────────────────

export type IssueBoardViewProps = {
	projectId?: Id<"projects">;
	displayProperties?: DisplayProperties;
	swimlaneBy?: SwimlaneSetting;
	/** Pre-fetched issues to use instead of internal queries (e.g., from My Issues) */
	externalIssues?: IssueCardData[];
};

// ── Fractional index helpers ──────────────────────────────────────────────

function computeSortOrder(items: IssueCardData[], overIndex: number): number {
	if (items.length === 0) return 1.0;
	if (overIndex <= 0) return items[0].sortOrder / 2;
	if (overIndex >= items.length) return items[items.length - 1].sortOrder + 1.0;
	const before = items[overIndex - 1].sortOrder;
	const after = items[overIndex].sortOrder;
	return (before + after) / 2;
}

// ── Main component ────────────────────────────────────────────────────────

export function IssueBoardView({
	projectId,
	displayProperties,
	swimlaneBy = "none",
	externalIssues,
}: IssueBoardViewProps) {
	const { workspaceId, workspaceSlug } = useWorkspace();
	const router = useRouter();

	const hasExternalIssues = externalIssues !== undefined;

	// Fetch issues - skip when external issues are provided
	const projectIssues = useQuery(
		api.issues.listByProject,
		hasExternalIssues ? "skip" : projectId ? { projectId } : "skip",
	);
	const workspaceIssues = useQuery(
		api.issues.listByWorkspace,
		hasExternalIssues ? "skip" : projectId ? "skip" : { workspaceId },
	);

	// Resolve to array -- use external issues when provided
	const rawIssues = useMemo(() => {
		if (hasExternalIssues) return externalIssues;
		if (projectId) {
			if (!projectIssues) return undefined;
			return Array.isArray(projectIssues) ? projectIssues : [];
		}
		if (!workspaceIssues) return undefined;
		if ("issues" in workspaceIssues) return workspaceIssues.issues;
		return [];
	}, [
		hasExternalIssues,
		externalIssues,
		projectId,
		projectIssues,
		workspaceIssues,
	]);

	// Fetch workspace members for assignee data
	const members = useQuery(api.workspaceMembers.list, { workspaceId });

	// Fetch labels
	const labelsData = useQuery(api.labels.list, { workspaceId });

	// Fetch milestones for swimlane grouping
	const milestones = useQuery(
		api.milestones.listByProject,
		projectId ? { projectId } : "skip",
	);

	// Mutations
	const updateStatus = useMutation(api.issues.updateStatus);
	const reorderIssue = useMutation(api.issues.reorder);

	// Build member lookup
	const memberLookup = useMemo(() => {
		if (!members)
			return new Map<string, { name: string; avatarUrl?: string }>();
		const m = new Map<string, { name: string; avatarUrl?: string }>();
		for (const member of members) {
			if (member.user) {
				m.set(member.user._id, {
					name: member.user.name ?? "Unknown",
					avatarUrl: member.user.avatarUrl ?? member.user.image ?? undefined,
				});
			}
		}
		return m;
	}, [members]);

	// Build label lookup
	const labelLookup = useMemo(() => {
		if (!labelsData)
			return new Map<
				string,
				{ _id: Id<"labels">; name: string; color: string }
			>();
		const m = new Map<
			string,
			{ _id: Id<"labels">; name: string; color: string }
		>();
		for (const label of labelsData) {
			m.set(label._id, {
				_id: label._id,
				name: label.name,
				color: label.color,
			});
		}
		return m;
	}, [labelsData]);

	// Local state for optimistic updates
	const [localIssues, setLocalIssues] = useState<IssueCardData[]>([]);
	const [activeItem, setActiveItem] = useState<IssueCardData | null>(null);
	const [hiddenColumns, setHiddenColumns] = useState<Set<IssueStatus>>(
		new Set(),
	);

	// Sync from server data
	useEffect(() => {
		if (rawIssues) {
			setLocalIssues(
				rawIssues.map((issue) => ({
					_id: issue._id,
					identifier: issue.identifier,
					title: issue.title,
					status: issue.status,
					priority: issue.priority,
					assigneeId: issue.assigneeId ?? undefined,
					labelIds: issue.labelIds ?? undefined,
					dueDate: issue.dueDate ?? undefined,
					estimate: issue.estimate ?? undefined,
					sortOrder: issue.sortOrder,
					projectId: issue.projectId ?? undefined,
					milestoneId: issue.milestoneId ?? undefined,
				})),
			);
		}
	}, [rawIssues]);

	// DnD sensors
	const sensors = useSensors(
		useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
		useSensor(KeyboardSensor, {
			coordinateGetter: sortableKeyboardCoordinates,
		}),
	);

	// Group issues by status
	const columnGroups = useMemo(() => {
		const groups = new Map<IssueStatus, IssueCardData[]>();
		for (const col of STATUS_COLUMNS) {
			groups.set(col.id, []);
		}
		for (const issue of localIssues) {
			const col = groups.get(issue.status as IssueStatus);
			if (col) {
				col.push(issue);
			} else {
				groups.get("backlog")?.push(issue);
			}
		}
		for (const col of groups.values()) {
			col.sort((a, b) => a.sortOrder - b.sortOrder);
		}
		return groups;
	}, [localIssues]);

	// Find which column an item is in
	const findItemColumn = useCallback(
		(itemId: string): IssueStatus | null => {
			for (const [status, items] of columnGroups.entries()) {
				if (items.some((i) => i._id === itemId)) return status;
			}
			return null;
		},
		[columnGroups],
	);

	// DnD handlers
	const handleDragStart = useCallback(
		(event: DragStartEvent) => {
			const id = String(event.active.id);
			const item = localIssues.find((i) => i._id === id);
			setActiveItem(item ?? null);
		},
		[localIssues],
	);

	const handleDragEnd = useCallback(
		(event: DragEndEvent) => {
			const { active, over } = event;
			setActiveItem(null);
			if (!over) return;

			const activeId = String(active.id);
			const overId = String(over.id);

			const sourceStatus = findItemColumn(activeId);
			if (!sourceStatus) return;

			// Determine target column
			let targetStatus: IssueStatus | null = null;
			if (
				STATUS_COLUMNS.some((c) => c.id === overId) &&
				!localIssues.some((i) => i._id === overId)
			) {
				targetStatus = overId as IssueStatus;
			} else {
				targetStatus = findItemColumn(overId);
			}
			if (!targetStatus) return;

			const targetItems = columnGroups.get(targetStatus) ?? [];

			if (sourceStatus === targetStatus) {
				// Within-column reorder
				const sourceItems = [...targetItems];
				const oldIndex = sourceItems.findIndex((i) => i._id === activeId);
				const overIndex = sourceItems.findIndex((i) => i._id === overId);
				if (oldIndex === -1 || overIndex === -1 || oldIndex === overIndex)
					return;

				const [moved] = sourceItems.splice(oldIndex, 1);
				sourceItems.splice(overIndex, 0, moved);

				const newSortOrder = computeSortOrder(
					sourceItems.filter((i) => i._id !== activeId),
					overIndex,
				);

				setLocalIssues((prev) =>
					prev.map((item) =>
						item._id === activeId ? { ...item, sortOrder: newSortOrder } : item,
					),
				);

				reorderIssue({
					issueId: activeId as Id<"issues">,
					newSortOrder,
				}).catch(() => toast.error("Failed to reorder issue"));
			} else {
				// Cross-column move (status change)
				const overIndex = targetItems.findIndex((i) => i._id === overId);
				const insertIndex = overIndex === -1 ? targetItems.length : overIndex;
				const newSortOrder = computeSortOrder(targetItems, insertIndex);

				setLocalIssues((prev) =>
					prev.map((item) =>
						item._id === activeId
							? { ...item, status: targetStatus, sortOrder: newSortOrder }
							: item,
					),
				);

				Promise.all([
					updateStatus({
						issueId: activeId as Id<"issues">,
						status: targetStatus as IssueStatus,
					}),
					reorderIssue({
						issueId: activeId as Id<"issues">,
						newSortOrder,
					}),
				]).catch(() => toast.error("Failed to move issue"));
			}
		},
		[findItemColumn, columnGroups, localIssues, updateStatus, reorderIssue],
	);

	const handleDragCancel = useCallback(() => {
		setActiveItem(null);
	}, []);

	// Card click navigation
	const onCardClick = useCallback(
		(identifier: string) => {
			router.push(`/${workspaceSlug}/issues/${identifier}`);
		},
		[router, workspaceSlug],
	);

	// Column visibility
	const toggleColumn = useCallback((statusId: IssueStatus) => {
		setHiddenColumns((prev) => {
			const next = new Set(prev);
			if (next.has(statusId)) {
				next.delete(statusId);
			} else {
				next.add(statusId);
			}
			return next;
		});
	}, []);

	// Swimlane groups
	const swimlaneGroups = useMemo((): SwimlaneGroup[] | null => {
		if (swimlaneBy === "none") return null;

		if (swimlaneBy === "assignee") {
			const assigneeIds = new Set<string>();
			let hasUnassigned = false;
			for (const issue of localIssues) {
				if (issue.assigneeId) {
					assigneeIds.add(issue.assigneeId);
				} else {
					hasUnassigned = true;
				}
			}
			const groups: SwimlaneGroup[] = [];
			for (const id of assigneeIds) {
				const member = memberLookup.get(id);
				groups.push({
					key: id,
					label: member?.name ?? "Unknown",
					icon: member ? (
						<Avatar className="size-4">
							{member.avatarUrl ? (
								<AvatarImage src={member.avatarUrl} alt={member.name} />
							) : (
								<AvatarFallback className="text-[8px]">
									{member.name.charAt(0).toUpperCase()}
								</AvatarFallback>
							)}
						</Avatar>
					) : null,
				});
			}
			// Sort by name
			groups.sort((a, b) => a.label.localeCompare(b.label));
			if (hasUnassigned) {
				groups.push({ key: "__unassigned__", label: "Unassigned" });
			}
			return groups;
		}

		if (swimlaneBy === "priority") {
			return PRIORITY_ORDER.map((p) => ({
				key: p,
				label: PRIORITY_LABELS[p] ?? p,
			}));
		}

		if (swimlaneBy === "milestone" && milestones) {
			const groups: SwimlaneGroup[] = milestones.map((m) => ({
				key: m._id,
				label: m.name,
			}));
			groups.push({ key: "__no_milestone__", label: "No sprint" });
			return groups;
		}

		return null;
	}, [swimlaneBy, localIssues, memberLookup, milestones]);

	// Filter issues for a swimlane + status
	const getIssuesForCell = useCallback(
		(status: IssueStatus, swimlaneKey: string | null): IssueCardData[] => {
			const statusIssues = columnGroups.get(status) ?? [];
			if (!swimlaneKey) return statusIssues;

			return statusIssues.filter((issue) => {
				if (swimlaneBy === "assignee") {
					if (swimlaneKey === "__unassigned__") return !issue.assigneeId;
					return issue.assigneeId === swimlaneKey;
				}
				if (swimlaneBy === "priority") {
					return issue.priority === swimlaneKey;
				}
				if (swimlaneBy === "milestone") {
					if (swimlaneKey === "__no_milestone__") return !issue.milestoneId;
					return issue.milestoneId === swimlaneKey;
				}
				return true;
			});
		},
		[columnGroups, swimlaneBy],
	);

	// Loading state
	if (!rawIssues) {
		return <BoardSkeleton />;
	}

	const visibleColumns = STATUS_COLUMNS.filter((c) => !hiddenColumns.has(c.id));
	const hiddenColumnsList = STATUS_COLUMNS.filter((c) =>
		hiddenColumns.has(c.id),
	);

	return (
		<DndContext
			sensors={sensors}
			collisionDetection={closestCorners}
			onDragStart={handleDragStart}
			onDragEnd={handleDragEnd}
			onDragCancel={handleDragCancel}
		>
			<div className="kanban-scrollbar flex flex-col flex-1 min-h-0 h-full">
				{swimlaneGroups ? (
					// Swimlane mode: rows of columns
					<div className="px-2 pb-4 space-y-4 flex-1">
						{/* Column headers (sticky) */}
						<div className="flex gap-2 min-w-max">
							<div className="w-64 shrink-0" /> {/* Swimlane label spacer */}
							{visibleColumns.map((col) => (
								<div key={col.id} className="w-64 shrink-0">
									<ColumnHeader
										column={col}
										count={columnGroups.get(col.id)?.length ?? 0}
										onHide={() => toggleColumn(col.id)}
									/>
								</div>
							))}
						</div>

						{/* Swimlane rows */}
						{swimlaneGroups.map((swimlane) => (
							<SwimlaneRow
								key={swimlane.key}
								swimlane={swimlane}
								columns={visibleColumns}
								getIssues={(status) => getIssuesForCell(status, swimlane.key)}
								memberLookup={memberLookup}
								labelLookup={labelLookup}
								displayProperties={displayProperties}
								onCardClick={onCardClick}
							/>
						))}
					</div>
				) : (
					// Flat mode: simple columns
					<div className="flex gap-2 px-2 pb-4 min-w-max flex-1">
						{visibleColumns.map((column) => {
							const columnItems = columnGroups.get(column.id) ?? [];
							return (
								<BoardColumn
									key={column.id}
									column={column}
									items={columnItems}
									memberLookup={memberLookup}
									labelLookup={labelLookup}
									displayProperties={displayProperties}
									onHide={() => toggleColumn(column.id)}
									projectId={projectId}
									onCardClick={onCardClick}
								/>
							);
						})}

						{/* Hidden columns strip */}
						{hiddenColumnsList.length > 0 && (
							<HiddenColumnsStrip
								columns={hiddenColumnsList}
								columnGroups={columnGroups}
								onExpand={toggleColumn}
							/>
						)}
					</div>
				)}
			</div>

			{/* Drag overlay */}
			<DragOverlay>
				{activeItem ? (
					<div className="shadow-lg rounded-lg scale-[1.02] opacity-90 w-64">
						<IssueBoardCard
							issue={activeItem}
							displayProperties={displayProperties}
							assignee={
								activeItem.assigneeId
									? memberLookup.get(activeItem.assigneeId)
									: null
							}
							labels={resolveLabels(activeItem, labelLookup)}
						/>
					</div>
				) : null}
			</DragOverlay>
		</DndContext>
	);
}

// ── Column header ─────────────────────────────────────────────────────────

function ColumnHeader({
	column,
	count,
	onHide,
}: {
	column: StatusColumnConfig;
	count: number;
	onHide: () => void;
}) {
	const Icon = column.icon;
	return (
		<div className="flex items-center justify-between py-1.5">
			<div className="flex items-center gap-1.5">
				<Icon className={cn("h-4 w-4", column.color)} />
				<span className="text-sm font-medium">{column.label}</span>
				<span className="text-xs text-muted-foreground ml-0.5">{count}</span>
			</div>
			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<Button variant="ghost" size="icon" className="h-6 w-6">
						<MoreHorizontal className="h-3.5 w-3.5" />
					</Button>
				</DropdownMenuTrigger>
				<DropdownMenuContent align="end" className="min-w-[140px]">
					<DropdownMenuItem onClick={onHide}>
						<Columns3 className="h-3.5 w-3.5 mr-2" />
						Hide column
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>
		</div>
	);
}

// ── Board column (flat mode) ──────────────────────────────────────────────

function BoardColumn({
	column,
	items,
	memberLookup,
	labelLookup,
	displayProperties,
	onHide,
	projectId,
	onCardClick,
}: {
	column: StatusColumnConfig;
	items: IssueCardData[];
	memberLookup: Map<string, { name: string; avatarUrl?: string }>;
	labelLookup: Map<string, { _id: Id<"labels">; name: string; color: string }>;
	displayProperties?: DisplayProperties;
	onHide: () => void;
	projectId?: Id<"projects">;
	onCardClick: (identifier: string) => void;
}) {
	const { isOver, setNodeRef } = useDroppable({ id: column.id });
	const itemIds = useMemo(() => items.map((i) => i._id), [items]);

	return (
		<div
			ref={setNodeRef}
			className={cn(
				"flex-shrink-0 w-64 flex flex-col transition-colors",
				isOver && "bg-primary/5",
			)}
		>
			{/* Header */}
			<div className="px-2 pt-1 pb-1">
				<ColumnHeader column={column} count={items.length} onHide={onHide} />
			</div>

			{/* Cards */}
			<SortableContext items={itemIds} strategy={verticalListSortingStrategy}>
				<div className="px-1.5 pb-2 space-y-1.5 flex-1 overflow-y-auto">
					{items.length === 0 ? (
						<EmptyColumnState />
					) : (
						items.map((item) => (
							<SortableCard
								key={item._id}
								issue={item}
								memberLookup={memberLookup}
								labelLookup={labelLookup}
								displayProperties={displayProperties}
								onCardClick={onCardClick}
							/>
						))
					)}
				</div>
			</SortableContext>

			{/* Quick add at bottom -- only shown when a project context exists */}
			{projectId && (
				<div className="px-1.5 pb-2 mt-auto">
					<IssueInlineCreate status={column.id} projectId={projectId} />
				</div>
			)}
		</div>
	);
}

// ── Swimlane row ──────────────────────────────────────────────────────────

function SwimlaneRow({
	swimlane,
	columns,
	getIssues,
	memberLookup,
	labelLookup,
	displayProperties,
	onCardClick,
}: {
	swimlane: SwimlaneGroup;
	columns: StatusColumnConfig[];
	getIssues: (status: IssueStatus) => IssueCardData[];
	memberLookup: Map<string, { name: string; avatarUrl?: string }>;
	labelLookup: Map<string, { _id: Id<"labels">; name: string; color: string }>;
	displayProperties?: DisplayProperties;
	onCardClick: (identifier: string) => void;
}) {
	const [collapsed, setCollapsed] = useState(false);

	const totalIssues = useMemo(() => {
		return columns.reduce((sum, col) => sum + getIssues(col.id).length, 0);
	}, [columns, getIssues]);

	return (
		<div className="border border-border/40 rounded-lg overflow-hidden">
			{/* Swimlane header */}
			<button
				type="button"
				className="flex items-center gap-2 w-full px-3 py-2 bg-muted/30 hover:bg-muted/50 transition-colors text-left"
				onClick={() => setCollapsed((v) => !v)}
			>
				<ChevronRight
					className={cn(
						"h-3.5 w-3.5 text-muted-foreground transition-transform",
						!collapsed && "rotate-90",
					)}
				/>
				{swimlane.icon}
				<span className="text-sm font-medium">{swimlane.label}</span>
				<span className="text-xs text-muted-foreground">{totalIssues}</span>
			</button>

			{/* Swimlane columns */}
			{!collapsed && (
				<div className="flex gap-3 min-w-max px-3 py-2">
					<div className="w-40 shrink-0" /> {/* Spacer for label alignment */}
					{columns.map((col) => {
						const items = getIssues(col.id);
						return (
							<SwimlaneCell
								key={`${swimlane.key}-${col.id}`}
								columnId={col.id}
								items={items}
								memberLookup={memberLookup}
								labelLookup={labelLookup}
								displayProperties={displayProperties}
								onCardClick={onCardClick}
							/>
						);
					})}
				</div>
			)}
		</div>
	);
}

// ── Swimlane cell ─────────────────────────────────────────────────────────

function SwimlaneCell({
	columnId,
	items,
	memberLookup,
	labelLookup,
	displayProperties,
	onCardClick,
}: {
	columnId: IssueStatus;
	items: IssueCardData[];
	memberLookup: Map<string, { name: string; avatarUrl?: string }>;
	labelLookup: Map<string, { _id: Id<"labels">; name: string; color: string }>;
	displayProperties?: DisplayProperties;
	onCardClick: (identifier: string) => void;
}) {
	const droppableId = `swimlane-${columnId}`;
	const { isOver, setNodeRef } = useDroppable({ id: droppableId });
	const itemIds = useMemo(() => items.map((i) => i._id), [items]);

	return (
		<div
			ref={setNodeRef}
			className={cn(
				"w-64 shrink-0 min-h-[80px] p-1.5 space-y-1.5 transition-colors border-r border-border/20 last:border-r-0",
				isOver && "bg-primary/5",
			)}
		>
			<SortableContext items={itemIds} strategy={verticalListSortingStrategy}>
				{items.length === 0 ? (
					<div className="flex items-center justify-center h-16 text-xs text-muted-foreground">
						No issues
					</div>
				) : (
					items.map((item) => (
						<SortableCard
							key={item._id}
							issue={item}
							memberLookup={memberLookup}
							labelLookup={labelLookup}
							displayProperties={displayProperties}
							onCardClick={onCardClick}
						/>
					))
				)}
			</SortableContext>
		</div>
	);
}

// ── Sortable card wrapper ─────────────────────────────────────────────────

function SortableCard({
	issue,
	memberLookup,
	labelLookup,
	displayProperties,
	onCardClick,
}: {
	issue: IssueCardData;
	memberLookup: Map<string, { name: string; avatarUrl?: string }>;
	labelLookup: Map<string, { _id: Id<"labels">; name: string; color: string }>;
	displayProperties?: DisplayProperties;
	onCardClick?: (identifier: string) => void;
}) {
	const {
		attributes,
		listeners,
		setNodeRef,
		transform,
		transition,
		isDragging,
	} = useSortable({ id: issue._id });

	const style = {
		transform: CSS.Transform.toString(transform),
		transition,
	};

	const assignee = issue.assigneeId
		? (memberLookup.get(issue.assigneeId) ?? null)
		: null;

	const labels = resolveLabels(issue, labelLookup);

	return (
		<div
			ref={setNodeRef}
			style={style}
			className={cn("transition-opacity", isDragging && "opacity-40")}
			{...attributes}
			{...listeners}
		>
			<IssueBoardCard
				issue={issue}
				displayProperties={displayProperties}
				assignee={assignee}
				labels={labels}
				onClick={onCardClick ? () => onCardClick(issue.identifier) : undefined}
			/>
		</div>
	);
}

// ── Hidden columns strip ──────────────────────────────────────────────────

function HiddenColumnsStrip({
	columns,
	columnGroups,
	onExpand,
}: {
	columns: StatusColumnConfig[];
	columnGroups: Map<IssueStatus, IssueCardData[]>;
	onExpand: (statusId: IssueStatus) => void;
}) {
	return (
		<div className="flex flex-col gap-2">
			{columns.map((col) => {
				const Icon = col.icon;
				const count = columnGroups.get(col.id)?.length ?? 0;
				return (
					<button
						key={col.id}
						type="button"
						className="flex flex-col items-center gap-1 rounded-md border border-border/30 px-2 py-3 hover:bg-muted/50 transition-colors min-h-[80px] w-8"
						onClick={() => onExpand(col.id)}
						title={`Show ${col.label} (${count})`}
					>
						<Icon className={cn("h-3.5 w-3.5", col.color)} />
						<span className="text-[10px] text-muted-foreground [writing-mode:vertical-lr] rotate-180">
							{col.label}
						</span>
						{count > 0 && (
							<span className="text-[10px] text-muted-foreground">{count}</span>
						)}
					</button>
				);
			})}
		</div>
	);
}

// ── Empty column state ────────────────────────────────────────────────────

function EmptyColumnState() {
	return (
		<div className="min-h-[80px] flex items-center justify-center p-4">
			<p className="text-xs text-muted-foreground/60 text-center">No issues</p>
		</div>
	);
}

// ── Loading skeleton ──────────────────────────────────────────────────────

function BoardSkeleton() {
	return (
		<div className="overflow-x-auto flex flex-col flex-1 min-h-0 h-full">
			<div className="flex gap-2 px-2 pb-4 min-w-max flex-1">
				{STATUS_COLUMNS.slice(0, 5).map((column) => (
					<div
						key={column.id}
						className="flex-shrink-0 w-64 p-2 space-y-3 border-r border-border/20 last:border-r-0"
					>
						<div className="flex items-center gap-2">
							<Skeleton className="h-4 w-4 rounded" />
							<Skeleton className="h-4 w-20" />
							<Skeleton className="h-3 w-4" />
						</div>
						<div className="space-y-1.5">
							{Array.from({ length: 3 }).map((_, i) => (
								<Skeleton
									key={`${column.id}-${i}`}
									className="h-24 rounded-lg"
								/>
							))}
						</div>
					</div>
				))}
			</div>
		</div>
	);
}

// ── Label resolution helper ───────────────────────────────────────────────

function resolveLabels(
	issue: IssueCardData,
	labelLookup: Map<string, { _id: Id<"labels">; name: string; color: string }>,
): { _id: Id<"labels">; name: string; color: string }[] {
	if (!issue.labelIds || issue.labelIds.length === 0) return [];
	return issue.labelIds.map((id) => labelLookup.get(id)).filter(Boolean) as {
		_id: Id<"labels">;
		name: string;
		color: string;
	}[];
}
