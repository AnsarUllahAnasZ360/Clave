"use client";

import { Excalidraw } from "@excalidraw/excalidraw";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import {
	type ParsedWhiteboardScene,
	parseStoredWhiteboardScene,
} from "@/lib/whiteboard-scene";
import "@excalidraw/excalidraw/index.css";
import "@/styles/excalidraw.css";

// Self-host Excalidraw fonts
if (typeof window !== "undefined") {
	// biome-ignore lint/suspicious/noExplicitAny: Excalidraw reads this global at runtime
	(window as any).EXCALIDRAW_ASSET_PATH = "/excalidraw-assets/";
}

interface WhiteboardReadOnlyProps {
	sceneData?: string;
	appState?: string;
}

export function WhiteboardReadOnly({
	sceneData,
	appState,
}: WhiteboardReadOnlyProps) {
	const { resolvedTheme } = useTheme();
	const [mounted, setMounted] = useState(false);
	const [, setExcalidrawAPI] = useState<ExcalidrawImperativeAPI | null>(null);

	useEffect(() => {
		setMounted(true);
	}, []);

	if (!mounted) {
		return (
			<div className="flex h-full w-full items-center justify-center bg-background">
				<div className="flex flex-col items-center gap-3">
					<div className="h-10 w-10 animate-spin rounded-full border-2 border-muted border-t-sienna-9" />
					<p className="text-sm text-muted-foreground">Loading whiteboard...</p>
				</div>
			</div>
		);
	}

	let initialElements: ParsedWhiteboardScene["elements"] = [];
	let initialFiles: ParsedWhiteboardScene["files"];
	let initialAppState: ParsedWhiteboardScene["appState"] = {};

	try {
		const parsed = parseStoredWhiteboardScene(sceneData, appState);
		initialElements = parsed.elements;
		initialFiles = parsed.files;
		initialAppState = parsed.appState;
	} catch {
		// Invalid JSON -- show empty canvas
	}

	return (
		<div className="relative h-full w-full excalidraw-clave">
			<Excalidraw
				initialData={{
					elements: initialElements,
					...(initialFiles ? { files: initialFiles } : {}),
					appState: {
						...initialAppState,
						theme: resolvedTheme === "dark" ? "dark" : "light",
					},
				}}
				viewModeEnabled={true}
				zenModeEnabled={true}
				theme={resolvedTheme === "dark" ? "dark" : "light"}
				excalidrawAPI={(api) => setExcalidrawAPI(api)}
				UIOptions={{
					canvasActions: {
						toggleTheme: false,
						export: false,
						saveAsImage: false,
					},
				}}
			/>
		</div>
	);
}
