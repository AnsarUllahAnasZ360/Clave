"use client";

import type { ReactNode } from "react";
import { AIAssistButton } from "@/components/ai/AIAssistButton";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuShortcut,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type {
	AIAction,
	AIContext,
	EmbeddedAIActionType,
} from "@/types/embedded-ai";

interface AIActionMenuProps {
	/** The list of AI actions to display in the dropdown. */
	actions: AIAction[];
	/** Callback fired when an action is selected. */
	onAction: (type: EmbeddedAIActionType) => void;
	/** Custom trigger element. Defaults to `<AIAssistButton variant="icon" />`. */
	trigger?: ReactNode;
	/** Optional context hint for display purposes (e.g., section label). */
	context?: AIContext;
	/** Disable the entire menu. */
	disabled?: boolean;
	/** Side of the trigger to open the menu. */
	side?: "top" | "right" | "bottom" | "left";
	/** Alignment relative to the trigger. */
	align?: "start" | "center" | "end";
}

function AIActionMenu({
	actions,
	onAction,
	trigger,
	context,
	disabled = false,
	side = "bottom",
	align = "start",
}: AIActionMenuProps) {
	if (actions.length === 0) return null;

	// Group actions: split at separator boundaries
	const groups: AIAction[][] = [];
	let current: AIAction[] = [];

	for (const action of actions) {
		if (action.separator && current.length > 0) {
			groups.push(current);
			current = [];
		}
		current.push(action);
	}
	if (current.length > 0) {
		groups.push(current);
	}

	const contextLabel = context
		? `AI actions for ${context.page}`
		: "AI actions";

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild disabled={disabled}>
				{trigger ?? <AIAssistButton variant="icon" disabled={disabled} />}
			</DropdownMenuTrigger>
			<DropdownMenuContent
				side={side}
				align={align}
				className="w-56 max-w-[calc(100vw-2rem)]"
			>
				<DropdownMenuLabel className="text-xs text-muted-foreground">
					{contextLabel}
				</DropdownMenuLabel>
				<DropdownMenuSeparator />
				{groups.map((group, groupIndex) => (
					<DropdownMenuGroup key={group[0].type}>
						{groupIndex > 0 && <DropdownMenuSeparator />}
						{group.map((action) => (
							<DropdownMenuItem
								key={action.type}
								onSelect={() => onAction(action.type)}
							>
								{action.icon && (
									<span className="text-sienna-500 dark:text-sienna-400">
										{action.icon}
									</span>
								)}
								<span>{action.label}</span>
								{action.shortcut && (
									<DropdownMenuShortcut>{action.shortcut}</DropdownMenuShortcut>
								)}
							</DropdownMenuItem>
						))}
					</DropdownMenuGroup>
				))}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}

export { AIActionMenu };
export type { AIActionMenuProps };
