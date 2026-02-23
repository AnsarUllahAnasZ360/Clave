"use client";

import {
	Buildings,
	CaretUpDown,
	Check,
	Plus,
	SignIn,
} from "@phosphor-icons/react/dist/ssr";
import { useQuery } from "convex/react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useOrganizationOptional } from "@/components/providers/organization-context";
import { useWorkspaceOptional } from "@/components/providers/workspace-context";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useSidebar } from "@/components/ui/sidebar";
import { api } from "../../../convex/_generated/api";
import { CreateWorkspaceDialog } from "./create-workspace-dialog";
import { JoinOrDiscoverDialog } from "./JoinOrDiscoverDialog";

type OrganizationWorkspaceOption = {
	_id: string;
	name: string;
	slug: string;
	isMember: boolean;
};

export function WorkspaceSelector() {
	const router = useRouter();
	const currentOrg = useOrganizationOptional();
	const currentWorkspace = useWorkspaceOptional();
	const { state, setOpen: setSidebarOpen } = useSidebar();
	const [createWsOpen, setCreateWsOpen] = useState(false);
	const [joinWsOpen, setJoinWsOpen] = useState(false);
	const [isOpen, setIsOpen] = useState(false);
	const [queuedOpen, setQueuedOpen] = useState(false);

	const orgWorkspaces = useQuery(
		api.workspaces.listByOrganization,
		currentOrg ? { organizationId: currentOrg.organizationId } : "skip",
	);

	const isCollapsed = state === "collapsed";
	const hasOrgWorkspace = Boolean(currentOrg && currentWorkspace);

	const triggerIcon = (
		<Avatar
			className={
				isCollapsed
					? "h-7 w-7 shrink-0 rounded-full bg-blue-800 text-primary-foreground shadow-[inset_0_-5px_6.6px_0_rgba(0,0,0,0.25)]"
					: "h-8 w-8 shrink-0 rounded-full bg-blue-800 text-primary-foreground shadow-[inset_0_-5px_6.6px_0_rgba(0,0,0,0.25)]"
			}
		>
			{currentWorkspace?.logoUrl ? (
				<AvatarImage
					src={currentWorkspace.logoUrl}
					alt={currentWorkspace.workspaceName}
					className="object-cover"
				/>
			) : (
				<AvatarFallback
					className={isCollapsed ? "text-xs font-bold" : "text-sm font-bold"}
				>
					{currentWorkspace?.workspaceName?.[0]?.toUpperCase() || "W"}
				</AvatarFallback>
			)}
		</Avatar>
	);

	const handleOpenChange = (nextOpen: boolean) => {
		if (!nextOpen) {
			setIsOpen(false);
			setQueuedOpen(false);
			return;
		}

		if (isCollapsed) {
			setSidebarOpen(true);
			setQueuedOpen(true);
			return;
		}

		setIsOpen(true);
	};

	const handleSwitchWorkspace = (slug: string) => {
		if (!currentOrg || slug === currentWorkspace?.workspaceSlug) return;
		router.push(`/${currentOrg.orgSlug}/${slug}/projects`);
	};

	useEffect(() => {
		if (!queuedOpen || isCollapsed) return;
		setIsOpen(true);
		setQueuedOpen(false);
	}, [isCollapsed, queuedOpen]);

	if (!hasOrgWorkspace) {
		return (
			<div className="flex items-center gap-3 rounded-md p-1">
				<div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-800 text-primary-foreground shadow-[inset_0_-5px_6.6px_0_rgba(0,0,0,0.25)]">
					<span className="text-sm font-bold">W</span>
				</div>
				<span className="text-sm font-semibold">Workspace</span>
			</div>
		);
	}

	return (
		<>
			<DropdownMenu open={isOpen} onOpenChange={handleOpenChange}>
				<DropdownMenuTrigger asChild>
					<button
						type="button"
						className={
							isCollapsed
								? "flex h-7 w-7 items-center justify-center rounded-md p-0 hover:bg-accent/80 cursor-pointer"
								: "flex w-full min-w-0 items-center justify-between rounded-md p-1 hover:bg-accent cursor-pointer"
						}
					>
						<div className="flex min-w-0 items-center gap-3">
							{triggerIcon}
							<div className={isCollapsed ? "hidden" : "min-w-0"}>
								<p className="truncate text-sm font-semibold">
									{currentWorkspace.workspaceName}
								</p>
								<p className="truncate text-xs text-muted-foreground">
									{currentOrg.orgName}
								</p>
							</div>
						</div>
						<CaretUpDown
							className={`h-4 w-4 shrink-0 text-muted-foreground${
								isCollapsed ? " hidden" : ""
							}`}
						/>
					</button>
				</DropdownMenuTrigger>
				<DropdownMenuContent align="start" className="w-64">
					<DropdownMenuLabel>{currentOrg.orgName}</DropdownMenuLabel>
					<DropdownMenuSeparator />
					{(orgWorkspaces ?? []).map(
						(workspace: OrganizationWorkspaceOption) => (
							<DropdownMenuItem
								key={workspace._id}
								className={
									workspace.isMember
										? "cursor-pointer"
										: "cursor-pointer opacity-50"
								}
								onSelect={() => handleSwitchWorkspace(workspace.slug)}
							>
								<div className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-800 text-xs font-bold text-white">
									{workspace.name[0]?.toUpperCase()}
								</div>
								<span className="flex-1 truncate">{workspace.name}</span>
								{!workspace.isMember && (
									<span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
										Join
									</span>
								)}
								{workspace.isMember &&
									currentWorkspace.workspaceId === workspace._id && (
										<Check className="h-4 w-4 text-primary" />
									)}
							</DropdownMenuItem>
						),
					)}
					<DropdownMenuSeparator />
					<DropdownMenuItem
						className="cursor-pointer"
						onSelect={() => setCreateWsOpen(true)}
					>
						<Plus className="h-4 w-4" />
						<span>Create workspace</span>
					</DropdownMenuItem>
					<DropdownMenuItem
						className="cursor-pointer"
						onSelect={() => setJoinWsOpen(true)}
					>
						<SignIn className="h-4 w-4" />
						<span>Join workspace</span>
					</DropdownMenuItem>
					<DropdownMenuSeparator />
					<DropdownMenuItem
						className="cursor-pointer"
						onSelect={() => router.push("/organizations")}
					>
						<Buildings className="h-4 w-4" />
						<span>Switch organization</span>
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>

			<CreateWorkspaceDialog
				open={createWsOpen}
				onOpenChange={setCreateWsOpen}
				organizationId={currentOrg.organizationId}
			/>
			<JoinOrDiscoverDialog open={joinWsOpen} onOpenChange={setJoinWsOpen} />
		</>
	);
}
