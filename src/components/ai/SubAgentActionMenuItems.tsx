"use client";

import { Check } from "lucide-react";
import {
	DropdownMenuItem,
	DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import type { Id } from "../../../convex/_generated/dataModel";

export type SubAgentSummary = {
	_id: Id<"subAgents">;
	name: string;
	description: string;
	avatar?: string;
	isPreset: boolean;
};

export type SubAgentActionMenuItemsProps = {
	subAgents: SubAgentSummary[];
	selectedId: Id<"subAgents"> | null;
	onChange: (id: Id<"subAgents"> | null) => void;
	maxVisible?: number;
};

export function SubAgentActionMenuItems({
	subAgents,
	selectedId,
	onChange,
	maxVisible = 6,
}: SubAgentActionMenuItemsProps) {
	const visibleAgents = subAgents.slice(0, maxVisible);
	if (visibleAgents.length === 0) return null;

	const handleSelect = (agent: SubAgentSummary) => {
		if (selectedId === agent._id) {
			onChange(null);
		} else {
			onChange(agent._id);
		}
	};

	return (
		<>
			<DropdownMenuSeparator />
			<div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
				AI teammates
			</div>
			{visibleAgents.map((agent) => {
				const selected = selectedId === agent._id;
				return (
					<DropdownMenuItem
						key={agent._id}
						onSelect={(event) => {
							event.preventDefault();
							handleSelect(agent);
						}}
						className="flex items-center gap-2"
					>
						<div
							className={cn(
								"flex size-4 items-center justify-center rounded border",
								selected
									? "border-sienna-500 bg-sienna-500/15 text-sienna-600 dark:text-sienna-300"
									: "border-border text-transparent",
							)}
						>
							<Check className="size-3" />
						</div>
						<div className="min-w-0 flex-1">
							<span className="truncate text-sm">{agent.name}</span>
							{agent.isPreset && (
								<span className="ml-1.5 text-[10px] text-muted-foreground">
									Preset
								</span>
							)}
						</div>
					</DropdownMenuItem>
				);
			})}
		</>
	);
}
