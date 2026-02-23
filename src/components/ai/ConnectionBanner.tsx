"use client";

import { Wifi, WifiOff } from "lucide-react";
import { memo } from "react";
import type { ConnectionStatus } from "@/hooks/use-connection-status";
import { cn } from "@/lib/utils";

// ── ConnectionBanner ─────────────────────────────────────────────────────

export type ConnectionBannerProps = {
	status: ConnectionStatus;
	queueLength?: number;
	className?: string;
};

export const ConnectionBanner = memo(function ConnectionBanner({
	status,
	queueLength = 0,
	className,
}: ConnectionBannerProps) {
	if (status === "connected") return null;

	const isOffline = status === "offline";

	return (
		<output
			aria-live="polite"
			className={cn(
				"flex items-center gap-2 px-3 py-2 text-xs font-medium",
				isOffline
					? "border-b border-red-300/50 bg-red-50 text-red-800 dark:border-red-500/30 dark:bg-red-950/30 dark:text-red-200"
					: "border-b border-amber-300/50 bg-amber-50 text-amber-800 dark:border-amber-500/30 dark:bg-amber-950/30 dark:text-amber-200",
				className,
			)}
		>
			{isOffline ? (
				<>
					<WifiOff className="size-3.5 shrink-0" />
					<span>
						You&apos;re offline
						{queueLength > 0
							? ` \u2014 ${queueLength} message${queueLength > 1 ? "s" : ""} queued`
							: " \u2014 messages will send when connection is restored"}
					</span>
				</>
			) : (
				<>
					<Wifi className="size-3.5 shrink-0 animate-pulse" />
					<span>Reconnecting to server...</span>
				</>
			)}
		</output>
	);
});
