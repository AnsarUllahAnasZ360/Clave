"use client";

import {
	Check,
	CircleNotch,
	Eye,
	PencilSimpleLine,
	Robot,
	Sparkle,
} from "@phosphor-icons/react/dist/ssr";
import { useMutation, useQuery } from "convex/react";
import { useCallback, useEffect, useMemo, useState } from "react";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

// ── Types ────────────────────────────────────────────────────────────────

type SkillData = {
	_id: Id<"skills">;
	name: string;
	description: string;
	category: string;
	markdownContent: string;
	isEnabled: boolean;
};

type SkillDialogProps = {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	mode: "create" | "edit";
	skill?: SkillData;
};

// ── Constants ────────────────────────────────────────────────────────────

const CATEGORY_OPTIONS = [
	{ value: "Design", label: "Design" },
	{ value: "DevOps", label: "DevOps" },
	{ value: "Docs", label: "Docs" },
	{ value: "PM", label: "PM" },
	{ value: "Engineering", label: "Engineering" },
	{ value: "Custom", label: "Custom" },
] as const;

const SKILLSMD_TEMPLATE = `## Instructions
[Describe what the agent should do when this skill is active]

## Constraints
[List any limitations or boundaries]

## Examples
[Provide sample inputs and expected outputs]`;

// ── Preview parser ───────────────────────────────────────────────────────

interface PreviewSection {
	heading: string;
	content: string;
}

function parsePreviewSections(markdown: string): PreviewSection[] {
	if (!markdown.trim()) return [];

	const headingRegex = /^##\s+(.+)$/gm;
	const matches: Array<{ name: string; index: number }> = [];

	let match: RegExpExecArray | null = headingRegex.exec(markdown);
	while (match !== null) {
		matches.push({ name: match[1].trim(), index: match.index });
		match = headingRegex.exec(markdown);
	}

	if (matches.length === 0) {
		return [{ heading: "Content", content: markdown.trim() }];
	}

	const sections: PreviewSection[] = [];
	for (let i = 0; i < matches.length; i++) {
		const heading = matches[i];
		const contentStart = markdown.indexOf("\n", heading.index);
		if (contentStart === -1) {
			sections.push({ heading: heading.name, content: "" });
			continue;
		}
		const contentEnd =
			i + 1 < matches.length ? matches[i + 1].index : markdown.length;
		const content = markdown.slice(contentStart + 1, contentEnd).trim();
		sections.push({ heading: heading.name, content });
	}

	return sections;
}

// ── Component ────────────────────────────────────────────────────────────

