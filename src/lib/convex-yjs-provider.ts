import type { ProviderConstructorProps, UnifiedProvider } from "@platejs/yjs";
import type { ConvexReactClient } from "convex/react";
import { Awareness } from "y-protocols/awareness";
import * as Y from "yjs";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";

/**
 * Options passed to ConvexYjsProvider via the `options` field
 * of `ProviderConstructorProps`.
 */
export interface ConvexYjsProviderOptions {
	/** The Convex React client instance */
	client: ConvexReactClient;
	/** The document ID in the documents table */
	documentId: Id<"documents">;
	/** User info for awareness (name, color) */
	user?: { name: string; color: string };
}

const AWARENESS_DEBOUNCE_MS = 250;
const HEARTBEAT_INTERVAL_MS = 10_000;
const UPDATE_DEBOUNCE_MS = 150;
const MAX_RETRY_INTERVAL_MS = 5_000;

/**
 * Convert a Uint8Array to a standalone ArrayBuffer.
 * Handles the case where the Uint8Array is a view into a larger buffer.
 */
function toArrayBuffer(data: Uint8Array): ArrayBuffer {
	// Use slice to create a standalone ArrayBuffer (handles views into larger buffers)
	const buf = data.buffer as ArrayBuffer;
	if (data.byteOffset === 0 && data.byteLength === buf.byteLength) {
		return buf;
	}
	return buf.slice(data.byteOffset, data.byteOffset + data.byteLength);
}

/**
 * Custom Yjs provider that syncs a Y.Doc with Convex via
 * mutations (writes) and reactive query subscriptions (reads).
 *
 * Implements the UnifiedProvider interface required by @platejs/yjs.
 *
 * Features:
 * - Debounced update batching (150ms) to reduce mutation frequency
 * - Update buffering during disconnection with automatic retry
 * - Awareness protocol for cursor/selection sharing
 * - Automatic compaction on the server after 50 updates
 */
export class ConvexYjsProvider implements UnifiedProvider {
	readonly type = "convex";

	private _document: Y.Doc;
	private _awareness: Awareness;
	private _isConnected = false;
	private _isSynced = false;

	private readonly client: ConvexReactClient;
	private readonly documentId: Id<"documents">;
	private readonly user?: { name: string; color: string };

	// Event handlers from Plate's YjsPlugin
	private readonly onConnect?: () => void;
	private readonly onDisconnect?: () => void;
	private readonly onError?: (error: Error) => void;
	private readonly onSyncChange?: (isSynced: boolean) => void;

	// Subscription unsubscribe handles
	private unsubscribeDocument: (() => void) | null = null;
	private unsubscribeAwareness: (() => void) | null = null;

	// Y.Doc update handler reference
	private docUpdateHandler:
		| ((update: Uint8Array, origin: unknown) => void)
		| null = null;

	// Awareness change handler reference
	private awarenessChangeHandler:
		| ((
				changes: {
					added: number[];
					updated: number[];
					removed: number[];
				},
				origin: unknown,
		  ) => void)
		| null = null;

	// Timers
	private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
	private awarenessDebounceTimer: ReturnType<typeof setTimeout> | null = null;
	private updateDebounceTimer: ReturnType<typeof setTimeout> | null = null;
	private retryTimer: ReturnType<typeof setTimeout> | null = null;

	// Update buffering for debounce + reconnection
	private updateBuffer: Uint8Array[] = [];
	private isFlushing = false;
	private consecutiveFailures = 0;

	// Track which updates we've already applied to avoid re-processing
	private lastAppliedSnapshotVersion = -1;
	private lastAppliedUpdateCount = 0;
	private initialSyncDone = false;

	constructor({
		options,
		doc,
		awareness,
		onConnect,
		onDisconnect,
		onError,
		onSyncChange,
	}: ProviderConstructorProps<ConvexYjsProviderOptions>) {
		this.client = options.client;
		this.documentId = options.documentId;
		this.user = options.user;

		this._document = doc ?? new Y.Doc();
		this._awareness = awareness ?? new Awareness(this._document);

		this.onConnect = onConnect;
		this.onDisconnect = onDisconnect;
		this.onError = onError;
		this.onSyncChange = onSyncChange;
	}

