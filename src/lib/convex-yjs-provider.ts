import type { ProviderConstructorProps, UnifiedProvider } from "@platejs/yjs";
import type { ConvexReactClient } from "convex/react";
import { Awareness } from "y-protocols/awareness";
import * as Y from "yjs";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";

export interface ConvexYjsProviderOptions {
	client: ConvexReactClient;
	documentId: Id<"documents">;
	clientSessionId?: string;
	user?: { name: string; color: string; isGuest?: boolean };
}

const AWARENESS_DEBOUNCE_MS = 250;
const HEARTBEAT_INTERVAL_MS = 10_000;
const UPDATE_DEBOUNCE_MS = 150;
const MAX_RETRY_INTERVAL_MS = 5_000;
const yjsApi = api.yjsV3;
const yjsPresenceApi = api.yjsPresenceV3;

const FUNCTION_NOT_FOUND_PATTERNS = [
	/function not found/i,
	/could not find (?:public |internal )?function/i,
	/unknown function/i,
	/no function .*registered/i,
];

function toArrayBuffer(data: Uint8Array): ArrayBuffer {
	const buffer = data.buffer as ArrayBuffer;
	if (data.byteOffset === 0 && data.byteLength === buffer.byteLength) {
		return buffer;
	}
	return buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
}

function toError(error: unknown): Error {
	return error instanceof Error ? error : new Error(String(error));
}

function toErrorSearchText(error: unknown): string {
	const parts: string[] = [];
	if (error instanceof Error) {
		parts.push(error.message);
		const data = (error as { data?: unknown }).data;
		if (data !== undefined) {
			try {
				parts.push(JSON.stringify(data));
			} catch {
				parts.push(String(data));
			}
		}
	} else if (typeof error === "string") {
		parts.push(error);
	} else {
		try {
			parts.push(JSON.stringify(error));
		} catch {
			parts.push(String(error));
		}
	}
	return parts.join(" ");
}

function isFunctionNotFoundError(error: unknown): boolean {
	const haystack = toErrorSearchText(error);
	return FUNCTION_NOT_FOUND_PATTERNS.some((pattern) => pattern.test(haystack));
}

export class ConvexYjsProvider implements UnifiedProvider {
	readonly type = "convex";

	private _document: Y.Doc;
	private _awareness: Awareness;
	private _isConnected = false;
	private _isSynced = false;
	private _isDestroyed = false;

	private readonly client: ConvexReactClient;
	private readonly documentId: Id<"documents">;
	private readonly clientSessionId: string;
	private readonly user?: { name: string; color: string; isGuest?: boolean };

	private readonly onConnect?: () => void;
	private readonly onDisconnect?: () => void;
	private readonly onError?: (error: Error) => void;
	private readonly onSyncChange?: (isSynced: boolean) => void;

	private unsubscribeDocument: (() => void) | null = null;
	private unsubscribePresence: (() => void) | null = null;

	private docUpdateHandler:
		| ((update: Uint8Array, origin: unknown) => void)
		| null = null;
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

	private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
	private awarenessDebounceTimer: ReturnType<typeof setTimeout> | null = null;
	private updateDebounceTimer: ReturnType<typeof setTimeout> | null = null;
	private retryTimer: ReturnType<typeof setTimeout> | null = null;

	private updateBuffer: Uint8Array[] = [];
	private isFlushing = false;
	private consecutiveFailures = 0;
	private lastPresenceState = "";
	private lastPresenceSentAt = 0;
	private lastQueuedPresenceState = "";

	private lastAppliedSnapshotVersion = -1;
	private appliedUpdateIds = new Set<string>();
	private initialSyncDone = false;
	private lastFailedRemoteSignature = "";
	private backendContractUnavailable = false;

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
		this.clientSessionId =
			options.clientSessionId ?? `client-${this._document.clientID}`;

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
		if (this.backendContractUnavailable || this._isDestroyed) return;

		this._isConnected = true;
		this.onConnect?.();

