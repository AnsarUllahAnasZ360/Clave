"use client";

import { Plus } from "@phosphor-icons/react/dist/ssr";
import { ChipOverflow } from "@/components/chip-overflow";
import { FilterPopover } from "@/components/filter-popover";
import { Button } from "@/components/ui/button";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { ViewOptionsPopover } from "@/components/view-options-popover";
import type { FilterCounts } from "@/lib/data/projects";
import type {
	FilterChip as FilterChipType,
	ViewOptions,
} from "@/lib/view-options";

interface ProjectHeaderProps {
	filters: FilterChipType[];
	onRemoveFilter: (key: string, value: string) => void;
	onFiltersChange: (chips: FilterChipType[]) => void;
	counts?: FilterCounts;
	viewOptions: ViewOptions;
	onViewOptionsChange: (options: ViewOptions) => void;
	onAddProject?: () => void;
}

export function ProjectHeader({
	filters,
	onRemoveFilter,
	onFiltersChange,
	counts,
	viewOptions,
	onViewOptionsChange,
	onAddProject,
}: ProjectHeaderProps) {
	return (
		<header className="sticky top-0 z-10 bg-background flex items-center gap-3 px-4 py-2.5 border-b border-border/70 flex-wrap">
			<SidebarTrigger className="h-8 w-8 rounded-lg hover:bg-accent text-muted-foreground" />
			<h1 className="text-sm font-medium text-foreground whitespace-nowrap">
				Projects
			</h1>

			{/* Filter controls */}
			<div className="flex items-center gap-2">
				<FilterPopover
					initialChips={filters}
					onApply={onFiltersChange}
					onClear={() => onFiltersChange([])}
					counts={counts}
				/>
				<ChipOverflow
					chips={filters}
					onRemove={onRemoveFilter}
					maxVisible={6}
				/>
			</div>

			{/* Spacer */}
			<div className="flex-1 min-w-0" />

			{/* Action buttons */}
			<div className="flex items-center gap-1 shrink-0">
				<ViewOptionsPopover
					options={viewOptions}
					onChange={onViewOptionsChange}
					allowedViewTypes={["list"]}
					context="projects"
				/>
				<Button
					variant="ghost"
					size="sm"
					className="h-7 gap-1.5 text-xs"
					onClick={onAddProject}
				>
					<Plus className="h-3.5 w-3.5" weight="bold" />
					Add Project
				</Button>
			</div>
		</header>
	);
}
