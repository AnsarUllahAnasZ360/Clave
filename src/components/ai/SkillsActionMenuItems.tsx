"use client";

import { Check } from "lucide-react";
import {
	DropdownMenuItem,
	DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import type { Id } from "../../../convex/_generated/dataModel";

export type SkillSummary = {
	_id: Id<"skills">;
	name: string;
	description: string;
	category: string;
	isEnabled: boolean;
};

export type SkillsActionMenuItemsProps = {
	skills: SkillSummary[];
	selectedIds: Id<"skills">[];
	onChange: (ids: Id<"skills">[]) => void;
	maxVisible?: number;
};

export function SkillsActionMenuItems({
	skills,
	selectedIds,
	onChange,
	maxVisible = 8,
}: SkillsActionMenuItemsProps) {
	const enabledSkills = skills
		.filter((skill) => skill.isEnabled)
		.slice(0, maxVisible);
	if (enabledSkills.length === 0) return null;

	const toggleSkill = (skill: SkillSummary) => {
		if (selectedIds.includes(skill._id)) {
			onChange(selectedIds.filter((id) => id !== skill._id));
		} else {
			onChange([...selectedIds, skill._id]);
		}
	};

	return (
		<>
			<DropdownMenuSeparator />
			<div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
				Skills
			</div>
			{enabledSkills.map((skill) => {
				const selected = selectedIds.includes(skill._id);
				return (
					<DropdownMenuItem
						key={skill._id}
						onSelect={(event) => {
							event.preventDefault();
							toggleSkill(skill);
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
							<span className="truncate text-sm">{skill.name}</span>
						</div>
					</DropdownMenuItem>
				);
			})}
		</>
	);
}
