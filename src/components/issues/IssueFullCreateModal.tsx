"use client";

import { useMutation, useQuery } from "convex/react";
import {
	Calendar,
	Check,
	CircleDashed,
	CircleDot,
	Clock,
	Flag,
	FolderOpen,
	Minimize2,
	SignalHigh,
	Tag,
	User,
	X,
} from "lucide-react";
import type { Value } from "platejs";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { AIEditorPlugin } from "@/components/ai/editor/ai-editor-plugin";
import { EditorAIBridge } from "@/components/ai/editor/EditorAIBridge";
import {
	AutoTriagePanel,
	AutoTriagePanelSkeleton,
} from "@/components/ai/issues/AutoTriagePanel";
import { DraftDescriptionButton } from "@/components/ai/issues/DraftDescriptionButton";
import { DuplicateDetection } from "@/components/ai/issues/DuplicateDetection";
import { PlateEditor } from "@/components/editor/plate-editor";
import { useWorkspace } from "@/components/providers/workspace-context";
import {
	useWorkspaceLabels,
	useWorkspaceMembers,
	useWorkspaceProjects,
} from "@/components/providers/workspace-data-context";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Command,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
} from "@/components/ui/command";
import { DatePicker, GenericPicker } from "@/components/ui/pickers";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { useAutoTriage } from "@/hooks/use-auto-triage";
import { useDuplicateDetection } from "@/hooks/use-duplicate-detection";
import {
	extractTextFromContent,
	parseAnyContentToSlate,
	plainTextToSlate,
} from "@/lib/content-converters";
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
	{ id: "8", label: "1d" },
	{ id: "16", label: "2d" },
	{ id: "24", label: "3d" },
	{ id: "40", label: "5d" },
];

// ── Component ──────────────────────────────────────────────────────────────

interface IssueFullCreateModalProps {
	open: boolean;
	onClose: () => void;
	onIssueCreated?: (result: { issueId: string; identifier: string }) => void;
}

export function IssueFullCreateModal({
	open,
	onClose,
	onIssueCreated,
}: IssueFullCreateModalProps) {
	if (!open) return null;
	return (
		<IssueFullCreateModalContent
			onClose={onClose}
			onIssueCreated={onIssueCreated}
		/>
	);
}

