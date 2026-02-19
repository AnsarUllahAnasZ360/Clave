"use client";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip";

export interface PresenceUser {
	userId: string;
	name: string;
	image?: string | null;
}

interface PresenceAvatarStackProps {
	users: PresenceUser[];
	maxVisible?: number;
}

function getInitials(name: string | undefined): string {
	if (!name) return "?";
	return name
		.split(" ")
		.filter(Boolean)
		.map((p) => p[0])
		.join("")
		.slice(0, 2)
		.toUpperCase();
}

export function PresenceAvatarStack({
	users,
	maxVisible = 4,
}: PresenceAvatarStackProps) {
	if (users.length === 0) return null;

	const visible = users.slice(0, maxVisible);
	const overflow = users.length - maxVisible;

	return (
		<TooltipProvider>
			<div className="flex items-center -space-x-2">
				{visible.map((user) => (
					<Tooltip key={user.userId}>
						<TooltipTrigger asChild>
							<Avatar className="size-6 border-2 border-background">
								<AvatarImage
									src={user.image ?? undefined}
									alt={user.name}
								/>
								<AvatarFallback className="text-[10px] font-medium">
									{getInitials(user.name)}
								</AvatarFallback>
							</Avatar>
						</TooltipTrigger>
						<TooltipContent side="bottom">{user.name}</TooltipContent>
					</Tooltip>
				))}
				{overflow > 0 && (
					<div className="flex items-center justify-center size-6 rounded-full border-2 border-background bg-muted text-[10px] font-medium text-muted-foreground">
						+{overflow}
					</div>
				)}
			</div>
		</TooltipProvider>
	);
}
