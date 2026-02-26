"use client";

import {
	DotsThree,
	Link as LinkIcon,
	PenNib,
} from "@phosphor-icons/react/dist/ssr";
import { useMutation, useQuery } from "convex/react";
import { MessageSquare, PanelRightClose, Share2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useWorkspace } from "@/components/providers/workspace-context";
import { useCurrentUser } from "@/components/providers/workspace-data-context";
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
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { EmojiPicker } from "@/components/ui/emoji-picker";
import { FavoriteButton } from "@/components/ui/favorite-button";
import { PresenceAvatarStack } from "@/components/ui/presence-avatar-stack";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Skeleton } from "@/components/ui/skeleton";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import type { SaveStatus } from "@/components/whiteboards/WhiteboardEditor";
import { WhiteboardEditorDynamic } from "@/components/whiteboards/WhiteboardEditorDynamic";
import { useWhiteboardPresence } from "@/hooks/use-whiteboard-presence";
import { formatRelativeTime } from "@/lib/format";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

// Convex IDs are opaque strings: alphanumeric plus underscores, non-empty.
function isValidConvexId(id: string): boolean {
	return id.length > 0 && /^[a-zA-Z0-9_]+$/.test(id);
}

type WhiteboardEditorPageProps = {
	whiteboardId: string;
};

