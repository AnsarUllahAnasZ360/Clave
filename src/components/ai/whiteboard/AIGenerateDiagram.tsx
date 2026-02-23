"use client";

import { Loader2Icon, SparklesIcon, XIcon } from "lucide-react";
import {
	type KeyboardEvent,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { useEmbeddedAI } from "@/hooks/use-embedded-ai";
import type { WhiteboardGenerationMode } from "@/types/embedded-ai";
import type {
	AIDiagramOutput,
	ExcalidrawElementLike,
} from "./excalidraw-ai-utils";
import {
	parseAIElementsToExcalidraw,
	positionNewElements,
	serializeCanvasForAI,
} from "./excalidraw-ai-utils";

interface AIGenerateDiagramProps {
	workspaceId: string;
	whiteboardId: string;
	onInsertElements: (elements: ExcalidrawElementLike[]) => void;
	onInsertElementsProgressive?: (
		elements: ExcalidrawElementLike[],
		options: {
			signal: AbortSignal;
			onBatch?: (inserted: number, total: number) => void;
		},
	) => Promise<void>;
	getExistingElements: () => Array<{
		x: number;
		y: number;
		width: number;
		height: number;
		isDeleted?: boolean;
	}>;
	getSceneElements: () => ExcalidrawElementLike[];
	getSelectedElements: () => ExcalidrawElementLike[];
	onClose: () => void;
}

type GenerationPhase =
	| "idle"
	| "planning"
	| "generating"
	| "rendering"
	| "complete"
	| "cancelled";

const EMBEDDED_AI_TIMEOUT_MS = 120_000;

function withTimeout<T>(
	promise: Promise<T>,
	timeoutMs: number,
): Promise<T | null> {
	return Promise.race([
		promise,
		new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs)),
	]);
}

function inferModeFromPrompt(prompt: string): WhiteboardGenerationMode {
	const normalized = prompt.toLowerCase();
	if (
		/\b(ui|wireframe|screen|page|dashboard|todo|form|layout|mobile app|web app)\b/.test(
			normalized,
		)
	) {
		return "wireframe";
	}
	if (
		/\b(architecture|service|microservice|system design|infrastructure|api|database)\b/.test(
			normalized,
		)
	) {
		return "architecture";
	}
	return "flowchart";
}