	get document(): Y.Doc {
		return this._document;
	}

	get awareness(): Awareness {
		return this._awareness;
	}

	get isConnected(): boolean {
		return this._isConnected;
	}

	get isSynced(): boolean {
		return this._isSynced;
	}

	connect(): void {
		if (this._isConnected) return;

		this._isConnected = true;
		this.onConnect?.();

		this.startDocumentSync();
		this.startAwarenessSync();
	}

	disconnect(): void {
		if (!this._isConnected) return;

		// Flush any pending updates before disconnecting
		this.flushUpdateBufferSync();

		this.stopDocumentSync();
		this.stopAwarenessSync();

		this._isConnected = false;
		this.setSynced(false);
		this.onDisconnect?.();
	}

	destroy(): void {
		this.disconnect();
	}

	// ── Document Sync ────────────────────────────────────────────────────

	private startDocumentSync(): void {
		// Listen to local Y.Doc changes and buffer for debounced push
		this.docUpdateHandler = (update: Uint8Array, origin: unknown) => {
			if (origin === "remote") return;
			this.bufferLocalUpdate(update);
		};
		this._document.on("update", this.docUpdateHandler);

		// Subscribe to remote document state via Convex reactive query
		const watch = this.client.watchQuery(api.yjsSync.getDocument, {
			documentId: this.documentId,
		});

		const unsubWatch = watch.onUpdate(() => {
			const result = watch.localQueryResult();
			if (result === undefined) return;
			this.handleRemoteDocumentState(result);
		});

		this.unsubscribeDocument = unsubWatch;
	}

	private stopDocumentSync(): void {
		if (this.docUpdateHandler) {
			this._document.off("update", this.docUpdateHandler);
			this.docUpdateHandler = null;
		}
		if (this.unsubscribeDocument) {
			this.unsubscribeDocument();
			this.unsubscribeDocument = null;
		}
		if (this.updateDebounceTimer) {
			clearTimeout(this.updateDebounceTimer);
			this.updateDebounceTimer = null;
		}
		if (this.retryTimer) {
			clearTimeout(this.retryTimer);
			this.retryTimer = null;
		}
	}

	/**
	 * Buffer a local update and schedule a debounced flush.
	 * Updates are merged using Y.mergeUpdates before pushing.
	 */
	private bufferLocalUpdate(update: Uint8Array): void {
		this.updateBuffer.push(update);

		if (this.updateDebounceTimer) {
			clearTimeout(this.updateDebounceTimer);
		}
		this.updateDebounceTimer = setTimeout(() => {
			this.flushUpdateBuffer();
		}, UPDATE_DEBOUNCE_MS);
	}

	/**
	 * Merge and push all buffered updates to Convex.
	 * On failure, updates remain in the buffer for retry.
	 */
	private async flushUpdateBuffer(): Promise<void> {
		if (this.isFlushing || this.updateBuffer.length === 0) return;

		this.isFlushing = true;
		const updates = this.updateBuffer.splice(0);

		try {
			const merged =
				updates.length === 1 ? updates[0] : Y.mergeUpdates(updates);

			await this.client.mutation(api.yjsSync.pushUpdate, {
				documentId: this.documentId,
				update: toArrayBuffer(merged),
			});

			// Success — reset failure counter
			this.consecutiveFailures = 0;
		} catch (error) {
			// Put updates back for retry (prepend to buffer in case new ones arrived)
			this.updateBuffer.unshift(...updates);
			this.consecutiveFailures++;

			this.onError?.(error instanceof Error ? error : new Error(String(error)));

			// Schedule retry with exponential backoff (capped)
			this.scheduleRetry();
		} finally {
			this.isFlushing = false;
		}
	}

