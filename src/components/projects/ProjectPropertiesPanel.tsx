"use client";

import { useMutation, useQuery } from "convex/react";
import { format } from "date-fns";
import {
	Building2,
	Calendar,
	Check,
	Circle,
	CircleCheck,
	CircleDashed,
	CircleDot,
	CircleX,
	ExternalLink,
	FileText,
	type LucideIcon,
	PenTool,
	Tag,
	User,
	Users,
	X,
} from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { PriorityBadge } from "@/components/priority-badge";
import { ProgressCircle } from "@/components/progress-circle";
import { useWorkspace } from "@/components/providers/workspace-context";
import { useWorkspaceLabels } from "@/components/providers/workspace-data-context";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
	Command,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
} from "@/components/ui/command";
import { DatePicker, GenericPicker } from "@/components/ui/pickers";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

// ── Status config ──────────────────────────────────────────────────────────

type ProjectStatusId =
	| "backlog"
	| "planned"
	| "active"
	| "completed"
	| "cancelled";

const PROJECT_STATUS_CONFIG: {
	id: ProjectStatusId;
	label: string;
	icon: LucideIcon;
	color: string;
}[] = [
	{
		id: "backlog",
		label: "Backlog",
		icon: CircleDashed,
		color: "text-muted-foreground",
	},
	{
		id: "planned",
		label: "Planned",
		icon: Circle,
		color: "text-blue-500",
	},
	{
		id: "active",
		label: "Active",
		icon: CircleDot,
		color: "text-yellow-500",
	},
	{
		id: "completed",
		label: "Completed",
		icon: CircleCheck,
		color: "text-emerald-500",
	},
	{
		id: "cancelled",
		label: "Cancelled",
		icon: CircleX,
		color: "text-muted-foreground",
	},
];

// ── Priority config ────────────────────────────────────────────────────────

const PRIORITY_OPTIONS = [
	{ id: "urgent", label: "Urgent" },
	{ id: "high", label: "High" },
	{ id: "medium", label: "Medium" },
	{ id: "low", label: "Low" },
	{ id: "no_priority", label: "No priority" },
];

// ── Types ──────────────────────────────────────────────────────────────────

type ProjectData = {
	_id: Id<"projects">;
	name: string;
	slug: string;
	icon?: string;
	status: ProjectStatusId;
	priority: "urgent" | "high" | "medium" | "low" | "no_priority";
	leadId?: Id<"users">;
	clientId?: Id<"clients">;
	startDate?: number;
	endDate?: number;
	tags?: string[];
	structure?: "linear" | "sprints" | "kanban";
	resources?: { url: string; label: string }[];
};

type MemberData = {
	userId: Id<"users">;
	user: {
		name?: string;
		email?: string;
		image?: string;
		avatarUrl?: string;
	} | null;
};

type ProjectMemberData = {
	_id: Id<"projectMembers">;
	userId: Id<"users">;
	name: string | null;
	email: string | null;
	image: string | null;
	role: string;
};

type ClientOption = {
	_id: Id<"clients">;
	name: string;
};

type ClientData = {
	_id: string;
	name: string;
	status: "prospect" | "active" | "on_hold" | "completed" | "archived";
	primaryContactName?: string;
	primaryContactEmail?: string;
} | null;

type StatsData = {
	backlog: number;
	todo: number;
	in_progress: number;
	done: number;
	total: number;
} | null;

type ProjectPropertiesPanelProps = {
	project: ProjectData;
	members: MemberData[];
	clients: ClientOption[];
	projectMembers?: ProjectMemberData[];
	client?: ClientData;
	stats?: StatsData;
	onUpdate: (
		updates: Record<string, string | number | string[] | undefined>,
	) => Promise<void>;
	onRemoveClient?: () => Promise<void>;
};

// ── Labels multi-select picker ──────────────────────────────────────────────

