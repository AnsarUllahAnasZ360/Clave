"use client";

import {
	ChatCircleDots,
	CircleNotch,
	Clock,
	PaperPlaneTilt,
} from "@phosphor-icons/react";
import { useMutation } from "convex/react";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

// ── Types ────────────────────────────────────────────────────────────────

interface HumanInputPromptProps {
	/** The workflowRuns document ID for submission */
	workflowRunId: Id<"workflowRuns">;
	/** The question/prompt from the paused workflow */
	pausePrompt: string;
	/** Predefined options to choose from (if empty/undefined, shows freeform input) */
	pauseOptions?: string[];
}

// ── Component ────────────────────────────────────────────────────────────

/**
 * Renders when a Convex Workflow pauses for human input via `awaitEvent("humanInput")`.
 * Displays the agent's question and either selectable option cards or a freeform textarea,
 * then submits the user's choice to resume the workflow.
 *
 * Integrates inside `WorkflowStatusCard` when the workflow status is "paused".
 */
export function HumanInputPrompt({
	workflowRunId,
	pausePrompt,
	pauseOptions,
}: HumanInputPromptProps) {
	const submitInput = useMutation(api.ai.workflows.lifecycle.submitHumanInput);

	// ── State ──────────────────────────────────────────────────────────
	const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
	const [freeformText, setFreeformText] = useState("");
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [isSubmitted, setIsSubmitted] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [showReminder, setShowReminder] = useState(false);

	const hasOptions = pauseOptions && pauseOptions.length > 0;
	const canSubmit = hasOptions
		? selectedIndex !== null
		: freeformText.trim().length > 0;

	// ── 10-minute reminder timer ───────────────────────────────────────
	useEffect(() => {
		if (isSubmitted) return;

		const timer = setTimeout(() => {
			setShowReminder(true);
		}, 600_000); // 10 minutes

		return () => clearTimeout(timer);
	}, [isSubmitted]);

	// ── Submission ─────────────────────────────────────────────────────
	const handleSubmit = useCallback(async () => {
		if (!canSubmit || isSubmitting) return;

		const choice =
			hasOptions && selectedIndex !== null
				? pauseOptions[selectedIndex]
				: freeformText.trim();

		setIsSubmitting(true);
		setError(null);

		try {
			await submitInput({ workflowRunId, choice });
			setIsSubmitted(true);
		} catch (err) {
			setError(
				err instanceof Error
					? err.message
					: "Failed to submit input. Please try again.",
			);
			setIsSubmitting(false);
		}
	}, [
		canSubmit,
		isSubmitting,
		hasOptions,
		pauseOptions,
		selectedIndex,
		freeformText,
		submitInput,
		workflowRunId,
	]);

	// ── Post-submission: "Resuming workflow..." ────────────────────────
	if (isSubmitted) {
		return (
			<div className="mt-3 flex items-center gap-2 rounded-md bg-blue-50/60 px-3 py-2.5 text-sm text-blue-700 dark:bg-blue-950/30 dark:text-blue-300">
				<CircleNotch weight="bold" className="size-4 animate-spin" />
				Resuming workflow...
			</div>
		);
	}

	return (
		<div className="mt-3 space-y-3">
			{/* Question prompt */}
			<div className="flex items-start gap-2 rounded-md bg-amber-50/60 px-3 py-2.5 dark:bg-amber-950/30">
				<ChatCircleDots
					weight="fill"
					className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400"
				/>
				<p className="text-sm text-amber-800 dark:text-amber-200">
					{pausePrompt}
				</p>
			</div>

			{/* Option cards or freeform textarea */}
			{hasOptions ? (
				<div className="space-y-1.5">
					{pauseOptions.map((option, index) => (
						<button
							key={option}
							type="button"
							disabled={isSubmitting}
							onClick={() => setSelectedIndex(index)}
							className={cn(
								"w-full rounded-md border px-3 py-2 text-left text-sm transition-colors",
								"hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
								selectedIndex === index
									? "border-primary bg-primary/5 text-foreground ring-1 ring-primary/30"
									: "border-border text-muted-foreground",
								isSubmitting && "pointer-events-none opacity-50",
							)}
						>
							{option}
						</button>
					))}
				</div>
			) : (
				<Textarea
					placeholder="Type your response..."
					value={freeformText}
					onChange={(e) => setFreeformText(e.target.value)}
					disabled={isSubmitting}
					className="min-h-[72px] resize-none text-sm"
				/>
			)}

			{/* Error message */}
			{error && <p className="text-xs text-destructive">{error}</p>}

			{/* Reminder warning */}
			{showReminder && (
				<div className="flex items-center gap-1.5 rounded-md bg-amber-100/80 px-2.5 py-1.5 text-xs text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
					<Clock weight="bold" className="size-3 shrink-0" />
					This workflow is waiting for your input. It will time out soon.
				</div>
			)}

			{/* Submit button */}
			<Button
				size="sm"
				disabled={!canSubmit || isSubmitting}
				onClick={handleSubmit}
				className="gap-1.5"
			>
				{isSubmitting ? (
					<>
						<CircleNotch weight="bold" className="size-3.5 animate-spin" />
						Submitting...
					</>
				) : (
					<>
						<PaperPlaneTilt weight="fill" className="size-3.5" />
						Submit
					</>
				)}
			</Button>
		</div>
	);
}
