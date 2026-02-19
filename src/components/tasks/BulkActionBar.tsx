"use client";

import {
	CheckCircle,
	Circle,
	CircleNotch,
	Trash,
	User as UserIcon,
	X,
} from "@phosphor-icons/react/dist/ssr";
import { useMutation, useQuery } from "convex/react";
import { useMemo } from "react";
import { toast } from "sonner";
import { useWorkspace } from "@/components/providers/workspace-context";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

type BulkActionBarProps = {
	selectedIds: Set<string>;
	onClearSelection: () => void;
	entityType: "task" | "story";
};

const STATUS_OPTIONS = [
	{
		id: "backlog",
		label: "Backlog",
		icon: <Circle className="h-4 w-4 text-muted-foreground" />,
	},
	{
		id: "todo",
		label: "To do",
		icon: <Circle className="h-4 w-4 text-muted-foreground" />,
	},
	{
		id: "in_progress",
		label: "In progress",
		icon: <CircleNotch className="h-4 w-4 text-yellow-500" />,
	},
	{
		id: "done",
		label: "Done",
		icon: <CheckCircle className="h-4 w-4 text-emerald-500" />,
	},
];

export function BulkActionBar({
	selectedIds,
	onClearSelection,
	entityType,
}: BulkActionBarProps) {
	const { workspaceId } = useWorkspace();
	const members = useQuery(api.workspaceMembers.list, { workspaceId });

	const bulkUpdateTaskStatus = useMutation(api.tasks.bulkUpdateStatus);
	const bulkAssignTask = useMutation(api.tasks.bulkAssign);
	const bulkUpdateStoryStatus = useMutation(api.stories.bulkUpdateStatus);
	const bulkAssignStory = useMutation(api.stories.bulkAssign);

	const memberOptions = useMemo(() => {
		if (!members) return [];
		return members.map((m) => ({
			id: m.userId,
			name: m.user?.name ?? m.user?.email ?? "Unknown",
		}));
	}, [members]);

	const count = selectedIds.size;
	if (count === 0) return null;

	const ids = Array.from(selectedIds);

	const handleBulkStatus = async (status: string) => {
		try {
			if (entityType === "task") {
				await bulkUpdateTaskStatus({
					taskIds: ids as Id<"tasks">[],
					status: status as
						| "backlog"
						| "todo"
						| "in_progress"
						| "in_review"
						| "done"
						| "cancelled",
				});
			} else {
				await bulkUpdateStoryStatus({
					storyIds: ids as Id<"stories">[],
					status: status as
						| "backlog"
						| "triage"
						| "todo"
						| "in_progress"
						| "in_review"
						| "done"
						| "cancelled",
				});
			}
			toast.success(`Updated ${count} items`);
			onClearSelection();
		} catch {
			toast.error("Failed to update status");
		}
	};

	const handleBulkAssign = async (assigneeId: string) => {
		try {
			if (entityType === "task") {
				await bulkAssignTask({
					taskIds: ids as Id<"tasks">[],
					assigneeId: assigneeId as Id<"users">,
				});
			} else {
				await bulkAssignStory({
					storyIds: ids as Id<"stories">[],
					assigneeId: assigneeId as Id<"users">,
				});
			}
			toast.success(`Assigned ${count} items`);
			onClearSelection();
		} catch {
			toast.error("Failed to assign");
		}
	};

	const handleBulkUnassign = async () => {
		try {
			if (entityType === "task") {
				await bulkAssignTask({
					taskIds: ids as Id<"tasks">[],
					assigneeId: undefined,
				});
			} else {
				await bulkAssignStory({
					storyIds: ids as Id<"stories">[],
					assigneeId: undefined,
				});
			}
			toast.success(`Unassigned ${count} items`);
			onClearSelection();
		} catch {
			toast.error("Failed to unassign");
		}
	};

	return (
		<div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 bg-background border border-border shadow-lg rounded-xl px-4 py-2.5">
			<span className="text-sm font-medium">
				{count} {count === 1 ? "item" : "items"} selected
			</span>

			<div className="h-5 w-px bg-border" />

			{/* Status dropdown */}
			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<Button variant="outline" size="sm" className="h-8">
						<CircleNotch className="h-4 w-4 mr-1.5" />
						Status
					</Button>
				</DropdownMenuTrigger>
				<DropdownMenuContent align="center">
					{STATUS_OPTIONS.map((opt) => (
						<DropdownMenuItem
							key={opt.id}
							onClick={() => handleBulkStatus(opt.id)}
						>
							<span className="flex items-center gap-2">
								{opt.icon}
								{opt.label}
							</span>
						</DropdownMenuItem>
					))}
				</DropdownMenuContent>
			</DropdownMenu>

			{/* Assign dropdown */}
			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<Button variant="outline" size="sm" className="h-8">
						<UserIcon className="h-4 w-4 mr-1.5" />
						Assign
					</Button>
				</DropdownMenuTrigger>
				<DropdownMenuContent align="center">
					{memberOptions.map((m) => (
						<DropdownMenuItem key={m.id} onClick={() => handleBulkAssign(m.id)}>
							<span className="flex items-center gap-2">
								<div className="size-5 rounded-full bg-muted flex items-center justify-center text-xs font-bold">
									{m.name.charAt(0)}
								</div>
								{m.name}
							</span>
						</DropdownMenuItem>
					))}
					<DropdownMenuSeparator />
					<DropdownMenuItem onClick={handleBulkUnassign}>
						<span className="flex items-center gap-2 text-muted-foreground">
							<Trash className="h-4 w-4" />
							Unassign
						</span>
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>

			{/* Clear selection */}
			<Button
				variant="ghost"
				size="sm"
				className="h-8"
				onClick={onClearSelection}
			>
				<X className="h-4 w-4" />
			</Button>
		</div>
	);
}
