"use client";

import { ChevronDown, ChevronRight } from "lucide-react";
import { FolderOpen, Plus } from "@phosphor-icons/react/dist/ssr";
import { useState } from "react";
import { ProjectCard } from "@/components/project-card";
import { Skeleton } from "@/components/ui/skeleton";
import type { ProjectGroup } from "@/lib/view-options";
import { cn } from "@/lib/utils";

type ProjectCardsViewProps = {
	groups: ProjectGroup[];
	visibleProperties?: string[];
	loading?: boolean;
	onCreateProject?: () => void;
};

export function ProjectCardsView({
	groups,
	visibleProperties,
	loading = false,
	onCreateProject,
}: ProjectCardsViewProps) {
	const totalProjects = groups.reduce((n, g) => n + g.projects.length, 0);
	const isEmpty = !loading && totalProjects === 0;
	const isGrouped = groups.length > 1 || (groups.length === 1 && groups[0].label !== "");

	return (
		<div className="p-4">
			{loading ? (
				<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
					{[
						"skel-a",
						"skel-b",
						"skel-c",
						"skel-d",
						"skel-e",
						"skel-f",
						"skel-g",
						"skel-h",
					].map((skeletonId) => (
						<Skeleton key={skeletonId} className="h-40 rounded-2xl" />
					))}
				</div>
			) : isEmpty ? (
				<div className="flex h-60 flex-col items-center justify-center text-center">
					<div className="p-3 bg-muted rounded-md mb-4">
						<FolderOpen className="h-6 w-6 text-foreground" />
					</div>
					<h3 className="mb-2 text-lg font-semibold text-foreground">
						No projects yet
					</h3>
					<p className="mb-6 text-sm text-muted-foreground">
						Create your first project to get started
					</p>
					<button
						type="button"
						className="rounded-lg border border-border bg-background px-4 py-2 text-sm hover:bg-accent transition-colors cursor-pointer"
						onClick={onCreateProject}
					>
						<Plus className="mr-2 inline h-4 w-4" />
						Create new project
					</button>
				</div>
			) : isGrouped ? (
				<div className="space-y-6">
					{groups.map((group) => (
						<GroupSection
							key={group.key}
							group={group}
							visibleProperties={visibleProperties}
						/>
					))}
					<button
						type="button"
						className="rounded-2xl border border-dashed border-border/60 bg-background p-6 text-center text-sm text-muted-foreground hover:border-solid hover:border-border/80 hover:text-foreground transition-colors min-h-[80px] flex items-center justify-center cursor-pointer w-full"
						onClick={onCreateProject}
					>
						<Plus className="mr-2 h-5 w-5" />
						Create new project
					</button>
				</div>
			) : (
				<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
					{groups[0]?.projects.map((p) => (
						<ProjectCard
							key={p.id}
							project={p}
							visibleProperties={visibleProperties}
						/>
					))}
					<button
						type="button"
						className="rounded-2xl border border-dashed border-border/60 bg-background p-6 text-center text-sm text-muted-foreground hover:border-solid hover:border-border/80 hover:text-foreground transition-colors min-h-[180px] flex flex-col items-center justify-center cursor-pointer"
						onClick={onCreateProject}
					>
						<Plus className="mb-2 h-5 w-5" />
						Create new project
					</button>
				</div>
			)}
		</div>
	);
}

function GroupSection({
	group,
	visibleProperties,
}: { group: ProjectGroup; visibleProperties?: string[] }) {
	const [collapsed, setCollapsed] = useState(false);

	return (
		<div>
			<button
				type="button"
				className="flex items-center gap-2 mb-3 group cursor-pointer"
				onClick={() => setCollapsed(!collapsed)}
			>
				{collapsed ? (
					<ChevronRight className="h-4 w-4 text-muted-foreground" />
				) : (
					<ChevronDown className="h-4 w-4 text-muted-foreground" />
				)}
				<span className="text-sm font-medium text-foreground">
					{group.label}
				</span>
				<span
					className={cn(
						"rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground",
					)}
				>
					{group.projects.length}
				</span>
			</button>
			{!collapsed && (
				<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
					{group.projects.map((p) => (
						<ProjectCard
							key={p.id}
							project={p}
							visibleProperties={visibleProperties}
						/>
					))}
				</div>
			)}
		</div>
	);
}
