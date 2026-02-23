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
import {
	CheckCircle,
	Circle,
	CircleNotch,
	Eye,
	Plus,
	StackSimple,
} from "@phosphor-icons/react/dist/ssr";
import { useCallback, useEffect, useMemo, useState } from "react";
import { TaskBoardCard } from "@/components/tasks/TaskBoardCard";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { ProjectTask } from "@/lib/data/project-details";
import { cn } from "@/lib/utils";

// ── Types ──────────────────────────────────────────────────────────────────

export type KanbanStatus =
	| "backlog"
	| "todo"
	| "in_progress"
	| "in_review"
	| "done";

type StatusColumn = {
	id: KanbanStatus;
	label: string;
	icon: React.ReactNode;
};

export type KanbanItem = ProjectTask & {
	/** The backend status value (used for column assignment) */
	backendStatus: KanbanStatus;
	/** sortOrder for fractional indexing */
	sortOrder: number;
};

export type StatusKanbanBoardProps = {
	items: KanbanItem[];
	onStatusChange: (itemId: string, newStatus: KanbanStatus) => void;
	onReorder: (itemId: string, newSortOrder: number) => void;
	onToggleItem?: (itemId: string) => void;
	onOpenItem?: (item: KanbanItem) => void;
	onAddItem?: (status: KanbanStatus) => void;
	loading?: boolean;
	/** Optional map of status key -> custom display label */
	columnLabels?: Record<string, string>;
};

// ── Column config ──────────────────────────────────────────────────────────

const COLUMNS: StatusColumn[] = [
	{
		id: "backlog",
		label: "Backlog",
		icon: <StackSimple className="h-4 w-4 text-muted-foreground" />,
	},
	{
		id: "todo",
		label: "Todo",
		icon: <Circle className="h-4 w-4 text-muted-foreground" />,
	},
	{
		id: "in_progress",
		label: "In progress",
		icon: <CircleNotch className="h-4 w-4 text-yellow-500" />,
	},
	{
		id: "in_review",
		label: "In review",
		icon: <Eye className="h-4 w-4 text-blue-500" />,
	},
	{
		id: "done",
		label: "Done",
		icon: <CheckCircle className="h-4 w-4 text-emerald-500" />,
	},
];

// ── Helpers ────────────────────────────────────────────────────────────────

function computeSortOrder(items: KanbanItem[], overIndex: number): number {
	if (items.length === 0) return 1.0;

	if (overIndex <= 0) {
		return items[0].sortOrder / 2;
	}
	if (overIndex >= items.length) {
		return items[items.length - 1].sortOrder + 1.0;
	}

	const before = items[overIndex - 1].sortOrder;
	const after = items[overIndex].sortOrder;
	return (before + after) / 2;
}

// ── Main component ─────────────────────────────────────────────────────────

