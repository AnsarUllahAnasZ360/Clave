"use client";

import { Excalidraw, restoreElements } from "@excalidraw/excalidraw";
import type {
	AppState,
	ExcalidrawImperativeAPI,
} from "@excalidraw/excalidraw/types";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import "@excalidraw/excalidraw/index.css";
import "@/styles/excalidraw.css";

// Self-host Excalidraw fonts
if (typeof window !== "undefined") {
	// biome-ignore lint/suspicious/noExplicitAny: Excalidraw reads this global at runtime
	(window as any).EXCALIDRAW_ASSET_PATH = "/excalidraw-assets/";
}

const RESTORE_SCENE_OPTIONS = {
	repairBindings: true,
	refreshDimensions: true,
} as const;

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

	// Parse scene data
	let initialElements: ReturnType<typeof restoreElements> = [];
	let initialAppState: Partial<AppState> = {};

	try {
		if (sceneData) {
			const raw = JSON.parse(sceneData);
			initialElements = restoreElements(raw, null, RESTORE_SCENE_OPTIONS);
		}
	} catch {
		// Invalid JSON -- show empty canvas
	}

	try {
		if (appState) {
			initialAppState = JSON.parse(appState) as Partial<AppState>;
		}
	} catch {
		// Invalid JSON -- use defaults
	}

	return (
		<div className="relative h-full w-full excalidraw-clave">
			<Excalidraw
				initialData={{
					elements: initialElements,
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
