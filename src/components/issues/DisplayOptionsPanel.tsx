"use client";

import {
	ArrowDown,
	ArrowUp,
	Check,
	ChevronDown,
	GanttChart,
	Kanban,
	List,
	RotateCcw,
	Settings2,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import {
	DISPLAY_PROPERTY_LABELS,
	type DisplayPropertyId,
	GROUP_BY_LABELS,
	type GroupByOption,
	type LayoutType,
	ORDER_BY_LABELS,
	type OrderByOption,
	type OrderDirection,
	type SubGroupByOption,
	SWIMLANE_LABELS,
	type SwimlaneSetting,
} from "@/lib/display-options";
import { cn } from "@/lib/utils";

// ── Types ──────────────────────────────────────────────────────────────────

type DisplayOptionsPanelProps = {
	layout: LayoutType;
	groupBy: GroupByOption;
	subGroupBy: SubGroupByOption;
	orderBy: OrderByOption;
	orderDirection: OrderDirection;
	displayProperties: DisplayPropertyId[];
	showSubIssues: boolean;
	showEmptyGroups: boolean;
	swimlaneBy: SwimlaneSetting;
	onLayoutChange: (layout: LayoutType) => void;
	onGroupByChange: (groupBy: GroupByOption) => void;
	onSubGroupByChange: (subGroupBy: SubGroupByOption) => void;
	onOrderByChange: (orderBy: OrderByOption) => void;
	onOrderDirectionChange: (direction: OrderDirection) => void;
	onDisplayPropertyToggle: (property: DisplayPropertyId) => void;
	onShowSubIssuesChange: (show: boolean) => void;
	onShowEmptyGroupsChange: (show: boolean) => void;
	onSwimlaneSetting: (setting: SwimlaneSetting) => void;
	onReset: () => void;
	/** Which layouts are available (defaults to all three) */
	availableLayouts?: LayoutType[];
	/** Hide layout selector entirely */
	hideLayoutSelector?: boolean;
};

// ── Layout icons ──────────────────────────────────────────────────────────

const LAYOUT_CONFIG: {
	id: LayoutType;
	label: string;
	icon: typeof Kanban;
}[] = [
	{ id: "board", label: "Board", icon: Kanban },
	{ id: "list", label: "List", icon: List },
	{ id: "timeline", label: "Timeline", icon: GanttChart },
];

// ── Group by options ────────────────────────────────────────────────────────

const GROUP_BY_OPTIONS: GroupByOption[] = [
	"none",
	"focus",
	"status",
	"priority",
	"assignee",
	"project",
	"milestone",
];

const ORDER_BY_OPTIONS: OrderByOption[] = [
	"manual",
	"status",
	"priority",
	"created",
	"updated",
	"dueDate",
];

const SWIMLANE_OPTIONS: SwimlaneSetting[] = [
	"none",
	"assignee",
	"priority",
	"milestone",
];

const ALL_DISPLAY_PROPERTIES: DisplayPropertyId[] = [
	"identifier",
	"priority",
	"status",
	"labels",
	"assignee",
	"project",
	"milestone",
	"estimate",
	"dueDate",
	"created",
	"updated",
];

// ── Component ──────────────────────────────────────────────────────────────

export function DisplayOptionsPanel({
	layout,
	groupBy,
	subGroupBy,
	orderBy,
	orderDirection,
	displayProperties,
	showSubIssues,
	showEmptyGroups,
	swimlaneBy,
	onLayoutChange,
	onGroupByChange,
	onSubGroupByChange,
	onOrderByChange,
	onOrderDirectionChange,
	onDisplayPropertyToggle,
	onShowSubIssuesChange,
	onShowEmptyGroupsChange,
	onSwimlaneSetting,
	onReset,
	availableLayouts,
	hideLayoutSelector,
}: DisplayOptionsPanelProps) {
	const [open, setOpen] = useState(false);

	// Shift+V keyboard shortcut
	useEffect(() => {
		function handleKeyDown(e: KeyboardEvent) {
			// Don't trigger when typing in inputs
			const target = e.target as HTMLElement;
			if (
				target.tagName === "INPUT" ||
				target.tagName === "TEXTAREA" ||
				target.isContentEditable
			) {
				return;
			}

			if (e.shiftKey && e.key === "V") {
				e.preventDefault();
				setOpen((prev) => !prev);
			}
		}

		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, []);

	const layouts = availableLayouts
		? LAYOUT_CONFIG.filter((l) => availableLayouts.includes(l.id))
		: LAYOUT_CONFIG;

	// Sub-group options: same as group-by but exclude the current primary group
	const subGroupOptions = GROUP_BY_OPTIONS.filter((opt) => opt !== groupBy);

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>
				<Button
					variant="outline"
					size="sm"
					className="h-8 gap-2 rounded-lg border-border/60 px-3 bg-transparent"
				>
					<Settings2 className="h-4 w-4" />
					Display
				</Button>
			</PopoverTrigger>
			<PopoverContent
				className="w-[300px] rounded-xl p-0 max-h-[80vh] overflow-y-auto"
				align="end"
			>
				<div className="p-3 space-y-3">
					{/* ── Layout selector ──────────────────────────────── */}
					{!hideLayoutSelector && layouts.length > 1 && (
						<>
							<div className="flex rounded-lg p-1 bg-muted">
								{layouts.map((l) => {
									const Icon = l.icon;
									return (
										<button
											key={l.id}
											type="button"
											onClick={() => onLayoutChange(l.id)}
											className={cn(
												"flex flex-1 flex-col items-center gap-1 rounded-md py-2 text-xs font-medium transition-colors",
												layout === l.id
													? "bg-background shadow-sm"
													: "text-muted-foreground hover:text-foreground",
											)}
										>
											<Icon className="h-4 w-4" />
											{l.label}
										</button>
									);
								})}
							</div>
							<Separator />
						</>
					)}

					{/* ── Grouping ─────────────────────────────────────── */}
					<OptionRow label="Grouping">
						<DropdownSelect
							value={groupBy}
							options={GROUP_BY_OPTIONS}
							labels={GROUP_BY_LABELS}
							onChange={onGroupByChange}
						/>
					</OptionRow>

					{/* ── Sub-grouping (only when grouping is active) ──── */}
					{groupBy !== "none" && (
						<OptionRow label="Sub-grouping">
							<DropdownSelect
								value={subGroupBy}
								options={subGroupOptions}
								labels={GROUP_BY_LABELS}
								onChange={onSubGroupByChange}
							/>
						</OptionRow>
					)}

					{/* ── Ordering ────────────────────────────────────── */}
					<OptionRow label="Ordering">
						<div className="flex items-center gap-1">
							<DropdownSelect
								value={orderBy}
								options={ORDER_BY_OPTIONS}
								labels={ORDER_BY_LABELS}
								onChange={onOrderByChange}
							/>
							<Button
								variant="ghost"
								size="icon"
								className="h-7 w-7 shrink-0"
								onClick={() =>
									onOrderDirectionChange(
										orderDirection === "asc" ? "desc" : "asc",
									)
								}
								title={orderDirection === "asc" ? "Ascending" : "Descending"}
							>
								{orderDirection === "asc" ? (
									<ArrowUp className="h-3.5 w-3.5" />
								) : (
									<ArrowDown className="h-3.5 w-3.5" />
								)}
							</Button>
						</div>
					</OptionRow>

					{/* ── Swimlanes (board only) ──────────────────────── */}
					{layout === "board" && (
						<OptionRow label="Swimlanes">
							<DropdownSelect
								value={swimlaneBy}
								options={SWIMLANE_OPTIONS}
								labels={SWIMLANE_LABELS}
								onChange={onSwimlaneSetting}
							/>
						</OptionRow>
					)}

					<Separator />

					{/* ── Display properties ──────────────────────────── */}
					<div>
						<span className="text-xs font-medium text-muted-foreground mb-2 block">
							Display properties
						</span>
						<div className="grid grid-cols-2 gap-1">
							{ALL_DISPLAY_PROPERTIES.map((prop) => {
								const checked = displayProperties.includes(prop);
								return (
									<button
										key={prop}
										type="button"
										className="flex items-center gap-2 px-2 py-1.5 rounded-md text-xs hover:bg-muted/50 cursor-pointer transition-colors text-left"
										onClick={() => onDisplayPropertyToggle(prop)}
									>
										<Checkbox
											checked={checked}
											onCheckedChange={() => onDisplayPropertyToggle(prop)}
											tabIndex={-1}
										/>
										<span className={checked ? "" : "text-muted-foreground"}>
											{DISPLAY_PROPERTY_LABELS[prop]}
										</span>
									</button>
								);
							})}
						</div>
					</div>

					<Separator />

					{/* ── Toggles ────────────────────────────────────── */}
					<div className="space-y-2">
						<div className="flex items-center justify-between">
							<span className="text-xs">Show sub-issues</span>
							<Switch
								size="sm"
								checked={showSubIssues}
								onCheckedChange={onShowSubIssuesChange}
							/>
						</div>
						<div className="flex items-center justify-between">
							<span className="text-xs">Show empty groups</span>
							<Switch
								size="sm"
								checked={showEmptyGroups}
								onCheckedChange={onShowEmptyGroupsChange}
							/>
						</div>
					</div>

					<Separator />

					{/* ── Reset button ────────────────────────────────── */}
					<button
						type="button"
						className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors w-full"
						onClick={onReset}
					>
						<RotateCcw className="h-3 w-3" />
						Reset to defaults
					</button>
				</div>
			</PopoverContent>
		</Popover>
	);
}

// ── Shared sub-components ──────────────────────────────────────────────────

function OptionRow({
	label,
	children,
}: {
	label: string;
	children: React.ReactNode;
}) {
	return (
		<div className="flex items-center justify-between gap-2">
			<span className="text-xs text-muted-foreground shrink-0">{label}</span>
			{children}
		</div>
	);
}

function DropdownSelect<T extends string>({
	value,
	options,
	labels,
	onChange,
}: {
	value: T;
	options: T[];
	labels: Record<T, string>;
	onChange: (value: T) => void;
}) {
	const [dropdownOpen, setDropdownOpen] = useState(false);

	const handleSelect = useCallback(
		(opt: T) => {
			onChange(opt);
			setDropdownOpen(false);
		},
		[onChange],
	);

	return (
		<Popover open={dropdownOpen} onOpenChange={setDropdownOpen}>
			<PopoverTrigger asChild>
				<Button
					variant="ghost"
					size="sm"
					className="h-7 px-2 gap-1 text-xs font-normal justify-between min-w-[100px]"
				>
					<span className="truncate">{labels[value]}</span>
					<ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground" />
				</Button>
			</PopoverTrigger>
			<PopoverContent className="w-[160px] p-1" align="end">
				{options.map((opt) => (
					<button
						key={opt}
						type="button"
						onClick={() => handleSelect(opt)}
						className={cn(
							"flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs transition-colors hover:bg-accent",
							value === opt && "bg-accent/50",
						)}
					>
						{value === opt && <Check className="h-3 w-3 shrink-0" />}
						{value !== opt && <span className="w-3 shrink-0" />}
						{labels[opt]}
					</button>
				))}
			</PopoverContent>
		</Popover>
	);
}
