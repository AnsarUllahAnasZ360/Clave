"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAIChatPanel } from "@/components/ai/ai-chat-context";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "clave:ai-trigger-y";
const TRIGGER_SIZE = 44;

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
 * Animated pixel "C" inside a circular button with an orbiting arc.
 * The arc rotates continuously, and the C pixels pulse subtly on hover.
 */
function AnimatedPixelC({ size = 44 }: { size?: number }) {
	const iconSize = size * 0.45;
	const grid = [
		[0, 1, 1, 1, 0],
		[1, 0, 0, 0, 1],
		[1, 0, 0, 0, 0],
		[1, 0, 0, 0, 0],
		[1, 0, 0, 0, 0],
		[1, 0, 0, 0, 1],
		[0, 1, 1, 1, 0],
	];
	const cols = 5;
	const rows = 7;
	const gap = iconSize * 0.06;
	const cellW = (iconSize - gap * (cols - 1)) / cols;
	const cellH = (iconSize - gap * (rows - 1)) / rows;

	const ringR = size / 2 - 2;
	const center = size / 2;

	return (
		<svg
			width={size}
			height={size}
			viewBox={`0 0 ${size} ${size}`}
			className="block"
		>
			{/* Outer ring — static subtle border */}
			<circle
				cx={center}
				cy={center}
				r={ringR}
				fill="none"
				stroke="white"
				strokeOpacity={0.15}
				strokeWidth={1.5}
			/>

			{/* Orbiting arc */}
			<circle
				cx={center}
				cy={center}
				r={ringR}
				fill="none"
				stroke="white"
				strokeOpacity={0.8}
				strokeWidth={2}
				strokeLinecap="round"
				strokeDasharray={`${ringR * 1.2} ${ringR * 5}`}
				className="animate-[ai-orbit_3s_linear_infinite] origin-center"
			/>

			{/* Pixel C grid — centered */}
			<g
				transform={`translate(${center - iconSize / 2}, ${center - iconSize / 2})`}
			>
				{grid.flatMap((row, ry) =>
					row.map((on, cx) => {
						if (!on) return null;
						return (
							<rect
								// biome-ignore lint/suspicious/noArrayIndexKey: static pixel grid
								key={`${ry}-${cx}`}
								x={cx * (cellW + gap)}
								y={ry * (cellH + gap)}
								width={cellW}
								height={cellH}
								rx={cellW * 0.15}
								fill="white"
							/>
						);
					}),
				)}
			</g>
		</svg>
	);
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
			const maxY = window.innerHeight - TRIGGER_SIZE - 16;
			setYPos(Math.min(Math.max(16, stored), maxY));
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
		const maxY = window.innerHeight - TRIGGER_SIZE - 16;
		const newY = Math.min(Math.max(16, dragStartPos.current + deltaY), maxY);
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
				"rounded-l-2xl",
				"bg-sienna-600 shadow-lg transition-all hover:bg-sienna-500",
				"hover:shadow-[0_0_16px_2px_rgba(194,106,58,0.35)]",
				"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sienna-500 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
				"touch-none select-none",
			)}
			style={{
				top: yPos,
				width: TRIGGER_SIZE,
				height: TRIGGER_SIZE,
			}}
			aria-label="Open AI assistant"
		>
			<AnimatedPixelC size={TRIGGER_SIZE - 4} />
		</button>
	);
}
