"use client";

import {
	CaretRight,
	LinkSimple,
	SquareHalf,
} from "@phosphor-icons/react/dist/ssr";
import { useMutation, useQuery } from "convex/react";
import { Plus } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { ProjectGitHubTab } from "@/components/github/ProjectGitHubTab";
import { DisplayOptionsPanel } from "@/components/issues/DisplayOptionsPanel";
import type { IssueCardData } from "@/components/issues/IssueBoardCard";
import { IssueBoardView } from "@/components/issues/IssueBoardView";
import { useIssueCreate } from "@/components/issues/IssueCreateContext";
import type { IssueListData } from "@/components/issues/IssueListRow";
import { IssueListView } from "@/components/issues/IssueListView";
import { IssuePreviewSidebar } from "@/components/issues/IssuePreviewSidebar";
import { IssueTimelineView } from "@/components/issues/IssueTimelineView";
import {
	IssueFilterChips,
	MyIssuesFilterPopover,
	sprintIdFromSingleMilestoneFilter,
	useIssueFilters,
} from "@/components/issues/MyIssuesFilterPopover";
import { CreateListDialog } from "@/components/lists/CreateListDialog";
import {
	type ActivityActionFilter,
	ActivityFeed,
} from "@/components/projects/ActivityFeed";
import { KnowledgeTab } from "@/components/projects/KnowledgeTab";
import { ProjectDashboard } from "@/components/projects/ProjectDashboard";
import { ProjectEditDialog } from "@/components/projects/ProjectEditDialog";
import { ProjectHeader } from "@/components/projects/ProjectHeader";
import { ProjectOverview } from "@/components/projects/ProjectOverview";
import { ProjectPropertiesPanel } from "@/components/projects/ProjectPropertiesPanel";
import { ProjectSettingsTab } from "@/components/projects/ProjectSettingsTab";
import { ResourcesTab } from "@/components/projects/ResourcesTab";
import { useWorkspace } from "@/components/providers/workspace-context";
import {
	useWorkspaceLabels,
	useWorkspaceMembers,
} from "@/components/providers/workspace-data-context";
import { Button } from "@/components/ui/button";
import { FavoriteButton } from "@/components/ui/favorite-button";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useDisplayOptions } from "@/hooks/use-display-options";
import type { DisplayPropertyId } from "@/lib/display-options";
import { cn } from "@/lib/utils";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

const TAB_TRIGGER_CLASS =
	"h-7 rounded-md px-2.5 py-1 text-xs font-medium after:hidden data-[state=active]:bg-muted data-[state=active]:text-foreground data-[state=active]:shadow-none data-[state=active]:border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/50";

type ProjectDetailsPageProps = {
	slug: string;
};