export function SkillDialog({
	open,
	onOpenChange,
	mode,
	skill,
}: SkillDialogProps) {
	const workspace = useWorkspaceOptional();

	// Mutations
	const createSkill = useMutation(api.ai.skills.create);
	const updateSkill = useMutation(api.ai.skills.update);
	const attachToAgent = useMutation(api.ai.skills.attachToAgent);
	const detachFromAgent = useMutation(api.ai.skills.detachFromAgent);

	// Queries
	const agents = useQuery(
		api.ai.subAgents.list,
		workspace ? { workspaceId: workspace.workspaceId } : "skip",
	);
	const attachedAgentIds = useQuery(
		api.ai.skills.listAgentsBySkill,
		mode === "edit" && skill ? { skillId: skill._id } : "skip",
	);

	// ── Form state ───────────────────────────────────────────────────────
	const [name, setName] = useState("");
	const [description, setDescription] = useState("");
	const [category, setCategory] = useState("Custom");
	const [markdownContent, setMarkdownContent] = useState("");
	const [selectedAgentIds, setSelectedAgentIds] = useState<
		Set<Id<"subAgents">>
	>(new Set());
	const [initialAgentIds, setInitialAgentIds] = useState<Set<Id<"subAgents">>>(
		new Set(),
	);
	const [saving, setSaving] = useState(false);
	const [nameError, setNameError] = useState("");
	const [contentError, setContentError] = useState("");
	const [activeTab, setActiveTab] = useState("edit");

	// ── Initialize form on open ──────────────────────────────────────────
	useEffect(() => {
		if (!open) return;

		if (mode === "edit" && skill) {
			setName(skill.name);
			setDescription(skill.description);
			setCategory(skill.category);
			setMarkdownContent(skill.markdownContent);
		} else {
			setName("");
			setDescription("");
			setCategory("Custom");
			setMarkdownContent(SKILLSMD_TEMPLATE);
		}
		setNameError("");
		setContentError("");
		setSaving(false);
		setActiveTab("edit");
	}, [open, mode, skill]);

	// Sync attached agent IDs when query loads (edit mode)
	useEffect(() => {
		if (mode === "edit" && attachedAgentIds) {
			const ids = new Set<Id<"subAgents">>(attachedAgentIds);
			setSelectedAgentIds(ids);
			setInitialAgentIds(new Set<Id<"subAgents">>(attachedAgentIds));
		} else if (mode === "create") {
			setSelectedAgentIds(new Set());
			setInitialAgentIds(new Set());
		}
	}, [mode, attachedAgentIds]);

	// ── Agent toggle ─────────────────────────────────────────────────────
	const toggleAgent = useCallback((agentId: Id<"subAgents">) => {
		setSelectedAgentIds((prev) => {
			const next = new Set(prev);
			if (next.has(agentId)) {
				next.delete(agentId);
			} else {
				next.add(agentId);
			}
			return next;
		});
	}, []);

	// ── Preview sections ─────────────────────────────────────────────────
	const previewSections = useMemo(
		() => parsePreviewSections(markdownContent),
		[markdownContent],
	);

	// ── Save handler ─────────────────────────────────────────────────────
	const handleSave = useCallback(async () => {
		let hasError = false;

		if (!name.trim()) {
			setNameError("Name is required");
			hasError = true;
		} else {
			setNameError("");
		}

		if (!markdownContent.trim()) {
			setContentError("Skill content is required");
			hasError = true;
		} else {
			setContentError("");
		}

		if (hasError) return;
		if (!workspace) return;

		setSaving(true);
		try {
			if (mode === "edit" && skill) {
				await updateSkill({
					skillId: skill._id,
					name: name.trim(),
					description: description.trim(),
					category,
					markdownContent: markdownContent.trim(),
				});

				// Diff agent attachments
				for (const agentId of selectedAgentIds) {
					if (!initialAgentIds.has(agentId)) {
						await attachToAgent({ subAgentId: agentId, skillId: skill._id });
					}
				}
				for (const agentId of initialAgentIds) {
					if (!selectedAgentIds.has(agentId)) {
						await detachFromAgent({ subAgentId: agentId, skillId: skill._id });
					}
				}

				toast.success("Skill updated");
			} else {
				const newSkillId = await createSkill({
					workspaceId: workspace.workspaceId,
					name: name.trim(),
					description: description.trim(),
					category,
					markdownContent: markdownContent.trim(),
				});

				// Attach selected agents
				for (const agentId of selectedAgentIds) {
					await attachToAgent({ subAgentId: agentId, skillId: newSkillId });
				}

				toast.success("Skill created");
			}

			onOpenChange(false);
		} catch (error) {
			const message =
				error instanceof Error ? error.message : "An error occurred";
			toast.error(
				mode === "edit"
					? `Failed to update skill: ${message}`
					: `Failed to create skill: ${message}`,
			);
		} finally {
			setSaving(false);
		}
	}, [
		name,
		description,
		category,
		markdownContent,
		selectedAgentIds,
		initialAgentIds,
		mode,
		skill,
		workspace,
		createSkill,
		updateSkill,
		attachToAgent,
		detachFromAgent,
		onOpenChange,
	]);

	const dialogTitle = mode === "edit" ? "Edit skill" : "Create skill";

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-3xl max-h-[85vh] flex flex-col">
				<DialogHeader>
					<DialogTitle>{dialogTitle}</DialogTitle>
					<DialogDescription>
						{mode === "edit"
							? "Update your skill's content and agent attachments."
							: "Define a reusable instruction set that modifies how AI agents behave."}
					</DialogDescription>
				</DialogHeader>

				<Tabs
					value={activeTab}
					onValueChange={setActiveTab}
					className="flex-1 min-h-0"
				>
					<TabsList>
						<TabsTrigger value="edit" className="gap-1.5">
							<PencilSimpleLine className="h-3.5 w-3.5" />
							Edit
						</TabsTrigger>
						<TabsTrigger value="preview" className="gap-1.5">
							<Eye className="h-3.5 w-3.5" />
							Preview
						</TabsTrigger>
					</TabsList>

					{/* ── Edit Tab ─────────────────────────────────── */}
					<TabsContent
						value="edit"
						className="overflow-y-auto max-h-[calc(85vh-220px)] pr-1"
					>
						<div className="space-y-6 py-2">
							{/* Identity section */}
							<section className="space-y-4">
								<h3 className="text-sm font-semibold text-foreground">
									Identity
								</h3>
								<div className="grid gap-4">
									<div className="grid gap-2">
										<Label htmlFor="skill-name">Name</Label>
										<Input
											id="skill-name"
											value={name}
											onChange={(e) => {
												setName(e.target.value);
												if (e.target.value.trim()) setNameError("");
											}}
											placeholder="e.g. Sprint Planning"
										/>
										{nameError && (
											<p className="text-xs text-destructive">{nameError}</p>
										)}
									</div>
									<div className="grid gap-2">
										<Label htmlFor="skill-description">Description</Label>
										<Textarea
											id="skill-description"
											value={description}
											onChange={(e) => setDescription(e.target.value)}
											placeholder="What does this skill do?"
											rows={2}
										/>
									</div>
									<div className="grid gap-2">
										<Label>Category</Label>
										<Select value={category} onValueChange={setCategory}>
											<SelectTrigger className="w-full">
												<SelectValue />
											</SelectTrigger>
											<SelectContent>
												{CATEGORY_OPTIONS.map((opt) => (
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

							{/* SkillsMD Editor section */}
							<section className="space-y-4">
								<div>
									<h3 className="text-sm font-semibold text-foreground">
										Skill content (SkillsMD)
									</h3>
									<p className="mt-1 text-xs text-muted-foreground">
										Write markdown instructions using ## headings for
										Instructions, Constraints, and Examples sections.
									</p>
								</div>
								<div className="grid gap-2">
									<Textarea
										id="skill-content"
										value={markdownContent}
										onChange={(e) => {
											setMarkdownContent(e.target.value);
											if (e.target.value.trim()) setContentError("");
										}}
										placeholder={SKILLSMD_TEMPLATE}
										rows={14}
										className="font-mono text-sm"
									/>
									{contentError && (
										<p className="text-xs text-destructive">{contentError}</p>
									)}
								</div>
							</section>

							<Separator />

							{/* Attach to agents section */}
							<section className="space-y-4">
								<div className="flex items-center gap-2">
									<Robot className="h-4 w-4 text-muted-foreground" />
									<h3 className="text-sm font-semibold text-foreground">
										Attach to agents
									</h3>
								</div>
								{agents && agents.length > 0 ? (
									<div className="grid gap-2">
										<p className="text-xs text-muted-foreground">
											Select which agents should use this skill.
										</p>
										<div className="grid gap-2 sm:grid-cols-2">
											{agents.map(
												(agent: {
													_id: Id<"subAgents">;
													name: string;
													description: string;
													avatar?: string;
												}) => (
													<button
														key={agent._id}
														type="button"
														onClick={() => toggleAgent(agent._id)}
														className={cn(
															"flex items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition",
															selectedAgentIds.has(agent._id)
																? "border-primary/50 bg-primary/5"
																: "border-border bg-card/50 hover:bg-muted/40",
														)}
													>
														<div
															className={cn(
																"flex h-4 w-4 shrink-0 items-center justify-center rounded border",
																selectedAgentIds.has(agent._id)
																	? "border-primary bg-primary text-primary-foreground"
																	: "border-muted-foreground/30",
															)}
														>
															{selectedAgentIds.has(agent._id) && (
																<Check className="h-3 w-3" weight="bold" />
															)}
														</div>
														<div className="min-w-0">
															<span className="text-sm font-medium text-foreground">
																{agent.avatar ? `${agent.avatar} ` : ""}
																{agent.name}
															</span>
															<p className="text-xs text-muted-foreground truncate">
																{agent.description}
															</p>
														</div>
													</button>
												),
											)}
										</div>
									</div>
								) : (
									<div className="rounded-xl border border-dashed border-border bg-muted/20 p-4 text-center">
										<Robot className="mx-auto h-6 w-6 text-muted-foreground/50" />
										<p className="mt-1.5 text-sm text-muted-foreground">
											No agents available. Create agents in the Agents settings.
										</p>
									</div>
								)}
							</section>
						</div>
					</TabsContent>

					{/* ── Preview Tab ─────────────────────────────── */}
					<TabsContent
						value="preview"
						className="overflow-y-auto max-h-[calc(85vh-220px)] pr-1"
					>
						<div className="space-y-4 py-2">
							{previewSections.length > 0 ? (
								<>
									<div className="flex items-center gap-3">
										<Sparkle className="h-5 w-5 text-muted-foreground" />
										<div>
											<h3 className="text-sm font-semibold text-foreground">
												{name || "Untitled skill"}
											</h3>
											<span className="text-xs text-muted-foreground">
												{category}
											</span>
										</div>
									</div>
									<Separator />
									{previewSections.map((section) => (
										<div key={section.heading} className="space-y-2">
											<h4 className="text-sm font-semibold text-foreground">
												{section.heading}
											</h4>
											<div className="rounded-lg border border-border bg-muted/30 p-3">
												<pre className="text-sm text-muted-foreground whitespace-pre-wrap font-sans">
													{section.content || "(empty)"}
												</pre>
											</div>
										</div>
									))}
								</>
							) : (
								<div className="rounded-2xl border border-dashed border-border bg-muted/20 p-8 text-center">
									<Eye className="mx-auto h-10 w-10 text-muted-foreground/50" />
									<p className="mt-3 text-sm text-muted-foreground">
										Write some skill content to see a preview
									</p>
								</div>
							)}
						</div>
					</TabsContent>
				</Tabs>

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
							"Create skill"
						)}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
