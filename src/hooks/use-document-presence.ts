"use client";

import { useMutation, useQuery } from "convex/react";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";

const CURSOR_COLORS = [
	"#E06C75", // red
	"#61AFEF", // blue
	"#98C379", // green
	"#E5C07B", // yellow
	"#C678DD", // purple
	"#56B6C2", // cyan
	"#D19A66", // orange
	"#BE5046", // coral
];

export function getUserColor(userId: string): string {
	let hash = 0;
	for (let i = 0; i < userId.length; i++) {
		hash = ((hash << 5) - hash + userId.charCodeAt(i)) | 0;
	}
	return CURSOR_COLORS[Math.abs(hash) % CURSOR_COLORS.length];
}

export interface ActiveUser {
	userId: Id<"users">;
	name: string;
	image?: string;
	cursorFrom: number;
	cursorTo: number;
	color: string;
}

export function useDocumentPresence(
	documentId: Id<"documents">,
	currentUserId: Id<"users"> | undefined,
) {
	const upsertPresence = useMutation(api.documentPresence.upsert);
	const heartbeatPresence = useMutation(api.documentPresence.heartbeat);
	const leavePresence = useMutation(api.documentPresence.leave);
	const activePresence = useQuery(api.documentPresence.listActive, {
		documentId,
	});

	// Stable refs for mutation functions to avoid re-creating intervals/effects
	const upsertRef = useRef(upsertPresence);
	upsertRef.current = upsertPresence;
	const heartbeatRef = useRef(heartbeatPresence);
	heartbeatRef.current = heartbeatPresence;
	const leaveRef = useRef(leavePresence);
	leaveRef.current = leavePresence;
	const documentIdRef = useRef(documentId);
	documentIdRef.current = documentId;

	// Debounced cursor position update (250ms)
	const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	const updateCursorPosition = useCallback((from: number, to: number) => {
		if (debounceTimerRef.current) {
			clearTimeout(debounceTimerRef.current);
		}
		debounceTimerRef.current = setTimeout(() => {
			upsertRef
				.current({
					documentId: documentIdRef.current,
					cursorFrom: from,
					cursorTo: to,
				})
				.catch(() => {});
		}, 250);
	}, []);

	// Heartbeat interval (10s)
	useEffect(() => {
		const interval = setInterval(() => {
			heartbeatRef
				.current({
					documentId: documentIdRef.current,
				})
				.catch(() => {});
		}, 10000);

		return () => clearInterval(interval);
	}, []);

	// Leave on unmount and beforeunload
	useEffect(() => {
		const handleBeforeUnload = () => {
			leaveRef
				.current({
					documentId: documentIdRef.current,
				})
				.catch(() => {});
		};

		window.addEventListener("beforeunload", handleBeforeUnload);

		return () => {
			window.removeEventListener("beforeunload", handleBeforeUnload);
			leaveRef
				.current({
					documentId: documentIdRef.current,
				})
				.catch(() => {});
			if (debounceTimerRef.current) {
				clearTimeout(debounceTimerRef.current);
			}
		};
	}, []);

	// Transform presence data: exclude current user, add colors
	const activeUsers = useMemo<ActiveUser[]>(() => {
		if (!activePresence) return [];
		return activePresence
			.filter((p) => p.userId !== currentUserId)
			.map((p) => ({
				userId: p.userId,
				name: p.name,
				image: p.image ?? undefined,
				cursorFrom: p.cursorFrom ?? 0,
				cursorTo: p.cursorTo ?? 0,
				color: getUserColor(p.userId),
			}));
	}, [activePresence, currentUserId]);

	return {
		activeUsers,
		updateCursorPosition,
	};
}
