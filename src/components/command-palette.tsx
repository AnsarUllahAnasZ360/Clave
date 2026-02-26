"use client";

import {
	ChatCircleText,
	CheckSquare,
	FileText,
	Folder,
	Gear,
	MagnifyingGlass,
	Microphone,
	PenNib,
	Plus,
	Tray,
	Users,
} from "@phosphor-icons/react";
import { useAction, useQuery } from "convex/react";
import { Loader2Icon, SparklesIcon } from "lucide-react";
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
		| "document"
		| "whiteboard";
	id: string;
	name: string;
	path: string;
}

type SearchMode = "keyword" | "semantic";

type SemanticResult = {
	sourceType: string;
	sourceId: string;
	title: string;
	snippet: string;
	score: number;
	projectId: string;
};

const RECENT_ITEMS_KEY = "clave:recent-items";
const SEARCH_MODE_KEY = "clave:search-mode";
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

function getSavedSearchMode(): SearchMode {
	if (typeof window === "undefined") return "keyword";
	try {
		const stored = localStorage.getItem(SEARCH_MODE_KEY);
		return stored === "semantic" ? "semantic" : "keyword";
	} catch {
		return "keyword";
	}
}

export function CommandPalette() {
	const [open, setOpen] = useState(false);
	const [search, setSearch] = useState("");
	const [debouncedSearch, setDebouncedSearch] = useState("");
	const [recentItems, setRecentItems] = useState<RecentItem[]>([]);
	const [searchMode, setSearchMode] = useState<SearchMode>("keyword");
	const [semanticResults, setSemanticResults] = useState<
		SemanticResult[] | null
	>(null);
	const [semanticLoading, setSemanticLoading] = useState(false);
	const [semanticError, setSemanticError] = useState<string | null>(null);
	const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
	const semanticGeneration = useRef(0);
	const router = useRouter();
	const { workspaceId, workspaceSlug, orgSlug } = useWorkspace();
	const issueCreate = useIssueCreateOptional();
	const embeddedAction = useAction(api.ai.embedded.embeddedAction);

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

	// Load recent items and saved search mode when palette opens
	useEffect(() => {
		if (open) {
			setRecentItems(getRecentItems());
			setSearch("");
			setDebouncedSearch("");
			setSearchMode(getSavedSearchMode());
			setSemanticResults(null);
			setSemanticError(null);
		}
	}, [open]);

	// Trigger semantic search when debounced query changes and mode is semantic
	useEffect(() => {
		if (searchMode !== "semantic" || !debouncedSearch.trim()) {
			setSemanticResults(null);
			setSemanticError(null);
			return;
		}

		const gen = ++semanticGeneration.current;
		setSemanticLoading(true);
		setSemanticError(null);
		setSemanticResults(null);

		embeddedAction({
			type: "semantic_search",
			context: { workspaceId },
			prompt: debouncedSearch.trim(),
		})
			.then((response) => {
				if (gen !== semanticGeneration.current) return; // stale
				if (response.error) {
					setSemanticError(response.error);
					setSemanticResults([]);
				} else {
					const data = response.data as
						| { results: SemanticResult[] }
						| undefined;
					setSemanticResults(data?.results ?? []);
				}
			})
			.catch((err) => {
				if (gen !== semanticGeneration.current) return;
				setSemanticError(err instanceof Error ? err.message : "Search failed");
				setSemanticResults([]);
			})
			.finally(() => {
				if (gen !== semanticGeneration.current) return;
				setSemanticLoading(false);
			});
	}, [debouncedSearch, searchMode, workspaceId, embeddedAction]);

	const hasSearch = debouncedSearch.trim().length > 0;
	const isSemanticMode = searchMode === "semantic";

	// Keyword search (only active in keyword mode)
	const results = useQuery(
		api.search.global,
		hasSearch && !isSemanticMode
			? { workspaceId, searchTerm: debouncedSearch }
			: "skip",
	);

	const isKeywordSearching =
		!isSemanticMode && hasSearch && results === undefined;

	const toggleSearchMode = useCallback(() => {
		setSearchMode((prev) => {
			const next = prev === "keyword" ? "semantic" : "keyword";
			try {
				localStorage.setItem(SEARCH_MODE_KEY, next);
			} catch {
				// ignore
			}
			return next;
		});
		// Reset results when switching modes
		setSemanticResults(null);
		setSemanticError(null);
	}, []);

	const navigate = useCallback(
		(path: string, recent?: RecentItem) => {
			if (recent) addRecentItem(recent);
			setOpen(false);
			// biome-ignore lint/suspicious/noExplicitAny: dynamic workspace paths
			router.push(path as any);
		},
		[router],
	);

	const basePath = `/${orgSlug}/${workspaceSlug}`;

	return (
		<CommandDialog
			open={open}
			onOpenChange={setOpen}
			title="Command palette"
			description="Search across projects, issues, clients, docs, and boards"
			showCloseButton={false}
			shouldFilter={!hasSearch}
		>
			<CommandInput
				placeholder={
					isSemanticMode
						? "Search with AI (natural language)..."
						: "Search or type a command..."
				}
				value={search}
				onValueChange={setSearch}
			/>

			{/* Search mode toggle */}
			<div className="flex items-center gap-1 px-3 py-2 border-b border-border">
				<button
					type="button"
					onClick={toggleSearchMode}
					className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
						!isSemanticMode
							? "bg-foreground/10 text-foreground"
							: "text-muted-foreground hover:text-foreground"
					}`}
				>
					<MagnifyingGlass className="size-3" />
					Keyword
				</button>
				<button
					type="button"
					onClick={toggleSearchMode}
					className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
						isSemanticMode
							? "bg-sienna-500/10 text-sienna-600 dark:text-sienna-400"
							: "text-muted-foreground hover:text-foreground"
					}`}
				>
					<SparklesIcon className="size-3" />
					Semantic
				</button>
			</div>

			<CommandList>
				{/* ── Keyword mode ─────────────────────────────────── */}
				{!isSemanticMode && (
					<>
						{isKeywordSearching && (
							<div className="py-6 text-center text-sm text-muted-foreground">
								Searching...
							</div>
						)}

						{hasSearch && results && !isKeywordSearching && (
							<>
								{results.projects.length === 0 &&
									(results.issues?.length ?? 0) === 0 &&
									(results.stories?.length ?? 0) === 0 &&
									(results.tasks?.length ?? 0) === 0 &&
									results.clients.length === 0 &&
									(results.documents?.length ?? 0) === 0 &&
									(results.whiteboards?.length ?? 0) === 0 && (
										<CommandEmpty>
											No results found for &ldquo;
											{debouncedSearch}&rdquo;
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
					</>
				)}

				{/* ── Semantic mode ────────────────────────────────── */}
				{isSemanticMode && hasSearch && (
					<>
						{semanticLoading && (
							<div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
								<Loader2Icon className="size-4 animate-spin text-sienna-500 dark:text-sienna-400" />
								Searching with AI...
							</div>
						)}

						{semanticError && !semanticLoading && (
							<div className="py-6 text-center text-sm text-muted-foreground">
								{semanticError}
							</div>
						)}

						{semanticResults &&
							semanticResults.length === 0 &&
							!semanticLoading &&
							!semanticError && (
								<CommandEmpty>
									No results found — try keyword search instead.
								</CommandEmpty>
							)}

						{semanticResults &&
							semanticResults.length > 0 &&
							!semanticLoading && (
								<CommandGroup heading="Semantic results">
									{semanticResults.map((result, idx) => (
										<SemanticResultItem
											key={`${result.sourceType}-${result.sourceId}-${idx}`}
											result={result}
											basePath={basePath}
											navigate={navigate}
										/>
									))}
								</CommandGroup>
							)}
					</>
				)}

				{isSemanticMode && !hasSearch && (
					<div className="flex flex-col items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
						<SparklesIcon className="size-5 text-sienna-400" />
						<p>Type a natural language query to search with AI</p>
						<p className="text-xs">
							e.g. &ldquo;issues about authentication bugs&rdquo;
						</p>
					</div>
				)}

				{/* ── Quick actions & navigation (no search, keyword mode) */}
				{!hasSearch && !isSemanticMode && (
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
							<CommandItem
								value="toggle-dictation"
								onSelect={() => {
									setOpen(false);
									window.dispatchEvent(
										new CustomEvent("clave:dictation-toggle", {
											detail: { source: "command-palette" },
										}),
									);
								}}
							>
								<Microphone className="size-4 text-muted-foreground" />
								<span>Toggle dictation</span>
								<CommandShortcut>Ctrl+Space</CommandShortcut>
							</CommandItem>
							<CommandItem
								value="dictation-clipboard"
								onSelect={() =>
									navigate(`${basePath}/settings?section=dictation`)
								}
							>
								<Microphone className="size-4 text-muted-foreground" />
								<span>Dictation clipboard</span>
								<CommandShortcut>Ctrl+Shift+Space</CommandShortcut>
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

// ── Semantic result item ───────────────────────────────────────────────

function SemanticResultItem({
	result,
	basePath,
	navigate,
}: {
	result: SemanticResult;
	basePath: string;
	navigate: (path: string, recent?: RecentItem) => void;
}) {
	const relevance = Math.round(result.score * 100);

	const handleSelect = useCallback(() => {
		// Navigate based on source type
		let path: string;
		let recentType: RecentItem["type"];

		switch (result.sourceType) {
			case "issue":
				path = `${basePath}/tasks`;
				recentType = "issue";
				break;
			case "document":
				path = `${basePath}/docs/${result.sourceId}`;
				recentType = "document";
				break;
			case "comment":
				// Comments link to the tasks page (most comments are on issues)
				path = `${basePath}/tasks`;
				recentType = "issue";
				break;
			default:
				path = `${basePath}/tasks`;
				recentType = "issue";
		}

		navigate(path, {
			type: recentType,
			id: result.sourceId,
			name: result.title || result.sourceType,
			path,
		});
	}, [result, basePath, navigate]);

	return (
		<CommandItem
			value={`semantic-${result.sourceType}-${result.sourceId}`}
			onSelect={handleSelect}
		>
			<SemanticSourceIcon type={result.sourceType} />
			<div className="flex flex-col min-w-0 flex-1 gap-0.5">
				<div className="flex items-center gap-1.5">
					<span className="truncate text-sm">{result.title || "Untitled"}</span>
					<span className="shrink-0 rounded-full bg-sienna-500/10 px-1.5 py-0.5 text-[10px] font-medium text-sienna-600 dark:text-sienna-400">
						{relevance}%
					</span>
				</div>
				{result.snippet && (
					<span className="truncate text-xs text-muted-foreground">
						{result.snippet}
					</span>
				)}
			</div>
			<span className="ml-auto shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] capitalize text-muted-foreground">
				{result.sourceType}
			</span>
		</CommandItem>
	);
}

function SemanticSourceIcon({ type }: { type: string }) {
	switch (type) {
		case "issue":
			return <CheckSquare className="size-4 text-muted-foreground shrink-0" />;
		case "document":
			return <FileText className="size-4 text-muted-foreground shrink-0" />;
		case "comment":
			return (
				<ChatCircleText className="size-4 text-muted-foreground shrink-0" />
			);
		default:
			return <FileText className="size-4 text-muted-foreground shrink-0" />;
	}
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
		case "document":
			return <FileText className="size-4 text-muted-foreground" />;
		case "whiteboard":
			return <PenNib className="size-4 text-muted-foreground" />;
	}
}
