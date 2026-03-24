"use client";

import {
	Archive,
	CaretRight,
	ChartBar,
	ChatCircleText,
	CheckSquare,
	FileText,
	Folder,
	FolderOpen,
	MagnifyingGlass,
	PenNib,
	Star,
	Timer,
	Tray,
	Users,
} from "@phosphor-icons/react/dist/ssr";
import { useMutation, useQuery } from "convex/react";
import { Plus } from "lucide-react";
import Link, { type LinkProps } from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
	type KeyboardEvent as ReactKeyboardEvent,
	useCallback,
	useRef,
	useState,
} from "react";
import { toast } from "sonner";
import { useIssueCreate } from "@/components/issues/IssueCreateContext";
import { ProgressCircle } from "@/components/progress-circle";
import { ProjectQuickCreateModal } from "@/components/projects/ProjectQuickCreateModal";
import { useWorkspace } from "@/components/providers/workspace-context";
import { useCurrentUser } from "@/components/providers/workspace-data-context";
import { UserFooterMenu } from "@/components/shared/user-footer-menu";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
	Sidebar,
	SidebarContent,
	SidebarGroup,
	SidebarGroupContent,
	SidebarHeader,
	SidebarMenu,
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
import type { Id } from "../../convex/_generated/dataModel";

// ── Types ────────────────────────────────────────────────────────────────────

type NavItemId =
	| "chat"
	| "inbox"
	| "my-tasks"
	| "projects"
	| "docs"
	| "boards"
	| "clients"
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
	{ id: "performance", label: "Performance" },
];

type FavoriteItem = {
	_id: string;
	entityType: string;
	entityId: string;
	name: string;
	icon?: string;
};

type SidebarSprintItem = {
	_id: string;
	name: string;
	status: string;
	icon?: string;
	folderId?: string;
	issueCount: number;
	completedCount: number;
};

type SidebarSprintFolder = {
	_id: string;
	name: string;
	icon?: string;
	sprints: SidebarSprintItem[];
};

type SidebarProjectItem = {
	_id: string;
	name: string;
	slug: string;
	icon?: string;
	color: string;
	status: string;
	sprintFolders: SidebarSprintFolder[];
	looseSprints: SidebarSprintItem[];
	backlogCount: number;
};

// ── Main component ──────────────────────────────────────────────────────────

