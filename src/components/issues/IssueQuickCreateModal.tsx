"use client";

import { useMutation, useQuery } from "convex/react";
import {
	Calendar,
	Clock,
	Flag,
	FolderOpen,
	Maximize2,
	MoreHorizontal,
	Plus,
	Tag,
	User,
	X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { toast } from "sonner";
import {
	AutoTriagePanel,
	AutoTriagePanelSkeleton,
} from "@/components/ai/issues/AutoTriagePanel";
import { DuplicateDetection } from "@/components/ai/issues/DuplicateDetection";
import { useWorkspace } from "@/components/providers/workspace-context";
import {
	useWorkspaceLabels,
	useWorkspaceMembers,
	useWorkspaceProjects,
} from "@/components/providers/workspace-data-context";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DatePicker, GenericPicker } from "@/components/ui/pickers";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import { useAutoTriage } from "@/hooks/use-auto-triage";
import { useDuplicateDetection } from "@/hooks/use-duplicate-detection";
import { extractTextFromContent } from "@/lib/content-converters";
import {
	type IssueTypeKey,
	PRIORITY_ITEMS,
	type PriorityKey,
	STATUS_ITEMS,
	type StatusKey,
	TYPE_ITEMS,
} from "@/lib/issue-config";
import { cn } from "@/lib/utils";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { useIssueCreate } from "./IssueCreateContext";

// ── Issue config (from centralized module) ────────────────────────────────

const STATUS_OPTIONS = STATUS_ITEMS;
const PRIORITY_OPTIONS = PRIORITY_ITEMS;
const TYPE_OPTIONS = TYPE_ITEMS;

const ESTIMATE_OPTIONS = [
	{ id: "0", label: "No estimate" },
	{ id: "0.5", label: "0.5h" },
	{ id: "1", label: "1h" },
	{ id: "2", label: "2h" },
	{ id: "4", label: "4h" },
	{ id: "8", label: "8h" },
	{ id: "16", label: "16h" },
	{ id: "24", label: "24h" },
	{ id: "40", label: "40h" },
];

// ── Component ──────────────────────────────────────────────────────────────

interface IssueQuickCreateModalProps {
	open: boolean;
	onClose: () => void;
	onIssueCreated?: (result: { issueId: string; identifier: string }) => void;
}

