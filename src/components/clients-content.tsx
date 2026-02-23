"use client";

import {
	ArrowDown,
	ArrowUp,
	CaretUpDown,
	DotsThreeVertical,
	Folder,
	MagnifyingGlass,
	Plus,
} from "@phosphor-icons/react/dist/ssr";
import { useMutation, useQuery } from "convex/react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { useWorkspace } from "@/components/providers/workspace-context";
import { useWorkspaceProjects } from "@/components/providers/workspace-data-context";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Skeleton } from "@/components/ui/skeleton";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";

const ClientDetailsDrawer = dynamic(
	() =>
		import("@/components/clients/ClientDetailsDrawer").then(
			(mod) => mod.ClientDetailsDrawer,
		),
	{
		loading: () => null,
	},
);

const ClientWizard = dynamic(
	() =>
		import("@/components/clients/ClientWizard").then((mod) => mod.ClientWizard),
	{
		loading: () => null,
	},
);

type ClientStatus =
	| "prospect"
	| "active"
	| "on_hold"
	| "completed"
	| "archived";

function statusLabel(status: ClientStatus): string {
	if (status === "prospect") return "Prospect";
	if (status === "active") return "Active";
	if (status === "on_hold") return "On hold";
	return "Archived";
}

function ClientStatusBadge({ status }: { status: ClientStatus }) {
	const label = statusLabel(status);

	let badgeClasses =
		"bg-muted text-muted-foreground border-transparent dark:bg-muted/30 dark:text-muted-foreground";
	let dotClasses = "bg-zinc-900 dark:bg-zinc-300";

	if (status === "active") {
		badgeClasses =
			"bg-teal-50 text-teal-700 border-transparent dark:bg-teal-500/15 dark:text-teal-100";
		dotClasses = "bg-teal-600 dark:bg-teal-300";
	} else if (status === "on_hold") {
		badgeClasses =
			"bg-amber-50 text-amber-700 border-transparent dark:bg-amber-500/15 dark:text-amber-100";
		dotClasses = "bg-amber-600 dark:bg-amber-300";
	} else if (status === "archived") {
		badgeClasses =
			"bg-slate-100 text-slate-600 border-transparent dark:bg-slate-600/30 dark:text-slate-200";
		dotClasses = "bg-slate-500 dark:bg-slate-300";
	}

	return (
		<Badge
			variant="outline"
			className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium capitalize ${badgeClasses}`}
		>
			<span className={`h-1.5 w-1.5 rounded-full ${dotClasses}`} />
			{label}
		</Badge>
	);
}

function ClientProjectsBadge({
	active,
	planned,
	completed,
}: {
	active: number;
	planned: number;
	completed: number;
}) {
	const badges = [
		{
			key: "active",
			count: active,
			label: "active projects",
			iconClass: "text-teal-600",
			wrapperClass: "text-muted-foreground",
		},
		{
			key: "planned",
			count: planned,
			label: "planned projects",
			iconClass: "text-amber-600",
			wrapperClass: "text-muted-foreground",
		},
		{
			key: "completed",
			count: completed,
			label: "completed projects",
			iconClass: "text-muted-foreground/80",
			wrapperClass: "text-muted-foreground/70",
		},
	];

	return (
		<div className="flex justify-end gap-1.5">
			{badges.map(({ key, count, label, iconClass, wrapperClass }) => (
				<Tooltip key={key} delayDuration={200}>
					<TooltipTrigger asChild>
						<div
							className={`inline-flex cursor-pointer items-center gap-1 rounded-sm bg-muted px-2 py-0.5 text-sm font-medium ${wrapperClass}`}
						>
							<Folder className={`h-4 w-4 ${iconClass}`} weight="regular" />
							<span>{count}</span>
						</div>
					</TooltipTrigger>
					<TooltipContent side="bottom" className="text-xs font-medium">
						{`${count} ${label}`}
					</TooltipContent>
				</Tooltip>
			))}
		</div>
	);
}

export function ClientsContent() {
	const { workspaceId, workspaceSlug, orgSlug } = useWorkspace();
	const [searchQuery, setSearchQuery] = useState("");
	const [isWizardOpen, setIsWizardOpen] = useState(false);
	const [statusFilter, setStatusFilter] = useState<"all" | ClientStatus>("all");
	const [sortKey, setSortKey] = useState<"name" | "projects">("name");
	const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
	const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
	const [pageSize, setPageSize] = useState(10);
	const [page, setPage] = useState(1);
	const [activeClientId, setActiveClientId] = useState<string | null>(null);

	const clientsData = useQuery(api.clients.list, {
		workspaceId,
		status: statusFilter === "all" ? undefined : statusFilter,
	});

	const projectsData = useWorkspaceProjects();

	const bulkArchiveMutation = useMutation(api.clients.bulkArchive);
	const updateStatusMutation = useMutation(api.clients.updateStatus);

	const filtered = useMemo(() => {
		if (!clientsData) return [];
		const q = searchQuery.trim().toLowerCase();

		let list = clientsData.slice();

		// Text search (client-side filtering on query results)
		if (q) {
			list = list.filter((c) => {
				return (
					c.name.toLowerCase().includes(q) ||
					c.primaryContactName?.toLowerCase().includes(q) ||
					c.primaryContactEmail?.toLowerCase().includes(q)
				);
			});
		}

		// Sorting
		const sorted = list.slice().sort((a, b) => {
			if (sortKey === "name") {
				const av = a.name.toLowerCase();
				const bv = b.name.toLowerCase();
				if (av === bv) return 0;
				const cmp = av < bv ? -1 : 1;
				return sortDirection === "asc" ? cmp : -cmp;
			}

			// sort by projects count
			const ac = getProjectCount(a._id);
			const bc = getProjectCount(b._id);
			if (ac === bc) return 0;
			const cmp = ac < bc ? -1 : 1;
			return sortDirection === "asc" ? cmp : -cmp;
		});

		return sorted;
		// biome-ignore lint/correctness/useExhaustiveDependencies: getProjectCount is intentionally derived from current projectsData for sorting.
	}, [clientsData, searchQuery, sortKey, sortDirection, getProjectCount]);

	function getProjectCount(clientId: Id<"clients">): number {
		if (!projectsData) return 0;
		return projectsData.filter((p) => p.clientId === clientId).length;
	}

	function getProjectCounts(clientId: Id<"clients">) {
		if (!projectsData) return { active: 0, planned: 0, completed: 0 };
		const clientProjects = projectsData.filter((p) => p.clientId === clientId);
		let active = 0;
		let planned = 0;
		let completed = 0;
		for (const project of clientProjects) {
			if (project.status === "active") {
				active += 1;
			} else if (project.status === "completed") {
				completed += 1;
			} else {
				planned += 1;
			}
		}
		return { active, planned, completed };
	}

	const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
	const currentPage = Math.min(page, totalPages);
	const pageStart = (currentPage - 1) * pageSize;
	const visibleClients = filtered.slice(pageStart, pageStart + pageSize);

	const toggleSort = (key: "name" | "projects") => {
		setSortKey((currentKey) => {
			if (currentKey !== key) {
				setSortDirection("asc");
				return key;
			}
			setSortDirection((dir) => (dir === "asc" ? "desc" : "asc"));
			return currentKey;
		});
	};

	const allVisibleIds = visibleClients.map((c) => c._id as string);
	const isAllSelected =
		allVisibleIds.length > 0 &&
		allVisibleIds.every((id) => selectedIds.has(id));
	const isIndeterminate = selectedIds.size > 0 && !isAllSelected;

	const toggleSelectAll = () => {
		setSelectedIds((prev) => {
			if (isAllSelected) {
				return new Set();
			}
			const next = new Set(prev);
			for (const id of allVisibleIds) next.add(id);
			return next;
		});
	};

	const toggleSelectOne = (id: string) => {
		setSelectedIds((prev) => {
			const next = new Set(prev);
			if (next.has(id)) next.delete(id);
			else next.add(id);
			return next;
		});
	};

	const clearSelection = () => setSelectedIds(new Set());

	const handleArchiveSelected = async () => {
		if (!selectedIds.size) return;
		try {
			await bulkArchiveMutation({
				clientIds: Array.from(selectedIds) as Id<"clients">[],
			});
			toast.success(
				`Archived ${selectedIds.size} client${selectedIds.size > 1 ? "s" : ""}`,
			);
			clearSelection();
		} catch {
			toast.error("Failed to archive clients");
		}
	};

	const handleArchiveOne = async (clientId: string, clientName: string) => {
		try {
			await updateStatusMutation({
				clientId: clientId as Id<"clients">,
				status: "archived",
			});
			toast.success(`Archived ${clientName}`);
		} catch {
			toast.error("Failed to archive client");
		}
	};

	const goToPage = (next: number) => {
		const clamped = Math.min(Math.max(1, next), totalPages);
		setPage(clamped);
	};

	const pageNumbers = (() => {
		if (totalPages <= 5) {
			return Array.from({ length: totalPages }, (_, i) => i + 1);
		}
		const pages: number[] = [];
		const start = Math.max(1, currentPage - 1);
		const end = Math.min(totalPages, currentPage + 1);
		if (start > 1) pages.push(1);
		if (start > 2) pages.push(-1); // ellipsis
		for (let p = start; p <= end; p++) pages.push(p);
		if (end < totalPages - 1) pages.push(-1);
		if (end < totalPages) pages.push(totalPages);
		return pages;
	})();

	if (clientsData === undefined) {
		return (
			<div className="flex flex-1 flex-col bg-background mx-2 my-2 border border-border rounded-lg min-w-0 overflow-y-auto">
				<header className="sticky top-0 z-10 bg-background flex flex-col border-b border-border/40">
					<div className="flex items-center justify-between px-4 py-3 border-b border-border">
						<div className="flex items-center gap-3">
							<SidebarTrigger className="h-8 w-8 rounded-lg hover:bg-accent text-muted-foreground" />
							<p className="text-base font-medium text-foreground">Clients</p>
						</div>
					</div>
				</header>
				<div className="flex-1 px-4 pb-2 pt-5 space-y-3">
					<Skeleton className="h-10 w-full" />
					<Skeleton className="h-10 w-full" />
					<Skeleton className="h-10 w-full" />
					<Skeleton className="h-10 w-full" />
				</div>
			</div>
		);
	}

	return (
		<div className="flex flex-1 flex-col bg-background mx-2 my-2 border border-border rounded-lg min-w-0 overflow-y-auto">
			<header className="sticky top-0 z-10 bg-background flex flex-col border-b border-border/40">
				<div className="flex items-center justify-between px-4 py-3 border-b border-border">
					<div className="flex items-center gap-3">
						<SidebarTrigger className="h-8 w-8 rounded-lg hover:bg-accent text-muted-foreground" />
						<p className="text-base font-medium text-foreground">Clients</p>
					</div>
					<div className="flex items-center gap-2">
						<Button
							variant="ghost"
							size="sm"
							onClick={() => setIsWizardOpen(true)}
						>
							<Plus className="h-4 w-4" weight="bold" />
							New client
						</Button>
					</div>
				</div>

				<div className="flex items-center justify-between px-4 pb-3 pt-3 gap-3 flex-wrap">
					<div className="flex-1 min-w-[260px]">
						<Tabs
							value={statusFilter}
							onValueChange={(value) =>
								setStatusFilter(value as "all" | ClientStatus)
							}
						>
							<TabsList className="inline-flex bg-muted rounded-full px-1 py-0.5 text-xs border border-border/50 h-8">
								{[
									{ id: "all" as const, label: "All" },
									{ id: "active" as const, label: "Active" },
									{ id: "prospect" as const, label: "Prospect" },
									{ id: "on_hold" as const, label: "On hold" },
									{ id: "archived" as const, label: "Archived" },
								].map((tab) => (
									<TabsTrigger
										key={tab.id}
										value={tab.id}
										className="h-7 px-3 rounded-full text-xs data-[state=active]:bg-background data-[state=active]:text-foreground"
									>
										{tab.label}
									</TabsTrigger>
								))}
							</TabsList>
						</Tabs>
					</div>

					<div className="flex items-center gap-3 flex-1 justify-end">
						{selectedIds.size > 0 && (
							<div className="flex items-center gap-2 text-xs text-muted-foreground">
								<span>{selectedIds.size} selected</span>
								<Button
									variant="ghost"
									size="sm"
									className="h-7 px-2 text-xs"
									onClick={handleArchiveSelected}
								>
									Archive
								</Button>
								<Button
									variant="ghost"
									size="sm"
									className="h-7 px-2 text-xs"
									onClick={clearSelection}
								>
									Clear
								</Button>
							</div>
						)}
						<div className="flex-1 max-w-xs relative">
							<MagnifyingGlass className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
							<Input
								value={searchQuery}
								onChange={(e) => setSearchQuery(e.target.value)}
								placeholder="Search clients or contacts"
								className="h-9 rounded-lg bg-muted/50 text-sm placeholder:text-muted-foreground focus-visible:ring-1 focus-visible:ring-primary/20 border-border border shadow-none pl-9"
							/>
						</div>
					</div>
				</div>
			</header>

			<div className="flex-1 px-4 pb-2 pt-5">
				<div className="w-full">
					{filtered.length === 0 ? (
						<div className="flex flex-col items-center justify-center py-12 text-center border border-dashed border-border/60 rounded-lg bg-muted/30">
							<p className="text-sm font-medium text-foreground">
								No clients found
							</p>
							<p className="mt-1 text-xs text-muted-foreground">
								Try adjusting your search or add a new client.
							</p>
							<Button
								className="mt-4 h-8 px-3 text-xs rounded-lg"
								onClick={() => setIsWizardOpen(true)}
							>
								<Plus className="mr-1 h-3 w-3" weight="bold" />
								New client
							</Button>
						</div>
					) : (
						<div className="rounded-lg border border-borde overflow-hidden">
							<Table>
								<TableHeader className="bg-muted">
									<TableRow className="hover:bg-transparent">
										<TableHead className="w-[32px] text-xs font-medium text-muted-foreground">
											<Checkbox
												aria-label="Select all clients"
												checked={
													isAllSelected
														? true
														: isIndeterminate
															? "indeterminate"
															: false
												}
												onCheckedChange={toggleSelectAll}
											/>
										</TableHead>
										<TableHead className="w-[26%] text-xs font-medium text-muted-foreground">
											<button
												type="button"
												className="flex items-center gap-1 hover:text-foreground"
												onClick={() => toggleSort("name")}
											>
												<span>Client</span>
												{sortKey === "name" ? (
													sortDirection === "asc" ? (
														<ArrowUp className="h-3 w-3" />
													) : (
														<ArrowDown className="h-3 w-3" />
													)
												) : (
													<CaretUpDown className="h-3 w-3" />
												)}
											</button>
										</TableHead>
										<TableHead className="w-[24%] text-xs font-medium text-muted-foreground">
											Company
										</TableHead>
										<TableHead className="w-[16%] text-xs font-medium text-muted-foreground">
											Industry
										</TableHead>
										<TableHead className="w-[12%] text-xs font-medium text-muted-foreground">
											Status
										</TableHead>
										<TableHead className="w-[14%] text-xs font-medium text-muted-foreground text-right">
											<button
												type="button"
												className="inline-flex items-center gap-1 hover:text-foreground"
												onClick={() => toggleSort("projects")}
											>
												<span>Projects</span>
												{sortKey === "projects" ? (
													sortDirection === "asc" ? (
														<ArrowUp className="h-3 w-3" />
													) : (
														<ArrowDown className="h-3 w-3" />
													)
												) : (
													<CaretUpDown className="h-3 w-3" />
												)}
											</button>
										</TableHead>
										<TableHead className="w-[40px]" />
									</TableRow>
								</TableHeader>
								<TableBody>
									{visibleClients.map((client) => {
										const clientId = client._id as string;
										const checked = selectedIds.has(clientId);
										const counts = getProjectCounts(client._id);

										const displayContactName =
											client.primaryContactName ?? client.name;
										return (
											<TableRow key={clientId} className="hover:bg-muted/80">
												<TableCell className="align-middle">
													<Checkbox
														aria-label={`Select ${client.name}`}
														checked={checked}
														onCheckedChange={() => toggleSelectOne(clientId)}
													/>
												</TableCell>
												<TableCell
													className="align-middle text-sm font-medium text-foreground cursor-pointer"
													onClick={() => setActiveClientId(clientId)}
												>
													<div className="flex items-center gap-3">
														<Avatar className="h-8 w-8">
															<AvatarFallback className="text-xs font-medium">
																{displayContactName
																	.split(" ")
																	.map((part) => part.charAt(0))
																	.join("")
																	.slice(0, 2)
																	.toUpperCase()}
															</AvatarFallback>
														</Avatar>
														<div className="flex flex-col min-w-0">
															<span className="truncate">
																{displayContactName}
															</span>
															{client.primaryContactEmail && (
																<span className="mt-0.5 text-[11px] text-muted-foreground truncate">
																	{client.primaryContactEmail}
																</span>
															)}
														</div>
													</div>
												</TableCell>
												<TableCell className="align-middle text-sm">
													<div className="flex flex-col min-w-0">
														<span className="truncate text-sm text-foreground">
															{client.name}
														</span>
														{client.location && (
															<span className="truncate text-[11px] text-muted-foreground">
																{client.location}
															</span>
														)}
													</div>
												</TableCell>
												<TableCell className="align-middle text-sm text-muted-foreground">
													{client.industry ?? ""}
												</TableCell>
												<TableCell className="align-middle">
													<ClientStatusBadge
														status={client.status as ClientStatus}
													/>
												</TableCell>
												<TableCell className="align-middle text-right text-sm text-muted-foreground">
													<ClientProjectsBadge
														active={counts.active}
														planned={counts.planned}
														completed={counts.completed}
													/>
												</TableCell>
												<TableCell className="align-middle text-right">
													<DropdownMenu>
														<DropdownMenuTrigger asChild>
															<Button
																variant="ghost"
																size="icon-sm"
																className="h-7 w-7 rounded-full text-muted-foreground hover:text-foreground"
															>
																<DotsThreeVertical
																	className="h-4 w-4"
																	weight="regular"
																/>
															</Button>
														</DropdownMenuTrigger>
														<DropdownMenuContent align="end" className="w-40">
															<DropdownMenuItem
																onClick={() => {
																	setActiveClientId(clientId);
																}}
															>
																Quick view
															</DropdownMenuItem>
															<DropdownMenuSeparator />
															<DropdownMenuItem asChild>
																<Link
																	href={`/${orgSlug}/${workspaceSlug}/clients/${clientId}`}
																	prefetch={false}
																>
																	View full page
																</Link>
															</DropdownMenuItem>
															<DropdownMenuSeparator />
															<DropdownMenuItem
																className="text-destructive"
																onClick={() =>
																	handleArchiveOne(clientId, client.name)
																}
															>
																Archive
															</DropdownMenuItem>
														</DropdownMenuContent>
													</DropdownMenu>
												</TableCell>
											</TableRow>
										);
									})}
								</TableBody>
							</Table>

							<div className="border-t border-border bg-background px-4 py-2 text-xs text-muted-foreground">
								{/* Mobile pagination (simplified) */}
								<div className="flex items-center justify-between gap-2 md:hidden">
									<div>
										Page {currentPage} of {totalPages}
									</div>
									<div className="flex items-center gap-2">
										<Button
											variant="ghost"
											size="icon-sm"
											className="h-7 w-7"
											onClick={() => goToPage(currentPage - 1)}
											disabled={currentPage === 1}
										>
											&#8249;
										</Button>
										<span className="min-w-6 text-center">{currentPage}</span>
										<Button
											variant="ghost"
											size="icon-sm"
											className="h-7 w-7"
											onClick={() => goToPage(currentPage + 1)}
											disabled={currentPage === totalPages}
										>
											&#8250;
										</Button>
									</div>
								</div>

								{/* Desktop / tablet pagination */}
								<div className="hidden items-center justify-between md:flex">
									<div>
										Page {currentPage} of {totalPages}
									</div>
									<div className="flex items-center gap-2">
										<div className="flex items-center gap-1">
											<Button
												variant="ghost"
												size="icon-sm"
												className="h-7 w-7"
												onClick={() => goToPage(1)}
												disabled={currentPage === 1}
											>
												&#171;
											</Button>
											<Button
												variant="ghost"
												size="icon-sm"
												className="h-7 w-7"
												onClick={() => goToPage(currentPage - 1)}
												disabled={currentPage === 1}
											>
												&#8249;
											</Button>
											{(() => {
												let ellipsisCount = 0;
												return pageNumbers.map((p) => {
													if (p === -1) {
														ellipsisCount += 1;
														return (
															<span
																key={`ellipsis-${ellipsisCount}`}
																className="px-1"
															>
																...
															</span>
														);
													}

													return (
														<Button
															key={p}
															variant={p === currentPage ? "outline" : "ghost"}
															size="sm"
															className="h-7 min-w-7 px-2 text-xs"
															onClick={() => goToPage(p)}
														>
															{p}
														</Button>
													);
												});
											})()}
											<Button
												variant="ghost"
												size="icon-sm"
												className="h-7 w-7"
												onClick={() => goToPage(currentPage + 1)}
												disabled={currentPage === totalPages}
											>
												&#8250;
											</Button>
											<Button
												variant="ghost"
												size="icon-sm"
												className="h-7 w-7"
												onClick={() => goToPage(totalPages)}
												disabled={currentPage === totalPages}
											>
												&#187;
											</Button>
										</div>

										<div className="flex items-center gap-2">
											<span>Rows per page</span>
											<select
												className="h-7 rounded-md border border-border bg-background px-2 text-xs"
												value={pageSize}
												onChange={(e) => {
													const next = Number(e.target.value) || 10;
													setPageSize(next);
													setPage(1);
												}}
											>
												<option value={10}>10</option>
												<option value={7}>7</option>
												<option value={25}>25</option>
											</select>
										</div>
									</div>
								</div>
							</div>
						</div>
					)}
				</div>
			</div>
			{isWizardOpen && (
				<ClientWizard mode="create" onClose={() => setIsWizardOpen(false)} />
			)}
			<ClientDetailsDrawer
				clientId={activeClientId}
				onClose={() => setActiveClientId(null)}
			/>
		</div>
	);
}
