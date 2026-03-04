"use client";

import { useMutation, useQuery } from "convex/react";
import { ArrowRight, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback } from "react";
import { useWorkspace } from "@/components/providers/workspace-context";
import { Button } from "@/components/ui/button";
import { api } from "../../../convex/_generated/api";

export function DemoWorkspacePopup() {
	const router = useRouter();
	const { workspaceId, workspaceSlug } = useWorkspace();
	const dismissed = useQuery(api.demo.queries.hasDismissedDemoOnboarding);
	const demoWorkspace = useQuery(
		api.demo.queries.getDemoWorkspace,
		workspaceId ? { workspaceId } : "skip",
	);
	const dismiss = useMutation(api.demo.queries.dismissDemoOnboarding);

	const shouldShow =
		dismissed === false &&
		demoWorkspace &&
		demoWorkspace.demoSeedStatus === "complete";

	const handleDismiss = useCallback(() => {
		dismiss();
	}, [dismiss]);

	const handleExplore = useCallback(() => {
		if (demoWorkspace) {
			dismiss();
			router.push(`/${workspaceSlug}/chat`);
		}
	}, [demoWorkspace, workspaceSlug, dismiss, router]);

	if (!shouldShow) return null;

	return (
		<div className="fixed bottom-6 right-6 z-50 w-96 rounded-lg border bg-background shadow-lg animate-in slide-in-from-bottom-4 fade-in duration-300">
			<div className="flex items-start justify-between gap-2 p-4 pb-2">
				<div className="flex items-center gap-2">
					<span className="text-lg">🚀</span>
					<h3 className="text-sm font-semibold">Welcome to Clave</h3>
				</div>
				<Button
					variant="ghost"
					size="icon"
					className="h-6 w-6 shrink-0"
					onClick={handleDismiss}
				>
					<X className="h-3.5 w-3.5" />
				</Button>
			</div>

			<div className="px-4 pb-3">
				<p className="text-xs text-muted-foreground leading-relaxed">
					Explore the demo workspace to discover all of Clave's features and
					capabilities. It's pre-loaded with projects, issues, documents,
					boards, and more — just like a real team workspace.
				</p>
			</div>

			<div className="flex items-center justify-between gap-2 border-t px-4 py-2.5">
				<button
					type="button"
					onClick={handleDismiss}
					className="text-xs text-muted-foreground hover:text-foreground transition-colors"
				>
					Maybe later
				</button>
				<Button size="sm" onClick={handleExplore} className="gap-1.5">
					Explore demo
					<ArrowRight className="h-3.5 w-3.5" />
				</Button>
			</div>
		</div>
	);
}
