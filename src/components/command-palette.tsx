"use client";

import {
	CheckSquare,
	FileText,
	Folder,
	Gear,
	NoteBlank,
	PenNib,
	Plus,
	Tray,
	Users,
} from "@phosphor-icons/react";
import { useQuery } from "convex/react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { useIssueCreateOptional } from "@/components/issues/IssueCreateContext";
import { useWorkspace } from "@/components/providers/workspace-context";
import {
	CommandDialog,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
	CommandSeparator,
	CommandShortcut,
} from "@/components/ui/command";
import { api } from "../../convex/_generated/api";

interface RecentItem {
	type:
		| "project"
		| "issue"
		| "story"
		| "task"
		| "client"
		| "note"
		| "document"
		| "whiteboard";
	id: string;
	name: string;
	path: string;
}

const RECENT_ITEMS_KEY = "clave:recent-items";
const MAX_RECENT_ITEMS = 8;

function getRecentItems(): RecentItem[] {
	if (typeof window === "undefined") return [];
	try {
		const stored = localStorage.getItem(RECENT_ITEMS_KEY);
		return stored ? JSON.parse(stored) : [];
	} catch {
		return [];
	}
}

function addRecentItem(item: RecentItem) {
	const items = getRecentItems().filter((i) => i.id !== item.id);
	items.unshift(item);
	if (items.length > MAX_RECENT_ITEMS) items.length = MAX_RECENT_ITEMS;
	localStorage.setItem(RECENT_ITEMS_KEY, JSON.stringify(items));
}

