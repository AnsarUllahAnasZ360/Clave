"use client";

import type { FileUIPart } from "ai";
import { useCallback, useEffect, useRef, useState } from "react";

// ── Types ────────────────────────────────────────────────────────────────

type QueuedFile = Pick<FileUIPart, "filename" | "mediaType" | "url">;

export type QueuedMessage = {
	id: string;
	prompt: string;
	context?: unknown;
	systemPromptSuffix?: string;
	mentions?: unknown[];
	files?: QueuedFile[];
	queuedAt: number;
};

export type UseMessageQueueReturn = {
	/** Number of messages in the queue */
	queueLength: number;
	/** Whether the queue is currently draining */
	isDraining: boolean;
	/** Enqueue a message for later sending */
	enqueue: (message: Omit<QueuedMessage, "id" | "queuedAt">) => void;
	/** Clear the queue */
	clear: () => void;
};

// ── Constants ────────────────────────────────────────────────────────────

const DRAIN_DELAY_MS = 200; // 200ms between queued message sends

// ── Hook ─────────────────────────────────────────────────────────────────

export function useMessageQueue(
	sendFn: (
		prompt: string,
		// biome-ignore lint/suspicious/noExplicitAny: context type varies by consumer
		context?: any,
		systemPromptSuffix?: string,
		// biome-ignore lint/suspicious/noExplicitAny: mentions type varies by consumer
		mentions?: any[],
		files?: QueuedFile[],
	) => Promise<void>,
	isOnline: boolean,
): UseMessageQueueReturn {
	const [queue, setQueue] = useState<QueuedMessage[]>([]);
	const [isDraining, setIsDraining] = useState(false);
	const sendFnRef = useRef(sendFn);
	sendFnRef.current = sendFn;
	const isDrainingRef = useRef(false);
	const queueRef = useRef<QueuedMessage[]>([]);

	// Keep queueRef in sync
	useEffect(() => {
		queueRef.current = queue;
	}, [queue]);

	const enqueue = useCallback(
		(message: Omit<QueuedMessage, "id" | "queuedAt">) => {
			const queuedMessage: QueuedMessage = {
				...message,
				id: `queued-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
				queuedAt: Date.now(),
			};
			setQueue((prev) => [...prev, queuedMessage]);
		},
		[],
	);

	const clear = useCallback(() => {
		setQueue([]);
	}, []);

	// Drain queue when coming back online
	useEffect(() => {
		if (!isOnline || queueRef.current.length === 0 || isDrainingRef.current) {
			return;
		}

		isDrainingRef.current = true;
		setIsDraining(true);

		const drain = async () => {
			// Take a snapshot of messages to drain
			const messagesToDrain = [...queueRef.current];
			setQueue([]);

			for (const msg of messagesToDrain) {
				try {
					await sendFnRef.current(
						msg.prompt,
						msg.context,
						msg.systemPromptSuffix,
						msg.mentions,
						msg.files,
					);
				} catch {
					// If a queued message fails, it'll be handled by the normal error flow
				}

				// Small delay between sends to avoid hammering the server
				if (messagesToDrain.indexOf(msg) < messagesToDrain.length - 1) {
					await new Promise((resolve) => setTimeout(resolve, DRAIN_DELAY_MS));
				}
			}

			isDrainingRef.current = false;
			setIsDraining(false);
		};

		drain();
	}, [isOnline]);

	return {
		queueLength: queue.length,
		isDraining,
		enqueue,
		clear,
	};
}
