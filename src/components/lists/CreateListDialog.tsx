"use client";

import { useMutation } from "convex/react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

interface CreateListDialogProps {
	projectId: Id<"projects">;
	open: boolean;
	onClose: () => void;
	onCreated?: (listId: Id<"lists">) => void;
}

export function CreateListDialog({
	projectId,
	open,
	onClose,
	onCreated,
}: CreateListDialogProps) {
	const [name, setName] = useState("");
	const [description, setDescription] = useState("");
	const [isLoading, setIsLoading] = useState(false);
	const createList = useMutation(api.lists.create);

	const handleCreate = async () => {
		const trimmed = name.trim();
		if (!trimmed) return;
		setIsLoading(true);
		try {
			const listId = await createList({
				projectId,
				name: trimmed,
				description: description.trim() || undefined,
			});
			toast.success(`List "${trimmed}" created`);
			onCreated?.(listId);
			setName("");
			setDescription("");
			onClose();
		} catch {
			toast.error("Failed to create list");
		} finally {
			setIsLoading(false);
		}
	};

	return (
		<Dialog open={open} onOpenChange={(v) => !v && onClose()}>
			<DialogContent className="sm:max-w-[400px]">
				<DialogHeader>
					<DialogTitle>New list</DialogTitle>
				</DialogHeader>
				<div className="space-y-4 py-2">
					<div className="space-y-1.5">
						<Label htmlFor="list-name">Name</Label>
						<Input
							id="list-name"
							placeholder="List name"
							value={name}
							onChange={(e) => setName(e.target.value)}
							onKeyDown={(e) => {
								if (e.key === "Enter" && name.trim() && !isLoading) {
									handleCreate();
								}
							}}
							autoFocus
						/>
					</div>
					<div className="space-y-1.5">
						<Label htmlFor="list-description">
							Description{" "}
							<span className="text-muted-foreground font-normal">
								(optional)
							</span>
						</Label>
						<Textarea
							id="list-description"
							placeholder="What is this list for?"
							value={description}
							onChange={(e) => setDescription(e.target.value)}
							rows={2}
							className="resize-none"
						/>
					</div>
				</div>
				<DialogFooter>
					<Button type="button" variant="outline" onClick={onClose}>
						Cancel
					</Button>
					<Button
						type="button"
						onClick={handleCreate}
						disabled={!name.trim() || isLoading}
					>
						{isLoading ? "Creating..." : "Create list"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
