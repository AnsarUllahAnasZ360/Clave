"use client";

import { Clock } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

type EstimateInputProps = {
	/** Current value in hours (or undefined for no estimate) */
	value: number | undefined;
	/** Called with the new value in hours (0 = clear) */
	onChange: (hours: number) => void;
	/** Compact mode for inline use in list rows */
	compact?: boolean;
	className?: string;
};

/** Format hours for display — always in hours */
export function formatEstimateDisplay(hours: number | undefined): string {
	if (!hours || hours === 0) return "";
	return `${hours}h`;
}

/**
 * Estimate popover: click a trigger to open a small card
 * with a number input + h/d unit toggle.
 * Stores value in hours; 1d = 8h.
 */
export function EstimateInput({
	value,
	onChange,
	compact,
	className,
}: EstimateInputProps) {
	const [open, setOpen] = useState(false);
	const [unit, setUnit] = useState<"h" | "d">(() => {
		if (value && value >= 8 && value % 8 === 0) return "d";
		return "h";
	});

	const displayValue =
		value === undefined || value === 0
			? ""
			: unit === "d"
				? String(value / 8)
				: String(value);

	const [inputValue, setInputValue] = useState(displayValue);
	const inputRef = useRef<HTMLInputElement>(null);

	// Sync when external value changes
	useEffect(() => {
		const newDisplay =
			value === undefined || value === 0
				? ""
				: unit === "d"
					? String(value / 8)
					: String(value);
		setInputValue(newDisplay);
	}, [value, unit]);

	// Auto-focus input when popover opens
	useEffect(() => {
		if (open) {
			setTimeout(() => inputRef.current?.focus(), 50);
		}
	}, [open]);

	const commitValue = useCallback(
		(raw: string) => {
			const trimmed = raw.trim();
			if (!trimmed || trimmed === "0") {
				onChange(0);
				setOpen(false);
				return;
			}
			const num = Number.parseFloat(trimmed);
			if (Number.isNaN(num) || num < 0) return;
			const hours = unit === "d" ? num * 8 : num;
			onChange(hours);
			setOpen(false);
		},
		[onChange, unit],
	);

	const handleUnitChange = useCallback(
		(newUnit: "h" | "d") => {
			if (newUnit === unit) return;
			setUnit(newUnit);
			if (value && value > 0) {
				const newDisplay = newUnit === "d" ? String(value / 8) : String(value);
				setInputValue(newDisplay);
			}
		},
		[unit, value],
	);

	const triggerLabel = value
		? formatEstimateDisplay(value)
		: compact
			? "—"
			: "Set estimate";

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>
				<button
					type="button"
					className={cn(
						"inline-flex items-center gap-1.5 rounded-md text-sm transition-colors hover:bg-accent/50",
						compact ? "h-6 px-1.5 text-xs" : "h-7 px-2",
						value
							? "text-foreground"
							: "text-muted-foreground hover:text-foreground",
						className,
					)}
				>
					<Clock
						className={cn("shrink-0", compact ? "h-3 w-3" : "h-3.5 w-3.5")}
					/>
					<span className="tabular-nums">{triggerLabel}</span>
				</button>
			</PopoverTrigger>
			<PopoverContent
				className="w-[220px] p-3 space-y-3"
				align="start"
				sideOffset={4}
			>
				<div className="text-xs font-medium text-muted-foreground">
					Time estimate
				</div>
				<div className="flex items-center gap-2">
					<div className="flex items-center flex-1 rounded-md border border-border bg-transparent focus-within:ring-1 focus-within:ring-ring h-8">
						<input
							ref={inputRef}
							type="number"
							step="any"
							min="0"
							placeholder="0"
							value={inputValue}
							onChange={(e) => setInputValue(e.target.value)}
							onKeyDown={(e) => {
								if (e.key === "Enter") {
									commitValue(inputValue);
								}
								if (e.key === "Escape") {
									setOpen(false);
								}
							}}
							className="flex-1 min-w-0 w-14 px-2 bg-transparent text-sm outline-none tabular-nums"
						/>
						<div className="flex items-center border-l border-border shrink-0">
							<button
								type="button"
								className={cn(
									"px-2 py-1 text-xs font-medium transition-colors rounded-none",
									unit === "h"
										? "text-foreground bg-accent"
										: "text-muted-foreground hover:text-foreground",
								)}
								onClick={() => handleUnitChange("h")}
							>
								h
							</button>
							<button
								type="button"
								className={cn(
									"px-2 py-1 text-xs font-medium transition-colors rounded-r-md",
									unit === "d"
										? "text-foreground bg-accent"
										: "text-muted-foreground hover:text-foreground",
								)}
								onClick={() => handleUnitChange("d")}
							>
								d
							</button>
						</div>
					</div>
				</div>
				{/* Live conversion display */}
				{inputValue && Number.parseFloat(inputValue) > 0 && (
					<div className="text-[11px] text-muted-foreground/70">
						{unit === "h"
							? `= ${(Number.parseFloat(inputValue) / 8).toFixed(1)} days`
							: `= ${Number.parseFloat(inputValue) * 8} hours`}
					</div>
				)}
				{value ? (
					<button
						type="button"
						className="text-xs text-muted-foreground hover:text-destructive transition-colors"
						onClick={() => {
							onChange(0);
							setInputValue("");
							setOpen(false);
						}}
					>
						Clear estimate
					</button>
				) : null}
			</PopoverContent>
		</Popover>
	);
}