function ProjectLabelsPicker({
	workspaceLabels,
	selectedTags,
	onTagsChange,
}: {
	workspaceLabels: { _id: Id<"labels">; name: string; color: string }[];
	selectedTags: string[];
	onTagsChange: (tags: string[]) => void;
}) {
	const [open, setOpen] = useState(false);

	// Map tag names to workspace label colors
	const labelColorMap = new Map(workspaceLabels.map((l) => [l.name, l.color]));

	const handleToggle = (labelName: string) => {
		const newTags = selectedTags.includes(labelName)
			? selectedTags.filter((t) => t !== labelName)
			: [...selectedTags, labelName];
		onTagsChange(newTags);
	};

	const handleRemove = (tagName: string) => {
		onTagsChange(selectedTags.filter((t) => t !== tagName));
	};

	return (
		<div className="flex items-center gap-1 px-2 py-1 flex-wrap">
			{selectedTags.length > 0 &&
				selectedTags.map((tag) => {
					const color = labelColorMap.get(tag);
					return (
						<span
							key={tag}
							className={cn(
								"inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
								!color && "bg-muted text-muted-foreground",
							)}
							style={
								color
									? {
											backgroundColor: `${color}20`,
											color,
										}
									: undefined
							}
						>
							<span
								className="h-2 w-2 rounded-full shrink-0"
								style={{
									backgroundColor: color ?? "currentColor",
								}}
							/>
							{tag}
							<button
								type="button"
								onClick={(e) => {
									e.stopPropagation();
									handleRemove(tag);
								}}
								className="ml-0.5 hover:opacity-70 transition-opacity"
							>
								<X className="h-3 w-3" />
							</button>
						</span>
					);
				})}
			<Popover open={open} onOpenChange={setOpen}>
				<PopoverTrigger asChild>
					<button
						type="button"
						className="flex items-center gap-1.5 rounded-md px-2 py-0.5 hover:bg-muted transition-colors cursor-pointer text-sm text-muted-foreground"
					>
						{selectedTags.length === 0 && (
							<>
								<Tag className="h-3.5 w-3.5" />
								No labels
							</>
						)}
						{selectedTags.length > 0 && "+"}
					</button>
				</PopoverTrigger>
				<PopoverContent className="p-0 w-[240px]" align="end">
					<Command>
						<CommandInput placeholder="Search labels..." />
						<CommandList>
							<CommandEmpty>No labels found.</CommandEmpty>
							<CommandGroup>
								{workspaceLabels.map((label) => {
									const isSelected = selectedTags.includes(label.name);
									return (
										<CommandItem
											key={label._id}
											value={label.name}
											onSelect={() => handleToggle(label.name)}
											className="cursor-pointer"
										>
											<div className="flex items-center gap-2 w-full">
												<span
													className="h-3 w-3 rounded-full shrink-0"
													style={{ backgroundColor: label.color }}
												/>
												<span className="flex-1">{label.name}</span>
												{isSelected && (
													<Check className="h-4 w-4 text-primary" />
												)}
											</div>
										</CommandItem>
									);
								})}
							</CommandGroup>
						</CommandList>
					</Command>
				</PopoverContent>
			</Popover>
		</div>
	);
}

// ── Members picker ──────────────────────────────────────────────────────────

