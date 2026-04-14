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
import {
	DotsSixVertical,
	Plus,
	TrashSimple,
} from "@phosphor-icons/react/dist/ssr";
import { useMutation, useQuery } from "convex/react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useWorkspaceOptional } from "@/components/providers/workspace-context";
import {
	useCurrentUser,
	useWorkspaceLabels,
	useWorkspaceMembers,
} from "@/components/providers/workspace-data-context";
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
import {
	DEFAULT_ISSUE_TYPES,
	DEFAULT_PRIORITIES,
	DEFAULT_STATUSES,
	getPriorityConfig,
	getStatusConfig,
	getTypeConfig,
} from "@/lib/issue-config";
import { cn } from "@/lib/utils";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { PaneDescription, PaneTitle } from "./settings-shared";
export function TypesSettingsPane() {
	const workspace = useWorkspaceOptional();
	const workspaceId = workspace?.workspaceId;
	const settings = useQuery(
		api.workspaceSettings.get,
		workspaceId ? { workspaceId } : "skip",
	);
	const labels = useWorkspaceLabels();
	const members = useWorkspaceMembers();
	const currentUser = useCurrentUser();
	const _updateTypes = useMutation(api.workspaceSettings.updateTypes);
	const _updateStatuses = useMutation(api.workspaceSettings.updateStatuses);
	const updatePriorities = useMutation(api.workspaceSettings.updatePriorities);
	const createCustomType = useMutation(api.workspaceSettings.createCustomType);
	const updateCustomType = useMutation(api.workspaceSettings.updateCustomType);
	const deleteCustomType = useMutation(api.workspaceSettings.deleteCustomType);
	const createCustomStatus = useMutation(
		api.workspaceSettings.createCustomStatus,
	);
	const updateCustomStatus = useMutation(
		api.workspaceSettings.updateCustomStatus,
	);
	const deleteCustomStatus = useMutation(
		api.workspaceSettings.deleteCustomStatus,
	);
	const reorderStatuses = useMutation(api.workspaceSettings.reorderStatuses);
	const createLabel = useMutation(api.labels.create);
	const updateLabel = useMutation(api.labels.update);
	const removeLabel = useMutation(api.labels.remove);

	const currentMember = members?.find((m) => m.userId === currentUser?._id);
	// Allow both admins and members to customize types/statuses
	const isAdmin = Boolean(currentMember);

	const typeNav = [
		{ id: "types", label: "Issue types" },
		{ id: "statuses", label: "Statuses" },
		{ id: "priorities", label: "Priorities" },
		{ id: "labels", label: "Labels" },
	] as const;
	const [activeSection, setActiveSection] =
		useState<(typeof typeNav)[number]["id"]>("types");

	// Default hex colors for settings display (workspace settings store hex, not Tailwind classes)
	const defaultTypeItems = DEFAULT_ISSUE_TYPES.map((t) => ({
		key: t.key,
		name: t.name,
		color:
			t.key === "issue"
				? "#6b7280"
				: t.key === "bug"
					? "#ef4444"
					: t.key === "improvement"
						? "#f59e0b"
						: "#8b5cf6",
	}));
	const defaultStatusItems = DEFAULT_STATUSES.map((s) => ({
		key: s.key,
		name: s.name,
		color:
			s.key === "triage"
				? "#f97316"
				: s.key === "backlog"
					? "#6b7280"
					: s.key === "todo"
						? "#a3a3a3"
						: s.key === "in_progress"
							? "#3b82f6"
							: s.key === "in_review"
								? "#8b5cf6"
								: s.key === "done"
									? "#10b981"
									: "#ef4444",
	}));
	const defaultPriorityItems = DEFAULT_PRIORITIES.map((p) => ({
		key: p.key,
		name: p.name,
		color:
			p.key === "no_priority"
				? "#6b7280"
				: p.key === "low"
					? "#3b82f6"
					: p.key === "medium"
						? "#f59e0b"
						: p.key === "high"
							? "#f97316"
							: "#ef4444",
	}));

	const mergeDefaults = (
		defaults: { key: string; name: string; color: string }[],
		custom: { key: string; name: string; color: string }[] | undefined,
	) => {
		if (!custom || custom.length === 0)
			return defaults.map((d) => ({ ...d, isDefault: true }));
		// Override defaults + append custom-added items
		const merged = defaults.map((def) => {
			const override = custom.find((c) => c.key === def.key);
			return { ...(override ?? def), isDefault: true };
		});
		// Add items that don't exist in defaults (user-created)
		const customOnly = custom.filter(
			(c) => !defaults.some((d) => d.key === c.key),
		);
		return [...merged, ...customOnly.map((c) => ({ ...c, isDefault: false }))];
	};

	const types = mergeDefaults(defaultTypeItems, settings?.customTypes);
	// Apply the persisted drag-to-reorder order so the settings UI shows the
	// same sequence the app (kanban, list, pickers) sees. Without this, the
	// optimistic local order from SortableStatusList gets clobbered as soon as
	// the server round-trip replaces `items` on the next render.
	const statuses = applyOrder(
		mergeDefaults(defaultStatusItems, settings?.customStatuses),
		settings?.customStatusOrder,
	);
	const priorities = mergeDefaults(
		defaultPriorityItems,
		settings?.customPriorities,
	);

	// State for adding new items
	const [addingSection, setAddingSection] = useState<
		"types" | "statuses" | "priorities" | null
	>(null);
	const [newItemKey, setNewItemKey] = useState("");
	const [newItemName, setNewItemName] = useState("");
	const [newItemColor, setNewItemColor] = useState("#6b7280");
	const newItemRef = useRef<HTMLInputElement>(null);

	useEffect(() => {
		if (addingSection && newItemRef.current) {
			newItemRef.current.focus();
		}
	}, [addingSection]);

	// Editing state
	const [editingKey, setEditingKey] = useState<string | null>(null);
	const [editName, setEditName] = useState("");
	const editInputRef = useRef<HTMLInputElement>(null);

	const [deleteState, setDeleteState] = useState<{
		section: "types" | "statuses";
		key: string;
		name: string;
	} | null>(null);
	const [replacementKey, setReplacementKey] = useState<string>("");

	// Label creation state
	const [isCreatingLabel, setIsCreatingLabel] = useState(false);
	const [newLabelName, setNewLabelName] = useState("");
	const [newLabelColor, setNewLabelColor] = useState("#3b82f6");
	const [newLabelDescription, setNewLabelDescription] = useState("");
	const newLabelInputRef = useRef<HTMLInputElement>(null);

	// Label edit state
	const [editingLabelId, setEditingLabelId] = useState<string | null>(null);
	const [editLabelName, setEditLabelName] = useState("");
	const editLabelInputRef = useRef<HTMLInputElement>(null);

	useEffect(() => {
		if (editingKey && editInputRef.current) {
			editInputRef.current.focus();
			editInputRef.current.select();
		}
	}, [editingKey]);

	useEffect(() => {
		if (isCreatingLabel && newLabelInputRef.current) {
			newLabelInputRef.current.focus();
		}
	}, [isCreatingLabel]);

	useEffect(() => {
		if (editingLabelId && editLabelInputRef.current) {
			editLabelInputRef.current.focus();
			editLabelInputRef.current.select();
		}
	}, [editingLabelId]);

	const handleAddItem = async (
		section: "types" | "statuses" | "priorities",
	) => {
		if (!workspaceId) return;
		const name = newItemName.trim();
		if (!name) {
			toast.error("Label is required");
			return;
		}
		try {
			if (section === "types") {
				await createCustomType({ workspaceId, name, color: newItemColor });
			} else if (section === "statuses") {
				await createCustomStatus({ workspaceId, name, color: newItemColor });
			} else {
				const key = newItemKey.trim().toLowerCase().replace(/\s+/g, "_");
				if (!key) {
					toast.error("Key is required");
					return;
				}
				if (priorities.some((i) => i.key === key)) {
					toast.error("An item with this key already exists");
					return;
				}
				const updated = [
					...priorities.map(({ isDefault, ...rest }) => rest),
					{ key, name, color: newItemColor },
				];
				await updatePriorities({ workspaceId, customPriorities: updated });
				setNewItemKey("");
			}
			toast.success(`Added "${name}"`);
			setNewItemName("");
			setNewItemColor("#6b7280");
			setAddingSection(null);
		} catch {
			toast.error("Failed to add item");
		}
	};

	const handleDeleteItem = async (
		section: "types" | "statuses" | "priorities",
		key: string,
	) => {
		if (!workspaceId) return;
		try {
			if (section === "types" || section === "statuses") {
				const items = section === "types" ? types : statuses;
				const item = items.find((i) => i.key === key);
				if (!item) return;
				if (item.isDefault) {
					toast.error("Default items can’t be deleted");
					return;
				}
				const firstReplacement = items.find((i) => i.key !== key)?.key ?? "";
				setReplacementKey(firstReplacement);
				setDeleteState({ section, key, name: item.name });
				return;
			}

			const updated = priorities
				.filter((i) => i.key !== key)
				.map(({ isDefault, ...rest }) => rest);
			await updatePriorities({ workspaceId, customPriorities: updated });
			toast.success("Removed");
		} catch {
			toast.error("Failed to remove item");
		}
	};

	const handleConfirmDelete = async () => {
		if (!workspaceId) return;
		if (!deleteState) return;
		if (!replacementKey) {
			toast.error("Choose a replacement");
			return;
		}
		try {
			if (deleteState.section === "types") {
				await deleteCustomType({
					workspaceId,
					key: deleteState.key,
					replacementKey,
				});
			} else {
				await deleteCustomStatus({
					workspaceId,
					key: deleteState.key,
					replacementKey,
				});
			}
			toast.success("Removed");
			setDeleteState(null);
			setReplacementKey("");
		} catch {
			toast.error("Failed to remove item");
		}
	};

	const handleSaveItem = async (
		section: "types" | "statuses" | "priorities",
		key: string,
		newName: string,
		newColor?: string,
	) => {
		if (!workspaceId) return;
		try {
			if (section === "types") {
				await updateCustomType({
					workspaceId,
					key,
					name: newName || undefined,
					color: newColor,
				});
			} else if (section === "statuses") {
				await updateCustomStatus({
					workspaceId,
					key,
					name: newName || undefined,
					color: newColor,
				});
			} else {
				const updated = priorities.map((item) =>
					item.key === key
						? {
								key: item.key,
								name: newName || item.name,
								color: newColor ?? item.color,
							}
						: { key: item.key, name: item.name, color: item.color },
				);
				await updatePriorities({ workspaceId, customPriorities: updated });
			}
			toast.success("Updated successfully");
		} catch {
			toast.error("Failed to update");
		}
		setEditingKey(null);
	};

	const handleColorChange = async (
		section: "types" | "statuses" | "priorities",
		key: string,
		newColor: string,
	) => {
		if (!workspaceId) return;
		try {
			if (section === "types") {
				await updateCustomType({ workspaceId, key, color: newColor });
			} else if (section === "statuses") {
				await updateCustomStatus({ workspaceId, key, color: newColor });
			} else {
				const updated = priorities.map((item) =>
					item.key === key
						? { key: item.key, name: item.name, color: newColor }
						: { key: item.key, name: item.name, color: item.color },
				);
				await updatePriorities({ workspaceId, customPriorities: updated });
			}
		} catch {
			toast.error("Failed to update color");
		}
	};

	const handleCreateLabel = async () => {
		if (!workspaceId || !newLabelName.trim()) return;
		try {
			await createLabel({
				workspaceId,
				name: newLabelName.trim(),
				color: newLabelColor,
				description: newLabelDescription.trim() || undefined,
			});
			toast.success("Label created");
			setNewLabelName("");
			setNewLabelColor("#3b82f6");
			setNewLabelDescription("");
			setIsCreatingLabel(false);
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Failed to create label",
			);
		}
	};

	const handleUpdateLabel = async (
		labelId: Id<"labels">,
		updates: { name?: string; color?: string; description?: string },
	) => {
		try {
			await updateLabel({ labelId, ...updates });
			toast.success("Label updated");
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Failed to update label",
			);
		}
		setEditingLabelId(null);
	};

	const handleRemoveLabel = async (labelId: Id<"labels">) => {
		try {
			await removeLabel({ labelId });
			toast.success("Label removed");
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Failed to remove label",
			);
		}
	};

	const getIcon = (
		section: "types" | "statuses" | "priorities",
		key: string,
	) => {
		if (section === "types") return getTypeConfig(key).icon;
		if (section === "statuses") return getStatusConfig(key).icon;
		return getPriorityConfig(key).icon;
	};

	const _getIconColor = (
		section: "types" | "statuses" | "priorities",
		key: string,
	) => {
		if (section === "types") return getTypeConfig(key).color;
		if (section === "statuses") return getStatusConfig(key).color;
		return getPriorityConfig(key).color;
	};

	type ListItem = {
		key: string;
		name: string;
		color: string;
		isDefault: boolean;
	};

	const renderRow = (
		section: "types" | "statuses" | "priorities",
		item: ListItem,
		dnd?: {
			setNodeRef: (el: HTMLElement | null) => void;
			style: React.CSSProperties;
			attributes: Record<string, unknown>;
			listeners: Record<string, unknown> | undefined;
			isDragging: boolean;
		},
	) => {
		const Icon = getIcon(section, item.key);
		const isEditingThis = editingKey === `${section}-${item.key}`;
		return (
			<div
				ref={dnd?.setNodeRef}
				style={dnd?.style}
				className={cn(
					"flex items-center gap-3 rounded-2xl bg-muted/20 px-4 py-3 group",
					dnd?.isDragging && "opacity-60 ring-1 ring-primary/40",
				)}
			>
				{/* Drag handle (statuses only) */}
				{dnd && isAdmin && (
					<button
						type="button"
						aria-label="Reorder"
						className="cursor-grab active:cursor-grabbing text-muted-foreground/40 hover:text-muted-foreground transition-colors"
						{...dnd.attributes}
						{...dnd.listeners}
					>
						<DotsSixVertical className="h-4 w-4" />
					</button>
				)}

				{/* Icon colored by item color */}
				<Icon className="h-4 w-4 shrink-0" style={{ color: item.color }} />

				{/* Color picker */}
				<ColorPicker
					color={item.color}
					onColorChange={(color) => handleColorChange(section, item.key, color)}
					disabled={!isAdmin}
				/>

				{/* Name (editable) */}
				{isEditingThis ? (
					<Input
						ref={editInputRef}
						value={editName}
						onChange={(e) => setEditName(e.target.value)}
						onBlur={() => handleSaveItem(section, item.key, editName.trim())}
						onKeyDown={(e) => {
							if (e.key === "Enter") {
								handleSaveItem(section, item.key, editName.trim());
							}
							if (e.key === "Escape") {
								setEditingKey(null);
							}
						}}
						className="h-7 w-32 text-sm"
					/>
				) : (
					<span
						className={cn(
							"text-sm font-medium",
							isAdmin && "cursor-pointer hover:underline",
						)}
						onClick={() => {
							if (!isAdmin) return;
							setEditingKey(`${section}-${item.key}`);
							setEditName(item.name);
						}}
						onKeyDown={() => {}}
						role={isAdmin ? "button" : undefined}
						tabIndex={isAdmin ? 0 : undefined}
					>
						{item.name}
					</span>
				)}

				{item.isDefault ? (
					<span className="text-[11px] text-muted-foreground bg-muted/50 rounded px-1.5 py-0.5">
						Default
					</span>
				) : null}

				{/* Spacer */}
				<div className="flex-1" />

				{/* Delete button (visible on hover) */}
				{isAdmin && !item.isDefault && (
					<button
						type="button"
						onClick={() => handleDeleteItem(section, item.key)}
						className="text-muted-foreground/30 hover:text-destructive transition-colors opacity-0 group-hover:opacity-100"
						title="Remove item"
					>
						<TrashSimple className="h-3.5 w-3.5" />
					</button>
				)}
			</div>
		);
	};

	const renderItemList = (
		section: "types" | "statuses" | "priorities",
		items: ListItem[],
	) => {
		if (section === "statuses") {
			return (
				<SortableStatusList
					items={items}
					disabled={!isAdmin}
					onReorder={async (orderedKeys) => {
						if (!workspaceId) return;
						try {
							await reorderStatuses({ workspaceId, orderedKeys });
						} catch {
							toast.error("Failed to save status order");
						}
					}}
					renderRow={(item, dnd) => renderRow("statuses", item, dnd)}
				/>
			);
		}
		return (
			<div className="space-y-2">
				{items.map((item) => (
					<div key={item.key}>{renderRow(section, item)}</div>
				))}
			</div>
		);
	};

	const renderAddForm = (section: "types" | "statuses" | "priorities") => {
		if (!isAdmin) return null;
		if (addingSection !== section) {
			return (
				<button
					type="button"
					onClick={() => setAddingSection(section)}
					className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors mt-2"
				>
					<Plus className="h-3.5 w-3.5" />
					Add custom{" "}
					{section === "types"
						? "type"
						: section === "statuses"
							? "status"
							: "priority"}
				</button>
			);
		}
		return (
			<div className="flex items-center gap-2 rounded-lg border border-dashed border-border/60 px-3 py-2 mt-2">
				<ColorPicker color={newItemColor} onColorChange={setNewItemColor} />
				{section === "priorities" ? (
					<Input
						ref={newItemRef}
						value={newItemKey}
						onChange={(e) => setNewItemKey(e.target.value)}
						placeholder="key (e.g. epic)"
						className="h-7 text-xs w-24 font-mono"
					/>
				) : null}
				<Input
					ref={section === "priorities" ? undefined : newItemRef}
					value={newItemName}
					onChange={(e) => setNewItemName(e.target.value)}
					placeholder={section === "priorities" ? "Display name" : "Label"}
					className="h-7 text-xs flex-1"
					onKeyDown={(e) => e.key === "Enter" && handleAddItem(section)}
				/>
				<Button
					size="sm"
					className="h-7 text-xs px-3"
					onClick={() => handleAddItem(section)}
					disabled={
						section === "priorities"
							? !newItemKey.trim() || !newItemName.trim()
							: !newItemName.trim()
					}
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
		);
	};

	const renderLabelsSection = () => (
		<div className="space-y-4">
			<div className="flex items-center justify-between">
				<p className="text-sm font-semibold text-foreground">Labels</p>
				{isAdmin && (
					<button
						type="button"
						onClick={() => setIsCreatingLabel(true)}
						className="cursor-pointer text-muted-foreground hover:text-foreground"
					>
						<Plus className="h-4 w-4" />
					</button>
				)}
			</div>

			{isCreatingLabel && (
				<div className="space-y-3 rounded-2xl border border-primary/30 bg-primary/5 px-4 py-3">
					<div className="flex items-center gap-3">
						<ColorPicker
							color={newLabelColor}
							onColorChange={setNewLabelColor}
						/>
						<Input
							ref={newLabelInputRef}
							value={newLabelName}
							onChange={(e) => setNewLabelName(e.target.value)}
							placeholder="Label name"
							className="h-8 flex-1 text-sm"
							onKeyDown={(e) => {
								if (e.key === "Enter") handleCreateLabel();
								if (e.key === "Escape") setIsCreatingLabel(false);
							}}
						/>
					</div>
					<Input
						value={newLabelDescription}
						onChange={(e) => setNewLabelDescription(e.target.value)}
						placeholder="Description (optional)"
						className="h-8 text-sm"
					/>
					<div className="flex items-center gap-2">
						<Button
							size="sm"
							className="h-7 px-3 text-xs"
							onClick={handleCreateLabel}
							disabled={!newLabelName.trim()}
						>
							Create
						</Button>
						<Button
							variant="ghost"
							size="sm"
							className="h-7 px-3 text-xs"
							onClick={() => setIsCreatingLabel(false)}
						>
							Cancel
						</Button>
					</div>
				</div>
			)}

			<div className="space-y-2">
				{labels && labels.length > 0 ? (
					labels.map((label) => (
						<div
							key={label._id}
							className="flex items-center gap-4 rounded-2xl bg-muted/20 px-4 py-3"
						>
							<ColorPicker
								color={label.color}
								onColorChange={(color) =>
									handleUpdateLabel(label._id, { color })
								}
								disabled={!isAdmin}
							/>
							<div className="flex flex-1 items-center gap-4 text-sm text-foreground">
								{editingLabelId === label._id ? (
									<Input
										ref={editLabelInputRef}
										value={editLabelName}
										onChange={(e) => setEditLabelName(e.target.value)}
										onBlur={() =>
											handleUpdateLabel(label._id, {
												name: editLabelName.trim(),
											})
										}
										onKeyDown={(e) => {
											if (e.key === "Enter") {
												handleUpdateLabel(label._id, {
													name: editLabelName.trim(),
												});
											}
											if (e.key === "Escape") {
												setEditingLabelId(null);
											}
										}}
										className="h-7 w-40 text-sm"
									/>
								) : (
									<span
										className={cn(
											"font-medium",
											isAdmin && "cursor-pointer hover:underline",
										)}
										onClick={() => {
											if (!isAdmin) return;
											setEditingLabelId(label._id);
											setEditLabelName(label.name);
										}}
										onKeyDown={() => {}}
										role={isAdmin ? "button" : undefined}
										tabIndex={isAdmin ? 0 : undefined}
									>
										{label.name}
									</span>
								)}
								{label.description && (
									<span className="flex-1 text-left text-xs text-muted-foreground">
										{label.description}
									</span>
								)}
							</div>
							{isAdmin && (
								<button
									type="button"
									onClick={() => handleRemoveLabel(label._id)}
									className="cursor-pointer text-muted-foreground hover:text-destructive"
								>
									<TrashSimple className="h-4 w-4" />
								</button>
							)}
						</div>
					))
				) : (
					<p className="py-4 text-center text-sm text-muted-foreground">
						No labels yet. Create one to get started.
					</p>
				)}
			</div>
		</div>
	);

	if (!workspaceId) {
		return (
			<div className="flex h-full flex-col items-start justify-center gap-2">
				<PaneTitle className="text-xl">Types</PaneTitle>
				<PaneDescription>
					Select a workspace to configure types.
				</PaneDescription>
			</div>
		);
	}

	return (
		<div className="overflow-hidden rounded-2xl border border-border">
			<div className="grid lg:grid-cols-[220px_minmax(0,1fr)]">
				<div className="border-b border-border/60 bg-card/70 lg:border-b-0 lg:border-r">
					<div className="px-4 py-3 border-b border-border/60 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
						Customization
					</div>
					<div>
						{typeNav.map((item) => (
							<button
								key={item.id}
								type="button"
								onClick={() => setActiveSection(item.id)}
								className={cn(
									"flex w-full cursor-pointer items-center gap-2 px-4 py-3 text-sm transition",
									activeSection === item.id
										? "bg-primary/10 text-primary"
										: "text-muted-foreground hover:bg-muted/40",
								)}
							>
								{item.label}
							</button>
						))}
					</div>
				</div>

				<div className="space-y-6 bg-background/40 p-6">
					{activeSection === "types" && (
						<div className="space-y-4">
							<p className="text-sm font-semibold text-foreground">
								Issue types
							</p>
							<p className="text-xs text-muted-foreground">
								Customize display names, colors, and add custom types. Default
								types can be renamed but not deleted.
							</p>
							{renderItemList("types", types)}
							{renderAddForm("types")}
						</div>
					)}

					{activeSection === "statuses" && (
						<div className="space-y-4">
							<p className="text-sm font-semibold text-foreground">
								Issue statuses
							</p>
							<p className="text-xs text-muted-foreground">
								Customize display names, colors, and add custom statuses for
								your workflow. Default statuses can be renamed but not deleted.
							</p>
							{renderItemList("statuses", statuses)}
							{renderAddForm("statuses")}
						</div>
					)}

					{activeSection === "priorities" && (
						<div className="space-y-4">
							<p className="text-sm font-semibold text-foreground">
								Issue priorities
							</p>
							<p className="text-xs text-muted-foreground">
								Customize display names, colors, and add custom priority levels.
							</p>
							{renderItemList("priorities", priorities)}
							{renderAddForm("priorities")}
						</div>
					)}

					{activeSection === "labels" && renderLabelsSection()}
				</div>
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

type SortableItem = {
	key: string;
	name: string;
	color: string;
	isDefault: boolean;
};

function SortableStatusList({
	items,
	disabled,
	onReorder,
	renderRow,
}: {
	items: SortableItem[];
	disabled: boolean;
	onReorder: (orderedKeys: string[]) => void | Promise<void>;
	renderRow: (
		item: SortableItem,
		dnd: {
			setNodeRef: (el: HTMLElement | null) => void;
			style: React.CSSProperties;
			attributes: Record<string, unknown>;
			listeners: Record<string, unknown> | undefined;
			isDragging: boolean;
		},
	) => React.ReactNode;
}) {
	// Local optimistic copy so the list re-orders instantly on drop without
	// waiting for the mutation round-trip.
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

	if (disabled) {
		return (
			<div className="space-y-2">
				{localItems.map((item) => (
					<div key={item.key}>
						{renderRow(item, {
							setNodeRef: () => {},
							style: {},
							attributes: {},
							listeners: undefined,
							isDragging: false,
						})}
					</div>
				))}
			</div>
		);
	}

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
				<div className="space-y-2">
					{localItems.map((item) => (
						<SortableStatusRow
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

function SortableStatusRow({
	item,
	renderRow,
}: {
	item: SortableItem;
	renderRow: (
		item: SortableItem,
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
