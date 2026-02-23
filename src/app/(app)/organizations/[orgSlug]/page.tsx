"use client";

import {
	ArrowLeft,
	BuildingOffice,
	Gear,
	Globe,
	Lock,
	Plus,
	SignIn,
	Users,
} from "@phosphor-icons/react/dist/ssr";
import { useMutation, useQuery } from "convex/react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useOrganization } from "@/components/providers/organization-context";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { CreateWorkspaceDialog } from "@/components/workspace/create-workspace-dialog";
import { JoinOrDiscoverDialog } from "@/components/workspace/JoinOrDiscoverDialog";
import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";

type OrganizationWorkspace = {
	_id: Id<"workspaces">;
	name: string;
	slug: string;
	visibility?: "public" | "private";
	description?: string;
	isMember: boolean;
	memberCount: number;
};

const workspaceColors = [
	"bg-blue-800",
	"bg-emerald-800",
	"bg-violet-800",
	"bg-amber-800",
	"bg-rose-800",
	"bg-cyan-800",
	"bg-indigo-800",
];

function getWorkspaceColor(name: string): string {
	let hash = 0;
	for (let i = 0; i < name.length; i++)
		hash = name.charCodeAt(i) + ((hash << 5) - hash);
	return workspaceColors[Math.abs(hash) % workspaceColors.length];
}

