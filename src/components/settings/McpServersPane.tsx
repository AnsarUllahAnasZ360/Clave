"use client";

import {
	Globe,
	Lock,
	PencilSimpleLine,
	Plus,
	Spinner,
	TrashSimple,
} from "@phosphor-icons/react/dist/ssr";
import { useAction, useMutation, useQuery } from "convex/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useWorkspaceOptional } from "@/components/providers/workspace-context";
import {
	useCurrentUser,
	useWorkspaceMembers,
} from "@/components/providers/workspace-data-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { PaneDescription, PaneTitle } from "./settings-shared";
export function McpServersSettingsPane() {
	const workspace = useWorkspaceOptional();
	const servers = useQuery(
		api.mcpServers.list,
		workspace ? { workspaceId: workspace.workspaceId } : "skip",
	);
	const ensureSystemExcalidrawServer = useMutation(
		api.mcpServers.ensureSystemExcalidrawServer,
	);
	const addServer = useMutation(api.mcpServers.add);
	const updateServer = useMutation(api.mcpServers.update);
	const removeServer = useMutation(api.mcpServers.remove);
	const testConnection = useAction(api.ai.mcpTestConnection.testConnection);
	const ensuredWorkspaceRef = useRef<Id<"workspaces"> | null>(null);

	const currentUser = useCurrentUser();
	const members = useWorkspaceMembers();
	const currentMember = members?.find((m) => m.userId === currentUser?._id);
	const isAdmin = currentMember?.role === "admin";

	useEffect(() => {
		if (!workspace) return;
		if (ensuredWorkspaceRef.current === workspace.workspaceId) return;
		ensuredWorkspaceRef.current = workspace.workspaceId;
		void ensureSystemExcalidrawServer({
			workspaceId: workspace.workspaceId,
		}).catch((error) => {
			console.warn(
				"[settings:mcp] Failed to ensure system Excalidraw MCP server:",
				error instanceof Error ? error.message : error,
			);
			ensuredWorkspaceRef.current = null;
		});
	}, [ensureSystemExcalidrawServer, workspace]);

	type McpTransport = "http" | "sse";
	type McpAuthType = "none" | "apiKey" | "oauth";
	type McpServerRecord = {
		_id: Id<"mcpServers">;
		name: string;
		url: string;
		transport: McpTransport;
		status: "active" | "inactive";
		description?: string;
		hasApiKey: boolean;
		authType?: McpAuthType;
		authConfigUrl?: string;
		enabledTools?: string[];
	};
	type ConnectionTestResult = {
		success: boolean;
		toolCount?: number;
		toolNames?: string[];
		error?: string;
		authRequired?: boolean;
		requiresConfiguration?: boolean;
		configureUrl?: string;
	};
	type ServerDraft = {
		name: string;
		url: string;
		transport: McpTransport;
		description: string;
		authType: McpAuthType;
		authConfigUrl: string;
		apiKey: string;
		clearApiKey: boolean;
	};

	const [showAddForm, setShowAddForm] = useState(false);
	const [newName, setNewName] = useState("");
	const [newUrl, setNewUrl] = useState("");
	const [newTransport, setNewTransport] = useState<McpTransport>("sse");
	const [newApiKey, setNewApiKey] = useState("");
	const [newDescription, setNewDescription] = useState("");
	const [newAuthType, setNewAuthType] = useState<McpAuthType>("none");
	const [newAuthConfigUrl, setNewAuthConfigUrl] = useState("");
	const [isAdding, setIsAdding] = useState(false);
	const [editingServerId, setEditingServerId] = useState<string | null>(null);
	const [editingDraft, setEditingDraft] = useState<ServerDraft | null>(null);
	const [isSavingEdit, setIsSavingEdit] = useState(false);
	const [testingId, setTestingId] = useState<string | null>(null);
	const [testResults, setTestResults] = useState<
		Record<string, ConnectionTestResult>
	>({});
	const resolvedServers = (servers ?? []) as McpServerRecord[];

	const isRequiredExcalidrawServer = useCallback((server: McpServerRecord) => {
		const lowerUrl = server.url.trim().toLowerCase();
		return (
			lowerUrl.includes("/api/mcp/excalidraw") ||
			lowerUrl.includes("/mcp/excalidraw")
		);
	}, []);

	const resetAddForm = useCallback(() => {
		setNewName("");
		setNewUrl("");
		setNewTransport("sse");
		setNewApiKey("");
		setNewDescription("");
		setNewAuthType("none");
		setNewAuthConfigUrl("");
		setShowAddForm(false);
	}, []);

	const getAuthType = useCallback((server: McpServerRecord): McpAuthType => {
		return server.authType ?? (server.hasApiKey ? "apiKey" : "none");
	}, []);

	const requiresConfiguration = useCallback(
		(server: McpServerRecord, testResult?: ConnectionTestResult) => {
			if (testResult?.requiresConfiguration) return true;
			const authType = getAuthType(server);
			return (
				(authType === "oauth" || authType === "apiKey") && !server.hasApiKey
			);
		},
		[getAuthType],
	);

	const handleAdd = useCallback(async () => {
		if (!workspace || !newName.trim() || !newUrl.trim()) return;
		setIsAdding(true);
		try {
			const normalizedAuthType: McpAuthType =
				newAuthType === "none" && newApiKey.trim() ? "apiKey" : newAuthType;
			await addServer({
				workspaceId: workspace.workspaceId,
				name: newName.trim(),
				url: newUrl.trim(),
				transport: newTransport,
				authType: normalizedAuthType,
				authConfigUrl:
					normalizedAuthType === "oauth"
						? newAuthConfigUrl.trim() || undefined
						: undefined,
				apiKey: newApiKey.trim() || undefined,
				description: newDescription.trim() || undefined,
			});
			resetAddForm();
			toast.success("MCP server added");
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Failed to add server",
			);
		} finally {
			setIsAdding(false);
		}
	}, [
		workspace,
		newName,
		newUrl,
		newTransport,
		newAuthType,
		newAuthConfigUrl,
		newApiKey,
		newDescription,
		addServer,
		resetAddForm,
	]);

	const handleTestConnection = useCallback(
		async (serverId: string) => {
			setTestingId(serverId);
			try {
				const result = await testConnection({
					id: serverId as Id<"mcpServers">,
				});
				setTestResults((prev) => ({ ...prev, [serverId]: result }));
				if (result.success) {
					toast.success(`Connected! Found ${result.toolCount} tool(s)`);
				} else if (result.requiresConfiguration) {
					toast.message("Connector requires configuration");
				} else {
					toast.error(`Connection failed: ${result.error}`);
				}
			} catch (error) {
				const msg = error instanceof Error ? error.message : "Test failed";
				setTestResults((prev) => ({
					...prev,
					[serverId]: { success: false, error: msg },
				}));
				toast.error(msg);
			} finally {
				setTestingId(null);
			}
		},
		[testConnection],
	);

	const startEditing = useCallback(
		(server: McpServerRecord) => {
			if (isRequiredExcalidrawServer(server)) {
				toast.message("Excalidraw MCP is built-in and always enabled");
				return;
			}
			setEditingServerId(server._id);
			setEditingDraft({
				name: server.name,
				url: server.url,
				transport: server.transport,
				description: server.description ?? "",
				authType: getAuthType(server),
				authConfigUrl: server.authConfigUrl ?? "",
				apiKey: "",
				clearApiKey: false,
			});
		},
		[getAuthType, isRequiredExcalidrawServer],
	);

	const cancelEditing = useCallback(() => {
		setEditingServerId(null);
		setEditingDraft(null);
	}, []);

	const handleSaveEdit = useCallback(async () => {
		if (!editingServerId || !editingDraft) return;
		if (!editingDraft.name.trim() || !editingDraft.url.trim()) return;

		setIsSavingEdit(true);
		try {
			const apiKeyValue = editingDraft.apiKey.trim();
			await updateServer({
				id: editingServerId as Id<"mcpServers">,
				name: editingDraft.name.trim(),
				url: editingDraft.url.trim(),
				transport: editingDraft.transport,
				description: editingDraft.description.trim() || undefined,
				authType: editingDraft.authType,
				authConfigUrl:
					editingDraft.authType === "oauth"
						? editingDraft.authConfigUrl.trim() || undefined
						: undefined,
				...(editingDraft.clearApiKey ? { clearApiKey: true } : {}),
				...(apiKeyValue ? { apiKey: apiKeyValue } : {}),
			});
			toast.success("MCP server updated");
			cancelEditing();
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Failed to update server",
			);
		} finally {
			setIsSavingEdit(false);
		}
	}, [editingServerId, editingDraft, updateServer, cancelEditing]);

	const handleToggleStatus = useCallback(
		async (server: McpServerRecord) => {
			if (isRequiredExcalidrawServer(server)) {
				toast.message("Excalidraw MCP cannot be disabled");
				return;
			}
			try {
				await updateServer({
					id: server._id,
					status: server.status === "active" ? "inactive" : "active",
				});
			} catch (error) {
				toast.error(
					error instanceof Error ? error.message : "Failed to update",
				);
			}
		},
		[updateServer, isRequiredExcalidrawServer],
	);

	const handleRemove = useCallback(
		async (server: McpServerRecord) => {
			if (isRequiredExcalidrawServer(server)) {
				toast.message("Excalidraw MCP cannot be removed");
				return;
			}
			try {
				await removeServer({ id: server._id });
				toast.success("MCP server removed");
			} catch (error) {
				toast.error(
					error instanceof Error ? error.message : "Failed to remove",
				);
			}
		},
		[removeServer, isRequiredExcalidrawServer],
	);

	if (!isAdmin) {
		return (
			<div className="space-y-4">
				<PaneTitle>MCP Servers</PaneTitle>
				<div className="flex items-center gap-2 rounded-lg border border-border bg-muted/50 px-4 py-3">
					<Lock className="h-4 w-4 text-muted-foreground" />
					<span className="text-sm text-muted-foreground">
						Admin access required to manage MCP server integrations.
					</span>
				</div>
			</div>
		);
	}

	return (
		<div className="space-y-6">
			<div>
				<PaneTitle>MCP Servers</PaneTitle>
				<PaneDescription className="mt-1">
					Excalidraw is built in and always enabled. Add external MCP servers
					and choose which extra connectors are available in chat threads.
				</PaneDescription>
			</div>

			{/* Server list */}
			{resolvedServers.length > 0 && (
				<div className="space-y-3">
					{resolvedServers.map((server) => {
						const testResult = testResults[server._id];
						const authType = getAuthType(server);
						const isRequiredServer = isRequiredExcalidrawServer(server);
						const isEditing = editingServerId === server._id;
						const showConfigure = requiresConfiguration(server, testResult);
						const configureUrl =
							testResult?.configureUrl || server.authConfigUrl || server.url;
						return (
							<div
								key={server._id}
								className="rounded-lg border border-border bg-card p-4 space-y-3"
							>
								<div className="flex items-center justify-between">
									<div className="flex items-center gap-3">
										<div
											className={cn(
												"h-2 w-2 rounded-full",
												server.status === "active"
													? "bg-emerald-500"
													: "bg-muted-foreground/40",
											)}
										/>
										<div>
											<div className="text-sm font-medium">{server.name}</div>
											<div className="text-xs text-muted-foreground truncate max-w-xs">
												{server.url}
											</div>
											{isRequiredServer && (
												<div className="mt-1 text-[10px] text-muted-foreground">
													Required system connector
												</div>
											)}
										</div>
									</div>
									<div className="flex items-center gap-2">
										{showConfigure && (
											<Button asChild variant="outline" size="sm">
												<a href={configureUrl} target="_blank" rel="noreferrer">
													Configure
												</a>
											</Button>
										)}
										<Button
											variant="outline"
											size="sm"
											onClick={() => handleTestConnection(server._id)}
											disabled={testingId === server._id || isEditing}
										>
											{testingId === server._id ? (
												<>
													<Spinner className="h-3 w-3 animate-spin mr-1" />
													Testing...
												</>
											) : (
												"Test"
											)}
										</Button>
										<Button
											variant={isEditing ? "secondary" : "outline"}
											size="sm"
											onClick={() =>
												isEditing ? cancelEditing() : startEditing(server)
											}
											disabled={isRequiredServer}
										>
											<PencilSimpleLine className="mr-1 h-3.5 w-3.5" />
											{isEditing ? "Close" : "Edit"}
										</Button>
										<Switch
											checked={server.status === "active"}
											onCheckedChange={() => handleToggleStatus(server)}
											disabled={isEditing || isRequiredServer}
										/>
										{!isRequiredServer && (
											<Button
												variant="ghost"
												size="icon"
												className="h-8 w-8 text-muted-foreground hover:text-destructive"
												onClick={() => handleRemove(server)}
												disabled={isEditing}
											>
												<TrashSimple className="h-4 w-4" />
											</Button>
										)}
									</div>
								</div>

								{server.description && (
									<p className="text-xs text-muted-foreground">
										{server.description}
									</p>
								)}

								<div className="flex items-center gap-3 text-xs text-muted-foreground">
									<span className="rounded border border-border px-1.5 py-0.5 text-[10px] uppercase tracking-wide">
										{server.transport}
									</span>
									<span className="rounded border border-border px-1.5 py-0.5 text-[10px] uppercase tracking-wide">
										{authType === "none"
											? "No auth"
											: authType === "apiKey"
												? "API key"
												: "OAuth"}
									</span>
									{server.hasApiKey && (
										<span className="flex items-center gap-1">
											<Lock className="h-3 w-3" />
											Credentials configured
										</span>
									)}
									{server.enabledTools && (
										<span>
											{server.enabledTools.length} tool(s) whitelisted
										</span>
									)}
								</div>

								{testResult && (
									<div
										className={cn(
											"rounded-md px-3 py-2 text-xs",
											testResult.success
												? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
												: testResult.requiresConfiguration
													? "bg-amber-500/10 text-amber-700 dark:text-amber-300"
													: "bg-destructive/10 text-destructive",
										)}
									>
										{testResult.success ? (
											<span>
												Connected — {testResult.toolCount} tool(s) available
												{testResult.toolNames &&
													testResult.toolNames.length > 0 && (
														<span className="block mt-1 text-muted-foreground">
															{testResult.toolNames.join(", ")}
														</span>
													)}
											</span>
										) : testResult.requiresConfiguration ? (
											<div className="flex items-center justify-between gap-2">
												<span>
													{testResult.error ?? "Connector needs configuration"}
												</span>
												<Button asChild size="sm" variant="outline">
													<a
														href={configureUrl}
														target="_blank"
														rel="noreferrer"
													>
														Configure
													</a>
												</Button>
											</div>
										) : (
											<span>Error: {testResult.error}</span>
										)}
									</div>
								)}

								{isEditing && editingDraft && (
									<div className="rounded-md border border-border/70 bg-muted/20 p-3">
										<div className="mb-3 text-xs font-medium text-muted-foreground">
											Edit connector
										</div>
										<div className="space-y-2">
											<Input
												placeholder="Server name"
												value={editingDraft.name}
												onChange={(event) =>
													setEditingDraft((prev) =>
														prev ? { ...prev, name: event.target.value } : prev,
													)
												}
											/>
											<Input
												placeholder="Server URL"
												value={editingDraft.url}
												onChange={(event) =>
													setEditingDraft((prev) =>
														prev ? { ...prev, url: event.target.value } : prev,
													)
												}
											/>
											<div className="grid grid-cols-2 gap-2">
												<Button
													type="button"
													size="sm"
													variant={
														editingDraft.transport === "sse"
															? "secondary"
															: "outline"
													}
													onClick={() =>
														setEditingDraft((prev) =>
															prev ? { ...prev, transport: "sse" } : prev,
														)
													}
												>
													SSE transport
												</Button>
												<Button
													type="button"
													size="sm"
													variant={
														editingDraft.transport === "http"
															? "secondary"
															: "outline"
													}
													onClick={() =>
														setEditingDraft((prev) =>
															prev ? { ...prev, transport: "http" } : prev,
														)
													}
												>
													HTTP transport
												</Button>
											</div>
											<Select
												value={editingDraft.authType}
												onValueChange={(value: McpAuthType) =>
													setEditingDraft((prev) =>
														prev ? { ...prev, authType: value } : prev,
													)
												}
											>
												<SelectTrigger>
													<SelectValue placeholder="Authentication" />
												</SelectTrigger>
												<SelectContent>
													<SelectItem value="none">
														No authentication
													</SelectItem>
													<SelectItem value="apiKey">API key</SelectItem>
													<SelectItem value="oauth">
														OAuth / configure URL
													</SelectItem>
												</SelectContent>
											</Select>
											<Input
												type="password"
												placeholder={
													editingDraft.authType === "oauth"
														? "Access token (optional)"
														: "API key (optional)"
												}
												value={editingDraft.apiKey}
												onChange={(event) =>
													setEditingDraft((prev) =>
														prev
															? { ...prev, apiKey: event.target.value }
															: prev,
													)
												}
											/>
											{editingDraft.authType === "oauth" && (
												<Input
													placeholder="Configure URL (optional)"
													value={editingDraft.authConfigUrl}
													onChange={(event) =>
														setEditingDraft((prev) =>
															prev
																? { ...prev, authConfigUrl: event.target.value }
																: prev,
														)
													}
												/>
											)}
											{server.hasApiKey && (
												<div className="flex items-center justify-between rounded-md border border-border/60 px-3 py-2 text-xs">
													<span className="text-muted-foreground">
														Clear existing credentials
													</span>
													<Switch
														checked={editingDraft.clearApiKey}
														onCheckedChange={(checked) =>
															setEditingDraft((prev) =>
																prev ? { ...prev, clearApiKey: checked } : prev,
															)
														}
													/>
												</div>
											)}
											<Input
												placeholder="Description (optional)"
												value={editingDraft.description}
												onChange={(event) =>
													setEditingDraft((prev) =>
														prev
															? { ...prev, description: event.target.value }
															: prev,
													)
												}
											/>
										</div>
										<div className="mt-3 flex items-center gap-2">
											<Button
												size="sm"
												onClick={handleSaveEdit}
												disabled={
													isSavingEdit ||
													!editingDraft.name.trim() ||
													!editingDraft.url.trim()
												}
											>
												{isSavingEdit ? (
													<>
														<Spinner className="mr-1 h-3 w-3 animate-spin" />
														Saving...
													</>
												) : (
													"Save changes"
												)}
											</Button>
											<Button variant="ghost" size="sm" onClick={cancelEditing}>
												Cancel
											</Button>
										</div>
									</div>
								)}
							</div>
						);
					})}
				</div>
			)}

			{resolvedServers.length === 0 && !showAddForm && (
				<div className="rounded-lg border border-dashed border-border bg-muted/30 py-8 text-center">
					<Globe className="mx-auto h-8 w-8 text-muted-foreground/50" />
					<p className="mt-2 text-sm text-muted-foreground">
						No MCP servers configured
					</p>
					<p className="text-xs text-muted-foreground/70">
						Add an MCP server to extend the AI agent with external tools
					</p>
				</div>
			)}

			{/* Add server form */}
			{showAddForm ? (
				<div className="rounded-lg border border-border bg-card p-4 space-y-3">
					<div className="text-sm font-medium">Add MCP Server</div>
					<div className="space-y-2">
						<Input
							placeholder="Server name (e.g. Sentry)"
							value={newName}
							onChange={(e) => setNewName(e.target.value)}
						/>
						<Input
							placeholder="Server URL (e.g. https://mcp.sentry.dev/sse)"
							value={newUrl}
							onChange={(e) => setNewUrl(e.target.value)}
						/>
						<div className="space-y-1 rounded-md border border-border/70 p-2">
							<p className="text-xs text-muted-foreground">Transport</p>
							<div className="grid grid-cols-2 gap-2">
								<Button
									type="button"
									size="sm"
									variant={newTransport === "sse" ? "secondary" : "outline"}
									onClick={() => setNewTransport("sse")}
								>
									SSE
								</Button>
								<Button
									type="button"
									size="sm"
									variant={newTransport === "http" ? "secondary" : "outline"}
									onClick={() => setNewTransport("http")}
								>
									HTTP
								</Button>
							</div>
							<p className="text-[11px] text-muted-foreground">
								Use HTTP for streamable HTTP MCP, SSE for legacy server
								endpoints.
							</p>
						</div>
						<Select
							value={newAuthType}
							onValueChange={(value: McpAuthType) => setNewAuthType(value)}
						>
							<SelectTrigger>
								<SelectValue placeholder="Authentication" />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="none">No authentication</SelectItem>
								<SelectItem value="apiKey">API key</SelectItem>
								<SelectItem value="oauth">OAuth / configure URL</SelectItem>
							</SelectContent>
						</Select>
						<Input
							type="password"
							placeholder={
								newAuthType === "oauth"
									? "Access token (optional)"
									: "API key (optional)"
							}
							value={newApiKey}
							onChange={(e) => setNewApiKey(e.target.value)}
						/>
						{newAuthType === "oauth" && (
							<Input
								placeholder="Configure URL (optional)"
								value={newAuthConfigUrl}
								onChange={(e) => setNewAuthConfigUrl(e.target.value)}
							/>
						)}
						<Input
							placeholder="Description (optional)"
							value={newDescription}
							onChange={(e) => setNewDescription(e.target.value)}
						/>
					</div>
					<div className="flex items-center gap-2 pt-1">
						<Button
							size="sm"
							onClick={handleAdd}
							disabled={isAdding || !newName.trim() || !newUrl.trim()}
						>
							{isAdding ? (
								<>
									<Spinner className="h-3 w-3 animate-spin mr-1" />
									Adding...
								</>
							) : (
								"Add Server"
							)}
						</Button>
						<Button variant="ghost" size="sm" onClick={resetAddForm}>
							Cancel
						</Button>
					</div>
				</div>
			) : (
				<Button
					variant="outline"
					size="sm"
					onClick={() => setShowAddForm(true)}
				>
					<Plus className="h-4 w-4 mr-1" />
					Add Server
				</Button>
			)}
		</div>
	);
}
