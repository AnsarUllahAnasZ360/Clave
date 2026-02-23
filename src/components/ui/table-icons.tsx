"use client";

import {
	PanelBottom,
	PanelLeft,
	PanelRight,
	PanelTop,
	Square,
	SquareDashed,
} from "lucide-react";

export function BorderAllIcon() {
	return <SquareDashed />;
}

export function BorderBottomIcon() {
	return <PanelBottom />;
}

export function BorderLeftIcon() {
	return <PanelLeft />;
}

export function BorderNoneIcon() {
	return <Square />;
}

export function BorderRightIcon() {
	return <PanelRight />;
}

export function BorderTopIcon() {
	return <PanelTop />;
}
