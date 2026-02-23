"use client";

import { useMutation } from "convex/react";
import { useState } from "react";
import { toast } from "sonner";

import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { IssueSearchPicker, type IssueSearchResult } from "./IssueSearchPicker";

// ── Types ────────────────────────────────────────────────────────────────

type RelationType = "blocks" | "blocked_by" | "relates_to" | "duplicate";

const RELATION_TYPES: { value: RelationType; label: string }[] = [
	{ value: "blocks", label: "Blocks" },
	{ value: "blocked_by", label: "Blocked by" },
	{ value: "relates_to", label: "Related to" },
	{ value: "duplicate", label: "Duplicate of" },
];

interface AddRelationDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	issueId: Id<"issues">;
	workspaceId: Id<"workspaces">;
	excludeIds: Id<"issues">[];
}

// ── Component ────────────────────────────────────────────────────────────

export function AddRelationDialog({
	open,
	onOpenChange,
	issueId,
	workspaceId,
	excludeIds,
}: AddRelationDialogProps) {
	const [relationType, setRelationType] = useState<RelationType>("blocks");
	const createRelation = useMutation(api.issueRelations.create);

	const handleSelect = async (selectedIssue: IssueSearchResult) => {
		try {
			await createRelation({
				issueId,
				relatedIssueId: selectedIssue._id,
				type: relationType,
			});

			if (relationType === "duplicate") {
				toast.success(
					`Marked as duplicate of ${selectedIssue.identifier}. Issue has been cancelled.`,
				);
			} else {
				const typeLabel =
					RELATION_TYPES.find((t) => t.value === relationType)?.label ??
					relationType;
				toast.success(
					`Added "${typeLabel}" relation to ${selectedIssue.identifier}`,
				);
			}

			onOpenChange(false);
		} catch (error) {
			const message =
				error instanceof Error ? error.message : "Failed to create relation";
			toast.error(message);
		}
	};

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle>Add relation</DialogTitle>
				</DialogHeader>

				<div className="space-y-4 pt-2">
					<div className="space-y-1.5">
						<label
							htmlFor="relation-type"
							className="text-sm text-muted-foreground"
						>
							Relation type
						</label>
						<Select
							value={relationType}
							onValueChange={(value) => setRelationType(value as RelationType)}
						>
							<SelectTrigger id="relation-type" className="w-full">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								{RELATION_TYPES.map((type) => (
									<SelectItem key={type.value} value={type.value}>
										{type.label}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>

					<div className="space-y-1.5">
						<span className="text-sm text-muted-foreground">Issue</span>
						<IssueSearchPicker
							workspaceId={workspaceId}
							excludeIds={excludeIds}
							onSelect={handleSelect}
							placeholder="Search by title or identifier..."
						/>
					</div>

					{relationType === "duplicate" && (
						<p className="text-xs text-muted-foreground">
							Marking as duplicate will cancel this issue.
						</p>
					)}
				</div>
			</DialogContent>
		</Dialog>
	);
}
