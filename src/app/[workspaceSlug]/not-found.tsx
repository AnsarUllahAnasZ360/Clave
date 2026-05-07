"use client";

import type { Route } from "next";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useWorkspaceOptional } from "@/components/providers/workspace-context";
import { Button } from "@/components/ui/button";

export default function WorkspaceNotFound() {
	const params = useParams();
	// useWorkspaceOptional returns null when this not-found renders above the
	// WorkspaceProvider (e.g. the slug itself is invalid). When it does have a
	// value, we know the workspace exists and only the nested path is missing.
	const workspace = useWorkspaceOptional();
	const slug =
		workspace?.workspaceSlug ?? (params.workspaceSlug as string | undefined);
	const chatHref = slug ? (`/${slug}/chat` as Route) : ("/" as Route);

	return (
		<div className="flex flex-1 flex-col items-center justify-center gap-6 px-4 py-16 text-center">
			<div className="flex flex-col items-center gap-2">
				<p className="font-mono text-xs uppercase tracking-[0.18em] text-sienna-500">
					404
				</p>
				<h1 className="text-2xl font-semibold tracking-tight text-foreground">
					Page not found
				</h1>
				<p className="max-w-sm text-sm text-muted-foreground">
					{workspace
						? "This page doesn't exist in this workspace."
						: "We couldn't find the page you were looking for."}
				</p>
			</div>
			<div className="flex items-center gap-2">
				<Button asChild variant="default" size="sm">
					<Link href={chatHref}>Open chat</Link>
				</Button>
				<Button asChild variant="outline" size="sm">
					<Link href={"/" as Route}>Go home</Link>
				</Button>
			</div>
		</div>
	);
}
