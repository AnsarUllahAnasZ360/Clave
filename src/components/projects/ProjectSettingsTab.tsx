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
import { useMutation, useQuery } from "convex/react";
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
import { resolveStatusCategory } from "@/hooks/use-effective-issue-config";
import { applyOrder } from "@/hooks/use-workspace-settings";
import {
	DEFAULT_ISSUE_TYPES,
	DEFAULT_STATUSES,
	STATUS_CATEGORY_LABELS,
	STATUS_CATEGORY_ORDER,
	type StatusCategory,
} from "@/lib/issue-config";
import { cn } from "@/lib/utils";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

// ── Types ────────────────────────────────────────────────────────────────

type CustomItem = {
	key: string;
	name: string;
	color: string;
	category?: StatusCategory;
};

type ProjectData = {
	_id: Id<"projects">;
	workspaceId: Id<"workspaces">;
	customStatuses?: CustomItem[];
	customTypes?: CustomItem[];
	customStatusOrder?: string[];
	hiddenStatusKeys?: string[];
};

/**
 * Origin of a status/type row in the project settings list:
 *   - `default`   — built into Clave (the 7 base statuses / 4 base types)
 *   - `workspace` — inherited from workspace customs (added in workspace
 *                   settings; the project doesn't own it but sees it)
 *   - `project`   — created at project level only
 *
 * Both `default` and `workspace` rows are non-deletable from the project tab
 * — deleting a workspace custom status from a single project would silently
 * leave it orphaned everywhere else. Only `project`-origin rows have a delete
 * button.
 */
type RowOrigin = "default" | "workspace" | "project";

type ListItem = CustomItem & { isDefault: boolean; origin: RowOrigin };

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

	// Workspace settings — needed so workspace-level custom statuses and types
	// show up here as inherited rows. Without this, a workspace admin adding
	// a "Review" status would see it on the kanban (which uses the effective
	// resolver) but not in project settings (which only knew about defaults +
	// the project's own customs). That divergence was the user-reported bug.
	const workspaceSettings = useQuery(api.workspaceSettings.get, {
		workspaceId: project.workspaceId,
	});

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

	/**
	 * Three-layer merge: built-in defaults → workspace customs → project
	 * overrides. The first two layers determine what the project *inherits*
	 * (read-only at project scope, no delete button); only project-level
	 * customs can be deleted from this UI.
	 *
	 * Override semantics: when a project-level row shares a key with an
	 * inherited row (e.g. project renamed `done` to "Shipped"), the project's
	 * name/color/category wins, but the row's origin stays inherited so it
	 * remains non-deletable. Removing the project-level override (via the
	 * mutation) restores the inherited values.
	 */
	function mergeProjectScope(
		builtIns: CustomItem[],
		workspaceCustoms: CustomItem[] | undefined,
		projectCustoms: CustomItem[] | undefined,
		hiddenKeys: string[] | undefined,
	): ListItem[] {
		// Start with the inherited base (defaults + workspace customs). Each
		// row gets an origin tag so the UI can label its source. All rows are
		// editable and deletable at project scope — origin only drives display.
		const hiddenSet = new Set(hiddenKeys ?? []);
		const inheritedKeys = new Set<string>();
		const inherited: ListItem[] = [];
		for (const d of builtIns) {
			if (hiddenSet.has(d.key)) {
				inheritedKeys.add(d.key);
				continue;
			}
			inherited.push({ ...d, isDefault: true, origin: "default" });
			inheritedKeys.add(d.key);
		}
		for (const w of workspaceCustoms ?? []) {
			if (inheritedKeys.has(w.key)) continue;
			if (hiddenSet.has(w.key)) {
				inheritedKeys.add(w.key);
				continue;
			}
			inherited.push({ ...w, isDefault: true, origin: "workspace" });
			inheritedKeys.add(w.key);
		}

		// Apply project-level overlays. For matching inherited keys, project
		// values override name/color/category; row origin stays inherited so
		// the badge tells the user where it came from. For new keys, the row
		// is project-origin.
		const result: ListItem[] = [];
		const projectByKey = new Map<string, CustomItem>();
		for (const p of projectCustoms ?? []) projectByKey.set(p.key, p);

		for (const row of inherited) {
			const override = projectByKey.get(row.key);
			result.push(
				override
					? { ...row, ...override, isDefault: true, origin: row.origin }
					: row,
			);
		}
		for (const p of projectCustoms ?? []) {
			if (inheritedKeys.has(p.key)) continue;
			if (hiddenSet.has(p.key)) continue;
			result.push({ ...p, isDefault: false, origin: "project" });
		}
		return result;
	}

	const types = mergeProjectScope(
		defaultTypes,
		workspaceSettings?.customTypes,
		project.customTypes,
		undefined,
	);
	const statusesUnorderedRaw = mergeProjectScope(
		defaultStatuses,
		workspaceSettings?.customStatuses,
		project.customStatuses,
		project.hiddenStatusKeys,
	);
	// Tag each status with its effective category for the row UI.
	const statusesUnordered = statusesUnorderedRaw.map((s) => ({
		...s,
		category: resolveStatusCategory(s, s.key),
	}));
	// Apply persisted display order so the reorderable list reflects the same
	// sequence the rest of the app sees (kanban columns, list groups, etc).
	const statuses = applyOrder(statusesUnordered, project.customStatusOrder);

	const handleStatusCategoryChange = async (
		key: string,
		category: StatusCategory,
	) => {
		try {
			await updateStatus({ projectId, key, category });
		} catch {
			toast.error("Failed to update category");
		}
	};

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
		if (!item) return;
		// Types still don't support project-level hiding (no `hiddenTypeKeys`
		// on the schema yet). Status rows of any origin are deletable —
		// inherited keys go onto `hiddenStatusKeys`, project-only keys come
		// off `customStatuses`.
		if (section === "types" && item.isDefault) return;
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

			{section === "statuses" && item.category && (
				<Select
					value={item.category}
					onValueChange={(value) =>
						handleStatusCategoryChange(item.key, value as StatusCategory)
					}
				>
					<SelectTrigger className="h-7 w-32 text-xs">
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						{STATUS_CATEGORY_ORDER.map((cat) => (
							<SelectItem key={cat} value={cat} className="text-xs">
								{STATUS_CATEGORY_LABELS[cat]}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			)}

			{/* Origin badge — shows where the row came from. Purely informational
			   now that all rows can be edited and deleted at project scope.
			   Deleting an inherited row hides it from this project only via
			   the project's `hiddenStatusKeys` exclusion list — the workspace
			   status itself stays put for other projects. */}
			{item.origin === "default" ? (
				<span
					className="text-[10px] text-muted-foreground/50"
					title="Built-in default — hiding it only affects this project"
				>
					default
				</span>
			) : item.origin === "workspace" ? (
				<span
					className="text-[10px] text-muted-foreground/60"
					title="Inherited from workspace — hiding it only affects this project"
				>
					workspace
				</span>
			) : null}

			{/* Types can't be hidden at project level (no schema field for it
			   yet) — only project-origin types are deletable. Statuses can be
			   deleted regardless of origin: inherited rows go into the
			   project's hiddenStatusKeys. */}
			{(section === "statuses" || item.origin === "project") && (
				<button
					type="button"
					onClick={() => handleRequestDelete(section, item.key)}
					className="text-muted-foreground/50 hover:text-destructive transition-colors"
					title={
						item.origin === "project"
							? "Delete from project"
							: "Hide from this project"
					}
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
