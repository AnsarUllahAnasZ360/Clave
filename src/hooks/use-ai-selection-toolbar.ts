"use client";

/**
 * Hook for the AI selection toolbar.
 *
 * Subscribes to editor selection changes via the AIEditorAdapter
 * and provides the toolbar's visibility state, position, and
 * selected text. Handles Cmd+Shift+I shortcut for quick "Improve".
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type {
	AIEditorAdapter,
	Selection,
} from "@/components/ai/editor/AIEditorAdapter";

// ── Types ───────────────────────────────────────────────────────────────────

export interface AISelectionToolbarState {
	/** The currently selected text. */
	selectedText: string | null;
	/** Screen position for the toolbar (fixed positioning). */
	position: { x: number; y: number } | null;
	/** Whether the toolbar should be visible. */
	visible: boolean;
	/** Dismiss the toolbar manually. */
	dismiss: () => void;
}

interface UseAISelectionToolbarOptions {
	/** The editor adapter to observe. */
	adapter: AIEditorAdapter | null;
	/** Minimum selection length (in characters) to show the toolbar. */
	minSelectionLength?: number;
	/** Whether to disable the toolbar (e.g., in share mode). */
	disabled?: boolean;
	/** Callback when Cmd+Shift+I is pressed with text selected. */
	onImproveShortcut?: (selectedText: string) => void;
}

// ── Positioning ─────────────────────────────────────────────────────────────

const AI_TOOLBAR_HEIGHT_ESTIMATE = 48;
const FLOATING_TOOLBAR_HEIGHT_ESTIMATE = 44;
const TOOLBAR_PADDING = 8;
const TOOLBAR_STACK_GAP = 8;
const TOOLBAR_HALF_WIDTH_ESTIMATE = 160;

interface ToolbarViewport {
	width: number;
	height: number;
}

interface ToolbarRect {
	left: number;
	top: number;
	bottom: number;
	width: number;
}

function clamp(value: number, min: number, max: number) {
	return Math.min(Math.max(value, min), max);
}

function getSelectionRect(): DOMRect | null {
	const sel = window.getSelection();
	if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return null;

	const range = sel.getRangeAt(0);
	const rect = range.getBoundingClientRect();

	// Ignore zero-dimension rects (can happen with collapsed ranges).
	if (rect.width === 0 && rect.height === 0) return null;

	return rect;
}

export function computeAISelectionToolbarPosition(
	rect: ToolbarRect,
	viewport: ToolbarViewport = {
		width: window.innerWidth,
		height: window.innerHeight,
	},
): { x: number; y: number } {
	const minX = TOOLBAR_PADDING + TOOLBAR_HALF_WIDTH_ESTIMATE;
	const maxX = viewport.width - TOOLBAR_HALF_WIDTH_ESTIMATE - TOOLBAR_PADDING;

	// Center horizontally around the selection.
	let x = rect.left + rect.width / 2;

	// Clamp to viewport edges with padding.
	if (minX > maxX) {
		x = viewport.width / 2;
	} else {
		x = clamp(x, minX, maxX);
	}

	// Keep AI controls away from Plate's floating formatting toolbar.
	const stackedOffset =
		FLOATING_TOOLBAR_HEIGHT_ESTIMATE + TOOLBAR_STACK_GAP + TOOLBAR_PADDING;
	const belowY = rect.bottom + stackedOffset;
	const aboveY = rect.top - AI_TOOLBAR_HEIGHT_ESTIMATE - stackedOffset;
	const canFitBelow =
		belowY + AI_TOOLBAR_HEIGHT_ESTIMATE <= viewport.height - TOOLBAR_PADDING;
	const canFitAbove = aboveY >= TOOLBAR_PADDING;

	let y = belowY;
	if (!canFitBelow && canFitAbove) {
		y = aboveY;
	} else if (!canFitBelow && !canFitAbove) {
		y = clamp(
			rect.bottom + TOOLBAR_PADDING,
			TOOLBAR_PADDING,
			viewport.height - AI_TOOLBAR_HEIGHT_ESTIMATE - TOOLBAR_PADDING,
		);
	}

	return { x, y };
}

// ── Hook ────────────────────────────────────────────────────────────────────

export function useAISelectionToolbar({
	adapter,
	minSelectionLength = 3,
	disabled = false,
	onImproveShortcut,
}: UseAISelectionToolbarOptions): AISelectionToolbarState {
	const [selectedText, setSelectedText] = useState<string | null>(null);
	const [position, setPosition] = useState<{ x: number; y: number } | null>(
		null,
	);
	const [visible, setVisible] = useState(false);
	const dismissedRef = useRef(false);

	const dismiss = useCallback(() => {
		setVisible(false);
		setSelectedText(null);
		setPosition(null);
		dismissedRef.current = true;
	}, []);

	// Subscribe to adapter selection changes.
	useEffect(() => {
		if (!adapter || disabled) {
			setVisible(false);
			return;
		}

		const unsubscribe = adapter.onSelectionChange(
			(selection: Selection | null) => {
				if (!selection || selection.text.length < minSelectionLength) {
					setVisible(false);
					setSelectedText(null);
					setPosition(null);
					dismissedRef.current = false;
					return;
				}

				// Don't re-show if user explicitly dismissed.
				if (dismissedRef.current) return;

				const rect = getSelectionRect();
				if (!rect) {
					setVisible(false);
					return;
				}

				const pos = computeAISelectionToolbarPosition(rect);
				setSelectedText(selection.text);
				setPosition(pos);
				setVisible(true);
			},
		);

		return unsubscribe;
	}, [adapter, disabled, minSelectionLength]);

	// Reset dismissed state on any new click (user might re-select).
	useEffect(() => {
		const handleMouseDown = () => {
			dismissedRef.current = false;
		};
		document.addEventListener("mousedown", handleMouseDown);
		return () => document.removeEventListener("mousedown", handleMouseDown);
	}, []);

	// Cmd+Shift+I shortcut → trigger "Improve" if text is selected.
	useEffect(() => {
		if (disabled || !onImproveShortcut) return;

		const handler = (e: KeyboardEvent) => {
			if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === "i") {
				const text = adapter?.getSelectedText();
				if (text && text.length >= minSelectionLength) {
					e.preventDefault();
					onImproveShortcut(text);
				}
			}
		};

		document.addEventListener("keydown", handler);
		return () => document.removeEventListener("keydown", handler);
	}, [adapter, disabled, minSelectionLength, onImproveShortcut]);

	// Dismiss on Escape.
	useEffect(() => {
		if (!visible) return;

		const handler = (e: KeyboardEvent) => {
			if (e.key === "Escape") {
				e.preventDefault();
				dismiss();
			}
		};

		document.addEventListener("keydown", handler);
		return () => document.removeEventListener("keydown", handler);
	}, [visible, dismiss]);

	return { selectedText, position, visible, dismiss };
}