export function ProjectDetailsPage({ slug }: ProjectDetailsPageProps) {
	const { workspaceId, workspaceSlug } = useWorkspace();
	const router = useRouter();
	const searchParams = useSearchParams();
	const [showMeta, setShowMeta] = useState(true);
	const [isEditOpen, setIsEditOpen] = useState(false);

	// Persist active tab in URL so back navigation restores it
	const activeTab = searchParams.get("tab") ?? "overview";
	const setActiveTab = useCallback(
		(tab: string) => {
			const params = new URLSearchParams(searchParams.toString());
			if (tab === "overview") {
				params.delete("tab");
			} else {
				params.set("tab", tab);
			}
			const qs = params.toString();
			router.replace(qs ? `?${qs}` : "?", { scroll: false });
		},
		[router, searchParams],
	);

	const project = useQuery(api.projects.getBySlug, { workspaceId, slug });
	const stats = useQuery(
		api.projects.getStats,
		project?._id ? { projectId: project._id } : "skip",
	);
	const client = useQuery(
		api.clients.getById,
		project?.clientId ? { clientId: project.clientId } : "skip",
	);
	const allClients = useQuery(api.clients.list, { workspaceId });
	const members = useWorkspaceMembers();
	const updateProject = useMutation(api.projects.update);
	const removeClientMutation = useMutation(api.projects.removeClient);
	const recordRecent = useMutation(api.recents.record);
	const projectMembers = useQuery(
		api.projectMembers.list,
		project?._id ? { projectId: project._id } : "skip",
	);
	const githubConnections = useQuery(
		api.github.getProjectConnections,
		project?._id ? { projectId: project._id } : "skip",
	);

	// Record recent access when project loads
	const loadedProjectId = project?._id;
	useEffect(() => {
		if (loadedProjectId && workspaceId) {
			recordRecent({
				workspaceId,
				entityType: "project",
				entityId: loadedProjectId,
			});
		}
	}, [loadedProjectId, workspaceId, recordRecent]);

	// Display options for Issues tab (lifted so header can render view controls)
	const issueViewContext = `project:${project?._id ?? "__loading__"}:issues`;
	const issueDisplayOpts = useDisplayOptions(issueViewContext);

	const handleUpdateProject = useCallback(
		async (updates: Record<string, string | number | string[] | undefined>) => {
			if (!project?._id) return;
			try {
				await updateProject({ projectId: project._id, ...updates });
			} catch {
				toast.error("Failed to update project");
			}
		},
		[project?._id, updateProject],
	);

	const copyLink = useCallback(async () => {
		if (!navigator.clipboard) {
			toast.error("Clipboard not available");
			return;
		}

		try {
			await navigator.clipboard.writeText(window.location.href);
			toast.success("Link copied");
		} catch {
			toast.error("Failed to copy link");
		}
	}, []);

	const openEdit = useCallback(() => {
		setIsEditOpen(true);
	}, []);

	const handleRemoveClient = useCallback(async () => {
		if (!project?._id) return;
		try {
			await removeClientMutation({ projectId: project._id });
		} catch {
			toast.error("Failed to remove client");
		}
	}, [project?._id, removeClientMutation]);

	// Map clients for the ProjectHeader component
	const headerClients = useMemo(
		() =>
			(allClients ?? []).map((c) => ({
				_id: c._id,
				name: c.name,
			})),
		[allClients],
	);

	// Map members for the ProjectHeader component
	const headerMembers = useMemo(
		() =>
			(members ?? []).map((m) => ({
				userId: m.userId,
				user: m.user,
			})),
		[members],
	);

	// Loading state
	if (project === undefined) {
		return <ProjectDetailsSkeleton />;
	}

	// 404 state
	if (project === null) {
		return (
			<div className="flex flex-1 flex-col items-center justify-center bg-background mx-2 my-2 border border-border rounded-lg min-w-0 gap-4 p-8">
				<h1 className="text-2xl font-semibold text-foreground">
					Project not found
				</h1>
				<p className="text-sm text-muted-foreground">
					The project you are looking for does not exist or has been deleted.
				</p>
				<Button asChild variant="outline">
					<Link href={`/${workspaceSlug}/projects`} prefetch={false}>
						Back to projects
					</Link>
				</Button>
			</div>
		);
	}

	return (
		<div className="flex flex-1 flex-col min-w-0 m-2 border border-border rounded-lg h-[calc(100svh-1rem)] overflow-hidden">
			<Tabs
				value={activeTab}
				onValueChange={setActiveTab}
				className="flex flex-1 flex-col min-h-0"
			>
				{/* FIXED HEADER ZONE — Linear-style compact layout */}
				<div className="shrink-0 bg-background border-b border-border">
					{/* Single header row: breadcrumb + tabs + actions */}
					<div className="flex items-center gap-2 px-4 py-1.5">
						<SidebarTrigger className="h-7 w-7 rounded-lg hover:bg-accent text-muted-foreground shrink-0" />

						{/* Breadcrumb: Projects > emoji ProjectName */}
						<nav className="flex items-center gap-1.5 min-w-0 text-sm">
							<Link
								href={`/${workspaceSlug}/projects` as never}
								className="text-muted-foreground hover:text-foreground transition-colors shrink-0"
								prefetch={false}
							>
								Projects
							</Link>
							<CaretRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
							<ProjectHeader
								project={project}
								onEditProject={openEdit}
								onUpdate={handleUpdateProject}
							/>
						</nav>

						<FavoriteButton
							entityType="project"
							entityId={project._id}
							size="sm"
						/>

						{/* Spacer */}
						<div className="flex-1" />

						{/* Inline tab navigation — Linear-style compact pills */}
						<TabsList variant="line" className="h-auto gap-0.5 border-none p-0">
							<TabsTrigger value="overview" className={TAB_TRIGGER_CLASS}>
								Overview
							</TabsTrigger>
							<TabsTrigger value="dashboard" className={TAB_TRIGGER_CLASS}>
								Dashboard
							</TabsTrigger>
							<TabsTrigger value="issues" className={TAB_TRIGGER_CLASS}>
								Issues
							</TabsTrigger>
							<TabsTrigger value="resources" className={TAB_TRIGGER_CLASS}>
								Resources
							</TabsTrigger>
							<TabsTrigger value="lists" className={TAB_TRIGGER_CLASS}>
								Lists
							</TabsTrigger>
							<TabsTrigger value="activity" className={TAB_TRIGGER_CLASS}>
								Activity
							</TabsTrigger>
							<TabsTrigger value="settings" className={TAB_TRIGGER_CLASS}>
								Settings
							</TabsTrigger>
							{githubConnections && githubConnections.length > 0 && (
								<TabsTrigger value="github" className={TAB_TRIGGER_CLASS}>
									GitHub
								</TabsTrigger>
							)}
						</TabsList>

						{/* Right-side actions */}
						<div className="flex items-center gap-1.5 shrink-0">
							<Button
								variant="ghost"
								size="icon-sm"
								aria-label="Copy link"
								onClick={copyLink}
							>
								<LinkSimple className="h-4 w-4" />
							</Button>
							<Button
								variant="ghost"
								size="icon-sm"
								aria-pressed={!showMeta}
								aria-label={
									showMeta ? "Collapse meta panel" : "Expand meta panel"
								}
								className={showMeta ? "bg-muted" : ""}
								onClick={() => setShowMeta((v) => !v)}
							>
								<SquareHalf className="h-4 w-4" weight="duotone" />
							</Button>
						</div>
					</div>
				</div>

				{/* BODY: two independent scroll columns */}
				<div className="flex flex-1 min-h-0 bg-background rounded-b-lg">
					{/* Main content — flex column, fills height */}
					<div
						className={cn(
							"flex-1 min-w-0 flex flex-col",
							activeTab === "issues" &&
								(issueDisplayOpts.options.layout === "board" ||
									issueDisplayOpts.options.layout === "timeline")
								? "min-h-0"
								: "overflow-auto",
						)}
					>
						<TabsContent value="overview" className="mt-0">
							<div className="px-6 pb-6 max-w-7xl mx-auto">
								<ProjectOverview
									project={{
										...project,
										status: project.status as
											| "backlog"
											| "planned"
											| "active"
											| "completed"
											| "cancelled",
										priority: (project.priority ?? "medium") as
											| "urgent"
											| "high"
											| "medium"
											| "low"
											| "no_priority",
									}}
									icon={project.icon}
									onUpdate={handleUpdateProject}
								/>
							</div>
						</TabsContent>

						<TabsContent
							value="issues"
							className={cn(
								"mt-0",
								(issueDisplayOpts.options.layout === "board" ||
									issueDisplayOpts.options.layout === "timeline") &&
									"data-[state=active]:flex flex-col flex-1 min-h-0",
							)}
						>
							<ProjectIssuesTab
								projectId={project._id}
								displayOpts={issueDisplayOpts}
							/>
						</TabsContent>

						<TabsContent value="dashboard" className="mt-0">
							<div className="px-6 pb-6 max-w-7xl mx-auto">
								<ProjectDashboard projectId={project._id} />
							</div>
						</TabsContent>

						<TabsContent value="activity" className="mt-0">
							<div className="px-6 pb-6 max-w-7xl mx-auto">
								<ProjectActivityTab projectId={project._id} />
							</div>
						</TabsContent>

						<TabsContent value="settings" className="mt-0">
							<div className="px-6 py-4 max-w-3xl mx-auto">
								<ProjectSettingsTab projectId={project._id} project={project} />
							</div>
						</TabsContent>

						<TabsContent value="resources" className="mt-0">
							<div className="px-6 py-4 max-w-7xl mx-auto space-y-6">
								<KnowledgeTab
									projectId={project._id}
									workspaceId={workspaceId}
								/>
								<ResourcesTab
									projectId={project._id}
									workspaceId={workspaceId}
								/>
							</div>
						</TabsContent>

						<TabsContent value="lists" className="mt-0">
							<ProjectListsTab
								projectId={project._id}
								workspaceSlug={workspaceSlug}
							/>
						</TabsContent>

						{githubConnections && githubConnections.length > 0 && (
							<TabsContent value="github" className="mt-0">
								<ProjectGitHubTab
									projectId={project._id}
									connections={githubConnections}
								/>
							</TabsContent>
						)}
					</div>

					{/* Sidebar — full height, scrolls independently */}
					<AnimatePresence initial={false}>
						{showMeta && (
							<motion.aside
								key="meta-panel"
								initial={{ width: 0, opacity: 0 }}
								animate={{ width: 320, opacity: 1 }}
								exit={{ width: 0, opacity: 0 }}
								transition={{
									type: "spring",
									stiffness: 260,
									damping: 26,
								}}
								className="shrink-0 overflow-hidden border-l border-border"
							>
								<div className="w-80 h-full overflow-y-auto">
									<ProjectPropertiesPanel
										project={{
											...project,
											status: project.status as
												| "backlog"
												| "planned"
												| "active"
												| "completed"
												| "cancelled",
											priority: (project.priority ?? "medium") as
												| "urgent"
												| "high"
												| "medium"
												| "low"
												| "no_priority",
											structure: project.structure as
												| "linear"
												| "sprints"
												| "kanban"
												| undefined,
										}}
										members={headerMembers}
										clients={headerClients}
										projectMembers={projectMembers ?? undefined}
										client={
											client
												? {
														...client,
														_id: client._id as string,
														status: client.status as
															| "prospect"
															| "active"
															| "on_hold"
															| "completed"
															| "archived",
													}
												: null
										}
										stats={stats}
										onUpdate={handleUpdateProject}
										onRemoveClient={handleRemoveClient}
									/>
								</div>
							</motion.aside>
						)}
					</AnimatePresence>
				</div>
			</Tabs>

			<ProjectEditDialog
				project={project}
				open={isEditOpen}
				onOpenChange={setIsEditOpen}
			/>
		</div>
	);
}

