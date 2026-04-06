"use client";

import { useMutation } from "convex/react";
import { Flag, Signal, User, X } from "lucide-react";
import { useMemo } from "react";
import { toast } from "sonner";
import { useWorkspaceMembers } from "@/components/providers/workspace-data-context";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
	PRIORITY_ITEMS,
	STATUS_ITEMS,
	type StatusKey,
} from "@/lib/issue-config";
import { cn } from "@/lib/utils";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

export type IssueBulkActionBarProps = {
	selectedIds: Set<string>;
	onClearSelection: () => void;
	/** Sprints available for bulk move (project or workspace scope). */
	sprintOptions: { id: string; name: string }[];
};

export function IssueBulkActionBar({
	selectedIds,
	onClearSelection,
	sprintOptions,
}: IssueBulkActionBarProps) {
	const members = useWorkspaceMembers();
	const bulkUpdateStatus = useMutation(api.issues.bulkUpdateStatus);
	const bulkAssign = useMutation(api.issues.bulkAssign);
	const bulkUpdatePriority = useMutation(api.issues.bulkUpdatePriority);
	const bulkSetSprint = useMutation(api.issues.bulkSetSprint);

	const memberOptions = useMemo(() => {
		if (!members) return [];
		return members.map((m) => ({
			id: m.userId,
			name: m.user?.name ?? m.user?.email ?? "Unknown",
		}));
	}, [members]);

	const count = selectedIds.size;
	if (count === 0) return null;

	const ids = Array.from(selectedIds) as Id<"issues">[];

	const handleBulkStatus = async (
		status:
			| "triage"
			| "backlog"
			| "todo"
			| "in_progress"
			| "in_review"
			| "done"
			| "cancelled",
	) => {
		try {
			await bulkUpdateStatus({ issueIds: ids, status });
			toast.success(`Updated status for ${count} issues`);
			onClearSelection();
		} catch {
			toast.error("Failed to update status");
		}
	};

	const handleBulkAssign = async (assigneeId: string) => {
		try {
			await bulkAssign({
				issueIds: ids,
				assigneeId: assigneeId as Id<"users">,
			});
			toast.success(`Assigned ${count} issues`);
			onClearSelection();
		} catch {
			toast.error("Failed to assign");
		}
	};

	const handleBulkUnassign = async () => {
		try {
			await bulkAssign({ issueIds: ids, assigneeId: undefined });
			toast.success(`Unassigned ${count} issues`);
			onClearSelection();
		} catch {
			toast.error("Failed to unassign");
		}
	};

	const handleBulkPriority = async (
		priority: "urgent" | "high" | "medium" | "low" | "no_priority",
	) => {
		try {
			await bulkUpdatePriority({ issueIds: ids, priority });
			toast.success(`Updated priority for ${count} issues`);
			onClearSelection();
		} catch {
			toast.error("Failed to update priority");
		}
	};

	const handleBulkSprint = async (sprintId: Id<"sprints"> | null) => {
		try {
			await bulkSetSprint({ issueIds: ids, sprintId });
			toast.success(
				sprintId
					? `Moved ${count} issues to sprint`
					: `Cleared sprint for ${count} issues`,
			);
			onClearSelection();
		} catch (e) {
			const msg = e instanceof Error ? e.message : "Failed to update sprint";
			toast.error(msg);
		}
	};

	return (
		<div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex flex-wrap items-center gap-2 sm:gap-3 max-w-[calc(100vw-2rem)] bg-background border border-border shadow-lg rounded-xl px-3 py-2.5 sm:px-4">
			<span className="text-sm font-medium tabular-nums shrink-0">
				{count} selected
			</span>

			<div className="h-5 w-px bg-border shrink-0" />

			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<Button variant="outline" size="sm" className="h-8 gap-1.5">
						<span className="hidden sm:inline">Status</span>
						<span className="sm:hidden">St.</span>
					</Button>
				</DropdownMenuTrigger>
				<DropdownMenuContent
					align="center"
					className="max-h-[min(320px,70vh)] overflow-y-auto"
				>
					{STATUS_ITEMS.map((opt) => {
						const Icon = opt.icon;
						return (
							<DropdownMenuItem
								key={opt.id}
								onClick={() => void handleBulkStatus(opt.id as StatusKey)}
							>
								<span className="flex items-center gap-2">
									<Icon className={cn("h-4 w-4 shrink-0", opt.color)} />
									{opt.label}
								</span>
							</DropdownMenuItem>
						);
					})}
				</DropdownMenuContent>
			</DropdownMenu>

			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<Button variant="outline" size="sm" className="h-8 gap-1.5">
						<Signal className="h-3.5 w-3.5" />
						<span className="hidden sm:inline">Priority</span>
					</Button>
				</DropdownMenuTrigger>
				<DropdownMenuContent align="center">
					{PRIORITY_ITEMS.map((opt) => {
						const Icon = opt.icon;
						return (
							<DropdownMenuItem
								key={opt.id}
								onClick={() =>
									void handleBulkPriority(
										opt.id as
											| "urgent"
											| "high"
											| "medium"
											| "low"
											| "no_priority",
									)
								}
							>
								<span className="flex items-center gap-2">
									<Icon className={cn("h-4 w-4 shrink-0", opt.color)} />
									{opt.label}
								</span>
							</DropdownMenuItem>
						);
					})}
				</DropdownMenuContent>
			</DropdownMenu>

			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<Button variant="outline" size="sm" className="h-8 gap-1.5">
						<User className="h-3.5 w-3.5" />
						Assign
					</Button>
				</DropdownMenuTrigger>
				<DropdownMenuContent
					align="center"
					className="max-h-[min(280px,70vh)] overflow-y-auto"
				>
					{memberOptions.map((m) => (
						<DropdownMenuItem
							key={m.id}
							onClick={() => void handleBulkAssign(m.id)}
						>
							<span className="flex items-center gap-2">
								<span className="size-5 rounded-full bg-muted flex items-center justify-center text-[10px] font-medium">
									{m.name.charAt(0)}
								</span>
								{m.name}
							</span>
						</DropdownMenuItem>
					))}
					<DropdownMenuSeparator />
					<DropdownMenuItem onClick={() => void handleBulkUnassign()}>
						<span className="text-muted-foreground">Unassign</span>
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>

			{sprintOptions.length > 0 ? (
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<Button variant="outline" size="sm" className="h-8 gap-1.5">
							<Flag className="h-3.5 w-3.5" />
							<span className="hidden sm:inline">Sprint</span>
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent
						align="center"
						className="max-h-[min(280px,70vh)] overflow-y-auto"
					>
						<DropdownMenuItem onClick={() => void handleBulkSprint(null)}>
							<span className="text-muted-foreground">No sprint</span>
						</DropdownMenuItem>
						<DropdownMenuSeparator />
						{sprintOptions.map((s) => (
							<DropdownMenuItem
								key={s.id}
								onClick={() => void handleBulkSprint(s.id as Id<"sprints">)}
							>
								{s.name}
							</DropdownMenuItem>
						))}
					</DropdownMenuContent>
				</DropdownMenu>
			) : null}

			<Button
				variant="ghost"
				size="icon"
				className="h-8 w-8 shrink-0"
				onClick={onClearSelection}
				aria-label="Clear selection"
			>
				<X className="h-4 w-4" />
			</Button>
		</div>
	);
}
