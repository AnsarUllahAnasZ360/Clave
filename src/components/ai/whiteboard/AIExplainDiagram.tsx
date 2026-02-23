"use client";

import {
	CheckIcon,
	ClipboardIcon,
	Loader2Icon,
	SparklesIcon,
	XIcon,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useEmbeddedAI } from "@/hooks/use-embedded-ai";
import type { ExcalidrawElementLike } from "./excalidraw-ai-utils";
import { serializeCanvasForAI } from "./excalidraw-ai-utils";

interface AIExplainDiagramProps {
	workspaceId: string;
	whiteboardId: string;
	getSceneElements: () => ExcalidrawElementLike[];
	getSelectedElements: () => ExcalidrawElementLike[];
	onClose: () => void;
}

const EXPLAIN_AI_TIMEOUT_MS = 30_000;

type ExplainScope = "selection" | "canvas";

function withTimeout<T>(
	promise: Promise<T>,
	timeoutMs: number,
): Promise<T | null> {
	return Promise.race([
		promise,
		new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs)),
	]);
}

function buildLocalExplanation(elements: ExcalidrawElementLike[]): string {
	const active = elements.filter((element) => !element.isDeleted);
	const shapes = active.filter((element) =>
		["rectangle", "ellipse", "diamond"].includes(element.type),
	);
	const arrows = active.filter(
		(element) => element.type === "arrow" || element.type === "line",
	);
	const labels = active
		.map((element) => element.text?.trim())
		.filter((label): label is string => Boolean(label));
	const sampleLabels = labels.slice(0, 6);
	const labelsText =
		sampleLabels.length > 0
			? sampleLabels.map((label) => `"${label}"`).join(", ")
			: "no explicit text labels";

	return [
		"[Local summary fallback]",
		`Purpose: The current selection appears to be a ${shapes.length > 3 ? "multi-step" : "small"} diagram fragment.`,
		`Flow and relationships: There are ${shapes.length} major shapes and ${arrows.length} connectors.`,
		`Missing links: Some relationships may be implied by spacing; verify connector direction and labels (${labelsText}).`,
		"Suggested improvements: Align related nodes, normalize spacing, and label key transitions.",
	].join("\n\n");
}

export function AIExplainDiagram({
	workspaceId,
	whiteboardId,
	getSceneElements,
	getSelectedElements,
	onClose,
}: AIExplainDiagramProps) {
	const { callEmbeddedAI } = useEmbeddedAI();
	const [scope, setScope] = useState<ExplainScope>("canvas");
	const [explanation, setExplanation] = useState<string | null>(null);
	const [copied, setCopied] = useState(false);
	const [isExplaining, setIsExplaining] = useState(false);

	const selectedElements = useMemo(
		() => getSelectedElements(),
		[getSelectedElements],
	);
	const hasSelection = selectedElements.length > 0;

	useEffect(() => {
		if (!hasSelection && scope === "selection") {
			setScope("canvas");
		}
	}, [hasSelection, scope]);

	const handleExplain = useCallback(async () => {
		const allElements = getSceneElements();
		if (allElements.length === 0) {
			toast.info("Nothing to explain — the canvas is empty");
			return;
		}

		const targetElements =
			scope === "selection" && hasSelection ? selectedElements : allElements;
		const serialized = serializeCanvasForAI(targetElements);
		setIsExplaining(true);

		try {
			const result = await withTimeout(
				callEmbeddedAI({
					type: "whiteboard_explain_diagram",
					context: { workspaceId, whiteboardId },
					prompt: serialized,
					whiteboard: {
						explain: {
							scope,
						},
					},
				}),
				EXPLAIN_AI_TIMEOUT_MS,
			);

			if (!result || result.error || !result.text?.trim()) {
				setExplanation(buildLocalExplanation(targetElements));
				toast.info("AI response timed out; showing local summary");
				return;
			}

			setExplanation(result.text);
		} catch {
			setExplanation(buildLocalExplanation(targetElements));
			toast.info("Could not reach AI; showing local summary");
		} finally {
			setIsExplaining(false);
		}
	}, [
		callEmbeddedAI,
		getSceneElements,
		hasSelection,
		scope,
		selectedElements,
		whiteboardId,
		workspaceId,
	]);

	const handleCopy = useCallback(async () => {
		if (!explanation) return;
		try {
			await navigator.clipboard.writeText(explanation);
			setCopied(true);
			setTimeout(() => setCopied(false), 2000);
		} catch {
			toast.error("Failed to copy to clipboard");
		}
	}, [explanation]);

	return (
		<div className="w-[min(560px,calc(100vw-2rem))] p-4">
			<DialogHeader className="space-y-1">
				<div className="flex items-start justify-between gap-2">
					<div className="space-y-1">
						<DialogTitle className="flex items-center gap-2 text-base">
							<SparklesIcon className="h-4 w-4 text-sienna-500 dark:text-sienna-400" />
							Explain Diagram
						</DialogTitle>
						<p className="text-xs text-muted-foreground">
							Get purpose, flow, missing links, and improvement suggestions.
						</p>
					</div>
					<Button
						type="button"
						variant="ghost"
						size="icon-sm"
						onClick={onClose}
						className="text-muted-foreground"
					>
						<XIcon className="h-4 w-4" />
					</Button>
				</div>
			</DialogHeader>

			<Separator className="my-3" />

			<div className="space-y-3">
				<Tabs
					value={scope}
					onValueChange={(value) => setScope(value as ExplainScope)}
				>
					<TabsList className="grid w-full grid-cols-2">
						<TabsTrigger
							value="selection"
							disabled={!hasSelection || isExplaining}
						>
							Selected ({selectedElements.length})
						</TabsTrigger>
						<TabsTrigger value="canvas" disabled={isExplaining}>
							Whole canvas
						</TabsTrigger>
					</TabsList>
				</Tabs>

				{!explanation && !isExplaining && (
					<Card className="p-3">
						<p className="text-sm text-muted-foreground">
							Run analysis to generate a structured explanation of the selected
							diagram scope.
						</p>
					</Card>
				)}

				{isExplaining && (
					<div className="flex flex-col items-center gap-2 py-6">
						<Loader2Icon className="h-5 w-5 animate-spin text-sienna-500 dark:text-sienna-400" />
						<Badge variant="secondary">Analyzing</Badge>
					</div>
				)}

				{explanation && !isExplaining && (
					<div className="min-h-[180px] max-h-[360px] overflow-auto rounded-md border border-border bg-muted/30 p-3">
						<p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">
							{explanation}
						</p>
					</div>
				)}

				<div className="flex items-center justify-between">
					{explanation && !isExplaining ? (
						<Button
							size="sm"
							variant="outline"
							onClick={handleCopy}
							className="gap-1.5"
						>
							{copied ? (
								<CheckIcon className="h-3.5 w-3.5 text-emerald-500" />
							) : (
								<ClipboardIcon className="h-3.5 w-3.5" />
							)}
							{copied ? "Copied" : "Copy"}
						</Button>
					) : (
						<span />
					)}

					<Button
						size="sm"
						onClick={handleExplain}
						disabled={isExplaining}
						className="gap-1.5 bg-sienna-500 text-white hover:bg-sienna-600 dark:bg-sienna-600 dark:hover:bg-sienna-500"
					>
						{isExplaining ? (
							<Loader2Icon className="h-3.5 w-3.5 animate-spin" />
						) : (
							<SparklesIcon className="h-3.5 w-3.5" />
						)}
						{explanation ? "Regenerate" : "Explain"}
					</Button>
				</div>
			</div>
		</div>
	);
}