// ── Issues tab ─────────────────────────────────────────────────────────────

function ProjectIssuesTab({
	projectId,
	displayOpts,
}: {
	projectId: Id<"projects">;
	displayOpts: ReturnType<typeof useDisplayOptions>;
}) {
	const { workspaceId } = useWorkspace();
	const { openQuickCreate } = useIssueCreate();
	const options = displayOpts.options;
	const [selectedIssueId, setSelectedIssueId] = useState<Id<"issues"> | null>(
		null,
	);

	// ── Filter state ─────────────────────────────────────────────────────
	const {
		filters,
		setFilter,
		clearAll: clearAllFilters,
		activeFilterCount,
		applyFilters,
	} = useIssueFilters();

	const boardSprintIdFromFilter = useMemo(
		() => sprintIdFromSingleMilestoneFilter(filters.milestoneIds),
		[filters.milestoneIds],
	);

	const handleCreateIssue = useCallback(() => {
		if (boardSprintIdFromFilter) {
			openQuickCreate({
				projectId: projectId as string,
				sprintId: boardSprintIdFromFilter as string,
				status: "todo",
			});
		} else {
			openQuickCreate({ projectId: projectId as string });
		}
	}, [openQuickCreate, projectId, boardSprintIdFromFilter]);
	const [showFilters, setShowFilters] = useState(false);

	// ── Lookup data for filter popover ───────────────────────────────────
	const members = useWorkspaceMembers();
	const labels = useWorkspaceLabels();
	const sprints = useQuery(
		api.sprints.listByProject,
		projectId ? { projectId } : "skip",
	);

	// Map DisplayPropertyId[] to board's DisplayProperties record
	const boardDisplayProperties = useMemo(() => {
		const props: Record<string, boolean> = {};
		const allProps: DisplayPropertyId[] = [
			"identifier",
			"priority",
			"status",
			"labels",
			"assignee",
			"project",
			"milestone",
			"estimate",
			"dueDate",
			"created",
			"updated",
		];
		for (const p of allProps) {
			props[p] = options.displayProperties.includes(p);
		}
		return props;
	}, [options.displayProperties]);

	// Fetch issues (shared between board + list + timeline)
	const projectIssues = useQuery(api.issues.listByProject, {
		projectId,
		showSubIssues: options.showSubIssues,
	});

	// Filtered board issues (IssueCardData[])
	const filteredBoardIssues = useMemo<IssueCardData[] | undefined>(() => {
		if (!projectIssues) return undefined;
		const filtered = applyFilters(projectIssues);
		return filtered.map((issue) => ({
			_id: issue._id,
			identifier: issue.identifier,
			title: issue.title,
			status: issue.status,
			priority: issue.priority,
			assigneeId: issue.assigneeId ?? undefined,
			assigneeIds: issue.assigneeIds ?? undefined,
			labelIds: issue.labelIds ?? undefined,
			dueDate: issue.dueDate ?? undefined,
			estimate: issue.estimate ?? undefined,
			sortOrder: issue.sortOrder,
			projectId: issue.projectId ?? undefined,
			sprintId: issue.sprintId ?? undefined,
			milestoneId: issue.milestoneId ?? undefined,
		}));
	}, [projectIssues, applyFilters]);

	// Filtered list issues (IssueListData[])
	const filteredListIssues = useMemo<IssueListData[]>(() => {
		if (!projectIssues) return [];
		const filtered = applyFilters(projectIssues);
		return filtered.map((issue) => ({
			_id: issue._id,
			_creationTime: issue._creationTime,
			identifier: issue.identifier,
			title: issue.title,
			status: issue.status,
			priority: issue.priority,
			type: issue.type ?? undefined,
			assigneeId: issue.assigneeId ?? undefined,
			assigneeIds: issue.assigneeIds ?? undefined,
			labelIds: issue.labelIds ?? undefined,
			dueDate: issue.dueDate ?? undefined,
			estimate: issue.estimate ?? undefined,
			sortOrder: issue.sortOrder,
			projectId: issue.projectId ?? undefined,
			sprintId: issue.sprintId ?? undefined,
			milestoneId: issue.milestoneId ?? undefined,
			updatedAt: issue.updatedAt ?? undefined,
		}));
	}, [projectIssues, applyFilters]);

	// Filtered timeline issues (for Timeline layout so filters apply)
	const filteredTimelineIssues = useMemo(() => {
		if (!projectIssues) return undefined;
		const filtered = applyFilters(projectIssues);
		return filtered.map((issue) => ({
			_id: issue._id,
			identifier: issue.identifier,
			title: issue.title,
			status: issue.status,
			priority: issue.priority,
			assigneeId: issue.assigneeId ?? undefined,
			startDate: issue.startDate ?? undefined,
			dueDate: issue.dueDate ?? undefined,
			sprintId: issue.sprintId ?? undefined,
			milestoneId: issue.milestoneId ?? undefined,
			sortOrder: issue.sortOrder,
		}));
	}, [projectIssues, applyFilters]);

	// Lookup maps for filter chips
	const labelMap = useMemo(() => {
		const map = new Map<string, { name: string; color: string }>();
		if (labels) {
			for (const l of labels) map.set(l._id, { name: l.name, color: l.color });
		}
		return map;
	}, [labels]);

	const memberMap = useMemo(() => {
		const map = new Map<string, string>();
		if (members) {
			for (const m of members) map.set(m.userId, m.user?.name ?? "Unknown");
		}
		return map;
	}, [members]);

	const milestoneMap = useMemo(() => {
		const map = new Map<string, string>();
		if (sprints) {
			for (const m of sprints) map.set(m._id, m.name);
		}
		return map;
	}, [sprints]);

	const projectMap = useMemo(() => new Map<string, string>(), []);

	return (
		<div className="flex flex-1 min-h-0 min-w-0 overflow-y-hidden">
			<div className="flex flex-col flex-1 min-h-0 min-w-0">
				{/* Toolbar: Filter + Display | Create Issue */}
				<div className="flex items-center gap-1.5 px-4 py-1.5 border-b border-border/40 bg-muted/20 shrink-0">
					<MyIssuesFilterPopover
						open={showFilters}
						onOpenChange={setShowFilters}
						filters={filters}
						setFilter={setFilter}
						clearAll={clearAllFilters}
						projects={[]}
						labels={(labels ?? []).map((l) => ({
							_id: l._id as string,
							name: l.name,
							color: l.color,
						}))}
						members={(members ?? []).map((m) => ({
							id: m.userId as string,
							name: m.user?.name ?? m.user?.email ?? "Unknown",
						}))}
						milestones={(sprints ?? []).map((m) => ({
							id: m._id as string,
							name: m.name,
						}))}
					/>
					<DisplayOptionsPanel
						layout={options.layout}
						groupBy={options.groupBy}
						subGroupBy={options.subGroupBy}
						orderBy={options.orderBy}
						orderDirection={options.orderDirection}
						displayProperties={options.displayProperties}
						showSubIssues={options.showSubIssues}
						showEmptyGroups={options.showEmptyGroups}
						swimlaneBy={options.swimlaneBy}
						onLayoutChange={displayOpts.setLayout}
						onGroupByChange={displayOpts.setGroupBy}
						onSubGroupByChange={displayOpts.setSubGroupBy}
						onOrderByChange={displayOpts.setOrderBy}
						onOrderDirectionChange={displayOpts.setOrderDirection}
						onDisplayPropertyToggle={displayOpts.toggleDisplayProperty}
						onShowSubIssuesChange={displayOpts.setShowSubIssues}
						onShowEmptyGroupsChange={displayOpts.setShowEmptyGroups}
						onSwimlaneSetting={displayOpts.setSwimlaneSetting}
						onReset={displayOpts.reset}
					/>

					<div className="flex-1" />

					<Button
						variant="outline"
						size="sm"
						className="h-7 gap-1.5 text-xs rounded-md border-border/60 px-3 bg-transparent"
						onClick={handleCreateIssue}
					>
						<Plus className="h-3.5 w-3.5" />
						Create issue
					</Button>
				</div>

				{/* Filter chips (shown when active filters exist) */}
				{activeFilterCount > 0 && (
					<IssueFilterChips
						filters={filters}
						setFilter={setFilter}
						clearAll={clearAllFilters}
						projectMap={projectMap}
						labelMap={labelMap}
						memberMap={memberMap}
						milestoneMap={milestoneMap}
					/>
				)}

				{/* Board / List / Timeline content */}
				{options.layout === "board" && (
					<div className="flex flex-col flex-1 min-h-0 min-w-0 overflow-hidden">
						<IssueBoardView
							projectId={projectId}
							boardSprintId={boardSprintIdFromFilter}
							externalIssues={filteredBoardIssues}
							displayProperties={boardDisplayProperties}
							swimlaneBy={options.swimlaneBy}
							onIssueClick={(id) => setSelectedIssueId(id as Id<"issues">)}
						/>
					</div>
				)}
				{options.layout === "list" && (
					<div className="px-6 pb-6 w-full overflow-auto flex-1 min-h-0 min-w-0">
						<IssueListView
							issues={filteredListIssues}
							projectId={projectId}
							groupBy={options.groupBy}
							subGroupBy={options.subGroupBy}
							orderBy={options.orderBy}
							displayProperties={options.displayProperties}
							hideFilter
							onIssueClick={(id) => setSelectedIssueId(id as Id<"issues">)}
						/>
					</div>
				)}
				{options.layout === "timeline" && (
					<div className="flex-1 min-h-0 flex flex-col">
						<IssueTimelineView
							projectId={projectId}
							externalIssues={filteredTimelineIssues}
							onIssueClick={(id) => setSelectedIssueId(id as Id<"issues">)}
						/>
					</div>
				)}
			</div>

			{/* Issue peek sidebar */}
			{selectedIssueId && (
				<IssuePreviewSidebar
					issueId={selectedIssueId}
					onClose={() => setSelectedIssueId(null)}
				/>
			)}
		</div>
	);
}

