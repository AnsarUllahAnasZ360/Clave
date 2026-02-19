"use client";

import { useMutation, useQuery } from "convex/react";
import {
	ExternalLink,
	File,
	FileImage,
	FileText,
	Globe,
	PenLine,
	X,
} from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import { useWorkspace } from "@/components/providers/workspace-context";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

type LinkedResourcesProps = {
	issueId: Id<"issues">;
	linkedDocumentIds?: Id<"documents">[];
	linkedWhiteboardIds?: Id<"whiteboards">[];
};

export function LinkedResources({
	issueId,
	linkedDocumentIds,
	linkedWhiteboardIds,
}: LinkedResourcesProps) {
	const { workspaceSlug } = useWorkspace();
	const unlinkResource = useMutation(api.issues.unlinkResource);
	const removeFile = useMutation(api.files.remove);
	const fileAttachments = useQuery(api.files.listByIssue, { issueId });

	const docs = linkedDocumentIds ?? [];
	const boards = linkedWhiteboardIds ?? [];
	const files = fileAttachments ?? [];

	if (docs.length === 0 && boards.length === 0 && files.length === 0)
		return null;

	const handleUnlink = async (
		type: "document" | "whiteboard",
		resourceId: string,
	) => {
		try {
			await unlinkResource({ issueId, resourceType: type, resourceId });
		} catch {
			toast.error("Failed to unlink resource");
		}
	};

	const handleRemoveFile = async (fileId: Id<"files">) => {
		try {
			await removeFile({ fileId });
			toast.success("Attachment removed");
		} catch {
			toast.error("Failed to remove attachment");
		}
	};

	return (
		<div className="flex flex-wrap gap-1.5">
			{docs.map((docId) => (
				<LinkedDocCard
					key={docId}
					docId={docId}
					workspaceSlug={workspaceSlug}
					onUnlink={() => handleUnlink("document", docId)}
				/>
			))}
			{boards.map((boardId) => (
				<LinkedBoardCard
					key={boardId}
					boardId={boardId}
					workspaceSlug={workspaceSlug}
					onUnlink={() => handleUnlink("whiteboard", boardId)}
				/>
			))}
			{files.map((file) => (
				<FileCard
					key={file._id}
					name={file.name}
					url={file.url}
					mimeType={file.mimeType}
					isExternal={!!file.externalUrl}
					onRemove={() => handleRemoveFile(file._id)}
				/>
			))}
		</div>
	);
}

/** Return the total attachment count (docs + boards + files) for use in the collapsible header */
export function useAttachmentCount(
	issueId: Id<"issues">,
	linkedDocumentIds?: Id<"documents">[],
	linkedWhiteboardIds?: Id<"whiteboards">[],
) {
	const fileAttachments = useQuery(api.files.listByIssue, { issueId });
	return (
		(linkedDocumentIds?.length ?? 0) +
		(linkedWhiteboardIds?.length ?? 0) +
		(fileAttachments?.length ?? 0)
	);
}

function getFileIcon(mimeType?: string) {
	if (!mimeType) return File;
	if (mimeType.startsWith("image/")) return FileImage;
	if (
		mimeType.includes("pdf") ||
		mimeType.includes("text") ||
		mimeType.includes("document")
	)
		return FileText;
	return File;
}

function LinkedDocCard({
	docId,
	workspaceSlug,
	onUnlink,
}: {
	docId: Id<"documents">;
	workspaceSlug: string;
	onUnlink: () => void;
}) {
	const doc = useQuery(api.documents.getById, { documentId: docId });

	if (!doc) return null;

	return (
		<div className="group/card flex items-center gap-1.5 rounded-md border border-border/60 bg-muted/30 px-2 py-1 text-xs">
			<FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
			<Link
				href={`/${workspaceSlug}/docs/${docId}`}
				className="truncate max-w-[160px] hover:text-primary transition-colors"
			>
				{doc.title}
			</Link>
			<button
				type="button"
				onClick={onUnlink}
				className="opacity-0 group-hover/card:opacity-100 p-0.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-all"
				title="Unlink"
			>
				<X className="h-3 w-3" />
			</button>
		</div>
	);
}

function LinkedBoardCard({
	boardId,
	workspaceSlug,
	onUnlink,
}: {
	boardId: Id<"whiteboards">;
	workspaceSlug: string;
	onUnlink: () => void;
}) {
	const board = useQuery(api.whiteboards.getById, { whiteboardId: boardId });

	if (!board) return null;

	return (
		<div className="group/card flex items-center gap-1.5 rounded-md border border-border/60 bg-muted/30 px-2 py-1 text-xs">
			<PenLine className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
			<Link
				href={`/${workspaceSlug}/boards/${boardId}`}
				className="truncate max-w-[160px] hover:text-primary transition-colors"
			>
				{board.title}
			</Link>
			<button
				type="button"
				onClick={onUnlink}
				className="opacity-0 group-hover/card:opacity-100 p-0.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-all"
				title="Unlink"
			>
				<X className="h-3 w-3" />
			</button>
		</div>
	);
}

function FileCard({
	name,
	url,
	mimeType,
	isExternal,
	onRemove,
}: {
	name: string;
	url: string | null;
	mimeType?: string;
	isExternal: boolean;
	onRemove: () => void;
}) {
	const Icon = isExternal ? Globe : getFileIcon(mimeType);

	return (
		<div className="group/card flex items-center gap-1.5 rounded-md border border-border/60 bg-muted/30 px-2 py-1 text-xs">
			<Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
			{url ? (
				<a
					href={url}
					target="_blank"
					rel="noopener noreferrer"
					className="truncate max-w-[160px] hover:text-primary transition-colors"
				>
					{name}
				</a>
			) : (
				<span className="truncate max-w-[160px] text-muted-foreground">
					{name}
				</span>
			)}
			{isExternal && (
				<ExternalLink className="h-3 w-3 shrink-0 text-muted-foreground/50" />
			)}
			<button
				type="button"
				onClick={onRemove}
				className="opacity-0 group-hover/card:opacity-100 p-0.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-all"
				title="Remove"
			>
				<X className="h-3 w-3" />
			</button>
		</div>
	);
}
