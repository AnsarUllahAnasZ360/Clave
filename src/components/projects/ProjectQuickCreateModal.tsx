"use client";

import { useMutation, useQuery } from "convex/react";
import {
	ArrowDown,
	ArrowRight,
	ArrowUp,
	Building2,
	CalendarDays,
	ChevronDown,
	ChevronUp,
	Circle,
	Columns3,
	List,
	Minus,
	Plus,
	RefreshCw,
	SignalHigh,
	Tag,
	User,
	X,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { ProjectDescriptionEditor } from "@/components/project-wizard/ProjectDescriptionEditor";
import { useWorkspace } from "@/components/providers/workspace-context";
import {
	useWorkspaceLabels,
	useWorkspaceMembers,
} from "@/components/providers/workspace-data-context";
import { QuickCreateModalLayout } from "@/components/QuickCreateModalLayout";
import { Button } from "@/components/ui/button";
import { EmojiPicker } from "@/components/ui/emoji-picker";
import { DatePicker, GenericPicker } from "@/components/ui/pickers";
import { cn } from "@/lib/utils";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

// ── Priority configuration ──────────────────────────────────────────────────

const PRIORITY_OPTIONS = [
	{
		id: "no_priority",
		label: "No priority",
		icon: Minus,
		color: "text-muted-foreground",
	},
	{ id: "low", label: "Low", icon: ArrowDown, color: "text-blue-400" },
	{
		id: "medium",
		label: "Medium",
		icon: ArrowRight,
		color: "text-yellow-500",
	},
	{ id: "high", label: "High", icon: ArrowUp, color: "text-orange-500" },
	{ id: "urgent", label: "Urgent", icon: SignalHigh, color: "text-red-500" },
] as const;

type ProjectPriority = (typeof PRIORITY_OPTIONS)[number]["id"];

// ── Status configuration ────────────────────────────────────────────────────

const STATUS_OPTIONS = [
	{ id: "backlog", label: "Backlog", color: "text-muted-foreground" },
	{ id: "planned", label: "Planned", color: "text-blue-400" },
	{ id: "active", label: "Active", color: "text-green-500" },
	{ id: "completed", label: "Completed", color: "text-emerald-500" },
	{ id: "cancelled", label: "Cancelled", color: "text-red-500" },
] as const;

type ProjectStatus = (typeof STATUS_OPTIONS)[number]["id"];

// ── Structure configuration ─────────────────────────────────────────────────

const STRUCTURE_OPTIONS = [
	{ id: "linear", label: "Linear", icon: List },
	{ id: "sprints", label: "Sprints", icon: RefreshCw },
	{ id: "kanban", label: "Kanban", icon: Columns3 },
] as const;

type ProjectStructure = (typeof STRUCTURE_OPTIONS)[number]["id"];

// ── Helpers ─────────────────────────────────────────────────────────────────

function formatDate(date: Date | undefined): string {
	if (!date) return "";
	return date.toLocaleDateString("en-US", {
		month: "short",
		day: "numeric",
	});
}

// ── Component ───────────────────────────────────────────────────────────────

interface ProjectQuickCreateModalProps {
	open: boolean;
	onClose: () => void;
}

export function ProjectQuickCreateModal({
	open,
	onClose,
}: ProjectQuickCreateModalProps) {
	const { workspaceId } = useWorkspace();
	const createProject = useMutation(api.projects.create);
	const allLabels = useWorkspaceLabels();
	const allClients = useQuery(api.clients.list, { workspaceId });
	const workspaceMembers = useWorkspaceMembers();

	// Form state — quick mode
	const [title, setTitle] = useState("");
	const [description, setDescription] = useState("");
	const [priority, setPriority] = useState<ProjectPriority>("no_priority");
	const [selectedClientId, setSelectedClientId] = useState<
		Id<"clients"> | undefined
	>(undefined);
	const [selectedTags, setSelectedTags] = useState<string[]>([]);
	const [submitting, setSubmitting] = useState(false);

	// Form state — detailed mode
	const [showDetails, setShowDetails] = useState(false);
	const [icon, setIcon] = useState<string | undefined>(undefined);
	const [summary, setSummary] = useState("");
	const [status, setStatus] = useState<ProjectStatus>("planned");
	const [leadId, setLeadId] = useState<Id<"users"> | undefined>(undefined);
	const [startDate, setStartDate] = useState<Date | undefined>(undefined);
	const [endDate, setEndDate] = useState<Date | undefined>(undefined);
	const [structure, setStructure] = useState<ProjectStructure | undefined>(
		undefined,
	);

	// Description editor expand state
	const [isDescriptionExpanded, setIsDescriptionExpanded] = useState(false);

	const titleRef = useRef<HTMLInputElement>(null);

	// Reset form on open
	useEffect(() => {
		if (!open) return;
		setTitle("");
		setDescription("");
		setPriority("no_priority");
		setSelectedClientId(undefined);
		setSelectedTags([]);
		setSubmitting(false);
		setShowDetails(false);
		setIcon(undefined);
		setSummary("");
		setStatus("planned");
		setLeadId(undefined);
		setStartDate(undefined);
		setEndDate(undefined);
		setStructure(undefined);
		setIsDescriptionExpanded(false);

		requestAnimationFrame(() => {
			titleRef.current?.focus();
		});
	}, [open]);

	const handleSubmit = useCallback(async () => {
		const trimmed = title.trim();
		if (!trimmed) {
			toast.error("Title is required");
			titleRef.current?.focus();
			return;
		}

		setSubmitting(true);
		try {
			const trimmedDescription = description.trim();
			const trimmedSummary = summary.trim();

			await createProject({
				workspaceId,
				name: trimmed,
				richDescription: trimmedDescription || undefined,
				icon: icon || undefined,
				summary: trimmedSummary || undefined,
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
					| "no_priority",
				leadId,
				clientId: selectedClientId,
				startDate: startDate ? startDate.getTime() : undefined,
				endDate: endDate ? endDate.getTime() : undefined,
				structure: structure as "linear" | "sprints" | "kanban" | undefined,
				tags: selectedTags.length > 0 ? selectedTags : undefined,
			});

			toast.success("Project created");
			onClose();
		} catch {
			toast.error("Failed to create project");
		} finally {
			setSubmitting(false);
		}
	}, [
		title,
		description,
		summary,
		icon,
		status,
		workspaceId,
		priority,
		leadId,
		selectedClientId,
		startDate,
		endDate,
		structure,
		selectedTags,
		createProject,
		onClose,
	]);

	const currentPriority =
		PRIORITY_OPTIONS.find((p) => p.id === priority) ?? PRIORITY_OPTIONS[0];
	const currentStatus =
		STATUS_OPTIONS.find((s) => s.id === status) ?? STATUS_OPTIONS[1];
	const currentStructure = structure
		? STRUCTURE_OPTIONS.find((s) => s.id === structure)
		: undefined;

	// Build options for pickers
	const labelOptions =
		allLabels?.map((l) => ({
			id: l._id as string,
			label: l.name,
			name: l.name,
		})) ?? [];

	const clientOptions =
		allClients?.map((c) => ({
			id: c._id as string,
			label: c.name,
		})) ?? [];
	const selectedClient = clientOptions.find(
		(c) => c.id === (selectedClientId as string),
	);

	const memberOptions =
		workspaceMembers
			?.filter((m) => m.user)
			.map((m) => ({
				id: m.userId as string,
				label: m.user?.name ?? m.user?.email ?? "Unknown",
			})) ?? [];
	const selectedLead = leadId
		? memberOptions.find((m) => m.id === (leadId as string))
		: undefined;

	return (
		<QuickCreateModalLayout
			open={open}
			onClose={onClose}
			isDescriptionExpanded={isDescriptionExpanded}
			onSubmitShortcut={handleSubmit}
		>
			{/* Header */}
			<div className="flex items-center justify-between gap-2">
				<span className="text-xs text-muted-foreground font-medium">
					New project
				</span>
				<Button
					type="button"
					variant="ghost"
					size="icon"
					onClick={onClose}
					className="h-7 w-7 rounded-full"
				>
					<X className="h-4 w-4 text-muted-foreground" />
				</Button>
			</div>

			{/* Title row with emoji picker */}
			<div className="flex items-center gap-2">
				<EmojiPicker value={icon} onChange={setIcon} />
				<input
					ref={titleRef}
					type="text"
					value={title}
					onChange={(e) => setTitle(e.target.value)}
					placeholder="Project title"
					className="flex-1 text-lg font-medium text-foreground placeholder:text-muted-foreground outline-none bg-transparent border-none"
					autoComplete="off"
				/>
			</div>

			{/* Summary input (detailed mode) */}
			{showDetails && (
				<input
					type="text"
					value={summary}
					onChange={(e) => setSummary(e.target.value)}
					placeholder="One-line summary"
					className="text-sm text-foreground placeholder:text-muted-foreground outline-none bg-transparent border-none"
					autoComplete="off"
				/>
			)}

			{/* Description editor */}
			<ProjectDescriptionEditor
				value={description}
				onChange={setDescription}
				onExpandChange={setIsDescriptionExpanded}
				showTemplates={showDetails}
				placeholder="Add description..."
				className={showDetails ? undefined : "!h-20"}
			/>

			{/* Property chips */}
			<div className="flex flex-wrap gap-1.5 items-center">
				{/* Priority */}
				<GenericPicker
					items={PRIORITY_OPTIONS.map((p) => ({
						id: p.id,
						label: p.label,
						icon: p.icon,
						color: p.color,
					}))}
					onSelect={(item) => setPriority(item.id as ProjectPriority)}
					selectedId={priority}
					placeholder="Set priority..."
					renderItem={(item) => {
						const Icon = item.icon;
						return (
							<div className="flex items-center gap-2 w-full">
								<Icon className={cn("h-4 w-4", item.color)} />
								<span className="flex-1">{item.label}</span>
							</div>
						);
					}}
					trigger={
						<button
							type="button"
							className="flex items-center gap-1.5 h-7 px-2 rounded-md border border-border hover:bg-muted transition-colors text-xs"
						>
							<currentPriority.icon
								className={cn("h-3.5 w-3.5", currentPriority.color)}
							/>
							<span>{currentPriority.label}</span>
						</button>
					}
				/>

				{/* Client */}
				{clientOptions.length > 0 && (
					<GenericPicker
						items={[{ id: "__none__", label: "No client" }, ...clientOptions]}
						onSelect={(item) => {
							setSelectedClientId(
								item.id === "__none__" ? undefined : (item.id as Id<"clients">),
							);
						}}
						selectedId={
							selectedClientId ? (selectedClientId as string) : "__none__"
						}
						placeholder="Assign client..."
						renderItem={(item) => (
							<div className="flex items-center gap-2 w-full">
								<Building2 className="h-3.5 w-3.5 text-muted-foreground" />
								<span className="flex-1">{item.label}</span>
							</div>
						)}
						trigger={
							<button
								type="button"
								className="flex items-center gap-1.5 h-7 px-2 rounded-md border border-border hover:bg-muted transition-colors text-xs"
							>
								<Building2 className="h-3.5 w-3.5 text-muted-foreground" />
								<span>{selectedClient ? selectedClient.label : "Client"}</span>
							</button>
						}
					/>
				)}

				{/* Labels / Tags */}
				{labelOptions.length > 0 && (
					<GenericPicker
						items={labelOptions}
						onSelect={(item) => {
							setSelectedTags((prev) =>
								prev.includes(item.name)
									? prev.filter((t) => t !== item.name)
									: [...prev, item.name],
							);
						}}
						selectedId={undefined}
						placeholder="Add tag..."
						renderItem={(item) => (
							<div className="flex items-center gap-2 w-full">
								<Tag className="h-3.5 w-3.5 text-muted-foreground" />
								<span className="flex-1">{item.label}</span>
								{selectedTags.includes(item.name ?? "") && (
									<span className="text-primary text-xs">&#10003;</span>
								)}
							</div>
						)}
						trigger={
							<button
								type="button"
								className="flex items-center gap-1.5 h-7 px-2 rounded-md border border-border hover:bg-muted transition-colors text-xs"
							>
								<Plus className="h-3.5 w-3.5 text-muted-foreground" />
								<span>
									{selectedTags.length > 0
										? `${selectedTags.length} tag${selectedTags.length > 1 ? "s" : ""}`
										: "Tag"}
								</span>
							</button>
						}
					/>
				)}

				{/* Spacer */}
				<div className="flex-1" />

				{/* Show/Hide details toggle */}
				<button
					type="button"
					onClick={() => setShowDetails((prev) => !prev)}
					className="flex items-center gap-1 h-7 px-2 rounded-md hover:bg-muted transition-colors text-xs text-muted-foreground"
				>
					{showDetails ? (
						<>
							<ChevronUp className="h-3.5 w-3.5" />
							<span>Hide details</span>
						</>
					) : (
						<>
							<ChevronDown className="h-3.5 w-3.5" />
							<span>Show details</span>
						</>
					)}
				</button>
			</div>

			{/* Detailed mode fields */}
			{showDetails && (
				<div className="flex flex-col gap-3 pt-1 border-t border-border">
					<div className="flex flex-wrap gap-1.5 items-center">
						{/* Status */}
						<GenericPicker
							items={STATUS_OPTIONS.map((s) => ({
								id: s.id,
								label: s.label,
								color: s.color,
							}))}
							onSelect={(item) => setStatus(item.id as ProjectStatus)}
							selectedId={status}
							placeholder="Set status..."
							renderItem={(item) => (
								<div className="flex items-center gap-2 w-full">
									<Circle className={cn("h-3.5 w-3.5", item.color)} />
									<span className="flex-1">{item.label}</span>
								</div>
							)}
							trigger={
								<button
									type="button"
									className="flex items-center gap-1.5 h-7 px-2 rounded-md border border-border hover:bg-muted transition-colors text-xs"
								>
									<Circle className={cn("h-3.5 w-3.5", currentStatus.color)} />
									<span>{currentStatus.label}</span>
								</button>
							}
						/>

						{/* Lead */}
						{memberOptions.length > 0 && (
							<GenericPicker
								items={[{ id: "__none__", label: "No lead" }, ...memberOptions]}
								onSelect={(item) => {
									setLeadId(
										item.id === "__none__"
											? undefined
											: (item.id as Id<"users">),
									);
								}}
								selectedId={leadId ? (leadId as string) : "__none__"}
								placeholder="Assign lead..."
								renderItem={(item) => (
									<div className="flex items-center gap-2 w-full">
										<User className="h-3.5 w-3.5 text-muted-foreground" />
										<span className="flex-1">{item.label}</span>
									</div>
								)}
								trigger={
									<button
										type="button"
										className="flex items-center gap-1.5 h-7 px-2 rounded-md border border-border hover:bg-muted transition-colors text-xs"
									>
										<User className="h-3.5 w-3.5 text-muted-foreground" />
										<span>{selectedLead ? selectedLead.label : "Lead"}</span>
									</button>
								}
							/>
						)}

						{/* Structure */}
						<GenericPicker
							items={[
								{ id: "__none__", label: "No structure" },
								...STRUCTURE_OPTIONS.map((s) => ({
									id: s.id,
									label: s.label,
									icon: s.icon,
								})),
							]}
							onSelect={(item) => {
								setStructure(
									item.id === "__none__"
										? undefined
										: (item.id as ProjectStructure),
								);
							}}
							selectedId={structure ?? "__none__"}
							placeholder="Set structure..."
							renderItem={(item) => {
								const opt = STRUCTURE_OPTIONS.find((s) => s.id === item.id);
								const Icon = opt?.icon ?? List;
								return (
									<div className="flex items-center gap-2 w-full">
										<Icon className="h-3.5 w-3.5 text-muted-foreground" />
										<span className="flex-1">{item.label}</span>
									</div>
								);
							}}
							trigger={
								<button
									type="button"
									className="flex items-center gap-1.5 h-7 px-2 rounded-md border border-border hover:bg-muted transition-colors text-xs"
								>
									{currentStructure ? (
										<>
											<currentStructure.icon className="h-3.5 w-3.5 text-muted-foreground" />
											<span>{currentStructure.label}</span>
										</>
									) : (
										<>
											<List className="h-3.5 w-3.5 text-muted-foreground" />
											<span>Structure</span>
										</>
									)}
								</button>
							}
						/>

						{/* Start date */}
						<DatePicker
							date={startDate}
							onSelect={setStartDate}
							trigger={
								<button
									type="button"
									className="flex items-center gap-1.5 h-7 px-2 rounded-md border border-border hover:bg-muted transition-colors text-xs"
								>
									<CalendarDays className="h-3.5 w-3.5 text-muted-foreground" />
									<span>
										{startDate ? formatDate(startDate) : "Start date"}
									</span>
								</button>
							}
						/>

						{/* End date */}
						<DatePicker
							date={endDate}
							onSelect={setEndDate}
							trigger={
								<button
									type="button"
									className="flex items-center gap-1.5 h-7 px-2 rounded-md border border-border hover:bg-muted transition-colors text-xs"
								>
									<CalendarDays className="h-3.5 w-3.5 text-muted-foreground" />
									<span>{endDate ? formatDate(endDate) : "End date"}</span>
								</button>
							}
						/>
					</div>
				</div>
			)}

			{/* Selected tags display */}
			{selectedTags.length > 0 && (
				<div className="flex flex-wrap gap-1.5">
					{selectedTags.map((tag) => (
						<span
							key={tag}
							className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-muted text-xs text-foreground"
						>
							{tag}
							<button
								type="button"
								onClick={() =>
									setSelectedTags((prev) => prev.filter((t) => t !== tag))
								}
								className="hover:text-destructive"
							>
								<X className="h-3 w-3" />
							</button>
						</span>
					))}
				</div>
			)}

			{/* Footer */}
			<div className="flex items-center justify-between pt-2 border-t border-border">
				<span className="text-xs text-muted-foreground">
					Cmd+Enter to create
				</span>
				<Button
					type="button"
					onClick={handleSubmit}
					disabled={submitting}
					className="h-8 px-4 rounded-lg text-sm"
				>
					{submitting ? "Creating..." : "Create project"}
				</Button>
			</div>
		</QuickCreateModalLayout>
	);
}
