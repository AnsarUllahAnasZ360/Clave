"use client";

import { useMutation } from "convex/react";
import { Check, Copy, Download, Save, Search } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";

import { TableRenderer } from "@/components/ai/TableRenderer";
import { useWorkspace } from "@/components/providers/workspace-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ArtifactData } from "@/types/artifacts";
import { api } from "../../../../convex/_generated/api";

// ── Markdown table parser ────────────────────────────────────────────────
// Parses markdown table syntax: | H1 | H2 |\n|---|---|\n| R1 | R2 |

function parseMarkdownTable(content: string): {
	headers: string[];
	rows: string[][];
} {
	const lines = content
		.trim()
		.split("\n")
		.filter((l) => l.trim().length > 0);

	if (lines.length < 2) return { headers: [], rows: [] };

	// First line = headers
	const headers = lines[0]
		.split("|")
		.map((c) => c.trim())
		.filter(Boolean);

	// Skip separator line (line 1), parse data rows from line 2 onward
	const rows: string[][] = [];
	for (let i = 2; i < lines.length; i++) {
		const cells = lines[i]
			.split("|")
			.map((c) => c.trim())
			.filter(Boolean);
		if (cells.length > 0) {
			rows.push(cells);
		}
	}

	return { headers, rows };
}

// ── CSV export ───────────────────────────────────────────────────────────

function escapeCsvCell(value: string): string {
	if (value.includes(",") || value.includes('"') || value.includes("\n")) {
		return `"${value.replace(/"/g, '""')}"`;
	}
	return value;
}

function toCsvString(headers: string[], rows: string[][]): string {
	const headerLine = headers.map(escapeCsvCell).join(",");
	const dataLines = rows.map((row) => row.map(escapeCsvCell).join(","));
	return [headerLine, ...dataLines].join("\n");
}

// ── TableArtifact ────────────────────────────────────────────────────────

export function TableArtifact({ artifact }: { artifact: ArtifactData }) {
	const [filter, setFilter] = useState("");
	const [copied, setCopied] = useState(false);
	const [saving, setSaving] = useState(false);
	const workspace = useWorkspace();
	const createDocument = useMutation(api.documents.create);

	// Parse the markdown table content
	const { headers, rows } = useMemo(
		() => parseMarkdownTable(artifact.content),
		[artifact.content],
	);

	// Filter rows — case-insensitive match on any cell value
	const filteredRows = useMemo(() => {
		if (!filter.trim()) return rows;
		const lower = filter.toLowerCase();
		return rows.filter((row) =>
			row.some((cell) => cell.toLowerCase().includes(lower)),
		);
	}, [rows, filter]);

	const handleCopy = useCallback(async () => {
		try {
			await navigator.clipboard.writeText(artifact.content);
			setCopied(true);
			setTimeout(() => setCopied(false), 2000);
		} catch {
			// Clipboard API may fail in insecure contexts
		}
	}, [artifact.content]);

	const handleExportCsv = useCallback(() => {
		const csv = toCsvString(headers, filteredRows);
		const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
		const url = URL.createObjectURL(blob);
		const a = document.createElement("a");
		a.href = url;
		a.download = `${artifact.title}.csv`;
		a.click();
		URL.revokeObjectURL(url);
	}, [headers, filteredRows, artifact.title]);

	const handleSave = useCallback(async () => {
		if (!workspace?.workspaceId) return;
		setSaving(true);
		try {
			await createDocument({
				workspaceId: workspace.workspaceId,
				title: artifact.title,
			});
			toast.success("Saved to Docs");
		} catch {
			toast.error("Failed to save document");
		} finally {
			setSaving(false);
		}
	}, [workspace?.workspaceId, createDocument, artifact.title]);

	if (!headers.length) {
		return (
			<div className="flex h-full items-center justify-center p-8">
				<p className="text-sm text-muted-foreground">
					Could not parse table data
				</p>
			</div>
		);
	}

	return (
		<div className="flex h-full flex-col">
			{/* Toolbar */}
			<div className="flex items-center gap-1 border-b border-border/40 px-3 py-1.5">
				<div className="relative max-w-xs">
					<Search className="absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
					<Input
						type="text"
						placeholder="Filter rows..."
						value={filter}
						onChange={(e) => setFilter(e.target.value)}
						className="h-7 pl-7 text-xs"
					/>
				</div>
				<Button
					variant="ghost"
					size="sm"
					className="h-7 gap-1.5 text-xs"
					onClick={handleCopy}
				>
					{copied ? (
						<Check className="size-3.5 text-green-500" />
					) : (
						<Copy className="size-3.5" />
					)}
					{copied ? "Copied" : "Copy"}
				</Button>
				<Button
					variant="ghost"
					size="sm"
					className="h-7 gap-1.5 text-xs"
					onClick={handleExportCsv}
				>
					<Download className="size-3.5" />
					Export CSV
				</Button>
				<div className="flex-1" />
				<Button
					variant="ghost"
					size="sm"
					className="h-7 gap-1.5 text-xs"
					onClick={handleSave}
					disabled={saving}
				>
					<Save className="size-3.5" />
					{saving ? "Saving..." : "Save to workspace"}
				</Button>
			</div>

			{/* Table content */}
			<div className="flex-1 overflow-y-auto p-4">
				<TableRenderer headers={headers} rows={filteredRows} className="my-0" />
				{filter && filteredRows.length === 0 && (
					<p className="mt-4 text-center text-sm text-muted-foreground">
						No rows match &ldquo;{filter}&rdquo;
					</p>
				)}
				{filter && filteredRows.length > 0 && (
					<p className="mt-2 text-xs text-muted-foreground">
						Showing {filteredRows.length} of {rows.length} rows
					</p>
				)}
			</div>
		</div>
	);
}