// ── Activity tab with filter chips ─────────────────────────────────────────

const ACTIVITY_FILTERS: {
	id: ActivityActionFilter;
	label: string;
}[] = [
	{ id: "all", label: "All" },
	{ id: "status_changed", label: "Status changes" },
	{ id: "assigned", label: "Assignments" },
	{ id: "commented", label: "Comments" },
	{ id: "created", label: "Creations" },
];

function ProjectActivityTab({ projectId }: { projectId: Id<"projects"> }) {
	const [activeFilter, setActiveFilter] = useState<ActivityActionFilter>("all");

	return (
		<div className="py-4 space-y-3">
			<div className="flex items-center gap-1.5">
				{ACTIVITY_FILTERS.map((filter) => (
					<button
						key={filter.id}
						type="button"
						onClick={() => setActiveFilter(filter.id)}
						className={cn(
							"px-3 py-1 rounded-full text-xs font-medium transition-colors",
							activeFilter === filter.id
								? "bg-primary text-primary-foreground"
								: "bg-muted text-muted-foreground hover:text-foreground hover:bg-muted/80",
						)}
					>
						{filter.label}
					</button>
				))}
			</div>

			<ActivityFeed projectId={projectId} actionFilter={activeFilter} />
		</div>
	);
}

// ── Lists tab ───────────────────────────────────────────────────────────────

