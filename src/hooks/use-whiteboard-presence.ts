"use client";

import { useMutation, useQuery } from "convex/react";
import { useEffect, useMemo, useRef } from "react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";

const PRESENCE_TOUCH_FRESH_MS = 8000;

export interface WhiteboardActiveUser {
	userId: Id<"users">;
	name: string;
	image?: string;
	lastActiveAt: number;
}

export function useWhiteboardPresence(
	whiteboardId: Id<"whiteboards">,
	currentUserId: Id<"users"> | undefined,
) {
	const upsertPresence = useMutation(api.whiteboardPresence.upsert);
	const heartbeatPresence = useMutation(api.whiteboardPresence.heartbeat);
	const leavePresence = useMutation(api.whiteboardPresence.leave);
	// Skip presence query when no authenticated user (e.g. public share mode)
	const activePresence = useQuery(
		api.whiteboardPresence.listActive,
		currentUserId ? { whiteboardId } : "skip",
	);

	// Stable refs to avoid re-creating intervals/effects
	const upsertRef = useRef(upsertPresence);
	upsertRef.current = upsertPresence;
	const heartbeatRef = useRef(heartbeatPresence);
	heartbeatRef.current = heartbeatPresence;
	const leaveRef = useRef(leavePresence);
	leaveRef.current = leavePresence;
	const whiteboardIdRef = useRef(whiteboardId);
	whiteboardIdRef.current = whiteboardId;
	const lastPresenceWriteAtRef = useRef(0);

	// Upsert on mount to register presence immediately — skip when no authenticated user
	useEffect(() => {
		if (!currentUserId) return;
		upsertRef
			.current({
				whiteboardId: whiteboardIdRef.current,
			})
			.then(() => {
				lastPresenceWriteAtRef.current = Date.now();
			})
			.catch(() => {});
	}, [currentUserId]);

	// Heartbeat interval (10s) — skip when no authenticated user
	useEffect(() => {
		if (!currentUserId) return;
		const interval = setInterval(
			() => {
				if (
					Date.now() - lastPresenceWriteAtRef.current <
					PRESENCE_TOUCH_FRESH_MS
				) {
					return;
				}
				heartbeatRef
					.current({
						whiteboardId: whiteboardIdRef.current,
					})
					.then(() => {
						lastPresenceWriteAtRef.current = Date.now();
					})
					.catch(() => {});
			},
			10000 + Math.random() * 4000,
		);

		return () => clearInterval(interval);
	}, [currentUserId]);

	// Leave on unmount and beforeunload — skip when no authenticated user
	useEffect(() => {
		if (!currentUserId) return;
		const handleBeforeUnload = () => {
			leaveRef
				.current({
					whiteboardId: whiteboardIdRef.current,
				})
				.catch(() => {});
		};

		window.addEventListener("beforeunload", handleBeforeUnload);

		return () => {
			window.removeEventListener("beforeunload", handleBeforeUnload);
			leaveRef
				.current({
					whiteboardId: whiteboardIdRef.current,
				})
				.catch(() => {});
		};
	}, [currentUserId]);

	// All active users including current user
	const activeUsers = useMemo<WhiteboardActiveUser[]>(() => {
		if (!activePresence) return [];
		return activePresence.map((p) => ({
			userId: p.userId,
			name: p.name,
			image: p.image ?? undefined,
			lastActiveAt: p.lastActiveAt,
		}));
	}, [activePresence]);

	// Other users (excluding current user) for avatar display
	const otherUsers = useMemo<WhiteboardActiveUser[]>(() => {
		if (!activePresence || !currentUserId) return [];
		return activePresence
			.filter((p) => p.userId !== currentUserId)
			.map((p) => ({
				userId: p.userId,
				name: p.name,
				image: p.image ?? undefined,
				lastActiveAt: p.lastActiveAt,
			}));
	}, [activePresence, currentUserId]);

	return {
		activeUsers,
		otherUsers,
	};
}
