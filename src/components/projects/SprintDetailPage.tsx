"use client";

import { CaretLeft } from "@phosphor-icons/react/dist/ssr";
import { useQuery } from "convex/react";
import { Plus } from "lucide-react";
import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import { DisplayOptionsPanel } from "@/components/issues/DisplayOptionsPanel";
import { InlineFilterBar } from "@/components/issues/InlineFilterBar";
import type { IssueCardData } from "@/components/issues/IssueBoardCard";
import { IssueBoardView } from "@/components/issues/IssueBoardView";
import { useIssueCreate } from "@/components/issues/IssueCreateContext";
import type { IssueListData } from "@/components/issues/IssueListRow";
import { IssueListView } from "@/components/issues/IssueListView";
import { IssuePreviewSidebar } from "@/components/issues/IssuePreviewSidebar";
import { IssueTimelineView } from "@/components/issues/IssueTimelineView";
import { useIssueFilters } from "@/components/issues/MyIssuesFilterPopover";
import { useWorkspace } from "@/components/providers/workspace-context";
import {
	useWorkspaceLabels,
	useWorkspaceMembers,
} from "@/components/providers/workspace-data-context";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Skeleton } from "@/components/ui/skeleton";
import { useDisplayOptions } from "@/hooks/use-display-options";
import type { DisplayPropertyId } from "@/lib/display-options";
import { cn } from "@/lib/utils";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

type SprintDetailPageProps = {
	projectSlug: string;
	sprintId: string;
};

const statusConfig: Record<string, { label: string; className: string }> = {
	active: {
		label: "Active",
		className: "bg-green-500/10 text-green-500 border-green-500/20",
	},
	planned: {
		label: "Planned",
		className: "bg-blue-500/10 text-blue-500 border-blue-500/20",
	},
	completed: {
		label: "Completed",
		className: "bg-muted text-muted-foreground border-border",
	},
	cancelled: {
		label: "Cancelled",
		className: "bg-muted text-muted-foreground border-border",
	},
};