export function StatusKanbanBoard({
	items,
	onStatusChange,
	onReorder,
	onToggleItem,
	onOpenItem,
	onAddItem,
	loading = false,
	columnLabels,
}: StatusKanbanBoardProps) {
	// Apply custom labels from workspace settings
	const columns = columnLabels
		? COLUMNS.map((col) => ({
				...col,
				label: columnLabels[col.id] ?? col.label,
			}))
		: COLUMNS;
	const [localItems, setLocalItems] = useState<KanbanItem[]>(items);
	const [activeItem, setActiveItem] = useState<KanbanItem | null>(null);

	// Sync local state when items change (from Convex subscription)
	useEffect(() => {
		setLocalItems(items);
	}, [items]);

	const sensors = useSensors(
		useSensor(PointerSensor, {
			activationConstraint: { distance: 5 },
		}),
		useSensor(KeyboardSensor, {
			coordinateGetter: sortableKeyboardCoordinates,
		}),
	);

	// Group items by backend status
	const columnGroups = useMemo(() => {
		const groups = new Map<KanbanStatus, KanbanItem[]>();
		for (const col of columns) {
			groups.set(col.id, []);
		}
		for (const item of localItems) {
			const col = groups.get(item.backendStatus);
			if (col) {
				col.push(item);
			} else {
				// Items with statuses not in our columns (e.g., cancelled, triage)
				// go to backlog
				groups.get("backlog")?.push(item);
			}
		}
		// Sort each column by sortOrder
		for (const col of groups.values()) {
			col.sort((a, b) => a.sortOrder - b.sortOrder);
		}
		return groups;
	}, [localItems, columns]);

	const findItemColumn = useCallback(
		(itemId: string): KanbanStatus | null => {
			for (const [status, items] of columnGroups.entries()) {
				if (items.some((i) => i.id === itemId)) return status;
			}
			return null;
		},
		[columnGroups],
	);

	const handleDragStart = useCallback(
		(event: DragStartEvent) => {
			const id = String(event.active.id);
			const item = localItems.find((i) => i.id === id);
			setActiveItem(item ?? null);
		},
		[localItems],
	);

	const handleDragEnd = useCallback(
		(event: DragEndEvent) => {
			const { active, over } = event;
			setActiveItem(null);

			if (!over) return;

			const activeId = String(active.id);
			const overId = String(over.id);

			// Determine source column
			const sourceStatus = findItemColumn(activeId);
			if (!sourceStatus) return;

			// Determine target column
			let targetStatus: KanbanStatus | null = null;

			// Check if dropped on a column droppable
			if (
				columns.some((c) => c.id === overId) &&
				!localItems.some((i) => i.id === overId)
			) {
				targetStatus = overId as KanbanStatus;
			} else {
				// Dropped on another item — find which column that item is in
				targetStatus = findItemColumn(overId);
			}

			if (!targetStatus) return;

			const targetItems = columnGroups.get(targetStatus) ?? [];

			if (sourceStatus === targetStatus) {
				// Within-column reorder
				const sourceItems = [...targetItems];
				const oldIndex = sourceItems.findIndex((i) => i.id === activeId);
				const overIndex = sourceItems.findIndex((i) => i.id === overId);

				if (oldIndex === -1 || overIndex === -1 || oldIndex === overIndex)
					return;

				// Remove the dragged item
				const [moved] = sourceItems.splice(oldIndex, 1);
				// Insert at new position
				sourceItems.splice(overIndex, 0, moved);

				// Compute new sortOrder
				const newSortOrder = computeSortOrder(
					sourceItems.filter((i) => i.id !== activeId),
					overIndex,
				);

				// Optimistic update
				setLocalItems((prev) =>
					prev.map((item) =>
						item.id === activeId ? { ...item, sortOrder: newSortOrder } : item,
					),
				);

				onReorder(activeId, newSortOrder);
			} else {
				// Cross-column move (status change)
				const overIndex = targetItems.findIndex((i) => i.id === overId);
				const insertIndex = overIndex === -1 ? targetItems.length : overIndex;
				const newSortOrder = computeSortOrder(targetItems, insertIndex);

				// Optimistic update
				setLocalItems((prev) =>
					prev.map((item) =>
						item.id === activeId
							? {
									...item,
									backendStatus: targetStatus,
									sortOrder: newSortOrder,
								}
							: item,
					),
				);

				onStatusChange(activeId, targetStatus);
				onReorder(activeId, newSortOrder);
			}
		},
		[
			findItemColumn,
			columnGroups,
			localItems,
			onStatusChange,
			onReorder,
			columns.some,
		],
	);

	const handleDragCancel = useCallback(() => {
		setActiveItem(null);
	}, []);

	if (loading) {
		return <KanbanSkeleton />;
	}

	return (
		<DndContext
			sensors={sensors}
			collisionDetection={closestCorners}
			onDragStart={handleDragStart}
			onDragEnd={handleDragEnd}
			onDragCancel={handleDragCancel}
		>
			<div className="overflow-x-auto flex-1 min-h-0">
				<div className="flex gap-4 px-4 pb-4 min-w-max">
					{columns.map((column) => {
						const columnItems = columnGroups.get(column.id) ?? [];
						return (
							<KanbanColumn
								key={column.id}
								column={column}
								items={columnItems}
								onToggleItem={onToggleItem}
								onOpenItem={onOpenItem}
								onAddItem={onAddItem}
							/>
						);
					})}
				</div>
			</div>

			<DragOverlay>
				{activeItem ? (
					<div className="shadow-lg rounded-2xl scale-[1.02] opacity-90">
						<TaskBoardCard
							task={activeItem}
							variant={activeItem.status === "done" ? "completed" : "default"}
						/>
					</div>
				) : null}
			</DragOverlay>
		</DndContext>
	);
}

// ── Column component ───────────────────────────────────────────────────────

