"use client";

import { ListBullets, Plus, SquaresFour } from "@phosphor-icons/react/dist/ssr";
import { useMutation, useQuery } from "convex/react";
import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";
import { AddFileModal } from "@/components/projects/AddFileModal";
import { FilesTable } from "@/components/projects/FilesTable";
import { RecentFileCard } from "@/components/projects/RecentFileCard";
import { Skeleton } from "@/components/ui/skeleton";
import type { ProjectFile } from "@/lib/data/project-details";
import { cn } from "@/lib/utils";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

type ResourceFilter = "all" | "images" | "documents" | "pdfs" | "links";
type ViewMode = "grid" | "list";

function getStoredView(): ViewMode {
	if (typeof window === "undefined") return "grid";
	return (localStorage.getItem("clave:resources-view") as ViewMode) ?? "grid";
}

const FILTERS: { id: ResourceFilter; label: string }[] = [
	{ id: "all", label: "All" },
	{ id: "images", label: "Images" },
	{ id: "documents", label: "Documents" },
	{ id: "pdfs", label: "PDFs" },
	{ id: "links", label: "Links" },
];

function mapFileType(
	mimeType?: string,
	fileType?: string,
	name?: string,
): ProjectFile["type"] {
	if (fileType) {
		const ft = fileType.toLowerCase();
		if (ft === "figma" || ft === "fig") return "fig";
		if (ft === "pdf") return "pdf";
		if (ft === "zip") return "zip";
		if (ft === "doc" || ft === "google_docs" || ft === "word") return "doc";
	}
	if (mimeType) {
		if (mimeType === "application/pdf") return "pdf";
		if (
			mimeType === "application/zip" ||
			mimeType === "application/x-zip-compressed"
		)
			return "zip";
		if (
			mimeType === "application/msword" ||
			mimeType ===
				"application/vnd.openxmlformats-officedocument.wordprocessingml.document"
		)
			return "doc";
	}
	if (name) {
		const ext = name.includes(".") ? name.split(".").pop()?.toLowerCase() : "";
		if (ext === "pdf") return "pdf";
		if (ext === "zip") return "zip";
		if (ext === "fig" || ext === "figma") return "fig";
		if (ext === "doc" || ext === "docx") return "doc";
	}
	return "file";
}

function formatSize(bytes?: number): number {
	if (!bytes || bytes === 0) return 0;
	return +(bytes / (1024 * 1024)).toFixed(1);
}

function isImage(mimeType?: string | null): boolean {
	return Boolean(mimeType?.startsWith("image/"));
}

function isPdf(mimeType?: string | null, name?: string): boolean {
	if (mimeType === "application/pdf") return true;
	return name?.toLowerCase().endsWith(".pdf") ?? false;
}

function isLink(
	storageId?: string | null,
	externalUrl?: string | null,
): boolean {
	return Boolean(!storageId && externalUrl);
}

function isDocumentFile(mimeType?: string | null, name?: string): boolean {
	if (!mimeType && !name) return false;
	const docMimes = [
		"application/msword",
		"application/vnd.openxmlformats-officedocument.wordprocessingml.document",
		"application/vnd.ms-excel",
		"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
		"application/vnd.ms-powerpoint",
		"application/vnd.openxmlformats-officedocument.presentationml.presentation",
		"text/plain",
		"text/markdown",
	];
	if (mimeType && docMimes.includes(mimeType)) return true;
	const ext = name?.includes(".") ? name.split(".").pop()?.toLowerCase() : "";
	return ["doc", "docx", "xls", "xlsx", "ppt", "pptx", "txt", "md"].includes(
		ext ?? "",
	);
}

type ResourcesTabProps = {
	projectId: Id<"projects">;
	workspaceId: Id<"workspaces">;
};