export function SprintDetailPage({
	projectSlug,
	sprintId,
}: SprintDetailPageProps) {
	const { workspaceId, workspaceSlug } = useWorkspace();
	const { openQuickCreate } = useIssueCreate();

	const sprint = useQuery(api.sprints.getById, {
		sprintId: sprintId as Id<"sprints">,
	});
	const project = useQuery(api.projects.getBySlug, {
		workspaceId,
		slug: projectSlug,
	});

	const sprintIssues = useQuery(
		api.issues.listBySprint,
		sprint ? { sprintId: sprint._id } : "skip",
	);

	const displayOpts = useDisplayOptions(`sprint-${sprintId}`, {
		layout: "list",
	});
	const options = displayOpts.options;

	const handleCreateIssue = useCallback(() => {
		if (project && sprint) {
			openQuickCreate({
				projectId: project._id as string,
				sprintId: sprint._id as string,
				status: "todo",
			});
		}
	}, [openQuickCreate, project, sprint]);

	// Filters
	const {
		filters,
		setFilter,
		clearAll: clearAllFilters,
		activeFilterCount,
		applyFilters,
	} = useIssueFilters();
	const [_showFilters, _setShowFilters] = useState(false);
	const [selectedIssueId, setSelectedIssueId] = useState<Id<"issues"> | null>(
		null,
	);

	const members = useWorkspaceMembers();
	const labels = useWorkspaceLabels();

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

	const filteredBoardIssues = useMemo<IssueCardData[] | undefined>(() => {
		if (!sprintIssues) return undefined;
		const filtered = applyFilters(sprintIssues);
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
	}, [sprintIssues, applyFilters]);

	const filteredListIssues = useMemo<IssueListData[]>(() => {
		if (!sprintIssues) return [];
		const filtered = applyFilters(sprintIssues);
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
	}, [sprintIssues, applyFilters]);

	const filteredTimelineIssues = useMemo(() => {
		if (!sprintIssues) return undefined;
		const filtered = applyFilters(sprintIssues);
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
	}, [sprintIssues, applyFilters]);

	const _labelMap = useMemo(() => {
		const map = new Map<string, { name: string; color: string }>();
		if (labels) {
			for (const l of labels) map.set(l._id, { name: l.name, color: l.color });
		}
		return map;
	}, [labels]);

	const _memberMap = useMemo(() => {
		const map = new Map<string, string>();
		if (members) {
			for (const m of members) map.set(m.userId, m.user?.name ?? "Unknown");
		}
		return map;
	}, [members]);

	const _milestoneMap = useMemo(() => new Map<string, string>(), []);
	const _projectMap = useMemo(() => new Map<string, string>(), []);

	if (sprint === undefined || project === undefined) {
		return (
			<div className="flex flex-1 flex-col bg-background mx-2 my-2 border border-border rounded-lg min-w-0">
				<div className="flex items-center gap-3 border-b border-border px-6 py-4">
					<Skeleton className="h-6 w-6" />
					<Skeleton className="h-6 w-48" />
				</div>
				<div className="flex-1 p-6 space-y-4">
					<Skeleton className="h-64 w-full" />
				</div>
			</div>
		);
	}

	if (sprint === null || project === null) {
		return (
			<div className="flex flex-1 flex-col items-center justify-center bg-background mx-2 my-2 border border-border rounded-lg min-w-0">
				<h1 className="text-lg font-semibold">Sprint not found</h1>
				<p className="text-sm text-muted-foreground mt-1">
					This sprint may have been deleted or you don&apos;t have access.
				</p>
				<Link
					href={`/${workspaceSlug}/projects/${projectSlug}`}
					className="text-sm text-primary underline mt-3"
				>
					Back to project
				</Link>
			</div>
		);
	}

	const status = statusConfig[sprint.status] ?? statusConfig.planned;

	return (
		<div className="flex flex-1 flex-col bg-background mx-2 my-2 border border-border rounded-lg min-w-0 overflow-hidden">
			{/* Header */}
			<div className="flex items-center gap-2 border-b border-border px-4 py-3 shrink-0">
				<SidebarTrigger className="h-7 w-7" />

				<Link
					href={`/${workspaceSlug}/projects/${projectSlug}`}
					className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
				>
					<CaretLeft className="h-3.5 w-3.5" />
					{project.name}
				</Link>

				<span className="text-muted-foreground/50">/</span>

				<div className="flex items-center gap-2">
					{sprint.icon && (
						<span className="text-base leading-none">{sprint.icon}</span>
					)}
					<h1 className="text-sm font-semibold">{sprint.name}</h1>
					<Badge
						variant="outline"
						className={cn("text-[10px] h-5", status.className)}
					>
						{status.label}
					</Badge>
				</div>

				<div className="flex items-center gap-2 ml-auto text-xs text-muted-foreground">
					{sprint.issueCount > 0 && (
						<span>
							{sprint.completedCount}/{sprint.issueCount} done
							{sprint.progressPercentage > 0 && (
								<span className="ml-1">({sprint.progressPercentage}%)</span>
							)}
						</span>
					)}
				</div>
			</div>

			{/* Toolbar — Jira-style inline filters */}
			<div className="flex items-center gap-1.5 px-4 py-1.5 border-b border-border/40 bg-muted/20 shrink-0">
				<InlineFilterBar
					filters={filters}
					setFilter={setFilter}
					clearAll={clearAllFilters}
					labels={(labels ?? []).map((l) => ({
						_id: l._id as string,
						name: l.name,
						color: l.color,
					}))}
					members={(members ?? []).map((m) => ({
						id: m.userId as string,
						name: m.user?.name ?? m.user?.email ?? "Unknown",
					}))}
					hide={["sprint"]}
				/>

				<div className="flex-1" />

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

			{/* Content + peek sidebar row */}
			<div className="flex flex-1 min-h-0 min-w-0 overflow-y-hidden">
				<div className="flex flex-col flex-1 min-h-0 min-w-0">
					{/* Issue views */}
					{options.layout === "board" && (
						<div className="flex flex-col flex-1 min-h-0 min-w-0 overflow-hidden">
							<IssueBoardView
								projectId={project._id}
								boardSprintId={sprint._id}
								externalIssues={filteredBoardIssues}
								displayProperties={boardDisplayProperties}
								swimlaneBy={options.swimlaneBy}
								onIssueClick={(id) => setSelectedIssueId(id as Id<"issues">)}
							/>
						</div>
					)}
					{options.layout === "list" && (
						<div className="px-6 pb-6 w-full overflow-auto flex-1">
							<IssueListView
								issues={filteredListIssues}
								projectId={project._id}
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
								projectId={project._id}
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
		</div>
	);
}
