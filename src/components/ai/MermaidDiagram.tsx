"use client";

import {
	AlertTriangle,
	ChevronDown,
	ChevronUp,
	Download,
	Maximize2,
} from "lucide-react";
import { useTheme } from "next-themes";
import {
	memo,
	useCallback,
	useEffect,
	useId,
	useMemo,
	useRef,
	useState,
} from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { sanitizeHtml } from "@/lib/ai/sanitize";
import { cn } from "@/lib/utils";

// ── Types ───────────────────────────────────────────────────────────────

export interface MermaidDiagramProps {
	/** Mermaid diagram definition string */
	definition: string;
	/** Optional unique ID (falls back to React useId) */
	id?: string;
	/** Additional CSS classes */
	className?: string;
}

type RenderState =
	| { status: "loading" }
	| { status: "success"; svg: string }
	| { status: "error"; message: string };

// ── Module-level mermaid lazy loader ────────────────────────────────────

let mermaidModule: typeof import("mermaid") | null = null;

async function getMermaid() {
	if (!mermaidModule) {
		mermaidModule = await import("mermaid");
	}
	return mermaidModule.default;
}

// ── Safe SVG renderer (avoids dangerouslySetInnerHTML) ──────────────────

function useSvgRef(svg: string | null) {
	const ref = useRef<HTMLDivElement>(null);
	useEffect(() => {
		if (ref.current) {
			ref.current.innerHTML = svg ?? "";
		}
	}, [svg]);
	return ref;
}

function normalizeMermaidDefinition(definition: string): string {
	const normalizedLineEndings = definition.replace(/\r\n/g, "\n").trim();
	if (!normalizedLineEndings) return "";

	const withoutFence = normalizedLineEndings
		.replace(/^```(?:mermaid)?[^\S\r\n]*\n?/i, "")
		.replace(/\n?```$/, "")
		.trim();

	return withoutFence.replace(/\u00A0/g, " ");
}

// ── MermaidDiagram ──────────────────────────────────────────────────────

