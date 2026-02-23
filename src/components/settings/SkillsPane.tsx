"use client";

import {
	Circle,
	CircleNotch,
	PencilSimpleLine,
	Plus,
	Robot,
	ShieldCheck,
	SlidersHorizontal,
	Sparkle,
	TrashSimple,
} from "@phosphor-icons/react/dist/ssr";
import { useAction, useMutation, useQuery } from "convex/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { useWorkspaceOptional } from "@/components/providers/workspace-context";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
	AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { SkillDialog } from "./SkillDialog";
import { PaneDescription, PaneTitle } from "./settings-shared";

const CATEGORY_ICONS: Record<
	string,
	React.ComponentType<{ className?: string }>
> = {
	Design: Sparkle,
	DevOps: ShieldCheck,
	Docs: PencilSimpleLine,
	PM: SlidersHorizontal,
	Engineering: Robot,
};

type SkillsCatalogItem = {
	id: string;
	skillId: string;
	name: string;
	installs: number;
	source: string;
};

export function SkillsSettingsPane() {
	const workspace = useWorkspaceOptional();
	const workspaceId = workspace?.workspaceId;
	const skills = useQuery(
		api.ai.skills.list,
		workspaceId ? { workspaceId } : "skip",
	);
	const toggleSkill = useMutation(api.ai.skills.toggle);
	const removeSkill = useMutation(api.ai.skills.remove);
	const createSkill = useMutation(api.ai.skills.create);
	const updateSkill = useMutation(api.ai.skills.update);
	const searchSkillsCatalog = useAction(api.ai.skillsCatalog.search);
	const importCatalogSkill = useAction(api.ai.skillsCatalog.importFromCatalog);

	// Dialog state
	const [dialogOpen, setDialogOpen] = useState(false);
	const [dialogMode, setDialogMode] = useState<"create" | "edit">("create");
	const [editingSkill, setEditingSkill] = useState<
		| {
				_id: Id<"skills">;
				name: string;
				description: string;
				category: string;
				markdownContent: string;
				isEnabled: boolean;
		  }
		| undefined
	>(undefined);
	const [catalogQuery, setCatalogQuery] = useState("");
	const [catalogSearchType, setCatalogSearchType] = useState("fuzzy");
	const [catalogResults, setCatalogResults] = useState<SkillsCatalogItem[]>([]);
	const [catalogSearching, setCatalogSearching] = useState(false);
	const [catalogError, setCatalogError] = useState<string | null>(null);
	const [importingCatalogSkillId, setImportingCatalogSkillId] = useState<
		string | null
	>(null);

	const openCreateDialog = useCallback(() => {
		setDialogMode("create");
		setEditingSkill(undefined);
		setDialogOpen(true);
	}, []);

	const openEditDialog = useCallback(
		(skill: {
			_id: Id<"skills">;
			name: string;
			description: string;
			category: string;
			markdownContent: string;
			isEnabled: boolean;
		}) => {
			setDialogMode("edit");
			setEditingSkill(skill);
			setDialogOpen(true);
		},
		[],
	);

	const handleToggle = async (skillId: Id<"skills">) => {
		try {
			await toggleSkill({ skillId });
		} catch {
			toast.error("Failed to toggle skill");
		}
	};

	const handleDelete = async (skillId: Id<"skills">) => {
		try {
			await removeSkill({ skillId });
			toast.success("Skill deleted");
		} catch {
			toast.error("Failed to delete skill");
		}
	};

	const importedSkillsByKey = useMemo(() => {
		const map = new Map<string, { skillId: Id<"skills">; name: string }>();
		for (const skill of skills ?? []) {
			const sourceRepo = (skill as { sourceRepo?: string }).sourceRepo;
			const sourceSkillId = (skill as { sourceSkillId?: string }).sourceSkillId;
			if (sourceRepo && sourceSkillId) {
				map.set(`${sourceRepo}/${sourceSkillId}`, {
					skillId: skill._id,
					name: skill.name,
				});
			}
		}
		return map;
	}, [skills]);

	const importSkillViaApiRoute = useCallback(
		async (catalogSkill: SkillsCatalogItem) => {
			if (!workspaceId) {
				throw new Error("Workspace is not ready");
			}

			const params = new URLSearchParams({
				source: catalogSkill.source,
				skillId: catalogSkill.skillId,
			});
			const response = await fetch(`/api/skills/import?${params.toString()}`);
			let payload:
				| {
						name: string;
						description: string;
						category: string;
						markdownContent: string;
						sourceUrl: string;
						error?: string;
				  }
				| undefined;
			try {
				payload = (await response.json()) as typeof payload;
			} catch {
				payload = undefined;
			}

			if (!response.ok || !payload) {
				throw new Error(
					payload?.error || "Failed to import skill from skills.sh",
				);
			}
			const resolvedName = (catalogSkill.name || payload.name).trim();

			const lookupKey = `${catalogSkill.source}/${catalogSkill.skillId}`;
			const existingImported = importedSkillsByKey.get(lookupKey);
			if (existingImported) {
				await updateSkill({
					skillId: existingImported.skillId,
					name: resolvedName,
					description: payload.description,
					category: payload.category,
					markdownContent: payload.markdownContent,
					isEnabled: true,
					sourceProvider: "skills.sh",
					sourceRepo: catalogSkill.source,
					sourceSkillId: catalogSkill.skillId,
					sourceUrl: payload.sourceUrl,
				});
				return { created: false, name: resolvedName };
			}

			const baseCreatePayload = {
				workspaceId,
				name: resolvedName,
				description: payload.description,
				category: payload.category,
				markdownContent: payload.markdownContent,
				sourceProvider: "skills.sh",
				sourceRepo: catalogSkill.source,
				sourceSkillId: catalogSkill.skillId,
				sourceUrl: payload.sourceUrl,
			} as const;

			try {
				await createSkill(baseCreatePayload);
				return { created: true, name: resolvedName };
			} catch (error) {
				const message =
					error instanceof Error ? error.message.toLowerCase() : "";
				if (!message.includes("already exists")) {
					throw error;
				}
				const fallbackName = `${resolvedName} (${catalogSkill.skillId})`;
				await createSkill({
					...baseCreatePayload,
					name: fallbackName,
				});
				return { created: true, name: fallbackName };
			}
		},
		[workspaceId, importedSkillsByKey, updateSkill, createSkill],
	);

	useEffect(() => {
		if (!workspaceId) {
			setCatalogResults([]);
			return;
		}

		const trimmedQuery = catalogQuery.trim();
		if (!trimmedQuery) {
			setCatalogResults([]);
			setCatalogError(null);
			return;
		}

		let cancelled = false;
		const timeoutId = window.setTimeout(async () => {
			setCatalogSearching(true);
			setCatalogError(null);
			try {
				const result = await searchSkillsCatalog({
					workspaceId,
					query: trimmedQuery,
					limit: 12,
				});
				if (cancelled) return;
				setCatalogResults(result.skills as SkillsCatalogItem[]);
				setCatalogSearchType(result.searchType);
			} catch (error) {
				if (cancelled) return;
				setCatalogError(
					error instanceof Error ? error.message : "Failed to search skills.sh",
				);
				setCatalogResults([]);
			} finally {
				if (!cancelled) {
					setCatalogSearching(false);
				}
			}
		}, 250);

		return () => {
			cancelled = true;
			window.clearTimeout(timeoutId);
		};
	}, [workspaceId, catalogQuery, searchSkillsCatalog]);

	const handleImportFromCatalog = useCallback(
		async (catalogSkill: SkillsCatalogItem) => {
			if (!workspaceId) return;
			setImportingCatalogSkillId(catalogSkill.id);
			try {
				let result: { created: boolean; name: string };
				try {
					const importResult = await importCatalogSkill({
						workspaceId,
						source: catalogSkill.source,
						skillId: catalogSkill.skillId,
						name: catalogSkill.name,
					});
					result = {
						created: importResult.created,
						name: importResult.name,
					};
				} catch {
					// Fallback path if Convex action isn't available yet in the running deployment.
					result = await importSkillViaApiRoute(catalogSkill);
				}
				toast.success(
					result.created
						? `Imported "${result.name}" from skills.sh`
						: `Updated "${result.name}"`,
				);
			} catch (error) {
				toast.error(
					error instanceof Error
						? error.message
						: "Failed to import skill from skills.sh",
				);
			} finally {
				setImportingCatalogSkillId(null);
			}
		},
		[workspaceId, importCatalogSkill, importSkillViaApiRoute],
	);

	const isLoading = skills === undefined;

	return (
		<div className="space-y-8">
			<div className="flex flex-wrap items-start justify-between gap-4">
				<div>
					<PaneTitle className="text-xl">Skills</PaneTitle>
					<PaneDescription className="mt-1">
						Skills are reusable instruction sets that modify how AI agents
						behave. Attach them to agents or enable them workspace-wide.
					</PaneDescription>
				</div>
				<Button size="sm" className="gap-2" onClick={openCreateDialog}>
					<Plus className="h-4 w-4" />
					Create skill
				</Button>
			</div>

			<Separator />

			<div className="space-y-4">
				<div>
					<div>
						<h3 className="text-sm font-semibold text-foreground">
							Import from skills.sh
						</h3>
						<p className="mt-1 text-xs text-muted-foreground">
							Search the public skills.sh directory and save skills directly to
							this workspace.
						</p>
					</div>
				</div>

				<div className="space-y-2">
					<Input
						value={catalogQuery}
						onChange={(event) => setCatalogQuery(event.target.value)}
						placeholder="Search skills.sh (e.g. frontend-design, testing, convex)"
					/>

					{catalogSearching ? (
						<div className="flex items-center gap-2 rounded-lg border border-border/60 bg-card/50 px-3 py-2 text-xs text-muted-foreground">
							<CircleNotch className="h-3.5 w-3.5 animate-spin" />
							Searching skills.sh...
						</div>
					) : catalogError ? (
						<div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
							{catalogError}
						</div>
					) : null}

					{catalogQuery.trim().length > 0 &&
					!catalogSearching &&
					catalogResults.length === 0 &&
					!catalogError ? (
						<div className="rounded-lg border border-dashed border-border bg-muted/20 px-3 py-3 text-xs text-muted-foreground">
							No matches found on skills.sh.
						</div>
					) : null}

					{catalogResults.length > 0 ? (
						<div className="space-y-2">
							<p className="text-[11px] uppercase tracking-wide text-muted-foreground">
								{catalogSearchType} matches
							</p>
							{catalogResults.map((catalogSkill) => {
								const lookupKey = `${catalogSkill.source}/${catalogSkill.skillId}`;
								const isImported = importedSkillsByKey.has(lookupKey);
								const isImporting = importingCatalogSkillId === catalogSkill.id;
								return (
									<div
										key={catalogSkill.id}
										className="flex flex-col gap-3 rounded-xl border border-border bg-card/70 px-3 py-3 sm:flex-row sm:items-center sm:justify-between"
									>
										<div className="min-w-0">
											<div className="flex flex-wrap items-center gap-2">
												<p className="truncate text-sm font-semibold text-foreground">
													{catalogSkill.name}
												</p>
												{isImported ? (
													<span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-400">
														Saved
													</span>
												) : null}
											</div>
											<p className="truncate text-xs text-muted-foreground">
												{catalogSkill.source} / {catalogSkill.skillId}
											</p>
											<p className="text-[11px] text-muted-foreground">
												{new Intl.NumberFormat("en-US", {
													notation: "compact",
													maximumFractionDigits: 1,
												}).format(catalogSkill.installs)}{" "}
												weekly installs
											</p>
										</div>
										<div className="flex items-center gap-2">
											<Button asChild variant="ghost" size="sm">
												<a
													href={`https://skills.sh/${catalogSkill.source}/${catalogSkill.skillId}`}
													target="_blank"
													rel="noreferrer"
												>
													View
												</a>
											</Button>
											<Button
												size="sm"
												onClick={() => handleImportFromCatalog(catalogSkill)}
												disabled={isImporting}
											>
												{isImporting ? (
													<>
														<CircleNotch className="mr-2 h-3.5 w-3.5 animate-spin" />
														Importing
													</>
												) : isImported ? (
													"Sync"
												) : (
													"Import"
												)}
											</Button>
										</div>
									</div>
								);
							})}
						</div>
					) : null}
				</div>
			</div>

			<Separator />

			{isLoading ? (
				<div className="flex items-center justify-center py-12">
					<CircleNotch className="h-6 w-6 animate-spin text-muted-foreground" />
				</div>
			) : skills.length === 0 ? (
				<div className="rounded-2xl border border-dashed border-border bg-muted/20 p-8 text-center">
					<Sparkle className="mx-auto h-10 w-10 text-muted-foreground/50" />
					<h3 className="mt-3 text-sm font-semibold text-foreground">
						No skills yet
					</h3>
					<p className="mx-auto mt-1 max-w-sm text-xs text-muted-foreground">
						Skills are markdown instruction sets that shape how your AI agents
						respond. Create one to get started.
					</p>
					<Button size="sm" className="mt-4 gap-2" onClick={openCreateDialog}>
						<Plus className="h-4 w-4" />
						Create your first skill
					</Button>
				</div>
			) : (
				<div className="space-y-3">
					{skills.map(
						(skill: {
							_id: Id<"skills">;
							name: string;
							description: string;
							category: string;
							markdownContent: string;
							isEnabled: boolean;
							createdBy: Id<"users">;
							updatedAt: number;
						}) => {
							const Icon = CATEGORY_ICONS[skill.category] ?? Sparkle;
							return (
								<div
									key={skill._id}
									className="flex flex-col gap-4 rounded-2xl border border-border bg-card/70 p-4 sm:flex-row sm:items-center sm:justify-between"
								>
									<div className="space-y-3 min-w-0">
										<div className="flex items-start gap-3">
											<div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
												<Icon className="h-4 w-4" />
											</div>
											<div className="min-w-0 space-y-1">
												<p className="text-sm font-semibold text-foreground truncate">
													{skill.name}
												</p>
												<p className="text-xs text-muted-foreground line-clamp-2">
													{skill.description}
												</p>
											</div>
										</div>
										<div className="flex flex-wrap gap-2 text-[11px] text-muted-foreground">
											<span className="rounded-full border border-border/70 px-2 py-0.5">
												{skill.category}
											</span>
										</div>
									</div>
									<div className="flex shrink-0 items-center gap-2">
										<span
											className={cn(
												"text-xs font-semibold",
												skill.isEnabled
													? "text-emerald-400"
													: "text-muted-foreground",
											)}
										>
											{skill.isEnabled ? "Active" : "Paused"}
										</span>
										<Switch
											checked={skill.isEnabled}
											onCheckedChange={() => handleToggle(skill._id)}
										/>
										<Button
											variant="ghost"
											size="icon"
											className="h-8 w-8 text-muted-foreground hover:text-foreground"
											onClick={() => openEditDialog(skill)}
										>
											<PencilSimpleLine className="h-4 w-4" />
										</Button>
										<AlertDialog>
											<AlertDialogTrigger asChild>
												<Button
													variant="ghost"
													size="icon"
													className="h-8 w-8 text-muted-foreground hover:text-destructive"
												>
													<TrashSimple className="h-4 w-4" />
												</Button>
											</AlertDialogTrigger>
											<AlertDialogContent>
												<AlertDialogHeader>
													<AlertDialogTitle>Delete skill</AlertDialogTitle>
													<AlertDialogDescription>
														Are you sure you want to delete &ldquo;{skill.name}
														&rdquo;? This will also detach it from any agents.
													</AlertDialogDescription>
												</AlertDialogHeader>
												<AlertDialogFooter>
													<AlertDialogCancel>Cancel</AlertDialogCancel>
													<AlertDialogAction
														onClick={() => handleDelete(skill._id)}
													>
														Delete
													</AlertDialogAction>
												</AlertDialogFooter>
											</AlertDialogContent>
										</AlertDialog>
									</div>
								</div>
							);
						},
					)}
				</div>
			)}

			<SkillDialog
				open={dialogOpen}
				onOpenChange={setDialogOpen}
				mode={dialogMode}
				skill={editingSkill}
			/>
		</div>
	);
}
