"use client";

import { useQuery } from "convex/react";
import { Moon, PenTool, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { WhiteboardEditorSkeleton } from "@/components/whiteboards/WhiteboardEditor";
import { useResolvedWhiteboardSceneJson } from "@/hooks/use-resolved-whiteboard-scene";
import { api } from "../../../../../convex/_generated/api";
import { WhiteboardEditorDynamic } from "./WhiteboardEditorDynamic";
import { WhiteboardReadOnlyDynamic } from "./WhiteboardReadOnlyDynamic";

type PublicWhiteboardViewProps = {
	token: string;
};

export function PublicWhiteboardView({ token }: PublicWhiteboardViewProps) {
	const whiteboard = useQuery(api.whiteboards.getByShareToken, { token });
	const { sceneJson: resolvedSceneJson, isSceneLoading } =
		useResolvedWhiteboardSceneJson(whiteboard ?? undefined);
	const { setTheme, resolvedTheme } = useTheme();

	// Loading state
	if (whiteboard === undefined) {
		return <PublicWhiteboardSkeleton />;
	}

	// Not found or not accessible
	if (whiteboard === null) {
		return (
			<div className="flex flex-1 flex-col items-center justify-center gap-4 p-8">
				<div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-muted">
					<PenTool className="h-8 w-8 text-muted-foreground" />
				</div>
				<div className="text-center space-y-2">
					<h1 className="text-lg font-semibold text-foreground">
						This whiteboard is not available
					</h1>
					<p className="text-sm text-muted-foreground max-w-sm leading-relaxed">
						The whiteboard may have been removed, made private, or the share
						link may have been regenerated.
					</p>
				</div>
			</div>
		);
	}

	const canEdit = whiteboard.defaultPermission === "edit";

	const readOnlySceneLoading =
		!canEdit && Boolean(whiteboard.sceneDataStorageId) && isSceneLoading;

	return (
		<>
			{/* Header */}
			<header className="flex h-12 items-center justify-between border-b border-border px-4 sm:px-6 shrink-0">
				<div className="flex items-center gap-2.5 min-w-0">
					<span className="text-sm font-semibold text-foreground tracking-tight shrink-0">
						Clave
					</span>
					<span className="text-muted-foreground/40 shrink-0">/</span>
					{whiteboard.icon && (
						<span className="text-sm leading-none shrink-0">
							{whiteboard.icon}
						</span>
					)}
					<span className="text-sm text-muted-foreground truncate">
						{whiteboard.title}
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

			{/* Whiteboard canvas — takes all remaining space */}
			{canEdit ? (
				<main className="relative flex-1 min-h-0">
					<WhiteboardEditorDynamic whiteboardId={whiteboard._id} shareMode />
				</main>
			) : readOnlySceneLoading ? (
				<main className="relative flex-1 min-h-0">
					<WhiteboardEditorSkeleton />
				</main>
			) : (
				<main className="relative flex-1 min-h-0">
					<WhiteboardReadOnlyDynamic
						sceneData={resolvedSceneJson ?? whiteboard.sceneData}
						appState={whiteboard.appState}
					/>
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

function PublicWhiteboardSkeleton() {
	return (
		<>
			<header className="flex h-12 items-center justify-between border-b border-border px-4 sm:px-6 shrink-0">
				<div className="flex items-center gap-2.5">
					<Skeleton className="h-4 w-12" />
					<Skeleton className="h-4 w-24" />
				</div>
				<Skeleton className="h-8 w-8 rounded-md" />
			</header>
			<main className="flex-1 min-h-0 flex items-center justify-center bg-muted/10">
				<div className="flex flex-col items-center gap-3">
					<div className="h-8 w-8 animate-spin rounded-full border-2 border-muted border-t-primary" />
					<p className="text-sm text-muted-foreground">Loading whiteboard...</p>
				</div>
			</main>
		</>
	);
}
