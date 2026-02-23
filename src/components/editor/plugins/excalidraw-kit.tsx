"use client";

import { ExcalidrawPlugin } from "@platejs/excalidraw/react";
import dynamic from "next/dynamic";

// Lazy-load the Excalidraw render component (~1MB+ bundle).
// The plugin schema stays registered eagerly for serialization/deserialization.
const LazyExcalidrawElement = dynamic(
	() =>
		import("@/components/ui/excalidraw-node").then((m) => ({
			default: m.ExcalidrawElement,
		})),
	{
		ssr: false,
		loading: () => (
			<div className="mx-auto aspect-video h-[600px] w-[min(100%,600px)] animate-pulse rounded-sm border bg-muted" />
		),
	},
);

export const ExcalidrawKit = [
	ExcalidrawPlugin.withComponent(LazyExcalidrawElement as any),
];