export function AppSidebar() {
	const pathname = usePathname();
	const router = useRouter();
	const { workspaceId, workspaceSlug } = useWorkspace();
	const user = useCurrentUser();
	const { sections, toggle } = useSidebarSections({
		initialSections: user?.sidebarSections,
	});
	const { openQuickCreate } = useIssueCreate();

	const sidebarProjects = useQuery(api.projects.listSidebarTree, {
		workspaceId,
	});

	// Expand/collapse state
	const [expandedProjects, setExpandedProjects] = useState<Set<string>>(
		new Set(),
	);
	const [expandedFolders, setExpandedFolders] = useState<Set<string>>(
		new Set(),
	);
	const toggleProject = useCallback((id: string) => {
		setExpandedProjects((prev) => {
			const next = new Set(prev);
			next.has(id) ? next.delete(id) : next.add(id);
			return next;
		});
	}, []);
	const toggleFolder = useCallback((id: string) => {
		setExpandedFolders((prev) => {
			const next = new Set(prev);
			next.has(id) ? next.delete(id) : next.add(id);
			return next;
		});
	}, []);

	// Mutations
	const createDocument = useMutation(api.documents.create);
	const createWhiteboard = useMutation(api.whiteboards.create);
	const createSprint = useMutation(api.sprints.create);
	const createSprintFolder = useMutation(api.sprintFolders.create);

	const handleCreateDoc = useCallback(
		async (projectId?: Id<"projects">) => {
			try {
				const docId = await createDocument({
					workspaceId,
					title: "Untitled",
					projectId,
				});
				router.push(`/${workspaceSlug}/docs/${docId}`);
			} catch {
				toast.error("Failed to create document");
			}
		},
		[createDocument, workspaceId, workspaceSlug, router],
	);

	const handleCreateBoard = useCallback(
		async (projectId?: Id<"projects">) => {
			try {
				const boardId = await createWhiteboard({
					workspaceId,
					title: "Untitled",
					projectId,
				});
				router.push(`/${workspaceSlug}/boards/${boardId}`);
			} catch {
				toast.error("Failed to create board");
			}
		},
		[createWhiteboard, workspaceId, workspaceSlug, router],
	);

	// Inline create state — supports sprint or folder creation
	const [inlineCreate, setInlineCreate] = useState<{
		type: "sprint" | "folder";
		projectId: string;
		folderId?: string;
	} | null>(null);
	const [inlineName, setInlineName] = useState("");
	const inlineInputRef = useRef<HTMLInputElement>(null);

	const startInlineCreate = useCallback(
		(type: "sprint" | "folder", projectId: string, folderId?: string) => {
			setInlineCreate({ type, projectId, folderId });
			setInlineName("");
			setTimeout(() => inlineInputRef.current?.focus(), 50);
		},
		[],
	);

	const submitInlineCreate = useCallback(async () => {
		if (!inlineCreate) return;
		const name = inlineName.trim();
		if (!name) {
			setInlineCreate(null);
			return;
		}
		try {
			if (inlineCreate.type === "sprint") {
				await createSprint({
					projectId: inlineCreate.projectId as Id<"projects">,
					name,
					folderId: inlineCreate.folderId as Id<"sprintFolders"> | undefined,
				});
				if (inlineCreate.folderId) {
					const fid = inlineCreate.folderId;
					setExpandedFolders((prev) => new Set(prev).add(fid));
				}
				toast.success("Sprint created");
			} else {
				const folderId = await createSprintFolder({
					projectId: inlineCreate.projectId as Id<"projects">,
					name,
				});
				setExpandedFolders((prev) => new Set(prev).add(folderId));
				toast.success("Sprint folder created");
			}
		} catch {
			toast.error(
				`Failed to create ${inlineCreate.type === "sprint" ? "sprint" : "sprint folder"}`,
			);
		}
		setInlineCreate(null);
		setInlineName("");
	}, [inlineCreate, inlineName, createSprint, createSprintFolder]);

	const handleInlineKeyDown = useCallback(
		(e: ReactKeyboardEvent) => {
			if (e.key === "Enter") {
				e.preventDefault();
				void submitInlineCreate();
			} else if (e.key === "Escape") {
				setInlineCreate(null);
			}
		},
		[submitInlineCreate],
	);

	const [showCreateProject, setShowCreateProject] = useState(false);

	const hasFavorites = useQuery(api.favorites.hasAny, { workspaceId });
	const favorites = useQuery(
		api.favorites.list,
		hasFavorites && sections.favorites ? { workspaceId, limit: 50 } : "skip",
	);

	const unreadCount = useQuery(api.notifications.unreadCount, { workspaceId });
	const displayUnreadCount =
		unreadCount !== undefined && unreadCount > 99 ? "99+" : unreadCount;

	const { onlineUsers, isAnyoneOnline } = useWorkspacePresence(
		workspaceId,
		user?._id,
	);

	const showFavoritesSection =
		hasFavorites === true || (favorites !== undefined && favorites.length > 0);

	const getHrefForNavItem = (id: NavItemId): LinkProps<string>["href"] => {
		const base = `/${workspaceSlug}`;
		const map: Record<NavItemId, string> = {
			chat: `${base}/chat`,
			inbox: `${base}/inbox`,
			"my-tasks": `${base}/tasks`,
			projects: `${base}/projects`,
			docs: `${base}/docs`,
			boards: `${base}/boards`,
			clients: `${base}/clients`,
			performance: `${base}/analytics`,
		};
		return (map[id] ?? "#") as LinkProps<string>["href"];
	};

	const isItemActive = (id: NavItemId): boolean => {
		const base = `/${workspaceSlug}`;
		if (id === "projects")
			return (
				pathname === `${base}/projects` ||
				pathname.startsWith(`${base}/projects/`)
			);
		const map: Record<string, string> = {
			chat: `${base}/chat`,
			"my-tasks": `${base}/tasks`,
			inbox: `${base}/inbox`,
			docs: `${base}/docs`,
			boards: `${base}/boards`,
			clients: `${base}/clients`,
			performance: `${base}/analytics`,
		};
		return map[id] ? pathname.startsWith(map[id]) : false;
	};

	return (
		<Sidebar
			collapsible="icon"
			className="border-border/40 border-r-0 shadow-none border-none overflow-x-hidden"
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

			<SidebarContent className="px-0 gap-0 overflow-x-hidden">
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
											<Link href={href} prefetch={false}>
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
												<span className="absolute right-2 top-1/2 -translate-y-1/2 bg-muted text-muted-foreground rounded-full px-2 text-[10px]">
													{displayUnreadCount}
												</span>
											)}
									</SidebarMenuItem>
								);
							})}
						</SidebarMenu>
					</SidebarGroupContent>
				</SidebarGroup>

				<div className="mx-3 border-b border-border/40" />

				{showFavoritesSection && (
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
											{favorites === undefined ? (
												<SidebarMenuItem>
													<div className="flex items-center gap-3 px-3 h-9">
														<Skeleton className="h-[18px] w-[18px] rounded-full" />
														<Skeleton className="h-3 flex-1" />
													</div>
												</SidebarMenuItem>
											) : favorites.length === 0 ? (
												<SidebarMenuItem>
													<span className="px-3 text-xs text-muted-foreground">
														No favorites
													</span>
												</SidebarMenuItem>
											) : (
												favorites.map((fav: FavoriteItem) => (
													<FavoriteNavItem
														key={fav._id}
														fav={fav}
														workspaceSlug={workspaceSlug}
													/>
												))
											)}
										</SidebarMenu>
									</SidebarGroupContent>
								</CollapsibleContent>
							</SidebarGroup>
						</Collapsible>
						<div className="mx-3 border-b border-border/40" />
					</>
				)}

				{/* Projects section */}
				<Collapsible
					open={sections.projects}
					onOpenChange={() => toggle("projects")}
				>
					<SidebarGroup>
						<div className="flex items-center group-data-[collapsible=icon]:hidden">
							<CollapsibleTrigger asChild>
								<button
									type="button"
									className="flex flex-1 items-center px-3 py-1 text-xs font-medium text-muted-foreground hover:text-foreground cursor-pointer"
								>
									<CaretRight
										className={cn(
											"mr-1 h-3 w-3 shrink-0 transition-transform duration-200",
											sections.projects && "rotate-90",
										)}
									/>
									Projects
								</button>
							</CollapsibleTrigger>
							<DropdownMenu>
								<DropdownMenuTrigger asChild>
									<button
										type="button"
										className="flex items-center justify-center w-6 h-6 mr-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/80 transition-colors cursor-pointer"
									>
										<Plus className="h-3.5 w-3.5" />
									</button>
								</DropdownMenuTrigger>
								<DropdownMenuContent
									align="start"
									sideOffset={4}
									className="w-56"
								>
									<div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
										Create
									</div>
									<DropdownMenuItem onClick={() => setShowCreateProject(true)}>
										<Folder className="h-4 w-4 text-sienna-500" />
										<div className="flex flex-col">
											<span>Project</span>
											<span className="text-xs text-muted-foreground">
												Track milestones, sprints and more
											</span>
										</div>
									</DropdownMenuItem>
									<DropdownMenuItem onClick={() => openQuickCreate()}>
										<CheckSquare className="h-4 w-4 text-blue-500" />
										<div className="flex flex-col">
											<span>Issue</span>
											<span className="text-xs text-muted-foreground">
												Create a task or bug
											</span>
										</div>
									</DropdownMenuItem>
									<DropdownMenuSeparator />
									<DropdownMenuItem onClick={() => handleCreateDoc()}>
										<FileText className="h-4 w-4 text-yellow-500" />
										<div className="flex flex-col">
											<span>Document</span>
											<span className="text-xs text-muted-foreground">
												Rich text document
											</span>
										</div>
									</DropdownMenuItem>
									<DropdownMenuItem onClick={() => handleCreateBoard()}>
										<PenNib className="h-4 w-4 text-purple-500" />
										<div className="flex flex-col">
											<span>Whiteboard</span>
											<span className="text-xs text-muted-foreground">
												Diagrams and sketches
											</span>
										</div>
									</DropdownMenuItem>
								</DropdownMenuContent>
							</DropdownMenu>
						</div>
						<CollapsibleContent>
							<SidebarGroupContent>
								<SidebarMenu>
									{sidebarProjects === undefined ? (
										[1, 2, 3].map((i) => (
											<SidebarMenuItem key={i}>
												<div className="flex items-center gap-3 px-3 h-9">
													<Skeleton className="h-[18px] w-[18px] rounded-full" />
													<Skeleton className="h-3 flex-1" />
												</div>
											</SidebarMenuItem>
										))
									) : sidebarProjects.length === 0 ? (
										<SidebarMenuItem>
											<span className="px-3 text-xs text-muted-foreground">
												No active projects
											</span>
										</SidebarMenuItem>
									) : (
										sidebarProjects.map((project: SidebarProjectItem) => (
											<ProjectTreeItem
												key={project._id}
												project={project}
												workspaceSlug={workspaceSlug}
												pathname={pathname}
												isExpanded={expandedProjects.has(project._id)}
												expandedFolders={expandedFolders}
												onToggleProject={toggleProject}
												onToggleFolder={toggleFolder}
												onCreateIssue={(projectId) =>
													openQuickCreate({
														projectId,
													})
												}
												onCreateDoc={handleCreateDoc}
												onCreateBoard={handleCreateBoard}
												onStartInlineCreate={startInlineCreate}
												inlineCreate={inlineCreate}
												inlineName={inlineName}
												onInlineNameChange={setInlineName}
												onInlineKeyDown={handleInlineKeyDown}
												onInlineBlur={submitInlineCreate}
												inlineInputRef={inlineInputRef}
											/>
										))
									)}
								</SidebarMenu>
							</SidebarGroupContent>
						</CollapsibleContent>
					</SidebarGroup>
				</Collapsible>
			</SidebarContent>

			<UserFooterMenu settingsHref={`/${workspaceSlug}/settings`} />

			<ProjectQuickCreateModal
				open={showCreateProject}
				onClose={() => setShowCreateProject(false)}
			/>
		</Sidebar>
	);
}

