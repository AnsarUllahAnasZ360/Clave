"use client";

import { ChevronDown, ChevronsUpDown, ChevronUp } from "lucide-react";
import { memo, useCallback, useMemo, useState } from "react";

import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

// ── Types ───────────────────────────────────────────────────────────────

export interface TableRendererProps {
	/** Column header labels */
	headers: string[];
	/** Row data — each inner array aligns with headers */
	rows: string[][];
	/** Additional CSS classes */
	className?: string;
}

type SortDirection = "asc" | "desc";

interface SortConfig {
	column: number;
	direction: SortDirection;
}

// ── Helpers ─────────────────────────────────────────────────────────────

function compareValues(a: string, b: string): number {
	// Try numeric comparison first
	const numA = Number(a);
	const numB = Number(b);
	if (!Number.isNaN(numA) && !Number.isNaN(numB)) {
		return numA - numB;
	}
	return a.localeCompare(b);
}

// ── Sort icon ───────────────────────────────────────────────────────────

function SortIcon({
	column,
	sortConfig,
}: {
	column: number;
	sortConfig: SortConfig | null;
}) {
	if (!sortConfig || sortConfig.column !== column) {
		return <ChevronsUpDown className="size-3 opacity-40" />;
	}
	if (sortConfig.direction === "asc") {
		return <ChevronUp className="size-3" />;
	}
	return <ChevronDown className="size-3" />;
}

// ── TableRenderer ───────────────────────────────────────────────────────

function TableRendererInner({ headers, rows, className }: TableRendererProps) {
	const [sortConfig, setSortConfig] = useState<SortConfig | null>(null);

	const handleSort = useCallback((column: number) => {
		setSortConfig((prev) => {
			if (!prev || prev.column !== column) {
				return { column, direction: "asc" };
			}
			if (prev.direction === "asc") {
				return { column, direction: "desc" };
			}
			// desc -> unsorted
			return null;
		});
	}, []);

	const sortedRows = useMemo(() => {
		if (!sortConfig) return rows;
		const { column, direction } = sortConfig;
		return [...rows].sort((a, b) => {
			const cmp = compareValues(a[column] ?? "", b[column] ?? "");
			return direction === "asc" ? cmp : -cmp;
		});
	}, [rows, sortConfig]);

	if (!headers.length) return null;

	return (
		<div
			className={cn(
				"my-4 w-full overflow-x-auto rounded-md border [-webkit-overflow-scrolling:touch]",
				className,
			)}
		>
			<Table>
				<TableHeader>
					<TableRow className="hover:bg-transparent">
						{headers.map((header, i) => (
							<TableHead
								key={header}
								className={cn(
									"cursor-pointer select-none",
									i === 0 &&
										"sticky left-0 z-10 bg-background shadow-[1px_0_0_0_hsl(var(--border))]",
								)}
								onClick={() => handleSort(i)}
							>
								<span className="inline-flex items-center gap-1">
									{header}
									<SortIcon column={i} sortConfig={sortConfig} />
								</span>
							</TableHead>
						))}
					</TableRow>
				</TableHeader>
				<TableBody>
					{sortedRows.map((row, rowIdx) => (
						<TableRow
							key={`${rowIdx}-${row.join("\t")}`}
							className={cn(rowIdx % 2 === 1 && "bg-muted/30")}
						>
							{headers.map((header, cellIdx) => (
								<TableCell
									key={header}
									className={cn(
										cellIdx === 0 &&
											"sticky left-0 z-10 bg-background shadow-[1px_0_0_0_hsl(var(--border))]",
									)}
								>
									{row[cellIdx]}
								</TableCell>
							))}
						</TableRow>
					))}
				</TableBody>
			</Table>
		</div>
	);
}

export const TableRenderer = memo(
	TableRendererInner,
	(prev, next) => prev.headers === next.headers && prev.rows === next.rows,
);
