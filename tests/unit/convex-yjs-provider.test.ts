import { describe, expect, it, vi } from "vitest";
import { Awareness } from "y-protocols/awareness";
import * as Y from "yjs";

import type { Id } from "../../convex/_generated/dataModel";
import { ConvexYjsProvider } from "../../src/lib/convex-yjs-provider";

// Use a fake document ID for testing — the mock client doesn't validate types
const TEST_DOC_ID = "test-doc-id" as Id<"documents">;

/**
 * Creates a mock ConvexReactClient for testing.
 * Tracks separate watch channels by call order:
 * - 1st watchQuery call = document sync
 * - 2nd watchQuery call = awareness sync
 */
function createMockClient() {
	const watchEntries: Array<{
		callback: () => void;
		result: { current: unknown };
	}> = [];

	const mockClient = {
		watchQuery: vi.fn(() => {
			const entry = {
				callback: () => {},
				result: { current: undefined as unknown },
			};
			watchEntries.push(entry);

			return {
				onUpdate: (cb: () => void) => {
					entry.callback = cb;
					return () => {
						entry.callback = () => {};
					};
				},
				localQueryResult: () => entry.result.current,
			};
		}),
		mutation: vi.fn().mockResolvedValue(null),
	};

	return {
		// biome-ignore lint/suspicious/noExplicitAny: mock client for testing
		client: mockClient as any,
		/** Simulate a server document state update (targets 1st watchQuery = index 0) */
		pushDocumentState: (
			state: {
				snapshot?: ArrayBuffer;
				updates: ArrayBuffer[];
				snapshotVersion: number;
			} | null,
		) => {
			const docWatch = watchEntries[0];
			if (docWatch) {
				docWatch.result.current = state;
				docWatch.callback();
			}
		},
		/** Simulate a server awareness state update (targets 2nd watchQuery = index 1) */
		pushAwarenessState: (
			entries: Array<{ clientId: number; awarenessState: string }>,
		) => {
			const awarenessWatch = watchEntries[1];
			if (awarenessWatch) {
				awarenessWatch.result.current = entries;
				awarenessWatch.callback();
			}
		},
		getMutationCalls: () => mockClient.mutation.mock.calls,
		mockClient,
	};
}

/** Helper: create a Yjs update that sets text content. */
function createTextUpdate(text: string): ArrayBuffer {
	const doc = new Y.Doc();
	const ytext = doc.getText("content");
	ytext.insert(0, text);
	const update = Y.encodeStateAsUpdate(doc);
	doc.destroy();
	return update.buffer as ArrayBuffer;
}

