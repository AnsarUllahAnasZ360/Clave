"use client";

import { useMutation, useQuery } from "convex/react";
import {
	ArrowRight,
	ChevronRight,
	Circle,
	CircleCheck,
	CircleDashed,
	CircleX,
	Copy,
	Eye,
	Link2,
	Loader2,
	Plus,
	ShieldAlert,
	ShieldBan,
	Timer,
	TriangleAlert,
	X,
} from "lucide-react";
import NextLink from "next/link";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { useWorkspace } from "@/components/providers/workspace-context";
import { Button } from "@/components/ui/button";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { AddRelationDialog } from "./AddRelationDialog";

// ── Status icon map ──────────────────────────────────────────────────────

const STATUS_ICONS: Record<string, { icon: typeof Circle; color: string }> = {
	triage: { icon: TriangleAlert, color: "text-orange-500" },
	backlog: { icon: CircleDashed, color: "text-muted-foreground" },
	todo: { icon: Circle, color: "text-muted-foreground" },
	in_progress: { icon: Timer, color: "text-yellow-500" },
	in_review: { icon: Eye, color: "text-blue-500" },
	done: { icon: CircleCheck, color: "text-emerald-500" },
	cancelled: { icon: CircleX, color: "text-muted-foreground" },
};

// ── Relation group config ────────────────────────────────────────────────

type RelationType = "blocks" | "blocked_by" | "relates_to" | "duplicate";

const RELATION_GROUP_CONFIG: Record<
	RelationType,
	{ label: string; icon: typeof Circle; color: string }
> = {
	blocks: { label: "Blocks", icon: ShieldAlert, color: "text-red-500" },
	blocked_by: {
		label: "Blocked by",
		icon: ShieldBan,
		color: "text-orange-500",
	},
	relates_to: {
		label: "Related to",
		icon: ArrowRight,
		color: "text-blue-500",
	},
	duplicate: { label: "Duplicate of", icon: Copy, color: "text-violet-500" },
};

// ── Types ────────────────────────────────────────────────────────────────

interface RelationWithIssue {
	_id: Id<"issueRelations">;
	type: RelationType;
	relatedIssue: {
		_id: Id<"issues">;
		identifier: string;
		title: string;
		status: string;
		priority: string;
	};
	createdAt: number;
}

interface IssueRelationsSectionProps {
	issueId: Id<"issues">;
}

// ── Component ────────────────────────────────────────────────────────────