	/**
	 * Synchronously attempt to flush — used during disconnect.
	 * Fire-and-forget; errors are silently ignored.
	 */
	private flushUpdateBufferSync(): void {
		if (this.updateBuffer.length === 0) return;

		const updates = this.updateBuffer.splice(0);
		try {
			const merged =
				updates.length === 1 ? updates[0] : Y.mergeUpdates(updates);

			this.client
				.mutation(api.yjsSync.pushUpdate, {
					documentId: this.documentId,
					update: toArrayBuffer(merged),
				})
				.catch(() => {
					// Best-effort on disconnect
				});
		} catch {
			// Ignore sync flush errors
		}
	}

	/**
	 * Schedule a retry with exponential backoff.
	 */
	private scheduleRetry(): void {
		if (this.retryTimer) return;

		const delay = Math.min(
			1000 * 2 ** (this.consecutiveFailures - 1),
			MAX_RETRY_INTERVAL_MS,
		);
		this.retryTimer = setTimeout(() => {
			this.retryTimer = null;
			this.flushUpdateBuffer();
		}, delay);
	}

	private handleRemoteDocumentState(
		data: {
			snapshot?: ArrayBuffer;
			updates: ArrayBuffer[];
			snapshotVersion: number;
		} | null,
	): void {
		if (!data) return;

		const safeApplyUpdate = (
			update: ArrayBuffer,
			source: string,
			index?: number,
		) => {
			try {
				Y.applyUpdate(this._document, new Uint8Array(update), "remote");
				return true;
			} catch (error) {
				const err = error instanceof Error ? error : new Error(String(error));
				const context = index === undefined ? source : `${source}[${index}]`;
				this.onError?.(
					new Error(`Failed to apply Yjs ${context}: ${err.message}`),
				);
				if (process.env.NODE_ENV === "development") {
					console.error(
						`[ConvexYjsProvider] Failed applying Yjs remote ${context}`,
						err,
					);
				}
				return false;
			}
		};

		let remoteApplyFailed = false;

		const { snapshot, updates, snapshotVersion } = data;

		// If snapshot version changed, a compaction happened — re-sync from snapshot
		if (snapshotVersion !== this.lastAppliedSnapshotVersion) {
			if (snapshot) {
				remoteApplyFailed ||= !safeApplyUpdate(snapshot, "snapshot");
			}
			for (const update of updates) {
				remoteApplyFailed ||= !safeApplyUpdate(update, "incremental");
			}
			this.lastAppliedSnapshotVersion = snapshotVersion;
			this.lastAppliedUpdateCount = updates.length;
		} else if (updates.length > this.lastAppliedUpdateCount) {
			// Apply only new incremental updates
			const newUpdates = updates.slice(this.lastAppliedUpdateCount);
			newUpdates.forEach((update, index) => {
				const applied = safeApplyUpdate(update, "incremental", index);
				remoteApplyFailed ||= !applied;
			});
			this.lastAppliedUpdateCount = updates.length;
		}

		if (remoteApplyFailed) {
			this.setSynced(false);
		}

		if (!this.initialSyncDone) {
			this.initialSyncDone = true;
			if (!remoteApplyFailed) {
				this.setSynced(true);
			}
		}

		// Remote data arriving means connection is alive — try flushing any pending updates
		if (this.updateBuffer.length > 0 && !this.isFlushing) {
			this.flushUpdateBuffer();
		}
	}

	// ── Awareness Sync ───────────────────────────────────────────────────