export function CommandPalette() {
	const [open, setOpen] = useState(false);
	const [search, setSearch] = useState("");
	const [debouncedSearch, setDebouncedSearch] = useState("");
	const [recentItems, setRecentItems] = useState<RecentItem[]>([]);
	const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
	const router = useRouter();
	const { workspaceId, workspaceSlug } = useWorkspace();
	const issueCreate = useIssueCreateOptional();

	// Debounce search input
	useEffect(() => {
		if (debounceTimer.current) clearTimeout(debounceTimer.current);
		debounceTimer.current = setTimeout(() => {
			setDebouncedSearch(search);
		}, 300);
		return () => {
			if (debounceTimer.current) clearTimeout(debounceTimer.current);
		};
	}, [search]);

	// Global keyboard shortcut
	useEffect(() => {
		function handleKeyDown(e: KeyboardEvent) {
			if ((e.metaKey || e.ctrlKey) && e.key === "k") {
				e.preventDefault();
				setOpen((prev) => !prev);
			}
		}
		document.addEventListener("keydown", handleKeyDown);
		return () => document.removeEventListener("keydown", handleKeyDown);
	}, []);

	// Load recent items when palette opens
	useEffect(() => {
		if (open) {
			setRecentItems(getRecentItems());
			setSearch("");
			setDebouncedSearch("");
		}
	}, [open]);

	const hasSearch = debouncedSearch.trim().length > 0;

	const results = useQuery(
		api.search.global,
		hasSearch ? { workspaceId, searchTerm: debouncedSearch } : "skip",
	);

	const isSearching = hasSearch && results === undefined;

	const navigate = useCallback(
		(path: string, recent?: RecentItem) => {
			if (recent) addRecentItem(recent);
			setOpen(false);
			// biome-ignore lint/suspicious/noExplicitAny: dynamic workspace paths
			router.push(path as any);
		},
		[router],
	);

	const basePath = `/${workspaceSlug}`;

	return (
		<CommandDialog
			open={open}
			onOpenChange={setOpen}
			title="Command palette"
			description="Search across projects, issues, clients, notes, docs, and boards"
			showCloseButton={false}
			shouldFilter={!hasSearch}
		>
			<CommandInput
				placeholder="Search or type a command..."
				value={search}
				onValueChange={setSearch}
			/>
			<CommandList>
				{isSearching && (
					<div className="py-6 text-center text-sm text-muted-foreground">
						Searching...
					</div>
				)}

				{hasSearch && results && !isSearching && (
					<>
						{results.projects.length === 0 &&
							(results.issues?.length ?? 0) === 0 &&
							(results.stories?.length ?? 0) === 0 &&
							(results.tasks?.length ?? 0) === 0 &&
							results.clients.length === 0 &&
							results.notes.length === 0 &&
							(results.documents?.length ?? 0) === 0 &&
							(results.whiteboards?.length ?? 0) === 0 && (
								<CommandEmpty>
									No results found for &ldquo;{debouncedSearch}&rdquo;
								</CommandEmpty>
							)}

						{results.projects.length > 0 && (
							<CommandGroup heading="Projects">
								{results.projects.map((project) => (
									<CommandItem
										key={project._id}
										value={`project-${project._id}`}
										onSelect={() => {
											const path = `${basePath}/projects/${project.slug}`;
											navigate(path, {
												type: "project",
												id: project._id,
												name: project.name,
												path,
											});
										}}
									>
										<Folder className="size-4 text-muted-foreground" />
										<span>{project.name}</span>
										<span className="ml-auto text-xs text-muted-foreground">
											{project.status}
										</span>
									</CommandItem>
								))}
							</CommandGroup>
						)}

						{((results.issues?.length ?? 0) > 0 ||
							(results.stories?.length ?? 0) > 0 ||
							(results.tasks?.length ?? 0) > 0) && (
							<CommandGroup heading="Issues">
								{(results.issues ?? []).map((issue) => (
									<CommandItem
										key={issue._id}
										value={`issue-${issue._id}`}
										onSelect={() => {
											const path = `${basePath}/tasks`;
											navigate(path, {
												type: "issue",
												id: issue._id,
												name: `${issue.identifier}: ${issue.title}`,
												path,
											});
										}}
									>
										<CheckSquare className="size-4 text-muted-foreground" />
										<span className="text-muted-foreground font-mono text-xs mr-1">
											{issue.identifier}
										</span>
										<span className="truncate">{issue.title}</span>
									</CommandItem>
								))}
								{(results.stories ?? []).map((story) => (
									<CommandItem
										key={story._id}
										value={`issue-legacy-${story._id}`}
										onSelect={() => {
											const path = `${basePath}/projects`;
											navigate(path, {
												type: "issue",
												id: story._id,
												name: `${story.identifier}: ${story.title}`,
												path,
											});
										}}
									>
										<CheckSquare className="size-4 text-muted-foreground" />
										<span className="text-muted-foreground font-mono text-xs mr-1">
											{story.identifier}
										</span>
										<span className="truncate">{story.title}</span>
									</CommandItem>
								))}
								{(results.tasks ?? []).map((task) => (
									<CommandItem
										key={task._id}
										value={`issue-legacy-task-${task._id}`}
										onSelect={() => {
											const path = `${basePath}/tasks`;
											navigate(path, {
												type: "issue",
												id: task._id,
												name: `${task.identifier}: ${task.title}`,
												path,
											});
										}}
									>
										<CheckSquare className="size-4 text-muted-foreground" />
										<span className="text-muted-foreground font-mono text-xs mr-1">
											{task.identifier}
										</span>
										<span className="truncate">{task.title}</span>
									</CommandItem>
								))}
							</CommandGroup>
						)}

						{results.clients.length > 0 && (
							<CommandGroup heading="Clients">
								{results.clients.map((client) => (
									<CommandItem
										key={client._id}
										value={`client-${client._id}`}
										onSelect={() => {
											const path = `${basePath}/clients`;
											navigate(path, {
												type: "client",
												id: client._id,
												name: client.name,
												path,
											});
										}}
									>
										<Users className="size-4 text-muted-foreground" />
										<span>{client.name}</span>
										<span className="ml-auto text-xs text-muted-foreground">
											{client.status}
										</span>
									</CommandItem>
								))}
							</CommandGroup>
						)}

						{results.notes.length > 0 && (
							<CommandGroup heading="Notes">
								{results.notes.map((note) => (
									<CommandItem
										key={note._id}
										value={`note-${note._id}`}
										onSelect={() => {
											const path = `${basePath}/notes`;
											navigate(path, {
												type: "note",
												id: note._id,
												name: note.title,
												path,
											});
										}}
									>
										<NoteBlank className="size-4 text-muted-foreground" />
										<span className="truncate">{note.title}</span>
									</CommandItem>
								))}
							</CommandGroup>
						)}

						{(results.documents?.length ?? 0) > 0 && (
							<CommandGroup heading="Documents">
								{(results.documents ?? []).map((doc) => (
									<CommandItem
										key={doc._id}
										value={`document-${doc._id}`}
										onSelect={() => {
											const path = `${basePath}/docs/${doc._id}`;
											navigate(path, {
												type: "document",
												id: doc._id,
												name: doc.title,
												path,
											});
										}}
									>
										<FileText className="size-4 text-muted-foreground" />
										<span className="truncate">{doc.title}</span>
									</CommandItem>
								))}
							</CommandGroup>
						)}

						{(results.whiteboards?.length ?? 0) > 0 && (
							<CommandGroup heading="Whiteboards">
								{(results.whiteboards ?? []).map((board) => (
									<CommandItem
										key={board._id}
										value={`whiteboard-${board._id}`}
										onSelect={() => {
											const path = `${basePath}/boards/${board._id}`;
											navigate(path, {
												type: "whiteboard",
												id: board._id,
												name: board.title,
												path,
											});
										}}
									>
										<PenNib className="size-4 text-muted-foreground" />
										<span className="truncate">{board.title}</span>
									</CommandItem>
								))}
							</CommandGroup>
						)}
					</>
				)}

				{!hasSearch && (
					<>
						{recentItems.length > 0 && (
							<CommandGroup heading="Recent">
								{recentItems.map((item) => (
									<CommandItem
										key={item.id}
										value={`recent-${item.id}`}
										onSelect={() => navigate(item.path, item)}
									>
										<RecentItemIcon type={item.type} />
										<span className="truncate">{item.name}</span>
										<span className="ml-auto text-xs capitalize text-muted-foreground">
											{item.type}
										</span>
									</CommandItem>
								))}
							</CommandGroup>
						)}

						<CommandSeparator />

						<CommandGroup heading="Quick actions">
							<CommandItem
								value="create-issue"
								onSelect={() => {
									setOpen(false);
									issueCreate?.openQuickCreate();
								}}
							>
								<Plus className="size-4 text-muted-foreground" />
								<span>Create issue</span>
								<CommandShortcut>C</CommandShortcut>
							</CommandItem>
							<CommandItem
								value="create-project"
								onSelect={() => navigate(`${basePath}/projects?create=true`)}
							>
								<Plus className="size-4 text-muted-foreground" />
								<span>Create project</span>
							</CommandItem>
							<CommandItem
								value="create-issue-full"
								onSelect={() => {
									setOpen(false);
									issueCreate?.openFullCreate();
								}}
							>
								<Plus className="size-4 text-muted-foreground" />
								<span>Create issue (full)</span>
								<CommandShortcut>V</CommandShortcut>
							</CommandItem>
							<CommandItem
								value="create-document"
								onSelect={() => navigate(`${basePath}/docs?create=true`)}
							>
								<Plus className="size-4 text-muted-foreground" />
								<span>Create document</span>
							</CommandItem>
							<CommandItem
								value="create-whiteboard"
								onSelect={() => navigate(`${basePath}/boards?create=true`)}
							>
								<Plus className="size-4 text-muted-foreground" />
								<span>Create whiteboard</span>
							</CommandItem>
							<CommandItem
								value="go-to-inbox"
								onSelect={() => navigate(`${basePath}/inbox`)}
							>
								<Tray className="size-4 text-muted-foreground" />
								<span>Go to inbox</span>
								<CommandShortcut>G I</CommandShortcut>
							</CommandItem>
							<CommandItem
								value="go-to-tasks"
								onSelect={() => navigate(`${basePath}/tasks`)}
							>
								<CheckSquare className="size-4 text-muted-foreground" />
								<span>Go to my issues</span>
								<CommandShortcut>G T</CommandShortcut>
							</CommandItem>
							<CommandItem
								value="go-to-settings"
								onSelect={() => navigate(`${basePath}/settings`)}
							>
								<Gear className="size-4 text-muted-foreground" />
								<span>Go to settings</span>
								<CommandShortcut>G S</CommandShortcut>
							</CommandItem>
						</CommandGroup>

						<CommandSeparator />

						<CommandGroup heading="Navigation">
							<CommandItem
								value="go-to-projects"
								onSelect={() => navigate(`${basePath}/projects`)}
							>
								<Folder className="size-4 text-muted-foreground" />
								<span>Go to projects</span>
								<CommandShortcut>G P</CommandShortcut>
							</CommandItem>
							<CommandItem
								value="go-to-clients"
								onSelect={() => navigate(`${basePath}/clients`)}
							>
								<Users className="size-4 text-muted-foreground" />
								<span>Go to clients</span>
								<CommandShortcut>G C</CommandShortcut>
							</CommandItem>
							<CommandItem
								value="go-to-notes"
								onSelect={() => navigate(`${basePath}/notes`)}
							>
								<NoteBlank className="size-4 text-muted-foreground" />
								<span>Go to notes</span>
								<CommandShortcut>G N</CommandShortcut>
							</CommandItem>
							<CommandItem
								value="go-to-docs"
								onSelect={() => navigate(`${basePath}/docs`)}
							>
								<FileText className="size-4 text-muted-foreground" />
								<span>Go to docs</span>
								<CommandShortcut>G D</CommandShortcut>
							</CommandItem>
							<CommandItem
								value="go-to-boards"
								onSelect={() => navigate(`${basePath}/boards`)}
							>
								<PenNib className="size-4 text-muted-foreground" />
								<span>Go to boards</span>
								<CommandShortcut>G B</CommandShortcut>
							</CommandItem>
						</CommandGroup>
					</>
				)}
			</CommandList>
		</CommandDialog>
	);
}

function RecentItemIcon({ type }: { type: RecentItem["type"] }) {
	switch (type) {
		case "project":
			return <Folder className="size-4 text-muted-foreground" />;
		case "issue":
		case "story":
		case "task":
			return <CheckSquare className="size-4 text-muted-foreground" />;
		case "client":
			return <Users className="size-4 text-muted-foreground" />;
		case "note":
			return <NoteBlank className="size-4 text-muted-foreground" />;
		case "document":
			return <FileText className="size-4 text-muted-foreground" />;
		case "whiteboard":
			return <PenNib className="size-4 text-muted-foreground" />;
	}
}
