"use client";

import { useMutation, useQuery } from "convex/react";
import { format } from "date-fns";
import {
	Calendar,
	CircleDashed,
	CircleDot,
	CircleX,
	Clock,
	Flag,
	FolderOpen,
	GitBranch,
	type LucideIcon,
	Maximize2,
	SignalHigh,
	Tag,
	User,
	X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useMemo, useState } from "react";
import { CreateBranchDialog } from "@/components/github/CreateBranchDialog";
import { EstimateInput } from "@/components/issues/EstimateInput";
import { useWorkspace } from "@/components/providers/workspace-context";
import {
	useWorkspaceLabels,
	useWorkspaceMembers,
	useWorkspaceProjects,
} from "@/components/providers/workspace-data-context";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { DatePicker, GenericPicker } from "@/components/ui/pickers";
import { Separator } from "@/components/ui/separator";
import { useEffectiveIssueConfig } from "@/hooks/use-effective-issue-config";
import { extractTextFromContent } from "@/lib/content-converters";
import { DEFAULT_PRIORITIES } from "@/lib/issue-config";
import { cn } from "@/lib/utils";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

// ── Property row ────────────────────────────────────────────────────────────

function PropertyRow({
	icon: Icon,
	label,
	children,
}: {
	icon: LucideIcon;
	label: string;
	children: React.ReactNode;
}) {
	return (
		<div className="flex items-center gap-3 min-h-[32px] py-0.5">
			<span className="flex items-center gap-2 text-[12px] text-muted-foreground w-[88px] shrink-0">
				<Icon className="h-3.5 w-3.5" />
				{label}
			</span>
			<div className="flex-1 min-w-0 text-sm">{children}</div>
		</div>
	);
}

// ── Editable dropdown property ──────────────────────────────────────────────

function EditableProperty<T extends string>({
	icon: Icon,
	label,
	value,
	options,
	onChange,
}: {
	icon: LucideIcon;
	label: string;
	value: T;
	options: {
		key: T;
		label: string;
		icon?: LucideIcon;
		color?: string;
		colorHex?: string;
	}[];
	onChange: (value: T) => void;
}) {
	const current = options.find((o) => o.key === value);
	const CurrentIcon = current?.icon;
	const currentStyle = current?.colorHex
		? { color: current.colorHex }
		: undefined;

	return (
		<div className="flex items-center gap-3 min-h-[32px] py-0.5">
			<span className="flex items-center gap-2 text-[12px] text-muted-foreground w-[88px] shrink-0">
				<Icon className="h-3.5 w-3.5" />
				{label}
			</span>
			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<button
						type="button"
						className="flex items-center gap-1.5 text-sm hover:bg-accent/50 rounded px-1.5 py-0.5 -ml-1.5 transition-colors min-w-0"
					>
						{CurrentIcon && (
							<CurrentIcon
								className={cn(
									"h-3.5 w-3.5 shrink-0",
									!current?.colorHex && current?.color,
								)}
								style={currentStyle}
							/>
						)}
						<span className="truncate">{current?.label ?? value}</span>
					</button>
				</DropdownMenuTrigger>
				<DropdownMenuContent align="start" className="w-44">
					{options.map((opt) => {
						const OptIcon = opt.icon;
						const optStyle = opt.colorHex ? { color: opt.colorHex } : undefined;
						return (
							<DropdownMenuItem
								key={opt.key}
								onClick={() => onChange(opt.key)}
								className={cn(
									"gap-2 text-xs",
									opt.key === value && "bg-accent",
								)}
							>
								{OptIcon && (
									<OptIcon
										className={cn("h-3.5 w-3.5", !opt.colorHex && opt.color)}
										style={optStyle}
									/>
								)}
								{opt.label}
							</DropdownMenuItem>
						);
					})}
				</DropdownMenuContent>
			</DropdownMenu>
		</div>
	);
}

// ── Main component ──────────────────────────────────────────────────────────