	private startAwarenessSync(): void {
		// Set local awareness state
		if (this.user) {
			this._awareness.setLocalStateField("user", this.user);
		}

		// Listen to local awareness changes and push to Convex (debounced)
		this.awarenessChangeHandler = ({ added, updated, removed }, origin) => {
			if (origin === "remote") return;

			const localClientId = this._document.clientID;
			const changedClients = [...added, ...updated, ...removed];

			if (changedClients.includes(localClientId)) {
				this.debouncedPushAwareness();
			}
		};
		this._awareness.on("change", this.awarenessChangeHandler);

		// Subscribe to remote awareness states
		const watch = this.client.watchQuery(api.yjsAwareness.listAwareness, {
			documentId: this.documentId,
		});

		const unsubWatch = watch.onUpdate(() => {
			const result = watch.localQueryResult();
			if (result === undefined) return;
			this.handleRemoteAwareness(result);
		});

		this.unsubscribeAwareness = unsubWatch;

		// Heartbeat to keep awareness alive
		this.heartbeatTimer = setInterval(() => {
			this.pushAwarenessState();
		}, HEARTBEAT_INTERVAL_MS);

		// Push initial awareness state
		this.pushAwarenessState();
	}

	private stopAwarenessSync(): void {
		if (this.awarenessChangeHandler) {
			this._awareness.off("change", this.awarenessChangeHandler);
			this.awarenessChangeHandler = null;
		}
		if (this.unsubscribeAwareness) {
			this.unsubscribeAwareness();
			this.unsubscribeAwareness = null;
		}
		if (this.heartbeatTimer) {
			clearInterval(this.heartbeatTimer);
			this.heartbeatTimer = null;
		}
		if (this.awarenessDebounceTimer) {
			clearTimeout(this.awarenessDebounceTimer);
			this.awarenessDebounceTimer = null;
		}

		// Notify server we're leaving
		this.client
			.mutation(api.yjsAwareness.leaveAwareness, {
				documentId: this.documentId,
				clientId: this._document.clientID,
			})
			.catch(() => {
				// Best-effort cleanup, ignore errors on disconnect
			});
	}

	private debouncedPushAwareness(): void {
		if (this.awarenessDebounceTimer) {
			clearTimeout(this.awarenessDebounceTimer);
		}
		this.awarenessDebounceTimer = setTimeout(() => {
			this.pushAwarenessState();
		}, AWARENESS_DEBOUNCE_MS);
	}

	private async pushAwarenessState(): Promise<void> {
		const localState = this._awareness.getLocalState();
		if (!localState) return;

		try {
			await this.client.mutation(api.yjsAwareness.upsertAwareness, {
				documentId: this.documentId,
				clientId: this._document.clientID,
				awarenessState: JSON.stringify(localState),
			});
		} catch {
			// Awareness is best-effort, don't propagate errors
		}
	}

	private handleRemoteAwareness(
		entries: Array<{ clientId: number; awarenessState: string }>,
	): void {
		const localClientId = this._document.clientID;

		for (const entry of entries) {
			if (entry.clientId === localClientId) continue;

			try {
				const state = JSON.parse(entry.awarenessState);
				const states = this._awareness.getStates();

				// Only apply if the remote state is different
				const currentState = states.get(entry.clientId);
				if (JSON.stringify(currentState) !== entry.awarenessState) {
					states.set(entry.clientId, state);
					this._awareness.emit("change", [
						{ added: [], updated: [entry.clientId], removed: [] },
						"remote",
					]);
				}
			} catch {
				// Ignore malformed awareness data
			}
		}

		// Clean up awareness for clients no longer present
		const remoteClientIds = new Set(
			entries
				.filter((e) => e.clientId !== localClientId)
				.map((e) => e.clientId),
		);
		const states = this._awareness.getStates();
		const removed: number[] = [];
		for (const [clientId] of states) {
			if (clientId !== localClientId && !remoteClientIds.has(clientId)) {
				states.delete(clientId);
				removed.push(clientId);
			}
		}
		if (removed.length > 0) {
			this._awareness.emit("change", [
				{ added: [], updated: [], removed },
				"remote",
			]);
		}
	}

	// ── Helpers ──────────────────────────────────────────────────────────

	private setSynced(synced: boolean): void {
		if (this._isSynced !== synced) {
			this._isSynced = synced;
			if (synced && process.env.NODE_ENV === "development") {
				performance.mark("doc-editor:yjs-synced");
			}
			this.onSyncChange?.(synced);
		}
	}
}
