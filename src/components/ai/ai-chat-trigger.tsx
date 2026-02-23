"use client";

import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { useAIChatPanel } from "@/components/ai/ai-chat-context";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "clave:ai-trigger-y";
const TRIGGER_SIZE = 44;
const EDGE_INSET = 20;

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

/**
 * Sparkle icon with an SVG glow filter.
 * Uses a warm sienna color — the glow radiates from the icon itself.
 */
function AISparkleIcon({ size = 22 }: { size?: number }) {
	return (
		<svg
			width={size}
			height={size}
			viewBox="0 0 24 24"
			fill="none"
			className="block animate-[ai-sparkle-breathe_3s_ease-in-out_infinite]"
			aria-hidden="true"
		>
			<defs>
				<filter id="sparkle-glow" x="-60%" y="-60%" width="220%" height="220%">
					<feGaussianBlur in="SourceGraphic" stdDeviation="2" result="blur" />
					<feMerge>
						<feMergeNode in="blur" />
						<feMergeNode in="SourceGraphic" />
					</feMerge>
				</filter>
			</defs>
			<g filter="url(#sparkle-glow)">
				{/* Main 4-point sparkle */}
				<path
					d="M12 2.5L13.2 9.4L20.5 12L13.2 14.6L12 21.5L10.8 14.6L3.5 12L10.8 9.4Z"
					fill="currentColor"
				/>
				{/* Small accent sparkle — top right */}
				<path
					d="M19 2.5L19.5 4.2L21.2 4.7L19.5 5.2L19 6.9L18.5 5.2L16.8 4.7L18.5 4.2Z"
					fill="currentColor"
					opacity={0.7}
				/>
			</g>
		</svg>
	);
}

export function AIChatTrigger() {
	const { isOpen, toggle } = useAIChatPanel();
	const pathname = usePathname();
	const [yPos, setYPos] = useState<number | null>(null);
	const isDragging = useRef(false);
	const dragStartY = useRef(0);
	const dragStartPos = useRef(0);
	const hasMoved = useRef(false);
	const triggerRef = useRef<HTMLButtonElement>(null);

	useEffect(() => {
		const stored = getStoredY();
		if (stored !== null) {
			const maxY = window.innerHeight - TRIGGER_SIZE - EDGE_INSET;
			setYPos(Math.min(Math.max(EDGE_INSET, stored), maxY));
		} else {
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
		const maxY = window.innerHeight - TRIGGER_SIZE - EDGE_INSET;
		const newY = Math.min(
			Math.max(EDGE_INSET, dragStartPos.current + deltaY),
			maxY,
		);
		setYPos(newY);
	}, []);

	const handlePointerUp = useCallback(() => {
		if (!isDragging.current) return;
		isDragging.current = false;
		if (yPos !== null) persistY(yPos);
		if (!hasMoved.current) {
			toggle();
		}
	}, [yPos, toggle]);

	if (isOpen || yPos === null || pathname.includes("/chat")) return null;

	return (
		<button
			ref={triggerRef}
			type="button"
			onPointerDown={handlePointerDown}
			onPointerMove={handlePointerMove}
			onPointerUp={handlePointerUp}
			className={cn(
				"fixed right-5 z-30 flex items-center justify-center",
				"rounded-full",
				"bg-transparent",
				// Circular border — matches icon color per theme
				"border border-sienna-400/40 dark:border-sienna-400/30",
				// Icon color — warm sienna, theme-aware
				"text-sienna-500 dark:text-sienna-400",
				"transition-[transform,color,border-color] duration-200",
				"hover:scale-110 hover:text-sienna-600 hover:border-sienna-500/50",
				"dark:hover:text-sienna-300 dark:hover:border-sienna-300/40",
				"focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-sienna-400/50",
				"touch-none select-none cursor-pointer",
			)}
			style={{
				top: yPos,
				width: TRIGGER_SIZE,
				height: TRIGGER_SIZE,
			}}
			aria-label="Open AI assistant"
		>
			<AISparkleIcon size={22} />
		</button>
	);
}
