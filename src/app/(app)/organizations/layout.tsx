"use client";

import { useAuthActions } from "@convex-dev/auth/react";
import {
	Bug,
	ClockCounterClockwise,
	Keyboard,
	Moon,
	Question,
	ShieldCheck,
	SignOut,
	Sun,
} from "@phosphor-icons/react/dist/ssr";
import { useQuery } from "convex/react";
import { MonitorIcon } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
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
import { ShortcutProvider, useShortcuts } from "@/hooks/use-shortcuts";
import { api } from "../../../../convex/_generated/api";

function ProfileMenu() {
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
			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<button
						type="button"
						className="rounded-full outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
					>
						<Avatar className="h-9 w-9 cursor-pointer transition-opacity hover:opacity-80">
							<AvatarImage src={user?.avatarUrl || user?.image || ""} />
							<AvatarFallback className="text-xs">
								{userInitials}
							</AvatarFallback>
						</Avatar>
					</button>
				</DropdownMenuTrigger>
				<DropdownMenuContent align="end" className="w-56 rounded-xl">
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
									<span className="ml-auto text-xs text-primary">&#x2713;</span>
								)}
							</DropdownMenuItem>
							<DropdownMenuItem
								className="cursor-pointer gap-2"
								onSelect={() => setTheme("dark")}
							>
								<Moon className="h-4 w-4" />
								Dark
								{theme === "dark" && (
									<span className="ml-auto text-xs text-primary">&#x2713;</span>
								)}
							</DropdownMenuItem>
							<DropdownMenuItem
								className="cursor-pointer gap-2"
								onSelect={() => setTheme("system")}
							>
								<MonitorIcon className="h-4 w-4" />
								System
								{theme === "system" && (
									<span className="ml-auto text-xs text-primary">&#x2713;</span>
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
			<BugReportDialog open={bugReportOpen} onOpenChange={setBugReportOpen} />
			<ChangelogDialog open={changelogOpen} onOpenChange={setChangelogOpen} />
		</>
	);
}

export default function OrganizationsLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	const router = useRouter();
	const pathname = usePathname();
	const user = useQuery(api.users.current);

	useEffect(() => {
		if (user === null) {
			const redirect = pathname || "/organizations";
			router.replace(`/sign-in?redirect=${encodeURIComponent(redirect)}`);
		}
	}, [user, router, pathname]);

	if (user === undefined || user === null) {
		return (
			<div className="flex min-h-screen items-center justify-center bg-background">
				<div className="animate-pulse text-muted-foreground">Loading...</div>
			</div>
		);
	}

	return (
		<ShortcutProvider>
			<div className="relative min-h-screen bg-background">
				<div className="fixed top-4 right-6 z-50">
					<ProfileMenu />
				</div>
				{children}
			</div>
		</ShortcutProvider>
	);
}
