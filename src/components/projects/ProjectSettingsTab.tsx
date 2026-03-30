"use client";

import { useMutation } from "convex/react";
import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
};

// ── Color presets ────────────────────────────────────────────────────────

const COLOR_PRESETS = [
	"#ef4444",
	"#f97316",
	"#eab308",
	"#22c55e",
	"#06b6d4",
	"#3b82f6",
	"#8b5cf6",
	"#ec4899",
	"#6b7280",
];

// ── Editable list section ────────────────────────────────────────────────

function ConfigSection({
	title,
	description,
	defaults,
	items,
	onSave,
}: {
	title: string;
	description: string;
	defaults: CustomItem[];
	items: CustomItem[];
	onSave: (items: CustomItem[]) => void;
}) {
	const [localItems, setLocalItems] = useState<CustomItem[]>(items);
	const [isAdding, setIsAdding] = useState(false);
	const [newKey, setNewKey] = useState("");
	const [newName, setNewName] = useState("");
	const [newColor, setNewColor] = useState("#6b7280");
	const hasChanges = JSON.stringify(localItems) !== JSON.stringify(items);

	const handleAdd = () => {
		const key = newKey.trim().toLowerCase().replace(/\s+/g, "_");
		const name = newName.trim();
		if (!key || !name) return;
		if (
			localItems.some((i) => i.key === key) ||
			defaults.some((d) => d.key === key)
		) {
			toast.error("A type with this key already exists");
			return;
		}
		setLocalItems([...localItems, { key, name, color: newColor }]);
		setNewKey("");
		setNewName("");
		setNewColor("#6b7280");
		setIsAdding(false);
	};

	const handleRemove = (key: string) => {
		setLocalItems(localItems.filter((i) => i.key !== key));
	};

	const handleSave = () => {
		onSave(localItems);
		toast.success(`${title} updated`);
	};

	const handleReset = () => {
		setLocalItems([]);
		onSave([]);
		toast.success(`Reset to workspace defaults`);
	};

	const allItems = [
		...defaults.map((d) => ({ ...d, isDefault: true })),
		...localItems
			.filter((i) => !defaults.some((d) => d.key === i.key))
			.map((i) => ({ ...i, isDefault: false })),
	];

	return (
		<section className="space-y-3">
			<div>
				<h3 className="text-sm font-medium">{title}</h3>
				<p className="text-xs text-muted-foreground mt-0.5">{description}</p>
			</div>

			<div className="space-y-1">
				{allItems.map((item) => (
					<div
						key={item.key}
						className="flex items-center gap-2 px-3 py-2 rounded-md border border-border/40 bg-card/50"
					>
						<span
							className="h-3 w-3 rounded-full shrink-0"
							style={{ backgroundColor: item.color }}
						/>
						<span className="text-xs font-mono text-muted-foreground w-24 shrink-0">
							{item.key}
						</span>
						<span className="text-sm flex-1">{item.name}</span>
						{item.isDefault ? (
							<span className="text-[10px] text-muted-foreground/50">
								default
							</span>
						) : (
							<button
								type="button"
								onClick={() => handleRemove(item.key)}
								className="text-muted-foreground/50 hover:text-destructive transition-colors"
							>
								<Trash2 className="h-3.5 w-3.5" />
							</button>
						)}
					</div>
				))}
			</div>

			{isAdding ? (
				<div className="flex items-center gap-2 px-3 py-2 rounded-md border border-dashed border-border/60">
					<div className="flex gap-1">
						{COLOR_PRESETS.map((c) => (
							<button
								key={c}
								type="button"
								onClick={() => setNewColor(c)}
								className={cn(
									"h-4 w-4 rounded-full border transition-transform",
									newColor === c
										? "scale-125 border-foreground"
										: "border-transparent hover:scale-110",
								)}
								style={{ backgroundColor: c }}
							/>
						))}
					</div>
					<Input
						value={newKey}
						onChange={(e) => setNewKey(e.target.value)}
						placeholder="key"
						className="h-7 text-xs w-20 font-mono"
					/>
					<Input
						value={newName}
						onChange={(e) => setNewName(e.target.value)}
						placeholder="Display name"
						className="h-7 text-xs flex-1"
						onKeyDown={(e) => e.key === "Enter" && handleAdd()}
					/>
					<Button size="sm" className="h-7 text-xs" onClick={handleAdd}>
						Add
					</Button>
					<Button
						size="sm"
						variant="ghost"
						className="h-7 text-xs"
						onClick={() => setIsAdding(false)}
					>
						Cancel
					</Button>
				</div>
			) : (
				<Button
					variant="ghost"
					size="sm"
					className="h-7 gap-1 text-xs text-muted-foreground"
					onClick={() => setIsAdding(true)}
				>
					<Plus className="h-3.5 w-3.5" />
					Add custom {title.toLowerCase().replace(/s$/, "")}
				</Button>
			)}

			{hasChanges && (
				<div className="flex items-center gap-2 pt-1">
					<Button size="sm" className="h-7 text-xs" onClick={handleSave}>
						Save changes
					</Button>
					<Button
						size="sm"
						variant="ghost"
						className="h-7 text-xs text-muted-foreground"
						onClick={handleReset}
					>
						Reset to defaults
					</Button>
				</div>
			)}
		</section>
	);
}

// ── Main component ──────────────────────────────────────────────────────

export function ProjectSettingsTab({
	projectId,
	project,
}: {
	projectId: Id<"projects">;
	project: ProjectData;
}) {
	const updateProject = useMutation(api.projects.update);

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

	return (
		<div className="space-y-8">
			<div>
				<h2 className="text-lg font-semibold">Project settings</h2>
				<p className="text-sm text-muted-foreground mt-1">
					Customize issue types and statuses for this project. Custom items are
					added on top of workspace defaults.
				</p>
			</div>

			<ConfigSection
				title="Issue types"
				description="Add project-specific issue types beyond workspace defaults. Use a unique key (e.g. epic, story, task)."
				defaults={defaultTypes}
				items={project.customTypes ?? []}
				onSave={(items) =>
					updateProject({
						projectId,
						customTypes: items.length > 0 ? items : undefined,
					})
				}
			/>

			<ConfigSection
				title="Statuses"
				description="Add project-specific statuses. These appear alongside workspace defaults in issue dropdowns."
				defaults={defaultStatuses}
				items={project.customStatuses ?? []}
				onSave={(items) =>
					updateProject({
						projectId,
						customStatuses: items.length > 0 ? items : undefined,
					})
				}
			/>
		</div>
	);
}