function ProjectMembersPicker({
	projectId,
	leadId,
	workspaceMembers,
	projectMembers,
}: {
	projectId: Id<"projects">;
	leadId?: Id<"users">;
	workspaceMembers: MemberData[];
	projectMembers: ProjectMemberData[];
}) {
	const [open, setOpen] = useState(false);
	const addMember = useMutation(api.projectMembers.add);
	const removeMember = useMutation(api.projectMembers.remove);

	// Build a set of current project member user IDs for quick lookup
	const memberUserIds = new Set(projectMembers.map((m) => m.userId));

	// Map project member userId -> projectMember _id for removal
	const memberIdByUserId = new Map(
		projectMembers.map((m) => [m.userId, m._id]),
	);

	const handleToggle = async (userId: Id<"users">, userName: string) => {
		const isMember = memberUserIds.has(userId);

		if (isMember) {
			// Guard: don't allow removing the project lead
			if (leadId && userId === leadId) {
				toast.error("Cannot remove the project lead");
				return;
			}

			const memberId = memberIdByUserId.get(userId);
			if (!memberId) return;

			try {
				await removeMember({ memberId });
				toast.success(`Removed ${userName} from project`);
			} catch {
				toast.error("Failed to remove member");
			}
		} else {
			try {
				await addMember({
					projectId,
					userId,
					role: "contributor",
				});
				toast.success(`Added ${userName} to project`);
			} catch {
				toast.error("Failed to add member");
			}
		}
	};

	return (
		<div className="flex items-center gap-1 px-2 py-1">
			<Popover open={open} onOpenChange={setOpen}>
				<PopoverTrigger asChild>
					<button
						type="button"
						className="flex items-center gap-1.5 rounded-md px-0 py-0.5 hover:bg-muted transition-colors cursor-pointer"
					>
						{projectMembers.length > 0 ? (
							<div className="flex items-center">
								{projectMembers.slice(0, 3).map((m, idx) => (
									<Avatar
										key={m._id}
										className={cn(
											"h-5 w-5 border border-background",
											idx > 0 && "-ml-1.5",
										)}
									>
										{m.image && (
											<AvatarImage src={m.image} alt={m.name ?? ""} />
										)}
										<AvatarFallback className="text-[8px]">
											{(m.name ?? "?").charAt(0).toUpperCase()}
										</AvatarFallback>
									</Avatar>
								))}
								{projectMembers.length > 3 && (
									<span className="ml-1 text-xs text-muted-foreground">
										+{projectMembers.length - 3}
									</span>
								)}
							</div>
						) : (
							<span className="text-sm text-muted-foreground flex items-center gap-1.5">
								<Users className="h-3.5 w-3.5" />
								No members
							</span>
						)}
					</button>
				</PopoverTrigger>
				<PopoverContent className="p-0 w-[240px]" align="end">
					<Command>
						<CommandInput placeholder="Search members..." />
						<CommandList>
							<CommandEmpty>No members found.</CommandEmpty>
							<CommandGroup>
								{workspaceMembers
									.filter((m) => m.user)
									.map((m) => {
										const isSelected = memberUserIds.has(m.userId);
										const isLead = leadId === m.userId;
										const displayName = m.user?.name ?? m.user?.email ?? "User";
										return (
											<CommandItem
												key={m.userId}
												value={displayName}
												onSelect={() => handleToggle(m.userId, displayName)}
												className="cursor-pointer"
											>
												<div className="flex items-center gap-2 w-full">
													<Avatar className="h-5 w-5 shrink-0">
														{(m.user?.avatarUrl ?? m.user?.image) && (
															<AvatarImage
																src={m.user?.avatarUrl ?? m.user?.image}
																alt={displayName}
															/>
														)}
														<AvatarFallback className="text-[8px]">
															{displayName.charAt(0).toUpperCase()}
														</AvatarFallback>
													</Avatar>
													<span className="flex-1 truncate">{displayName}</span>
													{isLead && (
														<span className="text-[10px] text-muted-foreground">
															Lead
														</span>
													)}
													{isSelected && (
														<Check className="h-4 w-4 text-primary shrink-0" />
													)}
												</div>
											</CommandItem>
										);
									})}
							</CommandGroup>
						</CommandList>
					</Command>
				</PopoverContent>
			</Popover>
		</div>
	);
}

// ── Component ──────────────────────────────────────────────────────────────

