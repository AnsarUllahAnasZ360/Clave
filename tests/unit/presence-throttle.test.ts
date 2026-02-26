import { describe, expect, it } from "vitest";
import {
	PRESENCE_TOUCH_FRESH_MS as DOCUMENT_FRESH_MS,
	isDocumentCursorUnchanged,
	isPresenceTouchFresh as isDocumentTouchFresh,
} from "../../convex/documentPresence";
import {
	isWhiteboardCursorUnchanged,
	isPresenceTouchFresh as isWhiteboardTouchFresh,
	PRESENCE_TOUCH_FRESH_MS as WHITEBOARD_FRESH_MS,
} from "../../convex/whiteboardPresence";
import {
	isPresenceTouchFresh as isWorkspaceTouchFresh,
	PRESENCE_TOUCH_FRESH_MS as WORKSPACE_FRESH_MS,
} from "../../convex/workspacePresence";

describe("presence throttle helpers", () => {
	it("uses the same fresh-window threshold across presence modules", () => {
		expect(WORKSPACE_FRESH_MS).toBe(8000);
		expect(DOCUMENT_FRESH_MS).toBe(8000);
		expect(WHITEBOARD_FRESH_MS).toBe(8000);
	});

	it("treats touches strictly newer than the freshness window as fresh", () => {
		const now = 100_000;
		const freshTimestamp = now - (WORKSPACE_FRESH_MS - 1);
		const staleTimestamp = now - WORKSPACE_FRESH_MS;

		expect(isWorkspaceTouchFresh(freshTimestamp, now)).toBe(true);
		expect(isWorkspaceTouchFresh(staleTimestamp, now)).toBe(false);
		expect(isDocumentTouchFresh(freshTimestamp, now)).toBe(true);
		expect(isDocumentTouchFresh(staleTimestamp, now)).toBe(false);
		expect(isWhiteboardTouchFresh(freshTimestamp, now)).toBe(true);
		expect(isWhiteboardTouchFresh(staleTimestamp, now)).toBe(false);
	});

	it("detects no-op document cursor updates", () => {
		expect(
			isDocumentCursorUnchanged(
				{ cursorFrom: 10, cursorTo: 12 },
				{ cursorFrom: 10, cursorTo: 12 },
			),
		).toBe(true);
		expect(
			isDocumentCursorUnchanged(
				{ cursorFrom: 10, cursorTo: 12 },
				{ cursorFrom: 10, cursorTo: 13 },
			),
		).toBe(false);
	});

	it("detects no-op whiteboard cursor updates including undefined values", () => {
		expect(
			isWhiteboardCursorUnchanged(
				{ cursorX: undefined, cursorY: undefined },
				{ cursorX: undefined, cursorY: undefined },
			),
		).toBe(true);
		expect(
			isWhiteboardCursorUnchanged(
				{ cursorX: 20, cursorY: 30 },
				{ cursorX: 20, cursorY: 31 },
			),
		).toBe(false);
	});
});
