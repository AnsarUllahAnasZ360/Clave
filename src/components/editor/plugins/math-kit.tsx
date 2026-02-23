"use client";

import { EquationPlugin, InlineEquationPlugin } from "@platejs/math/react";
import dynamic from "next/dynamic";

// Lazy-load equation render components to defer KaTeX CSS/JS loading
// until a math block is actually present in the document.
const LazyEquationElement = dynamic(
	() =>
		import("@/components/ui/equation-node").then((m) => ({
			default: m.EquationElement,
		})),
	{
		loading: () => (
			<div className="my-1 h-10 animate-pulse rounded-sm bg-muted p-3" />
		),
	},
);

const LazyInlineEquationElement = dynamic(
	() =>
		import("@/components/ui/equation-node").then((m) => ({
			default: m.InlineEquationElement,
		})),
	{
		loading: () => (
			<span className="mx-1 inline-block h-6 w-16 animate-pulse rounded-sm bg-muted" />
		),
	},
);

export const MathKit = [
	InlineEquationPlugin.withComponent(LazyInlineEquationElement as any),
	EquationPlugin.withComponent(LazyEquationElement as any),
];
