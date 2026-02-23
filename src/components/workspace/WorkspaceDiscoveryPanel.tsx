"use client";

import { Globe, SignIn, Users } from "@phosphor-icons/react/dist/ssr";
import { useMutation, useQuery } from "convex/react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { useOrganizationOptional } from "@/components/providers/organization-context";
import { Button } from "@/components/ui/button";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

export function WorkspaceDiscoveryPanel() {
	const router = useRouter();
	const currentOrg = useOrganizationOptional();
	const orgWorkspaces = useQuery(
		api.workspaces.listByOrganization,
		currentOrg ? { organizationId: currentOrg.organizationId } : "skip",
	);
	const joinWorkspace = useMutation(api.workspaces.joinPublicWorkspace);
	const [joiningId, setJoiningId] = useState<Id<"workspaces"> | null>(null);

	// Filter to public workspaces the user hasn't joined
	const discoverableWorkspaces = orgWorkspaces?.filter(
		(ws) => !ws.isMember && (ws.visibility ?? "public") === "public",
	);

	const handleJoin = async (workspaceId: Id<"workspaces">, slug: string) => {
		if (!currentOrg) return;
		setJoiningId(workspaceId);
		try {
			await joinWorkspace({ workspaceId });
			toast.success("Joined workspace");
			router.push(`/${currentOrg.orgSlug}/${slug}/projects`);
		} catch (e) {
			toast.error(e instanceof Error ? e.message : "Failed to join workspace");
		} finally {
			setJoiningId(null);
		}
	};

	if (!currentOrg) {
		return (
			<div className="py-8 text-center text-sm text-muted-foreground">
				Join an organization to discover workspaces.
			</div>
		);
	}

	if (!orgWorkspaces) {
		return (
			<div className="space-y-3 py-2">
				{[1, 2, 3].map((i) => (
					<div
						key={i}
						className="h-16 animate-pulse rounded-lg border border-border bg-muted/50"
					/>
				))}
			</div>
		);
	}

	if (!discoverableWorkspaces || discoverableWorkspaces.length === 0) {
		return (
			<div className="flex flex-col items-center gap-2 py-8 text-center">
				<Globe className="h-8 w-8 text-muted-foreground/50" />
				<p className="text-sm text-muted-foreground">
					No public workspaces to join.
				</p>
				<p className="text-xs text-muted-foreground/70">
					Ask your org admin to create a public workspace.
				</p>
			</div>
		);
	}

	return (
		<div className="space-y-2">
			{discoverableWorkspaces.map((ws) => (
				<div
					key={ws._id}
					className="flex items-center gap-3 rounded-lg border border-border p-3 transition-colors hover:bg-accent/50"
				>
					<div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-muted text-sm font-bold text-muted-foreground">
						{ws.name[0]?.toUpperCase()}
					</div>
					<div className="flex-1 min-w-0">
						<div className="flex items-center gap-2">
							<span className="text-sm font-medium truncate">{ws.name}</span>
							<span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
								<Globe className="h-2.5 w-2.5" />
								Public
							</span>
						</div>
						<div className="flex items-center gap-2 mt-0.5">
							{ws.description && (
								<span className="text-xs text-muted-foreground truncate">
									{ws.description}
								</span>
							)}
							<span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
								<Users className="h-3 w-3" />
								{ws.memberCount}
							</span>
						</div>
					</div>
					<Button
						size="sm"
						variant="outline"
						className="shrink-0 gap-1.5"
						onClick={() => handleJoin(ws._id, ws.slug)}
						disabled={joiningId === ws._id}
					>
						{joiningId === ws._id ? (
							"Joining..."
						) : (
							<>
								<SignIn className="h-3.5 w-3.5" />
								Join
							</>
						)}
					</Button>
				</div>
			))}
		</div>
	);
}
