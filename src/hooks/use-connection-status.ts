"use client";

import { useConvexConnectionState } from "convex/react";
import { useMemo, useSyncExternalStore } from "react";

// ── Browser online/offline subscription ──────────────────────────────────

function subscribeBrowserOnline(callback: () => void): () => void {
	window.addEventListener("online", callback);
	window.addEventListener("offline", callback);
	return () => {
		window.removeEventListener("online", callback);
		window.removeEventListener("offline", callback);
	};
}

function getBrowserOnline(): boolean {
	return navigator.onLine;
}

function getBrowserOnlineServer(): boolean {
	// SSR always assumes online
	return true;
}

// ── Connection status types ──────────────────────────────────────────────

export type ConnectionStatus = "connected" | "reconnecting" | "offline";

export type UseConnectionStatusReturn = {
	/** Whether the browser has network connectivity */
	isOnline: boolean;
	/** Whether the Convex WebSocket is connected */
	isWebSocketConnected: boolean;
	/** Derived connection status for UI display */
	status: ConnectionStatus;
	/** Whether we're reconnecting (was connected, now disconnected but online) */
	isReconnecting: boolean;
};

// ── Hook ─────────────────────────────────────────────────────────────────

export function useConnectionStatus(): UseConnectionStatusReturn {
	const isOnline = useSyncExternalStore(
		subscribeBrowserOnline,
		getBrowserOnline,
		getBrowserOnlineServer,
	);

	const convexState = useConvexConnectionState();
	const isWebSocketConnected = convexState.isWebSocketConnected;
	const hasEverConnected = convexState.hasEverConnected;

	const status: ConnectionStatus = useMemo(() => {
		if (!isOnline) return "offline";
		if (!isWebSocketConnected && hasEverConnected) return "reconnecting";
		return "connected";
	}, [isOnline, isWebSocketConnected, hasEverConnected]);

	const isReconnecting = status === "reconnecting";

	return { isOnline, isWebSocketConnected, status, isReconnecting };
}
