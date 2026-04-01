"use client";

import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
	ArtifactPanel,
	ArtifactPanelProvider,
	useArtifactPanel,
} from "@/components/ai/ArtifactPanel";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";

const ARTIFACT_PANEL_STORAGE_KEY = "clave.chat.artifact-panel-width";
export const ARTIFACT_PANEL_DEFAULT_RATIO = 0.4;
export const ARTIFACT_PANEL_MIN_WIDTH = 320;
export const ARTIFACT_PANEL_MAX_RATIO = 0.65;
const ARTIFACT_PANEL_KEYBOARD_STEP = 24;
const CHAT_COLUMN_TARGET_MIN_WIDTH = 520;

export function getArtifactBounds(containerWidth: number): {
	min: number;
	max: number;
} {
	if (containerWidth <= 0) {
		return {
			min: ARTIFACT_PANEL_MIN_WIDTH,
			max: ARTIFACT_PANEL_MIN_WIDTH,
		};
	}

	const min = Math.max(
		260,
		Math.min(ARTIFACT_PANEL_MIN_WIDTH, Math.floor(containerWidth * 0.45)),
	);
	const maxByRatio = Math.floor(containerWidth * ARTIFACT_PANEL_MAX_RATIO);
	const maxByChatWidth = containerWidth - CHAT_COLUMN_TARGET_MIN_WIDTH;
	const max = Math.max(
		min,
		Math.min(maxByRatio, maxByChatWidth > 0 ? maxByChatWidth : maxByRatio),
	);

	return { min, max };
}

export function clampArtifactWidth(
	width: number,
	containerWidth: number,
): number {
	const { min, max } = getArtifactBounds(containerWidth);
	return Math.max(min, Math.min(width, max));
}

function ArtifactResizeHandle({
	onDragStart,
	onKeyDown,
	valueNow,
	valueMin,
	valueMax,
}: {
	onDragStart: (e: React.MouseEvent) => void;
	onKeyDown: (e: React.KeyboardEvent) => void;
	valueNow: number;
	valueMin: number;
	valueMax: number;
}) {
	return (
		<div
			className="group flex w-1.5 shrink-0 cursor-col-resize items-center justify-center transition-colors hover:bg-primary/20 active:bg-primary/30"
			onMouseDown={onDragStart}
			onKeyDown={onKeyDown}
			role="slider"
			aria-label="Resize artifact panel"
			aria-orientation="vertical"
			aria-valuenow={Math.round(valueNow)}
			aria-valuemin={Math.round(valueMin)}
			aria-valuemax={Math.round(valueMax)}
			tabIndex={0}
		>
			<div className="h-8 w-0.5 rounded-full bg-border transition-colors group-hover:bg-primary/50" />
		</div>
	);
}