export function IssueQuickCreateModal({
	open,
	onClose,
	onIssueCreated,
}: IssueQuickCreateModalProps) {
	const { workspaceId, workspaceSlug } = useWorkspace();
	const { formState, updateForm, switchMode, resetFormKeepProperties } =
		useIssueCreate();
	const createIssue = useMutation(api.issues.create);
	const rawProjects = useWorkspaceProjects();
	const workspaceMembers = useWorkspaceMembers();
	const allLabels = useWorkspaceLabels();
	const settings = useQuery(api.workspaceSettings.get, { workspaceId });

	// Sprint query based on selected project
	const activeSprints = useQuery(
		api.sprints.listByProject,
		formState.projectId
			? { projectId: formState.projectId as Id<"projects"> }
			: "skip",
	);

	const {
		suggestions: triageSuggestions,
		loading: triageLoading,
		dismissed: triageDismissed,
		dismiss: dismissTriage,
	} = useAutoTriage(formState.title, workspaceId);

	const { duplicates, loading: duplicatesLoading } = useDuplicateDetection(
		formState.title,
		workspaceId,
	);

	const handleApplyTriage = useCallback(
		(values: {
			priority: PriorityKey;
			issueType: IssueTypeKey;
			labelNames: string[];
		}) => {
			const updates: Partial<typeof formState> = {
				priority: values.priority,
				issueType: values.issueType,
			};
			if (allLabels && values.labelNames.length > 0) {
				const matchedIds = allLabels
					.filter((l) =>
						values.labelNames.some(
							(name) => name.toLowerCase() === l.name.toLowerCase(),
						),
					)
					.map((l) => l._id as string);
				if (matchedIds.length > 0) {
					updates.labelIds = matchedIds;
				}
			}
			updateForm(updates);
			dismissTriage();
		},
		[allLabels, updateForm, dismissTriage],
	);

	const titleRef = useRef<HTMLInputElement>(null);
	const descriptionRef = useRef<HTMLTextAreaElement>(null);
	const submittingRef = useRef(false);

	// Compute next identifier preview
	const identifierPreview = useMemo(() => {
		if (!settings) return null;
		const prefix = settings.issuePrefix ?? settings.storyPrefix;
		const num = settings.nextIssueNumber ?? 1;
		return `${prefix}-${String(num).padStart(3, "0")}`;
	}, [settings]);

	// Build picker options
	const projectOptions = useMemo(() => {
		if (!rawProjects) return [];
		return rawProjects.map((p) => ({ id: p._id as string, label: p.name }));
	}, [rawProjects]);

	const assigneeOptions = useMemo(() => {
		if (!workspaceMembers) return [];
		return workspaceMembers.map((m) => ({
			id: m.userId as string,
			name: m.user?.name ?? m.user?.email ?? "Unknown",
		}));
	}, [workspaceMembers]);

	const sprintOptions = useMemo(() => {
		if (!activeSprints) return [];
		return activeSprints.map((m) => ({
			id: m._id as string,
			label: m.name,
		}));
	}, [activeSprints]);

	const quickDescriptionText = useMemo(
		() => extractTextFromContent(formState.description),
		[formState.description],
	);

	// Focus title on open
	useEffect(() => {
		if (!open) return;
		requestAnimationFrame(() => {
			titleRef.current?.focus();
		});
	}, [open]);

	useEffect(() => {
		if (!open) return;
		if (!descriptionRef.current) return;
		descriptionRef.current.style.height = "auto";
		descriptionRef.current.style.height = `${descriptionRef.current.scrollHeight}px`;
	}, [open]);

	const handleSubmit = useCallback(async () => {
		if (submittingRef.current) return;
		const trimmed = formState.title.trim();
		if (!trimmed) {
			toast.error("Title is required");
			titleRef.current?.focus();
			return;
		}

		submittingRef.current = true;
		try {
			const estimateVal = Number.parseFloat(formState.estimate);
			const descriptionText = extractTextFromContent(
				formState.description,
			).trim();
			const result = await createIssue({
				workspaceId,
				title: trimmed,
				description: descriptionText ? formState.description : undefined,
				status: formState.status as
					| "triage"
					| "backlog"
					| "todo"
					| "in_progress"
					| "in_review"
					| "done"
					| "cancelled",
				priority: formState.priority as
					| "urgent"
					| "high"
					| "medium"
					| "low"
					| "no_priority",
				type: formState.issueType as
					| "issue"
					| "bug"
					| "improvement"
					| "feature",
				projectId: formState.projectId
					? (formState.projectId as Id<"projects">)
					: undefined,
				sprintId: formState.sprintId
					? (formState.sprintId as Id<"sprints">)
					: undefined,
				milestoneId: formState.milestoneId
					? (formState.milestoneId as Id<"milestones">)
					: undefined,
				assigneeId: formState.assigneeId
					? (formState.assigneeId as Id<"users">)
					: undefined,
				labelIds:
					formState.labelIds.length > 0
						? (formState.labelIds as Id<"labels">[])
						: undefined,
				estimate: estimateVal > 0 ? estimateVal : undefined,
				dueDate: formState.dueDate?.getTime(),
			});

			onIssueCreated?.(result);

			if (formState.createMore) {
				toast.success(`${result.identifier} created`);
				resetFormKeepProperties();
				titleRef.current?.focus();
				return;
			}

			toast.success(`${result.identifier} created`);
			onClose();
		} catch {
			toast.error("Failed to create issue");
		} finally {
			submittingRef.current = false;
		}
	}, [
		formState,
		workspaceId,
		createIssue,
		onIssueCreated,
		onClose,
		resetFormKeepProperties,
	]);

	if (!open) return null;

	const currentStatus =
		STATUS_OPTIONS.find((s) => s.id === formState.status) ?? STATUS_OPTIONS[1];
	const currentPriority =
		PRIORITY_OPTIONS.find((p) => p.id === formState.priority) ??
		PRIORITY_OPTIONS[0];
	const currentType =
		TYPE_OPTIONS.find((t) => t.id === formState.issueType) ?? TYPE_OPTIONS[0];
	const selectedAssignee = assigneeOptions.find(
		(a) => a.id === formState.assigneeId,
	);
	const selectedProject = projectOptions.find(
		(p) => p.id === formState.projectId,
	);
	const selectedSprint = sprintOptions.find((m) => m.id === formState.sprintId);
	const currentEstimate =
		ESTIMATE_OPTIONS.find((e) => e.id === formState.estimate) ??
		ESTIMATE_OPTIONS[0];

	return (
		// biome-ignore lint/a11y/noStaticElementInteractions: modal backdrop
		<div
			className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 pt-[20vh] backdrop-blur-sm"
			onClick={onClose}
			onKeyDown={(e) => {
				if (e.key === "Escape") onClose();
			}}
		>
			{/* Modal */}
			{/* biome-ignore lint/a11y/noStaticElementInteractions: modal content */}
			<div
				className="w-full max-w-[640px] rounded-2xl bg-background shadow-2xl border border-border animate-in fade-in-0 zoom-in-95 duration-200"
				onClick={(e) => e.stopPropagation()}
				onKeyDown={(e) => {
					if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
						e.preventDefault();
						handleSubmit();
					}
				}}
			>
				<div className="flex flex-col p-4 gap-3">
					{/* Header: identifier preview + project picker + expand + close */}
					<div className="flex items-center justify-between gap-2">
						<div className="flex items-center gap-2">
							{identifierPreview && (
								<Badge variant="secondary" className="text-xs font-mono">
									{identifierPreview}
								</Badge>
							)}
							<GenericPicker
								items={projectOptions}
								selectedId={formState.projectId}
								onSelect={(item) => {
									updateForm({
										projectId: item.id,
										sprintId: undefined,
										milestoneId: undefined,
									});
								}}
								placeholder="Choose project..."
								renderItem={(item) => (
									<div className="flex items-center gap-2 w-full">
										<span>{item.label}</span>
									</div>
								)}
								trigger={
									<button
										type="button"
										className="flex items-center gap-1.5 h-7 px-2 rounded-md border border-border hover:bg-muted transition-colors text-xs"
									>
										<FolderOpen className="h-3.5 w-3.5 text-muted-foreground" />
										<span className="truncate max-w-[140px] text-foreground">
											{selectedProject?.label ?? "Project"}
										</span>
									</button>
								}
							/>
						</div>
						<div className="flex items-center gap-1">
							<Button
								type="button"
								variant="ghost"
								size="icon"
								onClick={() => switchMode("full")}
								className="h-7 w-7 rounded-full"
								title="Expand to full view"
							>
								<Maximize2 className="h-3.5 w-3.5 text-muted-foreground" />
							</Button>
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
					</div>

					{/* Title input */}
					<div className="flex items-center gap-2">
						<button
							type="button"
							className="shrink-0"
							onClick={() => {
								const idx = STATUS_OPTIONS.findIndex(
									(s) => s.id === formState.status,
								);
								const next = STATUS_OPTIONS[(idx + 1) % STATUS_OPTIONS.length];
								updateForm({ status: next.id });
							}}
						>
							<currentStatus.icon
								className={cn("h-5 w-5", currentStatus.color)}
							/>
						</button>
						<input
							ref={titleRef}
							type="text"
							value={formState.title}
							onChange={(e) => updateForm({ title: e.target.value })}
							placeholder="Issue title"
							className="flex-1 text-lg font-medium text-foreground placeholder:text-muted-foreground outline-none bg-transparent border-none"
							autoComplete="off"
						/>
					</div>

					{/* Description textarea */}
					<textarea
						ref={descriptionRef}
						value={quickDescriptionText}
						onChange={(e) => {
							updateForm({ description: e.target.value });
							const el = e.target;
							el.style.height = "auto";
							el.style.height = `${el.scrollHeight}px`;
						}}
						placeholder="Add description..."
						rows={1}
						className="w-full text-sm text-foreground placeholder:text-muted-foreground outline-none bg-transparent border-none resize-none overflow-hidden pl-7"
					/>

					{/* AI Auto-Triage (compact) */}
					{triageLoading && !triageDismissed && (
						<AutoTriagePanelSkeleton compact />
					)}
					{triageSuggestions && !triageDismissed && !triageLoading && (
						<AutoTriagePanel
							suggestions={triageSuggestions}
							loading={triageLoading}
							onApply={handleApplyTriage}
							onDismiss={dismissTriage}
							compact
						/>
					)}

					{/* Duplicate Detection (compact) */}
					{(duplicatesLoading || duplicates.length > 0) && (
						<DuplicateDetection
							duplicates={duplicates}
							loading={duplicatesLoading}
							compact
							workspaceSlug={workspaceSlug}
						/>
					)}

					{/* Property chips */}
					<div className="flex flex-wrap gap-1.5 items-center">
						{/* Status */}
						<GenericPicker
							items={STATUS_OPTIONS.map((s) => ({
								id: s.id,
								label: s.label,
								icon: s.icon,
								color: s.color,
							}))}
							onSelect={(item) => updateForm({ status: item.id as StatusKey })}
							selectedId={formState.status}
							placeholder="Set status..."
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
									<currentStatus.icon
										className={cn("h-3.5 w-3.5", currentStatus.color)}
									/>
									<span>{currentStatus.label}</span>
								</button>
							}
						/>

						{/* Priority */}
						<GenericPicker
							items={PRIORITY_OPTIONS.map((p) => ({
								id: p.id,
								label: p.label,
								icon: p.icon,
								color: p.color,
							}))}
							onSelect={(item) =>
								updateForm({ priority: item.id as PriorityKey })
							}
							selectedId={formState.priority}
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

						{/* Assignee */}
						<GenericPicker
							items={assigneeOptions}
							onSelect={(item) => updateForm({ assigneeId: item.id })}
							selectedId={formState.assigneeId}
							placeholder="Assign to..."
							renderItem={(item) => (
								<div className="flex items-center gap-2 w-full">
									<div className="size-5 rounded-full bg-muted flex items-center justify-center text-xs font-bold">
										{item.name.charAt(0)}
									</div>
									<span className="flex-1">{item.name}</span>
								</div>
							)}
							trigger={
								<button
									type="button"
									className="flex items-center gap-1.5 h-7 px-2 rounded-md border border-border hover:bg-muted transition-colors text-xs"
								>
									<User className="h-3.5 w-3.5 text-muted-foreground" />
									<span>{selectedAssignee?.name ?? "Assignee"}</span>
								</button>
							}
						/>

						{/* Type */}
						<GenericPicker
							items={TYPE_OPTIONS.map((t) => ({ id: t.id, label: t.label }))}
							onSelect={(item) =>
								updateForm({ issueType: item.id as IssueTypeKey })
							}
							selectedId={formState.issueType}
							placeholder="Set type..."
							renderItem={(item) => (
								<div className="flex items-center gap-2 w-full">
									<span className="flex-1">{item.label}</span>
								</div>
							)}
							trigger={
								<button
									type="button"
									className="flex items-center gap-1.5 h-7 px-2 rounded-md border border-border hover:bg-muted transition-colors text-xs"
								>
									<Tag className="h-3.5 w-3.5 text-muted-foreground" />
									<span>{currentType.label}</span>
								</button>
							}
						/>

						{/* Labels */}
						{allLabels && allLabels.length > 0 && (
							<GenericPicker
								items={allLabels.map((l) => ({
									id: l._id as string,
									label: l.name,
								}))}
								onSelect={(item) => {
									const prev = formState.labelIds;
									updateForm({
										labelIds: prev.includes(item.id)
											? prev.filter((id) => id !== item.id)
											: [...prev, item.id],
									});
								}}
								selectedId={undefined}
								placeholder="Add label..."
								renderItem={(item) => (
									<div className="flex items-center gap-2 w-full">
										<span className="flex-1">{item.label}</span>
										{formState.labelIds.includes(item.id) && (
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
											{formState.labelIds.length > 0
												? `${formState.labelIds.length} label${formState.labelIds.length > 1 ? "s" : ""}`
												: "Label"}
										</span>
									</button>
								}
							/>
						)}

						{/* Overflow menu for Estimate, Sprint, Due date */}
						<Popover>
							<PopoverTrigger asChild>
								<button
									type="button"
									className="flex items-center justify-center h-7 w-7 rounded-md border border-border hover:bg-muted transition-colors"
									title="More properties"
								>
									<MoreHorizontal className="h-3.5 w-3.5 text-muted-foreground" />
								</button>
							</PopoverTrigger>
							<PopoverContent className="w-[260px] p-2 space-y-1" align="start">
								{/* Estimate */}
								<div className="flex items-center gap-2 px-2 py-1.5">
									<Clock className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
									<span className="text-xs text-muted-foreground w-14 shrink-0">
										Estimate
									</span>
									<GenericPicker
										items={ESTIMATE_OPTIONS}
										onSelect={(item) => updateForm({ estimate: item.id })}
										selectedId={formState.estimate}
										placeholder="Set estimate..."
										renderItem={(item) => (
											<div className="flex items-center gap-2 w-full">
												<span className="flex-1">{item.label}</span>
											</div>
										)}
										trigger={
											<button
												type="button"
												className="flex-1 text-left text-xs px-2 py-1 rounded-md hover:bg-muted transition-colors truncate"
											>
												{currentEstimate.label}
											</button>
										}
									/>
								</div>

								{/* Sprint / Milestone */}
								<div className="flex items-center gap-2 px-2 py-1.5">
									<Flag className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
									<span className="text-xs text-muted-foreground w-14 shrink-0">
										Sprint
									</span>
									{formState.projectId ? (
										<GenericPicker
											items={sprintOptions}
											onSelect={(item) =>
												updateForm({
													sprintId: item.id,
													milestoneId: undefined,
												})
											}
											selectedId={formState.sprintId}
											placeholder="Set sprint..."
											renderItem={(item) => (
												<div className="flex items-center gap-2 w-full">
													<span className="flex-1">{item.label}</span>
												</div>
											)}
											trigger={
												<button
													type="button"
													className="flex-1 text-left text-xs px-2 py-1 rounded-md hover:bg-muted transition-colors truncate"
												>
													{selectedSprint?.label ?? "No sprint"}
												</button>
											}
										/>
									) : (
										<span className="flex-1 text-xs text-muted-foreground/60 px-2 py-1">
											Select a project first
										</span>
									)}
								</div>

								{/* Due date */}
								<div className="flex items-center gap-2 px-2 py-1.5">
									<Calendar className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
									<span className="text-xs text-muted-foreground w-14 shrink-0">
										Due date
									</span>
									<DatePicker
										date={formState.dueDate}
										onSelect={(d) => updateForm({ dueDate: d })}
										trigger={
											<button
												type="button"
												className="flex-1 text-left text-xs px-2 py-1 rounded-md hover:bg-muted transition-colors truncate"
											>
												{formState.dueDate
													? formState.dueDate.toLocaleDateString()
													: "No due date"}
											</button>
										}
									/>
								</div>
							</PopoverContent>
						</Popover>
					</div>

					{/* Footer */}
					<div className="flex items-center justify-between pt-2 border-t border-border">
						<div className="flex items-center gap-2">
							<Switch
								checked={formState.createMore}
								onCheckedChange={(v) => updateForm({ createMore: Boolean(v) })}
							/>
							<span className="text-xs text-muted-foreground">Create more</span>
						</div>
						<Button
							type="button"
							onClick={handleSubmit}
							disabled={submittingRef.current}
							className="h-8 px-4 rounded-lg text-sm"
						>
							Create issue
						</Button>
					</div>
				</div>
			</div>
		</div>
	);
}
