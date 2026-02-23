"use client";

import {
	Check,
	ChevronsUpDown,
	ExternalLink,
	Link2,
	Settings2,
} from "lucide-react";
import { useMemo, useState } from "react";
import {
	Command,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
} from "@/components/ui/command";
import {
	DropdownMenuItem,
	DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import type { MCPServerSummary } from "@/hooks/use-ai-chat";
import { cn } from "@/lib/utils";
import type { Id } from "../../../convex/_generated/dataModel";

export type McpConnectorPickerProps = {
	servers: MCPServerSummary[];
	selectedIds: Id<"mcpServers">[];
	onChange: (ids: Id<"mcpServers">[]) => void;
	disabled?: boolean;
	maxVisible?: number;
};

export type McpActionMenuItemsProps = {
	servers: MCPServerSummary[];
	selectedIds: Id<"mcpServers">[];
	onChange: (ids: Id<"mcpServers">[]) => void;
	maxVisible?: number;
};

function needsConfiguration(server: MCPServerSummary) {
	return (
		(server.authType === "oauth" || server.authType === "apiKey") &&
		!server.hasApiKey
	);
}

export function McpActionMenuItems({
	servers,
	selectedIds,
	onChange,
	maxVisible = 5,
}: McpActionMenuItemsProps) {
	const activeServers = servers
		.filter((server) => server.status === "active")
		.slice(0, maxVisible);
	if (activeServers.length === 0) return null;

	const toggleServer = (serverId: Id<"mcpServers">) => {
		if (selectedIds.includes(serverId)) {
			onChange(selectedIds.filter((id) => id !== serverId));
			return;
		}
		onChange([...selectedIds, serverId]);
	};

	const handleServerSelect = (server: MCPServerSummary) => {
		if (needsConfiguration(server)) {
			window.open(
				server.authConfigUrl || server.url,
				"_blank",
				"noopener,noreferrer",
			);
			return;
		}
		toggleServer(server._id);
	};

	return (
		<>
			<DropdownMenuSeparator />
			<div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
				MCP connectors
			</div>
			{activeServers.map((server) => {
				const selected = selectedIds.includes(server._id);
				const serverNeedsConfig = needsConfiguration(server);
				return (
					<DropdownMenuItem
						key={server._id}
						onSelect={(event) => {
							event.preventDefault();
							handleServerSelect(server);
						}}
						className="flex items-center gap-2"
					>
						<div
							className={cn(
								"flex size-4 items-center justify-center rounded border",
								selected
									? "border-sienna-500 bg-sienna-500/15 text-sienna-600 dark:text-sienna-300"
									: "border-border text-transparent",
							)}
						>
							<Check className="size-3" />
						</div>
						<span className="truncate text-sm">{server.name}</span>
						{serverNeedsConfig && (
							<span className="ml-auto inline-flex items-center gap-1 text-[10px] text-amber-500">
								Configure
								<ExternalLink className="size-3" />
							</span>
						)}
					</DropdownMenuItem>
				);
			})}
		</>
	);
}

export function McpConnectorPicker({
	servers,
	selectedIds,
	onChange,
	disabled,
	maxVisible = 5,
}: McpConnectorPickerProps) {
	const [open, setOpen] = useState(false);

	const visibleServers = useMemo(() => {
		const active = servers.filter((server) => server.status === "active");
		return active.slice(0, maxVisible);
	}, [servers, maxVisible]);

	const selectedCount = selectedIds.length;

	const toggleServer = (serverId: Id<"mcpServers">) => {
		if (selectedIds.includes(serverId)) {
			onChange(selectedIds.filter((id) => id !== serverId));
			return;
		}
		onChange([...selectedIds, serverId]);
	};

	const handleServerSelect = (server: MCPServerSummary) => {
		if (needsConfiguration(server)) {
			window.open(
				server.authConfigUrl || server.url,
				"_blank",
				"noopener,noreferrer",
			);
			return;
		}
		toggleServer(server._id);
	};

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>
				<button
					type="button"
					disabled={disabled}
					className={cn(
						"inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-2 text-xs font-medium text-muted-foreground transition-colors",
						"hover:bg-accent hover:text-foreground",
						"disabled:cursor-not-allowed disabled:opacity-50",
					)}
				>
					<Link2 className="size-3.5" />
					<span>MCP</span>
					{selectedCount > 0 && (
						<span className="rounded bg-sienna-500/15 px-1.5 py-0.5 text-[10px] text-sienna-600 dark:text-sienna-300">
							{selectedCount}
						</span>
					)}
					<ChevronsUpDown className="size-3.5 opacity-70" />
				</button>
			</PopoverTrigger>
			<PopoverContent className="w-80 p-0" align="start">
				<div className="border-b border-border/50 px-3 py-2">
					<p className="text-sm font-medium">MCP connectors</p>
					<p className="mt-0.5 text-xs text-muted-foreground">
						Choose which MCP servers are available for this thread.
					</p>
				</div>
				<Command shouldFilter>
					<CommandInput placeholder="Search connectors..." />
					<CommandList className="max-h-72">
						<CommandEmpty>No active MCP connectors</CommandEmpty>
						<CommandGroup>
							{visibleServers.map((server) => {
								const selected = selectedIds.includes(server._id);
								const serverNeedsConfig = needsConfiguration(server);
								return (
									<div
										key={server._id}
										className="border-b border-border/40 last:border-0"
									>
										<CommandItem
											value={`${server.name} ${server.url}`}
											onSelect={() => handleServerSelect(server)}
											className={cn(
												"flex items-start gap-2 py-2",
												serverNeedsConfig && "opacity-60",
											)}
										>
											<div
												className={cn(
													"mt-0.5 flex size-4 items-center justify-center rounded border",
													selected
														? "border-sienna-500 bg-sienna-500/15 text-sienna-600 dark:text-sienna-300"
														: "border-border text-transparent",
												)}
											>
												<Check className="size-3" />
											</div>
											<div className="min-w-0 flex-1">
												<div className="truncate text-sm font-medium">
													{server.name}
												</div>
												<div className="truncate text-[11px] text-muted-foreground">
													{server.url}
												</div>
												{serverNeedsConfig && (
													<div className="mt-1 flex items-center gap-2">
														<span className="text-[10px] text-amber-500">
															Auth configuration required
														</span>
														<a
															className="inline-flex items-center gap-1 text-[10px] text-sienna-500 hover:underline"
															href={server.authConfigUrl || server.url}
															target="_blank"
															rel="noreferrer"
															onClick={(event) => event.stopPropagation()}
														>
															Configure
															<ExternalLink className="size-3" />
														</a>
													</div>
												)}
											</div>
										</CommandItem>
									</div>
								);
							})}
						</CommandGroup>
					</CommandList>
				</Command>
				<div className="flex items-center justify-between border-t border-border/50 px-3 py-2 text-[11px] text-muted-foreground">
					<span>
						Showing {visibleServers.length} of{" "}
						{servers.filter((s) => s.status === "active").length} active
					</span>
					<button
						type="button"
						className="inline-flex items-center gap-1 hover:text-foreground"
						onClick={() => setOpen(false)}
					>
						<Settings2 className="size-3" />
						Done
					</button>
				</div>
			</PopoverContent>
		</Popover>
	);
}
