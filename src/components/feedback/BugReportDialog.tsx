"use client";

import { Bug, CheckCircle, Warning } from "@phosphor-icons/react/dist/ssr";
import { useAction } from "convex/react";
import { ConvexError } from "convex/values";
import { useCallback, useState } from "react";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
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
import { Textarea } from "@/components/ui/textarea";
import { api } from "../../../convex/_generated/api";

type BugReportDialogProps = {
	open: boolean;
	onOpenChange: (open: boolean) => void;
};

type FormState = "idle" | "submitting" | "success" | "error";

const SEVERITY_OPTIONS = [
	{ value: "low", label: "Low", description: "Minor issue, cosmetic" },
	{
		value: "medium",
		label: "Medium",
		description: "Functional issue, workaround exists",
	},
	{ value: "high", label: "High", description: "Major issue, blocks workflow" },
	{
		value: "critical",
		label: "Critical",
		description: "System down, data loss risk",
	},
];

export function BugReportDialog({ open, onOpenChange }: BugReportDialogProps) {
	const submitBugReport = useAction(api.bugReports.submit);

	const [title, setTitle] = useState("");
	const [description, setDescription] = useState("");
	const [steps, setSteps] = useState("");
	const [severity, setSeverity] = useState<string>("");
	const [formState, setFormState] = useState<FormState>("idle");
	const [issueUrl, setIssueUrl] = useState("");
	const [errorMessage, setErrorMessage] = useState("");

	const resetForm = useCallback(() => {
		setTitle("");
		setDescription("");
		setSteps("");
		setSeverity("");
		setFormState("idle");
		setIssueUrl("");
		setErrorMessage("");
	}, []);

	const handleOpenChange = useCallback(
		(nextOpen: boolean) => {
			if (!nextOpen) {
				// Reset form when closing
				resetForm();
			}
			onOpenChange(nextOpen);
		},
		[onOpenChange, resetForm],
	);

	const handleSubmit = useCallback(
		async (e: React.FormEvent) => {
			e.preventDefault();

			const trimmedTitle = title.trim();
			const trimmedDescription = description.trim();

			if (!trimmedTitle || !trimmedDescription) return;

			setFormState("submitting");
			setErrorMessage("");

			try {
				const result = await submitBugReport({
					title: trimmedTitle,
					description: trimmedDescription,
					steps: steps.trim() || undefined,
					severity: severity || undefined,
				});
				setIssueUrl(result.issueUrl);
				setFormState("success");
			} catch (err) {
				const message =
					err instanceof ConvexError
						? (err.data as string)
						: "An unexpected error occurred. Please try again.";
				setErrorMessage(message);
				setFormState("error");
			}
		},
		[title, description, steps, severity, submitBugReport],
	);

	const isValid = title.trim().length > 0 && description.trim().length > 0;

	return (
		<Dialog open={open} onOpenChange={handleOpenChange}>
			<DialogContent className="sm:max-w-[500px]">
				<DialogHeader>
					<DialogTitle className="flex items-center gap-2">
						<Bug className="h-5 w-5" />
						Report a Bug
					</DialogTitle>
					<DialogDescription>
						Help us improve by reporting issues you encounter. Your report will
						create a GitHub issue for our team.
					</DialogDescription>
				</DialogHeader>

				{formState === "success" ? (
					<div className="flex flex-col items-center gap-4 py-6">
						<CheckCircle className="h-12 w-12 text-green-500" weight="fill" />
						<div className="text-center">
							<p className="font-medium">Bug report submitted!</p>
							<p className="text-sm text-muted-foreground mt-1">
								Thank you for helping us improve.
							</p>
						</div>
						{issueUrl && (
							<a
								href={issueUrl}
								target="_blank"
								rel="noopener noreferrer"
								className="text-sm text-primary underline underline-offset-4 hover:text-primary/80"
							>
								View issue on GitHub
							</a>
						)}
						<Button
							variant="outline"
							onClick={() => handleOpenChange(false)}
							className="mt-2"
						>
							Close
						</Button>
					</div>
				) : (
					<form onSubmit={handleSubmit} className="flex flex-col gap-4">
						{formState === "error" && errorMessage && (
							<div className="flex items-start gap-2 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
								<Warning className="h-4 w-4 mt-0.5 shrink-0" />
								<span>{errorMessage}</span>
							</div>
						)}

						<div className="flex flex-col gap-2">
							<Label htmlFor="bug-title">
								Title <span className="text-destructive">*</span>
							</Label>
							<Input
								id="bug-title"
								placeholder="Brief summary of the issue"
								value={title}
								onChange={(e) => setTitle(e.target.value)}
								maxLength={200}
								disabled={formState === "submitting"}
							/>
						</div>

						<div className="flex flex-col gap-2">
							<Label htmlFor="bug-description">
								Description <span className="text-destructive">*</span>
							</Label>
							<Textarea
								id="bug-description"
								placeholder="What happened? What did you expect to happen?"
								value={description}
								onChange={(e) => setDescription(e.target.value)}
								maxLength={5000}
								rows={4}
								disabled={formState === "submitting"}
							/>
						</div>

						<div className="flex flex-col gap-2">
							<Label htmlFor="bug-steps">Steps to Reproduce</Label>
							<Textarea
								id="bug-steps"
								placeholder="1. Go to...&#10;2. Click on...&#10;3. See error..."
								value={steps}
								onChange={(e) => setSteps(e.target.value)}
								rows={3}
								disabled={formState === "submitting"}
							/>
						</div>

						<div className="flex flex-col gap-2">
							<Label htmlFor="bug-severity">Severity</Label>
							<Select
								value={severity}
								onValueChange={setSeverity}
								disabled={formState === "submitting"}
							>
								<SelectTrigger id="bug-severity">
									<SelectValue placeholder="Select severity (optional)" />
								</SelectTrigger>
								<SelectContent>
									{SEVERITY_OPTIONS.map((opt) => (
										<SelectItem key={opt.value} value={opt.value}>
											{opt.label}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>

						<div className="flex justify-end gap-2 pt-2">
							<Button
								type="button"
								variant="outline"
								onClick={() => handleOpenChange(false)}
								disabled={formState === "submitting"}
							>
								Cancel
							</Button>
							<Button
								type="submit"
								disabled={!isValid || formState === "submitting"}
							>
								{formState === "submitting" ? "Submitting..." : "Submit Report"}
							</Button>
						</div>
					</form>
				)}
			</DialogContent>
		</Dialog>
	);
}
