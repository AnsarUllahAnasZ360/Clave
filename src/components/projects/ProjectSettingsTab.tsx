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
	arrayMove,
	SortableContext,
	sortableKeyboardCoordinates,
	useSortable,
	verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useMutation } from "convex/react";
import { GripVertical, Plus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
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
import { ColorPicker } from "@/components/ui/color-picker";
import { Input } from "@/components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { applyOrder } from "@/hooks/use-workspace-settings";
import { DEFAULT_ISSUE_TYPES, DEFAULT_STATUSES } from "@/lib/issue-config";
import { cn } from "@/lib/utils";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

// ── Types ────────────────────────────────────────────────────────────────

type CustomItem = { key: string; name: string; color: string };

type ProjectData = {
	_id: Id<"projects">;
	customStatuses?: CustomItem[];
	customTypes?: CustomItem[];
	customStatusOrder?: string[];
};

type ListItem = CustomItem & { isDefault: boolean };

// ── Editable list section ────────────────────────────────────────────────
// ── Main component ──────────────────────────────────────────────────────

export function ProjectSettingsTab({
	projectId,
	project,
}: {
	projectId: Id<"projects">;
	project: ProjectData;
}) {
	const createType = useMutation(api.projects.createCustomIssueType);
	const updateType = useMutation(api.projects.updateCustomIssueType);
	const deleteType = useMutation(api.projects.deleteCustomIssueType);
	const createStatus = useMutation(api.projects.createCustomIssueStatus);
	const updateStatus = useMutation(api.projects.updateCustomIssueStatus);
	const deleteStatus = useMutation(api.projects.deleteCustomIssueStatus);
	const reorderStatuses = useMutation(api.projects.reorderCustomIssueStatuses);

	const defaultTypes = DEFAULT_ISSUE_TYPES.map((t) => ({
		key: t.key,
		name: t.name,
		color: t.color.replace("text-", ""),
	}));

	const defaultStatuses = DEFAULT_STATUSES.map((s) => ({
		key: s.key,
		name: s.name,
		color: s.color.replace("text-", ""),
	}));

	const mergeDefaults = (
		defaults: CustomItem[],
		custom: CustomItem[] | undefined,
	) => {
		if (!custom || custom.length === 0)
			return defaults.map((d) => ({ ...d, isDefault: true }));
		const merged = defaults.map((def) => {
			const override = custom.find((c) => c.key === def.key);
			return { ...(override ?? def), isDefault: true };
		});
		const customOnly = custom.filter(
			(c) => !defaults.some((d) => d.key === c.key),
		);
		return [...merged, ...customOnly.map((c) => ({ ...c, isDefault: false }))];
	};

	const types = mergeDefaults(defaultTypes, project.customTypes);
	const statusesUnordered = mergeDefaults(
		defaultStatuses,
		project.customStatuses,
	);
	// Apply persisted display order so the reorderable list reflects the same
	// sequence the rest of the app sees (kanban columns, list groups, etc).
	const statuses = applyOrder(statusesUnordered, project.customStatusOrder);

	const [addingSection, setAddingSection] = useState<
		"types" | "statuses" | null
	>(null);
	const [newName, setNewName] = useState("");
	const [newColor, setNewColor] = useState("#6b7280");
	const [editingKey, setEditingKey] = useState<string | null>(null);
	const [editName, setEditName] = useState("");

	const [deleteState, setDeleteState] = useState<{
		section: "types" | "statuses";
		key: string;
		name: string;
	} | null>(null);
	const [replacementKey, setReplacementKey] = useState<string>("");

	const handleAdd = async (section: "types" | "statuses") => {
		const name = newName.trim();
		if (!name) return;
		try {
			if (section === "types") {
				await createType({ projectId, name, color: newColor });
			} else {
				await createStatus({ projectId, name, color: newColor });
			}
			toast.success("Added");
			setNewName("");
			setNewColor("#6b7280");
			setAddingSection(null);
		} catch {
			toast.error("Failed to add");
		}
	};

	const handleSave = async (section: "types" | "statuses", key: string) => {
		const name = editName.trim();
		try {
			if (section === "types") {
				await updateType({ projectId, key, name: name || undefined });
			} else {
				await updateStatus({ projectId, key, name: name || undefined });
			}
			toast.success("Saved");
			setEditingKey(null);
		} catch {
			toast.error("Failed to save");
		}
	};

	const handleColor = async (
		section: "types" | "statuses",
		key: string,
		color: string,
	) => {
		try {
			if (section === "types") {
				await updateType({ projectId, key, color });
			} else {
				await updateStatus({ projectId, key, color });
			}
		} catch {
			toast.error("Failed to update color");
		}
	};

	const handleRequestDelete = (section: "types" | "statuses", key: string) => {
		const items = section === "types" ? types : statuses;
		const item = items.find((i) => i.key === key);
		if (!item || item.isDefault) return;
		const firstReplacement = items.find((i) => i.key !== key)?.key ?? "";
		setReplacementKey(firstReplacement);
		setDeleteState({ section, key, name: item.name });
	};

	const handleConfirmDelete = async () => {
		if (!deleteState) return;
		if (!replacementKey) return;
		try {
			if (deleteState.section === "types") {
				await deleteType({ projectId, key: deleteState.key, replacementKey });
			} else {
				await deleteStatus({ projectId, key: deleteState.key, replacementKey });
			}
			toast.success("Removed");
			setDeleteState(null);
			setReplacementKey("");
		} catch {
			toast.error("Failed to remove");
		}
	};

	const renderRow = (
		section: "types" | "statuses",
		item: ListItem,
		dnd?: {
			setNodeRef: (el: HTMLElement | null) => void;
			style: React.CSSProperties;
			attributes: Record<string, unknown>;
			listeners: Record<string, unknown> | undefined;
			isDragging: boolean;
		},
	) => (
		<div
			ref={dnd?.setNodeRef}
			style={dnd?.style}
			className={cn(
				"flex items-center gap-2 px-3 py-2 rounded-md border border-border/40 bg-card/50",
				dnd?.isDragging && "opacity-60 ring-1 ring-primary/40",
			)}
		>
			{dnd && (
				<button
					type="button"
					aria-label="Reorder"
					className="cursor-grab active:cursor-grabbing text-muted-foreground/40 hover:text-muted-foreground transition-colors"
					{...dnd.attributes}
					{...dnd.listeners}
				>
					<GripVertical className="h-3.5 w-3.5" />
				</button>
			)}
			<ColorPicker
				color={item.color}
				onColorChange={(c) => void handleColor(section, item.key, c)}
			/>

			{editingKey === `${section}-${item.key}` ? (
				<Input
					value={editName}
					onChange={(e) => setEditName(e.target.value)}
					className="h-7 text-xs flex-1"
					onBlur={() => handleSave(section, item.key)}
					onKeyDown={(e) => {
						if (e.key === "Enter") handleSave(section, item.key);
						if (e.key === "Escape") setEditingKey(null);
					}}
				/>
			) : (
				<button
					type="button"
					className="text-sm flex-1 text-left hover:underline"
					onClick={() => {
						setEditingKey(`${section}-${item.key}`);
						setEditName(item.name);
					}}
				>
					{item.name}
				</button>
			)}

			{item.isDefault ? (
				<span className="text-[10px] text-muted-foreground/50">default</span>
			) : (
				<button
					type="button"
					onClick={() => handleRequestDelete(section, item.key)}
					className="text-muted-foreground/50 hover:text-destructive transition-colors"
				>
					<Trash2 className="h-3.5 w-3.5" />
				</button>
			)}
		</div>
	);

	const renderSection = (section: "types" | "statuses") => {
		const items = section === "types" ? types : statuses;
		return (
			<section className="space-y-3">
				<div>
					<h3 className="text-sm font-medium">
						{section === "types" ? "Issue types" : "Statuses"}
					</h3>
					<p className="text-xs text-muted-foreground mt-0.5">
						Default items can be renamed but not deleted. Custom items can be
						deleted with replacement.
						{section === "statuses" ? " Drag to reorder." : ""}
					</p>
				</div>

				{section === "statuses" ? (
					<SortableProjectStatusList
						items={items}
						onReorder={async (orderedKeys) => {
							try {
								await reorderStatuses({ projectId, orderedKeys });
							} catch {
								toast.error("Failed to save status order");
							}
						}}
						renderRow={(item, dnd) => renderRow("statuses", item, dnd)}
					/>
				) : (
					<div className="space-y-1">
						{items.map((item) => (
							<div key={item.key}>{renderRow(section, item)}</div>
						))}
					</div>
				)}

				{addingSection === section ? (
					<div className="flex items-center gap-2 px-3 py-2 rounded-md border border-dashed border-border/60">
						<ColorPicker color={newColor} onColorChange={setNewColor} />
						<Input
							value={newName}
							onChange={(e) => setNewName(e.target.value)}
							placeholder="Label"
							className="h-7 text-xs flex-1"
							onKeyDown={(e) => e.key === "Enter" && handleAdd(section)}
						/>
						<Button
							size="sm"
							className="h-7 text-xs"
							onClick={() => handleAdd(section)}
						>
							Add
						</Button>
						<Button
							size="sm"
							variant="ghost"
							className="h-7 text-xs"
							onClick={() => setAddingSection(null)}
						>
							Cancel
						</Button>
					</div>
				) : (
					<Button
						variant="ghost"
						size="sm"
						className="h-7 gap-1 text-xs text-muted-foreground"
						onClick={() => setAddingSection(section)}
					>
						<Plus className="h-3.5 w-3.5" />
						Add custom {section === "types" ? "type" : "status"}
					</Button>
				)}
			</section>
		);
	};

	return (
		<div className="space-y-8">
			<div>
				<h2 className="text-lg font-semibold">Project settings</h2>
				<p className="text-sm text-muted-foreground mt-1">
					Customize issue types and statuses for this project. Custom items are
					added on top of workspace defaults.
				</p>
			</div>

			<div className="space-y-6">
				{renderSection("types")}
				{renderSection("statuses")}
			</div>

			<AlertDialog
				open={Boolean(deleteState)}
				onOpenChange={(open) => {
					if (!open) {
						setDeleteState(null);
						setReplacementKey("");
					}
				}}
			>
				<AlertDialogContent size="sm">
					<AlertDialogHeader>
						<AlertDialogTitle>Delete {deleteState?.name}</AlertDialogTitle>
						<AlertDialogDescription>
							Choose a replacement. Existing issues using this value will be
							migrated.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<div className="space-y-2">
						<Select value={replacementKey} onValueChange={setReplacementKey}>
							<SelectTrigger>
								<SelectValue placeholder="Replacement" />
							</SelectTrigger>
							<SelectContent>
								{(deleteState?.section === "types" ? types : statuses)
									.filter((i) => i.key !== deleteState?.key)
									.map((i) => (
										<SelectItem key={i.key} value={i.key}>
											{i.name}
										</SelectItem>
									))}
							</SelectContent>
						</Select>
					</div>
					<AlertDialogFooter>
						<AlertDialogCancel>Cancel</AlertDialogCancel>
						<AlertDialogAction onClick={handleConfirmDelete}>
							Delete
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</div>
	);
}

// ── Sortable status list ──────────────────────────────────────────────────

function SortableProjectStatusList({
	items,
	onReorder,
	renderRow,
}: {
	items: ListItem[];
	onReorder: (orderedKeys: string[]) => void | Promise<void>;
	renderRow: (
		item: ListItem,
		dnd: {
			setNodeRef: (el: HTMLElement | null) => void;
			style: React.CSSProperties;
			attributes: Record<string, unknown>;
			listeners: Record<string, unknown> | undefined;
			isDragging: boolean;
		},
	) => React.ReactNode;
}) {
	const [localItems, setLocalItems] = useState(items);
	useEffect(() => setLocalItems(items), [items]);

	const sensors = useSensors(
		useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
		useSensor(KeyboardSensor, {
			coordinateGetter: sortableKeyboardCoordinates,
		}),
	);

	const handleDragEnd = (event: DragEndEvent) => {
		const { active, over } = event;
		if (!over || active.id === over.id) return;
		const oldIndex = localItems.findIndex((i) => i.key === active.id);
		const newIndex = localItems.findIndex((i) => i.key === over.id);
		if (oldIndex < 0 || newIndex < 0) return;
		const next = arrayMove(localItems, oldIndex, newIndex);
		setLocalItems(next);
		void onReorder(next.map((i) => i.key));
	};

	return (
		<DndContext
			sensors={sensors}
			collisionDetection={closestCenter}
			onDragEnd={handleDragEnd}
		>
			<SortableContext
				items={localItems.map((i) => i.key)}
				strategy={verticalListSortingStrategy}
			>
				<div className="space-y-1">
					{localItems.map((item) => (
						<SortableProjectStatusRow
							key={item.key}
							item={item}
							renderRow={renderRow}
						/>
					))}
				</div>
			</SortableContext>
		</DndContext>
	);
}

function SortableProjectStatusRow({
	item,
	renderRow,
}: {
	item: ListItem;
	renderRow: (
		item: ListItem,
		dnd: {
			setNodeRef: (el: HTMLElement | null) => void;
			style: React.CSSProperties;
			attributes: Record<string, unknown>;
			listeners: Record<string, unknown> | undefined;
			isDragging: boolean;
		},
	) => React.ReactNode;
}) {
	const {
		attributes,
		listeners,
		setNodeRef,
		transform,
		transition,
		isDragging,
	} = useSortable({ id: item.key });
	const style: React.CSSProperties = {
		transform: CSS.Transform.toString(transform),
		transition,
	};
	return (
		<>
			{renderRow(item, {
				setNodeRef,
				style,
				attributes: attributes as unknown as Record<string, unknown>,
				listeners: listeners as unknown as Record<string, unknown> | undefined,
				isDragging,
			})}
		</>
	);
}
