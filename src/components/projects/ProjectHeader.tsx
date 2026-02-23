"use client";

import { PencilSimpleLine } from "@phosphor-icons/react/dist/ssr";
import { Smile } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmojiPicker } from "@/components/ui/emoji-picker";
import type { Id } from "../../../convex/_generated/dataModel";

type ProjectHeaderProps = {
	project: {
		_id: Id<"projects">;
		name: string;
		icon?: string;
	};
	onEditProject?: () => void;
	onUpdate: (
		updates: Record<string, string | number | string[] | undefined>,
	) => Promise<void>;
};

export function ProjectHeader({
	project,
	onEditProject,
	onUpdate,
}: ProjectHeaderProps) {
	return (
		<div className="flex items-center gap-2 min-w-0">
			<EmojiPicker
				value={project.icon}
				onChange={(emoji) => {
					onUpdate({ icon: emoji ?? "" });
				}}
				trigger={
					<button
						type="button"
						className="flex items-center justify-center rounded-md p-0.5 hover:bg-muted transition-colors cursor-pointer shrink-0"
					>
						{project.icon ? (
							<span className="text-base leading-none">{project.icon}</span>
						) : (
							<Smile className="h-4 w-4 text-muted-foreground" />
						)}
					</button>
				}
			/>
			<span className="text-sm font-semibold text-foreground truncate">
				{project.name}
			</span>
			{onEditProject && (
				<Button
					type="button"
					variant="ghost"
					size="icon-sm"
					aria-label="Edit project"
					className="rounded-lg text-muted-foreground hover:text-foreground shrink-0 h-6 w-6"
					onClick={onEditProject}
				>
					<PencilSimpleLine className="h-3.5 w-3.5" />
				</Button>
			)}
		</div>
	);
}
