"use client";

import { Plus, TrashSimple } from "@phosphor-icons/react/dist/ssr";
import { useMutation, useQuery } from "convex/react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useWorkspaceOptional } from "@/components/providers/workspace-context";
import {
	useCurrentUser,
	useWorkspaceLabels,
	useWorkspaceMembers,
} from "@/components/providers/workspace-data-context";
import { Button } from "@/components/ui/button";
import { ColorPicker } from "@/components/ui/color-picker";
import { Input } from "@/components/ui/input";
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
	const updateTypes = useMutation(api.workspaceSettings.updateTypes);
	const updateStatuses = useMutation(api.workspaceSettings.updateStatuses);
	const updatePriorities = useMutation(api.workspaceSettings.updatePriorities);
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
	const statuses = mergeDefaults(defaultStatusItems, settings?.customStatuses);
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
		const key = newItemKey.trim().toLowerCase().replace(/\s+/g, "_");
		const name = newItemName.trim();
		if (!key || !name) {
			toast.error("Key and name are required");
			return;
		}
		const items =
			section === "types"
				? types
				: section === "statuses"
					? statuses
					: priorities;
		if (items.some((i) => i.key === key)) {
			toast.error("An item with this key already exists");
			return;
		}
		const updated = [
			...items.map(({ isDefault, ...rest }) => rest),
			{ key, name, color: newItemColor },
		];
		try {
			if (section === "types")
				await updateTypes({ workspaceId, customTypes: updated });
			else if (section === "statuses")
				await updateStatuses({ workspaceId, customStatuses: updated });
			else await updatePriorities({ workspaceId, customPriorities: updated });
			toast.success(`Added "${name}"`);
			setNewItemKey("");
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
		const items =
			section === "types"
				? types
				: section === "statuses"
					? statuses
					: priorities;
		const updated = items
			.filter((i) => i.key !== key)
			.map(({ isDefault, ...rest }) => rest);
		try {
			if (section === "types")
				await updateTypes({ workspaceId, customTypes: updated });
			else if (section === "statuses")
				await updateStatuses({ workspaceId, customStatuses: updated });
			else await updatePriorities({ workspaceId, customPriorities: updated });
			toast.success("Removed");
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
		const items =
			section === "types"
				? types
				: section === "statuses"
					? statuses
					: priorities;
		const updated = items.map((item) =>
			item.key === key
				? {
						key: item.key,
						name: newName || item.name,
						color: newColor ?? item.color,
					}
				: { key: item.key, name: item.name, color: item.color },
		);
		try {
			if (section === "types") {
				await updateTypes({ workspaceId, customTypes: updated });
			} else if (section === "statuses") {
				await updateStatuses({ workspaceId, customStatuses: updated });
			} else {
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
		const items =
			section === "types"
				? types
				: section === "statuses"
					? statuses
					: priorities;
		const updated = items.map((item) =>
			item.key === key
				? { key: item.key, name: item.name, color: newColor }
				: { key: item.key, name: item.name, color: item.color },
		);
		try {
			if (section === "types") {
				await updateTypes({ workspaceId, customTypes: updated });
			} else if (section === "statuses") {
				await updateStatuses({ workspaceId, customStatuses: updated });
			} else {
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

	const getIconColor = (
		section: "types" | "statuses" | "priorities",
		key: string,
	) => {
		if (section === "types") return getTypeConfig(key).color;
		if (section === "statuses") return getStatusConfig(key).color;
		return getPriorityConfig(key).color;
	};

	const renderItemList = (
		section: "types" | "statuses" | "priorities",
		items: { key: string; name: string; color: string; isDefault: boolean }[],
	) => (
		<div className="space-y-2">
			{items.map((item) => {
				const Icon = getIcon(section, item.key);
				const isEditingThis = editingKey === `${section}-${item.key}`;
				return (
					<div
						key={item.key}
						className="flex items-center gap-3 rounded-2xl bg-muted/20 px-4 py-3 group"
					>
						{/* Icon colored by item color */}
						<Icon className="h-4 w-4 shrink-0" style={{ color: item.color }} />

						{/* Color picker */}
						<ColorPicker
							color={item.color}
							onColorChange={(color) =>
								handleColorChange(section, item.key, color)
							}
							disabled={!isAdmin}
						/>

						{/* Name (editable) */}
						{isEditingThis ? (
							<Input
								ref={editInputRef}
								value={editName}
								onChange={(e) => setEditName(e.target.value)}
								onBlur={() =>
									handleSaveItem(section, item.key, editName.trim())
								}
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

						{/* Key (shown as badge) */}
						<span className="text-[11px] font-mono text-muted-foreground bg-muted/50 rounded px-1.5 py-0.5">
							{item.key}
						</span>

						{/* Spacer */}
						<div className="flex-1" />

						{/* Delete button (visible on hover) */}
						{isAdmin && (
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
			})}
		</div>
	);

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
				<Input
					ref={newItemRef}
					value={newItemKey}
					onChange={(e) => setNewItemKey(e.target.value)}
					placeholder="key (e.g. epic)"
					className="h-7 text-xs w-24 font-mono"
				/>
				<Input
					value={newItemName}
					onChange={(e) => setNewItemName(e.target.value)}
					placeholder="Display name"
					className="h-7 text-xs flex-1"
					onKeyDown={(e) => e.key === "Enter" && handleAddItem(section)}
				/>
				<Button
					size="sm"
					className="h-7 text-xs px-3"
					onClick={() => handleAddItem(section)}
					disabled={!newItemKey.trim() || !newItemName.trim()}
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
		</div>
	);
}