export function ResourcesTab({ projectId, workspaceId }: ResourcesTabProps) {
	const files = useQuery(api.files.listByProject, { projectId });
	const removeMutation = useMutation(api.files.remove);
	const [isAddOpen, setIsAddOpen] = useState(false);
	const [filter, setFilter] = useState<ResourceFilter>("all");
	const [view, setView] = useState<ViewMode>(getStoredView);

	const setViewPersist = useCallback((v: ViewMode) => {
		setView(v);
		localStorage.setItem("clave:resources-view", v);
	}, []);

	const items: ProjectFile[] = useMemo(() => {
		if (!files) return [];
		return files.map((f) => ({
			id: f._id,
			name: f.name,
			type: mapFileType(
				f.mimeType ?? undefined,
				f.fileType ?? undefined,
				f.name,
			),
			sizeMB: formatSize(f.size ?? undefined),
			url: f.url ?? f.externalUrl ?? "#",
			addedBy: {
				id: f.uploadedBy,
				name: "Team member",
			},
			addedDate: new Date(f._creationTime),
			description: f.description ?? undefined,
			isLinkAsset: Boolean(f.externalUrl && !f.storageId),
		}));
	}, [files]);

	// Compute filter counts
	const counts = useMemo(() => {
		if (!files) return { images: 0, documents: 0, pdfs: 0, links: 0 };
		let images = 0;
		let documents = 0;
		let pdfs = 0;
		let links = 0;
		for (const f of files) {
			if (isLink(f.storageId as string | null, f.externalUrl)) {
				links++;
			} else if (isImage(f.mimeType)) {
				images++;
			} else if (isPdf(f.mimeType, f.name)) {
				pdfs++;
			} else if (isDocumentFile(f.mimeType, f.name)) {
				documents++;
			}
		}
		return { images, documents, pdfs, links };
	}, [files]);

	// Apply filter
	const filtered = useMemo(() => {
		if (!files) return [];
		if (filter === "all") return items;

		return items.filter((item, idx) => {
			const f = files[idx];
			if (!f) return false;
			switch (filter) {
				case "images":
					return isImage(f.mimeType);
				case "pdfs":
					return isPdf(f.mimeType, f.name);
				case "documents":
					return isDocumentFile(f.mimeType, f.name);
				case "links":
					return isLink(f.storageId as string | null, f.externalUrl);
				default:
					return true;
			}
		});
	}, [files, items, filter]);

	const handleFileClick = useCallback(
		(fileId: string) => {
			const file = files?.find((f) => f._id === fileId);
			if (!file) return;
			const url = file.url ?? file.externalUrl;
			if (url) {
				window.open(url, "_blank", "noopener,noreferrer");
			}
		},
		[files],
	);

	const handleDeleteFile = useCallback(
		async (fileId: string) => {
			try {
				await removeMutation({ fileId: fileId as Id<"files"> });
				toast.success("File deleted");
			} catch {
				toast.error("Failed to delete file");
			}
		},
		[removeMutation],
	);

	const handleEditFile = useCallback((_fileId: string) => {
		// Edit not implemented -- no-op
	}, []);

	if (files === undefined) {
		return (
			<div className="space-y-4">
				<div className="flex items-center justify-between">
					<div className="flex gap-1.5">
						{[1, 2, 3, 4, 5].map((i) => (
							<div
								key={i}
								className="h-7 w-16 animate-pulse rounded-full bg-muted"
							/>
						))}
					</div>
				</div>
				<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
					{[1, 2, 3].map((i) => (
						<Skeleton key={i} className="h-16 w-full rounded-2xl" />
					))}
				</div>
			</div>
		);
	}

	return (
		<div className="space-y-4">
			{/* Toolbar */}
			<div className="flex items-center justify-between gap-3">
				{/* Filter chips */}
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
								<span className="ml-1 opacity-60">{counts[f.id]}</span>
							)}
						</button>
					))}
				</div>

				{/* Right controls */}
				<div className="flex items-center gap-2">
					{/* View toggle */}
					<div className="flex items-center rounded-md border border-border/60">
						<button
							type="button"
							onClick={() => setViewPersist("grid")}
							className={cn(
								"p-1.5 rounded-l-md",
								view === "grid" ? "bg-muted" : "hover:bg-muted/50",
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

					{/* Add file button */}
					<button
						type="button"
						onClick={() => setIsAddOpen(true)}
						className="flex items-center gap-1.5 rounded-lg border border-border/60 bg-transparent px-3 py-1 text-xs font-medium text-foreground hover:bg-muted/50 transition-colors"
					>
						<Plus className="h-3.5 w-3.5" />
						Add file
					</button>
				</div>
			</div>

			{/* Content */}
			{filtered.length === 0 ? (
				<section className="rounded-2xl border border-dashed border-border/70 bg-muted/30 px-4 py-10 text-center text-sm text-muted-foreground">
					{filter === "all"
						? "No files yet. Upload files or add links to get started."
						: `No ${filter} found.`}
				</section>
			) : view === "grid" ? (
				<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
					{filtered.map((file) => (
						<RecentFileCard
							key={file.id}
							file={file}
							onEdit={handleEditFile}
							onDelete={handleDeleteFile}
							onClick={handleFileClick}
						/>
					))}
				</div>
			) : (
				<FilesTable
					files={filtered}
					onAddFile={() => setIsAddOpen(true)}
					onFileClick={handleFileClick}
				/>
			)}

			<AddFileModal
				open={isAddOpen}
				onOpenChange={setIsAddOpen}
				projectId={projectId}
				workspaceId={workspaceId}
			/>
		</div>
	);
}