function ProjectListsTab({
	projectId,
	workspaceSlug,
}: {
	projectId: Id<"projects">;
	workspaceSlug: string;
}) {
	const [createOpen, setCreateOpen] = useState(false);
	const lists = useQuery(api.lists.listByProject, { projectId });

	// Build link using slug from the URL — projectId is the db id,
	// but the project page uses slug. We look for the slug in the URL.
	const getProjectSlug = () => {
		if (typeof window !== "undefined") {
			const parts = window.location.pathname.split("/");
			// /<workspaceSlug>/projects/<slug>/lists
			const projectsIdx = parts.indexOf("projects");
			if (projectsIdx >= 0 && projectsIdx + 1 < parts.length) {
				return parts[projectsIdx + 1];
			}
		}
		return projectId as string;
	};

	return (
		<div className="px-6 py-4 max-w-7xl mx-auto space-y-4">
			<div className="flex items-center justify-between">
				<h3 className="text-sm font-semibold text-foreground">Lists</h3>
				<Button
					size="sm"
					variant="outline"
					className="h-7 gap-1 text-xs"
					onClick={() => setCreateOpen(true)}
				>
					<Plus className="h-3.5 w-3.5" />
					New list
				</Button>
			</div>

			{lists === undefined ? (
				<div className="space-y-2">
					<Skeleton className="h-10 w-full" />
					<Skeleton className="h-10 w-full" />
				</div>
			) : lists.length === 0 ? (
				<div className="flex flex-col items-center justify-center py-12 text-center">
					<p className="text-sm text-muted-foreground">
						No lists yet. Create one to group issues.
					</p>
					<Button
						size="sm"
						variant="outline"
						className="mt-4 gap-1"
						onClick={() => setCreateOpen(true)}
					>
						<Plus className="h-3.5 w-3.5" />
						New list
					</Button>
				</div>
			) : (
				<div className="space-y-1">
					{lists.map((list) => (
						<Link
							key={list._id}
							href={
								`/${workspaceSlug}/projects/${getProjectSlug()}/lists/${list._id}` as never
							}
							prefetch={false}
							className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-muted transition-colors"
						>
							<span className="text-base leading-none">
								{list.icon ?? "📋"}
							</span>
							<div className="flex-1 min-w-0">
								<span className="text-sm font-medium truncate">
									{list.name}
								</span>
								{list.description && (
									<p className="text-xs text-muted-foreground truncate mt-0.5">
										{list.description}
									</p>
								)}
							</div>
						</Link>
					))}
				</div>
			)}

			<CreateListDialog
				projectId={projectId}
				open={createOpen}
				onClose={() => setCreateOpen(false)}
			/>
		</div>
	);
}

function ProjectDetailsSkeleton() {
	return (
		<div className="flex flex-1 flex-col bg-background mx-2 my-2 border border-border rounded-lg min-w-0">
			<div className="p-6">
				<div className="flex items-center gap-2">
					<Skeleton className="h-4 w-24" />
					<Skeleton className="h-4 w-4" />
					<Skeleton className="h-4 w-48" />
				</div>

				<div className="mt-4">
					<Skeleton className="h-4 w-32" />
					<Skeleton className="mt-3 h-8 w-[360px]" />
					<Skeleton className="mt-3 h-5 w-[520px]" />
					<Skeleton className="mt-5 h-px w-full" />
					<Skeleton className="mt-5 h-16 w-full" />
				</div>

				<div className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-[1fr_320px]">
					<div className="space-y-8">
						<Skeleton className="h-32 w-full" />
						<Skeleton className="h-28 w-full" />
						<Skeleton className="h-28 w-full" />
						<Skeleton className="h-64 w-full" />
					</div>

					<div className="space-y-4">
						<Skeleton className="h-40 w-full" />
						<Skeleton className="h-52 w-full" />
						<Skeleton className="h-64 w-full" />
					</div>
				</div>
			</div>
		</div>
	);
}
