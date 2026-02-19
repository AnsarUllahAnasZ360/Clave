"use client";

import { useMutation, useQuery } from "convex/react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { AddFileModal } from "@/components/projects/AddFileModal";
import { FilesTable } from "@/components/projects/FilesTable";
import { RecentFileCard } from "@/components/projects/RecentFileCard";
import { Skeleton } from "@/components/ui/skeleton";
import type { ProjectFile } from "@/lib/data/project-details";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

type AssetsFilesTabProps = {
	projectId: Id<"projects">;
	workspaceId: Id<"workspaces">;
};

/** Map MIME type or fileType to the QuickLink type used by child components */
function mapFileType(
	mimeType?: string,
	fileType?: string,
	name?: string,
): ProjectFile["type"] {
	// Check fileType (external link types)
	if (fileType) {
		const ft = fileType.toLowerCase();
		if (ft === "figma" || ft === "fig") return "fig";
		if (ft === "pdf") return "pdf";
		if (ft === "zip") return "zip";
		if (ft === "doc" || ft === "google_docs" || ft === "word") return "doc";
	}

	// Check MIME type
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

	// Check filename extension
	if (name) {
		const ext = name.includes(".") ? name.split(".").pop()?.toLowerCase() : "";
		if (ext === "pdf") return "pdf";
		if (ext === "zip") return "zip";
		if (ext === "fig" || ext === "figma") return "fig";
		if (ext === "doc" || ext === "docx") return "doc";
	}

	return "file";
}

/** Format bytes to human-readable size */
function formatSize(bytes?: number): number {
	if (!bytes || bytes === 0) return 0;
	return +(bytes / (1024 * 1024)).toFixed(1);
}

export function AssetsFilesTab({
	projectId,
	workspaceId,
}: AssetsFilesTabProps) {
	const files = useQuery(api.files.listByProject, { projectId });
	const removeMutation = useMutation(api.files.remove);
	const [isAddOpen, setIsAddOpen] = useState(false);

	// Map Convex file documents to ProjectFile type for child components
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

	const recentFiles = useMemo(() => items.slice(0, 6), [items]);

	const handleAddFile = () => {
		setIsAddOpen(true);
	};

	const handleFileClick = (fileId: string) => {
		// Find the original Convex file to get resolved URL
		const file = files?.find((f) => f._id === fileId);
		if (!file) return;

		const url = file.url;
		if (url) {
			window.open(url, "_blank", "noopener,noreferrer");
		}
	};

	const handleDeleteFile = async (fileId: string) => {
		try {
			await removeMutation({ fileId: fileId as Id<"files"> });
			toast.success("File deleted");
		} catch {
			toast.error("Failed to delete file");
		}
	};

	const handleEditFile = (fileId: string) => {
		// Edit not implemented in source repo -- no-op
		console.log("Edit file:", fileId);
	};

	// Loading state
	if (files === undefined) {
		return (
			<div className="space-y-8">
				<section>
					<Skeleton className="h-5 w-24 mb-4" />
					<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
						<Skeleton className="h-16 w-full rounded-2xl" />
						<Skeleton className="h-16 w-full rounded-2xl" />
						<Skeleton className="h-16 w-full rounded-2xl" />
					</div>
				</section>
				<section>
					<Skeleton className="h-5 w-20 mb-4" />
					<Skeleton className="h-48 w-full rounded-lg" />
				</section>
			</div>
		);
	}

	return (
		<div className="space-y-8">
			<section>
				<h2 className="mb-4 text-sm font-semibold text-accent-foreground">
					Recent Files
				</h2>
				{recentFiles.length > 0 ? (
					<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
						{recentFiles.map((file) => (
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
					<p className="text-sm text-muted-foreground">No files yet.</p>
				)}
			</section>

			<section>
				<h2 className="mb-4 text-sm font-semibold text-accent-foreground">
					All files
				</h2>
				<FilesTable
					files={items}
					onAddFile={handleAddFile}
					onFileClick={handleFileClick}
				/>
			</section>

			<AddFileModal
				open={isAddOpen}
				onOpenChange={setIsAddOpen}
				projectId={projectId}
				workspaceId={workspaceId}
			/>
		</div>
	);
}
