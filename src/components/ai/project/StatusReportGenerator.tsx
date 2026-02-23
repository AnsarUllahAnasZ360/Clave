"use client";

import {
	CheckIcon,
	CopyIcon,
	DownloadIcon,
	Loader2Icon,
	SparklesIcon,
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

interface StatusReportGeneratorProps {
	projectId: string;
	workspaceId: string;
	projectName: string;
	open: boolean;
	onOpenChange: (open: boolean) => void;
}

export function StatusReportGenerator({
	projectId,
	workspaceId,
	projectName,
	open,
	onOpenChange,
}: StatusReportGeneratorProps) {
	const { callEmbeddedAI, isLoading } = useEmbeddedAI();
	const [report, setReport] = useState<string | null>(null);
	const [copied, setCopied] = useState(false);

	const handleGenerate = useCallback(async () => {
		setReport(null);
		try {
			const result = await callEmbeddedAI({
				type: "project_status_report",
				context: { workspaceId, projectId },
			});
			if (result?.error) {
				toast.error(result.error);
				return;
			}
			setReport(result?.text ?? null);
		} catch {
			toast.error("Failed to generate status report");
		}
	}, [callEmbeddedAI, workspaceId, projectId]);

	const handleCopy = useCallback(async () => {
		if (!report) return;
		try {
			await navigator.clipboard.writeText(report);
			setCopied(true);
			toast.success("Report copied to clipboard");
			setTimeout(() => setCopied(false), 2000);
		} catch {
			toast.error("Failed to copy to clipboard");
		}
	}, [report]);

	const handleDownload = useCallback(() => {
		if (!report) return;
		const blob = new Blob([report], { type: "text/markdown" });
		const url = URL.createObjectURL(blob);
		const a = document.createElement("a");
		a.href = url;
		a.download = `${projectName.replace(/\s+/g, "-").toLowerCase()}-status-report.md`;
		document.body.appendChild(a);
		a.click();
		document.body.removeChild(a);
		URL.revokeObjectURL(url);
		toast.success("Report downloaded");
	}, [report, projectName]);

	const handleOpenChange = useCallback(
		(value: boolean) => {
			if (!value) {
				setReport(null);
				setCopied(false);
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
						Status Report
					</DialogTitle>
				</DialogHeader>

				<div className="flex-1 min-h-0 overflow-hidden flex flex-col gap-4">
					{/* Generate / Regenerate button */}
					{!report && !isLoading && (
						<div className="flex flex-col items-center justify-center py-12 gap-4">
							<p className="text-sm text-muted-foreground text-center max-w-md">
								Generate a comprehensive status report for{" "}
								<strong>{projectName}</strong>, suitable for sharing with
								stakeholders.
							</p>
							<Button
								onClick={handleGenerate}
								className="gap-1.5 bg-sienna-500 text-white hover:bg-sienna-600 dark:bg-sienna-600 dark:hover:bg-sienna-500"
							>
								<SparklesIcon className="h-3.5 w-3.5" />
								Generate Report
							</Button>
						</div>
					)}

					{/* Loading state */}
					{isLoading && (
						<div className="flex flex-col items-center justify-center py-12 gap-3">
							<Loader2Icon className="h-6 w-6 animate-spin text-sienna-500 dark:text-sienna-400" />
							<p className="text-sm text-muted-foreground">
								Generating report with GPT 5.2...
							</p>
							<p className="text-xs text-muted-foreground">
								Summarizing milestones, issue progress, and delivery risk.
							</p>
						</div>
					)}

					{/* Report content */}
					{report && !isLoading && (
						<>
							{/* Action buttons */}
							<div className="flex flex-wrap items-center gap-2 shrink-0">
								<Button
									variant="outline"
									size="sm"
									className="gap-1.5"
									onClick={handleCopy}
								>
									{copied ? (
										<CheckIcon className="h-3.5 w-3.5" />
									) : (
										<CopyIcon className="h-3.5 w-3.5" />
									)}
									{copied ? "Copied" : "Copy"}
								</Button>
								<Button
									variant="outline"
									size="sm"
									className="gap-1.5"
									onClick={handleDownload}
								>
									<DownloadIcon className="h-3.5 w-3.5" />
									Download .md
								</Button>
								<div className="flex-1" />
								<Button
									variant="ghost"
									size="sm"
									className="gap-1.5 text-sienna-600 hover:text-sienna-700 dark:text-sienna-400 dark:hover:text-sienna-300"
									onClick={handleGenerate}
								>
									<SparklesIcon className="h-3.5 w-3.5" />
									Regenerate
								</Button>
							</div>

							{/* Markdown content */}
							<div className="flex-1 overflow-y-auto rounded-lg border border-border bg-muted/30 p-4">
								<div className="prose prose-sm dark:prose-invert max-w-none">
									<MarkdownRenderer content={report} />
								</div>
							</div>
						</>
					)}
				</div>
			</DialogContent>
		</Dialog>
	);
}

/** Simple markdown renderer that handles headings, lists, bold, and paragraphs */
function MarkdownRenderer({ content }: { content: string }) {
	const lines = content.split("\n");
	const elements: React.ReactNode[] = [];
	let listItems: string[] = [];

	function flushList() {
		if (listItems.length > 0) {
			elements.push(
				<ul key={`list-${elements.length}`} className="my-2 space-y-0.5">
					{listItems.map((item) => (
						<li
							key={`${elements.length}-${item}`}
							className="text-sm text-foreground"
						>
							<InlineMarkdown text={item} />
						</li>
					))}
				</ul>,
			);
			listItems = [];
		}
	}

	for (const line of lines) {
		const trimmed = line.trim();

		// Headings
		if (trimmed.startsWith("## ")) {
			flushList();
			elements.push(
				<h2
					key={`h2-${elements.length}`}
					className="text-base font-semibold text-foreground mt-4 mb-1.5"
				>
					{trimmed.slice(3)}
				</h2>,
			);
		} else if (trimmed.startsWith("# ")) {
			flushList();
			elements.push(
				<h1
					key={`h1-${elements.length}`}
					className="text-lg font-bold text-foreground mt-3 mb-2"
				>
					{trimmed.slice(2)}
				</h1>,
			);
		} else if (trimmed.startsWith("### ")) {
			flushList();
			elements.push(
				<h3
					key={`h3-${elements.length}`}
					className="text-sm font-semibold text-foreground mt-3 mb-1"
				>
					{trimmed.slice(4)}
				</h3>,
			);
		}
		// List items
		else if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
			listItems.push(trimmed.slice(2));
		}
		// Numbered list items
		else if (/^\d+\.\s/.test(trimmed)) {
			listItems.push(trimmed.replace(/^\d+\.\s/, ""));
		}
		// Empty line
		else if (trimmed === "") {
			flushList();
		}
		// Horizontal rule
		else if (trimmed === "---" || trimmed === "***") {
			flushList();
			elements.push(
				<hr key={`hr-${elements.length}`} className="my-3 border-border/50" />,
			);
		}
		// Regular paragraph
		else {
			flushList();
			elements.push(
				<p
					key={`p-${elements.length}`}
					className="text-sm text-foreground leading-relaxed my-1"
				>
					<InlineMarkdown text={trimmed} />
				</p>,
			);
		}
	}
	flushList();

	return <>{elements}</>;
}

/** Render inline markdown: **bold**, *italic* */
function InlineMarkdown({ text }: { text: string }) {
	// Bold: **text**
	const parts = text.split(/(\*\*[^*]+\*\*)/g);
	let partKey = 0;
	return (
		<>
			{parts.map((part) => {
				partKey += 1;
				const key = `${partKey}-${part}`;
				if (part.startsWith("**") && part.endsWith("**")) {
					return (
						<strong key={key} className="font-semibold">
							{part.slice(2, -2)}
						</strong>
					);
				}
				return <span key={key}>{part}</span>;
			})}
		</>
	);
}
