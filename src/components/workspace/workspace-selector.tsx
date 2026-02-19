"use client";

import { CaretUpDown, Check, Plus } from "@phosphor-icons/react/dist/ssr";
import { useQuery } from "convex/react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useWorkspaceOptional } from "@/components/providers/workspace-context";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { api } from "../../../convex/_generated/api";
import { CreateWorkspaceDialog } from "./create-workspace-dialog";

export function WorkspaceSelector() {
	const router = useRouter();
	const currentWorkspace = useWorkspaceOptional();
	const workspaces = useQuery(api.workspaces.list);
	const [createOpen, setCreateOpen] = useState(false);

	const handleSwitch = (slug: string) => {
		router.push(`/${slug}/projects`);
	};

	return (
		<>
			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<button
						type="button"
						className="flex w-full items-center justify-between rounded-md p-1 hover:bg-accent cursor-pointer"
					>
						<div className="flex items-center gap-3">
							{currentWorkspace?.logoUrl ? (
								<img
									src={currentWorkspace.logoUrl}
									alt={currentWorkspace.workspaceName}
									className="h-8 w-8 rounded-lg object-cover"
								/>
							) : (
								<div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-800 text-primary-foreground shadow-[inset_0_-5px_6.6px_0_rgba(0,0,0,0.25)]">
									<span className="text-sm font-bold">
										{currentWorkspace?.workspaceName?.[0]?.toUpperCase() || "C"}
									</span>
								</div>
							)}
							<div className="flex flex-col">
								<span className="text-sm font-semibold">
									{currentWorkspace?.workspaceName || "Workspace"}
								</span>
								<span className="text-xs text-muted-foreground">Pro plan</span>
							</div>
						</div>
						<CaretUpDown className="h-4 w-4 text-muted-foreground" />
					</button>
				</DropdownMenuTrigger>
				<DropdownMenuContent align="start" className="w-64">
					{workspaces?.map((ws) => (
						<DropdownMenuItem
							key={ws._id}
							className="cursor-pointer"
							onSelect={() => handleSwitch(ws.slug)}
						>
							<div className="flex h-6 w-6 items-center justify-center rounded bg-blue-800 text-xs font-bold text-white">
								{ws.name[0]?.toUpperCase()}
							</div>
							<span className="flex-1 truncate">{ws.name}</span>
							{currentWorkspace?.workspaceId === ws._id && (
								<Check className="h-4 w-4 text-primary" />
							)}
						</DropdownMenuItem>
					))}
					<DropdownMenuSeparator />
					<DropdownMenuItem
						className="cursor-pointer"
						onSelect={() => setCreateOpen(true)}
					>
						<Plus className="h-4 w-4" />
						<span>Create new workspace</span>
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>

			<CreateWorkspaceDialog open={createOpen} onOpenChange={setCreateOpen} />
		</>
	);
}
