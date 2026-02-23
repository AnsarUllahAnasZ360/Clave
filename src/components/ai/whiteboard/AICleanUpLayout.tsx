"use client";

import { LayoutGridIcon, Loader2Icon, SparklesIcon, XIcon } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useEmbeddedAI } from "@/hooks/use-embedded-ai";
import type { ExcalidrawElementLike } from "./excalidraw-ai-utils";
import { computeAutoLayout, extractBoundText } from "./excalidraw-ai-utils";

type CleanupScope = "selection" | "canvas";
const CLEANUP_AI_TIMEOUT_MS = 30_000;

interface AICleanUpLayoutProps {
	workspaceId: string;
	whiteboardId: string;
	getSceneElements: () => ExcalidrawElementLike[];
	getSelectedElements: () => ExcalidrawElementLike[];
	onRepositionElements: (
		updates: Array<{ id: string; x: number; y: number }>,
	) => void;
	onClose: () => void;
}

function computeInstructionalFallback(
	elements: ExcalidrawElementLike[],
	instruction: string,
): Array<{ id: string; x: number; y: number }> {
	const baseline = computeAutoLayout(elements);
	if (baseline.length === 0) return [];

	const normalized = instruction.toLowerCase();
	const wantsVertical =
		normalized.includes("vertical") ||
		normalized.includes("top-to-bottom") ||
		normalized.includes("top to bottom");
	if (!wantsVertical) return baseline;

	const sorted = [...baseline].sort((a, b) =>
		a.x === b.x ? a.y - b.y : a.x - b.x,
	);
	const minX = Math.min(...baseline.map((p) => p.x));
	const minY = Math.min(...baseline.map((p) => p.y));
	const verticalSpacing = 140;

	return sorted.map((pos, index) => ({
		id: pos.id,
		x: minX,
		y: minY + index * verticalSpacing,
	}));
}

function withTimeout<T>(
	promise: Promise<T>,
	timeoutMs: number,
): Promise<T | null> {
	return Promise.race([
		promise,
		new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs)),
	]);
}

function parseUpdatesFromResponse(
	responseData: unknown,
): Array<{ id: string; x: number; y: number }> {
	const payload =
		responseData &&
		typeof responseData === "object" &&
		"elements" in responseData &&
		Array.isArray((responseData as { elements?: unknown[] }).elements)
			? (responseData as { elements: unknown[] }).elements
			: Array.isArray(responseData)
				? responseData
				: [];

	const updates: Array<{ id: string; x: number; y: number }> = [];
	for (const item of payload) {
		const candidate = item as
			| {
					id?: unknown;
					x?: unknown;
					y?: unknown;
			  }
			| undefined;
		if (!candidate || typeof candidate.id !== "string") continue;
		if (typeof candidate.x !== "number" || typeof candidate.y !== "number")
			continue;
		if (!Number.isFinite(candidate.x) || !Number.isFinite(candidate.y))
			continue;
		updates.push({
			id: candidate.id,
			x: candidate.x,
			y: candidate.y,
		});
	}
	return updates;
}

function serializeElementsForLayout(elements: ExcalidrawElementLike[]): string {
	const active = elements.filter((element) => !element.isDeleted);
	const payload = active.map((element) => ({
		id: element.id,
		type: element.type,
		x: Math.round(element.x),
		y: Math.round(element.y),
		width: Math.round(element.width),
		height: Math.round(element.height),
		label: extractBoundText(element, active) ?? element.text ?? undefined,
		from: element.startBinding?.elementId,
		to: element.endBinding?.elementId,
	}));
	return JSON.stringify(payload);
}

