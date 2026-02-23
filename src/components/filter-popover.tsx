"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
	FilterOptionItem,
	UnifiedFilterPopover,
} from "@/components/unified-filter-popover";

export type FilterChip = { key: string; value: string };

interface FilterCounts {
	status?: Record<string, number>;
	priority?: Record<string, number>;
	tags?: Record<string, number>;
	members?: Record<string, number>;
}

type CategoryId = "status" | "priority" | "tags" | "members";

interface FilterPopoverProps {
	initialChips?: FilterChip[];
	onApply: (chips: FilterChip[]) => void;
	onClear: () => void;
	counts?: FilterCounts;
}

const statusOptions = [
	{ id: "backlog", label: "Backlog", color: "var(--chart-4)" },
	{ id: "planned", label: "Planned", color: "var(--chart-5)" },
	{ id: "active", label: "Active", color: "var(--chart-3)" },
	{ id: "completed", label: "Completed", color: "var(--chart-1)" },
	{ id: "cancelled", label: "Cancelled", color: "var(--muted-foreground)" },
	{ id: "todo", label: "To do", color: "var(--chart-2)" },
	{ id: "in-progress", label: "In progress", color: "var(--chart-3)" },
	{ id: "done", label: "Done", color: "var(--chart-1)" },
];

const priorityOptions = [
	{ id: "urgent", label: "Urgent" },
	{ id: "high", label: "High" },
	{ id: "medium", label: "Medium" },
	{ id: "low", label: "Low" },
];

const memberOptions = [
	{ id: "no-member", label: "No member" },
	{ id: "current", label: "Current member" },
];

const tagOptions = [
	{ id: "frontend", label: "frontend" },
	{ id: "backend", label: "backend" },
	{ id: "bug", label: "bug" },
	{ id: "feature", label: "feature" },
	{ id: "urgent", label: "urgent" },
];

type TempFilters = {
	status: Set<string>;
	priority: Set<string>;
	tags: Set<string>;
	members: Set<string>;
};

function emptyTemp(): TempFilters {
	return {
		status: new Set<string>(),
		priority: new Set<string>(),
		tags: new Set<string>(),
		members: new Set<string>(),
	};
}

export function FilterPopover({
	initialChips,
	onApply,
	onClear,
}: FilterPopoverProps) {
	const [open, setOpen] = useState(false);
	const [activeCategory, setActiveCategory] = useState<CategoryId>("status");
	const [temp, setTemp] = useState<TempFilters>(emptyTemp);

	// Restore selections from chips when opening
	useEffect(() => {
		if (!open) return;
		const next = emptyTemp();
		for (const c of initialChips || []) {
			const k = c.key.toLowerCase();
			if (k === "status") next.status.add(c.value.toLowerCase());
			if (k === "priority") next.priority.add(c.value.toLowerCase());
			if (k === "member" || k === "pic" || k === "members")
				next.members.add(c.value);
			if (k === "tag" || k === "tags") next.tags.add(c.value.toLowerCase());
		}
		setTemp(next);
	}, [open, initialChips]);

	const toggleSet = (set: Set<string>, v: string) => {
		const n = new Set(set);
		if (n.has(v)) n.delete(v);
		else n.add(v);
		return n;
	};

	const draftCount = useMemo(
		() =>
			temp.status.size +
			temp.priority.size +
			temp.tags.size +
			temp.members.size,
		[temp],
	);

	const handleApply = () => {
		const chips: FilterChip[] = [];
		temp.status.forEach((v) => {
			chips.push({ key: "Status", value: capitalize(v) });
		});
		temp.priority.forEach((v) => {
			chips.push({ key: "Priority", value: capitalize(v) });
		});
		temp.members.forEach((v) => {
			chips.push({ key: "Member", value: v });
		});
		temp.tags.forEach((v) => {
			chips.push({ key: "Tag", value: v });
		});
		onApply(chips);
		setOpen(false);
	};

	const handleClear = () => {
		setTemp(emptyTemp());
		onClear();
	};

	const categories = [
		{ id: "status", label: "Status", count: temp.status.size },
		{ id: "priority", label: "Priority", count: temp.priority.size },
		{ id: "tags", label: "Tags", count: temp.tags.size },
		{ id: "members", label: "Members", count: temp.members.size },
	];

	const renderOptions = (categoryId: string) => {
		switch (categoryId) {
			case "status":
				return statusOptions.map((opt) => (
					<FilterOptionItem
						key={opt.id}
						checked={temp.status.has(opt.id)}
						onToggle={() =>
							setTemp((t) => ({ ...t, status: toggleSet(t.status, opt.id) }))
						}
						color={opt.color}
						label={opt.label}
					/>
				));
			case "priority":
				return priorityOptions.map((opt) => (
					<FilterOptionItem
						key={opt.id}
						checked={temp.priority.has(opt.id)}
						onToggle={() =>
							setTemp((t) => ({
								...t,
								priority: toggleSet(t.priority, opt.id),
							}))
						}
						label={opt.label}
					/>
				));
			case "members":
				return memberOptions.map((opt) => (
					<FilterOptionItem
						key={opt.id}
						checked={temp.members.has(opt.label)}
						onToggle={() =>
							setTemp((t) => ({
								...t,
								members: toggleSet(t.members, opt.label),
							}))
						}
						label={opt.label}
					/>
				));
			case "tags":
				return tagOptions.map((opt) => (
					<FilterOptionItem
						key={opt.id}
						checked={temp.tags.has(opt.id)}
						onToggle={() =>
							setTemp((t) => ({ ...t, tags: toggleSet(t.tags, opt.id) }))
						}
						label={opt.label}
					/>
				));
			default:
				return null;
		}
	};

	const renderFooter = () => (
		<div className="border-t border-border/40 px-3 py-2.5 flex items-center justify-between">
			<button
				type="button"
				onClick={handleClear}
				className="text-xs font-medium text-primary hover:underline transition-colors"
			>
				Clear
			</button>
			<Button
				size="sm"
				className="h-7 rounded-lg text-xs"
				onClick={handleApply}
			>
				Apply
			</Button>
		</div>
	);

	return (
		<UnifiedFilterPopover
			open={open}
			onOpenChange={setOpen}
			categories={categories}
			activeCategory={activeCategory}
			onCategoryChange={(id) => setActiveCategory(id as CategoryId)}
			renderOptions={renderOptions}
			activeFilterCount={draftCount}
			onClearAll={handleClear}
			triggerVariant="outline"
			renderFooter={renderFooter}
		/>
	);
}

function capitalize(s: string) {
	return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}
