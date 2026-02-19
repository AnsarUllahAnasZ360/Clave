"use client";

import { useQuery } from "convex/react";
import { PenTool } from "lucide-react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "../../../../../convex/_generated/api";
import { WhiteboardReadOnlyDynamic } from "./WhiteboardReadOnlyDynamic";

type PublicWhiteboardViewProps = {
	token: string;
};

export function PublicWhiteboardView({ token }: PublicWhiteboardViewProps) {
	const whiteboard = useQuery(api.whiteboards.getByShareToken, { token });
	const { setTheme, resolvedTheme } = useTheme();

	// Loading state
	if (whiteboard === undefined) {
		return <PublicWhiteboardSkeleton />;
	}

	// Not found or not accessible
	if (whiteboard === null) {
		return (
			<div className="flex flex-1 flex-col items-center justify-center gap-4 p-8">
				<PenTool className="h-12 w-12 text-muted-foreground" />
				<h1 className="text-xl font-semibold text-foreground">
					This whiteboard is not available
				</h1>
				<p className="text-sm text-muted-foreground text-center max-w-md">
					The whiteboard may have been removed, made private, or the share link
					may have been regenerated.
				</p>
			</div>
		);
	}

	return (
		<>
			{/* Header */}
			<header className="flex items-center justify-between border-b border-border px-6 py-3 shrink-0">
				<div className="flex items-center gap-3">
					<span className="text-sm font-semibold text-foreground tracking-tight">
						Clave
					</span>
					<span className="text-sm text-muted-foreground">
						{whiteboard.title}
					</span>
				</div>
				<div className="flex items-center gap-2">
					<Button
						variant="ghost"
						size="sm"
						onClick={() =>
							setTheme(resolvedTheme === "dark" ? "light" : "dark")
						}
						className="text-xs text-muted-foreground"
					>
						{resolvedTheme === "dark" ? "Light mode" : "Dark mode"}
					</Button>
				</div>
			</header>

			{/* Whiteboard canvas */}
			<main className="flex-1 min-h-0">
				<WhiteboardReadOnlyDynamic
					sceneData={whiteboard.sceneData}
					appState={whiteboard.appState}
				/>
			</main>

			{/* Footer */}
			<footer className="border-t border-border px-6 py-3 shrink-0">
				<p className="text-xs text-muted-foreground text-center">
					Built with <span className="font-medium text-foreground">Clave</span>
				</p>
			</footer>
		</>
	);
}

function PublicWhiteboardSkeleton() {
	return (
		<>
			<header className="flex items-center justify-between border-b border-border px-6 py-3">
				<Skeleton className="h-5 w-16" />
				<Skeleton className="h-8 w-24" />
			</header>
			<main className="flex-1 flex items-center justify-center bg-muted/20">
				<div className="flex flex-col items-center gap-3">
					<div className="h-10 w-10 animate-spin rounded-full border-2 border-muted border-t-sienna-9" />
					<p className="text-sm text-muted-foreground">Loading whiteboard...</p>
				</div>
			</main>
		</>
	);
}
