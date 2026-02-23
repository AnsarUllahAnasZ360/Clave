"use client";

import {
	Buildings,
	CaretRight,
	ChartBar,
	ChatCircleText,
	CheckSquare,
	FileText,
	Folder,
	MagnifyingGlass,
	PenNib,
	Star,
	Tray,
	Users,
} from "@phosphor-icons/react/dist/ssr";
import { useQuery } from "convex/react";
import Link, { type LinkProps } from "next/link";
import { usePathname } from "next/navigation";
import { ProgressCircle } from "@/components/progress-circle";
import { useWorkspace } from "@/components/providers/workspace-context";
import { useCurrentUser } from "@/components/providers/workspace-data-context";
import { UserFooterMenu } from "@/components/shared/user-footer-menu";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import {
	Sidebar,
	SidebarContent,
	SidebarGroup,
	SidebarGroupContent,
	SidebarHeader,
	SidebarMenu,
	SidebarMenuBadge,
	SidebarMenuButton,
	SidebarMenuItem,
} from "@/components/ui/sidebar";
import { Skeleton } from "@/components/ui/skeleton";
import { WorkspacePresenceIndicator } from "@/components/workspace/WorkspacePresenceIndicator";
import { WorkspaceSelector } from "@/components/workspace/workspace-selector";
import { useSidebarSections } from "@/hooks/use-sidebar-sections";
import { useWorkspacePresence } from "@/hooks/use-workspace-presence";
import { cn } from "@/lib/utils";
import { api } from "../../convex/_generated/api";

type NavItemId =
	| "chat"
	| "inbox"
	| "my-tasks"
	| "projects"
	| "docs"
	| "boards"
	| "clients"
	| "organizations"
	| "performance";
const navItemIcons: Record<
	NavItemId,
	React.ComponentType<{ className?: string }>
> = {
	chat: ChatCircleText,
	inbox: Tray,
	"my-tasks": CheckSquare,
	projects: Folder,
	docs: FileText,
	boards: PenNib,
	clients: Users,
	organizations: Buildings,
	performance: ChartBar,
};

const navItems: { id: NavItemId; label: string }[] = [
	{ id: "chat", label: "Chat" },
	{ id: "inbox", label: "Inbox" },
	{ id: "my-tasks", label: "My issues" },
	{ id: "projects", label: "Projects" },
	{ id: "docs", label: "Docs" },
	{ id: "boards", label: "Boards" },
	{ id: "clients", label: "Clients" },
	{ id: "organizations", label: "Organizations" },
	{ id: "performance", label: "Performance" },
];

type RecentItem = {
	_id: string;
	entityType: string;
	entityId: string;
	entitySlug?: string;
	name: string;
	icon?: string;
};

type FavoriteItem = {
	_id: string;
	entityType: string;
	entityId: string;
	name: string;
	icon?: string;
};

type ActiveProjectItem = {
	_id: string;
	name: string;
	slug: string;
	icon?: string;
	color: string;
};

