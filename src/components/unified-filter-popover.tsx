"use client";

import { ListFilter } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

// ── Types ──────────────────────────────────────────────────────────────────

export type UnifiedFilterCategory = {
	id: string;
	label: string;
	count: number;
};

export type UnifiedFilterPopoverProps = {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	categories: UnifiedFilterCategory[];
	activeCategory: string;
	onCategoryChange: (categoryId: string) => void;
	renderOptions: (categoryId: string) => React.ReactNode;
	activeFilterCount: number;
	onClearAll: () => void;
	triggerVariant?: "ghost" | "outline";
	width?: number;
	/** Override the default footer. Return null to hide footer entirely. */
	renderFooter?: () => React.ReactNode;
};

// ── Reusable option item with checkbox ─────────────────────────────────────

export function FilterOptionItem({
	checked,
	onToggle,
	icon,
	label,
	color,
}: {
	checked: boolean;
	onToggle: () => void;
	icon?: React.ReactNode;
	label: string;
	color?: string;
}) {
	return (
		<button
			type="button"
			onClick={onToggle}
			className="flex w-full items-center gap-2 rounded-md border border-border/40 px-2.5 py-2 text-sm hover:bg-accent cursor-pointer text-left"
		>
			<Checkbox checked={checked} onCheckedChange={onToggle} />
			{color && (
				<span
					className="h-2.5 w-2.5 rounded-full shrink-0"
					style={{ backgroundColor: color }}
				/>
			)}
			{icon}
			<span className="flex-1">{label}</span>
		</button>
	);
}

// ── Highlight item (for single-select, e.g. "All projects") ───────────────

export function FilterHighlightItem({
	isActive,
	onClick,
	label,
}: {
	isActive: boolean;
	onClick: () => void;
	label: string;
}) {
	return (
		<button
			type="button"
			onClick={onClick}
			className={cn(
				"flex w-full items-center gap-2 rounded-md border border-border/40 px-2.5 py-2 text-sm hover:bg-accent text-left",
				isActive && "bg-accent font-medium",
			)}
		>
			{label}
		</button>
	);
}

// ── Empty state for categories with no options ─────────────────────────────

export function FilterEmptyState({ message }: { message: string }) {
	return (
		<p className="px-2 py-3 text-xs text-muted-foreground text-center">
			{message}
		</p>
	);
}

// ── Main component ─────────────────────────────────────────────────────────

export function UnifiedFilterPopover({
	open,
	onOpenChange,
	categories,
	activeCategory,
	onCategoryChange,
	renderOptions,
	activeFilterCount,
	onClearAll,
	triggerVariant = "ghost",
	width = 420,
	renderFooter,
}: UnifiedFilterPopoverProps) {
	return (
		<Popover open={open} onOpenChange={onOpenChange}>
			<PopoverTrigger asChild>
				<Button
					variant={triggerVariant}
					size="sm"
					className={cn(
						"h-7 gap-1.5 text-xs text-muted-foreground",
						open && "bg-muted text-foreground",
					)}
				>
					<ListFilter className="h-3.5 w-3.5" />
					Filter
					{activeFilterCount > 0 && (
						<span className="ml-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary text-[10px] font-medium text-primary-foreground px-1">
							{activeFilterCount}
						</span>
					)}
				</Button>
			</PopoverTrigger>
			<PopoverContent
				align="start"
				className="p-0"
				style={{ width: `${width}px` }}
			>
				<div className="grid grid-cols-[160px_1fr]">
					{/* Categories sidebar */}
					<div className="border-r border-border/40 p-3 space-y-1">
						{categories.map((cat) => (
							<button
								key={cat.id}
								type="button"
								onClick={() => onCategoryChange(cat.id)}
								className={cn(
									"flex w-full items-center justify-between rounded-md px-3 py-2 text-xs font-medium transition-colors",
									activeCategory === cat.id
										? "bg-muted text-foreground"
										: "text-muted-foreground hover:text-foreground hover:bg-muted/50",
								)}
							>
								{cat.label}
								{cat.count > 0 && (
									<span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-primary/10 text-[10px] font-medium text-primary px-1">
										{cat.count}
									</span>
								)}
							</button>
						))}
					</div>

					{/* Options area */}
					<div className="p-3 max-h-[280px] overflow-y-auto">
						<div className="space-y-1.5">{renderOptions(activeCategory)}</div>
					</div>
				</div>

				{/* Footer */}
				{renderFooter
					? renderFooter()
					: activeFilterCount > 0 && (
							<div className="border-t border-border/40 px-3 py-2.5 flex items-center justify-between">
								<span className="text-[11px] text-muted-foreground">
									{activeFilterCount} active{" "}
									{activeFilterCount === 1 ? "filter" : "filters"}
								</span>
								<button
									type="button"
									onClick={onClearAll}
									className="text-xs font-medium text-primary hover:underline transition-colors"
								>
									Clear all
								</button>
							</div>
						)}
			</PopoverContent>
		</Popover>
	);
}
