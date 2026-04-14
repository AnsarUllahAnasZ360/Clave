"use client";

import { useQuery } from "convex/react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { api } from "../../convex/_generated/api";
import type { Doc } from "../../convex/_generated/dataModel";

export type WhiteboardSceneSource = Pick<
	Doc<"whiteboards">,
	"_id" | "sceneData" | "sceneDataStorageId" | "updatedAt"
>;

/**
 * Full scene JSON for the editor: inline `sceneData`, or fetched blob when
 * `sceneDataStorageId` is set (large boards).
 */
export function useResolvedWhiteboardSceneJson(
	whiteboard: WhiteboardSceneSource | null | undefined,
): {
	sceneJson: string | undefined;
	isSceneLoading: boolean;
} {
	const storageId = whiteboard?.sceneDataStorageId;
	const blobUrl = useQuery(
		api.files.getUrl,
		storageId ? { storageId } : "skip",
	);
	const [fetched, setFetched] = useState<string | null>(null);

	useEffect(() => {
		if (!whiteboard) {
			setFetched(null);
			return;
		}
		if (!storageId) {
			setFetched(null);
			return;
		}
		if (!blobUrl) {
			setFetched(null);
			return;
		}

		let cancelled = false;
		setFetched(null);

		fetch(blobUrl)
			.then((r) => {
				if (!r.ok) throw new Error(String(r.status));
				return r.text();
			})
			.then((text) => {
				if (!cancelled) setFetched(text);
			})
			.catch(() => {
				if (!cancelled) {
					toast.error(
						"Could not load the full board from storage. Showing saved shapes only.",
					);
					setFetched(whiteboard.sceneData ?? "[]");
				}
			});

		return () => {
			cancelled = true;
		};
	}, [whiteboard, storageId, blobUrl, whiteboard?.updatedAt]);

	if (!whiteboard) {
		return { sceneJson: undefined, isSceneLoading: true };
	}

	if (!storageId) {
		return {
			sceneJson: whiteboard.sceneData,
			isSceneLoading: false,
		};
	}

	if (!blobUrl) {
		return { sceneJson: undefined, isSceneLoading: true };
	}

	if (fetched === null) {
		return { sceneJson: undefined, isSceneLoading: true };
	}

	return { sceneJson: fetched, isSceneLoading: false };
}
