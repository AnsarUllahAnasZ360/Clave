"use client";

import { useAuthActions } from "@convex-dev/auth/react";
import {
	Bug,
	ClockCounterClockwise,
	Gear,
	Keyboard,
	Moon,
	Question,
	ShieldCheck,
	SignOut,
	Sun,
} from "@phosphor-icons/react/dist/ssr";
import { useQuery } from "convex/react";
import { MonitorIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { useState } from "react";
import { ChangelogDialog } from "@/components/changelog/ChangelogDialog";
import { BugReportDialog } from "@/components/feedback/BugReportDialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuSub,
	DropdownMenuSubContent,
	DropdownMenuSubTrigger,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SidebarFooter } from "@/components/ui/sidebar";
import { useShortcuts } from "@/hooks/use-shortcuts";
import { api } from "../../../convex/_generated/api";

interface UserFooterMenuProps {
	settingsHref?: string;
}

export function UserFooterMenu({ settingsHref = "/" }: UserFooterMenuProps) {
	const router = useRouter();
	const { signOut } = useAuthActions();
	const user = useQuery(api.users.current);
	const { theme, setTheme } = useTheme();
	const { toggleHelp } = useShortcuts();
	const [bugReportOpen, setBugReportOpen] = useState(false);
	const [changelogOpen, setChangelogOpen] = useState(false);

	const handleSignOut = async () => {
		try {
			await signOut();
		} finally {
			window.location.assign("/");
		}
	};

	const userName = user?.name || "User";
	const userEmail = user?.email || "user@clave.app";
	const userInitials = userName
		.split(" ")
		.map((n: string) => n[0])
		.join("")
		.toUpperCase()
		.slice(0, 2);

	return (
		<>
			<SidebarFooter className="border-t border-border/40 p-2 group-data-[collapsible=icon]:p-1.5">
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<button
							type="button"
							className="flex w-full items-center gap-3 rounded-lg p-2 text-left hover:bg-accent cursor-pointer group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:gap-0 group-data-[collapsible=icon]:p-1 group-data-[collapsible=icon]:rounded-full"
						>
							<Avatar className="h-8 w-8 shrink-0 group-data-[collapsible=icon]:h-7 group-data-[collapsible=icon]:w-7">
								<AvatarImage src={user?.avatarUrl || user?.image || ""} />
								<AvatarFallback className="text-xs">
									{userInitials}
								</AvatarFallback>
							</Avatar>
							<div className="flex flex-1 flex-col min-w-0 group-data-[collapsible=icon]:hidden">
								<span className="text-sm font-medium truncate">{userName}</span>
								<span className="text-xs text-muted-foreground truncate">
									{userEmail}
								</span>
							</div>
							<svg
								className="h-4 w-4 text-muted-foreground shrink-0 group-data-[collapsible=icon]:hidden"
								xmlns="http://www.w3.org/2000/svg"
								viewBox="0 0 256 256"
								fill="currentColor"
							>
								<title>More</title>
								<circle cx="128" cy="64" r="16" />
								<circle cx="128" cy="128" r="16" />
								<circle cx="128" cy="192" r="16" />
							</svg>
						</button>
					</DropdownMenuTrigger>
					<DropdownMenuContent
						side="top"
						align="start"
						className="w-56 rounded-xl"
					>
						<DropdownMenuLabel className="p-3">
							<div className="flex items-center gap-3">
								<Avatar className="h-10 w-10 shrink-0">
									<AvatarImage src={user?.avatarUrl || user?.image || ""} />
									<AvatarFallback>{userInitials}</AvatarFallback>
								</Avatar>
								<div className="flex flex-col min-w-0">
									<span className="text-sm font-semibold truncate">
										{userName}
									</span>
									<span className="text-xs text-muted-foreground font-normal truncate">
										{userEmail}
									</span>
								</div>
							</div>
						</DropdownMenuLabel>
						<DropdownMenuSeparator />
						<DropdownMenuItem
							className="cursor-pointer gap-2"
							onSelect={() =>
								router.push(settingsHref as Parameters<typeof router.push>[0])
							}
						>
							<Gear className="h-4 w-4" />
							Settings
						</DropdownMenuItem>
						{user?.role === "superadmin" && (
							<DropdownMenuItem
								className="cursor-pointer gap-2"
								onSelect={() =>
									router.push("/admin" as Parameters<typeof router.push>[0])
								}
							>
								<ShieldCheck className="h-4 w-4" />
								Admin Portal
							</DropdownMenuItem>
						)}
						<DropdownMenuSub>
							<DropdownMenuSubTrigger className="cursor-pointer gap-2">
								{theme === "dark" ? (
									<Moon className="h-4 w-4" />
								) : theme === "light" ? (
									<Sun className="h-4 w-4" />
								) : (
									<MonitorIcon className="h-4 w-4" />
								)}
								Theme
							</DropdownMenuSubTrigger>
							<DropdownMenuSubContent>
								<DropdownMenuItem
									className="cursor-pointer gap-2"
									onSelect={() => setTheme("light")}
								>
									<Sun className="h-4 w-4" />
									Light
									{theme === "light" && (
										<span className="ml-auto text-xs text-primary">
											&#x2713;
										</span>
									)}
								</DropdownMenuItem>
								<DropdownMenuItem
									className="cursor-pointer gap-2"
									onSelect={() => setTheme("dark")}
								>
									<Moon className="h-4 w-4" />
									Dark
									{theme === "dark" && (
										<span className="ml-auto text-xs text-primary">
											&#x2713;
										</span>
									)}
								</DropdownMenuItem>
								<DropdownMenuItem
									className="cursor-pointer gap-2"
									onSelect={() => setTheme("system")}
								>
									<MonitorIcon className="h-4 w-4" />
									System
									{theme === "system" && (
										<span className="ml-auto text-xs text-primary">
											&#x2713;
										</span>
									)}
								</DropdownMenuItem>
							</DropdownMenuSubContent>
						</DropdownMenuSub>
						<DropdownMenuSeparator />
						<DropdownMenuItem
							className="cursor-pointer gap-2"
							onSelect={() => setBugReportOpen(true)}
						>
							<Bug className="h-4 w-4" />
							Report Bug
						</DropdownMenuItem>
						<DropdownMenuItem
							className="cursor-pointer gap-2"
							onSelect={() => setChangelogOpen(true)}
						>
							<ClockCounterClockwise className="h-4 w-4" />
							Changelog
						</DropdownMenuItem>
						<DropdownMenuItem
							className="cursor-pointer gap-2"
							onSelect={toggleHelp}
						>
							<Keyboard className="h-4 w-4" />
							Shortcuts
							<span className="ml-auto text-xs text-muted-foreground">?</span>
						</DropdownMenuItem>
						<DropdownMenuItem
							className="cursor-pointer gap-2"
							onSelect={() =>
								router.push("/docs" as Parameters<typeof router.push>[0])
							}
						>
							<Question className="h-4 w-4" />
							Help
						</DropdownMenuItem>
						<DropdownMenuSeparator />
						<DropdownMenuItem
							className="cursor-pointer gap-2"
							variant="destructive"
							onSelect={handleSignOut}
						>
							<SignOut className="h-4 w-4" />
							Log out
						</DropdownMenuItem>
					</DropdownMenuContent>
				</DropdownMenu>
			</SidebarFooter>
			<BugReportDialog open={bugReportOpen} onOpenChange={setBugReportOpen} />
			<ChangelogDialog open={changelogOpen} onOpenChange={setChangelogOpen} />
		</>
	);
}
