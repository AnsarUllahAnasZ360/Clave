"use client";

import { Timer } from "lucide-react";
import { memo, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

// ── RateLimitBanner ──────────────────────────────────────────────────────

export type RateLimitBannerProps = {
	/** Seconds to wait before retrying */
	retryAfter: number;
	/** Called when countdown reaches 0 */
	onCountdownComplete?: () => void;
	/** Dismiss the banner */
	onDismiss?: () => void;
	className?: string;
};

export const RateLimitBanner = memo(function RateLimitBanner({
	retryAfter,
	onCountdownComplete,
	onDismiss,
	className,
}: RateLimitBannerProps) {
	const [secondsLeft, setSecondsLeft] = useState(retryAfter);
	const onCompleteRef = useRef(onCountdownComplete);
	onCompleteRef.current = onCountdownComplete;

	// Single effect: reset + start countdown when retryAfter changes
	useEffect(() => {
		if (retryAfter <= 0) {
			onCompleteRef.current?.();
			return;
		}

		setSecondsLeft(retryAfter);

		const timer = setInterval(() => {
			setSecondsLeft((prev) => {
				if (prev <= 1) {
					clearInterval(timer);
					setTimeout(() => onCompleteRef.current?.(), 0);
					return 0;
				}
				return prev - 1;
			});
		}, 1000);

		return () => clearInterval(timer);
	}, [retryAfter]);

	if (secondsLeft <= 0) return null;

	return (
		<output
			aria-live="polite"
			className={cn(
				"flex items-center gap-2 border-b border-amber-300/50 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800 dark:border-amber-500/30 dark:bg-amber-950/30 dark:text-amber-200",
				className,
			)}
		>
			<Timer className="size-3.5 shrink-0" />
			<span>Rate limited &mdash; retrying in {secondsLeft}s...</span>
			{onDismiss && (
				<button
					type="button"
					onClick={onDismiss}
					className="ml-auto text-amber-600 underline-offset-2 hover:underline dark:text-amber-400"
				>
					Dismiss
				</button>
			)}
		</output>
	);
});
