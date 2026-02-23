"use client";

import { useMutation, useQuery } from "convex/react";
import {
	GripHorizontal,
	ImagePlus,
	MessageSquare,
	Replace,
	Trash2,
} from "lucide-react";
import Image from "next/image";
import { useEditorRef } from "platejs/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { EmojiPicker } from "@/components/ui/emoji-picker";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

type DocumentHeroProps = {
	documentId: Id<"documents">;
	icon?: string;
	coverStorageId?: Id<"_storage">;
	coverPositionY?: number;
	title: string;
	onTitleChange: (title: string) => void;
	onToggleComments: () => void;
	readOnly?: boolean;
};

export function DocumentHero({
	documentId,
	icon,
	coverStorageId,
	coverPositionY,
	title,
	onTitleChange,
	onToggleComments,
	readOnly,
}: DocumentHeroProps) {
	const editor = useEditorRef();
	const updateDocument = useMutation(api.documents.update);
	const generateUploadUrl = useMutation(api.files.generateUploadUrl);
	const coverUrl = useQuery(
		api.files.getUrl,
		coverStorageId ? { storageId: coverStorageId } : "skip",
	);

	const [isHovered, setIsHovered] = useState(false);
	const [isCoverHovered, setIsCoverHovered] = useState(false);
	const [isUploading, setIsUploading] = useState(false);
	const fileInputRef = useRef<HTMLInputElement>(null);
	const replaceInputRef = useRef<HTMLInputElement>(null);

	// Title editing state
	const [localTitle, setLocalTitle] = useState(title);
	useEffect(() => {
		setLocalTitle(title);
	}, [title]);

	// Cover repositioning state
	const [isRepositioning, setIsRepositioning] = useState(false);
	const [positionY, setPositionY] = useState(coverPositionY ?? 50);
	const [dragStartY, setDragStartY] = useState(0);
	const [dragStartPos, setDragStartPos] = useState(0);
	const [isDragging, setIsDragging] = useState(false);

	// Sync positionY with prop
	useEffect(() => {
		if (!isRepositioning) {
			setPositionY(coverPositionY ?? 50);
		}
	}, [coverPositionY, isRepositioning]);

	const handleEmojiChange = useCallback(
		(emoji: string | undefined) => {
			updateDocument({
				documentId,
				icon: emoji ?? "",
			});
		},
		[documentId, updateDocument],
	);

	const handleCoverUpload = useCallback(
		async (file: File) => {
			if (!file.type.startsWith("image/")) {
				toast.error("Please select an image file");
				return;
			}

			if (file.size > 5 * 1024 * 1024) {
				toast.error("Image must be under 5MB");
				return;
			}

			setIsUploading(true);
			try {
				const uploadUrl = await generateUploadUrl();
				const result = await fetch(uploadUrl, {
					method: "POST",
					headers: { "Content-Type": file.type },
					body: file,
				});
				const { storageId } = (await result.json()) as {
					storageId: Id<"_storage">;
				};
				await updateDocument({
					documentId,
					coverStorageId: storageId,
				});
			} catch {
				toast.error("Failed to upload cover image");
			} finally {
				setIsUploading(false);
			}
		},
		[documentId, generateUploadUrl, updateDocument],
	);

	const handleFileSelect = useCallback(
		(e: React.ChangeEvent<HTMLInputElement>) => {
			const file = e.target.files?.[0];
			if (file) {
				handleCoverUpload(file);
			}
			e.target.value = "";
		},
		[handleCoverUpload],
	);

	const handleRemoveCover = useCallback(async () => {
		try {
			await updateDocument({
				documentId,
				removeCoverImage: true,
			});
		} catch {
			toast.error("Failed to remove cover image");
		}
	}, [documentId, updateDocument]);

	const handleAddCoverClick = useCallback(() => {
		fileInputRef.current?.click();
	}, []);

	const handleReplaceCoverClick = useCallback(() => {
		replaceInputRef.current?.click();
	}, []);

	// Title handlers
	const handleTitleKeyDown = useCallback(
		(e: React.KeyboardEvent<HTMLInputElement>) => {
			if (e.key === "Enter") {
				e.preventDefault();
				// Focus the Plate editor via its API (scoped, not a global DOM query)
				editor.tf.focus();
			}
		},
		[editor],
	);

	// Cover repositioning handlers
	const handleRepositionMouseDown = useCallback(
		(e: React.MouseEvent) => {
			e.preventDefault();
			setIsDragging(true);
			setDragStartY(e.clientY);
			setDragStartPos(positionY);
		},
		[positionY],
	);

	useEffect(() => {
		if (!isDragging) return;

		const handleMouseMove = (e: MouseEvent) => {
			const delta = e.clientY - dragStartY;
			const newPos = Math.max(0, Math.min(100, dragStartPos - delta / 2));
			setPositionY(newPos);
		};

		const handleMouseUp = () => {
			setIsDragging(false);
		};

		window.addEventListener("mousemove", handleMouseMove);
		window.addEventListener("mouseup", handleMouseUp);
		return () => {
			window.removeEventListener("mousemove", handleMouseMove);
			window.removeEventListener("mouseup", handleMouseUp);
		};
	}, [isDragging, dragStartY, dragStartPos]);

	const handleSavePosition = useCallback(async () => {
		try {
			await updateDocument({
				documentId,
				coverPositionY: Math.round(positionY),
			});
			setIsRepositioning(false);
		} catch {
			toast.error("Failed to save position");
		}
	}, [documentId, positionY, updateDocument]);

	return (
		<div className="mb-0">
			{/* Hidden file inputs */}
			<input
				ref={fileInputRef}
				type="file"
				accept="image/*"
				className="hidden"
				onChange={handleFileSelect}
			/>
			<input
				ref={replaceInputRef}
				type="file"
				accept="image/*"
				className="hidden"
				onChange={handleFileSelect}
			/>

			{/* Cover image */}
			{coverUrl && (
				<div
					role="img"
					aria-label="Document cover image"
					className="relative -mx-8 -mt-6 mb-6 h-[200px] group"
					onMouseEnter={() => setIsCoverHovered(true)}
					onMouseLeave={() => {
						setIsCoverHovered(false);
					}}
				>
					<Image
						src={coverUrl}
						alt="Document cover"
						fill
						className="object-cover"
						style={{ objectPosition: `center ${positionY}%` }}
						draggable={false}
						unoptimized
					/>

					{/* Repositioning overlay */}
					{isRepositioning && (
						// biome-ignore lint/a11y/noStaticElementInteractions: drag-to-reposition overlay
						<div
							className={`absolute inset-0 ${isDragging ? "cursor-grabbing" : "cursor-grab"}`}
							onMouseDown={handleRepositionMouseDown}
						>
							<div className="absolute inset-0 bg-black/20" />
							<div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex items-center gap-2 rounded-md bg-background/80 px-3 py-2 text-xs font-medium text-foreground backdrop-blur-sm border border-border/50 pointer-events-none select-none">
								<GripHorizontal className="h-3.5 w-3.5" />
								Drag to reposition
							</div>
							{/* Save/Cancel buttons */}
							<div className="absolute bottom-3 right-3 flex items-center gap-1.5">
								<button
									type="button"
									onClick={(e) => {
										e.stopPropagation();
										handleSavePosition();
									}}
									className="flex items-center gap-1.5 rounded-md bg-primary px-2.5 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
								>
									Save position
								</button>
								<button
									type="button"
									onClick={(e) => {
										e.stopPropagation();
										setPositionY(coverPositionY ?? 50);
										setIsRepositioning(false);
									}}
									className="flex items-center gap-1.5 rounded-md bg-background/80 px-2.5 py-1.5 text-xs font-medium text-foreground backdrop-blur-sm hover:bg-background/90 transition-colors border border-border/50"
								>
									Cancel
								</button>
							</div>
						</div>
					)}

					{/* Cover overlay buttons (hidden during repositioning or readOnly) */}
					{!isRepositioning && !readOnly && (
						<div
							className={`absolute bottom-3 right-3 flex items-center gap-1.5 transition-opacity duration-200 ${
								isCoverHovered ? "opacity-100" : "opacity-0"
							}`}
						>
							<button
								type="button"
								onClick={() => setIsRepositioning(true)}
								className="flex items-center gap-1.5 rounded-md bg-background/80 px-2.5 py-1.5 text-xs font-medium text-foreground backdrop-blur-sm hover:bg-background/90 transition-colors border border-border/50"
							>
								<GripHorizontal className="h-3 w-3" />
								Reposition
							</button>
							<button
								type="button"
								onClick={handleReplaceCoverClick}
								className="flex items-center gap-1.5 rounded-md bg-background/80 px-2.5 py-1.5 text-xs font-medium text-foreground backdrop-blur-sm hover:bg-background/90 transition-colors border border-border/50"
							>
								<Replace className="h-3 w-3" />
								Change cover
							</button>
							<button
								type="button"
								onClick={handleRemoveCover}
								className="flex items-center gap-1.5 rounded-md bg-background/80 px-2.5 py-1.5 text-xs font-medium text-foreground backdrop-blur-sm hover:bg-background/90 transition-colors border border-border/50"
							>
								<Trash2 className="h-3 w-3" />
								Remove
							</button>
						</div>
					)}

					{isUploading && (
						<div className="absolute inset-0 flex items-center justify-center bg-background/50 backdrop-blur-sm">
							<div className="text-sm text-muted-foreground">Uploading...</div>
						</div>
					)}
				</div>
			)}

			{/* Emoji and action buttons */}
			{/* biome-ignore lint/a11y/noStaticElementInteractions: hover interaction for showing action buttons */}
			<div
				className="group relative"
				onMouseEnter={() => setIsHovered(true)}
				onMouseLeave={() => setIsHovered(false)}
			>
				{readOnly ? (
					<span className="text-5xl leading-none">{icon || "📄"}</span>
				) : (
					<EmojiPicker
						value={icon}
						onChange={handleEmojiChange}
						trigger={
							<button
								type="button"
								className="flex items-center justify-center rounded-lg p-1 hover:bg-muted transition-colors cursor-pointer"
							>
								<span className="text-5xl leading-none">{icon || "📄"}</span>
							</button>
						}
					/>
				)}

				{/* Inline title */}
				{readOnly ? (
					<h1 className="w-full text-4xl font-bold mt-1">
						{localTitle || "Untitled"}
					</h1>
				) : (
					<input
						value={localTitle}
						onChange={(e) => {
							setLocalTitle(e.target.value);
							onTitleChange(e.target.value);
						}}
						onKeyDown={handleTitleKeyDown}
						className="w-full bg-transparent border-none outline-none text-4xl font-bold placeholder:text-muted-foreground/50 mt-1"
						placeholder="Untitled"
					/>
				)}

				{/* Action buttons - visible on hover (hidden in readOnly) */}
				{!readOnly && (
					<div
						className={`flex items-center gap-1 mt-1 transition-opacity duration-200 ${
							isHovered ? "opacity-100" : "opacity-0"
						}`}
					>
						{!coverStorageId && (
							<button
								type="button"
								onClick={handleAddCoverClick}
								disabled={isUploading}
								className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
							>
								<ImagePlus className="h-3.5 w-3.5" />
								Add cover
							</button>
						)}
						<button
							type="button"
							onClick={onToggleComments}
							className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
						>
							<MessageSquare className="h-3.5 w-3.5" />
							Add comment
						</button>
					</div>
				)}
			</div>
		</div>
	);
}
