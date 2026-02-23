"use client";

import { useMutation, useQuery } from "convex/react";
import { useEffect, useMemo, useRef } from "react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";

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
	const activePresence = useQuery(api.whiteboardPresence.listActive, {
		whiteboardId,
	});

	// Stable refs to avoid re-creating intervals/effects
	const upsertRef = useRef(upsertPresence);
	upsertRef.current = upsertPresence;
	const heartbeatRef = useRef(heartbeatPresence);
	heartbeatRef.current = heartbeatPresence;
	const leaveRef = useRef(leavePresence);
	leaveRef.current = leavePresence;
	const whiteboardIdRef = useRef(whiteboardId);
	whiteboardIdRef.current = whiteboardId;

	// Upsert on mount to register presence immediately
	useEffect(() => {
		upsertRef
			.current({
				whiteboardId: whiteboardIdRef.current,
			})
			.catch(() => {});
	}, []);

	// Heartbeat interval (10s)
	useEffect(() => {
		const interval = setInterval(
			() => {
				heartbeatRef
					.current({
						whiteboardId: whiteboardIdRef.current,
					})
					.catch(() => {});
			},
			10000 + Math.random() * 4000,
		);

		return () => clearInterval(interval);
	}, []);

	// Leave on unmount and beforeunload
	useEffect(() => {
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
	}, []);

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
