"use client";

import {
	FileText,
	Link as LinkIcon,
	PenNib,
} from "@phosphor-icons/react/dist/ssr";
import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { toast } from "sonner";
import { useWorkspace } from "@/components/providers/workspace-context";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

type LinkResourceButtonProps = {
	issueId: Id<"issues">;
	existingDocIds?: Id<"documents">[];
	existingBoardIds?: Id<"whiteboards">[];
};

export function LinkResourceButton({
	issueId,
	existingDocIds = [],
	existingBoardIds = [],
}: LinkResourceButtonProps) {
	const { workspaceId } = useWorkspace();
	const [open, setOpen] = useState(false);
	const [search, setSearch] = useState("");
	const linkResource = useMutation(api.issues.linkResource);

	const documents = useQuery(
		api.documents.listByWorkspace,
		open ? { workspaceId } : "skip",
	);
	const whiteboards = useQuery(
		api.whiteboards.listByWorkspace,
		open ? { workspaceId, includePeople: false, limit: 120 } : "skip",
	);

	const filteredDocs = (documents ?? []).filter(
		(d) =>
			!existingDocIds.includes(d._id) &&
			d.title.toLowerCase().includes(search.toLowerCase()),
	);

	const filteredBoards = (whiteboards ?? []).filter(
		(b) =>
			!existingBoardIds.includes(b._id) &&
			b.title.toLowerCase().includes(search.toLowerCase()),
	);

	const handleLink = async (
		type: "document" | "whiteboard",
		resourceId: string,
	) => {
		try {
			await linkResource({ issueId, resourceType: type, resourceId });
			toast.success(
				`${type === "document" ? "Document" : "Whiteboard"} linked`,
			);
			setOpen(false);
			setSearch("");
		} catch {
			toast.error("Failed to link resource");
		}
	};

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger asChild>
				<Button
					variant="ghost"
					size="sm"
					className="h-7 gap-1.5 text-xs text-muted-foreground hover:text-foreground"
				>
					<LinkIcon className="h-3.5 w-3.5" />
					Link resource
				</Button>
			</DialogTrigger>
			<DialogContent className="sm:max-w-[400px]">
				<DialogHeader>
					<DialogTitle>Link a resource</DialogTitle>
				</DialogHeader>
				<div className="space-y-3">
					<input
						type="text"
						value={search}
						onChange={(e) => setSearch(e.target.value)}
						placeholder="Search docs and boards..."
						className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
						autoFocus
					/>

					<div className="max-h-[300px] overflow-y-auto space-y-2">
						{filteredDocs.length > 0 && (
							<div>
								<p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider px-1 pb-1">
									Documents
								</p>
								{filteredDocs.map((doc) => (
									<button
										key={doc._id}
										type="button"
										onClick={() => handleLink("document", doc._id)}
										className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent transition-colors"
									>
										<FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
										<span className="truncate">{doc.title}</span>
									</button>
								))}
							</div>
						)}
						{filteredBoards.length > 0 && (
							<div>
								<p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider px-1 pb-1">
									Whiteboards
								</p>
								{filteredBoards.map((board) => (
									<button
										key={board._id}
										type="button"
										onClick={() => handleLink("whiteboard", board._id)}
										className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent transition-colors"
									>
										{board.icon ? (
											<span className="text-base leading-none shrink-0">
												{board.icon}
											</span>
										) : (
											<PenNib className="h-4 w-4 shrink-0 text-muted-foreground" />
										)}
										<span className="truncate">{board.title}</span>
									</button>
								))}
							</div>
						)}
						{filteredDocs.length === 0 && filteredBoards.length === 0 && (
							<p className="text-sm text-muted-foreground text-center py-4">
								{search ? "No matching resources" : "No resources available"}
							</p>
						)}
					</div>
				</div>
			</DialogContent>
		</Dialog>
	);
}
