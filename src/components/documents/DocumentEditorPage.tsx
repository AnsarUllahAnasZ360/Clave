"use client";

import { DotsThree, Link as LinkIcon } from "@phosphor-icons/react/dist/ssr";
import { useMutation, useQuery } from "convex/react";
import { MessageSquare, PanelRightClose, Share2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import type { DocumentThread } from "@/components/documents/DocumentCommentsSidebar";
import { DocumentCommentsSidebar } from "@/components/documents/DocumentCommentsSidebar";
import {
	DocumentEditorDynamic,
	preloadDocumentEditor,
} from "@/components/documents/DocumentEditorDynamic";
import { DocumentHero } from "@/components/documents/DocumentHero";
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
import { useMentionSuggestion } from "@/hooks/use-mention-suggestion";
import { formatRelativeTime } from "@/lib/format";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

type DocumentEditorPageProps = {
	documentId: string;
};

// Convex IDs are opaque strings: alphanumeric plus underscores, non-empty.
function isValidConvexId(id: string): boolean {
	return id.length > 0 && /^[a-zA-Z0-9_]+$/.test(id);
}

export function DocumentEditorPage({ documentId }: DocumentEditorPageProps) {
	// Start downloading the editor bundle immediately on page mount,
	// overlapping with Convex query resolution instead of waiting for render.
	useEffect(() => {
		if (process.env.NODE_ENV === "development") {
			performance.mark("doc-editor:nav-start");
		}
		preloadDocumentEditor();
	}, []);

	const router = useRouter();
	const { workspaceSlug, workspaceId } = useWorkspace();
	const validId = isValidConvexId(documentId);
	const document = useQuery(
		api.documents.getById,
		validId ? { documentId: documentId as Id<"documents"> } : "skip",
	);
	const project = useQuery(
		api.projects.getById,
		document?.projectId ? { projectId: document.projectId } : "skip",
	);
	const lastEditor = useQuery(
		api.users.getById,
		document?.lastEditedBy ? { userId: document.lastEditedBy } : "skip",
	);
	const currentUser = useCurrentUser();
	const activePresence = useQuery(
		api.documentPresence.listActive,
		validId ? { documentId: documentId as Id<"documents"> } : "skip",
	);
	const updateDocument = useMutation(api.documents.update);
	const removeDocument = useMutation(api.documents.remove);
	const recordRecent = useMutation(api.recents.record);

	// Record recent access when document loads
	const loadedDocumentId = document?._id;
	useEffect(() => {
		if (loadedDocumentId && workspaceId) {
			recordRecent({
				workspaceId,
				entityType: "document",
				entityId: loadedDocumentId,
			});
		}
	}, [loadedDocumentId, workspaceId, recordRecent]);

	// Document comments sidebar data and mutations
	const commentThreads = useQuery(
		api.documentComments.listThreadsWithAuthors,
		validId ? { documentId: documentId as Id<"documents"> } : "skip",
	);
	const addCommentMutation = useMutation(api.documentComments.addComment);
	const updateCommentMutation = useMutation(api.documentComments.updateComment);
	const softDeleteCommentMutation = useMutation(
		api.documentComments.softDeleteComment,
	);
	const resolveThreadMutation = useMutation(api.documentComments.resolveThread);
	const unresolveThreadMutation = useMutation(
		api.documentComments.unresolveThread,
	);

	// Mention suggestion for comment editor
	const mentionSuggestion = useMentionSuggestion(workspaceId);

	// Comment sidebar handlers
	const handleCommentReply = useCallback(
		async (threadId: string, body: string) => {
			await addCommentMutation({
				threadId: threadId as Id<"documentThreads">,
				body,
			});
		},
		[addCommentMutation],
	);

	const handleCommentResolve = useCallback(
		async (threadId: string) => {
			await resolveThreadMutation({
				threadId: threadId as Id<"documentThreads">,
			});
		},
		[resolveThreadMutation],
	);

	const handleCommentUnresolve = useCallback(
		async (threadId: string) => {
			await unresolveThreadMutation({
				threadId: threadId as Id<"documentThreads">,
			});
		},
		[unresolveThreadMutation],
	);

	const handleCommentEdit = useCallback(
		async (commentId: string, body: string) => {
			await updateCommentMutation({
				commentId: commentId as Id<"documentComments">,
				body,
			});
		},
		[updateCommentMutation],
	);

	const handleCommentDelete = useCallback(
		async (commentId: string) => {
			await softDeleteCommentMutation({
				commentId: commentId as Id<"documentComments">,
			});
		},
		[softDeleteCommentMutation],
	);

	// Active users for the presence avatar stack (excluding current user)
	const presenceUsers = useMemo(() => {
		if (!activePresence || !currentUser) return [];
		return activePresence
			.filter((p) => p.userId !== currentUser._id)
			.map((p) => ({
				userId: p.userId,
				name: p.name,
				image: p.image,
			}));
	}, [activePresence, currentUser]);

	// Map comment threads from Convex query to sidebar format
	const sidebarThreads: DocumentThread[] = useMemo(() => {
		if (!commentThreads) return [];
		return commentThreads as DocumentThread[];
	}, [commentThreads]);

	const [isDeleteOpen, setIsDeleteOpen] = useState(false);
	const [isShareOpen, setIsShareOpen] = useState(false);
	const [showCommentsSidebar, setShowCommentsSidebar] = useState(false);

	// Debounced title save from hero
	const titleSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const handleHeroTitleChange = useCallback(
		(newTitle: string) => {
			if (titleSaveTimerRef.current) {
				clearTimeout(titleSaveTimerRef.current);
			}
			titleSaveTimerRef.current = setTimeout(async () => {
				const trimmed = newTitle.trim();
				if (trimmed && document && trimmed !== document.title) {
					try {
						await updateDocument({
							documentId: document._id,
							title: trimmed,
						});
					} catch {
						toast.error("Failed to update title");
					}
				}
			}, 500);
		},
		[document, updateDocument],
	);

	// Cleanup timer on unmount
	useEffect(() => {
		return () => {
			if (titleSaveTimerRef.current) {
				clearTimeout(titleSaveTimerRef.current);
			}
		};
	}, []);

	const handleBack = useCallback(() => {
		router.back();
	}, [router]);

	const handleCopyLink = useCallback(async () => {
		try {
			const visibility = document?.visibility ?? "private";
			const shareToken = document?.shareToken;
			if (visibility !== "private" && shareToken) {
				await navigator.clipboard.writeText(
					`${window.location.origin}/share/${shareToken}`,
				);
				toast.success("Share link copied");
			} else {
				await navigator.clipboard.writeText(window.location.href);
				toast.success("Link copied (workspace members only)");
			}
		} catch {
			toast.error("Failed to copy link");
		}
	}, [document?.visibility, document?.shareToken]);

	const handleDelete = useCallback(async () => {
		if (!document) return;
		try {
			await removeDocument({ documentId: document._id });
			toast.success("Document deleted");
			handleBack();
		} catch {
			toast.error("Failed to delete document");
		}
	}, [document, removeDocument, handleBack]);

	// Loading
	if (validId && document === undefined) {
		return <DocumentEditorPageSkeleton />;
	}

	// 404
	if (!validId || !document) {
		return (
			<div className="flex flex-1 flex-col items-center justify-center bg-background mx-2 my-2 border border-border rounded-lg min-w-0 gap-4 p-8">
				<h1 className="text-2xl font-semibold text-foreground">
					Document not found
				</h1>
				<p className="text-sm text-muted-foreground">
					This document does not exist or has been deleted.
				</p>
				<Button variant="outline" onClick={() => router.back()}>
					Go back
				</Button>
			</div>
		);
	}

	const lastEditedLabel = document.updatedAt
		? formatRelativeTime(document.updatedAt)
		: "Just now";
	const editorName = lastEditor?.name ?? "Unknown";

	return (
		<div className="flex flex-1 flex-col bg-background mx-2 my-2 border border-border rounded-lg min-w-0 overflow-hidden">
			{/* Header */}
			<div className="sticky top-0 z-10 bg-background flex items-center justify-between gap-3 px-4 py-3 shrink-0">
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
						<span>Docs</span>
					</nav>

					<Separator orientation="vertical" className="h-5" />

					{/* Title */}
					<span className="text-sm font-semibold text-foreground truncate max-w-[300px]">
						{document.icon && <span className="mr-1">{document.icon}</span>}
						{document.title}
					</span>
				</div>

				<div className="flex items-center gap-2 shrink-0">
					{/* Last edited */}
					<span className="text-xs text-muted-foreground hidden sm:block">
						Edited {lastEditedLabel} by {editorName}
					</span>

					{/* Presence avatar stack */}
					<PresenceAvatarStack users={presenceUsers} />

					{/* Comment sidebar toggle */}
					<TooltipProvider>
						<Tooltip>
							<TooltipTrigger asChild>
								<Button
									variant="ghost"
									size="icon-sm"
									onClick={() => setShowCommentsSidebar(!showCommentsSidebar)}
									aria-label={
										showCommentsSidebar ? "Hide comments" : "Show comments"
									}
								>
									{showCommentsSidebar ? (
										<PanelRightClose className="h-4 w-4" />
									) : (
										<MessageSquare className="h-4 w-4" />
									)}
								</Button>
							</TooltipTrigger>
							<TooltipContent side="bottom">
								{showCommentsSidebar ? "Hide comments" : "Show comments"}
							</TooltipContent>
						</Tooltip>
					</TooltipProvider>

					<Button
						variant="outline"
						size="sm"
						onClick={() => setIsShareOpen(true)}
						className="gap-1.5"
					>
						<Share2 className="h-3.5 w-3.5" />
						Share
					</Button>

					<FavoriteButton entityType="document" entityId={document._id} />

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
								Delete document
							</DropdownMenuItem>
						</DropdownMenuContent>
					</DropdownMenu>
				</div>
			</div>

			<Separator />

			{/* Editor + Comments sidebar row */}
			<div className="flex flex-1 min-h-0">
				{/* Editor with hero */}
				<div className="flex-1 min-w-0 flex flex-col">
					<DocumentEditorDynamic
						documentId={document._id}
						heroSlot={
							<DocumentHero
								documentId={document._id}
								icon={document.icon}
								coverStorageId={document.coverStorageId}
								coverPositionY={document.coverPositionY}
								title={document.title}
								onTitleChange={handleHeroTitleChange}
								onToggleComments={() =>
									setShowCommentsSidebar(!showCommentsSidebar)
								}
							/>
						}
					/>
				</div>

				{/* Comments sidebar */}
				{showCommentsSidebar && (
					<DocumentCommentsSidebar
						threads={sidebarThreads}
						currentUserId={currentUser?._id as string | undefined}
						workspaceSlug={workspaceSlug}
						mentionSuggestion={mentionSuggestion}
						onReply={handleCommentReply}
						onResolve={handleCommentResolve}
						onUnresolve={handleCommentUnresolve}
						onEdit={handleCommentEdit}
						onDelete={handleCommentDelete}
						aiContext={workspaceId ? { workspaceId, documentId } : undefined}
					/>
				)}
			</div>

			{/* Delete confirmation */}
			<AlertDialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Delete document</AlertDialogTitle>
						<AlertDialogDescription>
							Are you sure you want to delete "{document.title}"? This action
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

			{/* Share dialog */}
			<ShareDialog
				entityType="document"
				entityId={document._id}
				open={isShareOpen}
				onOpenChange={setIsShareOpen}
				workspaceId={document.workspaceId}
			/>
		</div>
	);
}

function DocumentEditorPageSkeleton() {
	return (
		<div className="flex flex-1 flex-col bg-background mx-2 my-2 border border-border rounded-lg min-w-0">
			<div className="flex items-center gap-3 px-4 py-3">
				<Skeleton className="h-8 w-8 rounded-md" />
				<Skeleton className="h-4 w-24" />
				<Skeleton className="h-4 w-48" />
			</div>
			<Separator />
			<div className="flex-1 px-8 py-6">
				<div className="mx-auto max-w-3xl space-y-4">
					<Skeleton className="h-8 w-3/4" />
					<Skeleton className="h-4 w-full" />
					<Skeleton className="h-4 w-5/6" />
					<Skeleton className="h-4 w-2/3" />
				</div>
			</div>
		</div>
	);
}
