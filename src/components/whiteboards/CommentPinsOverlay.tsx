"use client";

import { sceneCoordsToViewportCoords } from "@excalidraw/excalidraw";
import type {
	ExcalidrawImperativeAPI,
	Zoom,
} from "@excalidraw/excalidraw/types";
import { useCallback, useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

export type WhiteboardThread = {
	_id: string;
	canvasX?: number;
	canvasY?: number;
	resolved?: boolean;
	body: string;
	authorId: string;
	author: { name: string; image?: string };
	replies: Array<{
		_id: string;
		body: string;
		authorId: string;
		author: { name: string; image?: string };
		_creationTime: number;
	}>;
	_creationTime: number;
};

type CommentPinsOverlayProps = {
	threads: WhiteboardThread[];
	excalidrawAPI: ExcalidrawImperativeAPI | null;
	commentMode: boolean;
	placingPin: boolean;
	activeThreadId: string | null;
	onPinClick: (threadId: string) => void;
	onCanvasClick: (canvasX: number, canvasY: number) => void;
};

export function CommentPinsOverlay({
	threads,
	excalidrawAPI,
	commentMode,
	placingPin,
	activeThreadId,
	onPinClick,
	onCanvasClick,
}: CommentPinsOverlayProps) {
	const overlayRef = useRef<HTMLDivElement>(null);
	const pinRefsMap = useRef<Map<string, HTMLButtonElement>>(new Map());
	const rafIdRef = useRef<number>(0);

	// Use ref-based viewport tracking with rAF for smooth pin updates
	useEffect(() => {
		if (!excalidrawAPI) return;

		function updatePinPositions() {
			if (!excalidrawAPI) return;
			const appState = excalidrawAPI.getAppState();
			const viewport = {
				scrollX: appState.scrollX,
				scrollY: appState.scrollY,
				zoom: appState.zoom,
				offsetLeft: appState.offsetLeft,
				offsetTop: appState.offsetTop,
			};

			for (const thread of threads) {
				if (thread.canvasX === undefined || thread.canvasY === undefined)
					continue;
				const el = pinRefsMap.current.get(thread._id);
				if (!el) continue;

				const { x, y } = sceneCoordsToViewportCoords(
					{ sceneX: thread.canvasX, sceneY: thread.canvasY },
					viewport,
				);
				el.style.transform = `translate(-50%, -50%) translate(${x}px, ${y}px)`;
			}
		}

		// Initial position update
		updatePinPositions();

		const unsubScroll = excalidrawAPI.onScrollChange(() => {
			cancelAnimationFrame(rafIdRef.current);
			rafIdRef.current = requestAnimationFrame(updatePinPositions);
		});

		const unsubChange = excalidrawAPI.onChange(() => {
			cancelAnimationFrame(rafIdRef.current);
			rafIdRef.current = requestAnimationFrame(updatePinPositions);
		});

		return () => {
			unsubScroll();
			unsubChange();
			cancelAnimationFrame(rafIdRef.current);
		};
	}, [excalidrawAPI, threads]);

	const handleOverlayClick = useCallback(
		(e: React.MouseEvent<HTMLDivElement>) => {
			if (!placingPin || !excalidrawAPI || !overlayRef.current) return;

			// Only handle clicks directly on the overlay (not on pins)
			if (e.target !== overlayRef.current) return;

			const clientX = e.clientX;
			const clientY = e.clientY;

			const appState = excalidrawAPI.getAppState();
			const { x, y } = viewportToScene(clientX, clientY, appState);

			onCanvasClick(x, y);
		},
		[placingPin, excalidrawAPI, onCanvasClick],
	);

	return (
		<div
			ref={overlayRef}
			className={cn(
				"absolute inset-0 z-[5]",
				placingPin
					? "pointer-events-auto cursor-crosshair"
					: "pointer-events-none",
			)}
			onClick={handleOverlayClick}
		>
			{threads.map((thread, index) => {
				if (thread.canvasX === undefined || thread.canvasY === undefined)
					return null;

				const isActive = activeThreadId === thread._id;
				const isResolved = thread.resolved;

				return (
					<button
						type="button"
						key={thread._id}
						ref={(el) => {
							if (el) {
								pinRefsMap.current.set(thread._id, el);
							} else {
								pinRefsMap.current.delete(thread._id);
							}
						}}
						className={cn(
							"absolute flex items-center justify-center rounded-full border-2 pointer-events-auto transition-colors duration-150",
							"shadow-sm hover:shadow-md",
							isActive
								? "h-8 w-8 bg-sienna-9 border-sienna-9 text-white z-20 scale-110"
								: isResolved
									? "h-6 w-6 bg-muted/60 border-border/40 text-muted-foreground z-10 opacity-60"
									: "h-7 w-7 bg-sienna-9/90 border-sienna-9 text-white z-10 hover:scale-110",
						)}
						style={{
							left: 0,
							top: 0,
							willChange: "transform",
						}}
						onClick={(e) => {
							e.stopPropagation();
							onPinClick(thread._id);
						}}
						title={`Comment by ${thread.author.name}`}
					>
						<span
							className={cn(
								"font-mono font-semibold leading-none",
								isActive ? "text-xs" : "text-[10px]",
							)}
						>
							{index + 1}
						</span>
					</button>
				);
			})}
		</div>
	);
}

/** Convert viewport (client) coordinates to scene coordinates */
function viewportToScene(
	clientX: number,
	clientY: number,
	appState: {
		scrollX: number;
		scrollY: number;
		zoom: Zoom;
		offsetLeft: number;
		offsetTop: number;
	},
) {
	// Manual conversion: sceneX = (clientX - offsetLeft) / zoom - scrollX
	const x =
		(clientX - appState.offsetLeft) / appState.zoom.value - appState.scrollX;
	const y =
		(clientY - appState.offsetTop) / appState.zoom.value - appState.scrollY;
	return { x, y };
}
