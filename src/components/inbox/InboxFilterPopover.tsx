"use client";

import {
	AlarmClock,
	Bell,
	FileText,
	FolderOpen,
	MessageSquare,
	PenTool,
	TicketCheck,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
	FilterHighlightItem,
	FilterOptionItem,
	UnifiedFilterPopover,
} from "@/components/unified-filter-popover";

export type InboxTypeFilter = string;
export type InboxReadFilter = "all" | "unread" | "read";

export type InboxFilters = {
	types: InboxTypeFilter[];
	readStatus: InboxReadFilter;
};

const EMPTY_INBOX_FILTERS: InboxFilters = { types: [], readStatus: "all" };

const TYPE_OPTIONS = [
	{
		id: "issue",
		label: "Issues",
		icon: <TicketCheck className="h-3.5 w-3.5 text-muted-foreground" />,
	},
	{
		id: "comment",
		label: "Comments",
		icon: <MessageSquare className="h-3.5 w-3.5 text-muted-foreground" />,
	},
	{
		id: "mention",
		label: "Mentions",
		icon: <Bell className="h-3.5 w-3.5 text-muted-foreground" />,
	},
	{
		id: "project",
		label: "Projects",
		icon: <FolderOpen className="h-3.5 w-3.5 text-muted-foreground" />,
	},
	{
		id: "document",
		label: "Documents",
		icon: <FileText className="h-3.5 w-3.5 text-muted-foreground" />,
	},
	{
		id: "whiteboard",
		label: "Whiteboards",
		icon: <PenTool className="h-3.5 w-3.5 text-muted-foreground" />,
	},
	{
		id: "reminder",
		label: "Reminders",
		icon: <AlarmClock className="h-3.5 w-3.5 text-muted-foreground" />,
	},
];

const READ_STATUS_OPTIONS: { id: InboxReadFilter; label: string }[] = [
	{ id: "all", label: "All notifications" },
	{ id: "unread", label: "Unread only" },
	{ id: "read", label: "Read only" },
];

interface InboxFilterPopoverProps {
	filters: InboxFilters;
	onChange: (next: InboxFilters) => void;
}

export function InboxFilterPopover({
	filters,
	onChange,
}: InboxFilterPopoverProps) {
	const [open, setOpen] = useState(false);
	const [activeCategory, setActiveCategory] = useState("type");

	// ── Temp (draft) state – committed only on Apply ──────────────────────
	const [temp, setTemp] = useState<InboxFilters>({ ...EMPTY_INBOX_FILTERS });

	useEffect(() => {
		if (open) {
			setTemp({ types: [...filters.types], readStatus: filters.readStatus });
		}
	}, [open, filters]);

	const toggleType = (typeId: string) => {
		setTemp((prev) => {
			const exists = prev.types.includes(typeId);
			const types = exists
				? prev.types.filter((t) => t !== typeId)
				: [...prev.types, typeId];
			return { ...prev, types };
		});
	};

	const draftStatusCount = temp.readStatus !== "all" ? 1 : 0;
	const draftCount = temp.types.length + draftStatusCount;

	const handleApply = () => {
		onChange(temp);
		setOpen(false);
	};

	const handleClear = () => {
		setTemp({ ...EMPTY_INBOX_FILTERS });
		onChange({ ...EMPTY_INBOX_FILTERS });
	};

	const categories = [
		{ id: "type", label: "Type", count: temp.types.length },
		{ id: "status", label: "Status", count: draftStatusCount },
	];

	const renderOptions = (categoryId: string) => {
		if (categoryId === "status") {
			return READ_STATUS_OPTIONS.map((opt) => (
				<FilterHighlightItem
					key={opt.id}
					isActive={temp.readStatus === opt.id}
					onClick={() => setTemp((prev) => ({ ...prev, readStatus: opt.id }))}
					label={opt.label}
				/>
			));
		}
		return TYPE_OPTIONS.map((opt) => (
			<FilterOptionItem
				key={opt.id}
				checked={temp.types.includes(opt.id)}
				onToggle={() => toggleType(opt.id)}
				icon={opt.icon}
				label={opt.label}
			/>
		));
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
			onCategoryChange={setActiveCategory}
			renderOptions={renderOptions}
			activeFilterCount={draftCount}
			onClearAll={handleClear}
			triggerVariant="outline"
			renderFooter={renderFooter}
		/>
	);
}
