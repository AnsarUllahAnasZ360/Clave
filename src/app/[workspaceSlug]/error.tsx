"use client";

import type { Route } from "next";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";

export default function WorkspaceRouteError({
	error,
	reset,
}: {
	error: Error & { digest?: string };
	reset: () => void;
}) {
	const params = useParams();
	const slug = params.workspaceSlug as string | undefined;

	useEffect(() => {
		// Boundary at the workspace level so a thrown query in a single page
		// doesn't take down the sidebar/chat shell.
		console.error("Workspace route error boundary caught:", error);
	}, [error]);

	return (
		<div className="flex flex-1 flex-col items-center justify-center gap-6 px-4 py-16 text-center">
			<div className="flex flex-col items-center gap-2">
				<p className="font-mono text-xs uppercase tracking-[0.18em] text-sienna-500">
					Error
				</p>
				<h1 className="text-2xl font-semibold tracking-tight text-foreground">
					Something went wrong
				</h1>
				<p className="max-w-sm text-sm text-muted-foreground">
					This page hit an unexpected error. The rest of the workspace is still
					available — try again or jump to chat.
				</p>
				{error.digest ? (
					<p className="mt-2 font-mono text-[11px] text-muted-foreground/70">
						Reference: {error.digest}
					</p>
				) : null}
			</div>
			<div className="flex items-center gap-2">
				<Button onClick={() => reset()} variant="default" size="sm">
					Try again
				</Button>
				{slug ? (
					<Button asChild variant="outline" size="sm">
						<Link href={`/${slug}/chat` as Route}>Open chat</Link>
					</Button>
				) : (
					<Button asChild variant="outline" size="sm">
						<Link href={"/" as Route}>Go home</Link>
					</Button>
				)}
			</div>
		</div>
	);
}
