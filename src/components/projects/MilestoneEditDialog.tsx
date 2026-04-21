"use client";

import { useMutation, useQuery } from "convex/react";
import { format } from "date-fns";
import { Calendar } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DatePicker } from "@/components/ui/pickers";
import { Textarea } from "@/components/ui/textarea";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

/**
 * Edit dialog for sprint name + description + start/end dates.
 *
 * Self-fetches by `sprintId` so callers only need the id (the sidebar,
 * for example, doesn't have the sprint's dates in scope). Optional
 * `initial*` props still hydrate the form instantly on open — the fetch
 * then reconciles once the query resolves.
 */
type MilestoneEditDialogProps = {
	sprintId: Id<"sprints">;
	open: boolean;
	onOpenChange: (open: boolean) => void;
	/** Optional seed values — dialog paints immediately with these while
	 *  the fetched sprint is loading. */
	name?: string;
	description?: string;
	startDate?: number;
	targetDate?: number;
};

export function MilestoneEditDialog({
	sprintId,
	open,
	onOpenChange,
	name: initialName,
	description: initialDescription,
	startDate: initialStartDate,
	targetDate: initialTargetDate,
}: MilestoneEditDialogProps) {
	const updateMilestone = useMutation(api.sprints.update);

	// Fetch canonical sprint doc — lets callers open the dialog with just
	// an id. Skipped while closed so we don't keep subscriptions alive.
	const fetched = useQuery(api.sprints.getById, open ? { sprintId } : "skip");

	const [name, setName] = useState(initialName ?? "");
	const [description, setDescription] = useState(initialDescription ?? "");
	const [startDate, setStartDate] = useState<Date | undefined>(
		initialStartDate ? new Date(initialStartDate) : undefined,
	);
	const [targetDate, setTargetDate] = useState<Date | undefined>(
		initialTargetDate ? new Date(initialTargetDate) : undefined,
	);
	const [saving, setSaving] = useState(false);
	// Once the caller starts editing we stop overwriting the form from the
	// reactive query — otherwise typing in the name field would get clobbered
	// on every server push.
	const [hydrated, setHydrated] = useState(false);

	// Reset hydration flag whenever the dialog closes / opens on a new sprint.
	useEffect(() => {
		if (!open) {
			setHydrated(false);
			return;
		}
		setName(initialName ?? "");
		setDescription(initialDescription ?? "");
		setStartDate(initialStartDate ? new Date(initialStartDate) : undefined);
		setTargetDate(initialTargetDate ? new Date(initialTargetDate) : undefined);
	}, [
		open,
		sprintId,
		initialName,
		initialDescription,
		initialStartDate,
		initialTargetDate,
	]);

	// Hydrate from the fetched sprint once it loads — only the first time
	// the dialog is open. Subsequent server pushes are ignored so we don't
	// wipe the user's in-progress edits.
	useEffect(() => {
		if (!open || hydrated || !fetched) return;
		setName(fetched.name);
		setDescription(fetched.description ?? "");
		setStartDate(fetched.startDate ? new Date(fetched.startDate) : undefined);
		setTargetDate(
			fetched.endDate
				? new Date(fetched.endDate)
				: fetched.targetDate
					? new Date(fetched.targetDate)
					: undefined,
		);
		setHydrated(true);
	}, [open, fetched, hydrated]);

	const handleSave = useCallback(async () => {
		if (!name.trim()) {
			toast.error("Sprint name is required");
			return;
		}

		setSaving(true);
		try {
			await updateMilestone({
				sprintId,
				name: name.trim(),
				description: description.trim() || undefined,
				startDate: startDate?.getTime(),
				targetDate: targetDate?.getTime(),
			});
			toast.success("Sprint updated");
			onOpenChange(false);
		} catch {
			toast.error("Failed to update sprint");
		} finally {
			setSaving(false);
		}
	}, [
		name,
		description,
		startDate,
		targetDate,
		sprintId,
		updateMilestone,
		onOpenChange,
	]);

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle>Edit sprint</DialogTitle>
					<DialogDescription>
						Update sprint details and dates.
					</DialogDescription>
				</DialogHeader>

				<div className="grid gap-4 py-2">
					<div className="grid gap-2">
						<Label htmlFor="milestone-name">Name</Label>
						<Input
							id="milestone-name"
							value={name}
							onChange={(e) => setName(e.target.value)}
							placeholder="Sprint name"
						/>
					</div>

					<div className="grid gap-2">
						<Label htmlFor="milestone-description">Description</Label>
						<Textarea
							id="milestone-description"
							value={description}
							onChange={(e) => setDescription(e.target.value)}
							placeholder="Sprint description (optional)"
							className="min-h-20"
						/>
					</div>

					<div className="grid grid-cols-2 gap-4">
						<div className="grid gap-2">
							<Label>Start date</Label>
							<DatePicker
								date={startDate}
								onSelect={setStartDate}
								trigger={
									<button
										type="button"
										className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted transition-colors w-full"
									>
										<Calendar className="h-3.5 w-3.5 text-muted-foreground" />
										<span
											className={
												startDate ? "text-foreground" : "text-muted-foreground"
											}
										>
											{startDate ? format(startDate, "MMM d, yyyy") : "No date"}
										</span>
									</button>
								}
							/>
						</div>

						<div className="grid gap-2">
							<Label>End date</Label>
							<DatePicker
								date={targetDate}
								onSelect={setTargetDate}
								trigger={
									<button
										type="button"
										className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted transition-colors w-full"
									>
										<Calendar className="h-3.5 w-3.5 text-muted-foreground" />
										<span
											className={
												targetDate ? "text-foreground" : "text-muted-foreground"
											}
										>
											{targetDate
												? format(targetDate, "MMM d, yyyy")
												: "No date"}
										</span>
									</button>
								}
							/>
						</div>
					</div>
				</div>

				<DialogFooter>
					<Button
						variant="outline"
						onClick={() => onOpenChange(false)}
						disabled={saving}
					>
						Cancel
					</Button>
					<Button onClick={handleSave} disabled={saving}>
						{saving ? "Saving..." : "Save changes"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