function parseLooseJson(text: string): unknown {
	const cleaned = text
		.replace(/^```(?:json)?\s*/i, "")
		.replace(/\s*```$/i, "")
		.trim();
	try {
		return JSON.parse(cleaned);
	} catch {
		// Continue with tolerant extraction.
	}

	const start = cleaned.search(/[{[]/);
	if (start === -1) return null;

	const openChar = cleaned[start];
	const closeChar = openChar === "{" ? "}" : "]";
	let depth = 0;
	let inString = false;
	let escaping = false;

	for (let i = start; i < cleaned.length; i++) {
		const ch = cleaned[i];
		if (inString) {
			if (escaping) {
				escaping = false;
				continue;
			}
			if (ch === "\\") {
				escaping = true;
				continue;
			}
			if (ch === '"') {
				inString = false;
			}
			continue;
		}
		if (ch === '"') {
			inString = true;
			continue;
		}
		if (ch === openChar) {
			depth += 1;
			continue;
		}
		if (ch === closeChar) {
			depth -= 1;
			if (depth === 0) {
				const candidate = cleaned.slice(start, i + 1);
				try {
					return JSON.parse(candidate);
				} catch {
					return null;
				}
			}
		}
	}

	return null;
}

function normalizeDiagramPayload(payload: unknown): AIDiagramOutput | null {
	const candidates: unknown[] = [];
	if (payload !== null && payload !== undefined) candidates.push(payload);

	const obj =
		payload && typeof payload === "object"
			? (payload as Record<string, unknown>)
			: null;
	if (obj) {
		if (Array.isArray(obj.elements)) {
			candidates.push({ elements: obj.elements });
		}
		if (Array.isArray(obj.nodes) || Array.isArray(obj.edges)) {
			candidates.push({ nodes: obj.nodes, edges: obj.edges });
		}
		for (const key of ["data", "result", "view", "diagram"]) {
			if (obj[key] !== undefined && obj[key] !== null) {
				candidates.push(obj[key]);
			}
		}
	}

	for (const candidate of candidates) {
		if (Array.isArray(candidate)) {
			return { elements: candidate };
		}
		if (!candidate || typeof candidate !== "object") continue;
		const value = candidate as Record<string, unknown>;
		if (typeof value.elements === "string") {
			const parsedElements = parseLooseJson(value.elements);
			if (Array.isArray(parsedElements)) {
				return { ...value, elements: parsedElements } as AIDiagramOutput;
			}
		}
		if (
			Array.isArray(value.elements) ||
			Array.isArray(value.nodes) ||
			Array.isArray(value.edges)
		) {
			return value as AIDiagramOutput;
		}
	}

	return null;
}

export function AIGenerateDiagram({
	workspaceId,
	whiteboardId,
	onInsertElements,
	onInsertElementsProgressive,
	getExistingElements,
	getSceneElements,
	getSelectedElements,
	onClose,
}: AIGenerateDiagramProps) {
	const { callEmbeddedAI, isLoading } = useEmbeddedAI();
	const [prompt, setPrompt] = useState("");
	const [phase, setPhase] = useState<GenerationPhase>("idle");
	const [renderProgress, setRenderProgress] = useState({
		inserted: 0,
		total: 0,
	});

	const isBusy = isLoading || phase === "rendering" || phase === "planning";
	const renderAbortRef = useRef<AbortController | null>(null);
	const cancelledRef = useRef(false);
	const mode = useMemo(() => inferModeFromPrompt(prompt), [prompt]);

	const handleCancel = useCallback(() => {
		cancelledRef.current = true;
		renderAbortRef.current?.abort();
		setPhase("cancelled");
	}, []);

	useEffect(() => {
		return () => {
			renderAbortRef.current?.abort();
		};
	}, []);

	const handleGenerate = useCallback(async () => {
		const trimmed = prompt.trim();
		if (!trimmed) return;

		cancelledRef.current = false;
		setRenderProgress({ inserted: 0, total: 0 });
		setPhase("planning");

		try {
			const selectedElements = getSelectedElements();
			const sceneElements = getSceneElements();
			const selectedSummary =
				selectedElements.length > 0
					? serializeCanvasForAI(selectedElements)
					: null;
			const sceneSummary =
				sceneElements.length > 0 ? serializeCanvasForAI(sceneElements) : null;
			const contextualPrompt = [
				`User request:\n${trimmed}`,
				`Inferred mode: ${mode}`,
				selectedSummary
					? `Selected elements (${selectedElements.length}):\n${selectedSummary}`
					: null,
				sceneSummary ? `Canvas snapshot:\n${sceneSummary}` : null,
				selectedSummary
					? "Prefer extending or connecting to selected elements where relevant."
					: "Generate a fresh layout.",
			]
				.filter(Boolean)
				.join("\n\n");

			setPhase("generating");
			const result = await withTimeout(
				callEmbeddedAI({
					type: "whiteboard_generate_diagram",
					context: { workspaceId, whiteboardId },
					prompt: contextualPrompt,
					whiteboard: {
						generation: {
							mode,
						},
					},
				}),
				EMBEDDED_AI_TIMEOUT_MS,
			);

			if (cancelledRef.current) {
				setPhase("cancelled");
				return;
			}

			if (!result) {
				throw new Error("Generation timed out. Please try again.");
			}
			if (result.error) {
				throw new Error(result.error);
			}

			let aiOutput: AIDiagramOutput | null = null;
			if (result.data) {
				aiOutput = normalizeDiagramPayload(result.data);
			}
			if (!aiOutput && result.text) {
				aiOutput = normalizeDiagramPayload(parseLooseJson(result.text));
			}
			if (!aiOutput) {
				throw new Error("No diagram payload returned by AI.");
			}

			const elements = parseAIElementsToExcalidraw(aiOutput);
			if (elements.length === 0) {
				throw new Error(
					"AI returned no drawable elements. Try a more specific prompt.",
				);
			}

			const positioned = positionNewElements(getExistingElements(), elements);
			if (positioned.length === 0) {
				throw new Error("No elements were inserted.");
			}

			setPhase("rendering");
			setRenderProgress({ inserted: 0, total: positioned.length });

			if (onInsertElementsProgressive) {
				const controller = new AbortController();
				renderAbortRef.current = controller;
				await onInsertElementsProgressive(positioned, {
					signal: controller.signal,
					onBatch: (inserted, total) => {
						setRenderProgress({ inserted, total });
					},
				});
				renderAbortRef.current = null;
				if (controller.signal.aborted || cancelledRef.current) {
					setPhase("cancelled");
					toast.info("Generation cancelled");
					return;
				}
			} else {
				onInsertElements(positioned);
				setRenderProgress({
					inserted: positioned.length,
					total: positioned.length,
				});
			}

			setPhase("complete");
			toast.success(`Added ${positioned.length} elements to canvas`);
			setTimeout(() => {
				onClose();
			}, 250);
		} catch (error) {
			if (cancelledRef.current) {
				setPhase("cancelled");
				return;
			}
			setPhase("idle");
			const message =
				error instanceof Error ? error.message : "Failed to generate diagram.";
			toast.error(message);
		}
	}, [
		callEmbeddedAI,
		getExistingElements,
		getSceneElements,
		getSelectedElements,
		mode,
		onClose,
		onInsertElements,
		onInsertElementsProgressive,
		prompt,
		whiteboardId,
		workspaceId,
	]);

	const handleKeyDown = useCallback(
		(e: KeyboardEvent<HTMLTextAreaElement>) => {
			if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
				e.preventDefault();
				handleGenerate();
			}
		},
		[handleGenerate],
	);

	return (
		<div className="p-4">
			<DialogHeader className="space-y-1">
				<div className="flex items-start justify-between gap-2">
					<div className="space-y-1">
						<DialogTitle className="flex items-center gap-2 text-base">
							<SparklesIcon className="h-4 w-4 text-sienna-500 dark:text-sienna-400" />
							Generate Diagram
						</DialogTitle>
						<p className="text-xs text-muted-foreground">
							Describe what you want and the diagram will be generated directly
							on the canvas.
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
				<div className="space-y-1">
					<Label htmlFor="wb-prompt">Prompt</Label>
					<Textarea
						id="wb-prompt"
						value={prompt}
						onChange={(event) => setPrompt(event.target.value)}
						onKeyDown={handleKeyDown}
						placeholder="e.g. Create a wireframe for a todo app with sidebar, list, and detail panel"
						rows={4}
						disabled={isBusy}
						autoFocus
					/>
				</div>

				<div className="flex items-center justify-between">
					<p className="text-xs text-muted-foreground">
						{isBusy
							? phase === "rendering"
								? `Rendering on canvas${renderProgress.total > 0 ? ` (${renderProgress.inserted}/${renderProgress.total})` : ""}...`
								: "Generating..."
							: "Cmd+Enter to generate"}
					</p>
					<div className="flex items-center gap-2">
						{isBusy && (
							<Button
								type="button"
								size="sm"
								variant="outline"
								onClick={handleCancel}
							>
								Cancel
							</Button>
						)}
						<Button
							size="sm"
							onClick={handleGenerate}
							disabled={isBusy || !prompt.trim()}
							className="gap-1.5 bg-sienna-500 text-white hover:bg-sienna-600 dark:bg-sienna-600 dark:hover:bg-sienna-500"
						>
							{isBusy ? (
								<Loader2Icon className="h-3.5 w-3.5 animate-spin" />
							) : (
								<SparklesIcon className="h-3.5 w-3.5" />
							)}
							Generate
						</Button>
					</div>
				</div>
			</div>
		</div>
	);
}
