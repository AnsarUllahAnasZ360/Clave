"use client";

import { X } from "@phosphor-icons/react/dist/ssr";
import { useMutation, useQuery } from "convex/react";
import { useCallback } from "react";
import { useCurrentUser } from "@/components/providers/workspace-data-context";
import { Button } from "@/components/ui/button";
import { api } from "../../../convex/_generated/api";

export function WhatsNewPopup() {
	const user = useCurrentUser();
	const latestVersion = useQuery(api.versions.getLatest);
	const markSeen = useMutation(api.versions.markSeen);

	const shouldShow =
		user && latestVersion && user.lastSeenVersion !== latestVersion.version;

	const handleDismiss = useCallback(() => {
		if (latestVersion) {
			markSeen({ version: latestVersion.version });
		}
	}, [latestVersion, markSeen]);

	if (!shouldShow) return null;

	return (
		<div className="fixed bottom-6 right-6 z-50 w-80 rounded-lg border bg-background shadow-lg animate-in slide-in-from-bottom-4 fade-in duration-300">
			<div className="flex items-start justify-between gap-2 p-4 pb-2">
				<div>
					<h3 className="text-sm font-semibold">
						What's New in v{latestVersion.version}
					</h3>
					<p className="text-xs text-muted-foreground">{latestVersion.title}</p>
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
				{latestVersion.features.length > 0 && (
					<ul className="space-y-1">
						{latestVersion.features.slice(0, 5).map((feature) => (
							<li
								key={feature}
								className="text-xs text-muted-foreground flex gap-1.5"
							>
								<span className="text-emerald-500 shrink-0">+</span>
								{feature}
							</li>
						))}
						{latestVersion.features.length > 5 && (
							<li className="text-xs text-muted-foreground">
								and {latestVersion.features.length - 5} more...
							</li>
						)}
					</ul>
				)}
			</div>

			<div className="flex items-center justify-between gap-2 border-t px-4 py-2">
				<a
					href="/changelog"
					className="text-xs text-muted-foreground hover:text-foreground transition-colors"
				>
					View all changes
				</a>
				<Button variant="ghost" size="sm" onClick={handleDismiss}>
					Dismiss
				</Button>
			</div>
		</div>
	);
}
