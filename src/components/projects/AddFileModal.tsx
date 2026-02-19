"use client";

import { Paperclip, UploadSimple, X } from "@phosphor-icons/react/dist/ssr";
import { useMutation } from "convex/react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { ProjectDescriptionEditor } from "@/components/project-wizard/ProjectDescriptionEditor";
import { UploadAssetFilesModal } from "@/components/projects/UploadAssetFilesModal";
import { QuickCreateModalLayout } from "@/components/QuickCreateModalLayout";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

type AddFileModalProps = {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	projectId: Id<"projects">;
	workspaceId: Id<"workspaces">;
};

const EXTERNAL_TYPES = [
	{ value: "figma", label: "Figma" },
	{ value: "google_docs", label: "Google Docs" },
	{ value: "google_sheets", label: "Google Sheets" },
	{ value: "google_slides", label: "Google Slides" },
	{ value: "notion", label: "Notion" },
	{ value: "miro", label: "Miro" },
	{ value: "github", label: "GitHub" },
	{ value: "other", label: "Other" },
] as const;

function detectExternalType(url: string): string {
	try {
		const host = new URL(url).hostname.toLowerCase();
		if (host.includes("figma.com")) return "figma";
		if (host.includes("docs.google.com")) return "google_docs";
		if (host.includes("sheets.google.com")) return "google_sheets";
		if (host.includes("slides.google.com")) return "google_slides";
		if (host.includes("notion.so") || host.includes("notion.site"))
			return "notion";
		if (host.includes("miro.com")) return "miro";
		if (host.includes("github.com")) return "github";
		return "other";
	} catch {
		return "other";
	}
}

