"use client";

import {
	Bell,
	FileText,
	FolderOpen,
	MessageSquare,
	PenTool,
	TicketCheck,
} from "lucide-react";
import { useState } from "react";
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

	const toggleType = (typeId: string) => {
		const exists = filters.types.includes(typeId);
		const types = exists
			? filters.types.filter((t) => t !== typeId)
			: [...filters.types, typeId];
		onChange({ ...filters, types });
	};

	const statusFilterCount = filters.readStatus !== "all" ? 1 : 0;
	const totalFilterCount = filters.types.length + statusFilterCount;

	const categories = [
		{ id: "type", label: "Type", count: filters.types.length },
		{ id: "status", label: "Status", count: statusFilterCount },
	];

	const renderOptions = (categoryId: string) => {
		if (categoryId === "status") {
			return READ_STATUS_OPTIONS.map((opt) => (
				<FilterHighlightItem
					key={opt.id}
					isActive={filters.readStatus === opt.id}
					onClick={() => onChange({ ...filters, readStatus: opt.id })}
					label={opt.label}
				/>
			));
		}
		return TYPE_OPTIONS.map((opt) => (
			<FilterOptionItem
				key={opt.id}
				checked={filters.types.includes(opt.id)}
				onToggle={() => toggleType(opt.id)}
				icon={opt.icon}
				label={opt.label}
			/>
		));
	};

	return (
		<UnifiedFilterPopover
			open={open}
			onOpenChange={setOpen}
			categories={categories}
			activeCategory={activeCategory}
			onCategoryChange={setActiveCategory}
			renderOptions={renderOptions}
			activeFilterCount={totalFilterCount}
			onClearAll={() => onChange({ types: [], readStatus: "all" })}
			width={320}
		/>
	);
}