export function AICleanUpLayout({
	workspaceId,
	whiteboardId,
	getSceneElements,
	getSelectedElements,
	onRepositionElements,
	onClose,
}: AICleanUpLayoutProps) {
	const { callEmbeddedAI, isLoading } = useEmbeddedAI();
	const [instruction, setInstruction] = useState("");
	const [scope, setScope] = useState<CleanupScope>("canvas");

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

	const handleCleanUp = useCallback(async () => {
		const canvasElements = getSceneElements();
		if (canvasElements.length === 0) {
			toast.info("Nothing to clean up — the canvas is empty");
			return;
		}

		const selected = getSelectedElements();
		const scopeElements =
			scope === "selection" && selected.length > 0 ? selected : canvasElements;
		const allowedIds =
			scope === "selection" && selected.length > 0
				? new Set(scopeElements.map((element) => element.id))
				: null;
		const scopeById = new Map(
			scopeElements.map((element) => [element.id, element] as const),
		);

		const resolveScopeId = (candidateId: string): string | null => {
			if (scopeById.has(candidateId)) return candidateId;
			const prefixMatches = scopeElements.filter((element) =>
				element.id.startsWith(candidateId),
			);
			if (prefixMatches.length === 1) return prefixMatches[0].id;
			return null;
		};

		const prompt = [
			scope === "selection" && selected.length > 0
				? `Rearrange selected elements only (${selected.length} selected).`
				: "Rearrange the whole canvas layout.",
			instruction.trim()
				? `Additional instruction: ${instruction.trim()}`
				: "Additional instruction: Keep relationships clear, reduce overlaps, and use consistent spacing.",
			`Elements to reposition (full IDs):\n${serializeElementsForLayout(scopeElements)}`,
			scope === "selection" && selected.length > 0
				? `Full canvas context (full IDs):\n${serializeElementsForLayout(canvasElements)}`
				: null,
			'Return strict JSON only: {"elements":[{"id":"existing-id","x":123,"y":456}]}',
		]
			.filter(Boolean)
			.join("\n\n");

		try {
			const result = await withTimeout(
				callEmbeddedAI({
					type: "whiteboard_cleanup_layout",
					context: { workspaceId, whiteboardId },
					prompt,
				}),
				CLEANUP_AI_TIMEOUT_MS,
			);

			let updates = result ? parseUpdatesFromResponse(result.data) : [];
			if (updates.length === 0 && result?.text) {
				try {
					const parsed = JSON.parse(
						result.text
							.replace(/^```(?:json)?\s*/i, "")
							.replace(/\s*```$/i, "")
							.trim(),
					);
					updates = parseUpdatesFromResponse(parsed);
				} catch {
					// ignore parse failures, then fallback.
				}
			}

			const normalizedUpdates = updates
				.map((update) => {
					const resolvedId = resolveScopeId(update.id);
					if (!resolvedId) return null;
					if (allowedIds && !allowedIds.has(resolvedId)) return null;
					return { ...update, id: resolvedId };
				})
				.filter((update): update is { id: string; x: number; y: number } =>
					Boolean(update),
				);

			const dedupedUpdates = Array.from(
				new Map(
					normalizedUpdates.map((update) => [update.id, update]),
				).values(),
			);

			updates = dedupedUpdates.filter((update) => {
				const original = scopeById.get(update.id);
				if (!original) return false;
				const movedX = Math.abs(original.x - update.x) >= 1;
				const movedY = Math.abs(original.y - update.y) >= 1;
				return movedX || movedY;
			});

			if (updates.length === 0) {
				const fallback = computeInstructionalFallback(
					scopeElements,
					instruction,
				);
				if (fallback.length === 0) {
					toast.info("No movable shapes found");
					return;
				}
				onRepositionElements(fallback);
				toast.success(`Rearranged ${fallback.length} elements`);
				onClose();
				return;
			}

			onRepositionElements(updates);
			toast.success(`Rearranged ${updates.length} elements`);
			onClose();
		} catch {
			toast.error("Failed to clean up layout");
		}
	}, [
		callEmbeddedAI,
		getSceneElements,
		getSelectedElements,
		instruction,
		onClose,
		onRepositionElements,
		scope,
		whiteboardId,
		workspaceId,
	]);

	return (
		<div className="w-[min(520px,calc(100vw-2rem))] p-4">
			<DialogHeader className="space-y-1">
				<div className="flex items-start justify-between gap-2">
					<div className="space-y-1">
						<DialogTitle className="flex items-center gap-2 text-base">
							<LayoutGridIcon className="h-4 w-4 text-sienna-500 dark:text-sienna-400" />
							Clean Up Layout
						</DialogTitle>
						<p className="text-xs text-muted-foreground">
							Reposition shapes while preserving relationships and selection
							scope.
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
				<div className="space-y-1.5">
					<Label>Scope</Label>
					<Tabs
						value={scope}
						onValueChange={(value) => setScope(value as CleanupScope)}
					>
						<TabsList className="grid w-full grid-cols-2">
							<TabsTrigger
								value="selection"
								disabled={!hasSelection || isLoading}
							>
								Selected ({selectedElements.length})
							</TabsTrigger>
							<TabsTrigger value="canvas" disabled={isLoading}>
								Whole canvas
							</TabsTrigger>
						</TabsList>
					</Tabs>
				</div>

				<div className="space-y-1">
					<Label htmlFor="cleanup-instruction">Instruction</Label>
					<Textarea
						id="cleanup-instruction"
						value={instruction}
						onChange={(event) => setInstruction(event.target.value)}
						placeholder="Optional: e.g. Use a left-to-right pipeline with equal spacing"
						rows={4}
						disabled={isLoading}
					/>
				</div>

				<Card className="p-3">
					<div className="flex items-center justify-between gap-3">
						<div className="space-y-1">
							<Badge variant="secondary">
								{isLoading ? "Optimizing" : "Ready"}
							</Badge>
							<p className="text-xs text-muted-foreground">
								{scope === "selection"
									? "Only selected shapes will move"
									: "All canvas shapes can be repositioned"}
							</p>
						</div>
						<Button
							size="sm"
							onClick={handleCleanUp}
							disabled={isLoading}
							className="gap-1.5 bg-sienna-500 text-white hover:bg-sienna-600 dark:bg-sienna-600 dark:hover:bg-sienna-500"
						>
							{isLoading ? (
								<Loader2Icon className="h-3.5 w-3.5 animate-spin" />
							) : (
								<SparklesIcon className="h-3.5 w-3.5" />
							)}
							Clean up
						</Button>
					</div>
				</Card>
			</div>
		</div>
	);
}
