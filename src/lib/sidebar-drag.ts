/**
 * Tiny global signal for "an issue/task drag is in progress".
 *
 * Views that own a `DndContext` (issue board, issue list, task kanban, etc.)
 * call `setSidebarDragActive(true)` in `onDragStart` and `false` in
 * `onDragEnd`/`onDragCancel`. Sidebar items use the subscription to enable
 * hover-to-expand only while a real drag is in flight — not on ordinary mouse
 * movement.
 *
 * Kept deliberately framework-free (no React) so the flag can flip
 * synchronously from inside dnd-kit callbacks without state batching.
 */

import type { DragEndEvent } from "@dnd-kit/core";

type Listener = (active: boolean) => void;

let dragActive = false;
const listeners = new Set<Listener>();

// Separate signal: "is the pointer currently over a sidebar drop target?".
// Views use this to shrink the DragOverlay when the card enters the sidebar
// so users can aim more precisely at narrow sprint/backlog rows.
let sidebarHoverActive = false;
const hoverListeners = new Set<Listener>();

function setSidebarHoverActive(active: boolean): void {
	if (sidebarHoverActive === active) return;
	sidebarHoverActive = active;
	for (const l of hoverListeners) l(active);
}

export function subscribeSidebarHover(listener: Listener): () => void {
	hoverListeners.add(listener);
	return () => {
		hoverListeners.delete(listener);
	};
}

// Single pointermove handler shared by drop-hover highlighting AND expand-
// on-hover. Installed only while a drag is active, rAF-throttled so we do at
// most one `elementFromPoint` per frame regardless of the pointer event rate
// (pointermove can fire 120+/sec on high-refresh displays).
//
// The prior implementation registered one `window` pointermove listener per
// sidebar item — each doing its own `getBoundingClientRect` — which forced
// layout dozens of times per pointer tick and made the drag visibly laggy
// on any non-trivial workspace. One elementFromPoint walk replaces all of
// that: the browser's hit-testing is O(1) for our purposes.

interface ExpandEntry {
	onExpand: () => void;
	delayMs: number;
}

const expandRegistry = new Map<HTMLElement, ExpandEntry>();
let hoverHandler: ((e: PointerEvent) => void) | null = null;
let hoverRafPending = false;
let hoverLastEvent: PointerEvent | null = null;
let currentHover: HTMLElement | null = null;
let currentExpand: HTMLElement | null = null;
let expandTimer: number | null = null;

function clearExpandTimer(): void {
	if (expandTimer !== null) {
		window.clearTimeout(expandTimer);
		expandTimer = null;
	}
}

function runHitTest(e: PointerEvent): void {
	const hit = document.elementFromPoint(e.clientX, e.clientY);

	// Drop-target hover highlight
	const drop = hit?.closest<HTMLElement>("[data-issue-drop-target]") ?? null;
	if (drop !== currentHover) {
		if (currentHover) delete currentHover.dataset.dropHover;
		if (drop) drop.dataset.dropHover = "true";
		currentHover = drop;
		setSidebarHoverActive(drop !== null);
	}

	// Expand-on-hover: start the dwell timer when the pointer enters a
	// registered expandable row. `closest` walks ancestors, so a drop
	// target nested inside an expandable row correctly binds to the row.
	const expand = hit?.closest<HTMLElement>("[data-drag-expand]") ?? null;
	if (expand !== currentExpand) {
		clearExpandTimer();
		currentExpand = expand;
		if (expand) {
			const entry = expandRegistry.get(expand);
			if (entry) {
				expandTimer = window.setTimeout(() => {
					expandTimer = null;
					entry.onExpand();
				}, entry.delayMs);
			}
		}
	}
}

function startHoverTracking(): void {
	if (hoverHandler) return;
	currentHover = null;
	currentExpand = null;
	hoverHandler = (e: PointerEvent) => {
		hoverLastEvent = e;
		if (hoverRafPending) return;
		hoverRafPending = true;
		requestAnimationFrame(() => {
			hoverRafPending = false;
			if (hoverLastEvent) runHitTest(hoverLastEvent);
		});
	};
	window.addEventListener("pointermove", hoverHandler, { passive: true });
}

