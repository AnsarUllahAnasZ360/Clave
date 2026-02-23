"use client";

import type { Value } from "platejs";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { PlateEditor } from "@/components/editor/plate-editor";
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
import { Switch } from "@/components/ui/switch";
import {
	isBuiltInCommandName,
	normalizeSlashCommandName,
	type SlashCommandScope,
	type StoredSlashCommand,
} from "@/lib/ai/slash-commands";
import {
	extractTextFromSlate,
	parseAnyContentToSlate,
} from "@/lib/content-converters";

const EMPTY_VALUE: Value = [{ type: "p", children: [{ text: "" }] }];

function createCommandId() {
	return `cmd_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

interface SlashCommandDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	mode: "create" | "edit";
	scope: SlashCommandScope;
	command?: StoredSlashCommand;
	existingNames: string[];
	onSave: (command: StoredSlashCommand) => Promise<void>;
}

export function SlashCommandDialog({
	open,
	onOpenChange,
	mode,
	scope,
	command,
	existingNames,
	onSave,
}: SlashCommandDialogProps) {
	const [commandName, setCommandName] = useState("");
	const [title, setTitle] = useState("");
	const [description, setDescription] = useState("");
	const [contentValue, setContentValue] = useState<Value>(EMPTY_VALUE);
	const [isShortcut, setIsShortcut] = useState(false);
	const [isSaving, setIsSaving] = useState(false);

	useEffect(() => {
		if (!open) return;

		if (mode === "edit" && command) {
			setCommandName(command.command);
			setTitle(command.title);
			setDescription(command.description);
			setIsShortcut(command.isShortcut);
			const parsed = parseAnyContentToSlate(command.content);
			setContentValue((parsed as Value) ?? EMPTY_VALUE);
			return;
		}

		setCommandName("");
		setTitle("");
		setDescription("");
		setIsShortcut(false);
		setContentValue(EMPTY_VALUE);
	}, [open, mode, command]);

	const instructionsText = useMemo(
		() => extractTextFromSlate((contentValue as unknown[]) ?? []).trim(),
		[contentValue],
	);

	const handleSave = useCallback(async () => {
		const normalizedCommand = normalizeSlashCommandName(commandName);
		if (!normalizedCommand) {
			toast.error("Command name is required");
			return;
		}

		if (isBuiltInCommandName(normalizedCommand)) {
			toast.error(`/${normalizedCommand} is reserved by a built-in command`);
			return;
		}

		if (!instructionsText) {
			toast.error("Command instructions cannot be empty");
			return;
		}

		if (existingNames.includes(normalizedCommand)) {
			toast.error(`/${normalizedCommand} already exists in this set`);
			return;
		}

		const now = Date.now();
		const next: StoredSlashCommand = {
			id: command?.id ?? createCommandId(),
			command: normalizedCommand,
			title: title.trim() || normalizedCommand,
			description: description.trim(),
			content: JSON.stringify(contentValue),
			isShortcut,
			createdAt: command?.createdAt ?? now,
			updatedAt: now,
			...(command?.createdBy ? { createdBy: command.createdBy } : {}),
		};

		setIsSaving(true);
		try {
			await onSave(next);
			onOpenChange(false);
		} catch {
			// parent mutation handler handles toast messaging
		} finally {
			setIsSaving(false);
		}
	}, [
		commandName,
		command,
		contentValue,
		description,
		existingNames,
		instructionsText,
		onOpenChange,
		onSave,
		isShortcut,
		title,
	]);

	const dialogTitle = mode === "edit" ? "Edit command" : "Create command";
	const scopeLabel = scope === "workspace" ? "Workspace" : "My";

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-4xl max-h-[90vh] flex flex-col">
				<DialogHeader>
					<DialogTitle>{dialogTitle}</DialogTitle>
					<DialogDescription>
						Configure a {scopeLabel.toLowerCase()} slash command using rich
						command instructions.
					</DialogDescription>
				</DialogHeader>

				<div className="flex-1 min-h-0 overflow-y-auto space-y-5 pr-1">
					<div className="grid gap-4 md:grid-cols-2">
						<div className="space-y-2">
							<Label htmlFor="slash-command-name">Command</Label>
							<div className="flex items-center rounded-md border border-input bg-background">
								<span className="px-3 text-sm text-muted-foreground">/</span>
								<Input
									id="slash-command-name"
									value={commandName}
									onChange={(e) => setCommandName(e.target.value)}
									placeholder="daily-standup"
									className="border-0 shadow-none focus-visible:ring-0"
								/>
							</div>
						</div>

						<div className="space-y-2">
							<Label htmlFor="slash-command-title">Title</Label>
							<Input
								id="slash-command-title"
								value={title}
								onChange={(e) => setTitle(e.target.value)}
								placeholder="Daily standup"
							/>
						</div>
					</div>

					<div className="space-y-2">
						<Label htmlFor="slash-command-description">Description</Label>
						<textarea
							id="slash-command-description"
							value={description}
							onChange={(e) => setDescription(e.target.value)}
							className="min-h-[72px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-xs placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
							placeholder="What this command does"
						/>
					</div>

					<div className="space-y-2">
						<div className="flex items-center justify-between">
							<Label>Command instructions</Label>
							<span className="text-xs text-muted-foreground">
								Rich Plate editor content is saved with the command.
							</span>
						</div>
						<PlateEditor
							variant="simple"
							value={contentValue}
							onChange={setContentValue}
							placeholder="Describe exactly what this slash command should do..."
							className="min-h-[260px] rounded-md border border-border bg-background"
							editorClassName="min-h-[236px] px-4 py-3 text-sm leading-6 **:data-slate-placeholder:!top-3 **:data-slate-placeholder:!-translate-y-0"
						/>
					</div>

					<div className="flex items-center justify-between rounded-md border border-border/70 bg-card/60 px-3 py-2">
						<div>
							<p className="text-sm font-medium text-foreground">
								Pin as shortcut
							</p>
							<p className="text-xs text-muted-foreground">
								Shortcut commands appear in the dedicated slash command group.
							</p>
						</div>
						<Switch checked={isShortcut} onCheckedChange={setIsShortcut} />
					</div>
				</div>

				<DialogFooter className="pt-4">
					<Button variant="outline" onClick={() => onOpenChange(false)}>
						Cancel
					</Button>
					<Button onClick={handleSave} disabled={isSaving}>
						{isSaving
							? "Saving..."
							: mode === "edit"
								? "Save changes"
								: "Create command"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