// ── Favorite nav item ────────────────────────────────────────────────────────

function FavoriteNavItem({
	fav,
	workspaceSlug,
}: {
	fav: FavoriteItem;
	workspaceSlug: string;
}) {
	const base = `/${workspaceSlug}`;
	const hrefMap: Record<string, string> = {
		project: `${base}/projects/${fav.entityId}`,
		client: `${base}/clients/${fav.entityId}`,
		document: `${base}/docs/${fav.entityId}`,
		whiteboard: `${base}/boards/${fav.entityId}`,
	};
	const href = (hrefMap[fav.entityType] ??
		`${base}/projects/${fav.entityId}`) as LinkProps<string>["href"];
	const getIcon = () => {
		if (fav.icon) {
			return (
				<span className="text-[14px] leading-none flex items-center justify-center w-[18px] h-[18px]">
					{fav.icon}
				</span>
			);
		}
		switch (fav.entityType) {
			case "document":
				return <FileText className="h-[18px] w-[18px] text-muted-foreground" />;
			case "whiteboard":
				return <PenNib className="h-[18px] w-[18px] text-muted-foreground" />;
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
		<SidebarMenuItem>
			<SidebarMenuButton
				asChild
				tooltip={fav.name}
				className="h-9 rounded-lg px-3 group"
			>
				<Link href={href} prefetch={false}>
					{getIcon()}
					<span className="flex-1 truncate text-sm">{fav.name}</span>
				</Link>
			</SidebarMenuButton>
		</SidebarMenuItem>
	);
}

// ── Project tree item ────────────────────────────────────────────────────────

function ProjectTreeItem({
	project,
	workspaceSlug,
	pathname,
	isExpanded,
	expandedFolders,
	onToggleProject,
	onToggleFolder,
	onCreateIssue,
	onCreateDoc,
	onCreateBoard,
	onStartInlineCreate,
	inlineCreate,
	inlineName,
	onInlineNameChange,
	onInlineKeyDown,
	onInlineBlur,
	inlineInputRef,
}: {
	project: SidebarProjectItem;
	workspaceSlug: string;
	pathname: string;
	isExpanded: boolean;
	expandedFolders: Set<string>;
	onToggleProject: (id: string) => void;
	onToggleFolder: (id: string) => void;
	onCreateIssue: (projectId: string) => void;
	onCreateDoc: (projectId?: Id<"projects">) => void;
	onCreateBoard: (projectId?: Id<"projects">) => void;
	onStartInlineCreate: (
		type: "sprint" | "folder",
		projectId: string,
		folderId?: string,
	) => void;
	inlineCreate: {
		type: "sprint" | "folder";
		projectId: string;
		folderId?: string;
	} | null;
	inlineName: string;
	onInlineNameChange: (v: string) => void;
	onInlineKeyDown: (e: ReactKeyboardEvent) => void;
	onInlineBlur: () => void;
	inlineInputRef: React.RefObject<HTMLInputElement | null>;
}) {
	const projectHref =
		`/${workspaceSlug}/projects/${project.slug}` as LinkProps<string>["href"];
	const isProjectActive = pathname.startsWith(
		`/${workspaceSlug}/projects/${project.slug}`,
	);
	const _hasContent =
		project.sprintFolders.length > 0 ||
		project.looseSprints.length > 0 ||
		project.backlogCount > 0;

	return (
		<SidebarMenuItem>
			{/* Project row */}
			<div className="flex items-center group/project min-w-0">
				<button
					type="button"
					onClick={() => onToggleProject(project._id)}
					className="flex items-center justify-center w-5 h-8 shrink-0 text-muted-foreground hover:text-foreground cursor-pointer"
				>
					<CaretRight
						className={cn(
							"h-3 w-3 transition-transform duration-200",
							isExpanded && "rotate-90",
						)}
					/>
				</button>
				<SidebarMenuButton
					asChild
					isActive={
						isProjectActive &&
						!pathname.includes("/sprints/") &&
						!pathname.includes("/backlog")
					}
					tooltip={project.name}
					className="h-8 rounded-lg px-2 flex-1 min-w-0"
				>
					<Link href={projectHref} prefetch={false}>
						{project.icon ? (
							<span className="text-[14px] leading-none flex items-center justify-center w-[16px] h-[16px] shrink-0">
								{project.icon}
							</span>
						) : (
							<ProgressCircle progress={0} color={project.color} size={16} />
						)}
						<span className="flex-1 truncate text-sm">{project.name}</span>
					</Link>
				</SidebarMenuButton>

				{/* Per-project + menu */}
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<button
							type="button"
							className="flex items-center justify-center w-5 h-5 mr-1 rounded text-muted-foreground opacity-0 group-hover/project:opacity-100 hover:text-foreground hover:bg-muted/80 transition-all cursor-pointer shrink-0"
						>
							<Plus className="h-3 w-3" />
						</button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="start" sideOffset={4} className="w-48">
						<div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
							Add to {project.name}
						</div>
						<DropdownMenuItem onClick={() => onCreateIssue(project._id)}>
							<CheckSquare className="h-4 w-4 text-blue-500" />
							Issue
						</DropdownMenuItem>
						<DropdownMenuItem
							onClick={() => onStartInlineCreate("sprint", project._id)}
						>
							<Timer className="h-4 w-4 text-green-500" />
							Sprint
						</DropdownMenuItem>
						<DropdownMenuItem
							onClick={() => onStartInlineCreate("folder", project._id)}
						>
							<FolderOpen className="h-4 w-4 text-orange-500" />
							Sprint folder
						</DropdownMenuItem>
						<DropdownMenuSeparator />
						<DropdownMenuItem
							onClick={() => onCreateDoc(project._id as Id<"projects">)}
						>
							<FileText className="h-4 w-4 text-yellow-500" />
							Document
						</DropdownMenuItem>
						<DropdownMenuItem
							onClick={() => onCreateBoard(project._id as Id<"projects">)}
						>
							<PenNib className="h-4 w-4 text-purple-500" />
							Whiteboard
						</DropdownMenuItem>
					</DropdownMenuContent>
				</DropdownMenu>
			</div>

			{/* Expanded children */}
			{isExpanded && (
				<div className="ml-5 border-l border-border/40 pl-1 overflow-hidden">
					{/* Sprint folders */}
					{project.sprintFolders.map((folder) => (
						<SprintFolderItem
							key={folder._id}
							folder={folder}
							projectId={project._id}
							projectSlug={project.slug}
							workspaceSlug={workspaceSlug}
							pathname={pathname}
							isExpanded={expandedFolders.has(folder._id)}
							onToggle={() => onToggleFolder(folder._id)}
							onStartInlineCreate={onStartInlineCreate}
							inlineCreate={inlineCreate}
							inlineName={inlineName}
							onInlineNameChange={onInlineNameChange}
							onInlineKeyDown={onInlineKeyDown}
							onInlineBlur={onInlineBlur}
							inlineInputRef={inlineInputRef}
						/>
					))}

					{/* Loose sprints (not in any folder) */}
					{project.looseSprints.map((sprint) => (
						<SprintNavItem
							key={sprint._id}
							sprint={sprint}
							projectSlug={project.slug}
							workspaceSlug={workspaceSlug}
							pathname={pathname}
						/>
					))}

					{/* Inline create (sprint or folder at project level) */}
					{inlineCreate &&
						inlineCreate.projectId === project._id &&
						!inlineCreate.folderId && (
							<div className="px-2 py-1">
								<input
									ref={inlineInputRef}
									type="text"
									value={inlineName}
									onChange={(e) => onInlineNameChange(e.target.value)}
									onKeyDown={onInlineKeyDown}
									onBlur={onInlineBlur}
									placeholder={
										inlineCreate.type === "folder"
											? "Folder name..."
											: "Sprint name..."
									}
									className="w-full h-6 text-xs bg-transparent border-b border-border focus:border-foreground outline-none placeholder:text-muted-foreground/50"
								/>
							</div>
						)}

					{/* Backlog */}
					<SidebarMenu>
						<SidebarMenuItem>
							<SidebarMenuButton
								asChild
								isActive={pathname.includes(
									`/projects/${project.slug}/backlog`,
								)}
								tooltip="Backlog"
								className="h-7 rounded-md px-2 text-muted-foreground"
							>
								<Link
									href={
										`/${workspaceSlug}/projects/${project.slug}/backlog` as LinkProps<string>["href"]
									}
									prefetch={false}
								>
									<Archive className="h-[14px] w-[14px] shrink-0" />
									<span className="flex-1 truncate text-xs">Backlog</span>
									{project.backlogCount > 0 && (
										<span className="text-[10px] text-muted-foreground/60 tabular-nums shrink-0">
											{project.backlogCount}
										</span>
									)}
								</Link>
							</SidebarMenuButton>
						</SidebarMenuItem>
					</SidebarMenu>
				</div>
			)}
		</SidebarMenuItem>
	);
}

// ── Sprint folder item ───────────────────────────────────────────────────────

function SprintFolderItem({
	folder,
	projectId,
	projectSlug,
	workspaceSlug,
	pathname,
	isExpanded,
	onToggle,
	onStartInlineCreate,
	inlineCreate,
	inlineName,
	onInlineNameChange,
	onInlineKeyDown,
	onInlineBlur,
	inlineInputRef,
}: {
	folder: SidebarSprintFolder;
	projectId: string;
	projectSlug: string;
	workspaceSlug: string;
	pathname: string;
	isExpanded: boolean;
	onToggle: () => void;
	onStartInlineCreate: (
		type: "sprint" | "folder",
		projectId: string,
		folderId?: string,
	) => void;
	inlineCreate: {
		type: "sprint" | "folder";
		projectId: string;
		folderId?: string;
	} | null;
	inlineName: string;
	onInlineNameChange: (v: string) => void;
	onInlineKeyDown: (e: ReactKeyboardEvent) => void;
	onInlineBlur: () => void;
	inlineInputRef: React.RefObject<HTMLInputElement | null>;
}) {
	const totalIssues = folder.sprints.reduce((sum, s) => sum + s.issueCount, 0);

	return (
		<div>
			<div className="flex items-center group/folder min-w-0">
				<button
					type="button"
					onClick={onToggle}
					className="flex w-full items-center gap-1.5 h-7 px-2 text-xs font-medium text-muted-foreground hover:text-foreground rounded-md cursor-pointer min-w-0"
				>
					<CaretRight
						className={cn(
							"h-2.5 w-2.5 shrink-0 transition-transform duration-200",
							isExpanded && "rotate-90",
						)}
					/>
					<Timer className="h-3.5 w-3.5 text-green-500 shrink-0" />
					<span className="flex-1 truncate">{folder.name}</span>
					{totalIssues > 0 && (
						<span className="text-[10px] text-muted-foreground/60 tabular-nums shrink-0">
							{totalIssues}
						</span>
					)}
				</button>
				<button
					type="button"
					onClick={() => onStartInlineCreate("sprint", projectId, folder._id)}
					className="flex items-center justify-center w-5 h-5 mr-1 rounded text-muted-foreground opacity-0 group-hover/folder:opacity-100 hover:text-foreground hover:bg-muted/80 transition-all cursor-pointer shrink-0"
				>
					<Plus className="h-2.5 w-2.5" />
				</button>
			</div>

			{isExpanded && (
				<div className="ml-3 border-l border-border/30 pl-1">
					<SidebarMenu>
						{folder.sprints.map((sprint) => (
							<SprintNavItem
								key={sprint._id}
								sprint={sprint}
								projectSlug={projectSlug}
								workspaceSlug={workspaceSlug}
								pathname={pathname}
							/>
						))}

						{/* Inline sprint create within folder */}
						{inlineCreate && inlineCreate.folderId === folder._id && (
							<SidebarMenuItem>
								<div className="px-2 py-1">
									<input
										ref={inlineInputRef}
										type="text"
										value={inlineName}
										onChange={(e) => onInlineNameChange(e.target.value)}
										onKeyDown={onInlineKeyDown}
										onBlur={onInlineBlur}
										placeholder="Sprint name..."
										className="w-full h-6 text-xs bg-transparent border-b border-border focus:border-foreground outline-none placeholder:text-muted-foreground/50"
									/>
								</div>
							</SidebarMenuItem>
						)}

						{!(inlineCreate && inlineCreate.folderId === folder._id) && (
							<SidebarMenuItem>
								<button
									type="button"
									onClick={() =>
										onStartInlineCreate("sprint", projectId, folder._id)
									}
									className="flex w-full items-center gap-1.5 h-7 px-2 text-xs text-muted-foreground/50 hover:text-muted-foreground rounded-md cursor-pointer"
								>
									<Plus className="h-3 w-3" />
									<span>Create sprint</span>
								</button>
							</SidebarMenuItem>
						)}
					</SidebarMenu>
				</div>
			)}
		</div>
	);
}

// ── Sprint nav item ─────────────────────────────────────────────────────────

function SprintNavItem({
	sprint,
	projectSlug,
	workspaceSlug,
	pathname,
}: {
	sprint: SidebarSprintItem;
	projectSlug: string;
	workspaceSlug: string;
	pathname: string;
}) {
	const sprintHref =
		`/${workspaceSlug}/projects/${projectSlug}/sprints/${sprint._id}` as LinkProps<string>["href"];
	const isActive = pathname.includes(sprint._id);
	const pct =
		sprint.issueCount > 0
			? (sprint.completedCount / sprint.issueCount) * 100
			: 0;

	return (
		<SidebarMenu>
			<SidebarMenuItem>
				<SidebarMenuButton
					asChild
					isActive={isActive}
					tooltip={`${sprint.name}${sprint.issueCount > 0 ? ` — ${sprint.completedCount}/${sprint.issueCount}` : ""}`}
					className="h-7 rounded-md px-2 text-muted-foreground"
				>
					<Link href={sprintHref} prefetch={false}>
						{sprint.icon ? (
							<span className="text-[11px] leading-none flex items-center justify-center w-[14px] h-[14px] shrink-0">
								{sprint.icon}
							</span>
						) : (
							<SprintProgressRing
								percentage={pct}
								isActive={sprint.status === "active"}
								size={14}
							/>
						)}
						<span className="flex-1 truncate text-xs">{sprint.name}</span>
						{sprint.issueCount > 0 && (
							<span className="text-[10px] text-muted-foreground/60 tabular-nums shrink-0">
								{sprint.issueCount}
							</span>
						)}
					</Link>
				</SidebarMenuButton>
			</SidebarMenuItem>
		</SidebarMenu>
	);
}

// ── Sprint progress ring ─────────────────────────────────────────────────────

function SprintProgressRing({
	percentage,
	isActive,
	size = 14,
}: {
	percentage: number;
	isActive: boolean;
	size?: number;
}) {
	const strokeWidth = 2;
	const radius = (size - strokeWidth) / 2;
	const circumference = 2 * Math.PI * radius;
	const offset = circumference - (percentage / 100) * circumference;
	const color = isActive ? "#22c55e" : "#737373";

	return (
		<svg
			aria-hidden="true"
			width={size}
			height={size}
			viewBox={`0 0 ${size} ${size}`}
			className="shrink-0 -rotate-90"
		>
			<circle
				cx={size / 2}
				cy={size / 2}
				r={radius}
				fill="none"
				stroke="currentColor"
				strokeWidth={strokeWidth}
				className="text-muted-foreground/20"
			/>
			{percentage > 0 && (
				<circle
					cx={size / 2}
					cy={size / 2}
					r={radius}
					fill="none"
					stroke={color}
					strokeWidth={strokeWidth}
					strokeDasharray={circumference}
					strokeDashoffset={offset}
					strokeLinecap="round"
				/>
			)}
		</svg>
	);
}
