"use client";

import { Bot, HelpCircle, ListChecks } from "lucide-react";
import { memo } from "react";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

type ChatMode = "agent" | "plan" | "ask";

const MODE_CONFIG = {
	agent: {
		label: "Agent",
		shortLabel: "Agent",
		icon: Bot,
		color: "text-sienna-500",
		description: "Takes action — creates, updates, manages",
	},
	plan: {
		label: "Plan",
		shortLabel: "Plan",
		icon: ListChecks,
		color: "text-blue-500",
		description: "Researches and proposes — never executes",
	},
	ask: {
		label: "Ask",
		shortLabel: "Ask",
		icon: HelpCircle,
		color: "text-emerald-500",
		description: "Answers questions — read-only",
	},
} as const;

interface ChatModeSelectorProps {
	mode: ChatMode;
	onChange: (mode: ChatMode) => void;
	disabled?: boolean;
}

export const ChatModeSelector = memo(function ChatModeSelector({
	mode,
	onChange,
	disabled,
}: ChatModeSelectorProps) {
	const config = MODE_CONFIG[mode];
	const Icon = config.icon;

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button
					variant="ghost"
					size="sm"
					disabled={disabled}
					className={cn("h-7 gap-1 px-2 text-xs font-medium", config.color)}
				>
					<Icon className="h-3.5 w-3.5" />
					{config.shortLabel}
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="start" className="w-56">
				{(
					Object.entries(MODE_CONFIG) as [
						ChatMode,
						(typeof MODE_CONFIG)[ChatMode],
					][]
				).map(([key, cfg]) => {
					const ModeIcon = cfg.icon;
					return (
						<DropdownMenuItem
							key={key}
							onClick={() => onChange(key)}
							className={cn(
								"flex items-center gap-2",
								mode === key && "bg-accent",
							)}
						>
							<ModeIcon className={cn("h-4 w-4 shrink-0", cfg.color)} />
							<div className="flex flex-col">
								<span className="text-sm font-medium">{cfg.label}</span>
								<span className="text-xs text-muted-foreground">
									{cfg.description}
								</span>
							</div>
						</DropdownMenuItem>
					);
				})}
			</DropdownMenuContent>
		</DropdownMenu>
	);
});
