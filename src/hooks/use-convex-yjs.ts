"use client";

import { registerProviderType } from "@platejs/yjs";
import { useConvex } from "convex/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Awareness } from "y-protocols/awareness";
import * as Y from "yjs";
import {
	ConvexYjsProvider,
	type ConvexYjsProviderOptions,
} from "@/lib/convex-yjs-provider";
import type { Id } from "../../convex/_generated/dataModel";

// Register the 'convex' provider type with Plate's YjsPlugin
let providerTypeRegistered = false;
if (!providerTypeRegistered) {
	registerProviderType("convex", ConvexYjsProvider);
	providerTypeRegistered = true;
}

interface UseConvexYjsOptions {
	/** The document ID to sync */
	documentId: Id<"documents">;
	/** Optional stable session identifier for this browser tab */
	clientSessionId?: string;
	/** User info for awareness cursors */
	user?: { name: string; color: string; isGuest?: boolean };
}

interface UseConvexYjsReturn {
	/** The Yjs document instance */
	doc: Y.Doc;
	/** The awareness instance for cursor/presence sharing */
	awareness: Awareness;
	/** The provider instance (pass to YjsPlugin) */
	provider: ConvexYjsProvider;
	/** Whether the provider is connected to Convex */
	isConnected: boolean;
	/** Whether the initial document sync is complete */
	isSynced: boolean;
	/** The last error from the provider, or null */
	error: Error | null;
}

/**
 * React hook that creates and manages a ConvexYjsProvider for real-time
 * Yjs document sync via Convex.
 *
 * Creates a Y.Doc + Awareness, instantiates a ConvexYjsProvider,
 * and manages the connect/disconnect lifecycle.
 *
 * @example
 * ```tsx
 * const { doc, provider, isConnected, isSynced } = useConvexYjs({
 *   documentId: doc._id,
 *   user: { name: "Alice", color: "#ff0000" },
 * });
 * ```
 */
export function useConvexYjs({
	documentId,
	clientSessionId,
	user,
}: UseConvexYjsOptions): UseConvexYjsReturn {
	const client = useConvex();
	const [isConnected, setIsConnected] = useState(false);
	const [isSynced, setIsSynced] = useState(false);
	const [error, setError] = useState<Error | null>(null);

	// Stable reference for user info
	const userRef = useRef(user);
	userRef.current = user;
	const effectiveSessionId = useMemo(() => {
		if (clientSessionId) return clientSessionId;
		if (typeof window === "undefined") {
			return `server-${documentId}`;
		}
		const key = `yjs-session:${documentId}`;
		const existing = window.sessionStorage.getItem(key);
		if (existing) return existing;
		const created =
			window.crypto?.randomUUID?.() ??
			`${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
		window.sessionStorage.setItem(key, created);
		return created;
	}, [clientSessionId, documentId]);

	// Create Y.Doc (using documentId as guid) and Awareness, recreated when documentId changes
	const { doc, awareness } = useMemo(() => {
		const d = new Y.Doc({ guid: documentId });
		const a = new Awareness(d);
		return { doc: d, awareness: a };
	}, [documentId]);

	// Create provider, recreated when documentId/client/doc changes
	const provider = useMemo(() => {
		const options: ConvexYjsProviderOptions = {
			client,
			documentId,
			clientSessionId: effectiveSessionId,
			user: userRef.current,
		};

		return new ConvexYjsProvider({
			options,
			doc,
			awareness,
			onConnect: () => {
				setIsConnected(true);
				setError(null);
			},
			onDisconnect: () => setIsConnected(false),
			onError: (err) => setError(err),
			onSyncChange: (synced) => setIsSynced(synced),
		});
	}, [documentId, client, doc, awareness, effectiveSessionId]);

	// Connect on mount, disconnect on unmount
	useEffect(() => {
		provider.connect();

		const handleBeforeUnload = () => {
			provider.disconnect();
		};
		window.addEventListener("beforeunload", handleBeforeUnload);

		return () => {
			window.removeEventListener("beforeunload", handleBeforeUnload);
			provider.destroy();
		};
	}, [provider]);

	// Clean up Y.Doc when it changes
	useEffect(() => {
		return () => {
			doc.destroy();
		};
	}, [doc]);

	return { doc, awareness, provider, isConnected, isSynced, error };
}
