"use client";

import type React from "react";
import { useState } from "react";

import { Calendar } from "@/components/ui/calendar";
import {
	Command,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
} from "@/components/ui/command";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";

// ── GenericPicker ───────────────────────────────────────────────────────────

interface PickerProps<T> {
	trigger: React.ReactNode;
	items: T[];
	onSelect: (item: T) => void;
	selectedId?: string;
	placeholder?: string;
	renderItem: (item: T, isSelected: boolean) => React.ReactNode;
}

export function GenericPicker<
	T extends { id: string; label?: string; name?: string },
>({
	trigger,
	items,
	onSelect,
	selectedId,
	placeholder = "Search...",
	renderItem,
}: PickerProps<T>) {
	const [open, setOpen] = useState(false);

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>{trigger}</PopoverTrigger>
			<PopoverContent className="p-0 w-[240px]" align="start">
				<Command>
					<CommandInput placeholder={placeholder} />
					<CommandList>
						<CommandEmpty>No results found.</CommandEmpty>
						<CommandGroup>
							{items.map((item) => (
								<CommandItem
									key={item.id}
									value={item.label || item.name || item.id}
									onSelect={() => {
										onSelect(item);
										setOpen(false);
									}}
									className="cursor-pointer"
								>
									{renderItem(item, item.id === selectedId)}
								</CommandItem>
							))}
						</CommandGroup>
					</CommandList>
				</Command>
			</PopoverContent>
		</Popover>
	);
}

// ── DatePicker ──────────────────────────────────────────────────────────────

interface DatePickerProps {
	date?: Date;
	onSelect: (date: Date | undefined) => void;
	trigger: React.ReactNode;
}

export function DatePicker({ date, onSelect, trigger }: DatePickerProps) {
	const [open, setOpen] = useState(false);

	// Clear the selection explicitly. Two triggers: a "Clear" button at the
	// bottom of the popover, and tapping the already-selected day in the
	// calendar (react-day-picker's default toggle, but we force it by
	// comparing against the current `date` prop so it behaves consistently
	// across library versions).
	const handleCalendarSelect = (next: Date | undefined) => {
		if (!next) {
			// react-day-picker fired an undefined (toggle-off) — respect it.
			onSelect(undefined);
			setOpen(false);
			return;
		}
		// If the user clicked the already-selected date, treat it as a clear.
		if (date && next.getTime() === date.getTime()) {
			onSelect(undefined);
			setOpen(false);
			return;
		}
		onSelect(next);
		setOpen(false);
	};

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>{trigger}</PopoverTrigger>
			<PopoverContent className="w-auto p-0" align="start">
				<Calendar
					mode="single"
					selected={date}
					onSelect={handleCalendarSelect}
					initialFocus
				/>
				{date && (
					<div className="border-t border-border p-2">
						<button
							type="button"
							onClick={() => {
								onSelect(undefined);
								setOpen(false);
							}}
							className="w-full rounded-md px-2 py-1.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
						>
							Clear date
						</button>
					</div>
				)}
			</PopoverContent>
		</Popover>
	);
}
