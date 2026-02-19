"use client";

import { useAuthActions } from "@convex-dev/auth/react";
import {
	CaretRight,
	ChartBar,
	CheckSquare,
	FileText,
	Folder,
	Gear,
	MagnifyingGlass,
	PenNib,
	Question,
	SignOut,
	Star,
	Tray,
	Users,
} from "@phosphor-icons/react/dist/ssr";
import { useQuery } from "convex/react";
import Link, { type LinkProps } from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ProgressCircle } from "@/components/progress-circle";
import { useWorkspace } from "@/components/providers/workspace-context";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
	Sidebar,
	SidebarContent,
	SidebarFooter,
	SidebarGroup,
	SidebarGroupContent,
	SidebarGroupLabel,
	SidebarHeader,
	SidebarMenu,
	SidebarMenuBadge,
	SidebarMenuButton,
	SidebarMenuItem,
} from "@/components/ui/sidebar";
import { Skeleton } from "@/components/ui/skeleton";
import { WorkspacePresenceIndicator } from "@/components/workspace/WorkspacePresenceIndicator";
import { WorkspaceSelector } from "@/components/workspace/workspace-selector";
import { useWorkspacePresence } from "@/hooks/use-workspace-presence";
import { api } from "../../convex/_generated/api";

type NavItemId =
	| "inbox"
	| "my-tasks"
	| "projects"
	| "docs"
	| "boards"
	| "clients"
	| "performance";
type SidebarFooterItemId = "settings" | "help";

const navItemIcons: Record<
	NavItemId,
	React.ComponentType<{ className?: string }>
> = {
	inbox: Tray,
	"my-tasks": CheckSquare,
	projects: Folder,
	docs: FileText,
	boards: PenNib,
	clients: Users,
	performance: ChartBar,
};

const navItems: { id: NavItemId; label: string }[] = [
	{ id: "inbox", label: "Inbox" },
	{ id: "my-tasks", label: "My issues" },
	{ id: "projects", label: "Projects" },
	{ id: "docs", label: "Docs" },
	{ id: "boards", label: "Boards" },
	{ id: "clients", label: "Clients" },
	{ id: "performance", label: "Performance" },
];

const footerItems: { id: SidebarFooterItemId; label: string }[] = [
	{ id: "settings", label: "Settings" },
	{ id: "help", label: "Help" },
];

const footerItemIcons: Record<
	SidebarFooterItemId,
	React.ComponentType<{ className?: string }>
> = {
	settings: Gear,
	help: Question,
};

