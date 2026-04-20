import { useEffect, useRef } from "react";
import { registerDragHoverExpand } from "@/lib/sidebar-drag";

interface Options {
	/** Only arm the hover timer when true (typically `!isExpanded`). */
	enabled: boolean;
	/** Called once the pointer has dwelled over the target for `delayMs`. */
	onExpand: () => void;
	/** Dwell time before expanding (ms). Default 400. */
	delayMs?: number;
}

/**
 * Returns a ref that, when attached to a sidebar row, auto-expands the row
 * while an issue/task is being dragged and the pointer has dwelled over it.
 *
 * Implementation note: all hover detection runs through a single global
 * pointermove handler in `sidebar-drag.ts` (rAF-throttled). This hook just
 * stamps `data-drag-expand` on the element and registers its callback in
 * the shared registry — no per-item listener, no `getBoundingClientRect`
 * calls on pointer move.
 */
export function useDragHoverExpand<T extends HTMLElement>({
	enabled,
	onExpand,
	delayMs = 400,
}: Options) {
	const ref = useRef<T | null>(null);

	useEffect(() => {
		if (!enabled) return;
		const el = ref.current;
		if (!el) return;
		el.dataset.dragExpand = "true";
		const unregister = registerDragHoverExpand(el, { onExpand, delayMs });
		return () => {
			delete el.dataset.dragExpand;
			unregister();
		};
	}, [enabled, onExpand, delayMs]);

	return ref;
}
