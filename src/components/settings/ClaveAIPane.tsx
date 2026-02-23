"use client";

import {
	PencilSimpleLine,
	Plus,
	TrashSimple,
} from "@phosphor-icons/react/dist/ssr";
import { useMutation, useQuery } from "convex/react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { useWorkspaceOptional } from "@/components/providers/workspace-context";
import {
	useCurrentUser,
	useWorkspaceMembers,
} from "@/components/providers/workspace-data-context";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import {
	BUILT_IN_SLASH_COMMANDS,
	isBuiltInCommandName,
	normalizeSlashCommandName,
	type SlashCommandScope,
	type StoredSlashCommand,
} from "@/lib/ai/slash-commands";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { SlashCommandDialog } from "./SlashCommandDialog";
import {
	PaneDescription,
	PaneTitle,
	SettingRow,
	SettingSection,
} from "./settings-shared";

type ClaveAISettingsPaneMode = "all" | "slash-commands";

export function ClaveAISettingsPane({
	mode = "all",
}: {
	mode?: ClaveAISettingsPaneMode;
} = {}) {
	const workspace = useWorkspaceOptional();
	const workspaceId = workspace?.workspaceId;
	const currentUser = useCurrentUser();
	const members = useWorkspaceMembers();
	const settings = useQuery(
		api.workspaceSettings.get,
		workspaceId ? { workspaceId } : "skip",
	) as
		| {
				aiWorkspaceContext?: string;
				aiAssistantCharacteristics?: string;
				workspaceSlashCommands?: StoredSlashCommand[];
		  }
		| undefined;
	const updateWorkspaceSettings = useMutation(api.workspaceSettings.update);
	const updateUser = useMutation(api.users.update);

	const currentMember = members?.find((m) => m.userId === currentUser?._id);
	const isAdmin = currentMember?.role === "admin";

	const workspaceCommands = useMemo<StoredSlashCommand[]>(
		() => (settings?.workspaceSlashCommands ?? []) as StoredSlashCommand[],
		[settings?.workspaceSlashCommands],
	);
	const personalCommands = useMemo<StoredSlashCommand[]>(
		() =>
			((
				currentUser as {
					personalSlashCommands?: StoredSlashCommand[];
				} | null
			)?.personalSlashCommands ?? []) as StoredSlashCommand[],
		[currentUser],
	);

	const [aboutMe, setAboutMe] = useState("");
	const [howToWorkWithMe, setHowToWorkWithMe] = useState("");
	const [workspaceContext, setWorkspaceContext] = useState("");
	const [assistantCharacteristics, setAssistantCharacteristics] = useState("");
	const [isSavingPersonal, setIsSavingPersonal] = useState(false);
	const [isSavingWorkspace, setIsSavingWorkspace] = useState(false);

	const [commandDialogOpen, setCommandDialogOpen] = useState(false);
	const [commandDialogMode, setCommandDialogMode] = useState<"create" | "edit">(
		"create",
	);
	const [commandDialogScope, setCommandDialogScope] =
		useState<SlashCommandScope>("personal");
	const [editingCommand, setEditingCommand] = useState<
		StoredSlashCommand | undefined
	>(undefined);

	useEffect(() => {
		if (!currentUser) return;
		setAboutMe((currentUser as { aiAboutMe?: string }).aiAboutMe ?? "");
		setHowToWorkWithMe(
			(currentUser as { aiHowToWorkWithMe?: string }).aiHowToWorkWithMe ?? "",
		);
	}, [currentUser]);

	useEffect(() => {
		setWorkspaceContext(settings?.aiWorkspaceContext ?? "");
		setAssistantCharacteristics(settings?.aiAssistantCharacteristics ?? "");
	}, [settings]);

	const openCreateDialog = useCallback((scope: SlashCommandScope) => {
		setEditingCommand(undefined);
		setCommandDialogMode("create");
		setCommandDialogScope(scope);
		setCommandDialogOpen(true);
	}, []);

	const openEditDialog = useCallback(
		(scope: SlashCommandScope, command: StoredSlashCommand) => {
			setEditingCommand(command);
			setCommandDialogMode("edit");
			setCommandDialogScope(scope);
			setCommandDialogOpen(true);
		},
		[],
	);

	const existingNamesForDialog = useMemo(() => {
		const targetCommands =
			commandDialogScope === "workspace" ? workspaceCommands : personalCommands;
		const excludedId = editingCommand?.id;
		return targetCommands
			.filter((command) => command.id !== excludedId)
			.map((command) => normalizeSlashCommandName(command.command));
	}, [commandDialogScope, workspaceCommands, personalCommands, editingCommand]);

	const saveCommandsForScope = useCallback(
		async (scope: SlashCommandScope, commands: StoredSlashCommand[]) => {
			if (scope === "workspace") {
				if (!workspaceId) return;
				if (!isAdmin) {
					toast.error("Only admins can modify workspace commands");
					return;
				}
				await (
					updateWorkspaceSettings as unknown as (args: {
						workspaceId: Id<"workspaces">;
						workspaceSlashCommands: StoredSlashCommand[];
					}) => Promise<void>
				)({
					workspaceId,
					workspaceSlashCommands: commands,
				});
				return;
			}

			await (
				updateUser as unknown as (args: {
					personalSlashCommands: StoredSlashCommand[];
				}) => Promise<void>
			)({
				personalSlashCommands: commands,
			});
		},
		[workspaceId, isAdmin, updateWorkspaceSettings, updateUser],
	);

	const handleSaveCommand = useCallback(
		async (command: StoredSlashCommand) => {
			const normalized = normalizeSlashCommandName(command.command);
			if (isBuiltInCommandName(normalized)) {
				toast.error(`/${normalized} is reserved by a built-in command`);
				return;
			}

			const targetCommands =
				commandDialogScope === "workspace"
					? workspaceCommands
					: personalCommands;
			const otherScopeCommands =
				commandDialogScope === "workspace"
					? personalCommands
					: workspaceCommands;

			const existsInOtherScope = otherScopeCommands.some(
				(existing) =>
					normalizeSlashCommandName(existing.command) === normalized &&
					existing.id !== command.id,
			);
			if (existsInOtherScope) {
				toast.error(
					`/${normalized} already exists in ${commandDialogScope === "workspace" ? "your personal commands" : "workspace commands"}`,
				);
				return;
			}

			const nextCommands = targetCommands.some(
				(existing) => existing.id === command.id,
			)
				? targetCommands.map((existing) =>
						existing.id === command.id ? command : existing,
					)
				: [...targetCommands, command];

			try {
				await saveCommandsForScope(commandDialogScope, nextCommands);
				toast.success(
					commandDialogMode === "create"
						? "Slash command created"
						: "Slash command updated",
				);
			} catch (error) {
				toast.error(
					error instanceof Error
						? error.message
						: "Failed to save slash command",
				);
				throw error;
			}
		},
		[
			commandDialogScope,
			commandDialogMode,
			personalCommands,
			saveCommandsForScope,
			workspaceCommands,
		],
	);

	const handleDeleteCommand = useCallback(
		async (scope: SlashCommandScope, commandId: string) => {
			const targetCommands =
				scope === "workspace" ? workspaceCommands : personalCommands;
			const nextCommands = targetCommands.filter(
				(command) => command.id !== commandId,
			);
			try {
				await saveCommandsForScope(scope, nextCommands);
				toast.success("Slash command deleted");
			} catch (error) {
				toast.error(
					error instanceof Error
						? error.message
						: "Failed to delete slash command",
				);
			}
		},
		[personalCommands, saveCommandsForScope, workspaceCommands],
	);

	const handleToggleShortcut = useCallback(
		async (scope: SlashCommandScope, command: StoredSlashCommand) => {
			const targetCommands =
				scope === "workspace" ? workspaceCommands : personalCommands;
			const nextCommands = targetCommands.map((existing) =>
				existing.id === command.id
					? {
							...existing,
							isShortcut: !existing.isShortcut,
							updatedAt: Date.now(),
						}
					: existing,
			);
			try {
				await saveCommandsForScope(scope, nextCommands);
			} catch (error) {
				toast.error(
					error instanceof Error
						? error.message
						: "Failed to update shortcut state",
				);
			}
		},
		[personalCommands, saveCommandsForScope, workspaceCommands],
	);

	const handleSavePersonalization = useCallback(async () => {
		setIsSavingPersonal(true);
		try {
			await (
				updateUser as unknown as (args: {
					aiAboutMe: string;
					aiHowToWorkWithMe: string;
				}) => Promise<void>
			)({
				aiAboutMe: aboutMe.trim(),
				aiHowToWorkWithMe: howToWorkWithMe.trim(),
			});
			toast.success("Personal AI preferences saved");
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Failed to save preferences",
			);
		} finally {
			setIsSavingPersonal(false);
		}
	}, [aboutMe, howToWorkWithMe, updateUser]);

	const handleSaveWorkspaceProfile = useCallback(async () => {
		if (!workspaceId) return;
		if (!isAdmin) {
			toast.error("Only admins can update workspace AI configuration");
			return;
		}
		setIsSavingWorkspace(true);
		try {
			await (
				updateWorkspaceSettings as unknown as (args: {
					workspaceId: Id<"workspaces">;
					aiWorkspaceContext: string;
					aiAssistantCharacteristics: string;
				}) => Promise<void>
			)({
				workspaceId,
				aiWorkspaceContext: workspaceContext.trim(),
				aiAssistantCharacteristics: assistantCharacteristics.trim(),
			});
			toast.success("Workspace AI profile saved");
		} catch (error) {
			toast.error(
				error instanceof Error
					? error.message
					: "Failed to save workspace AI profile",
			);
		} finally {
			setIsSavingWorkspace(false);
		}
	}, [
		workspaceId,
		isAdmin,
		updateWorkspaceSettings,
		workspaceContext,
		assistantCharacteristics,
	]);

	const renderCommandList = (
		title: string,
		description: string,
		scope: SlashCommandScope,
		commands: StoredSlashCommand[],
		canManage: boolean,
	) => (
		<div className="space-y-3">
			<div className="flex flex-wrap items-start justify-between gap-2">
				<div>
					<h4 className="text-sm font-semibold text-foreground">{title}</h4>
					<p className="text-xs text-muted-foreground">{description}</p>
				</div>
				{canManage && (
					<Button
						size="sm"
						variant="outline"
						className="h-8 gap-1"
						onClick={() => openCreateDialog(scope)}
					>
						<Plus className="h-3.5 w-3.5" />
						Add
					</Button>
				)}
			</div>

			{commands.length === 0 ? (
				<div className="rounded-xl border border-dashed border-border bg-muted/20 px-4 py-4 text-sm text-muted-foreground">
					No commands yet.
				</div>
			) : (
				<div className="space-y-2">
					{commands.map((command) => (
						<div
							key={command.id}
							className="rounded-xl border border-border bg-card/70 px-4 py-3"
						>
							<div className="flex flex-wrap items-start justify-between gap-3">
								<div className="min-w-0 space-y-1">
									<div className="flex flex-wrap items-center gap-2">
										<p className="text-sm font-semibold text-foreground">
											/{command.command}
										</p>
										{command.isShortcut && (
											<span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-300">
												Shortcut
											</span>
										)}
									</div>
									<p className="text-xs text-muted-foreground">
										{command.description || "No description"}
									</p>
								</div>
								<div className="flex items-center gap-1">
									{canManage && (
										<>
											<Switch
												checked={command.isShortcut}
												onCheckedChange={() =>
													handleToggleShortcut(scope, command)
												}
											/>
											<Button
												variant="ghost"
												size="icon"
												className="h-8 w-8"
												onClick={() => openEditDialog(scope, command)}
											>
												<PencilSimpleLine className="h-4 w-4" />
											</Button>
											<Button
												variant="ghost"
												size="icon"
												className="h-8 w-8 text-muted-foreground hover:text-destructive"
												onClick={() => handleDeleteCommand(scope, command.id)}
											>
												<TrashSimple className="h-4 w-4" />
											</Button>
										</>
									)}
								</div>
							</div>
						</div>
					))}
				</div>
			)}
		</div>
	);

	const slashCommandsPanel = (
		<div className="space-y-6">
			<div className="space-y-3">
				<h4 className="text-sm font-semibold text-foreground">
					Built-in commands
				</h4>
				<div className="grid gap-2 md:grid-cols-2">
					{BUILT_IN_SLASH_COMMANDS.map((command) => (
						<div
							key={command.name}
							className="rounded-xl border border-border bg-card/70 px-4 py-3"
						>
							<div className="text-sm font-semibold text-foreground">
								{command.displayName}
							</div>
							<div className="text-xs text-muted-foreground">
								{command.description}
							</div>
						</div>
					))}
				</div>
			</div>

			{renderCommandList(
				"Workspace commands",
				"Shared command shortcuts for everyone in this workspace.",
				"workspace",
				workspaceCommands,
				Boolean(isAdmin),
			)}

			{renderCommandList(
				"My commands",
				"Private commands only visible in your chat experience.",
				"personal",
				personalCommands,
				Boolean(currentUser),
			)}
		</div>
	);

	if (mode === "slash-commands") {
		return (
			<div className="space-y-8">
				<div>
					<PaneTitle className="text-xl">Slash commands</PaneTitle>
					<PaneDescription className="mt-1">
						Three command sets are available: built-in, workspace commands, and
						your personal commands. Mark any custom command as a shortcut for
						faster access.
					</PaneDescription>
				</div>

				<Separator />

				{slashCommandsPanel}

				<SlashCommandDialog
					open={commandDialogOpen}
					onOpenChange={setCommandDialogOpen}
					mode={commandDialogMode}
					scope={commandDialogScope}
					command={editingCommand}
					existingNames={existingNamesForDialog}
					onSave={handleSaveCommand}
				/>
			</div>
		);
	}

	return (
		<div className="space-y-8">
			<div>
				<PaneTitle className="text-xl">Clave AI</PaneTitle>
				<PaneDescription className="mt-1">
					Personalize how Clave behaves in your workspace and manage reusable
					slash commands.
				</PaneDescription>
			</div>

			<Separator />

			<SettingSection title="Personalization">
				<SettingRow
					label="About me"
					description="Add personal context Clave should remember when helping you."
				>
					<textarea
						value={aboutMe}
						onChange={(e) => setAboutMe(e.target.value)}
						className="min-h-[110px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-xs placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
						placeholder="Your role, goals, and preferred working context"
					/>
				</SettingRow>
				<SettingRow
					label="How to work with me"
					description="Response preferences, tone, detail level, and formatting."
				>
					<textarea
						value={howToWorkWithMe}
						onChange={(e) => setHowToWorkWithMe(e.target.value)}
						className="min-h-[110px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-xs placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
						placeholder="Example: concise bullet points, ask clarifying questions before making assumptions"
					/>
				</SettingRow>
				<div className="flex justify-end">
					<Button
						size="sm"
						onClick={handleSavePersonalization}
						disabled={isSavingPersonal}
					>
						{isSavingPersonal ? "Saving..." : "Save personal preferences"}
					</Button>
				</div>
			</SettingSection>

			<Separator />

			<SettingSection title="Workspace AI profile">
				<SettingRow
					label="Workspace context"
					description="Shared context for this workspace, available to all Clave conversations."
				>
					<textarea
						value={workspaceContext}
						onChange={(e) => setWorkspaceContext(e.target.value)}
						className="min-h-[110px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-xs placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
						placeholder="Team process, domain constraints, preferred terminology"
						disabled={!isAdmin}
					/>
				</SettingRow>
				<SettingRow
					label="Assistant characteristics"
					description="Define how Clave should behave by default in this workspace."
				>
					<textarea
						value={assistantCharacteristics}
						onChange={(e) => setAssistantCharacteristics(e.target.value)}
						className="min-h-[110px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-xs placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
						placeholder="Example: decision-oriented, concise, references linked issues and docs"
						disabled={!isAdmin}
					/>
				</SettingRow>
				<div className="flex justify-end">
					<Button
						size="sm"
						onClick={handleSaveWorkspaceProfile}
						disabled={!isAdmin || isSavingWorkspace}
					>
						{isSavingWorkspace ? "Saving..." : "Save workspace AI profile"}
					</Button>
				</div>
			</SettingSection>

			<Separator />

			<SettingSection title="Slash commands">
				<SettingRow
					label="Manage slash commands"
					description="Create personal and workspace slash commands in the dedicated section."
				>
					<Button asChild variant="outline" size="sm">
						<Link href="?section=slash-commands" prefetch={false}>
							Open slash command settings
						</Link>
					</Button>
				</SettingRow>
			</SettingSection>

			<SlashCommandDialog
				open={commandDialogOpen}
				onOpenChange={setCommandDialogOpen}
				mode={commandDialogMode}
				scope={commandDialogScope}
				command={editingCommand}
				existingNames={existingNamesForDialog}
				onSave={handleSaveCommand}
			/>
		</div>
	);
}

export function SlashCommandsSettingsPane() {
	return <ClaveAISettingsPane mode="slash-commands" />;
}
