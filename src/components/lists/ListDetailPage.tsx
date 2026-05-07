"use client";

import { CaretRight } from "@phosphor-icons/react/dist/ssr";
import { useQuery } from "convex/react";
import { Layers, Plus } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { DisplayOptionsPanel } from "@/components/issues/DisplayOptionsPanel";
import { InlineFilterBar } from "@/components/issues/InlineFilterBar";
import type { IssueCardData } from "@/components/issues/IssueBoardCard";
import { IssueBoardView } from "@/components/issues/IssueBoardView";
import { useIssueCreate } from "@/components/issues/IssueCreateContext";
import type { IssueListData } from "@/components/issues/IssueListRow";
import { IssueListView } from "@/components/issues/IssueListView";
import { IssuePreviewSidebar } from "@/components/issues/IssuePreviewSidebar";
import { useIssueFilters } from "@/components/issues/MyIssuesFilterPopover";
import { useWorkspace } from "@/components/providers/workspace-context";
import {
	useWorkspaceLabels,
	useWorkspaceMembers,
} from "@/components/providers/workspace-data-context";
import { Button } from "@/components/ui/button";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useDisplayOptions } from "@/hooks/use-display-options";
import type { DisplayPropertyId } from "@/lib/display-options";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

const TAB_TRIGGER_CLASS =
	"h-7 rounded-md px-2.5 py-1 text-xs font-medium after:hidden data-[state=active]:bg-muted data-[state=active]:text-foreground data-[state=active]:shadow-none data-[state=active]:border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/50";

interface ListDetailPageProps {
	listId: Id<"lists">;
}

function toBoardDisplayProperties(
	ids: DisplayPropertyId[],
): Record<string, boolean> {
	const props: Record<string, boolean> = {};
	for (const id of ids) {
		props[id] = true;
	}
	return props;
}