function MermaidDiagramInner({
	definition,
	id: externalId,
	className,
}: MermaidDiagramProps) {
	const reactId = useId();
	const diagramId = externalId ?? `mermaid-${reactId.replace(/:/g, "")}`;

	const [state, setState] = useState<RenderState>({ status: "loading" });
	const [fullscreen, setFullscreen] = useState(false);
	const [sourceVisible, setSourceVisible] = useState(false);
	const renderSequenceRef = useRef(0);

	const { resolvedTheme } = useTheme();
	const mermaidTheme = resolvedTheme === "dark" ? "dark" : "default";
	const normalizedDefinition = useMemo(
		() => normalizeMermaidDefinition(definition),
		[definition],
	);

	const sanitizedSvg = state.status === "success" ? state.svg : null;
	const containerRef = useSvgRef(sanitizedSvg);
	const fullscreenRef = useSvgRef(fullscreen ? sanitizedSvg : null);

	// Render the diagram
	useEffect(() => {
		let cancelled = false;

		async function render() {
			setState({ status: "loading" });

			try {
				const mermaid = await getMermaid();

				mermaid.initialize({
					startOnLoad: false,
					theme: mermaidTheme,
					securityLevel: "strict",
					fontFamily: "inherit",
				});

				// Mermaid IDs must be unique per render call.
				const renderId = `${diagramId}-${++renderSequenceRef.current}`;
				const { svg } = await mermaid.render(renderId, normalizedDefinition);

				if (!cancelled) {
					const sanitized = sanitizeHtml(svg);
					setState({ status: "success", svg: sanitized });
				}
			} catch (err) {
				if (!cancelled) {
					const message =
						err instanceof Error ? err.message : "Failed to render diagram";
					setState({ status: "error", message });
				}
			}
		}

		if (normalizedDefinition) {
			render();
		} else {
			setState({ status: "error", message: "Empty diagram definition" });
		}

		return () => {
			cancelled = true;
		};
	}, [normalizedDefinition, diagramId, mermaidTheme]);

	// Export as PNG
	const exportPng = useCallback(() => {
		if (state.status !== "success") return;

		const svgEl = containerRef.current?.querySelector("svg");
		if (!svgEl) return;

		const svgClone = svgEl.cloneNode(true) as SVGSVGElement;
		const bbox = svgEl.getBoundingClientRect();
		const scale = 2;
		svgClone.setAttribute("width", String(bbox.width));
		svgClone.setAttribute("height", String(bbox.height));

		const svgData = new XMLSerializer().serializeToString(svgClone);
		const svgBlob = new Blob([svgData], {
			type: "image/svg+xml;charset=utf-8",
		});
		const url = URL.createObjectURL(svgBlob);

		const img = new Image();
		img.onload = () => {
			const canvas = document.createElement("canvas");
			canvas.width = bbox.width * scale;
			canvas.height = bbox.height * scale;
			const ctx = canvas.getContext("2d");
			if (!ctx) return;
			ctx.scale(scale, scale);
			ctx.drawImage(img, 0, 0);
			URL.revokeObjectURL(url);

			canvas.toBlob((blob) => {
				if (!blob) return;
				const pngUrl = URL.createObjectURL(blob);
				const a = document.createElement("a");
				a.href = pngUrl;
				a.download = "diagram.png";
				a.click();
				URL.revokeObjectURL(pngUrl);
			}, "image/png");
		};
		img.src = url;
	}, [state, containerRef]);

	// Export as SVG
	const exportSvg = useCallback(() => {
		if (state.status !== "success") return;
		const blob = new Blob([state.svg], {
			type: "image/svg+xml;charset=utf-8",
		});
		const url = URL.createObjectURL(blob);
		const a = document.createElement("a");
		a.href = url;
		a.download = "diagram.svg";
		a.click();
		URL.revokeObjectURL(url);
	}, [state]);

	// ── Loading state ───────────────────────────────────────────────────
	if (state.status === "loading") {
		return (
			<div
				className={cn(
					"my-4 overflow-hidden rounded-lg border bg-muted/30 p-6",
					className,
				)}
			>
				<Skeleton className="mx-auto h-48 w-full max-w-md rounded-md" />
				<Skeleton className="mx-auto mt-3 h-4 w-32 rounded-md" />
			</div>
		);
	}

	// ── Error state ─────────────────────────────────────────────────────
	if (state.status === "error") {
		return (
			<div
				className={cn(
					"my-4 overflow-hidden rounded-lg border border-destructive/30 bg-destructive/5 p-4",
					className,
				)}
			>
				<div className="flex items-center gap-2 text-destructive">
					<AlertTriangle className="size-4 shrink-0" />
					<span className="text-sm font-medium">Invalid diagram syntax</span>
				</div>
				<p className="text-muted-foreground mt-1 text-xs">{state.message}</p>
				<button
					type="button"
					onClick={() => setSourceVisible((v) => !v)}
					className="text-muted-foreground hover:text-foreground mt-2 flex items-center gap-1 text-xs"
				>
					{sourceVisible ? (
						<ChevronUp className="size-3" />
					) : (
						<ChevronDown className="size-3" />
					)}
					View source
				</button>
				{sourceVisible && (
					<pre className="bg-muted mt-2 overflow-x-auto rounded-md p-3 text-xs">
						<code>{definition}</code>
					</pre>
				)}
			</div>
		);
	}

	// ── Success state ───────────────────────────────────────────────────
	return (
		<div
			className={cn(
				"group/mermaid my-4 overflow-hidden rounded-lg border bg-muted/30",
				className,
			)}
		>
			{/* Diagram — SVG injected via ref to avoid dangerouslySetInnerHTML */}
			<div className="p-4">
				<div
					ref={containerRef}
					className="flex items-center justify-center overflow-auto [&_svg]:max-w-full"
				/>
			</div>

			{/* Action bar */}
			<div className="flex items-center justify-end gap-1 border-t bg-muted/20 px-3 py-1.5">
				<Button
					variant="ghost"
					size="sm"
					className="text-muted-foreground h-7 gap-1.5 text-xs"
					onClick={exportPng}
					title="Export as PNG"
				>
					<Download className="size-3.5" />
					PNG
				</Button>
				<Button
					variant="ghost"
					size="sm"
					className="text-muted-foreground h-7 gap-1.5 text-xs"
					onClick={exportSvg}
					title="Export as SVG"
				>
					<Download className="size-3.5" />
					SVG
				</Button>
				<Button
					variant="ghost"
					size="icon-xs"
					className="text-muted-foreground"
					onClick={() => setFullscreen(true)}
					title="Fullscreen"
				>
					<Maximize2 className="size-3.5" />
				</Button>
			</div>

			{/* Fullscreen dialog */}
			<Dialog open={fullscreen} onOpenChange={setFullscreen}>
				<DialogContent className="flex h-[90vh] max-w-[90vw] flex-col p-0 sm:max-w-[90vw]">
					<DialogTitle className="sr-only">Diagram fullscreen view</DialogTitle>
					<div className="flex items-center justify-end gap-1 border-b px-4 py-2">
						<Button
							variant="ghost"
							size="sm"
							className="h-7 gap-1.5 text-xs"
							onClick={exportPng}
						>
							<Download className="size-3.5" />
							PNG
						</Button>
						<Button
							variant="ghost"
							size="sm"
							className="h-7 gap-1.5 text-xs"
							onClick={exportSvg}
						>
							<Download className="size-3.5" />
							SVG
						</Button>
					</div>
					<div className="flex flex-1 items-center justify-center overflow-auto p-6 [touch-action:pan-x_pan-y]">
						<div
							ref={fullscreenRef}
							className="[&_svg]:max-h-full [&_svg]:max-w-full"
						/>
					</div>
				</DialogContent>
			</Dialog>
		</div>
	);
}

export const MermaidDiagram = memo(
	MermaidDiagramInner,
	(prev, next) => prev.definition === next.definition && prev.id === next.id,
);
