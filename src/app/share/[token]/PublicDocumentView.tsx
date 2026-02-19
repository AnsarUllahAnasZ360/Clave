"use client";

import { useQuery } from "convex/react";
import { FileText } from "lucide-react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "../../../../convex/_generated/api";
import { DocumentReadOnlyDynamic } from "./DocumentReadOnlyDynamic";

type PublicDocumentViewProps = {
	token: string;
};

export function PublicDocumentView({ token }: PublicDocumentViewProps) {
	const document = useQuery(api.documents.getByShareToken, { token });
	const { setTheme, resolvedTheme } = useTheme();

	// Loading state
	if (document === undefined) {
		return <PublicDocumentSkeleton />;
	}

	// Not found or not accessible
	if (document === null) {
		return (
			<div className="flex flex-1 flex-col items-center justify-center gap-4 p-8">
				<FileText className="h-12 w-12 text-muted-foreground" />
				<h1 className="text-xl font-semibold text-foreground">
					This document is not available
				</h1>
				<p className="text-sm text-muted-foreground text-center max-w-md">
					The document may have been removed, made private, or the share link
					may have been regenerated.
				</p>
			</div>
		);
	}

	return (
		<>
			{/* Header */}
			<header className="flex items-center justify-between border-b border-border px-6 py-3 shrink-0">
				<div className="flex items-center gap-2">
					<span className="text-sm font-semibold text-foreground tracking-tight">
						Clave
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

			{/* Document content */}
			<main className="flex-1 overflow-auto px-6 py-8 sm:px-8">
				<div className="mx-auto max-w-3xl">
					{/* Document title */}
					<h1 className="text-3xl font-bold text-foreground mb-6">
						{document.icon && <span className="mr-2">{document.icon}</span>}
						{document.title}
					</h1>

					{/* Read-only content */}
					<DocumentReadOnlyDynamic content={document.content} />
				</div>
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

function PublicDocumentSkeleton() {
	return (
		<>
			<header className="flex items-center justify-between border-b border-border px-6 py-3">
				<Skeleton className="h-5 w-16" />
				<Skeleton className="h-8 w-24" />
			</header>
			<main className="flex-1 px-6 py-8 sm:px-8">
				<div className="mx-auto max-w-3xl space-y-4">
					<Skeleton className="h-10 w-3/4" />
					<Skeleton className="h-4 w-full" />
					<Skeleton className="h-4 w-5/6" />
					<Skeleton className="h-4 w-2/3" />
					<Skeleton className="h-4 w-full" />
					<Skeleton className="h-4 w-4/5" />
				</div>
			</main>
		</>
	);
}
