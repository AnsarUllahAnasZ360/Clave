import type { DragEndEvent } from "@dnd-kit/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	isSidebarDragActive,
	pulseDropTarget,
	resolveSidebarDropTarget,
	setSidebarDragActive,
	subscribeSidebarDrag,
} from "../../src/lib/sidebar-drag";

function buildDragEndEvent(
	pointX: number,
	pointY: number,
	over: unknown = null,
): DragEndEvent {
	const activator = new PointerEvent("pointerdown", {
		clientX: pointX,
		clientY: pointY,
	});
	return {
		active: { id: "issue-1" },
		over,
		activatorEvent: activator,
		delta: { x: 0, y: 0 },
		collisions: null,
	} as unknown as DragEndEvent;
}

function stubElementFromPoint(el: Element | null): void {
	// jsdom doesn't implement layout, so `elementFromPoint` is missing. Patch
	// it directly — `vi.spyOn` fails because the property is undefined.
	(
		document as unknown as { elementFromPoint: () => Element | null }
	).elementFromPoint = () => el;
}

describe("sidebar-drag", () => {
	beforeEach(() => {
		document.body.innerHTML = "";
		delete document.body.dataset.issueDragging;
		setSidebarDragActive(false);
	});

	afterEach(() => {
		setSidebarDragActive(false);
	});

	describe("setSidebarDragActive / isSidebarDragActive", () => {
		it("toggles the body data attribute and the internal flag", () => {
			expect(isSidebarDragActive()).toBe(false);
			expect(document.body.dataset.issueDragging).toBeUndefined();

			setSidebarDragActive(true);
			expect(isSidebarDragActive()).toBe(true);
			expect(document.body.dataset.issueDragging).toBe("true");

			setSidebarDragActive(false);
			expect(isSidebarDragActive()).toBe(false);
			expect(document.body.dataset.issueDragging).toBeUndefined();
		});

		it("is idempotent — repeated calls with the same value don't notify again", () => {
			const listener = vi.fn();
			const unsub = subscribeSidebarDrag(listener);

			setSidebarDragActive(true);
			setSidebarDragActive(true);
			setSidebarDragActive(false);
			setSidebarDragActive(false);

			expect(listener).toHaveBeenCalledTimes(2);
			expect(listener).toHaveBeenNthCalledWith(1, true);
			expect(listener).toHaveBeenNthCalledWith(2, false);
			unsub();
		});

		it("subscribeSidebarDrag returns a working unsubscribe", () => {
			const listener = vi.fn();
			const unsub = subscribeSidebarDrag(listener);
			unsub();
			setSidebarDragActive(true);
			expect(listener).not.toHaveBeenCalled();
		});
	});

	describe("resolveSidebarDropTarget", () => {
		function mountTarget(attrs: Record<string, string>): HTMLElement {
			const el = document.createElement("div");
			for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
			document.body.appendChild(el);
			stubElementFromPoint(el);
			return el;
		}

		it("resolves based on pointer position even when event.over is truthy", () => {
			// dnd-kit's collision detection fires against the dragged item's
			// rect, so `over` can still point to a board column at edges. The
			// resolver must defer to the honest pointer position.
			mountTarget({
				"data-issue-drop-target": "sprint",
				"data-sprint-id": "sprint-42",
				"data-project-id": "project-7",
			});
			const event = buildDragEndEvent(10, 10, { id: "col-todo" });
			expect(resolveSidebarDropTarget(event)).toEqual({
				kind: "sprint",
				sprintId: "sprint-42",
				projectId: "project-7",
			});
		});

		it("returns null when no drop target is hit", () => {
			stubElementFromPoint(null);
			const event = buildDragEndEvent(10, 10);
			expect(resolveSidebarDropTarget(event)).toBeNull();
		});

		it("resolves a sprint drop target", () => {
			mountTarget({
				"data-issue-drop-target": "sprint",
				"data-sprint-id": "sprint-42",
				"data-project-id": "project-7",
			});
			const event = buildDragEndEvent(10, 10);
			expect(resolveSidebarDropTarget(event)).toEqual({
				kind: "sprint",
				sprintId: "sprint-42",
				projectId: "project-7",
			});
		});

		it("resolves a backlog drop target", () => {
			mountTarget({
				"data-issue-drop-target": "backlog",
				"data-project-id": "project-7",
			});
			const event = buildDragEndEvent(10, 10);
			expect(resolveSidebarDropTarget(event)).toEqual({
				kind: "backlog",
				projectId: "project-7",
			});
		});

		it("resolves a project drop target", () => {
			mountTarget({
				"data-issue-drop-target": "project",
				"data-project-id": "project-7",
			});
			const event = buildDragEndEvent(10, 10);
			expect(resolveSidebarDropTarget(event)).toEqual({
				kind: "project",
				projectId: "project-7",
			});
		});

		it("returns null when sprint target is missing a sprintId", () => {
			mountTarget({
				"data-issue-drop-target": "sprint",
				"data-project-id": "project-7",
			});
			const event = buildDragEndEvent(10, 10);
			expect(resolveSidebarDropTarget(event)).toBeNull();
		});

		it("returns null when any target is missing a projectId", () => {
			mountTarget({
				"data-issue-drop-target": "backlog",
			});
			const event = buildDragEndEvent(10, 10);
			expect(resolveSidebarDropTarget(event)).toBeNull();
		});

		it("returns null when the data-issue-drop-target value is unknown", () => {
			mountTarget({
				"data-issue-drop-target": "bogus",
				"data-project-id": "project-7",
			});
			const event = buildDragEndEvent(10, 10);
			expect(resolveSidebarDropTarget(event)).toBeNull();
		});

		it("walks up the DOM to find the nearest [data-issue-drop-target]", () => {
			const outer = document.createElement("div");
			outer.setAttribute("data-issue-drop-target", "project");
			outer.setAttribute("data-project-id", "project-7");
			const inner = document.createElement("span");
			outer.appendChild(inner);
			document.body.appendChild(outer);
			stubElementFromPoint(inner);

			const event = buildDragEndEvent(10, 10);
			expect(resolveSidebarDropTarget(event)).toEqual({
				kind: "project",
				projectId: "project-7",
			});
		});
	});

	describe("pulseDropTarget", () => {
		beforeEach(() => {
			vi.useFakeTimers();
		});
		afterEach(() => {
			vi.useRealTimers();
		});

		it("sets data-drop-success on the matching sprint target and clears it later", () => {
			const el = document.createElement("div");
			el.setAttribute("data-issue-drop-target", "sprint");
			el.setAttribute("data-sprint-id", "s-1");
			el.setAttribute("data-project-id", "p-1");
			document.body.appendChild(el);

			pulseDropTarget("sprint", { projectId: "p-1", sprintId: "s-1" }, 500);
			expect(el.dataset.dropSuccess).toBe("true");

			vi.advanceTimersByTime(500);
			expect(el.dataset.dropSuccess).toBeUndefined();
		});

		it("matches backlog and project targets by projectId alone", () => {
			const backlog = document.createElement("div");
			backlog.setAttribute("data-issue-drop-target", "backlog");
			backlog.setAttribute("data-project-id", "p-1");
			document.body.appendChild(backlog);

			const project = document.createElement("div");
			project.setAttribute("data-issue-drop-target", "project");
			project.setAttribute("data-project-id", "p-1");
			document.body.appendChild(project);

			pulseDropTarget("backlog", { projectId: "p-1" }, 100);
			expect(backlog.dataset.dropSuccess).toBe("true");
			expect(project.dataset.dropSuccess).toBeUndefined();

			pulseDropTarget("project", { projectId: "p-1" }, 100);
			expect(project.dataset.dropSuccess).toBe("true");
		});

		it("is a no-op when the target element is not mounted", () => {
			expect(() =>
				pulseDropTarget("sprint", { projectId: "missing", sprintId: "x" }),
			).not.toThrow();
		});
	});
});