export function IssueRelationsSection({ issueId }: IssueRelationsSectionProps) {
	const { workspaceId, workspaceSlug } = useWorkspace();
	const [dialogOpen, setDialogOpen] = useState(false);

	const relations = useQuery(api.issueRelations.listByIssue, { issueId });
	const removeRelation = useMutation(api.issueRelations.remove);

	// Collect all related issue IDs to exclude from search
	const excludeIds = useMemo(() => {
		if (!relations) return [issueId];
		const ids: Id<"issues">[] = [issueId];
		for (const group of Object.values(relations)) {
			for (const rel of group as RelationWithIssue[]) {
				ids.push(rel.relatedIssue._id);
			}
		}
		return ids;
	}, [relations, issueId]);

	const totalRelations = useMemo(() => {
		if (!relations) return 0;
		return Object.values(relations).reduce(
			(sum, group) => sum + (group as RelationWithIssue[]).length,
			0,
		);
	}, [relations]);

	const handleRemove = async (relationId: Id<"issueRelations">) => {
		try {
			await removeRelation({ relationId });
			toast.success("Relation removed");
		} catch {
			toast.error("Failed to remove relation");
		}
	};

	// Loading state
	if (relations === undefined) {
		return (
			<div className="space-y-2.5">
				<div className="flex items-center justify-between">
					<h3 className="text-[13px] font-medium text-foreground/80 flex items-center gap-1.5">
						<Link2 className="h-3.5 w-3.5 text-muted-foreground" />
						Relations
					</h3>
				</div>
				<div className="flex items-center justify-center py-3">
					<Loader2 className="h-4 w-4 animate-spin text-muted-foreground/50" />
				</div>
			</div>
		);
	}

	const hasRelations = totalRelations > 0;

	// Render relation group
	const renderGroup = (type: RelationType, items: RelationWithIssue[]) => {
		if (items.length === 0) return null;
		const config = RELATION_GROUP_CONFIG[type];
		const GroupIcon = config.icon;

		return (
			<div key={type} className="space-y-1">
				<div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground py-1">
					<GroupIcon className={cn("h-3.5 w-3.5", config.color)} />
					{config.label}
				</div>
				<div className="space-y-0.5">
					{items.map((rel) => {
						const statusConfig = STATUS_ICONS[rel.relatedIssue.status];
						const StatusIcon = statusConfig?.icon ?? Circle;
						const statusColor = statusConfig?.color ?? "text-muted-foreground";

						return (
							<div
								key={rel._id}
								className="group flex items-center gap-2 py-1 px-2 rounded-md hover:bg-muted transition-colors"
							>
								<StatusIcon
									className={cn("h-3.5 w-3.5 shrink-0", statusColor)}
								/>
								<NextLink
									href={`/${workspaceSlug}/issues/${rel.relatedIssue.identifier}`}
									className="flex items-center gap-2 flex-1 min-w-0"
								>
									<span className="text-xs font-mono text-muted-foreground shrink-0">
										{rel.relatedIssue.identifier}
									</span>
									<span className="text-sm truncate hover:text-primary transition-colors">
										{rel.relatedIssue.title}
									</span>
								</NextLink>
								<button
									type="button"
									onClick={() => handleRemove(rel._id)}
									className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-muted-foreground/20 transition-all text-muted-foreground hover:text-foreground"
								>
									<X className="h-3 w-3" />
								</button>
							</div>
						);
					})}
				</div>
			</div>
		);
	};

	return (
		<Collapsible defaultOpen={hasRelations}>
			<div className="space-y-2.5">
				<div className="flex items-center justify-between">
					<CollapsibleTrigger className="flex items-center gap-1.5 group cursor-pointer">
						<ChevronRight className="h-3.5 w-3.5 text-muted-foreground transition-transform group-data-[state=open]:rotate-90" />
						<h3 className="text-[13px] font-medium text-foreground/80 flex items-center gap-1.5">
							<Link2 className="h-3.5 w-3.5 text-muted-foreground" />
							Relations
							{totalRelations > 0 && (
								<span className="text-xs text-muted-foreground/70">
									({totalRelations})
								</span>
							)}
						</h3>
					</CollapsibleTrigger>
					<Button
						variant="ghost"
						size="sm"
						className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
						onClick={() => setDialogOpen(true)}
					>
						<Plus className="h-3.5 w-3.5 mr-1" />
						Add relation
					</Button>
				</div>

				<CollapsibleContent>
					{totalRelations === 0 ? (
						<p className="text-[13px] text-muted-foreground/50 py-3 text-center">
							No relations
						</p>
					) : (
						<div className="space-y-3">
							{renderGroup("blocks", relations.blocks as RelationWithIssue[])}
							{renderGroup(
								"blocked_by",
								relations.blocked_by as RelationWithIssue[],
							)}
							{renderGroup(
								"relates_to",
								relations.relates_to as RelationWithIssue[],
							)}
							{renderGroup(
								"duplicate",
								relations.duplicate as RelationWithIssue[],
							)}
						</div>
					)}
				</CollapsibleContent>

				<AddRelationDialog
					open={dialogOpen}
					onOpenChange={setDialogOpen}
					issueId={issueId}
					workspaceId={workspaceId}
					excludeIds={excludeIds}
				/>
			</div>
		</Collapsible>
	);
}
