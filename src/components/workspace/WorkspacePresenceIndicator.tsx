"use client";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
	HoverCard,
	HoverCardContent,
	HoverCardTrigger,
} from "@/components/ui/hover-card";
import type { OnlineUser } from "@/hooks/use-workspace-presence";

function getInitials(name: string): string {
	return name
		.split(" ")
		.map((part) => part[0])
		.join("")
		.toUpperCase()
		.slice(0, 2);
}

export function WorkspacePresenceIndicator({
	onlineUsers,
	isAnyoneOnline,
}: {
	onlineUsers: OnlineUser[];
	isAnyoneOnline: boolean;
}) {
	const isDev = process.env.NODE_ENV === "development";

	// In production, hide entirely when nobody else is online
	// In dev mode, show a muted indicator so developers can confirm the component mounted
	if (!isAnyoneOnline && !isDev) return null;

	return (
		<HoverCard openDelay={200} closeDelay={100}>
			<HoverCardTrigger asChild>
				<button
					type="button"
					className="relative flex h-6 w-6 items-center justify-center"
					aria-label={
						isAnyoneOnline
							? `${onlineUsers.length} team member${onlineUsers.length === 1 ? "" : "s"} online`
							: "Online presence active"
					}
				>
					{isAnyoneOnline ? (
						<>
							<span className="absolute inline-flex h-3 w-3 rounded-full bg-emerald-500 opacity-75 animate-ping" />
							<span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
						</>
					) : (
						<span className="relative inline-flex h-2 w-2 rounded-full bg-muted-foreground/30" />
					)}
				</button>
			</HoverCardTrigger>
			<HoverCardContent side="right" align="start" className="w-56 p-3">
				{isAnyoneOnline ? (
					<>
						<p className="mb-2 text-xs font-medium text-muted-foreground">
							{onlineUsers.length} online
						</p>
						<div className="flex flex-col gap-2">
							{onlineUsers.map((user) => (
								<div key={user.userId} className="flex items-center gap-2">
									<Avatar className="h-6 w-6">
										<AvatarImage src={user.image || ""} />
										<AvatarFallback className="text-[10px]">
											{getInitials(user.name)}
										</AvatarFallback>
									</Avatar>
									<span className="text-sm truncate">{user.name}</span>
								</div>
							))}
						</div>
					</>
				) : (
					<p className="text-xs text-muted-foreground">
						Just you — no other teammates online
					</p>
				)}
			</HoverCardContent>
		</HoverCard>
	);
}
