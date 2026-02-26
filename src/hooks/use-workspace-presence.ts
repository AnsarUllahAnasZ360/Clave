"use client";

import { useMutation, useQuery } from "convex/react";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";

export interface OnlineUser {
	userId: Id<"users">;
	name: string;
	image?: string;
	lastActiveAt: number;
}

const HEARTBEAT_INTERVAL = 20_000;
const PRESENCE_TOUCH_FRESH_MS = 8000;
const MAX_RETRIES = 3;
const RETRY_DELAYS = [1000, 2000, 4000];

export function useWorkspacePresence(
	workspaceId: Id<"workspaces"> | undefined,
	currentUserId: Id<"users"> | undefined,
) {
	const heartbeatPresence = useMutation(api.workspacePresence.heartbeat);
	const leavePresence = useMutation(api.workspacePresence.leave);
	const activePresence = useQuery(
		api.workspacePresence.listActive,
		workspaceId ? { workspaceId } : "skip",
	);

	const heartbeatRef = useRef(heartbeatPresence);
	heartbeatRef.current = heartbeatPresence;
	const leaveRef = useRef(leavePresence);
	leaveRef.current = leavePresence;
	const workspaceIdRef = useRef(workspaceId);
	workspaceIdRef.current = workspaceId;
	const lastPresenceWriteAtRef = useRef(0);

	// Retry a heartbeat with exponential backoff
	const sendHeartbeatWithRetry = useCallback(
		async (wsId: Id<"workspaces">, signal?: AbortSignal) => {
			for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
				if (signal?.aborted) return;
				try {
					await heartbeatRef.current({ workspaceId: wsId });
					lastPresenceWriteAtRef.current = Date.now();
					return;
				} catch (err) {
					if (process.env.NODE_ENV === "development") {
						console.warn(
							`[workspace-presence] Heartbeat failed (attempt ${attempt + 1}/${MAX_RETRIES + 1})`,
							err,
						);
					}
					if (attempt < MAX_RETRIES) {
						const delay = RETRY_DELAYS[attempt];
						await new Promise<void>((resolve) => {
							const timer = setTimeout(resolve, delay);
							signal?.addEventListener(
								"abort",
								() => {
									clearTimeout(timer);
									resolve();
								},
								{ once: true },
							);
						});
					}
				}
			}
		},
		[],
	);

	// Heartbeat interval (~20-24s with jitter) -- requires both workspaceId AND currentUserId
	useEffect(() => {
		if (!workspaceId || !currentUserId) return;

		const controller = new AbortController();

		// Send initial heartbeat with retry
		sendHeartbeatWithRetry(workspaceId, controller.signal);

		const interval = setInterval(
			() => {
				const wsId = workspaceIdRef.current;
				if (wsId) {
					if (
						Date.now() - lastPresenceWriteAtRef.current <
						PRESENCE_TOUCH_FRESH_MS
					) {
						return;
					}
					heartbeatRef
						.current({ workspaceId: wsId })
						.then(() => {
							lastPresenceWriteAtRef.current = Date.now();
						})
						.catch((err) => {
							if (process.env.NODE_ENV === "development") {
								console.warn("[workspace-presence] Heartbeat failed", err);
							}
						});
				}
			},
			HEARTBEAT_INTERVAL + Math.random() * 4000,
		);

		return () => {
			controller.abort();
			clearInterval(interval);
		};
	}, [workspaceId, currentUserId, sendHeartbeatWithRetry]);

	// Leave on unmount and beforeunload -- requires both IDs
	useEffect(() => {
		if (!workspaceId || !currentUserId) return;

		const handleBeforeUnload = () => {
			const wsId = workspaceIdRef.current;
			if (wsId) {
				leaveRef.current({ workspaceId: wsId }).catch(() => {});
			}
		};

		window.addEventListener("beforeunload", handleBeforeUnload);

		return () => {
			window.removeEventListener("beforeunload", handleBeforeUnload);
			const wsId = workspaceIdRef.current;
			if (wsId) {
				leaveRef.current({ workspaceId: wsId }).catch(() => {});
			}
		};
	}, [workspaceId, currentUserId]);

	// Transform: exclude current user
	const onlineUsers = useMemo<OnlineUser[]>(() => {
		if (!activePresence) return [];
		return activePresence
			.filter((p) => p.userId !== currentUserId)
			.map((p) => ({
				userId: p.userId,
				name: p.name,
				image: p.image ?? undefined,
				lastActiveAt: p.lastActiveAt,
			}));
	}, [activePresence, currentUserId]);

	const isAnyoneOnline = onlineUsers.length > 0;

	return { onlineUsers, isAnyoneOnline };
}
