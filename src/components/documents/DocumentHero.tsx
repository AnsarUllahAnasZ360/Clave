"use client";

import { useMutation, useQuery } from "convex/react";
import { ImagePlus, MessageSquare, Replace, Trash2 } from "lucide-react";
import Image from "next/image";
import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";
import { EmojiPicker } from "@/components/ui/emoji-picker";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

type DocumentHeroProps = {
	documentId: Id<"documents">;
	icon?: string;
	coverStorageId?: Id<"_storage">;
	onToggleComments: () => void;
};

export function DocumentHero({
	documentId,
	icon,
	coverStorageId,
	onToggleComments,
}: DocumentHeroProps) {
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
			// Reset the input so the same file can be re-selected
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

	return (
		<div className="mb-4">
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
					className="relative -mx-8 -mt-12 mb-6 h-[200px] group"
					onMouseEnter={() => setIsCoverHovered(true)}
					onMouseLeave={() => setIsCoverHovered(false)}
				>
					<Image
						src={coverUrl}
						alt="Document cover"
						fill
						className="object-cover"
						unoptimized
					/>
					{/* Cover overlay buttons */}
					<div
						className={`absolute bottom-3 right-3 flex items-center gap-1.5 transition-opacity duration-200 ${
							isCoverHovered ? "opacity-100" : "opacity-0"
						}`}
					>
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

				{/* Action buttons - visible on hover */}
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
			</div>
		</div>
	);
}