describe("ConvexYjsProvider", () => {
	it("implements the UnifiedProvider interface", () => {
		const { client } = createMockClient();
		const doc = new Y.Doc();
		const awareness = new Awareness(doc);

		const provider = new ConvexYjsProvider({
			options: { client, documentId: TEST_DOC_ID },
			doc,
			awareness,
		});

		expect(provider.type).toBe("convex");
		expect(provider.document).toBe(doc);
		expect(provider.awareness).toBe(awareness);
		expect(provider.isConnected).toBe(false);
		expect(provider.isSynced).toBe(false);
		expect(typeof provider.connect).toBe("function");
		expect(typeof provider.disconnect).toBe("function");
		expect(typeof provider.destroy).toBe("function");

		doc.destroy();
	});

	it("sets isConnected to true on connect", () => {
		const { client } = createMockClient();
		const doc = new Y.Doc();
		const awareness = new Awareness(doc);
		const onConnect = vi.fn();

		const provider = new ConvexYjsProvider({
			options: { client, documentId: TEST_DOC_ID },
			doc,
			awareness,
			onConnect,
		});

		provider.connect();
		expect(provider.isConnected).toBe(true);
		expect(onConnect).toHaveBeenCalledOnce();

		provider.destroy();
		doc.destroy();
	});

	it("sets isConnected to false on disconnect", () => {
		const { client } = createMockClient();
		const doc = new Y.Doc();
		const awareness = new Awareness(doc);
		const onDisconnect = vi.fn();

		const provider = new ConvexYjsProvider({
			options: { client, documentId: TEST_DOC_ID },
			doc,
			awareness,
			onDisconnect,
		});

		provider.connect();
		provider.disconnect();
		expect(provider.isConnected).toBe(false);
		expect(onDisconnect).toHaveBeenCalledOnce();

		doc.destroy();
	});

	it("applies remote document state on initial sync", () => {
		const { client, pushDocumentState } = createMockClient();
		const doc = new Y.Doc();
		const awareness = new Awareness(doc);
		const onSyncChange = vi.fn();

		const provider = new ConvexYjsProvider({
			options: { client, documentId: TEST_DOC_ID },
			doc,
			awareness,
			onSyncChange,
		});

		provider.connect();

		const update = createTextUpdate("hello world");
		pushDocumentState({
			updates: [update],
			snapshotVersion: 0,
		});

		const text = doc.getText("content");
		expect(text.toJSON()).toBe("hello world");
		expect(provider.isSynced).toBe(true);
		expect(onSyncChange).toHaveBeenCalledWith(true);

		provider.destroy();
		doc.destroy();
	});

	it("applies snapshot + incremental updates", () => {
		const { client, pushDocumentState } = createMockClient();
		const doc = new Y.Doc();
		const awareness = new Awareness(doc);

		const provider = new ConvexYjsProvider({
			options: { client, documentId: TEST_DOC_ID },
			doc,
			awareness,
		});

		provider.connect();

		const snapshotDoc = new Y.Doc();
		snapshotDoc.getText("content").insert(0, "base");
		const snapshot = Y.encodeStateAsUpdate(snapshotDoc).buffer as ArrayBuffer;
		snapshotDoc.destroy();

		const incrementalUpdate = createTextUpdate("extra");

		pushDocumentState({
			snapshot,
			updates: [incrementalUpdate],
			snapshotVersion: 1,
		});

		const text = doc.getText("content");
		const content = text.toJSON();
		expect(content).toContain("base");

		provider.destroy();
		doc.destroy();
	});

	it("batches local updates with debounce before pushing", async () => {
		vi.useFakeTimers();
		const { client, pushDocumentState, getMutationCalls } = createMockClient();
		const doc = new Y.Doc();
		const awareness = new Awareness(doc);

		const provider = new ConvexYjsProvider({
			options: { client, documentId: TEST_DOC_ID },
			doc,
			awareness,
		});

		provider.connect();

		// Trigger initial sync
		pushDocumentState({ updates: [], snapshotVersion: 0 });

		// Make multiple rapid local changes
		doc.getText("content").insert(0, "a");
		doc.getText("content").insert(1, "b");
		doc.getText("content").insert(2, "c");

		// Before debounce fires, no pushUpdate mutation should be called
		const pushCallsBefore = getMutationCalls().filter((call: unknown[]) => {
			const args = call[1] as Record<string, unknown> | undefined;
			return args && "update" in args && "documentId" in args;
		});
		expect(pushCallsBefore).toHaveLength(0);

		// Advance past the debounce timer (150ms)
		await vi.advanceTimersByTimeAsync(200);

		// Now exactly one batched pushUpdate should have been called
		const pushCallsAfter = getMutationCalls().filter((call: unknown[]) => {
			const args = call[1] as Record<string, unknown> | undefined;
			return args && "update" in args && "documentId" in args;
		});
		expect(pushCallsAfter).toHaveLength(1);

		const pushArgs = pushCallsAfter[0][1] as {
			documentId: string;
			update: ArrayBuffer;
		};
		expect(pushArgs.documentId).toBe(TEST_DOC_ID);
		expect(pushArgs.update).toBeInstanceOf(ArrayBuffer);

		provider.destroy();
		doc.destroy();
		vi.useRealTimers();
	});

	it("buffers updates on mutation failure and retries", async () => {
		vi.useFakeTimers();
		const { client, pushDocumentState, mockClient } = createMockClient();
		const doc = new Y.Doc();
		const awareness = new Awareness(doc);
		const onError = vi.fn();

		const provider = new ConvexYjsProvider({
			options: { client, documentId: TEST_DOC_ID },
			doc,
			awareness,
			onError,
		});

		provider.connect();
		pushDocumentState({ updates: [], snapshotVersion: 0 });

		// Make the mutation fail
		mockClient.mutation.mockRejectedValueOnce(new Error("Network error"));

		// Make a local change
		doc.getText("content").insert(0, "fail-test");

		// Advance past debounce
		await vi.advanceTimersByTimeAsync(200);

		// Error handler should have been called
		expect(onError).toHaveBeenCalledOnce();
		expect(onError.mock.calls[0][0].message).toBe("Network error");

		// Now make mutation succeed for the retry
		mockClient.mutation.mockResolvedValue(null);

		// Advance past retry backoff (1s for first failure)
		await vi.advanceTimersByTimeAsync(1100);

		// The retry should have pushed the buffered update
		const pushCalls = mockClient.mutation.mock.calls.filter(
			(call: unknown[]) => {
				const args = call[1] as Record<string, unknown> | undefined;
				return args && "update" in args && "documentId" in args;
			},
		);
		expect(pushCalls.length).toBeGreaterThanOrEqual(2); // original fail + retry

		provider.destroy();
		doc.destroy();
		vi.useRealTimers();
	});

	it("flushes pending buffer when remote state arrives", async () => {
		vi.useFakeTimers();
		const { client, pushDocumentState, mockClient } = createMockClient();
		const doc = new Y.Doc();
		const awareness = new Awareness(doc);

		const provider = new ConvexYjsProvider({
			options: { client, documentId: TEST_DOC_ID },
			doc,
			awareness,
		});

		provider.connect();
		pushDocumentState({ updates: [], snapshotVersion: 0 });

		// Fail the first mutation
		mockClient.mutation.mockRejectedValueOnce(new Error("Offline"));

		doc.getText("content").insert(0, "buffered");
		await vi.advanceTimersByTimeAsync(200);

		// Now allow mutations to succeed
		mockClient.mutation.mockResolvedValue(null);

		// Simulate remote state arriving (connection restored)
		const remoteUpdate = createTextUpdate("remote");
		pushDocumentState({
			updates: [remoteUpdate],
			snapshotVersion: 0,
		});

		// The remote state handler should trigger a buffer flush
		await vi.advanceTimersByTimeAsync(50);

		const pushCalls = mockClient.mutation.mock.calls.filter(
			(call: unknown[]) => {
				const args = call[1] as Record<string, unknown> | undefined;
				return args && "update" in args && "documentId" in args;
			},
		);
		// Should have at least 2 calls: the failed one + the retry after remote state
		expect(pushCalls.length).toBeGreaterThanOrEqual(2);

		provider.destroy();
		doc.destroy();
		vi.useRealTimers();
	});

	it("does not re-send remote updates back to server", async () => {
		vi.useFakeTimers();
		const { client, pushDocumentState, getMutationCalls } = createMockClient();
		const doc = new Y.Doc();
		const awareness = new Awareness(doc);

		const provider = new ConvexYjsProvider({
			options: { client, documentId: TEST_DOC_ID },
			doc,
			awareness,
		});

		provider.connect();

		const update = createTextUpdate("remote content");
		pushDocumentState({
			updates: [update],
			snapshotVersion: 0,
		});

		// Wait past debounce
		await vi.advanceTimersByTimeAsync(200);

		const pushUpdateCalls = getMutationCalls().filter((call: unknown[]) => {
			const args = call[1] as Record<string, unknown> | undefined;
			return args && "update" in args && "documentId" in args;
		});
		expect(pushUpdateCalls).toHaveLength(0);

		provider.destroy();
		doc.destroy();
		vi.useRealTimers();
	});

	it("handles incremental updates without re-applying old ones", () => {
		const { client, pushDocumentState } = createMockClient();
		const doc = new Y.Doc();
		const awareness = new Awareness(doc);

		const provider = new ConvexYjsProvider({
			options: { client, documentId: TEST_DOC_ID },
			doc,
			awareness,
		});

		provider.connect();

		const update1 = createTextUpdate("a");
		const update2 = createTextUpdate("b");
		pushDocumentState({
			updates: [update1, update2],
			snapshotVersion: 0,
		});

		const update3 = createTextUpdate("c");
		pushDocumentState({
			updates: [update1, update2, update3],
			snapshotVersion: 0,
		});

		const text = doc.getText("content");
		expect(text.toJSON().length).toBeGreaterThan(0);
		expect(provider.isSynced).toBe(true);

		provider.destroy();
		doc.destroy();
	});

	it("creates own Y.Doc and Awareness when none provided", () => {
		const { client } = createMockClient();

		const provider = new ConvexYjsProvider({
			options: { client, documentId: TEST_DOC_ID },
		});

		expect(provider.document).toBeInstanceOf(Y.Doc);
		expect(provider.awareness).toBeInstanceOf(Awareness);

		provider.destroy();
		provider.document.destroy();
	});

	it("connect is idempotent", () => {
		const { client } = createMockClient();
		const doc = new Y.Doc();
		const awareness = new Awareness(doc);
		const onConnect = vi.fn();

		const provider = new ConvexYjsProvider({
			options: { client, documentId: TEST_DOC_ID },
			doc,
			awareness,
			onConnect,
		});

		provider.connect();
		provider.connect();
		expect(onConnect).toHaveBeenCalledOnce();

		provider.destroy();
		doc.destroy();
	});

	it("sets awareness user info on connect", () => {
		const { client } = createMockClient();
		const doc = new Y.Doc();
		const awareness = new Awareness(doc);

		const provider = new ConvexYjsProvider({
			options: {
				client,
				documentId: TEST_DOC_ID,
				user: { name: "Alice", color: "#ff0000" },
			},
			doc,
			awareness,
		});

		provider.connect();

		const localState = awareness.getLocalState();
		expect(localState?.user).toEqual({ name: "Alice", color: "#ff0000" });

		provider.destroy();
		doc.destroy();
	});

	it("cleans up remote awareness states for departed clients", () => {
		const { client, pushAwarenessState } = createMockClient();
		const doc = new Y.Doc();
		const awareness = new Awareness(doc);

		const provider = new ConvexYjsProvider({
			options: { client, documentId: TEST_DOC_ID },
			doc,
			awareness,
		});

		provider.connect();

		// Simulate two remote clients
		pushAwarenessState([
			{
				clientId: 100,
				awarenessState: JSON.stringify({ user: { name: "Alice" } }),
			},
			{
				clientId: 200,
				awarenessState: JSON.stringify({ user: { name: "Bob" } }),
			},
		]);

		expect(awareness.getStates().has(100)).toBe(true);
		expect(awareness.getStates().has(200)).toBe(true);

		// One client leaves
		pushAwarenessState([
			{
				clientId: 100,
				awarenessState: JSON.stringify({ user: { name: "Alice" } }),
			},
		]);

		expect(awareness.getStates().has(100)).toBe(true);
		expect(awareness.getStates().has(200)).toBe(false);

		provider.destroy();
		doc.destroy();
	});
});