		this.startDocumentSync();
		if (this.backendContractUnavailable || this._isDestroyed) {
			return;
		}
		this.startPresenceSync();
	}

	disconnect(): void {
		if (!this._isConnected) return;

		this.flushUpdateBufferSync();
		this.stopDocumentSync();
		this.stopPresenceSync({
			skipLeavePresence: this.backendContractUnavailable,
		});

		this._isConnected = false;
		this.setSynced(false);
		this.onDisconnect?.();
	}

	destroy(): void {
		if (this._isDestroyed) return;
		this._isDestroyed = true;
		this.disconnect();
	}

	private startDocumentSync(): void {
		if (this.backendContractUnavailable || this._isDestroyed) {
			return;
		}
		this.docUpdateHandler = (update: Uint8Array, origin: unknown) => {
			if (origin === "remote") return;
			this.bufferLocalUpdate(update);
		};
		this._document.on("update", this.docUpdateHandler);

		try {
			const watch = this.client.watchQuery(yjsApi.getState, {
				documentId: this.documentId,
			});
			const unsubscribe = watch.onUpdate(() => {
				if (this.backendContractUnavailable || this._isDestroyed) return;
				let result:
					| {
							snapshot?: ArrayBuffer;
							snapshotVersion: number;
							updates: Array<{
								_id: Id<"yjsUpdatesV3">;
								update: ArrayBuffer;
								clientSessionId: string;
								createdAt: number;
							}>;
					  }
					| null
					| undefined;
				try {
					result = watch.localQueryResult();
				} catch (error) {
					if (isFunctionNotFoundError(error)) {
						this.tripBackendContractCircuit(error, "yjsV3.getState");
						return;
					}
					this.onError?.(toError(error));
					return;
				}
				if (result === undefined) return;
				this.handleRemoteDocumentState(result);
			});
			this.unsubscribeDocument = unsubscribe;
		} catch (error) {
			if (isFunctionNotFoundError(error)) {
				this.tripBackendContractCircuit(error, "yjsV3.getState");
				return;
			}
			this.onError?.(toError(error));
		}
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

	private bufferLocalUpdate(update: Uint8Array): void {
		if (
			this.backendContractUnavailable ||
			!this._isConnected ||
			this._isDestroyed
		) {
			return;
		}
		this.updateBuffer.push(update);
		if (this.updateDebounceTimer) {
			clearTimeout(this.updateDebounceTimer);
		}
		this.updateDebounceTimer = setTimeout(() => {
			this.flushUpdateBuffer();
		}, UPDATE_DEBOUNCE_MS);
	}

	private async flushUpdateBuffer(): Promise<void> {
		if (
			this.isFlushing ||
			this.updateBuffer.length === 0 ||
			this.backendContractUnavailable ||
			!this._isConnected ||
			this._isDestroyed
		) {
			return;
		}

		this.isFlushing = true;
		const pending = this.updateBuffer.splice(0);

		try {
			const merged =
				pending.length === 1 ? pending[0] : Y.mergeUpdates(pending);
			await this.client.mutation(yjsApi.pushUpdate, {
				documentId: this.documentId,
				update: toArrayBuffer(merged),
				clientSessionId: this.clientSessionId,
			});
			this.consecutiveFailures = 0;
		} catch (error) {
			if (isFunctionNotFoundError(error)) {
				this.tripBackendContractCircuit(error, "yjsV3.pushUpdate");
				return;
			}
			this.updateBuffer.unshift(...pending);
			this.consecutiveFailures += 1;
			this.onError?.(toError(error));
			this.scheduleRetry();
		} finally {
			this.isFlushing = false;
		}
	}

	private flushUpdateBufferSync(): void {
		if (this.updateBuffer.length === 0) return;
		if (this.backendContractUnavailable || this._isDestroyed) {
			this.updateBuffer = [];
			return;
		}

		const pending = this.updateBuffer.splice(0);
		try {
			const merged =
				pending.length === 1 ? pending[0] : Y.mergeUpdates(pending);
			this.client
				.mutation(yjsApi.pushUpdate, {
					documentId: this.documentId,
					update: toArrayBuffer(merged),
					clientSessionId: this.clientSessionId,
				})
				.catch((error) => {
					if (isFunctionNotFoundError(error)) {
						this.tripBackendContractCircuit(error, "yjsV3.pushUpdate");
					}
				});
		} catch {
			// Ignore disconnect flush failures.
		}
	}

	private scheduleRetry(): void {
		if (
			this.retryTimer ||
			this.backendContractUnavailable ||
			!this._isConnected ||
			this._isDestroyed
		) {
			return;
		}

		const delay = Math.min(
			1000 * 2 ** (this.consecutiveFailures - 1),
			MAX_RETRY_INTERVAL_MS,
		);
		this.retryTimer = setTimeout(() => {
			this.retryTimer = null;
			if (
				this.backendContractUnavailable ||
				!this._isConnected ||
				this._isDestroyed
			) {
				return;
			}
			void this.flushUpdateBuffer();
		}, delay);
	}

	private handleRemoteDocumentState(
		data: {
			snapshot?: ArrayBuffer;
			snapshotVersion: number;
			updates: Array<{
				_id: Id<"yjsUpdatesV3">;
				update: ArrayBuffer;
				clientSessionId: string;
				createdAt: number;
			}>;
		} | null,
	): void {
		if (!data) {
			this.setSynced(false);
			return;
		}

		const remoteSignature = `${data.snapshotVersion}:${
			data.snapshot?.byteLength ?? 0
		}:${data.updates.length}`;
		if (remoteSignature === this.lastFailedRemoteSignature) {
			return;
		}

		let failed = false;
		const apply = (update: ArrayBuffer, context: string) => {
			try {
				Y.applyUpdate(this._document, new Uint8Array(update), "remote");
				return true;
			} catch (error) {
				failed = true;
				const message =
					error instanceof Error ? error.message : "Unknown Yjs apply error";
				this.onError?.(new Error(`Failed to apply ${context}: ${message}`));
				return false;
			}
		};

		if (data.snapshotVersion !== this.lastAppliedSnapshotVersion) {
			this.appliedUpdateIds.clear();
			if (data.snapshot) {
				apply(data.snapshot, "snapshot");
			}
		}

		for (const entry of data.updates) {
			const updateId = String(entry._id);
			if (this.appliedUpdateIds.has(updateId)) continue;
			const applied = apply(entry.update, `update:${updateId}`);
			if (applied) {
				this.appliedUpdateIds.add(updateId);
			}
		}

		if (failed) {
			this.lastFailedRemoteSignature = remoteSignature;
			this.setSynced(false);
			return;
		}

		this.lastFailedRemoteSignature = "";
		this.lastAppliedSnapshotVersion = data.snapshotVersion;

		// Trim applied ID memory when compaction reduces update list.
		if (this.appliedUpdateIds.size > data.updates.length + 32) {
			const activeIds = new Set(data.updates.map((u) => String(u._id)));
			for (const seenId of this.appliedUpdateIds) {
				if (!activeIds.has(seenId)) {
					this.appliedUpdateIds.delete(seenId);
				}
			}
		}

		if (!this.initialSyncDone) {
			this.initialSyncDone = true;
		}
		this.setSynced(true);

		if (this.updateBuffer.length > 0 && !this.isFlushing) {
			void this.flushUpdateBuffer();
		}
	}

	private startPresenceSync(): void {
		if (this.backendContractUnavailable || this._isDestroyed) {
			return;
		}
		if (this.user) {
			this._awareness.setLocalStateField("user", this.user);
		}

		this.awarenessChangeHandler = ({ added, updated, removed }, origin) => {
			if (origin === "remote") return;

			const localClientId = this._document.clientID;
			const changed = [...added, ...updated, ...removed];
			if (changed.includes(localClientId)) {
				this.debouncedPushPresence();
			}
		};
		this._awareness.on("change", this.awarenessChangeHandler);

		try {
			const watch = this.client.watchQuery(yjsPresenceApi.listPresence, {
				documentId: this.documentId,
			});
			const unsubscribe = watch.onUpdate(() => {
				if (this.backendContractUnavailable || this._isDestroyed) return;
				let result:
					| Array<{
							clientId: number;
							clientSessionId: string;
							displayName: string;
							color: string;
							isGuest: boolean;
							awarenessState: string;
					  }>
					| undefined;
				try {
					result = watch.localQueryResult();
				} catch (error) {
					if (isFunctionNotFoundError(error)) {
						this.tripBackendContractCircuit(
							error,
							"yjsPresenceV3.listPresence",
						);
						return;
					}
					this.onError?.(toError(error));
					return;
				}
				if (result === undefined) return;
				this.handleRemotePresence(result);
			});
			this.unsubscribePresence = unsubscribe;
		} catch (error) {
			if (isFunctionNotFoundError(error)) {
				this.tripBackendContractCircuit(error, "yjsPresenceV3.listPresence");
				return;
			}
			this.onError?.(toError(error));
		}

		this.heartbeatTimer = setInterval(() => {
			if (
				this.backendContractUnavailable ||
				!this._isConnected ||
				this._isDestroyed
			) {
				return;
			}
			void this.pushPresenceState();
		}, HEARTBEAT_INTERVAL_MS);

		void this.pushPresenceState();
	}

	private stopPresenceSync(options?: { skipLeavePresence?: boolean }): void {
		if (this.awarenessChangeHandler) {
			this._awareness.off("change", this.awarenessChangeHandler);
			this.awarenessChangeHandler = null;
		}
		if (this.unsubscribePresence) {
			this.unsubscribePresence();
			this.unsubscribePresence = null;
		}
		if (this.heartbeatTimer) {
			clearInterval(this.heartbeatTimer);
			this.heartbeatTimer = null;
		}
		if (this.awarenessDebounceTimer) {
			clearTimeout(this.awarenessDebounceTimer);
			this.awarenessDebounceTimer = null;
		}
		this.lastPresenceState = "";
		this.lastPresenceSentAt = 0;
		this.lastQueuedPresenceState = "";

		if (options?.skipLeavePresence || this.backendContractUnavailable) {
			return;
		}

		this.client
			.mutation(yjsPresenceApi.leavePresence, {
				documentId: this.documentId,
				clientSessionId: this.clientSessionId,
			})
			.catch((error) => {
				if (isFunctionNotFoundError(error)) {
					this.tripBackendContractCircuit(error, "yjsPresenceV3.leavePresence");
				}
			});
	}

	private debouncedPushPresence(): void {
		if (
			this.backendContractUnavailable ||
			!this._isConnected ||
			this._isDestroyed
		) {
			return;
		}
		const payload = this.getPresencePayload();
		if (!payload) return;
		if (
			this.awarenessDebounceTimer &&
			payload.awarenessState === this.lastQueuedPresenceState
		) {
			return;
		}
		if (this.awarenessDebounceTimer) {
			clearTimeout(this.awarenessDebounceTimer);
		}
		this.lastQueuedPresenceState = payload.awarenessState;
		this.awarenessDebounceTimer = setTimeout(() => {
			this.awarenessDebounceTimer = null;
			void this.pushPresenceState();
		}, AWARENESS_DEBOUNCE_MS);
	}

	private getPresencePayload(): {
		awarenessState: string;
	} | null {
		const localState = this._awareness.getLocalState();
		if (!localState) return null;

		const awarenessState = JSON.stringify(localState);
		return {
			awarenessState,
		};
	}

	private async pushPresenceState(): Promise<void> {
		if (
			this.backendContractUnavailable ||
			!this._isConnected ||
			this._isDestroyed
		) {
			return;
		}
		const payload = this.getPresencePayload();
		if (!payload) return;

		const now = Date.now();
		const isUnchanged = payload.awarenessState === this.lastPresenceState;
		const resendDue = now - this.lastPresenceSentAt >= HEARTBEAT_INTERVAL_MS;
		if (isUnchanged && !resendDue) {
			return;
		}

		const displayName = this.user?.name ?? "Guest";
		const color = this.user?.color ?? "#737373";
		const isGuest = this.user?.isGuest ?? true;

		try {
			await this.client.mutation(yjsPresenceApi.upsertPresence, {
				documentId: this.documentId,
				clientId: this._document.clientID,
				clientSessionId: this.clientSessionId,
				displayName,
				color,
				isGuest,
				awarenessState: payload.awarenessState,
			});
			this.lastPresenceState = payload.awarenessState;
			this.lastPresenceSentAt = now;
			this.lastQueuedPresenceState = payload.awarenessState;
		} catch (error) {
			if (isFunctionNotFoundError(error)) {
				this.tripBackendContractCircuit(error, "yjsPresenceV3.upsertPresence");
			}
			// Presence should not break editing.
		}
	}

	private handleRemotePresence(
		entries: Array<{
			clientId: number;
			clientSessionId: string;
			displayName: string;
			color: string;
			isGuest: boolean;
			awarenessState: string;
		}>,
	): void {
		const states = this._awareness.getStates();
		const localClientId = this._document.clientID;

		for (const entry of entries) {
			if (entry.clientSessionId === this.clientSessionId) continue;
			if (entry.clientId === localClientId) continue;

			try {
				const parsed = JSON.parse(entry.awarenessState) as Record<
					string,
					unknown
				>;
				const nextState =
					parsed.user === undefined
						? {
								...parsed,
								user: {
									name: entry.displayName,
									color: entry.color,
									isGuest: entry.isGuest,
								},
							}
						: parsed;

				const currentState = states.get(entry.clientId);
				if (JSON.stringify(currentState) !== JSON.stringify(nextState)) {
					states.set(entry.clientId, nextState);
					this._awareness.emit("change", [
						{ added: [], updated: [entry.clientId], removed: [] },
						"remote",
					]);
				}
			} catch {
				// Ignore malformed presence payloads.
			}
		}

		const remoteClientIds = new Set(
			entries
				.filter((entry) => entry.clientSessionId !== this.clientSessionId)
				.map((entry) => entry.clientId),
		);
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

	private setSynced(nextValue: boolean): void {
		if (this._isSynced !== nextValue) {
			this._isSynced = nextValue;
			this.onSyncChange?.(nextValue);
		}
	}

	private tripBackendContractCircuit(error: unknown, operation: string): void {
		if (this.backendContractUnavailable) {
			return;
		}

		this.backendContractUnavailable = true;
		this.updateBuffer = [];
		this.consecutiveFailures = 0;
		this.isFlushing = false;

		this.stopDocumentSync();
		this.stopPresenceSync({ skipLeavePresence: true });
		this.setSynced(false);

		const sourceError = toError(error);
		this.onError?.(
			new Error(
				`Yjs backend contract unavailable while calling ${operation}: ${sourceError.message}`,
			),
		);
	}
}