function ChatLayoutInner({ children }: { children: ReactNode }) {
	const { isOpen } = useArtifactPanel();
	const isMobile = useIsMobile();
	const containerRef = useRef<HTMLDivElement>(null);
	const [containerWidth, setContainerWidth] = useState(0);
	const [artifactWidth, setArtifactWidth] = useState<number | null>(null);
	const [isDragging, setIsDragging] = useState(false);

	const bounds = useMemo(
		() => getArtifactBounds(containerWidth),
		[containerWidth],
	);
	const defaultArtifactWidth = useMemo(
		() =>
			clampArtifactWidth(
				Math.round(containerWidth * ARTIFACT_PANEL_DEFAULT_RATIO),
				containerWidth,
			),
		[containerWidth],
	);
	const resolvedArtifactWidth = useMemo(() => {
		const candidate = artifactWidth ?? defaultArtifactWidth;
		return clampArtifactWidth(candidate, containerWidth);
	}, [artifactWidth, defaultArtifactWidth, containerWidth]);

	const persistArtifactWidth = useCallback((width: number) => {
		if (typeof window === "undefined") return;
		window.localStorage.setItem(ARTIFACT_PANEL_STORAGE_KEY, String(width));
	}, []);

	const setClampedArtifactWidth = useCallback(
		(width: number) => {
			const clamped = clampArtifactWidth(width, containerWidth);
			setArtifactWidth(clamped);
			return clamped;
		},
		[containerWidth],
	);

	const handleDragStart = useCallback(
		(e: React.MouseEvent) => {
			e.preventDefault();
			setIsDragging(true);
			const startX = e.clientX;
			const startWidth = resolvedArtifactWidth;
			let latestWidth = startWidth;

			function onMouseMove(event: MouseEvent) {
				// Dragging left increases the right panel width.
				const delta = startX - event.clientX;
				latestWidth = setClampedArtifactWidth(startWidth + delta);
			}

			function onMouseUp() {
				setIsDragging(false);
				persistArtifactWidth(latestWidth);
				document.removeEventListener("mousemove", onMouseMove);
				document.removeEventListener("mouseup", onMouseUp);
				document.body.style.cursor = "";
				document.body.style.userSelect = "";
			}

			document.body.style.cursor = "col-resize";
			document.body.style.userSelect = "none";
			document.addEventListener("mousemove", onMouseMove);
			document.addEventListener("mouseup", onMouseUp);
		},
		[resolvedArtifactWidth, setClampedArtifactWidth, persistArtifactWidth],
	);

	const handleHandleKeyDown = useCallback(
		(e: React.KeyboardEvent) => {
			if (e.key === "ArrowLeft") {
				e.preventDefault();
				persistArtifactWidth(
					setClampedArtifactWidth(
						resolvedArtifactWidth + ARTIFACT_PANEL_KEYBOARD_STEP,
					),
				);
				return;
			}
			if (e.key === "ArrowRight") {
				e.preventDefault();
				persistArtifactWidth(
					setClampedArtifactWidth(
						resolvedArtifactWidth - ARTIFACT_PANEL_KEYBOARD_STEP,
					),
				);
				return;
			}
			if (e.key === "Home") {
				e.preventDefault();
				persistArtifactWidth(setClampedArtifactWidth(bounds.min));
				return;
			}
			if (e.key === "End") {
				e.preventDefault();
				persistArtifactWidth(setClampedArtifactWidth(bounds.max));
			}
		},
		[
			bounds.max,
			bounds.min,
			resolvedArtifactWidth,
			setClampedArtifactWidth,
			persistArtifactWidth,
		],
	);

	useEffect(() => {
		if (isMobile) return;
		const node = containerRef.current;
		if (!node) return;

		const observer = new ResizeObserver((entries) => {
			const width = entries[0]?.contentRect.width;
			if (width) {
				setContainerWidth(Math.round(width));
			}
		});
		observer.observe(node);
		return () => observer.disconnect();
	}, [isMobile]);

	useEffect(() => {
		if (isMobile || containerWidth <= 0 || artifactWidth !== null) return;
		if (typeof window === "undefined") return;
		const saved = window.localStorage.getItem(ARTIFACT_PANEL_STORAGE_KEY);
		const parsed = saved ? Number.parseInt(saved, 10) : Number.NaN;
		if (Number.isFinite(parsed)) {
			setArtifactWidth(clampArtifactWidth(parsed, containerWidth));
			return;
		}
		setArtifactWidth(defaultArtifactWidth);
	}, [isMobile, containerWidth, artifactWidth, defaultArtifactWidth]);

	useEffect(() => {
		if (artifactWidth === null || containerWidth <= 0) return;
		const clamped = clampArtifactWidth(artifactWidth, containerWidth);
		if (clamped !== artifactWidth) {
			setArtifactWidth(clamped);
		}
	}, [artifactWidth, containerWidth]);

	return (
		<div ref={containerRef} className="flex h-full flex-1 overflow-hidden">
			<div className="min-w-0 flex-1 flex flex-col h-full overflow-hidden">
				{children}
			</div>
			{/* Mobile: ArtifactPanel renders itself as a full-screen Dialog overlay */}
			{isMobile && <ArtifactPanel />}
			{/* Desktop: resizable split-view, opens at 40% width */}
			{isOpen && !isMobile && (
				<>
					<ArtifactResizeHandle
						onDragStart={handleDragStart}
						onKeyDown={handleHandleKeyDown}
						valueNow={resolvedArtifactWidth}
						valueMin={bounds.min}
						valueMax={bounds.max}
					/>
					<div
						className={cn(
							"shrink-0 overflow-hidden",
							!isDragging && "transition-[width] duration-200 ease-out",
						)}
						style={{ width: resolvedArtifactWidth }}
					>
						<ArtifactPanel />
					</div>
				</>
			)}
		</div>
	);
}

export default function ChatLayout({ children }: { children: ReactNode }) {
	return (
		<ArtifactPanelProvider>
			<ChatLayoutInner>{children}</ChatLayoutInner>
		</ArtifactPanelProvider>
	);
}
