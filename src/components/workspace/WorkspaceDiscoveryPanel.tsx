"use client";

import { Globe } from "@phosphor-icons/react/dist/ssr";

export function WorkspaceDiscoveryPanel() {
	return (
		<div className="flex flex-col items-center gap-2 py-8 text-center">
			<Globe className="h-8 w-8 text-muted-foreground/50" />
			<p className="text-sm text-muted-foreground">
				No public workspaces to discover.
			</p>
			<p className="text-xs text-muted-foreground/70">
				Use an invite code to join a workspace.
			</p>
		</div>
	);
}
