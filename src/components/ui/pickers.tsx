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

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>{trigger}</PopoverTrigger>
			<PopoverContent className="w-auto p-0" align="start">
				<Calendar
					mode="single"
					selected={date}
					onSelect={(d) => {
						onSelect(d);
						setOpen(false);
					}}
					initialFocus
				/>
			</PopoverContent>
		</Popover>
	);
}
