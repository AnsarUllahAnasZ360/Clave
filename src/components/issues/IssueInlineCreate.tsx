"use client";

import { useMutation } from "convex/react";
import { Plus, X } from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";

import { useWorkspace } from "@/components/providers/workspace-context";
import { Button } from "@/components/ui/button";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

interface IssueInlineCreateProps {
	/** Pre-fill the status for this issue (e.g., from the board column) */
	status?: string;
	/** Pre-fill the project */
	projectId?: string;
	/** Pre-fill the sprint */
	sprintId?: string;
	/** Legacy pre-fill for milestone */
	milestoneId?: string;
	/** Callback after creation */
	onCreated?: (result: { issueId: string; identifier: string }) => void;
}

export function IssueInlineCreate({
	status = "backlog",
	projectId,
	sprintId,
	milestoneId,
	onCreated,
}: IssueInlineCreateProps) {
	const { workspaceId } = useWorkspace();
	const createIssue = useMutation(api.issues.create);
	const [editing, setEditing] = useState(false);
	const [title, setTitle] = useState("");
	const [submitting, setSubmitting] = useState(false);
	const inputRef = useRef<HTMLInputElement>(null);

	const handleOpen = useCallback(() => {
		setEditing(true);
		setTitle("");
		requestAnimationFrame(() => {
			inputRef.current?.focus();
		});
	}, []);

	const handleCancel = useCallback(() => {
		setEditing(false);
		setTitle("");
	}, []);

	const handleSubmit = useCallback(async () => {
		const trimmed = title.trim();
		if (!trimmed) {
			handleCancel();
			return;
		}

		setSubmitting(true);
		try {
			const result = await createIssue({
				workspaceId,
				title: trimmed,
				status: status as
					| "triage"
					| "backlog"
					| "todo"
					| "in_progress"
					| "in_review"
					| "done"
					| "cancelled",
				projectId: projectId ? (projectId as Id<"projects">) : undefined,
				sprintId: sprintId ? (sprintId as Id<"sprints">) : undefined,
				milestoneId: milestoneId
					? (milestoneId as Id<"milestones">)
					: undefined,
			});

			onCreated?.(result);
			toast.success(`${result.identifier} created`);
			setTitle("");
			inputRef.current?.focus();
		} catch {
			toast.error("Failed to create issue");
		} finally {
			setSubmitting(false);
		}
	}, [
		title,
		workspaceId,
		status,
		projectId,
		sprintId,
		milestoneId,
		createIssue,
		onCreated,
		handleCancel,
	]);

	if (!editing) {
		return (
			<button
				type="button"
				onClick={handleOpen}
				className="flex items-center gap-1.5 w-full px-2 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded-md transition-colors"
			>
				<Plus className="h-3.5 w-3.5" />
				<span>Create issue</span>
			</button>
		);
	}

	return (
		<div className="flex items-center gap-1 px-1 py-1">
			<input
				ref={inputRef}
				type="text"
				value={title}
				onChange={(e) => setTitle(e.target.value)}
				onKeyDown={(e) => {
					if (e.key === "Enter") {
						e.preventDefault();
						handleSubmit();
					}
					if (e.key === "Escape") {
						e.preventDefault();
						handleCancel();
					}
				}}
				onBlur={() => {
					// Delay to allow button clicks to register
					setTimeout(() => {
						if (!title.trim()) handleCancel();
					}, 150);
				}}
				placeholder="Issue title..."
				disabled={submitting}
				className="flex-1 text-sm bg-transparent border border-border rounded-md px-2 py-1 outline-none focus:border-primary placeholder:text-muted-foreground"
				autoComplete="off"
			/>
			<Button
				type="button"
				size="icon"
				variant="ghost"
				onClick={handleCancel}
				className="h-6 w-6 shrink-0"
			>
				<X className="h-3.5 w-3.5" />
			</Button>
		</div>
	);
}