export function WhiteboardEditorPage({
	whiteboardId,
}: WhiteboardEditorPageProps) {
	const router = useRouter();
	const { workspaceSlug, workspaceId } = useWorkspace();
	const validId = isValidConvexId(whiteboardId);
	const whiteboard = useQuery(
		api.whiteboards.getById,
		validId ? { whiteboardId: whiteboardId as Id<"whiteboards"> } : "skip",
	);
	const project = useQuery(
		api.projects.getById,
		whiteboard?.projectId ? { projectId: whiteboard.projectId } : "skip",
	);
	const currentUser = useCurrentUser();
	const { otherUsers: presenceUsers } = useWhiteboardPresence(
		whiteboardId as Id<"whiteboards">,
		currentUser?._id,
	);
	const updateMetadata = useMutation(api.whiteboards.updateMetadata);
	const removeWhiteboard = useMutation(api.whiteboards.remove);
	const recordRecent = useMutation(api.recents.record);

	// Record recent access when whiteboard loads
	const loadedWhiteboardId = whiteboard?._id;
	useEffect(() => {
		if (loadedWhiteboardId && workspaceId) {
			recordRecent({
				workspaceId,
				entityType: "whiteboard",
				entityId: loadedWhiteboardId,
			});
		}
	}, [loadedWhiteboardId, workspaceId, recordRecent]);

	const [isDeleteOpen, setIsDeleteOpen] = useState(false);
	const [isShareOpen, setIsShareOpen] = useState(false);
	const [commentMode, setCommentMode] = useState(false);
	const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
	const [editingTitle, setEditingTitle] = useState(false);
	const [titleValue, setTitleValue] = useState("");
	const titleInputRef = useRef<HTMLInputElement>(null);

	const handleBack = useCallback(() => {
		router.back();
	}, [router]);

	const handleStartTitleEdit = useCallback(() => {
		if (!whiteboard) return;
		setTitleValue(whiteboard.title);
		setEditingTitle(true);
		requestAnimationFrame(() => titleInputRef.current?.select());
	}, [whiteboard]);

	const handleSaveTitle = useCallback(async () => {
		if (!whiteboard) return;
		setEditingTitle(false);
		const trimmed = titleValue.trim();
		if (trimmed && trimmed !== whiteboard.title) {
			try {
				await updateMetadata({
					whiteboardId: whiteboard._id,
					title: trimmed,
				});
			} catch {
				toast.error("Failed to update title");
			}
		}
	}, [whiteboard, titleValue, updateMetadata]);

	const handleTitleKeyDown = useCallback(
		(e: React.KeyboardEvent) => {
			if (e.key === "Enter") {
				e.preventDefault();
				handleSaveTitle();
			} else if (e.key === "Escape") {
				setEditingTitle(false);
			}
		},
		[handleSaveTitle],
	);

	const handleCopyLink = useCallback(async () => {
		try {
			// Use share token URL when whiteboard is shared, standard URL when private
			const visibility = whiteboard?.visibility ?? "private";
			let url: string;
			if (visibility !== "private" && whiteboard?.shareToken) {
				url = `${window.location.origin}/share/board/${whiteboard.shareToken}`;
				await navigator.clipboard.writeText(url);
				toast.success("Share link copied");
			} else {
				url = window.location.href;
				await navigator.clipboard.writeText(url);
				toast.success("Link copied (workspace members only)");
			}
		} catch {
			toast.error("Failed to copy link");
		}
	}, [whiteboard?.visibility, whiteboard?.shareToken]);

	const handleDelete = useCallback(async () => {
		if (!whiteboard) return;
		try {
			await removeWhiteboard({ whiteboardId: whiteboard._id });
			toast.success("Whiteboard deleted");
			handleBack();
		} catch {
			toast.error("Failed to delete whiteboard");
		}
	}, [whiteboard, removeWhiteboard, handleBack]);

	const handleEmojiChange = useCallback(
		async (emoji: string | undefined) => {
			if (!whiteboard) return;
			try {
				await updateMetadata({
					whiteboardId: whiteboard._id,
					icon: emoji ?? "",
				});
			} catch {
				toast.error("Failed to update board emoji");
			}
		},
		[whiteboard, updateMetadata],
	);

	// Loading
	if (validId && whiteboard === undefined) {
		return <WhiteboardEditorPageSkeleton />;
	}

	// 404
	if (!validId || !whiteboard) {
		return (
			<div className="flex flex-1 flex-col items-center justify-center bg-background mx-2 my-2 border border-border rounded-lg min-w-0 gap-4 p-8">
				<h1 className="text-2xl font-semibold text-foreground">
					Whiteboard not found
				</h1>
				<p className="text-sm text-muted-foreground">
					This whiteboard does not exist or has been deleted.
				</p>
				<Button variant="outline" onClick={() => router.back()}>
					Go back
				</Button>
			</div>
		);
	}

	const lastEditedLabel = whiteboard.updatedAt
		? formatRelativeTime(whiteboard.updatedAt)
		: "Just now";

	return (
		<div className="flex flex-1 flex-col bg-background mx-2 my-2 border border-border rounded-lg min-w-0 overflow-hidden">
			{/* Compact header */}
			<div className="sticky top-0 z-10 bg-background flex items-center justify-between gap-3 px-4 py-2 shrink-0">
				<div className="flex items-center gap-3 min-w-0">
					<SidebarTrigger className="h-8 w-8 rounded-lg hover:bg-accent text-muted-foreground" />

					{/* Breadcrumb */}
					<nav className="flex items-center gap-1.5 text-xs text-muted-foreground min-w-0">
						{project && (
							<>
								<span className="truncate max-w-[120px]">{project.name}</span>
								<span>/</span>
							</>
						)}
						<span>Boards</span>
					</nav>

					<Separator orientation="vertical" className="h-5" />

					{/* Title */}
					<div className="flex items-center gap-2 min-w-0">
						<EmojiPicker
							value={whiteboard.icon}
							onChange={handleEmojiChange}
							trigger={
								<button
									type="button"
									className="flex items-center justify-center rounded-md p-1 hover:bg-muted transition-colors cursor-pointer shrink-0"
									aria-label="Change board emoji"
								>
									{whiteboard.icon ? (
										<span className="text-base leading-none">
											{whiteboard.icon}
										</span>
									) : (
										<PenNib className="h-4 w-4 text-muted-foreground" />
									)}
								</button>
							}
						/>
						{editingTitle ? (
							<input
								ref={titleInputRef}
								value={titleValue}
								onChange={(e) => setTitleValue(e.target.value)}
								onBlur={handleSaveTitle}
								onKeyDown={handleTitleKeyDown}
								className="text-sm font-semibold bg-transparent border-none outline-none text-foreground min-w-[120px] max-w-[300px]"
							/>
						) : (
							<button
								type="button"
								onClick={handleStartTitleEdit}
								className="text-sm font-semibold text-foreground truncate max-w-[300px] hover:text-foreground/80 transition-colors"
							>
								{whiteboard.title}
							</button>
						)}
					</div>
				</div>

				<div className="flex items-center gap-2 shrink-0">
					{/* Presence avatar stack */}
					<PresenceAvatarStack users={presenceUsers} />

					<span className="text-xs text-muted-foreground hidden sm:flex items-center gap-1.5">
						{saveStatus === "saving" ? (
							<>
								<span className="h-1.5 w-1.5 animate-pulse rounded-full bg-sienna-9" />
								Saving...
							</>
						) : saveStatus === "saved" ? (
							<>
								<span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
								Saved
							</>
						) : (
							<>Edited {lastEditedLabel}</>
						)}
					</span>

					{/* Comment mode toggle */}
					<TooltipProvider>
						<Tooltip>
							<TooltipTrigger asChild>
								<Button
									variant="ghost"
									size="icon-sm"
									onClick={() => setCommentMode((prev) => !prev)}
									aria-label={commentMode ? "Hide comments" : "Show comments"}
								>
									{commentMode ? (
										<PanelRightClose className="h-4 w-4" />
									) : (
										<MessageSquare className="h-4 w-4" />
									)}
								</Button>
							</TooltipTrigger>
							<TooltipContent side="bottom">
								{commentMode ? "Hide comments" : "Show comments"}
							</TooltipContent>
						</Tooltip>
					</TooltipProvider>

					{/* Share button */}
					<Button
						variant="outline"
						size="sm"
						onClick={() => setIsShareOpen(true)}
						className="gap-1.5"
					>
						<Share2 className="h-3.5 w-3.5" />
						<span className="hidden sm:inline">Share</span>
					</Button>

					<FavoriteButton entityType="whiteboard" entityId={whiteboard._id} />

					{/* Options menu */}
					<DropdownMenu>
						<DropdownMenuTrigger asChild>
							<Button variant="ghost" size="icon-sm" aria-label="Options">
								<DotsThree className="h-4 w-4" weight="bold" />
							</Button>
						</DropdownMenuTrigger>
						<DropdownMenuContent align="end">
							<DropdownMenuItem onClick={handleCopyLink}>
								<LinkIcon className="mr-2 h-4 w-4" />
								Copy link
							</DropdownMenuItem>
							<DropdownMenuItem
								onClick={() => setIsDeleteOpen(true)}
								className="text-destructive focus:text-destructive"
							>
								Delete whiteboard
							</DropdownMenuItem>
						</DropdownMenuContent>
					</DropdownMenu>
				</div>
			</div>

			<Separator />

			{/* Whiteboard editor -- must have explicit height for Excalidraw */}
			<div className="flex-1 min-h-0">
				<WhiteboardEditorDynamic
					whiteboardId={whiteboard._id}
					commentMode={commentMode}
					workspaceId={whiteboard.workspaceId}
					currentUserId={currentUser?._id}
					workspaceSlug={workspaceSlug}
					onSaveStatusChange={setSaveStatus}
				/>
			</div>

			{/* Share dialog */}
			<ShareDialog
				entityType="whiteboard"
				entityId={whiteboard._id}
				open={isShareOpen}
				onOpenChange={setIsShareOpen}
				workspaceId={whiteboard.workspaceId}
			/>

			{/* Delete confirmation */}
			<AlertDialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Delete whiteboard</AlertDialogTitle>
						<AlertDialogDescription>
							Are you sure you want to delete "{whiteboard.title}"? This action
							cannot be undone.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>Cancel</AlertDialogCancel>
						<AlertDialogAction
							onClick={handleDelete}
							className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
						>
							Delete
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</div>
	);
}

function WhiteboardEditorPageSkeleton() {
	return (
		<div className="flex flex-1 flex-col bg-background mx-2 my-2 border border-border rounded-lg min-w-0">
			<div className="flex items-center gap-3 px-4 py-2">
				<Skeleton className="h-8 w-8 rounded-md" />
				<Skeleton className="h-4 w-24" />
				<Skeleton className="h-4 w-48" />
			</div>
			<Separator />
			<div className="flex-1 flex items-center justify-center bg-muted/20">
				<div className="flex flex-col items-center gap-3">
					<div className="h-10 w-10 animate-spin rounded-full border-2 border-muted border-t-sienna-9" />
					<p className="text-sm text-muted-foreground">Loading whiteboard...</p>
				</div>
			</div>
		</div>
	);
}
