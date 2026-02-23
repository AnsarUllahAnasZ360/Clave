"use client";

import { useMutation, useQuery } from "convex/react";
import { formatDistanceToNow } from "date-fns";
import {
	ExternalLink,
	FileText,
	Globe,
	Link2,
	Pencil,
	PenTool,
	Plus,
	Search,
	Trash2,
	X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";
import { useWorkspace } from "@/components/providers/workspace-context";
import { Button } from "@/components/ui/button";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

type ResourcesSectionProps = {
	projectId: Id<"projects">;
	workspaceId: Id<"workspaces">;
	resources?: { url: string; label: string }[];
	onUpdateResources: (
		resources: { url: string; label: string }[],
	) => Promise<void>;
};

type LinkedItem = {
	id: string;
	title: string;
	type: "document" | "whiteboard";
	emoji?: string;
	updatedAt?: number;
	createdAt: number;
};

export function ResourcesSection({
	projectId,
	workspaceId,
	resources = [],
	onUpdateResources,
}: ResourcesSectionProps) {
	const documents = useQuery(api.documents.listByProject, { projectId });
	const whiteboards = useQuery(api.whiteboards.listByProject, { projectId });

	const linkedItems = useMemo<LinkedItem[]>(() => {
		const result: LinkedItem[] = [];
		if (documents) {
			for (const doc of documents) {
				result.push({
					id: doc._id,
					title: doc.title,
					type: "document",
					emoji: doc.icon,
					updatedAt: doc.updatedAt,
					createdAt: doc._creationTime,
				});
			}
		}
		if (whiteboards) {
			for (const wb of whiteboards) {
				result.push({
					id: wb._id,
					title: wb.title,
					type: "whiteboard",
					emoji: wb.icon,
					updatedAt: wb.updatedAt,
					createdAt: wb._creationTime,
				});
			}
		}
		return result.sort(
			(a, b) => (b.updatedAt ?? b.createdAt) - (a.updatedAt ?? a.createdAt),
		);
	}, [documents, whiteboards]);

	const hasContent = resources.length > 0 || linkedItems.length > 0;

	return (
		<section>
			<div className="flex items-center justify-between mb-3">
				<h3 className="text-sm font-medium text-muted-foreground">Resources</h3>
			</div>

			{!hasContent && (
				<div className="rounded-lg border border-dashed border-border/70 bg-muted/30 px-4 py-6 text-center text-sm text-muted-foreground">
					Add links and documents to keep project context accessible.
				</div>
			)}

			{resources.length > 0 && (
				<div className="space-y-0.5 mb-3">
					{resources.map((resource, index) => (
						<ExternalLinkRow
							key={`${resource.url}-${index}`}
							resource={resource}
							onEdit={(updated) => {
								const next = [...resources];
								next[index] = updated;
								onUpdateResources(next);
							}}
							onDelete={() => {
								const next = resources.filter((_, i) => i !== index);
								onUpdateResources(next);
							}}
						/>
					))}
				</div>
			)}

			{linkedItems.length > 0 && (
				<div className="space-y-0.5 mb-3">
					{linkedItems.map((item) => (
						<LinkedDocumentRow key={item.id} item={item} />
					))}
				</div>
			)}

			<div className="flex items-center gap-2 mt-2">
				<AddLinkButton
					resources={resources}
					onUpdateResources={onUpdateResources}
				/>
				<LinkDocumentButton
					projectId={projectId}
					workspaceId={workspaceId}
					linkedItemIds={linkedItems.map((i) => i.id)}
				/>
			</div>
		</section>
	);
}

function ExternalLinkRow({
	resource,
	onEdit,
	onDelete,
}: {
	resource: { url: string; label: string };
	onEdit: (updated: { url: string; label: string }) => void;
	onDelete: () => void;
}) {
	const [isEditing, setIsEditing] = useState(false);
	const [editUrl, setEditUrl] = useState(resource.url);
	const [editLabel, setEditLabel] = useState(resource.label);

	const handleSave = useCallback(() => {
		if (!editUrl.trim()) {
			toast.error("URL is required");
			return;
		}
		onEdit({ url: editUrl.trim(), label: editLabel.trim() || editUrl.trim() });
		setIsEditing(false);
	}, [editUrl, editLabel, onEdit]);

	if (isEditing) {
		return (
			<div className="rounded-md border border-border p-2 space-y-2">
				<input
					type="url"
					value={editUrl}
					onChange={(e) => setEditUrl(e.target.value)}
					placeholder="https://..."
					className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
					onKeyDown={(e) => {
						if (e.key === "Enter") handleSave();
						if (e.key === "Escape") setIsEditing(false);
					}}
				/>
				<input
					type="text"
					value={editLabel}
					onChange={(e) => setEditLabel(e.target.value)}
					placeholder="Label (optional)"
					className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
					onKeyDown={(e) => {
						if (e.key === "Enter") handleSave();
						if (e.key === "Escape") setIsEditing(false);
					}}
				/>
				<div className="flex justify-end gap-2">
					<Button
						variant="ghost"
						size="sm"
						className="h-7 text-xs"
						onClick={() => setIsEditing(false)}
					>
						Cancel
					</Button>
					<Button size="sm" className="h-7 text-xs" onClick={handleSave}>
						Save
					</Button>
				</div>
			</div>
		);
	}

	return (
		<div className="group flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted/50 transition-colors">
			<Globe className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
			<a
				href={resource.url}
				target="_blank"
				rel="noopener noreferrer"
				className="flex-1 min-w-0 flex items-center gap-1.5 text-sm text-foreground hover:underline underline-offset-2 truncate"
			>
				<span className="truncate">{resource.label || resource.url}</span>
				<ExternalLink className="h-3 w-3 text-muted-foreground shrink-0" />
			</a>
			<div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
				<button
					type="button"
					onClick={() => {
						setEditUrl(resource.url);
						setEditLabel(resource.label);
						setIsEditing(true);
					}}
					className="rounded p-1 hover:bg-muted transition-colors"
				>
					<Pencil className="h-3 w-3 text-muted-foreground" />
				</button>
				<button
					type="button"
					onClick={onDelete}
					className="rounded p-1 hover:bg-muted transition-colors"
				>
					<Trash2 className="h-3 w-3 text-muted-foreground" />
				</button>
			</div>
		</div>
	);
}

const TYPE_ICONS = {
	document: FileText,
	whiteboard: PenTool,
} as const;

function LinkedDocumentRow({ item }: { item: LinkedItem }) {
	const router = useRouter();
	const { workspaceSlug, orgSlug } = useWorkspace();
	const unlinkDocument = useMutation(api.documents.unlinkFromProject);
	const unlinkWhiteboard = useMutation(api.whiteboards.unlinkFromProject);

	const Icon = TYPE_ICONS[item.type];
	const timeAgo = formatDistanceToNow(
		new Date(item.updatedAt ?? item.createdAt),
		{
			addSuffix: true,
		},
	);

	const handleClick = useCallback(() => {
		if (item.type === "document") {
			// biome-ignore lint/suspicious/noExplicitAny: route created in STORY-010
			router.push(`/${orgSlug}/${workspaceSlug}/docs/${item.id}` as any);
			return;
		}
		// biome-ignore lint/suspicious/noExplicitAny: route created in STORY-011
		router.push(`/${orgSlug}/${workspaceSlug}/boards/${item.id}` as any);
	}, [item, router, workspaceSlug, orgSlug]);

	const handleUnlink = useCallback(
		async (e: React.MouseEvent) => {
			e.stopPropagation();
			try {
				if (item.type === "document") {
					await unlinkDocument({
						documentId: item.id as Id<"documents">,
					});
				} else {
					await unlinkWhiteboard({
						whiteboardId: item.id as Id<"whiteboards">,
					});
				}
				toast.success("Resource unlinked");
			} catch {
				toast.error("Failed to unlink resource");
			}
		},
		[item, unlinkDocument, unlinkWhiteboard],
	);

	return (
		/* biome-ignore lint/a11y/useSemanticElements: row is keyboard-accessible and contains nested action button */
		<div
			className={cn(
				"group flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted/50 transition-colors cursor-pointer",
			)}
			onClick={handleClick}
			onKeyDown={(e) => e.key === "Enter" && handleClick()}
			role="button"
			tabIndex={0}
		>
			{item.emoji ? (
				<span className="text-sm leading-none shrink-0">{item.emoji}</span>
			) : (
				<Icon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
			)}
			<span className="flex-1 min-w-0 text-sm text-foreground truncate">
				{item.title}
			</span>
			<span className="text-xs text-muted-foreground shrink-0">{timeAgo}</span>
			<button
				type="button"
				onClick={handleUnlink}
				className="opacity-0 group-hover:opacity-100 rounded p-1 hover:bg-muted transition-opacity"
			>
				<X className="h-3 w-3 text-muted-foreground" />
			</button>
		</div>
	);
}

function AddLinkButton({
	resources,
	onUpdateResources,
}: {
	resources: { url: string; label: string }[];
	onUpdateResources: (
		resources: { url: string; label: string }[],
	) => Promise<void>;
}) {
	const [isOpen, setIsOpen] = useState(false);
	const [url, setUrl] = useState("");
	const [label, setLabel] = useState("");

	const handleAdd = useCallback(async () => {
		if (!url.trim()) {
			toast.error("URL is required");
			return;
		}
		try {
			await onUpdateResources([
				...resources,
				{ url: url.trim(), label: label.trim() || url.trim() },
			]);
			setUrl("");
			setLabel("");
			setIsOpen(false);
			toast.success("Link added");
		} catch {
			toast.error("Failed to add link");
		}
	}, [url, label, resources, onUpdateResources]);

	return (
		<Popover open={isOpen} onOpenChange={setIsOpen}>
			<PopoverTrigger asChild>
				<Button
					variant="ghost"
					size="sm"
					className="h-7 gap-1 text-xs text-muted-foreground"
				>
					<Link2 className="h-3.5 w-3.5" />
					Add link
				</Button>
			</PopoverTrigger>
			<PopoverContent className="w-80 p-3" align="start">
				<div className="space-y-2">
					<p className="text-sm font-medium text-foreground">
						Add external link
					</p>
					<input
						type="url"
						value={url}
						onChange={(e) => setUrl(e.target.value)}
						placeholder="https://..."
						className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
						onKeyDown={(e) => {
							if (e.key === "Enter") handleAdd();
							if (e.key === "Escape") setIsOpen(false);
						}}
					/>
					<input
						type="text"
						value={label}
						onChange={(e) => setLabel(e.target.value)}
						placeholder="Label (optional)"
						className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
						onKeyDown={(e) => {
							if (e.key === "Enter") handleAdd();
							if (e.key === "Escape") setIsOpen(false);
						}}
					/>
					<div className="flex justify-end gap-2">
						<Button
							variant="ghost"
							size="sm"
							className="h-7 text-xs"
							onClick={() => setIsOpen(false)}
						>
							Cancel
						</Button>
						<Button size="sm" className="h-7 text-xs" onClick={handleAdd}>
							Add
						</Button>
					</div>
				</div>
			</PopoverContent>
		</Popover>
	);
}

type PickerItem = {
	id: string;
	title: string;
	type: "document" | "whiteboard";
	emoji?: string;
};

function LinkDocumentButton({
	projectId,
	workspaceId,
	linkedItemIds,
}: {
	projectId: Id<"projects">;
	workspaceId: Id<"workspaces">;
	linkedItemIds: string[];
}) {
	const [isOpen, setIsOpen] = useState(false);
	const [search, setSearch] = useState("");
	const [typeFilter, setTypeFilter] = useState<
		"all" | "document" | "whiteboard"
	>("all");

	const allDocs = useQuery(
		api.documents.listByWorkspace,
		isOpen ? { workspaceId } : "skip",
	);
	const allWhiteboards = useQuery(
		api.whiteboards.listByWorkspace,
		isOpen ? { workspaceId } : "skip",
	);

	const linkDocument = useMutation(api.documents.linkToProject);
	const linkWhiteboard = useMutation(api.whiteboards.linkToProject);

	const linkedSet = useMemo(() => new Set(linkedItemIds), [linkedItemIds]);

	const availableItems = useMemo<PickerItem[]>(() => {
		const items: PickerItem[] = [];

		if (allDocs) {
			for (const doc of allDocs) {
				if (!linkedSet.has(doc._id)) {
					items.push({
						id: doc._id,
						title: doc.title,
						type: "document",
						emoji: doc.icon,
					});
				}
			}
		}
		if (allWhiteboards) {
			for (const wb of allWhiteboards) {
				if (!linkedSet.has(wb._id)) {
					items.push({
						id: wb._id,
						title: wb.title,
						type: "whiteboard",
						emoji: wb.icon,
					});
				}
			}
		}

		return items;
	}, [allDocs, allWhiteboards, linkedSet]);

	const filtered = useMemo(() => {
		let items = availableItems;
		if (typeFilter !== "all") {
			items = items.filter((i) => i.type === typeFilter);
		}
		if (search.trim()) {
			const q = search.toLowerCase();
			items = items.filter((i) => i.title.toLowerCase().includes(q));
		}
		return items.slice(0, 20);
	}, [availableItems, typeFilter, search]);

	const handleSelect = useCallback(
		async (item: PickerItem) => {
			try {
				if (item.type === "document") {
					await linkDocument({
						documentId: item.id as Id<"documents">,
						projectId,
					});
				} else {
					await linkWhiteboard({
						whiteboardId: item.id as Id<"whiteboards">,
						projectId,
					});
				}
				toast.success(`${item.title} linked to project`);
				setIsOpen(false);
				setSearch("");
			} catch {
				toast.error("Failed to link resource");
			}
		},
		[projectId, linkDocument, linkWhiteboard],
	);

	const TYPE_FILTERS: { id: typeof typeFilter; label: string }[] = [
		{ id: "all", label: "All" },
		{ id: "document", label: "Docs" },
		{ id: "whiteboard", label: "Boards" },
	];

	return (
		<Popover
			open={isOpen}
			onOpenChange={(open) => {
				setIsOpen(open);
				if (!open) {
					setSearch("");
					setTypeFilter("all");
				}
			}}
		>
			<PopoverTrigger asChild>
				<Button
					variant="ghost"
					size="sm"
					className="h-7 gap-1 text-xs text-muted-foreground"
				>
					<Plus className="h-3.5 w-3.5" />
					Link resource
				</Button>
			</PopoverTrigger>
			<PopoverContent className="w-80 p-0" align="start">
				<div className="p-2 border-b border-border">
					<div className="flex items-center gap-2 rounded-md border border-border bg-background px-2.5 py-1.5">
						<Search className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
						<input
							type="text"
							value={search}
							onChange={(e) => setSearch(e.target.value)}
							placeholder="Search resources..."
							className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
						/>
					</div>
					<div className="flex items-center gap-1 mt-2">
						{TYPE_FILTERS.map((f) => (
							<button
								key={f.id}
								type="button"
								onClick={() => setTypeFilter(f.id)}
								className={cn(
									"px-2 py-0.5 rounded-full text-xs font-medium transition-colors",
									typeFilter === f.id
										? "bg-primary text-primary-foreground"
										: "bg-muted text-muted-foreground hover:text-foreground",
								)}
							>
								{f.label}
							</button>
						))}
					</div>
				</div>
				<div className="max-h-60 overflow-y-auto p-1">
					{filtered.length === 0 ? (
						<p className="px-3 py-4 text-center text-sm text-muted-foreground">
							{search.trim()
								? "No matching resources found."
								: "No resources available to link."}
						</p>
					) : (
						filtered.map((item) => {
							const Icon = TYPE_ICONS[item.type];
							return (
								<button
									key={item.id}
									type="button"
									onClick={() => handleSelect(item)}
									className="w-full flex items-center gap-2 rounded-md px-2.5 py-2 text-sm text-foreground hover:bg-muted transition-colors text-left"
								>
									{item.emoji ? (
										<span className="text-sm leading-none shrink-0">
											{item.emoji}
										</span>
									) : (
										<Icon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
									)}
									<span className="flex-1 min-w-0 truncate">{item.title}</span>
									<span className="text-[10px] text-muted-foreground uppercase">
										{item.type === "document" ? "Doc" : "Board"}
									</span>
								</button>
							);
						})
					)}
				</div>
			</PopoverContent>
		</Popover>
	);
}
