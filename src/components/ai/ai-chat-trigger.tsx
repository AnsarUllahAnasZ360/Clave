"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAIChatPanel } from "@/components/ai/ai-chat-context";
import { PixelCIcon } from "@/components/ui/pixel-c-icon";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "clave:ai-trigger-y";
const TRIGGER_SIZE = 40;

function getStoredY(): number | null {
	if (typeof window === "undefined") return null;
	try {
		const stored = localStorage.getItem(STORAGE_KEY);
		return stored ? Number(stored) : null;
	} catch {
		return null;
	}
}

function persistY(y: number) {
	try {
		localStorage.setItem(STORAGE_KEY, String(Math.round(y)));
	} catch {
		// localStorage unavailable
	}
}

export function AIChatTrigger() {
	const { isOpen, toggle } = useAIChatPanel();
	const [yPos, setYPos] = useState<number | null>(null);
	const isDragging = useRef(false);
	const dragStartY = useRef(0);
	const dragStartPos = useRef(0);
	const hasMoved = useRef(false);
	const triggerRef = useRef<HTMLButtonElement>(null);

	// Initialize position on mount
	useEffect(() => {
		const stored = getStoredY();
		if (stored !== null) {
			// Clamp to viewport
			const maxY = window.innerHeight - TRIGGER_SIZE - 16;
			setYPos(Math.min(Math.max(16, stored), maxY));
		} else {
			// Default to vertically centered
			setYPos(window.innerHeight / 2 - TRIGGER_SIZE / 2);
		}
	}, []);

	const handlePointerDown = useCallback(
		(e: React.PointerEvent) => {
			if (isOpen) return;
			isDragging.current = true;
			hasMoved.current = false;
			dragStartY.current = e.clientY;
			dragStartPos.current = yPos ?? window.innerHeight / 2;
			(e.target as HTMLElement).setPointerCapture(e.pointerId);
			e.preventDefault();
		},
		[isOpen, yPos],
	);

	const handlePointerMove = useCallback((e: React.PointerEvent) => {
		if (!isDragging.current) return;
		const deltaY = e.clientY - dragStartY.current;
		if (Math.abs(deltaY) > 3) hasMoved.current = true;
		const maxY = window.innerHeight - TRIGGER_SIZE - 16;
		const newY = Math.min(Math.max(16, dragStartPos.current + deltaY), maxY);
		setYPos(newY);
	}, []);

	const handlePointerUp = useCallback(() => {
		if (!isDragging.current) return;
		isDragging.current = false;
		if (yPos !== null) persistY(yPos);
		// Only toggle if this was a click (not a drag)
		if (!hasMoved.current) {
			toggle();
		}
	}, [yPos, toggle]);

	if (isOpen || yPos === null) return null;

	return (
		<button
			ref={triggerRef}
			type="button"
			onPointerDown={handlePointerDown}
			onPointerMove={handlePointerMove}
			onPointerUp={handlePointerUp}
			className={cn(
				"fixed right-0 z-30 flex items-center justify-center",
				"h-10 w-10 rounded-l-full",
				"bg-sienna-600 text-white shadow-lg transition-colors hover:bg-sienna-500",
				"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sienna-500 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
				"touch-none select-none",
			)}
			style={{ top: yPos }}
			aria-label="Open AI assistant"
		>
			<PixelCIcon size={18} color="white" />
		</button>
	);
}
