"use client";

import {
	FileText,
	ListBullets,
	PenNib,
	Plus,
	SquaresFour,
} from "@phosphor-icons/react/dist/ssr";
import { useMutation, useQuery } from "convex/react";
import { useRouter } from "next/navigation";
import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";
import { RagSyncDashboard } from "@/components/ai/RagSyncDashboard";
import { useWorkspace } from "@/components/providers/workspace-context";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

type ContentFilter = "all" | "docs" | "boards";
type SortOption = "recent" | "title" | "type";
type ViewMode = "cards" | "list";

type KnowledgeItem = {
	id: string;
	title: string;
	type: "document" | "whiteboard";
	icon: typeof FileText;
	emoji?: string;
	lastEdited: number;
	createdAt: number;
};

const FILTERS: { id: ContentFilter; label: string }[] = [
	{ id: "all", label: "All" },
	{ id: "docs", label: "Docs" },
	{ id: "boards", label: "Boards" },
];

function getStoredView(): ViewMode {
	if (typeof window === "undefined") return "cards";
	return (localStorage.getItem("clave:knowledge-view") as ViewMode) ?? "cards";
}

function getStoredSort(): SortOption {
	if (typeof window === "undefined") return "recent";
	return (
		(localStorage.getItem("clave:knowledge-sort") as SortOption) ?? "recent"
	);
}

type KnowledgeTabProps = {
	projectId: Id<"projects">;
	workspaceId: Id<"workspaces">;
};