export function AddFileModal({
	open,
	onOpenChange,
	projectId,
	workspaceId,
}: AddFileModalProps) {
	const [title, setTitle] = useState("");
	const [description, setDescription] = useState<string | undefined>(undefined);
	const [link, setLink] = useState("");
	const [externalType, setExternalType] = useState("other");
	const [pendingFiles, setPendingFiles] = useState<File[]>([]);
	const [isExpanded, setIsExpanded] = useState(false);
	const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
	const [uploading, setUploading] = useState(false);
	const [uploadProgress, setUploadProgress] = useState(0);

	const generateUploadUrl = useMutation(api.files.generateUploadUrl);
	const createFile = useMutation(api.files.create);

	useEffect(() => {
		if (!open) return;
		setTitle("");
		setDescription(undefined);
		setLink("");
		setExternalType("other");
		setPendingFiles([]);
		setIsUploadModalOpen(false);
		setIsExpanded(false);
		setUploading(false);
		setUploadProgress(0);
	}, [open]);

	// Auto-detect external type when link changes
	useEffect(() => {
		if (link.trim()) {
			setExternalType(detectExternalType(link.trim()));
		}
	}, [link]);

	const handleClose = () => {
		onOpenChange(false);
	};

	const canSubmit = Boolean(link.trim() || pendingFiles.length > 0);

	/** Upload a file via XHR with progress tracking and return the storageId */
	const uploadFileWithProgress = useCallback(
		(file: File, uploadUrl: string): Promise<Id<"_storage">> => {
			return new Promise((resolve, reject) => {
				const xhr = new XMLHttpRequest();
				xhr.upload.addEventListener("progress", (event) => {
					if (event.lengthComputable) {
						setUploadProgress(Math.round((event.loaded / event.total) * 100));
					}
				});
				xhr.addEventListener("load", () => {
					if (xhr.status >= 200 && xhr.status < 300) {
						try {
							const response = JSON.parse(xhr.responseText);
							resolve(response.storageId as Id<"_storage">);
						} catch {
							reject(new Error("Failed to parse upload response"));
						}
					} else {
						reject(new Error(`Upload failed with status ${xhr.status}`));
					}
				});
				xhr.addEventListener("error", () => reject(new Error("Upload failed")));
				xhr.open("POST", uploadUrl);
				xhr.setRequestHeader(
					"Content-Type",
					file.type || "application/octet-stream",
				);
				xhr.send(file);
			});
		},
		[],
	);

	const handleCreateAsset = async () => {
		if (!canSubmit || uploading) return;

		try {
			setUploading(true);
			const trimmedLink = link.trim();

			if (trimmedLink) {
				// External link mode
				await createFile({
					workspaceId,
					projectId,
					name: title || trimmedLink,
					description,
					externalUrl: trimmedLink,
					fileType: externalType,
				});
				toast.success("Link added");
			}

			// Upload pending files (max 3 concurrent)
			const maxConcurrent = 3;
			for (let i = 0; i < pendingFiles.length; i += maxConcurrent) {
				const batch = pendingFiles.slice(i, i + maxConcurrent);
				await Promise.all(
					batch.map(async (file) => {
						const uploadUrl = await generateUploadUrl();
						const storageId = await uploadFileWithProgress(file, uploadUrl);

						await createFile({
							workspaceId,
							projectId,
							name: file.name,
							description,
							storageId,
							mimeType: file.type || undefined,
							size: file.size,
						});
					}),
				);
			}

			if (pendingFiles.length > 0 && !trimmedLink) {
				toast.success(
					pendingFiles.length === 1
						? "File uploaded"
						: `${pendingFiles.length} files uploaded`,
				);
			}

			onOpenChange(false);
		} catch {
			toast.error("Failed to create asset");
		} finally {
			setUploading(false);
			setUploadProgress(0);
		}
	};

	const handleFilesSelected = (files: File[]) => {
		if (!files.length) return;
		setPendingFiles((prev) => [...prev, ...files]);
	};

	const removeFile = (index: number) => {
		setPendingFiles((prev) => prev.filter((_, i) => i !== index));
	};

	const attachmentSummaries = pendingFiles.map((f) => ({
		name: f.name,
		sizeMB: +(f.size / (1024 * 1024)).toFixed(1),
	}));

	return (
		<>
			<QuickCreateModalLayout
				open={open}
				onClose={handleClose}
				isDescriptionExpanded={isExpanded}
				onSubmitShortcut={handleCreateAsset}
			>
				<div className="flex items-center justify-between gap-2 w-full shrink-0 mt-1">
					<div className="flex flex-col gap-2 flex-1">
						<div className="flex gap-1 h-10 items-center w-full">
							<input
								id="asset-title"
								type="text"
								value={title}
								onChange={(e) => setTitle(e.target.value)}
								placeholder="Asset title"
								className="w-full font-normal leading-7 text-foreground placeholder:text-muted-foreground text-xl outline-none bg-transparent border-none p-0"
								autoComplete="off"
							/>
						</div>
					</div>
					<Button
						type="button"
						variant="ghost"
						size="icon-sm"
						className="h-8 w-8 rounded-full opacity-70 hover:opacity-100"
						onClick={handleClose}
					>
						<X className="h-4 w-4 text-muted-foreground" />
					</Button>
				</div>

				<ProjectDescriptionEditor
					value={description}
					onChange={setDescription}
					onExpandChange={setIsExpanded}
					placeholder="Describe this asset..."
					showTemplates={false}
				/>

				<div className="flex items-center gap-2 mt-2">
					<input
						id="asset-link"
						type="url"
						value={link}
						onChange={(e) => setLink(e.target.value)}
						placeholder="Paste a link (Figma, Drive, or any URL)"
						className="w-full text-md leading-6 text-foreground placeholder:text-muted-foreground outline-none bg-transparent border-none p-0"
						autoComplete="off"
					/>
				</div>

				{link.trim() && (
					<div className="mt-2">
						<select
							value={externalType}
							onChange={(e) => setExternalType(e.target.value)}
							className="text-sm bg-muted border border-border rounded-md px-2 py-1 text-foreground"
						>
							{EXTERNAL_TYPES.map((t) => (
								<option key={t.value} value={t.value}>
									{t.label}
								</option>
							))}
						</select>
					</div>
				)}

				<div className="mt-3 w-full">
					{attachmentSummaries.length > 0 ? (
						<div className="space-y-2">
							{attachmentSummaries.map((s, idx) => (
								<div
									key={`${s.name}-${idx}`}
									className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm"
								>
									<div className="flex items-center gap-2 min-w-0">
										<Paperclip className="h-4 w-4 text-muted-foreground" />
										<div className="truncate">{s.name}</div>
									</div>
									<div className="flex items-center gap-2">
										<div className="text-muted-foreground text-xs">
											{s.sizeMB.toFixed(1)} MB
										</div>
										<button
											type="button"
											onClick={() => removeFile(idx)}
											className="text-muted-foreground hover:text-foreground"
										>
											<X className="h-3 w-3" />
										</button>
									</div>
								</div>
							))}
						</div>
					) : (
						<p className="text-xs text-muted-foreground">
							No files attached yet.
						</p>
					)}
				</div>

				{uploading && (
					<div className="mt-3 w-full">
						<Progress value={uploadProgress} className="h-2" />
						<p className="text-xs text-muted-foreground mt-1">
							Uploading... {uploadProgress}%
						</p>
					</div>
				)}

				<div className="flex items-center justify-between mt-auto w-full pt-4 shrink-0">
					<div className="flex items-center gap-2">
						<Button
							type="button"
							variant="ghost"
							size="icon-sm"
							className="text-muted-foreground"
						>
							<Paperclip className="h-4 w-4" />
						</Button>
					</div>
					<div className="flex items-center gap-2">
						<Button
							type="button"
							variant="secondary"
							size="sm"
							onClick={() => setIsUploadModalOpen(true)}
							disabled={uploading}
						>
							<UploadSimple className="h-4 w-4" />
							Upload files
						</Button>
						<Button
							size="sm"
							onClick={handleCreateAsset}
							disabled={!canSubmit || uploading}
						>
							{uploading ? "Uploading..." : "Create asset"}
						</Button>
					</div>
				</div>
			</QuickCreateModalLayout>

			<UploadAssetFilesModal
				open={isUploadModalOpen}
				onOpenChange={setIsUploadModalOpen}
				onFilesSelect={handleFilesSelected}
			/>
		</>
	);
}
