"use client";

import { useMutation, useQuery } from "convex/react";
import {
	FileText,
	Globe,
	Link as LinkIcon,
	PenLine,
	Plus,
	Upload,
} from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { useWorkspace } from "@/components/providers/workspace-context";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

type IssueAttachDialogProps = {
	issueId: Id<"issues">;
	existingDocIds?: Id<"documents">[];
	existingBoardIds?: Id<"whiteboards">[];
};

type TabId = "upload" | "url" | "resource";

export function IssueAttachDialog({
	issueId,
	existingDocIds = [],
	existingBoardIds = [],
}: IssueAttachDialogProps) {
	const { workspaceId } = useWorkspace();
	const [open, setOpen] = useState(false);
	const [activeTab, setActiveTab] = useState<TabId>("upload");

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger asChild>
				<Button
					variant="ghost"
					size="sm"
					className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
				>
					<Plus className="h-3.5 w-3.5 mr-1" />
					Add attachment
				</Button>
			</DialogTrigger>
			<DialogContent className="sm:max-w-[460px]">
				<DialogHeader>
					<DialogTitle>Attach to issue</DialogTitle>
				</DialogHeader>

				{/* Tabs */}
				<div className="flex gap-1 border-b border-border/60 -mx-6 px-6">
					<TabButton
						active={activeTab === "upload"}
						onClick={() => setActiveTab("upload")}
						icon={Upload}
						label="Upload file"
					/>
					<TabButton
						active={activeTab === "url"}
						onClick={() => setActiveTab("url")}
						icon={Globe}
						label="Link URL"
					/>
					<TabButton
						active={activeTab === "resource"}
						onClick={() => setActiveTab("resource")}
						icon={LinkIcon}
						label="Link resource"
					/>
				</div>

				<div className="pt-1">
					{activeTab === "upload" && (
						<UploadTab
							issueId={issueId}
							workspaceId={workspaceId}
							onDone={() => setOpen(false)}
						/>
					)}
					{activeTab === "url" && (
						<UrlTab
							issueId={issueId}
							workspaceId={workspaceId}
							onDone={() => setOpen(false)}
						/>
					)}
					{activeTab === "resource" && (
						<ResourceTab
							issueId={issueId}
							existingDocIds={existingDocIds}
							existingBoardIds={existingBoardIds}
							onDone={() => setOpen(false)}
						/>
					)}
				</div>
			</DialogContent>
		</Dialog>
	);
}

