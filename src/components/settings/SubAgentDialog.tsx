"use client";

import { Check, CircleNotch, Sparkle } from "@phosphor-icons/react/dist/ssr";
import { useMutation, useQuery } from "convex/react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { useWorkspaceOptional } from "@/components/providers/workspace-context";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { AI_MODELS } from "@/lib/ai-models";
import { cn } from "@/lib/utils";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

type RagContentType = "issue" | "document" | "comment" | "github_file";

type SubAgentData = {
	_id: Id<"subAgents">;
	name: string;
	description: string;
	avatar?: string;
	instructions: string;
	model?: string;
	enabledTools?: string[];
	ragContentTypes?: RagContentType[];
	isShared: boolean;
	isPreset: boolean;
};

type SubAgentDialogProps = {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	mode: "create" | "edit" | "duplicate";
	agent?: SubAgentData;
};

const MODEL_OPTIONS = [
	{ value: "__default__", label: "Workspace default" },
	...AI_MODELS.map((model) => ({
		value: model.id,
		label: model.label,
	})),
];

const AVAILABLE_TOOLS = [
	{ id: "createIssue", label: "Create issue" },
	{ id: "updateIssue", label: "Update issue" },
	{ id: "searchIssues", label: "Search issues" },
	{ id: "createDocument", label: "Create document" },
	{ id: "readDocument", label: "Read document" },
	{ id: "searchDocuments", label: "Search documents" },
	{ id: "getProjectContext", label: "Get project context" },
	{ id: "listProjectMembers", label: "List project members" },
] as const;

const RAG_CONTENT_TYPES: { id: RagContentType; label: string }[] = [
	{ id: "issue", label: "Issues" },
	{ id: "document", label: "Documents" },
	{ id: "comment", label: "Comments" },
	{ id: "github_file", label: "GitHub files" },
];

const INSTRUCTIONS_PLACEHOLDER = `You are a specialized AI agent for [role].

## Core Responsibilities
- [List key tasks]

## Constraints
- [List boundaries]

## Tone & Style
- [Describe communication style]`;