function IssueFullCreateModalContent({
	onClose,
	onIssueCreated,
}: Omit<IssueFullCreateModalProps, "open">) {
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

	// List query based on selected project
	const projectLists = useQuery(
		api.lists.listByProject,
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
			// Resolve label names to IDs from the fetched workspace labels
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
	const submittingRef = useRef(false);
	const [descriptionEditorKey, setDescriptionEditorKey] = useState(0);

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

	const listOptions = useMemo(() => {
		if (!projectLists) return [];
		return projectLists.map((l) => ({
			id: l._id as string,
			label: l.name,
		}));
	}, [projectLists]);

	const initialDescriptionValue = useMemo(
		() => parseAnyContentToSlate(formState.description) as Value | undefined,
		[formState.description],
	);
	const aiPlugins = useMemo(() => [AIEditorPlugin], []);

	const hasExistingDescription =
		extractTextFromContent(formState.description).trim().length > 0;

	const handleDescriptionChange = useCallback(
		(value: Value) => {
			updateForm({ description: JSON.stringify(value) });
		},
		[updateForm],
	);

	// Focus title on open
	useEffect(() => {
		if (!open) return;
		setDescriptionEditorKey((k) => k + 1);
		requestAnimationFrame(() => {
			titleRef.current?.focus();
		});
	}, []);

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
				listId: formState.listId
					? (formState.listId as Id<"lists">)
					: undefined,
				milestoneId: formState.milestoneId
					? (formState.milestoneId as Id<"milestones">)
					: undefined,
				assigneeIds:
					formState.assigneeIds.length > 0
						? (formState.assigneeIds as Id<"users">[])
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
				setDescriptionEditorKey((k) => k + 1);
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
	const selectedAssignees = useMemo(() => {
		const ids = formState.assigneeIds ?? [];
		if (ids.length === 0) return [];
		return ids
			.map((id) => assigneeOptions.find((a) => a.id === id))
			.filter((a) => a !== undefined);
	}, [assigneeOptions, formState.assigneeIds]);
	const selectedProject = projectOptions.find(
		(p) => p.id === formState.projectId,
	);
	const selectedSprint = sprintOptions.find((m) => m.id === formState.sprintId);
	const selectedList = listOptions.find((l) => l.id === formState.listId);
	const currentEstimate =
		ESTIMATE_OPTIONS.find((e) => e.id === formState.estimate) ??
		ESTIMATE_OPTIONS[0];

	return (
		// biome-ignore lint/a11y/noStaticElementInteractions: modal backdrop
		<div
			className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
			onClick={onClose}
			onKeyDown={(e) => {
				if (e.key === "Escape") onClose();
			}}
		>
			{/* Full-screen modal */}
			{/* biome-ignore lint/a11y/noStaticElementInteractions: modal content */}
			<div
				className="w-full max-w-[800px] max-h-[85vh] rounded-2xl bg-background shadow-2xl border border-border flex flex-col animate-in fade-in-0 zoom-in-95 duration-200"
				onClick={(e) => e.stopPropagation()}
				onKeyDown={(e) => {
					if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
						e.preventDefault();
						handleSubmit();
					}
				}}
			>
				{/* Header */}
				<div className="flex items-center justify-between p-4 border-b border-border">
					<div className="flex items-center gap-2">
						<span className="text-sm font-medium text-foreground">
							New issue
						</span>
						{identifierPreview && (
							<Badge variant="secondary" className="text-xs font-mono">
								{identifierPreview}
							</Badge>
						)}
					</div>
					<div className="flex items-center gap-1">
						<Button
							type="button"
							variant="ghost"
							size="icon"
							onClick={() => switchMode("quick")}
							className="h-7 w-7 rounded-full"
							title="Collapse to compact view"
						>
							<Minimize2 className="h-3.5 w-3.5 text-muted-foreground" />
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

				{/* Content: two columns */}
				<div className="flex flex-col md:flex-row flex-1 min-h-0 overflow-hidden">
					{/* Left: title + description */}
					<div className="flex-1 overflow-y-auto p-4 space-y-4">
						{/* Title */}
						<div className="flex items-center gap-2">
							<button
								type="button"
								className="shrink-0"
								onClick={() => {
									const idx = STATUS_OPTIONS.findIndex(
										(s) => s.id === formState.status,
									);
									const next =
										STATUS_OPTIONS[(idx + 1) % STATUS_OPTIONS.length];
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
								className="flex-1 text-xl font-semibold text-foreground placeholder:text-muted-foreground outline-none bg-transparent border-none"
								autoComplete="off"
							/>
						</div>

						{/* AI Auto-Triage */}
						{triageLoading && !triageDismissed && <AutoTriagePanelSkeleton />}
						{triageSuggestions && !triageDismissed && !triageLoading && (
							<AutoTriagePanel
								suggestions={triageSuggestions}
								loading={triageLoading}
								onApply={handleApplyTriage}
								onDismiss={dismissTriage}
							/>
						)}

						{/* Duplicate Detection */}
						{(duplicatesLoading || duplicates.length > 0) && (
							<DuplicateDetection
								duplicates={duplicates}
								loading={duplicatesLoading}
								workspaceSlug={workspaceSlug}
							/>
						)}

						{/* Description */}
						<div className="space-y-2">
							<div className="flex items-center justify-between">
								<span className="text-xs text-muted-foreground">
									Description
								</span>
								<DraftDescriptionButton
									title={formState.title}
									workspaceId={workspaceId}
									issueType={formState.issueType}
									priority={formState.priority}
									hasExistingContent={hasExistingDescription}
									onDraft={(text) => {
										const slate = plainTextToSlate(text);
										updateForm({
											description: slate ? JSON.stringify(slate) : "",
										});
										setDescriptionEditorKey((k) => k + 1);
									}}
								/>
							</div>
							<div className="min-h-[200px] bg-background px-0 py-0 [&_.font-heading]:mt-2 [&_.font-heading]:pb-0">
								<PlateEditor
									key={descriptionEditorKey}
									variant="simple"
									value={initialDescriptionValue}
									onChange={handleDescriptionChange}
									placeholder="Add a description..."
									plugins={aiPlugins}
								>
									<EditorAIBridge context={{ workspaceId }} />
								</PlateEditor>
							</div>
						</div>
					</div>

					{/* Right: properties sidebar */}
					<div className="w-full md:w-[280px] md:border-l border-t md:border-t-0 border-border overflow-y-auto p-4 space-y-3">
						<h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
							Properties
						</h3>

						{/* Status */}
						<PropertyRow label="Status" icon={CircleDashed}>
							<GenericPicker
								items={STATUS_OPTIONS.map((s) => ({
									id: s.id,
									label: s.label,
									icon: s.icon,
									color: s.color,
								}))}
								onSelect={(item) =>
									updateForm({ status: item.id as StatusKey })
								}
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
										className="flex items-center gap-1.5 px-2 py-1 rounded-md hover:bg-muted transition-colors text-sm"
									>
										<currentStatus.icon
											className={cn("h-4 w-4", currentStatus.color)}
										/>
										<span>{currentStatus.label}</span>
									</button>
								}
							/>
						</PropertyRow>

						{/* Priority */}
						<PropertyRow label="Priority" icon={SignalHigh}>
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
										className="flex items-center gap-1.5 px-2 py-1 rounded-md hover:bg-muted transition-colors text-sm"
									>
										<currentPriority.icon
											className={cn("h-4 w-4", currentPriority.color)}
										/>
										<span>{currentPriority.label}</span>
									</button>
								}
							/>
						</PropertyRow>

						{/* Assignees (multi-select) */}
						<PropertyRow label="Assignees" icon={User}>
							<Popover>
								<PopoverTrigger asChild>
									<button
										type="button"
										className="flex items-center gap-2 px-2 py-1 rounded-md hover:bg-muted transition-colors text-sm"
										aria-label="Edit assignees"
									>
										{selectedAssignees.length > 0 ? (
											<div className="flex items-center gap-1">
												{selectedAssignees.slice(0, 2).map((a) => (
													<div
														key={a.id}
														className="size-5 rounded-full bg-muted flex items-center justify-center text-xs font-bold"
														title={a.name}
													>
														{a.name.charAt(0)}
													</div>
												))}
												{selectedAssignees.length > 2 && (
													<span className="text-xs text-muted-foreground">
														+{selectedAssignees.length - 2}
													</span>
												)}
											</div>
										) : (
											<span className="text-muted-foreground">Unassigned</span>
										)}
									</button>
								</PopoverTrigger>
								<PopoverContent className="p-0 w-[260px]" align="start">
									<Command>
										<CommandInput placeholder="Assign to..." />
										<CommandList>
											<CommandEmpty>No members found.</CommandEmpty>
											<CommandGroup>
												<CommandItem
													value="Unassigned"
													onSelect={() => updateForm({ assigneeIds: [] })}
													className="cursor-pointer"
												>
													<div className="flex items-center gap-2 w-full">
														<X className="h-4 w-4 text-muted-foreground" />
														<span className="flex-1">Unassigned</span>
														{selectedAssignees.length === 0 && (
															<Check className="h-4 w-4 text-primary" />
														)}
													</div>
												</CommandItem>
											</CommandGroup>
											<CommandGroup>
												{assigneeOptions.map((option) => {
													const isSelected = formState.assigneeIds.includes(
														option.id,
													);
													return (
														<CommandItem
															key={option.id}
															value={option.name}
															onSelect={() => {
																const next = isSelected
																	? formState.assigneeIds.filter(
																			(id) => id !== option.id,
																		)
																	: [...formState.assigneeIds, option.id];
																updateForm({ assigneeIds: next });
															}}
															className="cursor-pointer"
														>
															<div className="flex items-center gap-2 w-full">
																<div className="size-5 rounded-full bg-muted flex items-center justify-center text-xs font-bold">
																	{option.name.charAt(0)}
																</div>
																<span className="flex-1">{option.name}</span>
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
						</PropertyRow>

						{/* Type */}
						<PropertyRow label="Type" icon={CircleDot}>
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
										className="flex items-center gap-1.5 px-2 py-1 rounded-md hover:bg-muted transition-colors text-sm"
									>
										<span>{currentType.label}</span>
									</button>
								}
							/>
						</PropertyRow>

						<Separator className="my-2" />

						{/* Project */}
						<PropertyRow label="Project" icon={FolderOpen}>
							<GenericPicker
								items={projectOptions}
								onSelect={(item) => {
									updateForm({
										projectId: item.id,
										sprintId: undefined,
										milestoneId: undefined,
									});
								}}
								selectedId={formState.projectId}
								placeholder="Set project..."
								renderItem={(item) => (
									<div className="flex items-center gap-2 w-full">
										<span className="flex-1">{item.label}</span>
									</div>
								)}
								trigger={
									<button
										type="button"
										className="flex items-center gap-1.5 px-2 py-1 rounded-md hover:bg-muted transition-colors text-sm"
									>
										<span>
											{selectedProject?.label ?? (
												<span className="text-muted-foreground">
													No project
												</span>
											)}
										</span>
									</button>
								}
							/>
						</PropertyRow>

						{/* Milestone (only when project selected) */}
						{formState.projectId && (
							<PropertyRow label="Sprint" icon={Flag}>
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
											className="flex items-center gap-1.5 px-2 py-1 rounded-md hover:bg-muted transition-colors text-sm"
										>
											<span>
												{selectedSprint?.label ?? (
													<span className="text-muted-foreground">
														No sprint
													</span>
												)}
											</span>
										</button>
									}
								/>
							</PropertyRow>
						)}

						{/* List (only when project selected and lists exist) */}
						{formState.projectId && listOptions.length > 0 && (
							<PropertyRow label="List" icon={Flag}>
								<GenericPicker
									items={listOptions}
									onSelect={(item) =>
										updateForm({
											listId: item.id,
											sprintId: undefined,
										})
									}
									selectedId={formState.listId}
									placeholder="Set list..."
									renderItem={(item) => (
										<div className="flex items-center gap-2 w-full">
											<span className="flex-1">{item.label}</span>
										</div>
									)}
									trigger={
										<button
											type="button"
											className="flex items-center gap-1.5 px-2 py-1 rounded-md hover:bg-muted transition-colors text-sm"
										>
											<span>
												{selectedList?.label ?? (
													<span className="text-muted-foreground">No list</span>
												)}
											</span>
										</button>
									}
								/>
							</PropertyRow>
						)}

						{/* Labels */}
						{allLabels && allLabels.length > 0 && (
							<PropertyRow label="Labels" icon={Tag}>
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
											className="flex items-center gap-1.5 px-2 py-1 rounded-md hover:bg-muted transition-colors text-sm"
										>
											<span>
												{formState.labelIds.length > 0 ? (
													`${formState.labelIds.length} label${formState.labelIds.length > 1 ? "s" : ""}`
												) : (
													<span className="text-muted-foreground">
														No labels
													</span>
												)}
											</span>
										</button>
									}
								/>
							</PropertyRow>
						)}

						<Separator className="my-2" />

						{/* Estimate */}
						<PropertyRow label="Estimate" icon={Clock}>
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
										className="flex items-center gap-1.5 px-2 py-1 rounded-md hover:bg-muted transition-colors text-sm"
									>
										<span>{currentEstimate.label}</span>
									</button>
								}
							/>
						</PropertyRow>

						{/* Due date */}
						<PropertyRow label="Due date" icon={Calendar}>
							<DatePicker
								date={formState.dueDate}
								onSelect={(d) => updateForm({ dueDate: d })}
								trigger={
									<button
										type="button"
										className="flex items-center gap-1.5 px-2 py-1 rounded-md hover:bg-muted transition-colors text-sm"
									>
										<span>
											{formState.dueDate ? (
												formState.dueDate.toLocaleDateString()
											) : (
												<span className="text-muted-foreground">
													No due date
												</span>
											)}
										</span>
									</button>
								}
							/>
						</PropertyRow>
					</div>
				</div>

				{/* Footer */}
				<div className="flex items-center justify-between gap-3 p-4 border-t border-border">
					<div className="flex items-center gap-2">
						<Switch
							checked={formState.createMore}
							onCheckedChange={(v) => updateForm({ createMore: Boolean(v) })}
						/>
						<span className="text-xs text-muted-foreground">Create more</span>
					</div>
					<div className="flex items-center gap-2">
						<Button
							type="button"
							variant="outline"
							onClick={onClose}
							className="h-8"
						>
							Cancel
						</Button>
						<Button
							type="button"
							onClick={handleSubmit}
							disabled={submittingRef.current}
							className="h-8 px-4"
						>
							Create issue
						</Button>
					</div>
				</div>
			</div>
		</div>
	);
}

// ── Property row ───────────────────────────────────────────────────────────

function PropertyRow({
	icon: Icon,
	label,
	children,
}: {
	icon: React.ComponentType<{ className?: string }>;
	label: string;
	children: React.ReactNode;
}) {
	return (
		<div className="flex items-center gap-2 min-h-[28px]">
			<span className="flex items-center gap-1.5 text-xs text-muted-foreground w-20 shrink-0">
				<Icon className="h-3.5 w-3.5" />
				{label}
			</span>
			<div className="flex-1 min-w-0">{children}</div>
		</div>
	);
}
