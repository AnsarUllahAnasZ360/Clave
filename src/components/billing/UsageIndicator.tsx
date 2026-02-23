"use client";

import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

interface UsageIndicatorProps {
	current: number;
	max: number;
	label: string;
	className?: string;
}

export function UsageIndicator({
	current,
	max,
	label,
	className,
}: UsageIndicatorProps) {
	const percentage = max > 0 ? Math.min((current / max) * 100, 100) : 0;
	const isAtLimit = current >= max;

	return (
		<div className={cn("space-y-1.5", className)}>
			<div className="flex items-center justify-between text-sm">
				<span className="text-muted-foreground">{label}</span>
				<span
					className={cn(
						"font-medium tabular-nums",
						isAtLimit ? "text-destructive" : "text-foreground",
					)}
				>
					{current} / {max}
				</span>
			</div>
			<Progress
				value={percentage}
				className={cn(
					"h-1.5",
					isAtLimit && "[&>[data-slot=progress-indicator]]:bg-destructive",
				)}
			/>
		</div>
	);
}