function stopHoverTracking(): void {
	if (hoverHandler) {
		window.removeEventListener("pointermove", hoverHandler);
		hoverHandler = null;
	}
	if (typeof document !== "undefined") {
		for (const el of document.querySelectorAll<HTMLElement>(
			"[data-issue-drop-target][data-drop-hover]",
		)) {
			delete el.dataset.dropHover;
		}
	}
	clearExpandTimer();
	currentHover = null;
	currentExpand = null;
	hoverLastEvent = null;
	setSidebarHoverActive(false);
}

/**
 * Register an element as auto-expandable on drag hover. The caller supplies
 * an `onExpand` callback that runs once the pointer has dwelled over the
 * element for `delayMs`. Returns an unregister function.
 *
 * The element must also carry `data-drag-expand` so the global hit-test can
 * find it — the hook `useDragHoverExpand` handles both.
 */
export function registerDragHoverExpand(
	el: HTMLElement,
	entry: ExpandEntry,
): () => void {
	expandRegistry.set(el, entry);
	return () => {
		expandRegistry.delete(el);
		if (currentExpand === el) {
			clearExpandTimer();
			currentExpand = null;
		}
	};
}

export function setSidebarDragActive(active: boolean): void {
	if (dragActive === active) return;
	dragActive = active;
	if (typeof document !== "undefined") {
		if (active) {
			document.body.dataset.issueDragging = "true";
			startHoverTracking();
		} else {
			delete document.body.dataset.issueDragging;
			stopHoverTracking();
		}
	}
	for (const l of listeners) l(active);
}

export function isSidebarDragActive(): boolean {
	return dragActive;
}

export function subscribeSidebarDrag(listener: Listener): () => void {
	listeners.add(listener);
	return () => {
		listeners.delete(listener);
	};
}

// ── Drop target resolution ──────────────────────────────────────────────────

export type SidebarDropKind = "sprint" | "backlog" | "project";

export interface SidebarDropTarget {
	kind: SidebarDropKind;
	projectId: string;
	/** Only present when `kind === "sprint"`. */
	sprintId?: string;
}

/**
 * Hit-test the sidebar at the drag's release point and return the drop
 * target under the pointer, if any. Returns `null` when the pointer is not
 * over a `[data-issue-drop-target]` element.
 *
 * Callers should invoke this BEFORE falling back to in-view drop handling —
 * dnd-kit's collision detection fires against the dragged item's rect, so
 * `event.over` can still reference a board column when the user has actually
 * moved the pointer to the sidebar. Pointer position is the source of truth
 * for "did this drop hit the sidebar?".
 */
export function resolveSidebarDropTarget(
	event: DragEndEvent,
): SidebarDropTarget | null {
	const activator = event.activatorEvent as PointerEvent | null;
	if (!activator) return null;
	const endX = activator.clientX + event.delta.x;
	const endY = activator.clientY + event.delta.y;
	const hit = document.elementFromPoint(endX, endY);
	const target = hit?.closest<HTMLElement>("[data-issue-drop-target]");
	if (!target) return null;
	const kind = target.dataset.issueDropTarget as SidebarDropKind | undefined;
	const projectId = target.dataset.projectId;
	const sprintId = target.dataset.sprintId;
	if (!projectId) return null;
	if (kind === "sprint") {
		if (!sprintId) return null;
		return { kind, projectId, sprintId };
	}
	if (kind === "backlog" || kind === "project") {
		return { kind, projectId };
	}
	return null;
}

/**
 * Apply a brief visual pulse to a drop target to confirm a successful drop.
 * Sets `data-drop-success="true"` for `durationMs`. Safe to call from async
 * contexts — no-op if the target has been unmounted.
 */
export function pulseDropTarget(
	kind: SidebarDropKind,
	ids: { projectId: string; sprintId?: string },
	durationMs = 900,
): void {
	if (typeof document === "undefined") return;
	let selector = `[data-issue-drop-target="${kind}"][data-project-id="${ids.projectId}"]`;
	if (kind === "sprint" && ids.sprintId) {
		selector += `[data-sprint-id="${ids.sprintId}"]`;
	}
	const el = document.querySelector<HTMLElement>(selector);
	if (!el) return;
	el.dataset.dropSuccess = "true";
	window.setTimeout(() => {
		if (el.dataset.dropSuccess === "true") delete el.dataset.dropSuccess;
	}, durationMs);
}
