"use client";

import { useMutation, useQuery } from "convex/react";
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
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { api } from "../../../convex/_generated/api";
import type { Doc, Id } from "../../../convex/_generated/dataModel";

type ProjectEditDialogProps = {
	project: Doc<"projects">;
	open: boolean;
	onOpenChange: (open: boolean) => void;
};

const STATUS_OPTIONS = [
	{ value: "backlog", label: "Backlog" },
	{ value: "planned", label: "Planned" },
	{ value: "active", label: "Active" },
	{ value: "completed", label: "Completed" },
	{ value: "cancelled", label: "Cancelled" },
] as const;

const PRIORITY_OPTIONS = [
	{ value: "urgent", label: "Urgent" },
	{ value: "high", label: "High" },
	{ value: "medium", label: "Medium" },
	{ value: "low", label: "Low" },
	{ value: "no_priority", label: "No priority" },
] as const;

const STRUCTURE_OPTIONS = [
	{ value: "linear", label: "Linear" },
	{ value: "sprints", label: "Sprints" },
	{ value: "kanban", label: "Kanban" },
] as const;

function formatDateForInput(timestamp: number | undefined): string {
	if (!timestamp) return "";
	const d = new Date(timestamp);
	const year = d.getFullYear();
	const month = String(d.getMonth() + 1).padStart(2, "0");
	const day = String(d.getDate()).padStart(2, "0");
	return `${year}-${month}-${day}`;
}

function parseDateInput(value: string): number | undefined {
	if (!value) return undefined;
	return new Date(value).getTime();
}

export function ProjectEditDialog({
	project,
	open,
	onOpenChange,
}: ProjectEditDialogProps) {
	const updateProject = useMutation(api.projects.update);
	const removeClientMutation = useMutation(api.projects.removeClient);
	const allClients = useQuery(api.clients.list, {
		workspaceId: project.workspaceId,
	});

	const [name, setName] = useState(project.name);
	const [description, setDescription] = useState(project.description ?? "");
	const [status, setStatus] = useState(project.status);
	const [priority, setPriority] = useState(project.priority);
	const [structure, setStructure] = useState(project.structure ?? "");
	const [clientId, setClientId] = useState<string>(
		(project.clientId as string) ?? "none",
	);
	const [startDate, setStartDate] = useState(
		formatDateForInput(project.startDate),
	);
	const [endDate, setEndDate] = useState(formatDateForInput(project.endDate));
	const [saving, setSaving] = useState(false);

	// Reset form when project changes or dialog opens
	useEffect(() => {
		if (open) {
			setName(project.name);
			setDescription(project.description ?? "");
			setStatus(project.status);
			setPriority(project.priority);
			setStructure(project.structure ?? "");
			setClientId((project.clientId as string) ?? "none");
			setStartDate(formatDateForInput(project.startDate));
			setEndDate(formatDateForInput(project.endDate));
		}
	}, [open, project]);

	const handleSave = useCallback(async () => {
		if (!name.trim()) {
			toast.error("Project name is required");
			return;
		}

		setSaving(true);
		try {
			// Handle client clearing separately since Convex patch can't unset fields
			const hadClient = !!project.clientId;
			const wantsNoClient = clientId === "none";

			await updateProject({
				projectId: project._id,
				name: name.trim(),
				description: description.trim() || undefined,
				status: status as
					| "backlog"
					| "planned"
					| "active"
					| "completed"
					| "cancelled",
				priority: priority as
					| "urgent"
					| "high"
					| "medium"
					| "low"
					| "no_priority"
					| undefined,
				structure:
					structure === ""
						? undefined
						: (structure as "linear" | "sprints" | "kanban"),
				clientId: clientId !== "none" ? (clientId as Id<"clients">) : undefined,
				startDate: parseDateInput(startDate),
				endDate: parseDateInput(endDate),
			});

			// If client was removed, use the dedicated removeClient mutation
			if (hadClient && wantsNoClient) {
				await removeClientMutation({ projectId: project._id });
			}

			toast.success("Project updated");
			onOpenChange(false);
		} catch {
			toast.error("Failed to update project");
		} finally {
			setSaving(false);
		}
	}, [
		name,
		description,
		status,
		priority,
		structure,
		clientId,
		startDate,
		endDate,
		project._id,
		project.clientId,
		updateProject,
		removeClientMutation,
		onOpenChange,
	]);

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-lg">
				<DialogHeader>
					<DialogTitle>Edit project</DialogTitle>
					<DialogDescription>
						Update project details and settings.
					</DialogDescription>
				</DialogHeader>

				<div className="grid gap-4 py-2">
					<div className="grid gap-2">
						<Label htmlFor="project-name">Name</Label>
						<Input
							id="project-name"
							value={name}
							onChange={(e) => setName(e.target.value)}
							placeholder="Project name"
						/>
					</div>

					<div className="grid gap-2">
						<Label htmlFor="project-description">Description</Label>
						<Textarea
							id="project-description"
							value={description}
							onChange={(e) => setDescription(e.target.value)}
							placeholder="Brief project description"
							className="min-h-20"
						/>
					</div>

					<div className="grid grid-cols-2 gap-4">
						<div className="grid gap-2">
							<Label>Status</Label>
							<Select
								value={status}
								onValueChange={setStatus as (v: string) => void}
							>
								<SelectTrigger className="w-full">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									{STATUS_OPTIONS.map((opt) => (
										<SelectItem key={opt.value} value={opt.value}>
											{opt.label}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>

						<div className="grid gap-2">
							<Label>Priority</Label>
							<Select
								value={priority}
								onValueChange={setPriority as (v: string) => void}
							>
								<SelectTrigger className="w-full">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									{PRIORITY_OPTIONS.map((opt) => (
										<SelectItem key={opt.value} value={opt.value}>
											{opt.label}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
					</div>

					<div className="grid gap-2">
						<Label>Methodology</Label>
						<Select
							value={structure || "none"}
							onValueChange={(v) => setStructure(v === "none" ? "" : v)}
						>
							<SelectTrigger className="w-full">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="none">None</SelectItem>
								{STRUCTURE_OPTIONS.map((opt) => (
									<SelectItem key={opt.value} value={opt.value}>
										{opt.label}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>

					<div className="grid gap-2">
						<Label>Client</Label>
						<Select value={clientId} onValueChange={setClientId}>
							<SelectTrigger className="w-full">
								<SelectValue placeholder="No client" />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="none">No client</SelectItem>
								{(allClients ?? []).map((c) => (
									<SelectItem key={c._id} value={c._id}>
										{c.name}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>

					<div className="grid grid-cols-2 gap-4">
						<div className="grid gap-2">
							<Label htmlFor="project-start-date">Start date</Label>
							<Input
								id="project-start-date"
								type="date"
								value={startDate}
								onChange={(e) => setStartDate(e.target.value)}
							/>
						</div>

						<div className="grid gap-2">
							<Label htmlFor="project-end-date">End date</Label>
							<Input
								id="project-end-date"
								type="date"
								value={endDate}
								onChange={(e) => setEndDate(e.target.value)}
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