export function AppSidebar() {
	const pathname = usePathname();
	const router = useRouter();
	const { workspaceId, workspaceSlug } = useWorkspace();
	const { signOut } = useAuthActions();
	const user = useQuery(api.users.current);
	const activeProjects = useQuery(api.projects.listActive, { workspaceId });
	const favorites = useQuery(api.favorites.list, { workspaceId });

	const unreadCount = useQuery(api.notifications.unreadCount, { workspaceId });
	const displayUnreadCount =
		unreadCount !== undefined && unreadCount > 99 ? "99+" : unreadCount;

	const { onlineUsers, isAnyoneOnline } = useWorkspacePresence(
		workspaceId,
		user?._id,
	);

	const getHrefForNavItem = (id: NavItemId): LinkProps<string>["href"] => {
		const base = `/${workspaceSlug}`;
		if (id === "my-tasks") return `${base}/tasks` as LinkProps<string>["href"];
		if (id === "projects")
			return `${base}/projects` as LinkProps<string>["href"];
		if (id === "inbox") return `${base}/inbox` as LinkProps<string>["href"];
		if (id === "docs") return `${base}/docs` as LinkProps<string>["href"];
		if (id === "boards") return `${base}/boards` as LinkProps<string>["href"];
		if (id === "clients") return `${base}/clients` as LinkProps<string>["href"];
		if (id === "performance")
			return `${base}/analytics` as LinkProps<string>["href"];
		return "#" as LinkProps<string>["href"];
	};

	const isItemActive = (id: NavItemId): boolean => {
		const base = `/${workspaceSlug}`;
		if (id === "projects") {
			return (
				pathname === base ||
				pathname === `${base}/projects` ||
				pathname.startsWith(`${base}/projects/`)
			);
		}
		if (id === "my-tasks") {
			return pathname.startsWith(`${base}/tasks`);
		}
		if (id === "inbox") {
			return pathname.startsWith(`${base}/inbox`);
		}
		if (id === "docs") {
			return pathname.startsWith(`${base}/docs`);
		}
		if (id === "boards") {
			return pathname.startsWith(`${base}/boards`);
		}
		if (id === "clients") {
			return pathname.startsWith(`${base}/clients`);
		}
		if (id === "performance") {
			return pathname.startsWith(`${base}/analytics`);
		}
		return false;
	};

	const handleSignOut = async () => {
		await signOut();
		router.push("/sign-in");
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
		<Sidebar className="border-border/40 border-r-0 shadow-none border-none">
			<SidebarHeader className="p-4">
				<div className="flex items-center gap-2">
					<div className="flex-1 min-w-0">
						<WorkspaceSelector />
					</div>
					<WorkspacePresenceIndicator
						onlineUsers={onlineUsers}
						isAnyoneOnline={isAnyoneOnline}
					/>
				</div>
			</SidebarHeader>

			<SidebarContent className="px-0 gap-0">
				<SidebarGroup>
					<div className="relative px-0 py-0">
						<MagnifyingGlass className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
						<Input
							placeholder="Search"
							className="h-9 rounded-lg bg-muted/50 pl-8 text-sm placeholder:text-muted-foreground focus-visible:ring-1 focus-visible:ring-primary/20 border-border border shadow-none"
						/>
						<kbd className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none hidden h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium opacity-100 sm:flex">
							<span className="text-xs">&#x2318;</span>K
						</kbd>
					</div>
				</SidebarGroup>

				<SidebarGroup>
					<SidebarGroupContent>
						<SidebarMenu>
							{navItems.map((item) => {
								const href = getHrefForNavItem(item.id);
								const active = isItemActive(item.id);

								return (
									<SidebarMenuItem key={item.id}>
										<SidebarMenuButton
											asChild
											isActive={active}
											className="h-9 rounded-lg px-3 font-normal text-muted-foreground"
										>
											<Link href={href}>
												{(() => {
													const Icon = navItemIcons[item.id];
													return Icon ? (
														<Icon className="h-[18px] w-[18px]" />
													) : null;
												})()}
												<span>{item.label}</span>
											</Link>
										</SidebarMenuButton>
										{item.id === "inbox" &&
											unreadCount !== undefined &&
											unreadCount > 0 && (
												<SidebarMenuBadge className="bg-muted text-muted-foreground rounded-full px-2">
													{displayUnreadCount}
												</SidebarMenuBadge>
											)}
									</SidebarMenuItem>
								);
							})}
						</SidebarMenu>
					</SidebarGroupContent>
				</SidebarGroup>

				{favorites !== undefined && favorites.length > 0 && (
					<SidebarGroup>
						<SidebarGroupLabel className="px-3 text-xs font-medium text-muted-foreground">
							Favorites
						</SidebarGroupLabel>
						<SidebarGroupContent>
							<SidebarMenu>
								{favorites.map((fav) => {
									const getFavHref = () => {
										const base = `/${workspaceSlug}`;
										switch (fav.entityType) {
											case "project":
												return `${base}/projects/${fav.entityId}`;
											case "client":
												return `${base}/clients/${fav.entityId}`;
											case "document":
												return `${base}/docs/${fav.entityId}`;
											case "whiteboard":
												return `${base}/boards/${fav.entityId}`;
											default:
												return `${base}/notes/${fav.entityId}`;
										}
									};
									const getFavIcon = () => {
										switch (fav.entityType) {
											case "document":
												return (
													<FileText className="h-[18px] w-[18px] text-muted-foreground" />
												);
											case "whiteboard":
												return (
													<PenNib className="h-[18px] w-[18px] text-muted-foreground" />
												);
											default:
												return (
													<Star
														className="h-[18px] w-[18px] text-muted-foreground"
														weight="fill"
													/>
												);
										}
									};
									return (
										<SidebarMenuItem key={fav._id}>
											<SidebarMenuButton
												asChild
												className="h-9 rounded-lg px-3 group"
											>
												<Link href={getFavHref() as LinkProps<string>["href"]}>
													{getFavIcon()}
													<span className="flex-1 truncate text-sm">
														{fav.name}
													</span>
												</Link>
											</SidebarMenuButton>
										</SidebarMenuItem>
									);
								})}
							</SidebarMenu>
						</SidebarGroupContent>
					</SidebarGroup>
				)}

				<SidebarGroup>
					<SidebarGroupLabel className="px-3 text-xs font-medium text-muted-foreground">
						Active Projects
					</SidebarGroupLabel>
					<SidebarGroupContent>
						<SidebarMenu>
							{activeProjects === undefined ? (
								<>
									<SidebarMenuItem>
										<div className="flex items-center gap-3 px-3 h-9">
											<Skeleton className="h-[18px] w-[18px] rounded-full" />
											<Skeleton className="h-3 flex-1" />
										</div>
									</SidebarMenuItem>
									<SidebarMenuItem>
										<div className="flex items-center gap-3 px-3 h-9">
											<Skeleton className="h-[18px] w-[18px] rounded-full" />
											<Skeleton className="h-3 flex-1" />
										</div>
									</SidebarMenuItem>
									<SidebarMenuItem>
										<div className="flex items-center gap-3 px-3 h-9">
											<Skeleton className="h-[18px] w-[18px] rounded-full" />
											<Skeleton className="h-3 flex-1" />
										</div>
									</SidebarMenuItem>
								</>
							) : activeProjects.length === 0 ? (
								<SidebarMenuItem>
									<span className="px-3 text-xs text-muted-foreground">
										No active projects
									</span>
								</SidebarMenuItem>
							) : (
								activeProjects.map((project) => (
									<SidebarMenuItem key={project._id}>
										<SidebarMenuButton
											asChild
											className="h-9 rounded-lg px-3 group"
										>
											<Link
												href={
													`/${workspaceSlug}/projects/${project.slug}` as LinkProps<string>["href"]
												}
											>
												{project.icon ? (
													<span className="text-base leading-none">
														{project.icon}
													</span>
												) : (
													<ProgressCircle
														progress={0}
														color={project.color}
														size={18}
													/>
												)}
												<span className="flex-1 truncate text-sm">
													{project.name}
												</span>
												<span className="opacity-0 group-hover:opacity-100 rounded p-0.5 hover:bg-accent">
													<span className="text-muted-foreground text-lg">
														&#xB7;&#xB7;&#xB7;
													</span>
												</span>
											</Link>
										</SidebarMenuButton>
									</SidebarMenuItem>
								))
							)}
						</SidebarMenu>
					</SidebarGroupContent>
				</SidebarGroup>
			</SidebarContent>

			<SidebarFooter className="border-t border-border/40 p-2">
				<SidebarMenu>
					{footerItems.map((item) => (
						<SidebarMenuItem key={item.id}>
							<SidebarMenuButton
								className="h-9 rounded-lg px-3 text-muted-foreground"
								onClick={() => {
									if (item.id === "settings") {
										router.push(`/${workspaceSlug}/settings`);
									} else if (item.id === "help") {
										router.push("/docs" as Parameters<typeof router.push>[0]);
									}
								}}
							>
								{(() => {
									const Icon = footerItemIcons[item.id];
									return Icon ? <Icon className="h-[18px] w-[18px]" /> : null;
								})()}
								<span>{item.label}</span>
							</SidebarMenuButton>
						</SidebarMenuItem>
					))}
				</SidebarMenu>

				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<button
							type="button"
							className="mt-2 flex w-full items-center gap-3 rounded-lg p-2 text-left hover:bg-accent cursor-pointer"
						>
							<Avatar className="h-8 w-8">
								<AvatarImage src={user?.avatarUrl || user?.image || ""} />
								<AvatarFallback>{userInitials}</AvatarFallback>
							</Avatar>
							<div className="flex flex-1 flex-col">
								<span className="text-sm font-medium">{userName}</span>
								<span className="text-xs text-muted-foreground">
									{userEmail}
								</span>
							</div>
							<CaretRight className="h-4 w-4 text-muted-foreground" />
						</button>
					</DropdownMenuTrigger>
					<DropdownMenuContent side="right" align="end" className="w-40">
						<DropdownMenuItem
							className="cursor-pointer text-destructive focus:text-destructive"
							onSelect={handleSignOut}
						>
							<SignOut className="h-4 w-4" />
							Sign out
						</DropdownMenuItem>
					</DropdownMenuContent>
				</DropdownMenu>
			</SidebarFooter>
		</Sidebar>
	);
}
