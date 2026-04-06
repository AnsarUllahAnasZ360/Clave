"use client";

import {
	FileText,
	FunnelSimple,
	ListBullets,
	Plus,
	SquaresFour,
} from "@phosphor-icons/react/dist/ssr";
import { useMutation, useQuery } from "convex/react";
import { Copy, Ellipsis, Pencil, Share2, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { useWorkspace } from "@/components/providers/workspace-context";
import { useWorkspaceProjects } from "@/components/providers/workspace-data-context";
import { ShareDialog } from "@/components/share-dialog";
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
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuSeparator,
	ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

type SortOption = "recent" | "title" | "project";
type ViewMode = "cards" | "list";

function getStoredView(): ViewMode {
	if (typeof window === "undefined") return "cards";
	return (
		(localStorage.getItem("clave:workspace-docs-view") as ViewMode) ?? "cards"
	);
}

function getStoredSort(): SortOption {
	if (typeof window === "undefined") return "recent";
	return (
		(localStorage.getItem("clave:workspace-docs-sort") as SortOption) ??
		"recent"
	);
}

export function DocsContent() {
	const router = useRouter();
	const { workspaceId, workspaceSlug } = useWorkspace();

	const documents = useQuery(api.documents.listByWorkspace, { workspaceId });
	const projects = useWorkspaceProjects();
	const createDocument = useMutation(api.documents.create);
	const updateDocument = useMutation(api.documents.update);
	const removeDocument = useMutation(api.documents.remove);
	const duplicateDocument = useMutation(api.documents.duplicate);

	const [view, setView] = useState<ViewMode>(getStoredView);
	const [sort, setSort] = useState<SortOption>(getStoredSort);
	const [projectFilter, setProjectFilter] = useState<string>("all");
	const [isCreateOpen, setIsCreateOpen] = useState(false);
	const [newTitle, setNewTitle] = useState("");
	const [newProjectId, setNewProjectId] = useState<string>("");

	// Context menu state
	const [renamingId, setRenamingId] = useState<string | null>(null);
	const [renameValue, setRenameValue] = useState("");
	const [deleteTarget, setDeleteTarget] = useState<{
		id: Id<"documents">;
		title: string;
	} | null>(null);
	const [shareTarget, setShareTarget] = useState<Id<"documents"> | null>(null);
	const renameInputRef = useRef<HTMLInputElement>(null);

	// Build project name map
	const projectMap = useMemo(() => {
		const map = new Map<string, string>();
		if (projects) {
			for (const p of projects) {
				map.set(p._id, p.name);
			}
		}
		return map;
	}, [projects]);

	// Filter by project
	const filtered = useMemo(() => {
		if (!documents) return [];
		if (projectFilter === "all") return documents;
		return documents.filter((d) => d.projectId === projectFilter);
	}, [documents, projectFilter]);

	// Sort
	const sorted = useMemo(() => {
		const copy = [...filtered];
		switch (sort) {
			case "recent":
				copy.sort(
					(a, b) =>
						(b.updatedAt ?? b._creationTime) - (a.updatedAt ?? a._creationTime),
				);
				break;
			case "title":
				copy.sort((a, b) => a.title.localeCompare(b.title));
				break;
			case "project":
				copy.sort((a, b) => {
					const aName = a.projectId ? (projectMap.get(a.projectId) ?? "") : "";
					const bName = b.projectId ? (projectMap.get(b.projectId) ?? "") : "";
					return (
						aName.localeCompare(bName) ||
						(b.updatedAt ?? b._creationTime) - (a.updatedAt ?? a._creationTime)
					);
				});
				break;
		}
		return copy;
	}, [filtered, sort, projectMap]);

	const setViewPersist = useCallback((v: ViewMode) => {
		setView(v);
		localStorage.setItem("clave:workspace-docs-view", v);
	}, []);

	const setSortPersist = useCallback((s: SortOption) => {
		setSort(s);
		localStorage.setItem("clave:workspace-docs-sort", s);
	}, []);

	const handleCreate = useCallback(async () => {
		const trimmed = newTitle.trim() || "Untitled";
		try {
			const docId = await createDocument({
				workspaceId,
				projectId: newProjectId ? (newProjectId as Id<"projects">) : undefined,
				title: trimmed,
			});
			setIsCreateOpen(false);
			setNewTitle("");
			setNewProjectId("");
			// biome-ignore lint/suspicious/noExplicitAny: route type
			router.push(`/${workspaceSlug}/docs/${docId}` as any);
		} catch {
			toast.error("Failed to create document");
		}
	}, [
		newTitle,
		newProjectId,
		createDocument,
		workspaceId,
		workspaceSlug,
		router,
	]);

	const handleDocClick = useCallback(
		(docId: string) => {
			if (renamingId === docId) return;
			// biome-ignore lint/suspicious/noExplicitAny: route type
			router.push(`/${workspaceSlug}/docs/${docId}` as any);
		},
		[workspaceSlug, router, renamingId],
	);

	// Action handlers
	const handleRenameStart = useCallback(
		(docId: string, currentTitle: string) => {
			setRenamingId(docId);
			setRenameValue(currentTitle);
			setTimeout(() => renameInputRef.current?.select(), 0);
		},
		[],
	);

	const handleRenameSave = useCallback(async () => {
		if (!renamingId) return;
		const trimmed = renameValue.trim();
		if (!trimmed) {
			setRenamingId(null);
			return;
		}
		try {
			await updateDocument({
				documentId: renamingId as Id<"documents">,
				title: trimmed,
			});
			toast.success("Document renamed");
		} catch {
			toast.error("Failed to rename document");
		}
		setRenamingId(null);
	}, [renamingId, renameValue, updateDocument]);

	const handleRenameCancel = useCallback(() => {
		setRenamingId(null);
	}, []);

	const handleCopyLink = useCallback(
		async (docId: string) => {
			const url = `${window.location.origin}/${workspaceSlug}/docs/${docId}`;
			try {
				await navigator.clipboard.writeText(url);
				toast.success("Link copied");
			} catch {
				toast.error("Failed to copy link");
			}
		},
		[workspaceSlug],
	);

	const handleDuplicate = useCallback(
		async (docId: Id<"documents">) => {
			try {
				await duplicateDocument({ documentId: docId });
				toast.success("Document duplicated");
			} catch {
				toast.error("Failed to duplicate document");
			}
		},
		[duplicateDocument],
	);

	const handleDelete = useCallback(async () => {
		if (!deleteTarget) return;
		try {
			await removeDocument({ documentId: deleteTarget.id });
			toast.success("Document deleted");
		} catch {
			toast.error("Failed to delete document");
		}
		setDeleteTarget(null);
	}, [deleteTarget, removeDocument]);

	const isLoading = documents === undefined || projects === undefined;

	// Shared menu items renderer
	const renderMenuItems = (
		docId: string,
		docTitle: string,
		variant: "context" | "dropdown",
	) => {
		const MenuItem = variant === "context" ? ContextMenuItem : DropdownMenuItem;
		const Separator =
			variant === "context" ? ContextMenuSeparator : DropdownMenuSeparator;
		return (
			<>
				<MenuItem onClick={() => handleRenameStart(docId, docTitle)}>
					<Pencil className="h-4 w-4" />
					Rename
				</MenuItem>
				<MenuItem onClick={() => handleCopyLink(docId)}>
					<Copy className="h-4 w-4" />
					Copy link
				</MenuItem>
				<MenuItem onClick={() => setShareTarget(docId as Id<"documents">)}>
					<Share2 className="h-4 w-4" />
					Share
				</MenuItem>
				<MenuItem onClick={() => handleDuplicate(docId as Id<"documents">)}>
					<Copy className="h-4 w-4" />
					Duplicate
				</MenuItem>
				<Separator />
				<MenuItem
					variant="destructive"
					onClick={() =>
						setDeleteTarget({ id: docId as Id<"documents">, title: docTitle })
					}
				>
					<Trash2 className="h-4 w-4" />
					Delete
				</MenuItem>
			</>
		);
	};

	return (
		<div className="flex flex-1 flex-col bg-background mx-2 my-2 border border-border rounded-lg min-w-0 overflow-y-auto">
			{/* Sticky header + toolbar */}
			<div className="sticky top-0 z-10 bg-background">
				{/* Header */}
				<div className="flex items-center justify-between border-b border-border px-6 py-4">
					<div className="flex items-center gap-3">
						<SidebarTrigger className="h-8 w-8 rounded-lg hover:bg-accent text-muted-foreground" />
						<h1 className="text-lg font-semibold">Documents</h1>
					</div>
					<Button
						variant="ghost"
						size="sm"
						onClick={() => setIsCreateOpen(true)}
					>
						<Plus className="h-4 w-4" />
						New document
					</Button>
				</div>

				{/* Toolbar */}
				<div className="flex items-center justify-between gap-3 px-6 py-3 border-b border-border/50">
					{/* Project filter */}
					<div className="flex items-center gap-2">
						<FunnelSimple className="h-4 w-4 text-muted-foreground" />
						<Select value={projectFilter} onValueChange={setProjectFilter}>
							<SelectTrigger className="h-7 w-[180px] text-xs">
								<SelectValue placeholder="All projects" />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="all">All projects</SelectItem>
								{projects?.map((p) => (
									<SelectItem key={p._id} value={p._id}>
										{p.name}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>

					{/* Right controls */}
					<div className="flex items-center gap-2">
						{/* Sort */}
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
											: "Project"}
								</Button>
							</DropdownMenuTrigger>
							<DropdownMenuContent align="end">
								<DropdownMenuItem onClick={() => setSortPersist("recent")}>
									Recent
								</DropdownMenuItem>
								<DropdownMenuItem onClick={() => setSortPersist("title")}>
									Title
								</DropdownMenuItem>
								<DropdownMenuItem onClick={() => setSortPersist("project")}>
									Project
								</DropdownMenuItem>
							</DropdownMenuContent>
						</DropdownMenu>

						{/* View toggle */}
						<div className="flex items-center rounded-md border border-border/60">
							<button
								type="button"
								onClick={() => setViewPersist("cards")}
								aria-label="Grid view"
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
								aria-label="List view"
								className={cn(
									"p-1.5 rounded-r-md",
									view === "list" ? "bg-muted" : "hover:bg-muted/50",
								)}
							>
								<ListBullets className="h-3.5 w-3.5" />
							</button>
						</div>
					</div>
				</div>
			</div>

			{/* Content */}
			<div className="flex-1 p-6">
				{isLoading ? (
					<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
						{[1, 2, 3, 4].map((i) => (
							<div
								key={i}
								className="h-24 animate-pulse rounded-xl border border-border bg-muted"
							/>
						))}
					</div>
				) : sorted.length === 0 ? (
					<section className="rounded-2xl border border-dashed border-border/70 bg-muted/30 px-4 py-10 text-center text-sm text-muted-foreground">
						{projectFilter === "all"
							? "No documents yet. Create your first document to get started."
							: "No documents in this project."}
					</section>
				) : view === "cards" ? (
					<div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
						{sorted.map((doc) => (
							<ContextMenu key={doc._id}>
								<ContextMenuTrigger asChild>
									<button
										type="button"
										className="group relative flex flex-col gap-2 rounded-xl border border-border bg-card p-4 text-left transition-colors hover:bg-muted/50 cursor-pointer"
										onClick={() => handleDocClick(doc._id)}
										onKeyDown={(e) =>
											e.key === "Enter" && handleDocClick(doc._id)
										}
										tabIndex={0}
									>
										<div className="flex items-start justify-between gap-2">
											<div className="flex items-center gap-2 min-w-0">
												{doc.icon ? (
													<span className="text-base leading-none shrink-0">
														{doc.icon}
													</span>
												) : (
													<FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
												)}
												{renamingId === doc._id ? (
													<input
														ref={renameInputRef}
														value={renameValue}
														onChange={(e) => setRenameValue(e.target.value)}
														onBlur={handleRenameSave}
														onKeyDown={(e) => {
															if (e.key === "Enter") handleRenameSave();
															if (e.key === "Escape") handleRenameCancel();
															e.stopPropagation();
														}}
														onClick={(e) => e.stopPropagation()}
														className="truncate text-sm font-medium bg-transparent border border-border rounded px-1 py-0.5 outline-none focus:ring-1 focus:ring-ring w-full"
													/>
												) : (
													<span className="truncate text-sm font-medium">
														{doc.title}
													</span>
												)}
											</div>
											{/* Action button */}
											<DropdownMenu>
												<DropdownMenuTrigger asChild>
													<button
														type="button"
														onClick={(e) => e.stopPropagation()}
														className="opacity-0 group-hover:opacity-100 shrink-0 rounded-md p-1 hover:bg-muted transition-opacity"
														aria-label="Document actions"
													>
														<Ellipsis className="h-4 w-4 text-muted-foreground" />
													</button>
												</DropdownMenuTrigger>
												<DropdownMenuContent
													align="end"
													onClick={(e) => e.stopPropagation()}
												>
													{renderMenuItems(doc._id, doc.title, "dropdown")}
												</DropdownMenuContent>
											</DropdownMenu>
										</div>
										{doc.projectId && projectMap.has(doc.projectId) && (
											<span className="self-start truncate max-w-[120px] rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
												{projectMap.get(doc.projectId)}
											</span>
										)}
										<div className="mt-auto border-t border-border/60" />
										<div className="flex items-center justify-between text-xs text-muted-foreground">
											<span className="truncate">
												{doc.lastEditorName
													? `Edited by ${doc.lastEditorName}`
													: doc.creatorName
														? `Created by ${doc.creatorName}`
														: formatRelativeDate(
																doc.updatedAt ?? doc._creationTime,
															)}
											</span>
											<Avatar className="size-5 border border-border">
												<AvatarImage
													src={doc.creatorImage ?? undefined}
													alt={doc.creatorName ?? "Creator"}
												/>
												<AvatarFallback className="text-[9px]">
													{getInitials(doc.creatorName)}
												</AvatarFallback>
											</Avatar>
										</div>
									</button>
								</ContextMenuTrigger>
								<ContextMenuContent>
									{renderMenuItems(doc._id, doc.title, "context")}
								</ContextMenuContent>
							</ContextMenu>
						))}
					</div>
				) : (
					<div className="rounded-lg border border-border">
						<table className="w-full text-sm">
							<thead>
								<tr className="border-b border-border text-left text-xs text-muted-foreground">
									<th className="px-3 py-2 font-medium">Title</th>
									<th className="px-3 py-2 font-medium">Owner</th>
									<th className="px-3 py-2 font-medium">Project</th>
									<th className="px-3 py-2 font-medium">Edited by</th>
									<th className="px-3 py-2 font-medium">Last edited</th>
									<th className="w-10 px-3 py-2" />
								</tr>
							</thead>
							<tbody>
								{sorted.map((doc) => (
									<ContextMenu key={doc._id}>
										<ContextMenuTrigger asChild>
											<tr
												className="group border-b border-border/50 last:border-0 hover:bg-muted/50 cursor-pointer transition-colors"
												onClick={() => handleDocClick(doc._id)}
												onKeyDown={(e) =>
													e.key === "Enter" && handleDocClick(doc._id)
												}
											>
												<td className="px-3 py-2.5">
													<div className="flex items-center gap-2">
														{doc.icon ? (
															<span className="text-base leading-none shrink-0">
																{doc.icon}
															</span>
														) : (
															<FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
														)}
														{renamingId === doc._id ? (
															<input
																ref={renameInputRef}
																value={renameValue}
																onChange={(e) => setRenameValue(e.target.value)}
																onBlur={handleRenameSave}
																onKeyDown={(e) => {
																	if (e.key === "Enter") handleRenameSave();
																	if (e.key === "Escape") handleRenameCancel();
																	e.stopPropagation();
																}}
																onClick={(e) => e.stopPropagation()}
																className="truncate font-medium bg-transparent border border-border rounded px-1 py-0.5 outline-none focus:ring-1 focus:ring-ring w-full max-w-xs"
															/>
														) : (
															<span className="truncate font-medium">
																{doc.title}
															</span>
														)}
													</div>
												</td>
												<td className="px-3 py-2.5">
													<div className="flex items-center gap-1.5 text-muted-foreground">
														<Avatar className="size-5 border border-border">
															<AvatarImage
																src={doc.creatorImage ?? undefined}
																alt={doc.creatorName ?? "Creator"}
															/>
															<AvatarFallback className="text-[9px]">
																{getInitials(doc.creatorName)}
															</AvatarFallback>
														</Avatar>
														<span className="truncate">
															{doc.creatorName ?? "Unknown"}
														</span>
													</div>
												</td>
												<td className="px-3 py-2.5 text-muted-foreground">
													{doc.projectId
														? (projectMap.get(doc.projectId) ?? "\u2014")
														: "\u2014"}
												</td>
												<td className="px-3 py-2.5">
													<div className="flex items-center gap-1.5 text-muted-foreground">
														{(doc.lastEditorName || doc.creatorName) && (
															<Avatar className="size-5 border border-border">
																<AvatarImage
																	src={
																		doc.lastEditorImage ??
																		doc.creatorImage ??
																		undefined
																	}
																	alt={
																		doc.lastEditorName ??
																		doc.creatorName ??
																		"Editor"
																	}
																/>
																<AvatarFallback className="text-[9px]">
																	{getInitials(
																		doc.lastEditorName ?? doc.creatorName,
																	)}
																</AvatarFallback>
															</Avatar>
														)}
														<span className="truncate">
															{doc.lastEditorName ??
																doc.creatorName ??
																"\u2014"}
														</span>
													</div>
												</td>
												<td className="px-3 py-2.5 text-muted-foreground">
													{formatRelativeDate(
														doc.updatedAt ?? doc._creationTime,
													)}
												</td>
												<td className="px-3 py-2.5">
													<DropdownMenu>
														<DropdownMenuTrigger asChild>
															<button
																type="button"
																onClick={(e) => e.stopPropagation()}
																className="opacity-0 group-hover:opacity-100 rounded-md p-1 hover:bg-muted transition-opacity"
																aria-label="Document actions"
															>
																<Ellipsis className="h-4 w-4 text-muted-foreground" />
															</button>
														</DropdownMenuTrigger>
														<DropdownMenuContent
															align="end"
															onClick={(e) => e.stopPropagation()}
														>
															{renderMenuItems(doc._id, doc.title, "dropdown")}
														</DropdownMenuContent>
													</DropdownMenu>
												</td>
											</tr>
										</ContextMenuTrigger>
										<ContextMenuContent>
											{renderMenuItems(doc._id, doc.title, "context")}
										</ContextMenuContent>
									</ContextMenu>
								))}
							</tbody>
						</table>
					</div>
				)}
			</div>

			{/* Create dialog */}
			<Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
				<DialogContent className="sm:max-w-md">
					<DialogHeader>
						<DialogTitle>New document</DialogTitle>
					</DialogHeader>
					<div className="space-y-4 py-2">
						<div className="space-y-2">
							<label
								htmlFor="doc-title"
								className="text-sm font-medium text-foreground"
							>
								Title
							</label>
							<input
								id="doc-title"
								value={newTitle}
								onChange={(e) => setNewTitle(e.target.value)}
								placeholder="Untitled"
								className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-ring"
								onKeyDown={(e) => {
									if (e.key === "Enter") handleCreate();
								}}
							/>
						</div>
						<div className="space-y-2">
							<label
								htmlFor="doc-project"
								className="text-sm font-medium text-foreground"
							>
								Project (optional)
							</label>
							<Select value={newProjectId} onValueChange={setNewProjectId}>
								<SelectTrigger id="doc-project" className="w-full">
									<SelectValue placeholder="No project" />
								</SelectTrigger>
								<SelectContent>
									{projects?.map((p) => (
										<SelectItem key={p._id} value={p._id}>
											{p.name}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
					</div>
					<DialogFooter>
						<Button variant="outline" onClick={() => setIsCreateOpen(false)}>
							Cancel
						</Button>
						<Button onClick={handleCreate}>Create</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			{/* Delete confirmation */}
			<AlertDialog
				open={deleteTarget !== null}
				onOpenChange={(open) => !open && setDeleteTarget(null)}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Delete document</AlertDialogTitle>
						<AlertDialogDescription>
							Are you sure you want to delete &quot;{deleteTarget?.title}&quot;?
							This action cannot be undone.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>Cancel</AlertDialogCancel>
						<AlertDialogAction variant="destructive" onClick={handleDelete}>
							Delete
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>

			{/* Share dialog */}
			{shareTarget && (
				<ShareDialog
					entityType="document"
					entityId={shareTarget}
					workspaceId={workspaceId}
					open={true}
					onOpenChange={(open) => !open && setShareTarget(null)}
				/>
			)}
		</div>
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

function getInitials(name?: string): string {
	if (!name) return "?";
	return name
		.split(" ")
		.map((part) => part[0])
		.join("")
		.toUpperCase()
		.slice(0, 2);
}