export function ListDetailPage({ listId }: ListDetailPageProps) {
	const { workspaceSlug } = useWorkspace();
	const [activeTab, setActiveTab] = useState("issues");
	const [selectedIssueId, setSelectedIssueId] = useState<Id<"issues"> | null>(
		null,
	);

	const list = useQuery(api.lists.getById, { listId });
	const project = useQuery(
		api.projects.getById,
		list?.projectId ? { projectId: list.projectId } : "skip",
	);
	const rawIssues = useQuery(api.issues.listByList, { listId });

	const viewContext = `list:${listId}:issues`;
	const displayOpts = useDisplayOptions(viewContext);
	const options = displayOpts.options;

	const { openFullCreate } = useIssueCreate();

	const {
		filters,
		setFilter,
		clearAll: clearAllFilters,
		applyFilters,
	} = useIssueFilters();

	const members = useWorkspaceMembers();
	const labels = useWorkspaceLabels();

	const boardDisplayProperties = useMemo(
		() => toBoardDisplayProperties(options.displayProperties),
		[options.displayProperties],
	);

	if (list === undefined) {
		return (
			<div className="flex flex-1 flex-col min-w-0 m-2 border border-border rounded-lg h-[calc(100svh-1rem)] overflow-hidden">
				<div className="shrink-0 border-b border-border px-4 py-2">
					<Skeleton className="h-6 w-48" />
				</div>
				<div className="flex-1 p-4 space-y-2">
					<Skeleton className="h-10 w-full" />
					<Skeleton className="h-10 w-full" />
					<Skeleton className="h-10 w-full" />
				</div>
			</div>
		);
	}

	if (list === null) {
		return (
			<div className="flex flex-1 flex-col items-center justify-center min-w-0 m-2 border border-border rounded-lg h-[calc(100svh-1rem)]">
				<p className="text-muted-foreground text-sm">List not found</p>
				<Button asChild variant="outline" className="mt-4">
					<Link href={`/${workspaceSlug}/projects`} prefetch={false}>
						Back to projects
					</Link>
				</Button>
			</div>
		);
	}

	const filteredIssues = useMemo(
		() => applyFilters(rawIssues ?? []),
		[rawIssues, applyFilters],
	);

	const issueListData: IssueListData[] = filteredIssues.map((issue) => ({
		_id: issue._id,
		_creationTime: issue._creationTime,
		identifier: issue.identifier,
		title: issue.title,
		status: issue.status,
		priority: issue.priority,
		type: issue.type,
		assigneeId: issue.assigneeId,
		assigneeIds: issue.assigneeIds,
		labelIds: issue.labelIds,
		dueDate: issue.dueDate,
		estimate: issue.estimate,
		sortOrder: issue.sortOrder,
		projectId: issue.projectId,
		sprintId: issue.sprintId,
		milestoneId: issue.milestoneId,
		parentId: issue.parentId,
		updatedAt: issue.updatedAt,
	}));

	const issueBoardData: IssueCardData[] = filteredIssues.map((issue) => ({
		_id: issue._id,
		identifier: issue.identifier,
		title: issue.title,
		status: issue.status,
		priority: issue.priority,
		assigneeId: issue.assigneeId,
		assigneeIds: issue.assigneeIds,
		labelIds: issue.labelIds,
		dueDate: issue.dueDate,
		estimate: issue.estimate,
		sortOrder: issue.sortOrder,
		projectId: issue.projectId,
		sprintId: issue.sprintId,
		milestoneId: issue.milestoneId,
		parentId: issue.parentId,
		_creationTime: issue._creationTime,
		updatedAt: issue.updatedAt,
	}));

	return (
		<div className="flex flex-1 flex-col min-w-0 m-2 border border-border rounded-lg h-[calc(100svh-1rem)] overflow-hidden">
			<Tabs
				value={activeTab}
				onValueChange={setActiveTab}
				className="flex flex-1 flex-col min-h-0"
			>
				{/* Header */}
				<div className="shrink-0 bg-background border-b border-border">
					<div className="flex items-center gap-2 px-4 py-1.5">
						<SidebarTrigger className="h-7 w-7 rounded-lg hover:bg-accent text-muted-foreground shrink-0" />

						{/* Breadcrumb */}
						<nav className="flex items-center gap-1.5 min-w-0 text-sm">
							<Link
								href={`/${workspaceSlug}/projects` as never}
								className="text-muted-foreground hover:text-foreground transition-colors shrink-0"
								prefetch={false}
							>
								Projects
							</Link>
							{project && (
								<>
									<CaretRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
									<Link
										href={`/${workspaceSlug}/projects/${project.slug}` as never}
										className="text-muted-foreground hover:text-foreground transition-colors truncate max-w-[160px]"
										prefetch={false}
									>
										{project.icon ? `${project.icon} ` : ""}
										{project.name}
									</Link>
								</>
							)}
							<CaretRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
							<div className="flex items-center gap-1.5 min-w-0">
								<Layers className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
								<span className="font-medium truncate">{list.name}</span>
							</div>
						</nav>

						<div className="flex-1" />

						{/* Tab pills */}
						<TabsList variant="line" className="h-auto gap-0.5 border-none p-0">
							<TabsTrigger value="issues" className={TAB_TRIGGER_CLASS}>
								Issues
							</TabsTrigger>
						</TabsList>

						{/* Actions */}
						<div className="flex items-center gap-1.5 shrink-0">
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
								availableLayouts={["list", "board"]}
							/>
							<Button
								size="sm"
								className="h-7 gap-1 text-xs"
								onClick={() =>
									openFullCreate({
										projectId: list.projectId as string,
										listId: listId as string,
									})
								}
							>
								<Plus className="h-3.5 w-3.5" />
								Add issue
							</Button>
						</div>
					</div>
				</div>

				{/* Filter bar */}
				<div className="flex items-center gap-1.5 px-4 py-1.5 border-b border-border/40 bg-muted/20 shrink-0">
					<InlineFilterBar
						filters={filters}
						setFilter={setFilter}
						clearAll={clearAllFilters}
						projectId={list.projectId}
						labels={(labels ?? []).map((l) => ({
							_id: l._id as string,
							name: l.name,
							color: l.color,
						}))}
						members={(members ?? []).map((m) => ({
							id: m.userId as string,
							name: m.user?.name ?? m.user?.email ?? "Unknown",
						}))}
					/>
				</div>

				{/* Content */}
				<TabsContent
					value="issues"
					className="flex flex-1 flex-col min-h-0 mt-0"
				>
					<div className="flex flex-1 min-h-0 min-w-0">
						<div className="flex flex-col flex-1 min-h-0 min-w-0">
							{options.layout === "board" ? (
								<IssueBoardView
									externalIssues={issueBoardData}
									projectId={list.projectId}
									displayProperties={boardDisplayProperties}
									swimlaneBy={options.swimlaneBy}
									orderBy={options.orderBy}
									orderDirection={options.orderDirection}
									onIssueClick={(id) => setSelectedIssueId(id as Id<"issues">)}
								/>
							) : (
								<IssueListView
									issues={issueListData}
									projectId={list.projectId}
									groupBy={options.groupBy}
									subGroupBy={options.subGroupBy}
									orderBy={options.orderBy}
									orderDirection={options.orderDirection}
									displayProperties={options.displayProperties}
									showEmptyGroups={options.showEmptyGroups}
									showSubIssues={options.showSubIssues}
									hideFilter
									onIssueClick={(id) => setSelectedIssueId(id as Id<"issues">)}
								/>
							)}
						</div>

						<div
							className="shrink-0 overflow-hidden transition-[width] duration-200 ease-out"
							style={{ width: selectedIssueId ? 420 : 0 }}
						>
							{selectedIssueId && (
								<IssuePreviewSidebar
									issueId={selectedIssueId}
									onClose={() => setSelectedIssueId(null)}
								/>
							)}
						</div>
					</div>
				</TabsContent>
			</Tabs>
		</div>
	);
}