export function AppSidebar() {
	const pathname = usePathname();
	const { workspaceId, workspaceSlug, orgSlug } = useWorkspace();
	const user = useCurrentUser();
	const activeProjects = useQuery(api.projects.listActive, { workspaceId });
	const favorites = useQuery(api.favorites.list, { workspaceId });

	const unreadCount = useQuery(api.notifications.unreadCount, { workspaceId });
	const displayUnreadCount =
		unreadCount !== undefined && unreadCount > 99 ? "99+" : unreadCount;

	const { onlineUsers, isAnyoneOnline } = useWorkspacePresence(
		workspaceId,
		user?._id,
	);

	const recents = useQuery(api.recents.list, { workspaceId });

	const { sections, toggle } = useSidebarSections({
		initialSections: user?.sidebarSections,
	});

	const getHrefForNavItem = (id: NavItemId): LinkProps<string>["href"] => {
		const base = `/${orgSlug}/${workspaceSlug}`;
		if (id === "chat") return `${base}/chat` as LinkProps<string>["href"];
		if (id === "my-tasks") return `${base}/tasks` as LinkProps<string>["href"];
		if (id === "projects")
			return `${base}/projects` as LinkProps<string>["href"];
		if (id === "inbox") return `${base}/inbox` as LinkProps<string>["href"];
		if (id === "docs") return `${base}/docs` as LinkProps<string>["href"];
		if (id === "boards") return `${base}/boards` as LinkProps<string>["href"];
		if (id === "clients") return `${base}/clients` as LinkProps<string>["href"];
		if (id === "organizations")
			return "/organizations" as LinkProps<string>["href"];
		if (id === "performance")
			return `${base}/analytics` as LinkProps<string>["href"];
		return "#" as LinkProps<string>["href"];
	};

	const isItemActive = (id: NavItemId): boolean => {
		const base = `/${orgSlug}/${workspaceSlug}`;
		if (id === "chat") {
			return pathname.startsWith(`${base}/chat`);
		}
		if (id === "projects") {
			return (
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
		if (id === "organizations") {
			return pathname.startsWith("/organizations");
		}
		if (id === "performance") {
			return pathname.startsWith(`${base}/analytics`);
		}
		return false;
	};

	return (
		<Sidebar
			collapsible="icon"
			className="border-border/40 border-r-0 shadow-none border-none"
		>
			<SidebarHeader className="p-4 group-data-[collapsible=icon]:px-2 group-data-[collapsible=icon]:pt-7 group-data-[collapsible=icon]:pb-2">
				<div className="flex items-center gap-2 group-data-[collapsible=icon]:justify-center">
					<div className="flex-1 min-w-0 group-data-[collapsible=icon]:flex-none">
						<WorkspaceSelector />
					</div>
					<div className="group-data-[collapsible=icon]:hidden">
						<WorkspacePresenceIndicator
							onlineUsers={onlineUsers}
							isAnyoneOnline={isAnyoneOnline}
						/>
					</div>
				</div>
			</SidebarHeader>

			<div className="mx-3 border-b border-border/40" />

			<SidebarContent className="px-0 gap-0">
				<SidebarGroup>
					<div className="relative px-0 py-0 group-data-[collapsible=icon]:hidden">
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
											tooltip={item.label}
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

				<div className="mx-3 border-b border-border/40" />

				<Collapsible
					open={sections.recents}
					onOpenChange={() => toggle("recents")}
				>
					<SidebarGroup>
						<CollapsibleTrigger asChild>
							<button
								type="button"
								className="flex w-full items-center px-3 py-1 text-xs font-medium text-muted-foreground hover:text-foreground group-data-[collapsible=icon]:hidden cursor-pointer"
							>
								<CaretRight
									className={cn(
										"mr-1 h-3 w-3 shrink-0 transition-transform duration-200",
										sections.recents && "rotate-90",
									)}
								/>
								Recents
							</button>
						</CollapsibleTrigger>
						<CollapsibleContent>
							<SidebarGroupContent>
								<SidebarMenu>
									{recents === undefined ? (
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
									) : recents.length === 0 ? (
										<SidebarMenuItem>
											<span className="px-3 text-xs text-muted-foreground">
												No recent items
											</span>
										</SidebarMenuItem>
									) : (
										recents.map((recent: RecentItem) => {
											const getRecentHref = () => {
												const base = `/${orgSlug}/${workspaceSlug}`;
												switch (recent.entityType) {
													case "document":
														return `${base}/docs/${recent.entityId}`;
													case "whiteboard":
														return `${base}/boards/${recent.entityId}`;
													case "project":
														if (recent.entitySlug) {
															return `${base}/projects/${recent.entitySlug}`;
														}
														return `${base}/projects/${recent.entityId}`;
													case "issue":
														return `${base}/issues/${recent.entityId}`;
													case "aiChat":
														return `${base}/chat/${recent.entityId}`;
													case "client":
														return `${base}/clients/${recent.entityId}`;
													default:
														return `${base}/projects`;
												}
											};
											const getRecentIcon = () => {
												if (recent.icon) {
													return (
														<span className="text-[14px] leading-none flex items-center justify-center w-[18px] h-[18px]">
															{recent.icon}
														</span>
													);
												}
												switch (recent.entityType) {
													case "document":
														return (
															<FileText className="h-[18px] w-[18px] text-muted-foreground" />
														);
													case "whiteboard":
														return (
															<PenNib className="h-[18px] w-[18px] text-muted-foreground" />
														);
													case "project":
														return (
															<Folder className="h-[18px] w-[18px] text-muted-foreground" />
														);
													case "issue":
														return (
															<CheckSquare className="h-[18px] w-[18px] text-muted-foreground" />
														);
													case "aiChat":
														return (
															<ChatCircleText className="h-[18px] w-[18px] text-muted-foreground" />
														);
													case "client":
														return (
															<Users className="h-[18px] w-[18px] text-muted-foreground" />
														);
													default:
														return (
															<FileText className="h-[18px] w-[18px] text-muted-foreground" />
														);
												}
											};
											return (
												<SidebarMenuItem key={recent._id}>
													<SidebarMenuButton
														asChild
														tooltip={recent.name}
														className="h-9 rounded-lg px-3 group"
													>
														<Link
															href={
																getRecentHref() as LinkProps<string>["href"]
															}
														>
															{getRecentIcon()}
															<span className="flex-1 truncate text-sm">
																{recent.name}
															</span>
														</Link>
													</SidebarMenuButton>
												</SidebarMenuItem>
											);
										})
									)}
								</SidebarMenu>
							</SidebarGroupContent>
						</CollapsibleContent>
					</SidebarGroup>
				</Collapsible>

				<div className="mx-3 border-b border-border/40" />

				{favorites !== undefined && favorites.length > 0 && (
					<>
						<Collapsible
							open={sections.favorites}
							onOpenChange={() => toggle("favorites")}
						>
							<SidebarGroup>
								<CollapsibleTrigger asChild>
									<button
										type="button"
										className="flex w-full items-center px-3 py-1 text-xs font-medium text-muted-foreground hover:text-foreground group-data-[collapsible=icon]:hidden cursor-pointer"
									>
										<CaretRight
											className={cn(
												"mr-1 h-3 w-3 shrink-0 transition-transform duration-200",
												sections.favorites && "rotate-90",
											)}
										/>
										Favorites
									</button>
								</CollapsibleTrigger>
								<CollapsibleContent>
									<SidebarGroupContent>
										<SidebarMenu>
											{favorites.map((fav: FavoriteItem) => {
												const getFavHref = () => {
													const base = `/${orgSlug}/${workspaceSlug}`;
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
															return `${base}/projects/${fav.entityId}`;
													}
												};
												const getFavIcon = () => {
													if (fav.icon) {
														return (
															<span className="text-[14px] leading-none flex items-center justify-center w-[18px] h-[18px]">
																{fav.icon}
															</span>
														);
													}
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
															tooltip={fav.name}
															className="h-9 rounded-lg px-3 group"
														>
															<Link
																href={getFavHref() as LinkProps<string>["href"]}
															>
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
								</CollapsibleContent>
							</SidebarGroup>
						</Collapsible>

						<div className="mx-3 border-b border-border/40" />
					</>
				)}

				<Collapsible
					open={sections.projects}
					onOpenChange={() => toggle("projects")}
				>
					<SidebarGroup>
						<CollapsibleTrigger asChild>
							<button
								type="button"
								className="flex w-full items-center px-3 py-1 text-xs font-medium text-muted-foreground hover:text-foreground group-data-[collapsible=icon]:hidden cursor-pointer"
							>
								<CaretRight
									className={cn(
										"mr-1 h-3 w-3 shrink-0 transition-transform duration-200",
										sections.projects && "rotate-90",
									)}
								/>
								Active Projects
							</button>
						</CollapsibleTrigger>
						<CollapsibleContent>
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
										activeProjects.map((project: ActiveProjectItem) => (
											<SidebarMenuItem key={project._id}>
												<SidebarMenuButton
													asChild
													tooltip={project.name}
													className="h-9 rounded-lg px-3 group"
												>
													<Link
														href={
															`/${orgSlug}/${workspaceSlug}/projects/${project.slug}` as LinkProps<string>["href"]
														}
													>
														{project.icon ? (
															<span className="text-[14px] leading-none flex items-center justify-center w-[18px] h-[18px]">
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
						</CollapsibleContent>
					</SidebarGroup>
				</Collapsible>
			</SidebarContent>

			<UserFooterMenu settingsHref={`/${orgSlug}/${workspaceSlug}/settings`} />
		</Sidebar>
	);
}