export function KnowledgeTab({ projectId, workspaceId }: KnowledgeTabProps) {
	const router = useRouter();
	const { workspaceSlug } = useWorkspace();

	const documents = useQuery(api.documents.listByProject, { projectId });
	const whiteboards = useQuery(api.whiteboards.listByProject, { projectId });

	const createDocument = useMutation(api.documents.create);
	const createWhiteboard = useMutation(api.whiteboards.create);

	const [filter, setFilter] = useState<ContentFilter>("all");
	const [view, setView] = useState<ViewMode>(getStoredView);
	const [sort, setSort] = useState<SortOption>(getStoredSort);

	const items = useMemo<KnowledgeItem[]>(() => {
		const result: KnowledgeItem[] = [];

		if (documents) {
			for (const doc of documents) {
				result.push({
					id: doc._id,
					title: doc.title,
					type: "document",
					icon: FileText,
					emoji: doc.icon,
					lastEdited: doc.updatedAt ?? doc._creationTime,
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
					icon: PenNib,
					emoji: wb.icon,
					lastEdited: wb.updatedAt ?? wb._creationTime,
					createdAt: wb._creationTime,
				});
			}
		}

		return result;
	}, [documents, whiteboards]);

	const filtered = useMemo(() => {
		if (filter === "all") return items;
		const typeMap: Record<ContentFilter, KnowledgeItem["type"] | null> = {
			all: null,
			docs: "document",
			boards: "whiteboard",
		};
		const target = typeMap[filter];
		return target ? items.filter((i) => i.type === target) : items;
	}, [items, filter]);

	const sorted = useMemo(() => {
		const copy = [...filtered];
		switch (sort) {
			case "recent":
				copy.sort((a, b) => b.lastEdited - a.lastEdited);
				break;
			case "title":
				copy.sort((a, b) => a.title.localeCompare(b.title));
				break;
			case "type":
				copy.sort(
					(a, b) => a.type.localeCompare(b.type) || b.lastEdited - a.lastEdited,
				);
				break;
		}
		return copy;
	}, [filtered, sort]);

	const setViewPersist = useCallback((v: ViewMode) => {
		setView(v);
		localStorage.setItem("clave:knowledge-view", v);
	}, []);

	const setSortPersist = useCallback((s: SortOption) => {
		setSort(s);
		localStorage.setItem("clave:knowledge-sort", s);
	}, []);

	const handleNewDocument = useCallback(async () => {
		try {
			const docId = await createDocument({
				workspaceId,
				projectId,
				title: "Untitled",
			});
			// biome-ignore lint/suspicious/noExplicitAny: route created in STORY-010
			router.push(`/${workspaceSlug}/docs/${docId}` as any);
		} catch {
			toast.error("Failed to create document");
		}
	}, [createDocument, workspaceId, projectId, workspaceSlug, router]);

	const handleNewWhiteboard = useCallback(async () => {
		try {
			const boardId = await createWhiteboard({
				workspaceId,
				projectId,
				title: "Untitled",
			});
			// biome-ignore lint/suspicious/noExplicitAny: route created in STORY-011
			router.push(`/${workspaceSlug}/boards/${boardId}` as any);
		} catch {
			toast.error("Failed to create whiteboard");
		}
	}, [
		createWhiteboard,
		workspaceId,
		projectId,
		workspaceSlug,
		router,
	]);

	const handleItemClick = useCallback(
		(item: KnowledgeItem) => {
			if (item.type === "document") {
				// biome-ignore lint/suspicious/noExplicitAny: route created in STORY-010
				router.push(`/${workspaceSlug}/docs/${item.id}` as any);
				return;
			}
			// biome-ignore lint/suspicious/noExplicitAny: route created in STORY-011
			router.push(`/${workspaceSlug}/boards/${item.id}` as any);
		},
		[router, workspaceSlug],
	);

	const isLoading = documents === undefined || whiteboards === undefined;
	if (isLoading) {
		return (
			<div className="space-y-4">
				<div className="flex items-center justify-between">
					<div className="flex gap-1.5">
						{[1, 2, 3].map((i) => (
							<div
								key={i}
								className="h-7 w-16 animate-pulse rounded-full bg-muted"
							/>
						))}
					</div>
				</div>
				<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
					{[1, 2, 3, 4, 5, 6].map((i) => (
						<div
							key={i}
							className="h-24 animate-pulse rounded-xl border border-border bg-muted"
						/>
					))}
				</div>
			</div>
		);
	}

	return (
		<div className="space-y-6">
			<RagSyncDashboard projectId={projectId} />
			<div className="border-t border-border/60" />

			<div className="flex items-center justify-between gap-3">
				<div className="flex items-center gap-1.5">
					{FILTERS.map((f) => (
						<button
							key={f.id}
							type="button"
							onClick={() => setFilter(f.id)}
							className={cn(
								"px-3 py-1 rounded-full text-xs font-medium transition-colors",
								filter === f.id
									? "bg-primary text-primary-foreground"
									: "bg-muted text-muted-foreground hover:text-foreground hover:bg-muted/80",
							)}
						>
							{f.label}
							{f.id !== "all" && (
								<span className="ml-1 opacity-60">
									{f.id === "docs"
										? (documents?.length ?? 0)
										: (whiteboards?.length ?? 0)}
								</span>
							)}
						</button>
					))}
				</div>

				<div className="flex items-center gap-2">
					<DropdownMenu>
						<DropdownMenuTrigger asChild>
							<Button
								variant="ghost"
								size="sm"
								className="h-7 text-xs text-muted-foreground"
							>
								Sort:{" "}
								{sort === "recent"
									? "Recent"
									: sort === "title"
										? "Title"
										: "Type"}
							</Button>
						</DropdownMenuTrigger>
						<DropdownMenuContent align="end">
							<DropdownMenuItem onClick={() => setSortPersist("recent")}>
								Recent
							</DropdownMenuItem>
							<DropdownMenuItem onClick={() => setSortPersist("title")}>
								Title
							</DropdownMenuItem>
							<DropdownMenuItem onClick={() => setSortPersist("type")}>
								Type
							</DropdownMenuItem>
						</DropdownMenuContent>
					</DropdownMenu>

					<div className="flex items-center rounded-md border border-border/60">
						<button
							type="button"
							onClick={() => setViewPersist("cards")}
							className={cn(
								"p-1.5 rounded-l-md",
								view === "cards" ? "bg-muted" : "hover:bg-muted/50",
							)}
						>
							<SquaresFour className="h-3.5 w-3.5" />
						</button>
						<button
							type="button"
							onClick={() => setViewPersist("list")}
							className={cn(
								"p-1.5 rounded-r-md",
								view === "list" ? "bg-muted" : "hover:bg-muted/50",
							)}
						>
							<ListBullets className="h-3.5 w-3.5" />
						</button>
					</div>

					<DropdownMenu>
						<DropdownMenuTrigger asChild>
							<Button
								variant="outline"
								size="sm"
								className="h-7 gap-1.5 text-xs"
							>
								<Plus className="h-3.5 w-3.5" />
								New
							</Button>
						</DropdownMenuTrigger>
						<DropdownMenuContent align="end">
							<DropdownMenuItem onClick={handleNewDocument}>
								<FileText className="mr-2 h-4 w-4" />
								New document
							</DropdownMenuItem>
							<DropdownMenuItem onClick={handleNewWhiteboard}>
								<PenNib className="mr-2 h-4 w-4" />
								New board
							</DropdownMenuItem>
						</DropdownMenuContent>
					</DropdownMenu>
				</div>
			</div>

			{sorted.length === 0 ? (
				<section className="rounded-2xl border border-dashed border-border/70 bg-muted/30 px-4 py-10 text-center text-sm text-muted-foreground">
					{filter === "all"
						? "No knowledge items yet. Create a document or board to get started."
						: `No ${filter === "docs" ? "documents" : "boards"} yet.`}
				</section>
			) : view === "cards" ? (
				<div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
					{sorted.map((item) => (
						<KnowledgeCard
							key={item.id}
							item={item}
							onClick={() => handleItemClick(item)}
						/>
					))}
				</div>
			) : (
				<div className="rounded-lg border border-border">
					<table className="w-full text-sm">
						<thead>
							<tr className="border-b border-border text-left text-xs text-muted-foreground">
								<th className="px-3 py-2 font-medium">Title</th>
								<th className="px-3 py-2 font-medium">Type</th>
								<th className="px-3 py-2 font-medium">Last edited</th>
							</tr>
						</thead>
						<tbody>
							{sorted.map((item) => (
								<tr
									key={item.id}
									className="border-b border-border/50 last:border-0 hover:bg-muted/50 cursor-pointer transition-colors"
									onClick={() => handleItemClick(item)}
									onKeyDown={(e) => e.key === "Enter" && handleItemClick(item)}
								>
									<td className="px-3 py-2.5">
										<div className="flex items-center gap-2">
											{item.emoji ? (
												<span className="text-base leading-none shrink-0">
													{item.emoji}
												</span>
											) : (
												<item.icon className="h-4 w-4 shrink-0 text-muted-foreground" />
											)}
											<span className="truncate font-medium">{item.title}</span>
										</div>
									</td>
									<td className="px-3 py-2.5">
										<TypeBadge type={item.type} />
									</td>
									<td className="px-3 py-2.5 text-muted-foreground">
										{formatRelativeDate(item.lastEdited)}
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			)}
		</div>
	);
}

function KnowledgeCard({
	item,
	onClick,
}: {
	item: KnowledgeItem;
	onClick: () => void;
}) {
	return (
		<button
			type="button"
			onClick={onClick}
			className="group flex flex-col gap-2 rounded-xl border border-border bg-card p-4 text-left transition-colors hover:bg-muted/50"
		>
			<div className="flex items-start justify-between gap-2">
				<div className="flex items-center gap-2 min-w-0">
					{item.emoji ? (
						<span className="text-base leading-none shrink-0">
							{item.emoji}
						</span>
					) : (
						<item.icon className="h-4 w-4 shrink-0 text-muted-foreground" />
					)}
					<span className="truncate text-sm font-medium">{item.title}</span>
				</div>
				<TypeBadge type={item.type} />
			</div>
			<div className="flex items-center justify-between text-xs text-muted-foreground">
				<span>{formatRelativeDate(item.lastEdited)}</span>
			</div>
		</button>
	);
}

function TypeBadge({ type }: { type: KnowledgeItem["type"] }) {
	const label = type === "document" ? "Doc" : "Board";
	return (
		<span className="shrink-0 rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
			{label}
		</span>
	);
}

function formatRelativeDate(timestamp: number): string {
	const diff = Date.now() - timestamp;
	const minutes = Math.floor(diff / 60000);
	if (minutes < 1) return "Just now";
	if (minutes < 60) return `${minutes}m ago`;
	const hours = Math.floor(minutes / 60);
	if (hours < 24) return `${hours}h ago`;
	const days = Math.floor(hours / 24);
	if (days < 7) return `${days}d ago`;
	return new Date(timestamp).toLocaleDateString();
}