export function ProjectPropertiesPanel({
	project,
	members,
	clients,
	projectMembers,
	client,
	stats,
	onUpdate,
	onRemoveClient,
}: ProjectPropertiesPanelProps) {
	const { workspaceSlug, workspaceId, orgSlug } = useWorkspace();
	const workspaceLabels = useWorkspaceLabels();
	const documents = useQuery(api.documents.listByProject, {
		projectId: project._id,
	});
	const whiteboards = useQuery(api.whiteboards.listByProject, {
		projectId: project._id,
	});

	const linkedItems = useMemo(() => {
		const items: {
			id: string;
			title: string;
			type: "document" | "whiteboard";
		}[] = [];
		if (documents) {
			for (const doc of documents) {
				items.push({ id: doc._id, title: doc.title, type: "document" });
			}
		}
		if (whiteboards) {
			for (const wb of whiteboards) {
				items.push({ id: wb._id, title: wb.title, type: "whiteboard" });
			}
		}
		return items;
	}, [documents, whiteboards]);

	const hasResources =
		(project.resources && project.resources.length > 0) ||
		linkedItems.length > 0;

	const statusConfig = PROJECT_STATUS_CONFIG.find(
		(s) => s.id === project.status,
	);
	const StatusIcon = statusConfig?.icon ?? Circle;
	const lead = members.find((m) => m.userId === project.leadId);
	const currentClient = clients.find((c) => c._id === project.clientId);

	return (
		<aside className="flex flex-col p-4 pt-6">
			{/* Properties section */}
			<div className="space-y-0.5">
				<h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">
					Properties
				</h3>

				{/* Status */}
				<PropertyRow label="Status">
					<GenericPicker
						trigger={
							<button
								type="button"
								className="flex items-center gap-1.5 rounded-md px-2 py-1 hover:bg-muted transition-colors cursor-pointer text-sm"
							>
								<StatusIcon
									className={cn("h-3.5 w-3.5", statusConfig?.color)}
								/>
								<span className="text-foreground">
									{statusConfig?.label ?? project.status}
								</span>
							</button>
						}
						items={PROJECT_STATUS_CONFIG.map((s) => ({
							id: s.id,
							label: s.label,
						}))}
						selectedId={project.status}
						placeholder="Change status..."
						onSelect={(item) => {
							onUpdate({ status: item.id as ProjectStatusId });
						}}
						renderItem={(item, isSelected) => {
							const cfg = PROJECT_STATUS_CONFIG.find((s) => s.id === item.id);
							const Icon = cfg?.icon ?? Circle;
							return (
								<div className="flex items-center gap-2 w-full">
									<Icon className={cn("h-4 w-4", cfg?.color)} />
									<span>{item.label}</span>
									{isSelected && <Check className="ml-auto h-4 w-4" />}
								</div>
							);
						}}
					/>
				</PropertyRow>

				{/* Priority */}
				<PropertyRow label="Priority">
					<GenericPicker
						trigger={
							<button
								type="button"
								className="flex items-center gap-1.5 rounded-md px-2 py-1 hover:bg-muted transition-colors cursor-pointer text-sm"
							>
								{project.priority !== "no_priority" ? (
									<PriorityBadge
										level={project.priority}
										appearance="inline"
										size="sm"
									/>
								) : (
									<span className="text-muted-foreground">No priority</span>
								)}
							</button>
						}
						items={PRIORITY_OPTIONS}
						selectedId={project.priority}
						placeholder="Change priority..."
						onSelect={(item) => {
							onUpdate({ priority: item.id });
						}}
						renderItem={(item, isSelected) => (
							<div className="flex items-center gap-2 w-full">
								{item.id !== "no_priority" ? (
									<PriorityBadge
										level={item.id as "urgent" | "high" | "medium" | "low"}
										appearance="inline"
										size="sm"
									/>
								) : (
									<span className="text-muted-foreground">No priority</span>
								)}
								{isSelected && <Check className="ml-auto h-4 w-4" />}
							</div>
						)}
					/>
				</PropertyRow>

				{/* Lead */}
				<PropertyRow label="Lead">
					<GenericPicker
						trigger={
							<button
								type="button"
								className="flex items-center gap-1.5 rounded-md px-2 py-1 hover:bg-muted transition-colors cursor-pointer text-sm"
							>
								{lead?.user ? (
									<>
										<Avatar className="h-4 w-4">
											<AvatarImage
												src={lead.user.avatarUrl ?? lead.user.image}
												alt={lead.user.name ?? ""}
											/>
											<AvatarFallback className="text-[8px]">
												{(lead.user.name ?? "?").charAt(0).toUpperCase()}
											</AvatarFallback>
										</Avatar>
										<span className="text-foreground">
											{lead.user.name ?? "Unknown"}
										</span>
									</>
								) : (
									<>
										<User className="h-3.5 w-3.5 text-muted-foreground" />
										<span className="text-muted-foreground">No lead</span>
									</>
								)}
							</button>
						}
						items={[
							{ id: "__none__", label: "No lead" },
							...members
								.filter((m) => m.user)
								.map((m) => ({
									id: m.userId as string,
									label: m.user?.name ?? m.user?.email ?? "User",
								})),
						]}
						selectedId={
							project.leadId ? (project.leadId as string) : "__none__"
						}
						placeholder="Assign lead..."
						onSelect={(item) => {
							if (item.id === "__none__") {
								onUpdate({ leadId: undefined });
							} else {
								onUpdate({ leadId: item.id });
							}
						}}
						renderItem={(item, isSelected) => (
							<div className="flex items-center gap-2 w-full">
								{item.id === "__none__" ? (
									<User className="h-4 w-4 text-muted-foreground" />
								) : (
									<Avatar className="h-5 w-5">
										<AvatarFallback className="text-[10px]">
											{(item.label ?? "?").charAt(0).toUpperCase()}
										</AvatarFallback>
									</Avatar>
								)}
								<span>{item.label}</span>
								{isSelected && <Check className="ml-auto h-4 w-4" />}
							</div>
						)}
					/>
				</PropertyRow>

				{/* Members */}
				<PropertyRow label="Members">
					<ProjectMembersPicker
						projectId={project._id}
						leadId={project.leadId}
						workspaceMembers={members}
						projectMembers={projectMembers ?? []}
					/>
				</PropertyRow>

				{/* Client */}
				<PropertyRow label="Client">
					<GenericPicker
						trigger={
							<button
								type="button"
								className="flex items-center gap-1.5 rounded-md px-2 py-1 hover:bg-muted transition-colors cursor-pointer text-sm"
							>
								{currentClient ? (
									<>
										<Building2 className="h-3.5 w-3.5 text-muted-foreground" />
										<span className="text-foreground">
											{currentClient.name}
										</span>
									</>
								) : (
									<>
										<Building2 className="h-3.5 w-3.5 text-muted-foreground" />
										<span className="text-muted-foreground">No client</span>
									</>
								)}
							</button>
						}
						items={[
							{ id: "__none__", label: "No client" },
							...clients.map((c) => ({
								id: c._id as string,
								label: c.name,
							})),
						]}
						selectedId={
							project.clientId ? (project.clientId as string) : "__none__"
						}
						placeholder="Assign client..."
						onSelect={(item) => {
							if (item.id === "__none__") {
								onRemoveClient?.();
							} else {
								onUpdate({ clientId: item.id });
							}
						}}
						renderItem={(item, isSelected) => (
							<div className="flex items-center gap-2 w-full">
								<Building2 className="h-4 w-4 text-muted-foreground" />
								<span>{item.label}</span>
								{isSelected && <Check className="ml-auto h-4 w-4" />}
							</div>
						)}
					/>
				</PropertyRow>

				{/* Start date */}
				<PropertyRow label="Start date">
					<DatePicker
						date={project.startDate ? new Date(project.startDate) : undefined}
						onSelect={(d) => {
							onUpdate({ startDate: d ? d.getTime() : undefined });
						}}
						trigger={
							<button
								type="button"
								className="flex items-center gap-1.5 rounded-md px-2 py-1 hover:bg-muted transition-colors cursor-pointer text-sm"
							>
								<Calendar className="h-3.5 w-3.5 text-muted-foreground" />
								<span
									className={
										project.startDate
											? "text-foreground"
											: "text-muted-foreground"
									}
								>
									{project.startDate
										? format(new Date(project.startDate), "MMM d, yyyy")
										: "No date"}
								</span>
							</button>
						}
					/>
				</PropertyRow>

				{/* Target date */}
				<PropertyRow label="Target date">
					<DatePicker
						date={project.endDate ? new Date(project.endDate) : undefined}
						onSelect={(d) => {
							onUpdate({ endDate: d ? d.getTime() : undefined });
						}}
						trigger={
							<button
								type="button"
								className="flex items-center gap-1.5 rounded-md px-2 py-1 hover:bg-muted transition-colors cursor-pointer text-sm"
							>
								<Calendar className="h-3.5 w-3.5 text-muted-foreground" />
								<span
									className={
										project.endDate
											? "text-foreground"
											: "text-muted-foreground"
									}
								>
									{project.endDate
										? format(new Date(project.endDate), "MMM d, yyyy")
										: "No date"}
								</span>
							</button>
						}
					/>
				</PropertyRow>

				{/* Labels */}
				<PropertyRow label="Labels">
					{workspaceLabels ? (
						<ProjectLabelsPicker
							workspaceLabels={workspaceLabels}
							selectedTags={project.tags ?? []}
							onTagsChange={(tags) => onUpdate({ tags })}
						/>
					) : (
						<div className="flex items-center gap-1 px-2 py-1">
							<span className="text-sm text-muted-foreground flex items-center gap-1.5">
								<Tag className="h-3.5 w-3.5" />
								No labels
							</span>
						</div>
					)}
				</PropertyRow>

				{/* Structure */}
			</div>

			<Separator className="my-4" />

			{/* Progress section */}
			<div className="space-y-3">
				<h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
					Progress
				</h3>
				{stats && stats.total > 0 ? (
					<div className="space-y-3">
						<div className="flex items-center gap-3">
							<ProgressCircle
								progress={
									stats.total > 0
										? Math.round((stats.done / stats.total) * 100)
										: 0
								}
								color="var(--color-emerald-500)"
								size={32}
								strokeWidth={3}
							/>
							<div>
								<p className="text-sm font-medium text-foreground">
									{stats.done}/{stats.total} complete
								</p>
								<p className="text-xs text-muted-foreground">
									{stats.total > 0
										? Math.round((stats.done / stats.total) * 100)
										: 0}
									% done
								</p>
							</div>
						</div>

						{/* Status breakdown bars */}
						<div className="space-y-1.5">
							<StatusBar
								label="Done"
								count={stats.done}
								total={stats.total}
								color="bg-emerald-500"
							/>
							<StatusBar
								label="In progress"
								count={stats.in_progress}
								total={stats.total}
								color="bg-yellow-500"
							/>
							<StatusBar
								label="Todo"
								count={stats.todo}
								total={stats.total}
								color="bg-blue-500"
							/>
							<StatusBar
								label="Backlog"
								count={stats.backlog}
								total={stats.total}
								color="bg-muted-foreground/40"
							/>
						</div>
					</div>
				) : (
					<p className="text-sm text-muted-foreground">No issues yet</p>
				)}
			</div>

			<Separator className="my-4" />

			{/* Resources section */}
			<div className="space-y-3">
				<h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
					Resources
					{hasResources &&
						` (${(project.resources?.length ?? 0) + linkedItems.length})`}
				</h3>
				{hasResources ? (
					<div className="space-y-1">
						{linkedItems.map((item) => {
							const Icon = item.type === "document" ? FileText : PenTool;
							const href =
								item.type === "document"
									? `/${orgSlug}/${workspaceSlug}/docs/${item.id}`
									: item.type === "whiteboard"
										? `/${orgSlug}/${workspaceSlug}/boards/${item.id}`
										: null;
							return href ? (
								<Link
									key={item.id}
									// biome-ignore lint/suspicious/noExplicitAny: dynamic workspace routes
									href={href as any}
									className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-foreground hover:bg-muted transition-colors"
								>
									<Icon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
									<span className="truncate">{item.title}</span>
								</Link>
							) : (
								<div
									key={item.id}
									className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-foreground"
								>
									<Icon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
									<span className="truncate">{item.title}</span>
								</div>
							);
						})}
						{project.resources?.map((resource) => (
							<a
								key={resource.url}
								href={resource.url}
								target="_blank"
								rel="noopener noreferrer"
								className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-foreground hover:bg-muted transition-colors"
							>
								<ExternalLink className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
								<span className="truncate">{resource.label}</span>
							</a>
						))}
					</div>
				) : (
					<p className="text-sm text-muted-foreground">No resources linked</p>
				)}

				{/* Client info (integrated into sidebar) */}
				{client && (
					<>
						<Separator className="my-3" />
						<h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
							Client
						</h3>
						<div className="space-y-1 px-1">
							<Link
								href={`/${orgSlug}/${workspaceSlug}/clients/${client._id}`}
								className="text-sm font-medium text-foreground hover:underline underline-offset-2"
							>
								{client.name}
							</Link>
							{client.primaryContactName && (
								<p className="text-xs text-muted-foreground">
									{client.primaryContactName}
									{client.primaryContactEmail
										? ` -- ${client.primaryContactEmail}`
										: ""}
								</p>
							)}
						</div>
					</>
				)}
			</div>
		</aside>
	);
}

// ── Property row layout ────────────────────────────────────────────────────

function PropertyRow({
	label,
	children,
}: {
	label: string;
	children: React.ReactNode;
}) {
	return (
		<div className="flex items-center justify-between min-h-[32px]">
			<span className="text-sm text-muted-foreground shrink-0 w-24">
				{label}
			</span>
			<div className="flex-1 flex justify-end">{children}</div>
		</div>
	);
}

// ── Status bar mini-component ──────────────────────────────────────────────

function StatusBar({
	label,
	count,
	total,
	color,
}: {
	label: string;
	count: number;
	total: number;
	color: string;
}) {
	if (count === 0) return null;
	const percent = total > 0 ? Math.round((count / total) * 100) : 0;

	return (
		<div className="flex items-center gap-2">
			<div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
				<div
					className={cn("h-full rounded-full", color)}
					style={{ width: `${percent}%` }}
				/>
			</div>
			<span className="text-[11px] text-muted-foreground w-20 text-right">
				{count} {label.toLowerCase()}
			</span>
		</div>
	);
}