export function SubAgentDialog({
	open,
	onOpenChange,
	mode,
	agent,
}: SubAgentDialogProps) {
	const workspace = useWorkspaceOptional();
	const createAgent = useMutation(api.ai.subAgents.create);
	const updateAgent = useMutation(api.ai.subAgents.update);
	const skills = useQuery(
		api.ai.skills.list,
		workspace ? { workspaceId: workspace.workspaceId } : "skip",
	);
	const attachedSkills = useQuery(
		api.ai.skills.listByAgent,
		mode === "edit" && agent ? { subAgentId: agent._id } : "skip",
	);
	const attachSkill = useMutation(api.ai.skills.attachToAgent);
	const detachSkill = useMutation(api.ai.skills.detachFromAgent);

	// ── Form state ──────────────────────────────────────────────────────
	const [name, setName] = useState("");
	const [description, setDescription] = useState("");
	const [avatar, setAvatar] = useState("");
	const [instructions, setInstructions] = useState("");
	const [model, setModel] = useState("__default__");
	const [enabledTools, setEnabledTools] = useState<string[]>([]);
	const [ragContentTypes, setRagContentTypes] = useState<RagContentType[]>([]);
	const [isShared, setIsShared] = useState(false);
	const [selectedSkillIds, setSelectedSkillIds] = useState<Set<Id<"skills">>>(
		new Set(),
	);
	const [saving, setSaving] = useState(false);
	const [nameError, setNameError] = useState("");
	const [instructionsError, setInstructionsError] = useState("");

	// ── Initialize form on open ─────────────────────────────────────────
	useEffect(() => {
		if (!open) return;

		if ((mode === "edit" || mode === "duplicate") && agent) {
			setName(mode === "duplicate" ? `${agent.name} (copy)` : agent.name);
			setDescription(agent.description);
			setAvatar(agent.avatar ?? "");
			setInstructions(agent.instructions);
			setModel(agent.model ?? "__default__");
			setEnabledTools(agent.enabledTools ?? []);
			setRagContentTypes(agent.ragContentTypes ?? []);
			setIsShared(mode === "duplicate" ? false : agent.isShared);
		} else {
			setName("");
			setDescription("");
			setAvatar("");
			setInstructions("");
			setModel("__default__");
			setEnabledTools([]);
			setRagContentTypes([]);
			setIsShared(false);
		}
		setNameError("");
		setInstructionsError("");
		setSaving(false);
	}, [open, mode, agent]);

	// Sync attached skills when query loads (edit mode only)
	useEffect(() => {
		if (mode === "edit" && attachedSkills) {
			setSelectedSkillIds(
				new Set(attachedSkills.map((s: { _id: Id<"skills"> }) => s._id)),
			);
		} else if (mode === "duplicate" && attachedSkills) {
			setSelectedSkillIds(
				new Set(attachedSkills.map((s: { _id: Id<"skills"> }) => s._id)),
			);
		} else if (mode === "create") {
			setSelectedSkillIds(new Set());
		}
	}, [mode, attachedSkills]);

	// ── Tool toggle ─────────────────────────────────────────────────────
	const toggleTool = useCallback((toolId: string) => {
		setEnabledTools((prev) =>
			prev.includes(toolId)
				? prev.filter((t) => t !== toolId)
				: [...prev, toolId],
		);
	}, []);

	// ── RAG type toggle ─────────────────────────────────────────────────
	const toggleRagType = useCallback((typeId: RagContentType) => {
		setRagContentTypes((prev) =>
			prev.includes(typeId)
				? prev.filter((t) => t !== typeId)
				: [...prev, typeId],
		);
	}, []);

	// ── Skill toggle ────────────────────────────────────────────────────
	const toggleSkill = useCallback((skillId: Id<"skills">) => {
		setSelectedSkillIds((prev) => {
			const next = new Set(prev);
			if (next.has(skillId)) {
				next.delete(skillId);
			} else {
				next.add(skillId);
			}
			return next;
		});
	}, []);

	// ── Save handler ────────────────────────────────────────────────────
	const handleSave = useCallback(async () => {
		// Validate
		let hasError = false;
		if (!name.trim()) {
			setNameError("Name is required");
			hasError = true;
		} else {
			setNameError("");
		}
		if (!instructions.trim()) {
			setInstructionsError("Instructions are required");
			hasError = true;
		} else {
			setInstructionsError("");
		}
		if (hasError) return;

		if (!workspace) return;

		setSaving(true);
		try {
			const modelValue = model === "__default__" ? undefined : model;
			const toolsValue = enabledTools.length > 0 ? enabledTools : undefined;
			const ragValue = ragContentTypes.length > 0 ? ragContentTypes : undefined;

			if (mode === "edit" && agent) {
				// Update existing agent
				await updateAgent({
					id: agent._id,
					name: name.trim(),
					description: description.trim(),
					avatar: avatar.trim() || undefined,
					instructions: instructions.trim(),
					model: modelValue,
					enabledTools: toolsValue,
					ragContentTypes: ragValue,
					isShared,
				});

				// Handle skill attachment changes
				const previousIds = new Set<Id<"skills">>(
					(attachedSkills ?? []).map((s: { _id: Id<"skills"> }) => s._id),
				);
				// Attach newly selected skills
				for (const skillId of selectedSkillIds) {
					if (!previousIds.has(skillId)) {
						await attachSkill({
							subAgentId: agent._id,
							skillId,
						});
					}
				}
				// Detach removed skills
				for (const skillId of previousIds) {
					if (!selectedSkillIds.has(skillId)) {
						await detachSkill({
							subAgentId: agent._id,
							skillId,
						});
					}
				}

				toast.success("Agent updated");
			} else {
				// Create new agent (create or duplicate mode)
				const newAgentId = await createAgent({
					workspaceId: workspace.workspaceId,
					name: name.trim(),
					description: description.trim(),
					avatar: avatar.trim() || undefined,
					instructions: instructions.trim(),
					model: modelValue,
					enabledTools: toolsValue,
					ragContentTypes: ragValue,
					isShared,
				});

				// Attach selected skills to new agent
				for (const skillId of selectedSkillIds) {
					await attachSkill({
						subAgentId: newAgentId,
						skillId,
					});
				}

				toast.success(
					mode === "duplicate" ? "Agent duplicated" : "Agent created",
				);
			}

			onOpenChange(false);
		} catch (_error) {
			toast.error(
				mode === "edit" ? "Failed to update agent" : "Failed to create agent",
			);
		} finally {
			setSaving(false);
		}
	}, [
		name,
		description,
		avatar,
		instructions,
		model,
		enabledTools,
		ragContentTypes,
		isShared,
		selectedSkillIds,
		mode,
		agent,
		workspace,
		createAgent,
		updateAgent,
		attachSkill,
		detachSkill,
		attachedSkills,
		onOpenChange,
	]);

	const dialogTitle =
		mode === "edit"
			? "Edit agent"
			: mode === "duplicate"
				? "Duplicate agent"
				: "Create agent";

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-2xl max-h-[85vh] flex flex-col">
				<DialogHeader>
					<DialogTitle>{dialogTitle}</DialogTitle>
					<DialogDescription>
						{mode === "edit"
							? "Update your agent's configuration."
							: "Configure a specialized AI teammate with custom instructions and capabilities."}
					</DialogDescription>
				</DialogHeader>

				<div className="flex-1 overflow-y-auto space-y-6 py-2 pr-1">
					{/* ── Identity ──────────────────────────────────── */}
					<section className="space-y-4">
						<h3 className="text-sm font-semibold text-foreground">Identity</h3>
						<div className="grid gap-4">
							<div className="grid grid-cols-[1fr_80px] gap-4">
								<div className="grid gap-2">
									<Label htmlFor="agent-name">Name</Label>
									<Input
										id="agent-name"
										value={name}
										onChange={(e) => {
											setName(e.target.value);
											if (e.target.value.trim()) setNameError("");
										}}
										placeholder="e.g. Project Manager"
									/>
									{nameError && (
										<p className="text-xs text-destructive">{nameError}</p>
									)}
								</div>
								<div className="grid gap-2">
									<Label htmlFor="agent-avatar">Avatar</Label>
									<div className="relative">
										<Input
											id="agent-avatar"
											value={avatar}
											onChange={(e) => setAvatar(e.target.value)}
											placeholder="🤖"
											className="text-center text-lg"
											maxLength={4}
										/>
									</div>
								</div>
							</div>
							<div className="grid gap-2">
								<Label htmlFor="agent-description">Description</Label>
								<Textarea
									id="agent-description"
									value={description}
									onChange={(e) => setDescription(e.target.value)}
									placeholder="What does this agent do?"
									rows={2}
								/>
							</div>
						</div>
					</section>

					<Separator />

					{/* ── Behavior ─────────────────────────────────── */}
					<section className="space-y-4">
						<h3 className="text-sm font-semibold text-foreground">Behavior</h3>
						<div className="grid gap-4">
							<div className="grid gap-2">
								<Label htmlFor="agent-instructions">Instructions</Label>
								<Textarea
									id="agent-instructions"
									value={instructions}
									onChange={(e) => {
										setInstructions(e.target.value);
										if (e.target.value.trim()) setInstructionsError("");
									}}
									placeholder={INSTRUCTIONS_PLACEHOLDER}
									rows={8}
									className="font-mono text-sm"
								/>
								{instructionsError && (
									<p className="text-xs text-destructive">
										{instructionsError}
									</p>
								)}
							</div>
							<div className="grid gap-2">
								<Label>Model</Label>
								<Select value={model} onValueChange={setModel}>
									<SelectTrigger className="w-full">
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										{MODEL_OPTIONS.map((opt) => (
											<SelectItem key={opt.value} value={opt.value}>
												{opt.label}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</div>
						</div>
					</section>

					<Separator />

					{/* ── Capabilities ─────────────────────────────── */}
					<section className="space-y-4">
						<h3 className="text-sm font-semibold text-foreground">
							Capabilities
						</h3>
						<div className="grid gap-4">
							<div className="grid gap-2">
								<Label>Tool access</Label>
								<p className="text-xs text-muted-foreground">
									Select which tools this agent can use. Leave all unchecked for
									full access.
								</p>
								<div className="grid grid-cols-2 gap-2">
									{AVAILABLE_TOOLS.map((tool) => (
										<button
											key={tool.id}
											type="button"
											onClick={() => toggleTool(tool.id)}
											className={cn(
												"flex items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm transition",
												enabledTools.includes(tool.id)
													? "border-primary/50 bg-primary/5 text-foreground"
													: "border-border bg-card/50 text-muted-foreground hover:bg-muted/40",
											)}
										>
											<div
												className={cn(
													"flex h-4 w-4 shrink-0 items-center justify-center rounded border",
													enabledTools.includes(tool.id)
														? "border-primary bg-primary text-primary-foreground"
														: "border-muted-foreground/30",
												)}
											>
												{enabledTools.includes(tool.id) && (
													<Check className="h-3 w-3" weight="bold" />
												)}
											</div>
											{tool.label}
										</button>
									))}
								</div>
							</div>

							<div className="grid gap-2">
								<Label>Knowledge sources</Label>
								<p className="text-xs text-muted-foreground">
									Filter which content types the agent can search. Leave all
									unchecked for full access.
								</p>
								<div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
									{RAG_CONTENT_TYPES.map((ct) => (
										<button
											key={ct.id}
											type="button"
											onClick={() => toggleRagType(ct.id)}
											className={cn(
												"flex items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm transition",
												ragContentTypes.includes(ct.id)
													? "border-primary/50 bg-primary/5 text-foreground"
													: "border-border bg-card/50 text-muted-foreground hover:bg-muted/40",
											)}
										>
											<div
												className={cn(
													"flex h-4 w-4 shrink-0 items-center justify-center rounded border",
													ragContentTypes.includes(ct.id)
														? "border-primary bg-primary text-primary-foreground"
														: "border-muted-foreground/30",
												)}
											>
												{ragContentTypes.includes(ct.id) && (
													<Check className="h-3 w-3" weight="bold" />
												)}
											</div>
											{ct.label}
										</button>
									))}
								</div>
							</div>
						</div>
					</section>

					<Separator />

					{/* ── Sharing ──────────────────────────────────── */}
					<section className="space-y-4">
						<h3 className="text-sm font-semibold text-foreground">Sharing</h3>
						<div className="flex items-center justify-between rounded-xl border border-border bg-card/80 px-4 py-3">
							<div className="flex flex-col">
								<span className="text-sm text-foreground">
									Share with workspace
								</span>
								<span className="text-xs text-muted-foreground">
									Make this agent available to all workspace members
								</span>
							</div>
							<Switch checked={isShared} onCheckedChange={setIsShared} />
						</div>
					</section>

					<Separator />

					{/* ── Skills ───────────────────────────────────── */}
					<section className="space-y-4">
						<div className="flex items-center gap-2">
							<Sparkle className="h-4 w-4 text-muted-foreground" />
							<h3 className="text-sm font-semibold text-foreground">Skills</h3>
						</div>
						{skills && skills.length > 0 ? (
							<div className="grid gap-2">
								<p className="text-xs text-muted-foreground">
									Attach skills to customize this agent's behavior.
								</p>
								<div className="grid gap-2 sm:grid-cols-2">
									{skills.map(
										(skill: {
											_id: Id<"skills">;
											name: string;
											description: string;
										}) => (
											<button
												key={skill._id}
												type="button"
												onClick={() => toggleSkill(skill._id)}
												className={cn(
													"flex items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition",
													selectedSkillIds.has(skill._id)
														? "border-primary/50 bg-primary/5"
														: "border-border bg-card/50 hover:bg-muted/40",
												)}
											>
												<div
													className={cn(
														"flex h-4 w-4 shrink-0 items-center justify-center rounded border",
														selectedSkillIds.has(skill._id)
															? "border-primary bg-primary text-primary-foreground"
															: "border-muted-foreground/30",
													)}
												>
													{selectedSkillIds.has(skill._id) && (
														<Check className="h-3 w-3" weight="bold" />
													)}
												</div>
												<div className="min-w-0">
													<span className="text-sm font-medium text-foreground">
														{skill.name}
													</span>
													<p className="text-xs text-muted-foreground truncate">
														{skill.description}
													</p>
												</div>
											</button>
										),
									)}
								</div>
							</div>
						) : (
							<div className="rounded-xl border border-dashed border-border bg-muted/20 p-4 text-center">
								<Sparkle className="mx-auto h-6 w-6 text-muted-foreground/50" />
								<p className="mt-1.5 text-sm text-muted-foreground">
									No skills available. Create skills in the Skills settings.
								</p>
							</div>
						)}
					</section>
				</div>

				<DialogFooter className="pt-4">
					<Button
						variant="outline"
						onClick={() => onOpenChange(false)}
						disabled={saving}
					>
						Cancel
					</Button>
					<Button onClick={handleSave} disabled={saving}>
						{saving ? (
							<>
								<CircleNotch className="mr-2 h-4 w-4 animate-spin" />
								Saving...
							</>
						) : mode === "edit" ? (
							"Save changes"
						) : (
							"Create agent"
						)}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
