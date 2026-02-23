"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// ── Types ────────────────────────────────────────────────────────────────

export type RetryState = "idle" | "waiting" | "retrying" | "exhausted";

export type UseMessageRetryReturn = {
	/** Current retry state */
	state: RetryState;
	/** Number of auto-retries attempted so far (0-3) */
	retryCount: number;
	/** Seconds remaining until next auto-retry (null if not waiting) */
	countdown: number | null;
	/** Whether auto-retries are exhausted (>= MAX_RETRIES) */
	isExhausted: boolean;
	/** Trigger retry — auto if retries remain, always works for manual */
	triggerRetry: () => void;
	/** Record a failure — starts auto-retry countdown */
	recordFailure: () => void;
	/** Reset all retry state (call on successful send or new message) */
	reset: () => void;
};

// ── Constants ────────────────────────────────────────────────────────────

const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1000; // 1s, 2s, 4s

// ── Hook ─────────────────────────────────────────────────────────────────

export function useMessageRetry(
	sendFn: () => Promise<void>,
): UseMessageRetryReturn {
	const [retryCount, setRetryCount] = useState(0);
	const [state, setState] = useState<RetryState>("idle");
	const [countdown, setCountdown] = useState<number | null>(null);
	const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
	const sendFnRef = useRef(sendFn);
	sendFnRef.current = sendFn;

	// Cleanup timers on unmount
	useEffect(() => {
		return () => {
			if (timerRef.current) clearTimeout(timerRef.current);
			if (countdownRef.current) clearInterval(countdownRef.current);
		};
	}, []);

	const clearTimers = useCallback(() => {
		if (timerRef.current) {
			clearTimeout(timerRef.current);
			timerRef.current = null;
		}
		if (countdownRef.current) {
			clearInterval(countdownRef.current);
			countdownRef.current = null;
		}
	}, []);

	const reset = useCallback(() => {
		clearTimers();
		setRetryCount(0);
		setState("idle");
		setCountdown(null);
	}, [clearTimers]);

	const executeRetry = useCallback(async () => {
		setState("retrying");
		setCountdown(null);
		try {
			await sendFnRef.current();
			// Success — reset
			reset();
		} catch {
			// Will be handled by the next recordFailure call from use-ai-chat
		}
	}, [reset]);

	const startAutoRetry = useCallback(
		(attemptIndex: number) => {
			if (attemptIndex >= MAX_RETRIES) {
				setState("exhausted");
				setCountdown(null);
				return;
			}

			const delayMs = BASE_DELAY_MS * 2 ** attemptIndex; // 1s, 2s, 4s
			const delaySec = Math.ceil(delayMs / 1000);

			setState("waiting");
			setCountdown(delaySec);

			// Countdown interval (ticks every second)
			countdownRef.current = setInterval(() => {
				setCountdown((prev) => {
					if (prev === null || prev <= 1) return null;
					return prev - 1;
				});
			}, 1000);

			// Auto-retry after delay
			timerRef.current = setTimeout(() => {
				if (countdownRef.current) {
					clearInterval(countdownRef.current);
					countdownRef.current = null;
				}
				executeRetry();
			}, delayMs);
		},
		[executeRetry],
	);

	const recordFailure = useCallback(() => {
		clearTimers();
		setRetryCount((prev) => {
			const next = prev + 1;
			// Pass prev (0-indexed) so delays are 2^0=1s, 2^1=2s, 2^2=4s
			startAutoRetry(prev);
			return next;
		});
	}, [clearTimers, startAutoRetry]);

	const triggerRetry = useCallback(() => {
		clearTimers();
		// Manual retry resets the counter
		setRetryCount(0);
		executeRetry();
	}, [clearTimers, executeRetry]);

	return {
		state,
		retryCount,
		countdown,
		isExhausted: state === "exhausted",
		triggerRetry,
		recordFailure,
		reset,
	};
}
