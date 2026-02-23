"use client";

import {
	CheckSquareIcon,
	Loader2Icon,
	SparklesIcon,
	SquareIcon,
	TargetIcon,
} from "lucide-react";
import { useCallback, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { useEmbeddedAI } from "@/hooks/use-embedded-ai";

// ── Types ──────────────────────────────────────────────────────────────────

type SuggestedIssue = {
	identifier: string;
	title?: string;
	reason: string;
};

type SprintPlanData = {
	suggested: SuggestedIssue[];
	sprintGoal: string;
	estimatedCapacity: string;
	reasoning: string;
};

interface SprintPlannerPanelProps {
	projectId: string;
	workspaceId: string;
	projectName: string;
	open: boolean;
	onOpenChange: (open: boolean) => void;
}

// ── Component ──────────────────────────────────────────────────────────────

export function SprintPlannerPanel({
	projectId,
	workspaceId,
	projectName,
	open,
	onOpenChange,
}: SprintPlannerPanelProps) {
	const { callEmbeddedAI, isLoading } = useEmbeddedAI();
	const [plan, setPlan] = useState<SprintPlanData | null>(null);
	const [selectedIssues, setSelectedIssues] = useState<Set<string>>(new Set());

	const handleGenerate = useCallback(async () => {
		setPlan(null);
		setSelectedIssues(new Set());
		try {
			const result = await callEmbeddedAI({
				type: "project_plan_sprint",
				context: { workspaceId, projectId },
			});
			if (result?.error) {
				toast.error(result.error);
				return;
			}

			// Parse structured response
			let data: SprintPlanData;
			if (result?.data && typeof result.data === "object") {
				data = result.data as SprintPlanData;
			} else {
				// Fallback: show text as reasoning
				data = {
					suggested: [],
					sprintGoal: "Unable to parse sprint plan",
					estimatedCapacity: "Unknown",
					reasoning: result?.text ?? "No plan generated.",
				};
			}

			setPlan(data);
			// Select all suggested issues by default
			setSelectedIssues(new Set(data.suggested.map((i) => i.identifier)));
		} catch {
			toast.error("Failed to generate sprint plan");
		}
	}, [callEmbeddedAI, workspaceId, projectId]);

	const toggleIssue = useCallback((identifier: string) => {
		setSelectedIssues((prev) => {
			const next = new Set(prev);
			if (next.has(identifier)) {
				next.delete(identifier);
			} else {
				next.add(identifier);
			}
			return next;
		});
	}, []);

	const toggleAll = useCallback(() => {
		if (!plan) return;
		if (selectedIssues.size === plan.suggested.length) {
			setSelectedIssues(new Set());
		} else {
			setSelectedIssues(new Set(plan.suggested.map((i) => i.identifier)));
		}
	}, [plan, selectedIssues.size]);

	const handleCreateSprint = useCallback(() => {
		if (selectedIssues.size === 0) {
			toast.error("Select at least one issue for the sprint");
			return;
		}
		// Sprint creation mutation is wired by the project system — this is a
		// convenience action. For now, copy the selected issues to clipboard.
		const issueList = Array.from(selectedIssues).join(", ");
		navigator.clipboard
			.writeText(
				`Sprint Goal: ${plan?.sprintGoal ?? "N/A"}\nIssues: ${issueList}`,
			)
			.then(() => {
				toast.success(
					`Sprint plan copied (${selectedIssues.size} issues). Create a new sprint and assign these issues.`,
				);
			})
			.catch(() => {
				toast.info(`Selected ${selectedIssues.size} issues: ${issueList}`);
			});
	}, [selectedIssues, plan]);

	const handleOpenChange = useCallback(
		(value: boolean) => {
			if (!value) {
				setPlan(null);
				setSelectedIssues(new Set());
			}
			onOpenChange(value);
		},
		[onOpenChange],
	);

	return (
		<Dialog open={open} onOpenChange={handleOpenChange}>
			<DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-2xl max-h-[80vh] flex flex-col">
				<DialogHeader>
					<DialogTitle className="flex items-center gap-2">
						<SparklesIcon className="h-4 w-4 text-sienna-500 dark:text-sienna-400" />
						Plan Next Sprint
					</DialogTitle>
				</DialogHeader>

				<div className="flex-1 min-h-0 overflow-hidden flex flex-col gap-4">
					{/* Initial CTA */}
					{!plan && !isLoading && (
						<div className="flex flex-col items-center justify-center py-12 gap-4">
							<p className="text-sm text-muted-foreground text-center max-w-md">
								AI will analyze the backlog for <strong>{projectName}</strong>{" "}
								and suggest which issues to include in the next sprint based on
								priority, velocity, and team capacity.
							</p>
							<Button
								onClick={handleGenerate}
								className="gap-1.5 bg-sienna-500 text-white hover:bg-sienna-600 dark:bg-sienna-600 dark:hover:bg-sienna-500"
							>
								<SparklesIcon className="h-3.5 w-3.5" />
								Analyze Backlog
							</Button>
						</div>
					)}

					{/* Loading state */}
					{isLoading && (
						<div className="flex flex-col items-center justify-center py-12 gap-3">
							<Loader2Icon className="h-6 w-6 animate-spin text-sienna-500 dark:text-sienna-400" />
							<p className="text-sm text-muted-foreground">
								Analyzing backlog and calculating velocity...
							</p>
						</div>
					)}

					{/* Sprint plan content */}
					{plan && !isLoading && (
						<>
							{/* Sprint goal */}
							<div className="rounded-lg border border-border bg-sienna-500/5 dark:bg-sienna-400/5 p-3">
								<div className="flex items-center gap-1.5 mb-1">
									<TargetIcon className="h-3.5 w-3.5 text-sienna-600 dark:text-sienna-400" />
									<h4 className="text-xs font-medium text-sienna-600 dark:text-sienna-400">
										Sprint Goal
									</h4>
								</div>
								<p className="text-sm text-foreground">{plan.sprintGoal}</p>
							</div>

							{/* Capacity & reasoning */}
							<div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
								<span>
									Estimated capacity:{" "}
									<strong className="text-foreground">
										{plan.estimatedCapacity}
									</strong>
								</span>
								<span>
									Selected:{" "}
									<strong className="text-foreground">
										{selectedIssues.size}/{plan.suggested.length}
									</strong>
								</span>
							</div>

							{plan.reasoning && (
								<p className="text-xs text-muted-foreground leading-relaxed break-words">
									{plan.reasoning}
								</p>
							)}

							{/* Suggested issues list */}
							{plan.suggested.length > 0 ? (
								<div className="flex-1 overflow-y-auto space-y-1">
									{/* Select all */}
									<button
										type="button"
										onClick={toggleAll}
										className="flex items-center gap-2 w-full px-2 py-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
									>
										{selectedIssues.size === plan.suggested.length ? (
											<CheckSquareIcon className="h-3.5 w-3.5" />
										) : (
											<SquareIcon className="h-3.5 w-3.5" />
										)}
										{selectedIssues.size === plan.suggested.length
											? "Deselect all"
											: "Select all"}
									</button>

									{plan.suggested.map((issue) => (
										<button
											key={issue.identifier}
											type="button"
											onClick={() => toggleIssue(issue.identifier)}
											className="flex items-start gap-2.5 w-full rounded-md border border-border px-3 py-2 text-left hover:bg-muted/50 transition-colors"
										>
											{selectedIssues.has(issue.identifier) ? (
												<CheckSquareIcon className="h-4 w-4 text-sienna-500 dark:text-sienna-400 shrink-0 mt-0.5" />
											) : (
												<SquareIcon className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
											)}
											<div className="min-w-0 flex-1">
												<div className="flex items-center gap-1.5">
													<span className="text-xs font-mono text-muted-foreground">
														{issue.identifier}
													</span>
													{issue.title && (
														<span className="text-sm text-foreground truncate">
															{issue.title}
														</span>
													)}
												</div>
												<p className="text-xs text-muted-foreground mt-0.5">
													{issue.reason}
												</p>
											</div>
										</button>
									))}
								</div>
							) : (
								<div className="flex-1 flex items-center justify-center py-8">
									<p className="text-sm text-muted-foreground">
										No backlog issues found. Create some issues first, then try
										again.
									</p>
								</div>
							)}

							{/* Actions */}
							<div className="flex items-center gap-2 shrink-0 pt-2 border-t border-border">
								<Button
									variant="ghost"
									size="sm"
									className="gap-1.5 text-sienna-600 hover:text-sienna-700 dark:text-sienna-400 dark:hover:text-sienna-300"
									onClick={handleGenerate}
								>
									<SparklesIcon className="h-3.5 w-3.5" />
									Regenerate
								</Button>
								<div className="flex-1" />
								<Button
									size="sm"
									onClick={handleCreateSprint}
									disabled={selectedIssues.size === 0}
									className="gap-1.5"
								>
									Copy Sprint Plan ({selectedIssues.size})
								</Button>
							</div>
						</>
					)}
				</div>
			</DialogContent>
		</Dialog>
	);
}