export default function OrganizationDetailPage() {
	const router = useRouter();
	const organization = useOrganization();

	const workspaces = useQuery(api.workspaces.listByOrganization, {
		organizationId: organization.organizationId,
	});
	const myRole = useQuery(api.organizationMembers.myRole, {
		organizationId: organization.organizationId,
	});
	const fixOrphans = useMutation(api.workspaces.fixOrphanWorkspaces);
	const joinPublicWorkspace = useMutation(api.workspaces.joinPublicWorkspace);

	const [createWorkspaceOpen, setCreateWorkspaceOpen] = useState(false);
	const [joinWorkspaceOpen, setJoinWorkspaceOpen] = useState(false);
	const [joiningWorkspaceId, setJoiningWorkspaceId] =
		useState<Id<"workspaces"> | null>(null);

	const orphanFixRan = useRef(false);
	useEffect(() => {
		if (orphanFixRan.current || !myRole?.role) return;
		orphanFixRan.current = true;
		fixOrphans({ organizationId: organization.organizationId })
			.then((count) => {
				if (count > 0) {
					toast.success(
						`Adopted ${count} orphan workspace${count > 1 ? "s" : ""}`,
					);
				}
			})
			.catch(() => {
				/* user may not be admin — silently ignore */
			});
	}, [myRole, fixOrphans, organization.organizationId]);

	const handleJoinAndOpen = async (
		workspaceId: Id<"workspaces">,
		workspaceSlug: string,
	) => {
		setJoiningWorkspaceId(workspaceId);
		try {
			await joinPublicWorkspace({ workspaceId });
			toast.success("Joined workspace");
			router.push(`/${organization.orgSlug}/${workspaceSlug}/projects`);
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Failed to join workspace",
			);
		} finally {
			setJoiningWorkspaceId(null);
		}
	};

	const handleCardClick = (workspace: OrganizationWorkspace) => {
		if (joiningWorkspaceId) return;
		if (workspace.isMember) {
			router.push(`/${organization.orgSlug}/${workspace.slug}/projects`);
		} else {
			handleJoinAndOpen(workspace._id, workspace.slug);
		}
	};

	const isLoading = workspaces === undefined || myRole === undefined;
	const isAdmin = myRole?.role === "admin" || myRole?.role === "owner";

	return (
		<>
			<div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-6 py-12">
				<header className="flex flex-col gap-4 border-b border-border/50 pb-5 sm:flex-row sm:items-center sm:justify-between">
					<div className="space-y-2">
						<Button
							variant="ghost"
							size="sm"
							className="-ml-2 w-fit gap-1.5 text-muted-foreground"
							onClick={() => router.push("/organizations")}
						>
							<ArrowLeft className="h-4 w-4" />
							All organizations
						</Button>
						<div>
							<h1 className="text-xl font-semibold tracking-tight">
								{organization.orgName}
							</h1>
							<p className="mt-1 text-sm text-muted-foreground">
								Select a workspace to get started.
							</p>
						</div>
					</div>
					<div className="flex flex-wrap items-center gap-2">
						<Button
							variant="outline"
							size="sm"
							className="gap-1.5"
							onClick={() => setJoinWorkspaceOpen(true)}
						>
							<SignIn className="h-3.5 w-3.5" />
							Join
						</Button>
						<Button
							variant="outline"
							size="sm"
							className="gap-1.5"
							onClick={() => setCreateWorkspaceOpen(true)}
						>
							<Plus className="h-3.5 w-3.5" />
							Create
						</Button>
						<Button
							size="sm"
							className="gap-1.5"
							onClick={() =>
								router.push(`/organizations/${organization.orgSlug}/settings`)
							}
						>
							<Gear className="h-3.5 w-3.5" />
							{isAdmin ? "Settings" : "View settings"}
						</Button>
					</div>
				</header>

				{isLoading ? (
					<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
						{[1, 2, 3].map((item) => (
							<div
								key={item}
								className="h-44 animate-pulse rounded-xl border border-border bg-muted/30"
							/>
						))}
					</div>
				) : workspaces && workspaces.length > 0 ? (
					<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
						{workspaces.map((workspace: OrganizationWorkspace) => (
							<Card
								key={workspace._id}
								className={`group h-full cursor-pointer border-border/60 transition-all hover:border-foreground/15 hover:shadow-md ${
									joiningWorkspaceId === workspace._id
										? "opacity-70 pointer-events-none"
										: ""
								}`}
								role="link"
								tabIndex={0}
								onClick={() => handleCardClick(workspace)}
								onKeyDown={(e) => {
									if (e.key === "Enter" || e.key === " ") {
										e.preventDefault();
										handleCardClick(workspace);
									}
								}}
							>
								<CardHeader className="space-y-3 pb-3">
									<div className="flex items-start justify-between gap-3">
										<div className="flex items-center gap-3 min-w-0">
											<div
												className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${getWorkspaceColor(workspace.name)} text-white shadow-[inset_0_-5px_6.6px_0_rgba(0,0,0,0.25)]`}
											>
												<span className="text-sm font-bold">
													{workspace.name[0]?.toUpperCase()}
												</span>
											</div>
											<div className="min-w-0">
												<CardTitle className="truncate text-base">
													{workspace.name}
												</CardTitle>
												<CardDescription className="mt-0.5 truncate text-xs">
													/{workspace.slug}
												</CardDescription>
											</div>
										</div>
										<div className="flex flex-wrap items-center justify-end gap-1.5 shrink-0">
											<Badge
												variant="secondary"
												className="gap-1 capitalize text-[11px] px-1.5 py-0"
											>
												{(workspace.visibility ?? "public") === "public" ? (
													<Globe className="h-3 w-3" />
												) : (
													<Lock className="h-3 w-3" />
												)}
												{workspace.visibility ?? "public"}
											</Badge>
											{workspace.isMember && (
												<Badge
													variant="secondary"
													className="text-[11px] px-1.5 py-0"
												>
													Member
												</Badge>
											)}
										</div>
									</div>
								</CardHeader>
								<CardContent className="pt-0">
									<p className="line-clamp-2 text-sm text-muted-foreground mb-3">
										{workspace.description?.trim() || "No description yet."}
									</p>
									<div className="flex items-center gap-1.5 text-xs text-muted-foreground/70">
										<Users className="h-3.5 w-3.5" />
										{workspace.memberCount} member
										{workspace.memberCount === 1 ? "" : "s"}
									</div>
								</CardContent>
							</Card>
						))}
					</div>
				) : (
					<Card className="border-dashed">
						<CardContent className="flex flex-col items-center gap-4 py-12 text-center">
							<div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
								<BuildingOffice className="h-6 w-6" />
							</div>
							<div>
								<p className="text-base font-medium">No workspaces yet</p>
								<p className="mt-1 text-sm text-muted-foreground">
									Create the first workspace for this organization.
								</p>
							</div>
							<Button onClick={() => setCreateWorkspaceOpen(true)}>
								Create workspace
							</Button>
						</CardContent>
					</Card>
				)}
			</div>

			<CreateWorkspaceDialog
				open={createWorkspaceOpen}
				onOpenChange={setCreateWorkspaceOpen}
				organizationId={organization.organizationId}
			/>
			<JoinOrDiscoverDialog
				open={joinWorkspaceOpen}
				onOpenChange={setJoinWorkspaceOpen}
				onJoined={() => toast.success("Joined workspace")}
			/>
		</>
	);
}
