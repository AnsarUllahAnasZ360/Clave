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
import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";
import { DisplayOptionsPanel } from "@/components/issues/DisplayOptionsPanel";
import { IssueBoardView } from "@/components/issues/IssueBoardView";
import { useIssueCreate } from "@/components/issues/IssueCreateContext";
import type { IssueListData } from "@/components/issues/IssueListRow";
import { IssueListView } from "@/components/issues/IssueListView";
import { IssueTimelineView } from "@/components/issues/IssueTimelineView";
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
import { ResourcesTab } from "@/components/projects/ResourcesTab";
import { useWorkspace } from "@/components/providers/workspace-context";
import { Button } from "@/components/ui/button";
import { FavoriteButton } from "@/components/ui/favorite-button";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useDisplayOptions } from "@/hooks/use-display-options";
import type { DisplayOptions, DisplayPropertyId } from "@/lib/display-options";
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
	const [showMeta, setShowMeta] = useState(true);
	const [isEditOpen, setIsEditOpen] = useState(false);
	const [activeTab, setActiveTab] = useState("overview");

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
	const members = useQuery(api.workspaceMembers.list, { workspaceId });
	const updateProject = useMutation(api.projects.update);
	const removeClientMutation = useMutation(api.projects.removeClient);
	const projectMembers = useQuery(
		api.projectMembers.list,
		project?._id ? { projectId: project._id } : "skip",
	);

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
					<Link href={`/${workspaceSlug}/projects`}>Back to projects</Link>
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
							<TabsTrigger value="knowledge" className={TAB_TRIGGER_CLASS}>
								Knowledge
							</TabsTrigger>
							<TabsTrigger value="resources" className={TAB_TRIGGER_CLASS}>
								Resources
							</TabsTrigger>
							<TabsTrigger value="activity" className={TAB_TRIGGER_CLASS}>
								Activity
							</TabsTrigger>
						</TabsList>

						{/* Right-side actions */}
						<div className="flex items-center gap-1.5 shrink-0">
							{activeTab === "issues" && (
								<IssuesHeaderControls
									projectId={project._id}
									displayOpts={issueDisplayOpts}
								/>
							)}
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
					{/* Main content — flex column, fills height; overflow-auto enables horizontal scroll for board */}
					<div className="flex-1 min-w-0 overflow-auto flex flex-col">
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
								issueDisplayOpts.options.layout === "board" &&
									"data-[state=active]:flex flex-col flex-1 min-h-0",
							)}
						>
							<ProjectIssuesTab
								projectId={project._id}
								options={issueDisplayOpts.options}
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

						<TabsContent value="knowledge" className="mt-0">
							<div className="px-6 py-4 max-w-7xl mx-auto">
								<KnowledgeTab
									projectId={project._id}
									workspaceId={workspaceId}
								/>
							</div>
						</TabsContent>

						<TabsContent value="resources" className="mt-0">
							<div className="px-6 py-4 max-w-7xl mx-auto">
								<ResourcesTab
									projectId={project._id}
									workspaceId={workspaceId}
								/>
							</div>
						</TabsContent>
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
	options,
}: {
	projectId: Id<"projects">;
	options: DisplayOptions;
}) {
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

	// Fetch issues for list view (board/timeline manage their own data)
	const projectIssues = useQuery(api.issues.listByProject, { projectId });
	const listIssues = useMemo<IssueListData[]>(() => {
		if (!projectIssues) return [];
		return projectIssues.map((issue) => ({
			_id: issue._id,
			_creationTime: issue._creationTime,
			identifier: issue.identifier,
			title: issue.title,
			status: issue.status,
			priority: issue.priority,
			type: issue.type ?? undefined,
			assigneeId: issue.assigneeId ?? undefined,
			labelIds: issue.labelIds ?? undefined,
			dueDate: issue.dueDate ?? undefined,
			estimate: issue.estimate ?? undefined,
			sortOrder: issue.sortOrder,
			projectId: issue.projectId ?? undefined,
			milestoneId: issue.milestoneId ?? undefined,
			updatedAt: issue.updatedAt ?? undefined,
		}));
	}, [projectIssues]);

	return (
		<div className="flex flex-col flex-1 min-h-0 pt-3">
			{options.layout === "board" && (
				<IssueBoardView
					projectId={projectId}
					displayProperties={boardDisplayProperties}
					swimlaneBy={options.swimlaneBy}
				/>
			)}
			{options.layout === "list" && (
				<div className="px-6 pb-6 max-w-7xl mx-auto w-full">
					<IssueListView
						issues={listIssues}
						projectId={projectId}
						groupBy={options.groupBy}
						subGroupBy={options.subGroupBy}
						orderBy={options.orderBy}
						displayProperties={options.displayProperties}
					/>
				</div>
			)}
			{options.layout === "timeline" && (
				<div className="px-6 pb-6 max-w-7xl mx-auto w-full">
					<IssueTimelineView projectId={projectId} />
				</div>
			)}
		</div>
	);
}

// ── Issues header controls (rendered in fixed header when Issues tab is active) ──

function IssuesHeaderControls({
	projectId,
	displayOpts,
}: {
	projectId: Id<"projects">;
	displayOpts: ReturnType<typeof useDisplayOptions>;
}) {
	const { openQuickCreate } = useIssueCreate();

	const handleCreateIssue = useCallback(() => {
		openQuickCreate({ projectId: projectId as string });
	}, [openQuickCreate, projectId]);

	const {
		options,
		setLayout,
		setGroupBy,
		setSubGroupBy,
		setOrderBy,
		setOrderDirection,
		toggleDisplayProperty,
		setShowSubIssues,
		setShowEmptyGroups,
		setSwimlaneSetting,
		reset,
	} = displayOpts;

	return (
		<>
			<Button
				variant="outline"
				size="sm"
				className="h-8 gap-2 rounded-lg border-border/60 px-3 bg-transparent"
				onClick={handleCreateIssue}
			>
				<Plus className="h-4 w-4" />
				Create issue
			</Button>
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
				onLayoutChange={setLayout}
				onGroupByChange={setGroupBy}
				onSubGroupByChange={setSubGroupBy}
				onOrderByChange={setOrderBy}
				onOrderDirectionChange={setOrderDirection}
				onDisplayPropertyToggle={toggleDisplayProperty}
				onShowSubIssuesChange={setShowSubIssues}
				onShowEmptyGroupsChange={setShowEmptyGroups}
				onSwimlaneSetting={setSwimlaneSetting}
				onReset={reset}
			/>
		</>
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