type KanbanColumnProps = {
	column: StatusColumn;
	items: KanbanItem[];
	onToggleItem?: (itemId: string) => void;
	onOpenItem?: (item: KanbanItem) => void;
	onAddItem?: (status: KanbanStatus) => void;
};

function KanbanColumn({
	column,
	items,
	onToggleItem,
	onOpenItem,
	onAddItem,
}: KanbanColumnProps) {
	const { isOver, setNodeRef } = useDroppable({
		id: column.id,
	});

	const itemIds = useMemo(() => items.map((i) => i.id), [items]);

	return (
		<div
			ref={setNodeRef}
			className={cn(
				"flex-shrink-0 rounded-2xl border border-border bg-muted p-3 space-y-3 min-h-[400px] w-72 transition-colors",
				isOver && "border-primary/60 bg-muted/80",
			)}
		>
			{/* Column header */}
			<div className="flex items-center justify-between">
				<div className="flex items-center gap-2">
					{column.icon}
					<span className="text-sm font-medium">{column.label}</span>
					<span className="text-xs text-muted-foreground">{items.length}</span>
				</div>
				{onAddItem && (
					<Button
						variant="ghost"
						size="icon"
						className="h-7 w-7 rounded-lg"
						onClick={() => onAddItem(column.id)}
						aria-label={`Add item to ${column.label}`}
					>
						<Plus className="h-4 w-4" />
					</Button>
				)}
			</div>

			{/* Sortable cards */}
			<SortableContext items={itemIds} strategy={verticalListSortingStrategy}>
				<div className="space-y-3">
					{items.length === 0 ? (
						<div className="border border-dashed border-border/60 min-h-[80px] items-center justify-center p-4 rounded-2xl flex flex-col">
							<p className="text-muted-foreground text-xs">No items</p>
						</div>
					) : (
						items.map((item) => (
							<SortableKanbanCard
								key={item.id}
								item={item}
								onToggle={onToggleItem}
								onOpen={onOpenItem}
							/>
						))
					)}
				</div>
			</SortableContext>

			{/* Add button at bottom */}
			{onAddItem && items.length > 0 && (
				<Button
					variant="ghost"
					size="sm"
					className="w-full justify-start text-muted-foreground"
					onClick={() => onAddItem(column.id)}
				>
					<Plus className="mr-1 h-4 w-4" />
					Add item
				</Button>
			)}
		</div>
	);
}

// ── Sortable card wrapper ──────────────────────────────────────────────────

type SortableKanbanCardProps = {
	item: KanbanItem;
	onToggle?: (itemId: string) => void;
	onOpen?: (item: KanbanItem) => void;
};

function SortableKanbanCard({
	item,
	onToggle,
	onOpen,
}: SortableKanbanCardProps) {
	const {
		attributes,
		listeners,
		setNodeRef,
		transform,
		transition,
		isDragging,
	} = useSortable({
		id: item.id,
	});

	const style = {
		transform: CSS.Transform.toString(transform),
		transition,
	};

	return (
		<div
			ref={setNodeRef}
			style={style}
			className={cn("transition-opacity", isDragging && "opacity-40")}
			{...attributes}
			{...listeners}
		>
			<TaskBoardCard
				task={item}
				variant={item.status === "done" ? "completed" : "default"}
				onToggle={onToggle ? () => onToggle(item.id) : undefined}
				onOpen={onOpen ? () => onOpen(item) : undefined}
			/>
		</div>
	);
}

// ── Loading skeleton ───────────────────────────────────────────────────────

function KanbanSkeleton() {
	return (
		<div className="overflow-x-auto flex-1 min-h-0">
			<div className="flex gap-4 px-4 pb-4 min-w-max">
				{COLUMNS.map((column) => (
					<div
						key={column.id}
						className="flex-shrink-0 rounded-2xl border border-border bg-muted p-3 space-y-3 min-h-[400px] w-72"
					>
						<div className="flex items-center justify-between">
							<div className="flex items-center gap-2">
								<Skeleton className="h-4 w-4 rounded" />
								<Skeleton className="h-4 w-20" />
								<Skeleton className="h-3 w-4" />
							</div>
						</div>
						<div className="space-y-3">
							{["skel-a", "skel-b", "skel-c"].map((skeletonId) => (
								<Skeleton key={skeletonId} className="h-32 rounded-2xl" />
							))}
						</div>
					</div>
				))}
			</div>
		</div>
	);
}
