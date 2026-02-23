"use client";

import { useQuery } from "convex/react";
import { FileText, Moon, Sun } from "lucide-react";
import Image from "next/image";
import { useTheme } from "next-themes";
import { DocumentHero } from "@/components/documents/DocumentHero";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { DocumentEditorDynamic } from "./DocumentEditorDynamic";
import { DocumentReadOnlyDynamic } from "./DocumentReadOnlyDynamic";

type PublicDocumentViewProps = {
	token: string;
};

export function PublicDocumentView({ token }: PublicDocumentViewProps) {
	const document = useQuery(api.documents.getByShareToken, { token });
	const { setTheme, resolvedTheme } = useTheme();

	// For v1 documents without content, fall back to prosemirror sync snapshot.
	// V2 documents use document.content directly (Slate JSON from periodic save).
	const isV1 =
		document && (!document.syncVersion || document.syncVersion === "v1");
	const needsPmFallback = isV1 && !document?.content;
	const snapshot = useQuery(
		api.prosemirrorSync.getSnapshot,
		needsPmFallback && document ? { id: document._id } : "skip",
	);

	// Resolve content: v2 docs use document.content (Slate JSON),
	// v1 docs prefer document.content then PM snapshot fallback
	const content = document?.content ?? snapshot?.content ?? undefined;

	const canEdit = document?.defaultPermission === "edit";

	// Loading state
	if (document === undefined) {
		return <PublicDocumentSkeleton />;
	}

	// Not found or not accessible
	if (document === null) {
		return (
			<div className="flex flex-1 flex-col items-center justify-center gap-4 p-8">
				<div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-muted">
					<FileText className="h-8 w-8 text-muted-foreground" />
				</div>
				<div className="text-center space-y-2">
					<h1 className="text-lg font-semibold text-foreground">
						This document is not available
					</h1>
					<p className="text-sm text-muted-foreground max-w-sm leading-relaxed">
						The document may have been removed, made private, or the share link
						may have been regenerated.
					</p>
				</div>
			</div>
		);
	}

	return (
		<>
			{/* Header */}
			<header className="flex h-12 items-center justify-between border-b border-border px-4 sm:px-6 shrink-0">
				<div className="flex items-center gap-2.5 min-w-0">
					<span className="text-sm font-semibold text-foreground tracking-tight shrink-0">
						Clave
					</span>
					<span className="text-muted-foreground/40 shrink-0">/</span>
					{document.icon && <span className="shrink-0">{document.icon}</span>}
					<span className="text-sm text-muted-foreground truncate">
						{document.title}
					</span>
				</div>
				<div className="flex items-center gap-2 shrink-0">
					{canEdit ? (
						<span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
							Editing as Guest
						</span>
					) : (
						<span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
							View only
						</span>
					)}
					<Button
						variant="ghost"
						size="icon"
						onClick={() =>
							setTheme(resolvedTheme === "dark" ? "light" : "dark")
						}
						className="h-8 w-8 text-muted-foreground"
					>
						{resolvedTheme === "dark" ? (
							<Sun className="h-4 w-4" />
						) : (
							<Moon className="h-4 w-4" />
						)}
					</Button>
				</div>
			</header>

			{/* Document content — scrollable within fixed layout */}
			{canEdit ? (
				<main className="flex-1 min-h-0">
					<DocumentEditorDynamic
						documentId={document._id}
						shareMode
						heroSlot={
							<DocumentHero
								documentId={document._id}
								icon={document.icon}
								coverStorageId={document.coverStorageId}
								coverPositionY={document.coverPositionY}
								title={document.title}
								onTitleChange={() => {}}
								onToggleComments={() => {}}
								readOnly
							/>
						}
					/>
				</main>
			) : (
				<main className="flex-1 min-h-0 overflow-y-auto">
					<div className="mx-auto max-w-3xl px-6 py-10 sm:px-8">
						<ShareReadOnlyHero
							icon={document.icon}
							title={document.title}
							coverStorageId={document.coverStorageId}
							coverPositionY={document.coverPositionY}
						/>

						{content ? (
							<DocumentReadOnlyDynamic content={content} />
						) : (
							<p className="text-sm text-muted-foreground italic">
								This document has no content yet.
							</p>
						)}
					</div>
				</main>
			)}

			{/* Footer */}
			<footer className="flex h-10 items-center justify-center border-t border-border shrink-0">
				<p className="text-xs text-muted-foreground">
					Built with <span className="font-medium text-foreground">Clave</span>
				</p>
			</footer>
		</>
	);
}

/** Lightweight read-only hero for the view-only share path (no Plate editor, no mutations). */
function ShareReadOnlyHero({
	icon,
	title,
	coverStorageId,
	coverPositionY,
}: {
	icon?: string;
	title: string;
	coverStorageId?: Id<"_storage">;
	coverPositionY?: number;
}) {
	const coverUrl = useQuery(
		api.files.getUrl,
		coverStorageId ? { storageId: coverStorageId } : "skip",
	);

	return (
		<div className="mb-6">
			{coverUrl && (
				<div className="relative -mx-8 -mt-6 mb-6 h-[200px]">
					<Image
						src={coverUrl}
						alt="Document cover"
						fill
						className="object-cover"
						style={{ objectPosition: `center ${coverPositionY ?? 50}%` }}
						unoptimized
					/>
				</div>
			)}
			<span className="text-5xl leading-none">{icon || "📄"}</span>
			<h1 className="text-4xl font-bold mt-1">{title || "Untitled"}</h1>
		</div>
	);
}

function PublicDocumentSkeleton() {
	return (
		<>
			<header className="flex h-12 items-center justify-between border-b border-border px-4 sm:px-6 shrink-0">
				<div className="flex items-center gap-2.5">
					<Skeleton className="h-4 w-12" />
					<Skeleton className="h-4 w-32" />
				</div>
				<Skeleton className="h-8 w-8 rounded-md" />
			</header>
			<main className="flex-1 min-h-0 overflow-y-auto">
				<div className="mx-auto max-w-3xl px-6 py-10 sm:px-8 space-y-4">
					<Skeleton className="h-10 w-3/4" />
					<div className="space-y-3 pt-4">
						<Skeleton className="h-4 w-full" />
						<Skeleton className="h-4 w-5/6" />
						<Skeleton className="h-4 w-2/3" />
						<Skeleton className="h-4 w-full" />
						<Skeleton className="h-4 w-4/5" />
					</div>
				</div>
			</main>
		</>
	);
}