export function IssuePreviewSidebar({
	issueId,
	onClose,
}: {
	issueId: Id<"issues">;
	onClose: () => void;
}) {
	const { workspaceId, workspaceSlug } = useWorkspace();
	const router = useRouter();
	const [descriptionExpanded, setDescriptionExpanded] = useState(false);
	const [createBranchOpen, setCreateBranchOpen] = useState(false);
	const updateIssue = useMutation(api.issues.update);

	const handleUpdate = useCallback(
		(field: string, value: unknown) => {
			updateIssue({ issueId, [field]: value });
		},
		[updateIssue, issueId],
	);

	// Fetch issue data
	const issue = useQuery(api.issues.getById, { issueId });

	// Fetch project for custom status merge
	const projectForStatuses = useQuery(
		api.projects.getById,
		issue?.projectId ? { projectId: issue.projectId } : "skip",
	);
	const effective = useEffectiveIssueConfig(
		workspaceId,
		projectForStatuses ?? undefined,
	);

	// Lookup data
	const members = useWorkspaceMembers();
	const projects = useWorkspaceProjects();
	const labels = useWorkspaceLabels();
	const sprints = useQuery(
		api.sprints.listByProject,
		issue?.projectId ? { projectId: issue.projectId } : "skip",
	);

	// Build lookup maps
	const memberMap = useMemo(() => {
		const map = new Map<
			string,
			{ userId: string; name: string; image?: string }
		>();
		if (members) {
			for (const m of members) {
				map.set(m.userId, {
					userId: m.userId,
					name: m.user?.name ?? "Unknown",
					image: m.user?.avatarUrl ?? m.user?.image ?? undefined,
				});
			}
		}
		return map;
	}, [members]);

	const projectMap = useMemo(() => {
		const map = new Map<string, string>();
		if (projects) {
			for (const p of projects) {
				map.set(p._id, p.name);
			}
		}
		return map;
	}, [projects]);

	const milestoneMap = useMemo(() => {
		const map = new Map<string, string>();
		if (sprints) {
			for (const m of sprints) {
				map.set(m._id, m.name);
			}
		}
		return map;
	}, [sprints]);

	// Labels (hooks must run before any early returns)
	const allLabelOptions = useMemo(() => {
		return (labels ?? []).map((l) => ({
			_id: l._id,
			name: l.name,
			color: l.color,
		}));
	}, [labels]);

	const toggleLabel = useCallback(
		(labelId: Id<"labels">) => {
			const current = issue?.labelIds ?? [];
			const next = current.includes(labelId)
				? current.filter((id: Id<"labels">) => id !== labelId)
				: [...current, labelId];
			handleUpdate("labelIds", next);
		},
		[issue?.labelIds, handleUpdate],
	);

	// Loading state
	if (issue === undefined) {
		return (
			<div className="w-[340px] shrink-0 border-l border-border/60 bg-background animate-pulse">
				<div className="flex items-center justify-between px-4 py-3 border-b border-border/60">
					<div className="h-4 w-24 bg-muted rounded" />
					<div className="h-6 w-6 bg-muted rounded" />
				</div>
				<div className="p-4 space-y-3">
					<div className="h-5 w-32 bg-muted rounded" />
					<div className="h-4 w-full bg-muted rounded" />
					<div className="h-4 w-3/4 bg-muted rounded" />
				</div>
			</div>
		);
	}

	// Issue not found
	if (issue === null) {
		return (
			<div className="w-[340px] shrink-0 border-l border-border/60 bg-background">
				<div className="flex items-center justify-between px-4 py-3 border-b border-border/60">
					<span className="text-sm text-muted-foreground">Not found</span>
					<Button
						variant="ghost"
						size="icon"
						className="h-6 w-6"
						onClick={onClose}
					>
						<X className="h-3.5 w-3.5" />
					</Button>
				</div>
				<div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
					<CircleX className="h-8 w-8 mb-2 opacity-40" />
					<p className="text-sm">Issue not found</p>
				</div>
			</div>
		);
	}

	const effectiveAssigneeIds =
		issue.assigneeIds && issue.assigneeIds.length > 0
			? issue.assigneeIds
			: issue.assigneeId
				? [issue.assigneeId]
				: [];
	const assignees = effectiveAssigneeIds
		.map((id) => memberMap.get(id))
		.filter((m) => m !== undefined);
	const projectName = issue.projectId
		? projectMap.get(issue.projectId)
		: undefined;
	const milestoneName = issue.sprintId
		? milestoneMap.get(issue.sprintId)
		: issue.milestoneId
			? milestoneMap.get(issue.milestoneId)
			: undefined;

	// Resolve labels
	const issueLabels = (issue.labelIds ?? [])
		.map((id: Id<"labels">) => {
			const label = labels?.find((l) => l._id === id);
			return label
				? { _id: label._id, name: label.name, color: label.color }
				: null;
		})
		.filter(
			(l): l is { _id: Id<"labels">; name: string; color: string } =>
				l !== null,
		);

	// Description truncation — extract plain text from content JSON
	const description = issue.description
		? extractTextFromContent(issue.description)
		: "";
	const isDescriptionLong = description.length > 200;
	const displayDescription =
		isDescriptionLong && !descriptionExpanded
			? `${description.slice(0, 200)}...`
			: description;

	return (
		<div className="w-[420px] shrink-0 border-l border-border/60 bg-background flex flex-col min-h-0 animate-in slide-in-from-right-4 duration-200">
			{/* Header */}
			<div className="flex items-center justify-between px-4 py-3 border-b border-border/60">
				<div className="flex items-center gap-2 min-w-0">
					<span className="text-xs font-mono text-muted-foreground shrink-0">
						{issue.identifier}
					</span>
					<span className="text-muted-foreground/40">|</span>
					<h2 className="text-sm font-semibold truncate">{issue.title}</h2>
				</div>
				<div className="flex items-center gap-0.5 shrink-0">
					<Button
						variant="ghost"
						size="icon"
						className="h-7 w-7 text-muted-foreground hover:text-foreground"
						onClick={() =>
							issue &&
							router.push(`/${workspaceSlug}/issues/${issue.identifier}`)
						}
						title="Open full page"
					>
						<Maximize2 className="h-3.5 w-3.5" />
					</Button>
					<Button
						variant="ghost"
						size="icon"
						className="h-7 w-7 text-muted-foreground hover:text-foreground"
						onClick={onClose}
						title="Close preview"
					>
						<X className="h-3.5 w-3.5" />
					</Button>
				</div>
			</div>

			{/* Scrollable content */}
			<div className="flex-1 overflow-y-auto">
				<div className="px-5 py-4 space-y-5">
					{/* Description */}
					{description ? (
						<div>
							<p className="text-[13px] text-foreground/70 leading-relaxed whitespace-pre-wrap">
								{displayDescription}
							</p>
							{isDescriptionLong && (
								<button
									type="button"
									onClick={() => setDescriptionExpanded((v) => !v)}
									className="text-[12px] text-primary hover:underline mt-1"
								>
									{descriptionExpanded ? "Show less" : "Show more"}
								</button>
							)}
						</div>
					) : (
						<p className="text-[13px] text-muted-foreground/50 italic">
							No description
						</p>
					)}

					<Separator className="bg-border/40" />

					{/* Properties */}
					<div className="space-y-0.5">
						<h3 className="text-[11px] font-medium text-muted-foreground/70 mb-2">
							Properties
						</h3>

						{/* Status (editable) */}
						<EditableProperty
							icon={CircleDashed}
							label="Status"
							value={issue.status}
							options={effective.statusItems.map((s) => ({
								key: s.id,
								label: s.label,
								icon: s.icon,
								colorHex: s.colorHex,
							}))}
							onChange={(v) => handleUpdate("status", v)}
						/>

						{/* Priority (editable) */}
						<EditableProperty
							icon={SignalHigh}
							label="Priority"
							value={issue.priority}
							options={DEFAULT_PRIORITIES.map((p) => ({
								key: p.key,
								label: p.name,
								icon: p.icon,
								color: p.color,
							}))}
							onChange={(v) => handleUpdate("priority", v)}
						/>

						{/* Assignees (editable, multi-select) */}
						<div className="flex items-start gap-3 min-h-[32px] py-0.5">
							<span className="flex items-center gap-2 text-[12px] text-muted-foreground w-[88px] shrink-0 pt-0.5">
								<User className="h-3.5 w-3.5" />
								Assignees
							</span>
							<DropdownMenu>
								<DropdownMenuTrigger asChild>
									<button
										type="button"
										className="flex items-center gap-1.5 text-sm hover:bg-accent/50 rounded px-1.5 py-0.5 -ml-1.5 transition-colors flex-wrap"
									>
										{assignees.length > 0 ? (
											<div className="flex flex-wrap gap-1">
												{assignees.map((assignee) => (
													<span
														key={assignee.name}
														className="inline-flex items-center gap-1 bg-muted/40 rounded px-1.5 py-0.5"
													>
														<Avatar className="h-4 w-4">
															<AvatarImage src={assignee.image} />
															<AvatarFallback className="text-[8px]">
																{assignee.name?.charAt(0) ?? "?"}
															</AvatarFallback>
														</Avatar>
														<span className="text-xs">{assignee.name}</span>
													</span>
												))}
											</div>
										) : (
											<span className="text-muted-foreground">Unassigned</span>
										)}
									</button>
								</DropdownMenuTrigger>
								<DropdownMenuContent
									align="start"
									className="w-48 max-h-60 overflow-y-auto"
								>
									{members?.map((m) => {
										// Canonical assignee set: merge legacy `assigneeId` with the
										// `assigneeIds[]` array so toggle works no matter which path
										// the record was last written through.
										const currentSet = new Set<string>([
											...((issue.assigneeIds as string[] | undefined) ?? []),
											...(issue.assigneeId ? [issue.assigneeId as string] : []),
										]);
										const isAssigned = currentSet.has(m.userId);
										return m.user ? (
											<DropdownMenuItem
												key={m.userId}
												onClick={() => {
													const next = new Set(currentSet);
													if (isAssigned) next.delete(m.userId);
													else next.add(m.userId);
													const newIds = [...next];
													handleUpdate(
														"assigneeIds",
														newIds.length > 0 ? newIds : undefined,
													);
												}}
												className={cn(
													"gap-2 text-xs",
													isAssigned && "bg-accent",
												)}
											>
												<Avatar className="h-4 w-4">
													<AvatarImage src={m.user.avatarUrl ?? m.user.image} />
													<AvatarFallback className="text-[8px]">
														{m.user.name?.charAt(0) ?? "?"}
													</AvatarFallback>
												</Avatar>
												{m.user.name ?? "Unknown"}
											</DropdownMenuItem>
										) : null;
									})}
								</DropdownMenuContent>
							</DropdownMenu>
						</div>

						{/* Labels */}
						<PropertyRow icon={Tag} label="Labels">
							<DropdownMenu>
								<DropdownMenuTrigger asChild>
									<button
										type="button"
										className="flex items-center gap-2 text-sm hover:bg-accent/50 rounded px-1.5 py-0.5 -ml-1.5 transition-colors min-w-0"
									>
										{issueLabels.length > 0 ? (
											<span className="flex flex-wrap gap-1 min-w-0">
												{issueLabels.slice(0, 2).map((label) => (
													<span
														key={label._id}
														className="inline-flex items-center gap-1 text-[11px] text-muted-foreground truncate"
													>
														<span
															className="h-2 w-2 rounded-full shrink-0"
															style={{ backgroundColor: label.color }}
														/>
														<span className="truncate max-w-[72px]">
															{label.name}
														</span>
													</span>
												))}
												{issueLabels.length > 2 && (
													<span className="text-[10px] text-muted-foreground">
														+{issueLabels.length - 2}
													</span>
												)}
											</span>
										) : (
											<span className="text-muted-foreground">None</span>
										)}
									</button>
								</DropdownMenuTrigger>
								<DropdownMenuContent
									align="start"
									className="w-64 max-h-72 overflow-y-auto"
								>
									{allLabelOptions.length === 0 ? (
										<DropdownMenuItem disabled className="text-xs">
											No labels
										</DropdownMenuItem>
									) : (
										allLabelOptions.map((l) => {
											const selected = (issue.labelIds ?? []).includes(l._id);
											return (
												<DropdownMenuItem
													key={l._id}
													onClick={() => toggleLabel(l._id)}
													className={cn(
														"gap-2 text-xs",
														selected && "bg-accent",
													)}
												>
													<span
														className="h-2.5 w-2.5 rounded-full shrink-0"
														style={{ backgroundColor: l.color }}
													/>
													<span className="flex-1 truncate">{l.name}</span>
													{selected ? (
														<span className="text-[10px] text-muted-foreground">
															Selected
														</span>
													) : null}
												</DropdownMenuItem>
											);
										})
									)}
								</DropdownMenuContent>
							</DropdownMenu>
						</PropertyRow>

						<Separator className="my-2 bg-border/40" />

						{/* Project */}
						<PropertyRow icon={FolderOpen} label="Project">
							<GenericPicker
								items={(projects ?? []).map((p) => ({
									id: p._id as string,
									label: p.name,
								}))}
								selectedId={issue.projectId ?? undefined}
								onSelect={(item) => handleUpdate("projectId", item.id)}
								placeholder="Search projects..."
								renderItem={(item, isSelected) => (
									<div className="flex items-center gap-2 w-full">
										<FolderOpen className="h-4 w-4 text-muted-foreground" />
										<span className="flex-1 truncate">{item.label}</span>
										{isSelected ? (
											<span className="text-[10px] text-muted-foreground">
												Selected
											</span>
										) : null}
									</div>
								)}
								trigger={
									<button
										type="button"
										className="flex items-center gap-1.5 text-sm hover:bg-accent/50 rounded px-1.5 py-0.5 -ml-1.5 transition-colors min-w-0"
									>
										<span
											className={cn(!projectName && "text-muted-foreground")}
										>
											{projectName ?? "No project"}
										</span>
									</button>
								}
							/>
						</PropertyRow>

						{/* Sprint (editable) */}
						<div className="flex items-center gap-3 min-h-[32px] py-0.5">
							<span className="flex items-center gap-2 text-[12px] text-muted-foreground w-[88px] shrink-0">
								<Flag className="h-3.5 w-3.5" />
								Sprint
							</span>
							<DropdownMenu>
								<DropdownMenuTrigger asChild>
									<button
										type="button"
										className="flex items-center gap-1.5 text-sm hover:bg-accent/50 rounded px-1.5 py-0.5 -ml-1.5 transition-colors"
									>
										<span
											className={cn(!milestoneName && "text-muted-foreground")}
										>
											{milestoneName ?? "No sprint"}
										</span>
									</button>
								</DropdownMenuTrigger>
								<DropdownMenuContent
									align="start"
									className="w-48 max-h-60 overflow-y-auto"
								>
									<DropdownMenuItem
										onClick={() => handleUpdate("sprintId", undefined)}
										className="gap-2 text-xs"
									>
										<Flag className="h-3.5 w-3.5 text-muted-foreground" />
										No sprint (backlog)
									</DropdownMenuItem>
									{sprints?.map((s) => (
										<DropdownMenuItem
											key={s._id}
											onClick={() => handleUpdate("sprintId", s._id)}
											className={cn(
												"gap-2 text-xs",
												s._id === (issue.sprintId ?? issue.milestoneId) &&
													"bg-accent",
											)}
										>
											<Flag className="h-3.5 w-3.5 text-sienna-500" />
											{s.name}
										</DropdownMenuItem>
									))}
								</DropdownMenuContent>
							</DropdownMenu>
						</div>

						<Separator className="my-2 bg-border/40" />

						{/* Type (editable) */}
						<EditableProperty
							icon={CircleDot}
							label="Type"
							value={issue.type ?? "issue"}
							options={effective.typeItems.map((t) => ({
								key: t.id,
								label: t.label,
								icon: t.icon,
								colorHex: t.colorHex,
							}))}
							onChange={(v) => handleUpdate("type", v)}
						/>

						{/* Estimate */}
						<PropertyRow icon={Clock} label="Estimate">
							<EstimateInput
								value={issue.estimate ?? undefined}
								onChange={(hours) =>
									handleUpdate("estimate", hours === 0 ? undefined : hours)
								}
								compact
								className="h-7 px-2"
							/>
						</PropertyRow>

						{/* Due date */}
						<PropertyRow icon={Calendar} label="Due date">
							<DatePicker
								date={issue.dueDate ? new Date(issue.dueDate) : undefined}
								onSelect={(d) => handleUpdate("dueDate", d?.getTime())}
								trigger={
									<button
										type="button"
										className="flex items-center gap-1.5 text-sm hover:bg-accent/50 rounded px-1.5 py-0.5 -ml-1.5 transition-colors"
									>
										<span
											className={cn(!issue.dueDate && "text-muted-foreground")}
										>
											{issue.dueDate
												? format(new Date(issue.dueDate), "MMM d, yyyy")
												: "No due date"}
										</span>
									</button>
								}
							/>
						</PropertyRow>

						<Separator className="my-2 bg-border/40" />

						{/* GitHub / Development */}
						{issue.projectId ? (
							<div className="space-y-0.5">
								<h3 className="text-[11px] font-medium text-muted-foreground/70 mb-2 mt-1">
									Development
								</h3>
								<PropertyRow icon={GitBranch} label="Branch">
									<div className="flex items-center gap-2">
										<span
											className={cn(
												"text-xs font-mono",
												!issue.gitBranchName && "text-muted-foreground",
											)}
										>
											{issue.gitBranchName ?? "No branch"}
										</span>
										<Button
											type="button"
											variant="outline"
											size="sm"
											className="h-7 text-xs ml-auto"
											onClick={() => setCreateBranchOpen(true)}
										>
											Create branch
										</Button>
									</div>
								</PropertyRow>
							</div>
						) : null}

						{issue.projectId ? (
							<CreateBranchDialog
								open={createBranchOpen}
								onOpenChange={setCreateBranchOpen}
								projectId={issue.projectId}
								issueId={issue._id}
								identifier={issue.identifier}
								title={issue.title}
							/>
						) : null}

						{/* Timestamps */}
						<div className="space-y-1 pt-1 text-[11px] text-muted-foreground/60">
							<p>
								Created{" "}
								{format(
									new Date(issue._creationTime),
									"MMM d, yyyy 'at' h:mm a",
								)}
							</p>
							{issue.updatedAt && (
								<p>
									Updated{" "}
									{format(new Date(issue.updatedAt), "MMM d, yyyy 'at' h:mm a")}
								</p>
							)}
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}
