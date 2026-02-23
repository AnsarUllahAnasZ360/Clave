"use client";

import {
	Circle,
	CircleNotch,
	CopySimple,
	PencilSimpleLine,
	Plus,
	Robot,
	ShieldCheck,
	SlidersHorizontal,
	Sparkle,
	TrashSimple,
} from "@phosphor-icons/react/dist/ssr";
import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { toast } from "sonner";
import { useWorkspaceOptional } from "@/components/providers/workspace-context";
import { useCurrentUser } from "@/components/providers/workspace-data-context";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
	AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { SubAgentDialog } from "./SubAgentDialog";
import { PaneDescription, PaneTitle } from "./settings-shared";
export function SubAgentsSettingsPane() {
	const workspace = useWorkspaceOptional();
	const currentUser = useCurrentUser();
	const agents = useQuery(
		api.ai.subAgents.list,
		workspace ? { workspaceId: workspace.workspaceId } : "skip",
	);
	const removeAgent = useMutation(api.ai.subAgents.remove);

	// Dialog state
	const [dialogOpen, setDialogOpen] = useState(false);
	const [dialogMode, setDialogMode] = useState<"create" | "edit" | "duplicate">(
		"create",
	);
	const [dialogAgent, setDialogAgent] = useState<
		NonNullable<typeof agents>[number] | undefined
	>(undefined);

	type SubAgent = NonNullable<typeof agents>[number];
	const presets = agents?.filter((a: SubAgent) => a.isPreset) ?? [];
	const personal =
		agents?.filter(
			(a: SubAgent) =>
				!a.isPreset && currentUser && a.createdBy === currentUser._id,
		) ?? [];
	const shared =
		agents?.filter(
			(a: SubAgent) =>
				!a.isPreset &&
				a.isShared &&
				currentUser &&
				a.createdBy !== currentUser._id,
		) ?? [];

	const openCreateDialog = () => {
		setDialogAgent(undefined);
		setDialogMode("create");
		setDialogOpen(true);
	};

	const openEditDialog = (agent: NonNullable<typeof agents>[number]) => {
		setDialogAgent(agent);
		setDialogMode("edit");
		setDialogOpen(true);
	};

	const openDuplicateDialog = (agent: NonNullable<typeof agents>[number]) => {
		setDialogAgent(agent);
		setDialogMode("duplicate");
		setDialogOpen(true);
	};

	const handleDelete = async (agentId: Id<"subAgents">) => {
		try {
			await removeAgent({ id: agentId });
			toast.success("Agent deleted");
		} catch {
			toast.error("Failed to delete agent");
		}
	};

	const renderAgentCard = (agent: NonNullable<typeof agents>[number]) => (
		<div
			key={agent._id}
			className="rounded-2xl border border-border bg-card/70 p-4"
		>
			<div className="flex items-start justify-between gap-3">
				<div className="flex items-start gap-3 min-w-0">
					<div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary text-lg">
						{agent.avatar ?? <Robot className="h-5 w-5" />}
					</div>
					<div className="min-w-0 space-y-1">
						<div className="flex flex-wrap items-center gap-2">
							<span className="text-sm font-semibold text-foreground truncate">
								{agent.name}
							</span>
							<span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-semibold text-emerald-400">
								<span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
								Active
							</span>
							<span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
								{agent.model ?? "Default"}
							</span>
						</div>
						<p className="text-xs text-muted-foreground line-clamp-2">
							{agent.description}
						</p>
					</div>
				</div>
				<div className="flex shrink-0 items-center gap-1">
					<Button
						variant="ghost"
						size="icon"
						className="h-8 w-8 text-muted-foreground hover:text-foreground"
						onClick={() => openEditDialog(agent)}
					>
						<PencilSimpleLine className="h-4 w-4" />
					</Button>
					<Button
						variant="ghost"
						size="icon"
						className="h-8 w-8 text-muted-foreground hover:text-foreground"
						onClick={() => openDuplicateDialog(agent)}
					>
						<CopySimple className="h-4 w-4" />
					</Button>
					{!agent.isPreset && (
						<AlertDialog>
							<AlertDialogTrigger asChild>
								<Button
									variant="ghost"
									size="icon"
									className="h-8 w-8 text-muted-foreground hover:text-destructive"
								>
									<TrashSimple className="h-4 w-4" />
								</Button>
							</AlertDialogTrigger>
							<AlertDialogContent>
								<AlertDialogHeader>
									<AlertDialogTitle>Delete agent</AlertDialogTitle>
									<AlertDialogDescription>
										Are you sure you want to delete &ldquo;{agent.name}
										&rdquo;? This action cannot be undone.
									</AlertDialogDescription>
								</AlertDialogHeader>
								<AlertDialogFooter>
									<AlertDialogCancel>Cancel</AlertDialogCancel>
									<AlertDialogAction onClick={() => handleDelete(agent._id)}>
										Delete
									</AlertDialogAction>
								</AlertDialogFooter>
							</AlertDialogContent>
						</AlertDialog>
					)}
				</div>
			</div>
		</div>
	);

	const renderSection = (
		title: string,
		items: NonNullable<typeof agents>,
		emptyMessage?: string,
	) => (
		<div className="space-y-3">
			<h3 className="text-sm font-semibold text-foreground">{title}</h3>
			{items.length > 0 ? (
				<div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
					{items.map(renderAgentCard)}
				</div>
			) : emptyMessage ? (
				<div className="rounded-2xl border border-dashed border-border bg-muted/20 p-6 text-center">
					<Robot className="mx-auto h-8 w-8 text-muted-foreground/50" />
					<p className="mt-2 text-sm text-muted-foreground">{emptyMessage}</p>
				</div>
			) : null}
		</div>
	);

	const isLoading = agents === undefined;

	return (
		<div className="space-y-8">
			<div className="flex flex-wrap items-start justify-between gap-4">
				<div>
					<PaneTitle className="text-xl">Agents</PaneTitle>
					<PaneDescription className="mt-1">
						Create specialized AI teammates with custom instructions, tools, and
						knowledge filters.
					</PaneDescription>
				</div>
				<Button size="sm" className="gap-2" onClick={openCreateDialog}>
					<Plus className="h-4 w-4" />
					Create agent
				</Button>
			</div>

			<Separator />

			{isLoading ? (
				<div className="flex items-center justify-center py-12">
					<CircleNotch className="h-6 w-6 animate-spin text-muted-foreground" />
				</div>
			) : (
				<>
					{presets.length > 0 && renderSection("Presets", presets)}
					{renderSection(
						"Your agents",
						personal,
						"You haven\u2019t created any agents yet. Click \u201cCreate agent\u201d to get started.",
					)}
					{shared.length > 0 && renderSection("Shared agents", shared)}
				</>
			)}

			<SubAgentDialog
				open={dialogOpen}
				onOpenChange={setDialogOpen}
				mode={dialogMode}
				agent={dialogAgent}
			/>
		</div>
	);
}

export const AgentsSettingsPane = SubAgentsSettingsPane;