function TabButton({
	active,
	onClick,
	icon: Icon,
	label,
}: {
	active: boolean;
	onClick: () => void;
	icon: typeof Upload;
	label: string;
}) {
	return (
		<button
			type="button"
			onClick={onClick}
			className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium border-b-2 transition-colors ${
				active
					? "border-primary text-foreground"
					: "border-transparent text-muted-foreground hover:text-foreground"
			}`}
		>
			<Icon className="h-3.5 w-3.5" />
			{label}
		</button>
	);
}

// ── Upload Tab ────────────────────────────────────────────────────────────────

function UploadTab({
	issueId,
	workspaceId,
	onDone,
}: {
	issueId: Id<"issues">;
	workspaceId: Id<"workspaces">;
	onDone: () => void;
}) {
	const fileInputRef = useRef<HTMLInputElement>(null);
	const [uploading, setUploading] = useState(false);
	const generateUploadUrl = useMutation(api.files.generateUploadUrl);
	const createFile = useMutation(api.files.create);

	const handleFiles = async (files: File[]) => {
		if (files.length === 0) return;
		setUploading(true);

		try {
			for (const file of files) {
				const uploadUrl = await generateUploadUrl();
				const response = await fetch(uploadUrl, {
					method: "POST",
					headers: { "Content-Type": file.type },
					body: file,
				});

				if (!response.ok) {
					throw new Error(`Upload failed for ${file.name}`);
				}

				const { storageId } = await response.json();
				await createFile({
					workspaceId,
					issueId,
					name: file.name,
					storageId,
					mimeType: file.type,
					size: file.size,
				});
			}

			toast.success(
				files.length === 1 ? "File uploaded" : `${files.length} files uploaded`,
			);
			onDone();
		} catch {
			toast.error("Failed to upload file");
		} finally {
			setUploading(false);
		}
	};

	return (
		<div>
			{/* biome-ignore lint/a11y/useKeyWithClickEvents: drop zone uses click-to-browse pattern */}
			{/* biome-ignore lint/a11y/noStaticElementInteractions: drop zone is a file upload area */}
			<div
				className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-border p-10 cursor-pointer hover:border-primary/50 transition-colors"
				onDragOver={(e) => e.preventDefault()}
				onDrop={(e) => {
					e.preventDefault();
					const files = Array.from(e.dataTransfer.files || []);
					if (files.length > 0) handleFiles(files);
				}}
				onClick={() => fileInputRef.current?.click()}
			>
				<Upload className="h-8 w-8 text-muted-foreground/50 mb-3" />
				<p className="text-sm font-medium text-foreground">
					{uploading ? "Uploading..." : "Drop files here or click to browse"}
				</p>
				<p className="mt-1.5 text-xs text-muted-foreground">
					PDF, images, documents, and more
				</p>
			</div>
			<input
				ref={fileInputRef}
				type="file"
				multiple
				onChange={(e) => {
					const files = e.target.files ? Array.from(e.target.files) : [];
					if (files.length > 0) handleFiles(files);
				}}
				className="hidden"
			/>
		</div>
	);
}

// ── URL Tab ───────────────────────────────────────────────────────────────────

function UrlTab({
	issueId,
	workspaceId,
	onDone,
}: {
	issueId: Id<"issues">;
	workspaceId: Id<"workspaces">;
	onDone: () => void;
}) {
	const [name, setName] = useState("");
	const [url, setUrl] = useState("");
	const [saving, setSaving] = useState(false);
	const createFile = useMutation(api.files.create);

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		if (!url.trim()) return;

		setSaving(true);
		try {
			await createFile({
				workspaceId,
				issueId,
				name: name.trim() || url.trim(),
				externalUrl: url.trim(),
			});
			toast.success("URL linked");
			onDone();
		} catch {
			toast.error("Failed to link URL");
		} finally {
			setSaving(false);
		}
	};

	return (
		<form onSubmit={handleSubmit} className="space-y-3">
			<div>
				<label
					htmlFor="url-name"
					className="text-xs font-medium text-muted-foreground mb-1 block"
				>
					Name (optional)
				</label>
				<input
					id="url-name"
					type="text"
					value={name}
					onChange={(e) => setName(e.target.value)}
					placeholder="e.g. Design mockup"
					className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
				/>
			</div>
			<div>
				<label
					htmlFor="url-value"
					className="text-xs font-medium text-muted-foreground mb-1 block"
				>
					URL
				</label>
				<input
					id="url-value"
					type="url"
					value={url}
					onChange={(e) => setUrl(e.target.value)}
					placeholder="https://..."
					className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
					required
				/>
			</div>
			<div className="flex justify-end">
				<Button type="submit" size="sm" disabled={!url.trim() || saving}>
					{saving ? "Linking..." : "Link URL"}
				</Button>
			</div>
		</form>
	);
}

// ── Resource Tab ──────────────────────────────────────────────────────────────

function ResourceTab({
	issueId,
	existingDocIds,
	existingBoardIds,
	onDone,
}: {
	issueId: Id<"issues">;
	existingDocIds: Id<"documents">[];
	existingBoardIds: Id<"whiteboards">[];
	onDone: () => void;
}) {
	const { workspaceId } = useWorkspace();
	const [search, setSearch] = useState("");
	const linkResource = useMutation(api.issues.linkResource);

	const documents = useQuery(api.documents.listByWorkspace, { workspaceId });
	const whiteboards = useQuery(api.whiteboards.listByWorkspace, {
		workspaceId,
	});

	const filteredDocs = (documents ?? []).filter(
		(d) =>
			!existingDocIds.includes(d._id) &&
			d.title.toLowerCase().includes(search.toLowerCase()),
	);

	const filteredBoards = (whiteboards ?? []).filter(
		(b) =>
			!existingBoardIds.includes(b._id) &&
			b.title.toLowerCase().includes(search.toLowerCase()),
	);

	const handleLink = async (
		type: "document" | "whiteboard",
		resourceId: string,
	) => {
		try {
			await linkResource({ issueId, resourceType: type, resourceId });
			toast.success(
				`${type === "document" ? "Document" : "Whiteboard"} linked`,
			);
			onDone();
		} catch {
			toast.error("Failed to link resource");
		}
	};

	return (
		<div className="space-y-3">
			<input
				type="text"
				value={search}
				onChange={(e) => setSearch(e.target.value)}
				placeholder="Search docs and boards..."
				className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
			/>

			<div className="max-h-[260px] overflow-y-auto space-y-2">
				{filteredDocs.length > 0 && (
					<div>
						<p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider px-1 pb-1">
							Documents
						</p>
						{filteredDocs.map((doc) => (
							<button
								key={doc._id}
								type="button"
								onClick={() => handleLink("document", doc._id)}
								className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent transition-colors"
							>
								<FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
								<span className="truncate">{doc.title}</span>
							</button>
						))}
					</div>
				)}
				{filteredBoards.length > 0 && (
					<div>
						<p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider px-1 pb-1">
							Whiteboards
						</p>
						{filteredBoards.map((board) => (
							<button
								key={board._id}
								type="button"
								onClick={() => handleLink("whiteboard", board._id)}
								className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent transition-colors"
							>
								{board.icon ? (
									<span className="text-base leading-none shrink-0">
										{board.icon}
									</span>
								) : (
									<PenLine className="h-4 w-4 shrink-0 text-muted-foreground" />
								)}
								<span className="truncate">{board.title}</span>
							</button>
						))}
					</div>
				)}
				{filteredDocs.length === 0 && filteredBoards.length === 0 && (
					<p className="text-sm text-muted-foreground text-center py-4">
						{search ? "No matching resources" : "No resources available"}
					</p>
				)}
			</div>
		</div>
	);
}
